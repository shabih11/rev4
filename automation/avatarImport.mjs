import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const limit = 5 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validName = name => typeof name === 'string' && name === name.trim() && name.length > 0 && name.length <= 100 &&
  !Array.from(name).some(char => char.codePointAt(0) < 32 || char.codePointAt(0) === 127);

// Read the actual WebP frame header, rather than trusting the filename or MIME type.
export function webpDimensions(bytes) {
  if (bytes.length < 30 || bytes.length > limit || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw new Error('الصورة ليست ملف WebP صالحًا بحجم لا يتجاوز 5 ميغابايت.');
  }
  let dimensions;
  for (let pos = 12; pos + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', pos, pos + 4), size = bytes.readUInt32LE(pos + 4), start = pos + 8;
    if (start + size > bytes.length) throw new Error('ملف WebP غير مكتمل.');
    if (type === 'ANIM' || type === 'ANMF') throw new Error('تُقبل صور الأفاتار الثابتة فقط.');
    if (type === 'VP8X' && size >= 10) {
      if (bytes[start] & 2) throw new Error('تُقبل صور الأفاتار الثابتة فقط.');
      dimensions = [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    } else if (type === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      dimensions ??= [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    } else if (type === 'VP8 ' && size >= 10 && bytes.toString('hex', start + 3, start + 6) === '9d012a') {
      dimensions ??= [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    }
    pos = start + size + (size % 2);
  }
  if (!dimensions || dimensions.some(value => value < 1 || value > 4096)) throw new Error('الحد الأقصى لأبعاد الصورة هو 4096 × 4096.');
  return dimensions;
}

export async function loadAvatarImport(manifestPath) {
  const base = await realpath(dirname(resolve(manifestPath)));
  const plan = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
  if (!validName(plan.collection_name) || plan.collection_enabled !== false || plan.variants_enabled !== false ||
      !Number.isFinite(plan.draft_price) || plan.draft_price < 0 || plan.draft_price > 1000000 ||
      Math.round(plan.draft_price * 100) / 100 !== plan.draft_price ||
      !Array.isArray(plan.variants) || plan.variants.length < 1 || plan.variants.length > 50) {
    throw new Error('ملف الاستيراد غير صالح؛ يجب تعطيل المجموعة والأشكال وتحديد سعر مسودة و1 إلى 50 صورة.');
  }
  const names = new Set(), files = new Set(), variants = [];
  for (const entry of plan.variants) {
    if (!validName(entry.name) || names.has(entry.name) || typeof entry.file !== 'string' ||
        isAbsolute(entry.file) || !entry.file.endsWith('.webp') || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error('كل شكل يحتاج اسمًا فريدًا وملف WebP محليًا وبصمة SHA-256.');
    }
    const path = await realpath(resolve(base, entry.file)), local = relative(base, path);
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local) || files.has(path)) throw new Error('مسار صورة خارج مجلد الاستيراد أو مكرر.');
    const bytes = await readFile(path);
    const dimensions = webpDimensions(bytes);
    if (digest(bytes) !== entry.sha256 || (entry.bytes !== undefined && entry.bytes !== bytes.length)) throw new Error(`تغيّر ملف الصورة: ${entry.name}`);
    names.add(entry.name); files.add(path);
    variants.push({ name: entry.name, bytes, dimensions, sha256: entry.sha256 });
  }
  return { name: plan.collection_name, price: plan.draft_price, variants };
}

export function immutableAvatarPath(collectionId, variant) {
  const hash = digest(`${collectionId}\0${variant.name}\0${variant.sha256}`).slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}.webp`;
}

async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(`تعذرت العملية: ${name}. لم تُنشر المجموعة؛ يمكن استئناف الاستيراد بالأمر نفسه.`);
  return result.data;
}
async function readStore(client) {
  const store = await rpc(client, 'get_avatar_store');
  if (!Array.isArray(store?.collections)) throw new Error('تعذر قراءة متجر الأفاتارات.');
  return store;
}
function hiddenCollection(store, id) {
  const collection = store.collections.find(item => item.id === id);
  if (!collection || collection.enabled !== false || !Array.isArray(collection.variants)) throw new Error('المجموعة غير موجودة أو منشورة؛ أُوقف الاستيراد.');
  return collection;
}

export async function importAvatars({ client, plan, collectionId, accessToken, report = () => {} }) {
  // Check the server's account role. Never trust user_metadata or accept a service-role fallback.
  const user = await client.auth.getUser(accessToken);
  if (user.error || !user.data?.user?.id) throw new Error('جلسة الإدارة غير صالحة.');
  const account = await rpc(client, 'get_my_account');
  if (account?.role !== 'admin') throw new Error('رفع المجموعة يتطلب حساب إدارة مخوّلًا.');
  if (collectionId && !uuid.test(collectionId)) throw new Error('معرّف المجموعة غير صالح.');
  let store = await readStore(client);
  if (!collectionId) {
    const matches = store.collections.filter(item => item.name === plan.name);
    if (matches.length > 1) throw new Error('أكثر من مجموعة بهذا الاسم؛ حدّد --collection.');
    collectionId = matches[0]?.id;
    if (!collectionId) {
      collectionId = await rpc(client, 'save_avatar_collection', {
        collection_id: null, requested_name: plan.name, requested_price: plan.price, requested_enabled: false, expected: null,
      });
      store = await readStore(client);
    }
  }
  const initial = hiddenCollection(store, collectionId);
  if (initial.name !== plan.name) throw new Error('اسم المجموعة لا يطابق ملف الاستيراد.');
  const newCount = plan.variants.filter(entry => !initial.variants.some(item => item.name === entry.name)).length;
  if (initial.variants.length + newCount > 50) throw new Error('سيتجاوز عدد الأشكال الحد الأقصى للمجموعة (50).');
  for (const entry of plan.variants) {
    const matches = initial.variants.filter(item => item.name === entry.name);
    if (matches.length > 1 || matches.some(item => item.ownerId)) throw new Error(`شكل مكرر أو مُقتنى؛ لن تُستبدل صورته: ${entry.name}`);
  }
  const bucket = client.storage.from('avatar-store');
  let uploaded = 0, skipped = 0;
  for (const [index, entry] of plan.variants.entries()) {
    // Re-read server state before every addition, including when resuming an interrupted import.
    const collection = hiddenCollection(await readStore(client), collectionId);
    const matches = collection.variants.filter(item => item.name === entry.name);
    if (matches.length > 1 || matches.some(item => item.ownerId)) throw new Error(`تعذر استيراد الشكل بأمان: ${entry.name}`);
    let variant = matches[0];
    if (variant) {
      skipped++;
    } else {
      const path = immutableAvatarPath(collectionId, entry);
      const result = await bucket.upload(path, entry.bytes, { contentType: 'image/webp', cacheControl: '3600', upsert: false });
      if (result.error) {
        // A previous run may have uploaded the object before registration failed. Never overwrite it.
        const existing = await bucket.download(path);
        if (existing.error || !existing.data || digest(Buffer.from(await existing.data.arrayBuffer())) !== entry.sha256) {
          throw new Error(`تعذر رفع الصورة: ${entry.name}. لم تُستبدل أي صورة موجودة.`);
        }
      }
      const added = await client.rpc('add_avatar_variant', { collection_id: collectionId, requested_name: entry.name, requested_path: path });
      // An interrupted response can follow a committed write. Reconcile before any retry.
      const refreshed = hiddenCollection(await readStore(client), collectionId);
      variant = refreshed.variants.find(item => item.imagePath === path && item.name === entry.name);
      if (!variant || variant.ownerId || (!added.error && variant.id !== added.data)) throw new Error(`تعذر تسجيل الصورة: ${entry.name}. أعد الأمر نفسه لاستئناف الرفع.`);
      uploaded++;
    }
    if (variant.enabled !== false) await rpc(client, 'set_avatar_variant_enabled', { variant: variant.id, requested_enabled: false });
    const image = await bucket.download(variant.imagePath);
    if (image.error || !image.data || !image.data.size) throw new Error(`تعذر التحقق من الصورة المرفوعة: ${entry.name}`);
    report({ completed: index + 1, total: plan.variants.length, name: entry.name });
  }
  const final = hiddenCollection(await readStore(client), collectionId);
  for (const entry of plan.variants) {
    const matches = final.variants.filter(item => item.name === entry.name);
    if (matches.length !== 1 || matches[0].enabled !== false || matches[0].ownerId) throw new Error('لم يجتز المتجر التحقق النهائي من الإخفاء.');
  }
  return { collectionId, uploaded, skipped, total: plan.variants.length, enabled: false };
}
