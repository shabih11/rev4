# نظام التقييمات

واجهة عربية RTL لإدارة تقييمات الفروع والشفتات وعرض نتائج الموظفات؛ React 19 وTypeScript 6 وVite 8 وTailwind 3، مع Supabase Auth وPostgreSQL.

## التشغيل

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

المتطلبات: Node.js 24. إعداد Supabase العام موجود في `src/lib/supabase.ts`، ويمكن تجاوزه بمتغيري `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`. لا تضع مفاتيح إدارة أو Windsor في متغيرات `VITE_*`.

## البيانات والصلاحيات

تعتمد الصلاحيات على `user_access` وسياسات RLS ووظائف SQL في `supabase/migrations/`. ملف الموظفة مستقل عن حساب الدخول؛ الحساب يُنشأ عبر Supabase Auth ثم يُربط بعضوية مخولة. لا ينشئ العميل أدوارًا إدارية.

بدأت القاعدة دون دليل الموظفات والحسابات التجريبية أو الشفتات القديمة. التقييمات أعيد جلبها من Windsor، وليست من نسخة Firebase. يُنشأ الموظفون والحسابات والشفتات لاحقًا من مصادر معتمدة. لا توجد بيانات دخول أو نسخة تقييمات في Git.

`admin` اسم دخول بديل للحساب الإداري الداخلي؛ كلمة المرور خاصة ولا تُضمّن في التطبيق.

## المزامنة والتخزين

GitHub Actions يجلب Windsor باستخدام سر `WINDSOR_API_KEY` الموجود، ثم يرسل البيانات إلى Edge Function بهوية GitHub OIDC. المتصفح يقرأ Supabase ويخزن النتائج بإصدار، مع تحديث تلقائي عند تغير البيانات؛ لا يجلب Windsor ولا يحفظ مفتاحه.

راجع [دليل التشغيل](docs/supabase-operations.md)، [عامل المزامنة](automation/README.md)، و[مراجعة الأمان](docs/supabase-security-review.md).

## النشر

هذا الفرع مستقل: `codex/supabase-production`. فحوصه لا تنشر الموقع الحي. GitHub Pages ينشر من `main` فقط بعد اعتماد التغيير. الموقع الحالي: [rev4](https://shabih11.github.io/rev4/).
