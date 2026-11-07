import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { importAvatars, loadAvatarImport } from './avatarImport.mjs';

const help = `رفع دفعي للأفاتارات بالكود، مع إبقاء المجموعة والأشكال مخفية.

npm run avatars:import -- --manifest /path/to/upload-plan.json [--collection UUID] [--dry-run]

--dry-run يتحقق من كل الملفات محليًا دون تسجيل دخول أو اتصال بقاعدة البيانات.
للرفع: REV4_ADMIN_ACCESS_TOKEN (جلسة إدارة)، أو REV4_ADMIN_EMAIL وREV4_ADMIN_PASSWORD.
اختياري: SUPABASE_URL وSUPABASE_PUBLISHABLE_KEY. لا تُحفظ بيانات الدخول في الملفات.
تُستأنف المجموعة بالاسم أو المعرّف؛ لا تُستبدل الصور الموجودة ولا يُفعّل عرض المتجر.`;

async function main() {
  const { values } = parseArgs({ options: { manifest: { type: 'string' }, collection: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) { console.log(help); return; }
  if (!values.manifest) throw new Error('حدّد --manifest؛ استخدم --help لعرض طريقة التشغيل.');
  const plan = await loadAvatarImport(values.manifest);
  console.log(`تم التحقق من ${plan.variants.length} صورة؛ المجموعة: ${plan.name}؛ العرض: مخفي.`);
  if (values['dry-run']) { console.log('معاينة فقط: لم يُرفع ملف ولم تتغير بيانات المتجر.'); return; }
  const token = process.env.REV4_ADMIN_ACCESS_TOKEN;
  const email = process.env.REV4_ADMIN_EMAIL, password = process.env.REV4_ADMIN_PASSWORD;
  if (!token && (!email || !password)) throw new Error('يلزم ضبط جلسة حساب الإدارة أو بيانات دخوله في متغيرات البيئة؛ لا ترسلها في المحادثة.');
  const url = process.env.SUPABASE_URL || 'https://zcnfzrkegodvrtzimlnn.supabase.co';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_iM1m6f3ZqrVJDGcurcndNw_MfBfMJOJ';
  if (new URL(url).protocol !== 'https:') throw new Error('استخدم عنوان Supabase آمنًا عبر HTTPS.');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(30000) }),
    },
  });
  if (!token) {
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error('تعذر تسجيل الدخول بحساب الإدارة؛ لم يبدأ الرفع.');
  }
  try {
    const result = await importAvatars({ client, plan, collectionId: values.collection, accessToken: token, report: item => console.log(`${item.completed}/${item.total} · ${item.name}`) });
    console.log(`اكتمل الاستيراد: ${result.uploaded} جديدة، ${result.skipped} موجودة؛ المجموعة والأشكال مخفية. معرّف المجموعة: ${result.collectionId}`);
  } finally {
    if (!token) await client.auth.signOut({ scope: 'local' });
  }
}

main().catch(error => {
  // No provider error objects, credentials, or authentication responses in terminal logs.
  console.error(error instanceof Error && error.message && !/https?:|Bearer|eyJ/.test(error.message) ? error.message : 'تعذر الاستيراد. تحقّق من ملف الاستيراد والاتصال وصلاحية جلسة الإدارة.');
  process.exitCode = 1;
});
