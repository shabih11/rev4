import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
let uploaded = [], width = 2400, height = 3600, closed = 0, outputType = 'image/webp';
globalThis.__avatarUploadTest = { storage: { from: bucket => ({ upload: async (...args) => { uploaded.push([bucket, ...args]); return {}; } }) } };
globalThis.createImageBitmap = async () => ({ width, height, close: () => closed++ });
const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: callback => callback(new Blob(['test-art'], { type: outputType })) };
globalThis.document = { createElement: () => canvas };
const source = readFileSync(new URL('../src/lib/avatarUploads.ts', import.meta.url), 'utf8').replace("import { supabase } from './supabase';", 'const supabase = globalThis.__avatarUploadTest;');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { validAvatarFile, uploadAvatarArt } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
test('active formats are bounded and SVG, executable and oversized uploads are rejected', async () => {
  assert.equal(validAvatarFile({ type: 'image/png', size: 5 * 1024 * 1024 }), true);
  for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: 'text/html', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/webp', size: 5 * 1024 * 1024 + 1 }]) {
    assert.equal(validAvatarFile(file), false);
    await assert.rejects(uploadAvatarArt(file));
  }
  assert.equal(uploaded.length, 0);
});
test('art is decoded, scaled, reencoded and uploaded to an immutable random path', async () => {
  uploaded = []; width = 2400; height = 3600;
  const path = await uploadAvatarArt({ type: 'image/png', size: 100 });
  assert.match(path, /^[a-f0-9-]{36}\.webp$/);
  assert.equal(canvas.width, 800); assert.equal(canvas.height, 1200);
  assert.equal(uploaded[0][0], 'avatar-store');
  assert.equal(uploaded[0][1], path);
  assert.equal(uploaded[0][2].type, 'image/webp');
  assert.equal(uploaded[0][3].upsert, false);
  assert.ok(closed > 0);
});
test('oversized decoded images and unsupported encoder outputs never reach storage', async () => {
  const before = uploaded.length;
  width = 4097; height = 100;
  await assert.rejects(uploadAvatarArt({ type: 'image/png', size: 100 }), /4096/);
  width = 100; outputType = 'image/png';
  await assert.rejects(uploadAvatarArt({ type: 'image/png', size: 100 }), /الصيغة/);
  assert.equal(uploaded.length, before);
});
