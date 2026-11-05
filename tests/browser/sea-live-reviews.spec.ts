import { test, expect, login, mockService } from './fixtures.js';

test('Windsor review counts update Qasr and Daview without reloading when realtime is unavailable', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-05T20:00:00+03:00') });
  const service = await mockService(page);
  let version = 1;
  let summaryReads = 0;
  let stateReads = 0;
  await page.route('https://supabase.test.invalid/rest/v1/app_state*', route => {
    stateReads++;
    return route.fulfill({ json: { version } });
  });
  await page.route('https://supabase.test.invalid/rest/v1/rpc/get_read_model', route => {
    summaryReads++;
    return route.fulfill({ json: {
      generatedAt: '2026-11-05T17:00:00Z', directory: [service.account], notes: [], hours: {},
      reviews: version === 1 ? [] : [
        { id: 'qasr-1', branch: 'القصر', rating: '5', date: '05-11-2026', time: '14:30', linkedEmployeeIds: [] },
        { id: 'qasr-2', branch: 'القصر', rating: '4', date: '05-11-2026', time: '15:30', linkedEmployeeIds: [] },
        { id: 'daview-1', branch: 'ذافيو', rating: '5', date: '05-11-2026', time: '12:30', linkedEmployeeIds: [] },
      ],
    } });
  });
  await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
  await login(page);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto('./#/?view=sea');
  const qasr = page.getByRole('button', { name: /^القصر،/ });
  const daview = page.getByRole('button', { name: /^ذافيو،/ });
  await expect(qasr).toHaveAttribute('data-scene', 'adventure');
  await expect(daview).toHaveAttribute('data-scene', 'adventure');
  const initialReads = summaryReads;
  await page.clock.fastForward(15000);
  await expect.poll(() => stateReads).toBeGreaterThan(1);
  expect(summaryReads).toBe(initialReads); // An unchanged version uses the confirmed cache.

  version++;
  await page.clock.fastForward(15000);
  await expect(qasr).toHaveAttribute('data-scene', 'celebrate');
  await expect(daview).toHaveAttribute('data-scene', 'halfway');
  await expect(qasr).toHaveAccessibleName(/٢ من ٢/);
  await expect(daview).toHaveAccessibleName(/١ من ٢/);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const readsBeforeHidden = stateReads;
  await page.clock.fastForward(30000);
  expect(stateReads).toBe(readsBeforeHidden);
  version = 1;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(qasr).toHaveAttribute('data-scene', 'adventure');
  await expect(daview).toHaveAttribute('data-scene', 'adventure');
  expect(service.unexpected).toEqual([]);
});

test('lighting crosses dusk, midnight and sunrise while the mission stays open', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-05T17:28:00+03:00') });
  const service = await mockService(page);
  await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
  await login(page);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto('./#/?view=sea');
  const map = page.locator('.sea-map');
  await expect(map).toHaveAttribute('data-light', 'soft');
  await page.clock.pauseAt(new Date('2026-11-05T17:29:59+03:00'));
  await page.clock.fastForward(1100);
  await expect(map).toHaveAttribute('data-light', 'dusk');
  await page.clock.fastForward(6.5 * 3600000);
  await expect(map).toHaveAttribute('data-light', 'night');
  await expect(page.locator('.sea-vessel[data-scene="sleep"]')).toHaveCount(6);
  await page.clock.fastForward(6.5 * 3600000);
  await expect(map).toHaveAttribute('data-light', 'sunny');
  expect(service.unexpected).toEqual([]);
});
