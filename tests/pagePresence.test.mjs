import { moduleUrl } from './helpers/typescript.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { startPagePresence } = await import(moduleUrl('pagePresence'));

class Page extends EventTarget {
  visibilityState = 'visible';
  focused = true;
  hasFocus() { return this.focused; }
}
class Browser extends EventTarget {
  time = 0;
  timers = new Map();
  performance = { now: () => this.time };
  setInterval(callback) { const id = this.timers.size + 1; this.timers.set(id, callback); return id; }
  clearInterval(id) { this.timers.delete(id); }
  tick(ms) { this.time += ms; for (const callback of this.timers.values()) callback(); }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('foreground presence records on entry and once per minute despite repeated focus events', async () => {
  const page = new Page(), browser = new Browser(), calls = [];
  const stop = startPagePresence(async signal => { calls.push(signal); }, page, browser);
  await settle();
  browser.dispatchEvent(new Event('focus'));
  page.dispatchEvent(new Event('visibilitychange'));
  browser.tick(59999);
  await settle();
  assert.equal(calls.length, 1);
  browser.tick(1);
  await settle();
  assert.equal(calls.length, 2);
  stop();
});

test('hidden and unfocused pages do not report presence; returning to the page records it', async () => {
  const page = new Page(), browser = new Browser();
  let calls = 0;
  page.visibilityState = 'hidden';
  const stop = startPagePresence(async () => { calls++; }, page, browser);
  browser.tick(60000); browser.dispatchEvent(new Event('online'));
  await settle(); assert.equal(calls, 0);
  page.visibilityState = 'visible'; page.focused = false;
  page.dispatchEvent(new Event('visibilitychange'));
  await settle(); assert.equal(calls, 0);
  page.focused = true; browser.dispatchEvent(new Event('focus'));
  await settle(); assert.equal(calls, 1);
  page.visibilityState = 'hidden'; browser.tick(60000);
  await settle(); assert.equal(calls, 1);
  stop();
});

test('failed heartbeats retry on the next minute and never turn focus events into a retry loop', async () => {
  const page = new Page(), browser = new Browser();
  let calls = 0;
  const stop = startPagePresence(async () => { calls++; if (calls === 1) throw new Error('offline'); }, page, browser);
  await settle(); browser.dispatchEvent(new Event('focus')); await settle();
  assert.equal(calls, 1);
  browser.tick(60000); await settle(); assert.equal(calls, 2);
  stop();
});

test('only one heartbeat is in flight; cleanup aborts it and removes all future work', async () => {
  const page = new Page(), browser = new Browser();
  let calls = 0, requestSignal;
  const stop = startPagePresence(signal => {
    calls++; requestSignal = signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }, page, browser);
  browser.tick(60000); browser.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
  stop(); await settle();
  assert.equal(requestSignal.aborted, true);
  assert.equal(browser.timers.size, 0);
  browser.tick(60000); browser.dispatchEvent(new Event('focus'));
  page.dispatchEvent(new Event('visibilitychange')); await settle();
  assert.equal(calls, 1);
});
