import { supabase } from './supabase';
export const avatarUploadLimit = 5 * 1024 * 1024;
export function validAvatarFile(file: Pick<File, 'type' | 'size'>) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= avatarUploadLimit;
}
export async function uploadAvatarArt(file: File): Promise<string> {
  if (!validAvatarFile(file)) throw new Error('اختاري صورة PNG أو WebP أو JPEG بحجم لا يتجاوز 5 ميغابايت.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('تعذر قراءة الصورة. اختاري ملف صورة صالحًا.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 4096 || bitmap.height > 4096) throw new Error('الحد الأقصى لأبعاد الصورة هو 4096 × 4096.');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر معالجة الصورة.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('تعذر تجهيز الصورة.')), 'image/webp', .92));
    if (blob.type !== 'image/webp' || blob.size > avatarUploadLimit) throw new Error('تعذر تجهيز الصورة بالحجم والصيغة المطلوبين.');
    const path = `${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage.from('avatar-store').upload(path, blob, { contentType: 'image/webp', upsert: false, cacheControl: '3600' });
    if (error) throw new Error('تعذر رفع الصورة. تحققي من الصلاحيات والاتصال وتفعيل مخزن المتجر.');
    return path;
  } finally { bitmap.close(); }
}
