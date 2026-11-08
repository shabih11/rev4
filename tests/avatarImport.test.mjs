import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { immutableAvatarPath, importAvatars, loadAvatarImport, webpDimensions } from '../automation/avatarImport.mjs';

const collectionId = '0f46e546-ae29-47f9-8f81-1ea1058b9a6e';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function frame(width = 1024, height = 1536) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF'); bytes.writeUInt32LE(22, 4); bytes.write('WEBPVP8L', 8); bytes.writeUInt32LE(10, 16);
  bytes[20] = 0x2f; bytes.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return bytes;
}
const entry = (name = '01 · Nike V2K Run') => ({ name, bytes: frame(), sha256: sha(frame()) });
const plan = () => ({ name: 'الذوق السعودي الحديث', price: 5, variants: [entry(), entry('02 · Nike Vomero 5')] });

function fixture({ role = 'admin', validUser = true, enabled = false, variants = [], failRegistration = false, lostRegistrationResponse = false, owned = false } = {}) {
  const collection = { id: collectionId, name: plan().name, price: 5, enabled, variants: structuredClone(variants) };
  const objects = new Map(variants.map(v => [v.imagePath, frame()]));
  const calls = [], uploads = [];
  let fail = failRegistration;
  const client = {
    auth: { getUser: async () => ({ data: { user: validUser ? { id: 'verified-user' } : null }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'get_my_account') return { data: { role } };
      if (name === 'get_avatar_store') return { data: { collections: [structuredClone(collection)] } };
      if (name === 'add_avatar_variant') {
        if (fail) { fail = false; return { error: { code: 'connection_lost' } }; }
        const v = { id: `variant-${collection.variants.length}`, name: args.requested_name, imagePath: args.requested_path, enabled: true, ownerId: owned ? 'owner' : null };
        collection.variants.push(v);
        return lostRegistrationResponse ? { error: { code: 'response_lost' } } : { data: v.id };
      }
      if (name === 'set_avatar_variant_enabled') {
        collection.variants.find(v => v.id === args.variant).enabled = args.requested_enabled;
        return { data: null };
      }
      throw new Error('Unexpected write: ' + name);
    },
    storage: { from: bucket => {
      assert.equal(bucket, 'avatar-store');
      return {
        upload: async (path, bytes, options) => {
          uploads.push({ path, options });
          if (objects.has(path)) return { error: { statusCode: 409 } };
          objects.set(path, bytes); return { data: { path } };
        },
        download: async path => objects.has(path) ? { data: new Blob([objects.get(path)], { type: 'image/webp' }) } : { error: { statusCode: 404 } },
      };
    } },
  };
  return { client, collection, objects, uploads, calls };
}

test('invalid sessions and non-admin accounts cannot read the store or upload', async () => {
  for (const settings of [{ validUser: false }, { role: 'employee' }, { role: 'manager' }]) {
    const f = fixture(settings);
    await assert.rejects(importAvatars({ client: f.client, plan: plan(), collectionId }));
    assert.equal(f.uploads.length, 0);
    assert.equal(f.calls.some(c => c.name === 'get_avatar_store'), false);
  }
});

test('published collections are rejected before any storage write', async () => {
  const f = fixture({ enabled: true });
  await assert.rejects(importAvatars({ client: f.client, plan: plan(), collectionId }), /منشورة/);
  assert.equal(f.uploads.length, 0);
});

test('batch import verifies the files and disables every variant without publishing', async () => {
  const f = fixture();
  const result = await importAvatars({ client: f.client, plan: plan(), collectionId });
  assert.deepEqual(result, { collectionId, uploaded: 2, skipped: 0, total: 2, enabled: false });
  assert.equal(f.collection.enabled, false);
  assert.ok(f.collection.variants.every(v => v.enabled === false));
  assert.ok(f.uploads.every(u => u.options.upsert === false && u.options.contentType === 'image/webp'));
  assert.notEqual(f.uploads[0].path, f.uploads[1].path);
});

test('rerunning a batch preserves existing art and creates no duplicate records or objects', async () => {
  const f = fixture();
  await importAvatars({ client: f.client, plan: plan(), collectionId });
  const count = f.uploads.length;
  const result = await importAvatars({ client: f.client, plan: plan(), collectionId });
  assert.equal(result.skipped, 2); assert.equal(result.uploaded, 0);
  assert.equal(f.uploads.length, count); assert.equal(f.collection.variants.length, 2);
});

test('resume reuses an unregistered uploaded object after a database interruption', async () => {
  const f = fixture({ failRegistration: true });
  await assert.rejects(importAvatars({ client: f.client, plan: plan(), collectionId }), /استئناف/);
  assert.equal(f.objects.size, 1); assert.equal(f.collection.variants.length, 0);
  const result = await importAvatars({ client: f.client, plan: plan(), collectionId });
  assert.equal(result.total, 2); assert.equal(f.objects.size, 2);
  assert.equal(f.collection.enabled, false);
});

test('a lost registration response is reconciled without repeating the database write', async () => {
  const f = fixture({ lostRegistrationResponse: true });
  await importAvatars({ client: f.client, plan: plan(), collectionId });
  assert.equal(f.calls.filter(c => c.name === 'add_avatar_variant').length, 2);
  assert.equal(f.collection.variants.length, 2);
});

test('resume hides the five existing UI imports while preserving their immutable paths', async () => {
  const p = plan(), path = 'existing-art.webp';
  const f = fixture({ variants: [{ id: 'existing', name: p.variants[0].name, imagePath: path, enabled: true, ownerId: null }] });
  const result = await importAvatars({ client: f.client, plan: p, collectionId });
  assert.equal(result.skipped, 1); assert.equal(result.uploaded, 1);
  assert.equal(f.collection.variants[0].imagePath, path);
  assert.equal(f.collection.variants[0].enabled, false);
});

test('a conflicting object is never overwritten or registered', async () => {
  const f = fixture(), p = plan();
  f.objects.set(immutableAvatarPath(collectionId, p.variants[0]), Buffer.from('different art'));
  await assert.rejects(importAvatars({ client: f.client, plan: p, collectionId }), /لم تُستبدل/);
  assert.equal(f.collection.variants.length, 0);
});

test('owned and duplicate names fail preflight before modifying any variant', async () => {
  for (const variants of [
    [{ id: 'owned', name: entry().name, imagePath: 'owned.webp', enabled: true, ownerId: 'owner' }],
    [{ id: 'a', name: entry().name }, { id: 'b', name: entry().name }],
  ]) {
    const f = fixture({ variants });
    await assert.rejects(importAvatars({ client: f.client, plan: plan(), collectionId }));
    assert.equal(f.uploads.length, 0);
    assert.equal(f.calls.some(c => c.name === 'set_avatar_variant_enabled'), false);
  }
});

test('manifest preflight rejects checksum changes, publication flags and escaping symlinks', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'rev4-avatars-'));
  const outside = await mkdtemp(join(tmpdir(), 'rev4-avatars-outside-'));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  const bytes = frame(), file = join(dir, 'avatar.webp'), manifest = join(dir, 'plan.json');
  await writeFile(file, bytes); await writeFile(join(outside, 'other.webp'), bytes);
  await symlink(join(outside, 'other.webp'), join(dir, 'escape.webp'));
  const source = { collection_name: plan().name, draft_price: 5.1, collection_enabled: false, variants_enabled: false, variants: [{ name: entry().name, file: 'avatar.webp', sha256: sha(bytes) }] };
  await writeFile(manifest, JSON.stringify(source));
  assert.equal((await loadAvatarImport(manifest)).variants.length, 1);
  for (const altered of [
    { ...source, collection_enabled: true },
    { ...source, variants_enabled: true },
    { ...source, variants: [{ ...source.variants[0], sha256: '0'.repeat(64) }] },
    { ...source, variants: [{ ...source.variants[0], file: 'escape.webp' }] },
    { ...source, variants: [source.variants[0], source.variants[0]] },
  ]) {
    await writeFile(manifest, JSON.stringify(altered));
    await assert.rejects(loadAvatarImport(manifest));
  }
});

test('WebP header validation rejects oversized dimensions and malformed formats', () => {
  assert.deepEqual(webpDimensions(frame()), [1024, 1536]);
  assert.throws(() => webpDimensions(frame(4097, 100)), /4096/);
  assert.throws(() => webpDimensions(Buffer.from('<svg>bad image</svg>')));
  const truncated = frame(); truncated.writeUInt32LE(1000, 16);
  assert.throws(() => webpDimensions(truncated), /غير مكتمل/);
});
