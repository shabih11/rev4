# مرجع التطوير

تعليمات العمل الحالية في [AGENTS.md](../AGENTS.md)، والتشغيل في [README](../README.md)، والتحقق والنشر في [سير الإصدار](production-workflow.md).

بنية التطبيق الحالية: React وVite وTypeScript مع Supabase Auth وPostgreSQL. ملفات المزوّدات في `src/context/*Provider.tsx`، وعقود السياق وhooks في `*Context.ts`. عمليات البيانات مقسمة حسب المجال في `src/lib/*Actions.ts`، ومؤشرات الموظفات في `employeeMetrics.ts`.

المرجع السابق الخاص بـFirebase محفوظ [للرجوع التاريخي فقط](archive/development-reference-firebase.md)، ولا يُستخدم لإعداد المشروع أو نشره.
