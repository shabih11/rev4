# سير إصدار Supabase

1. اعمل في فرع `codex/` مستقل عن `main`.
2. نفذ lint واختبارات Node وبناء الإنتاج، ثم اختبار RLS في معاملة تُلغى.
3. راجع تغيرات Auth وRLS وOIDC قبل اعتمادها؛ لا تنشر أسرارًا أو بيانات استيراد خاصة.
4. تحقق من فحص `Production checks` وتشغيل `Windsor to Supabase` على فرع Supabase.
5. اعتماد الفرع في `main` ينشر Pages وينقل المزامنة المجدولة إلى Supabase؛ لا يفعل رفع الفرع وحده ذلك.

التشغيل والتجهيز: [دليل Supabase](supabase-operations.md).
