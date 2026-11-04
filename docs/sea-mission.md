# مهمة البحر

- الوصول من زر «مهمة البحر» أعلى صفحة المنافسة، أو `/#/?view=sea` مع بادئة الموقع الحالية `/rev4/`.
- النقر مجددًا على «مهمة البحر» يعيد إلى لوحة الترتيب؛ حُذف الشعار العلوي من هذه الشاشة لتوفير المساحة.
- تبدأ القوارب في الصفين الأوسط والخلفي. اكتمال الهدف اليومي يقدّم القارب صفًا واحدًا مرة واحدة، بحسب توقيت التقييم الذي أكمل الهدف، مع إعادة الحساب عند وصول بيانات متأخرة. عند وصول ثالث قارب للمقدمة تُرجع البقية إلى الصف الخلفي، بما فيها الغارقة؛ وتحقيق هدف لاحق ينقل قارب الخلف إلى الوسط. إذا حقق قارب المقدمة هدف يوم جديد يتبعه المشهد خطوة، وتتراجع القوارب الأخرى بصريًا ضمن ثلاثة صفوف فقط.
- المسارات الأفقية عشوائية وثابتة لكل فرع طوال اليوم، حتى مع تحديث البيانات والتقدم بين الصفوف؛ تتغير عند منتصف الليل بتوقيت الرياض. تُوزع دون تداخل حتى لو اجتمعت القوارب الستة في صف واحد. قاعدة الجزيرة ملاصقة لخط الماء.
- المنافسة ثابتة من ٥ إلى ٣٠ نوفمبر ٢٠٢٦، والغنيمة ١٬٠٠٠ ريال للفروع المستمرة بالتساوي.
- يوم العمل نافذة `[افتتاح اليوم، افتتاح الغد)` بتوقيت الرياض؛ آخر ثانية هي ثانية ما قبل الافتتاح التالي. يوم ٣٠ نوفمبر ينتهي عند افتتاح ١ ديسمبر.
- المصدر المشترك لمواعيد الافتتاح هو `src/lib/branchHours.ts`، المستخرج دون تغيير من شاشة إدخال الشفتات. الجمعة ١٤:٠٠ للجميع. إعدادات حدود الشفتات ليست بديلًا عن موعد افتتاح الفرع.
- يُحسب كل تقييم فريد للفرع مرة واحدة إذا كان ٤ أو ٥ نجوم، حسب تاريخ ووقت حدوثه. الهدف اليومي تقييمان من ٥–١٥ نوفمبر، ثم ٣ من ١٦–٢٥، ثم ٤ من ٢٦–٣٠. تتبع المرحلة تاريخ بداية يوم العمل لا تاريخ التقييم بعد منتصف الليل.
- لكل فرع رجعة واحدة مستقلة في كل مرحلة، تُستهلك عند إغلاق يوم ناقص عن الهدف بشرط تحقيق النصف على الأقل (١ ثم ٢ ثم ٢). النقص المتكرر في المرحلة نفسها أو تحقيق أقل من النصف يغرق الفرع. الرجعات لا تتراكم أو تنتقل بين المراحل، ولا تعيد فرعًا غرق سابقًا. الأيام الكاملة لا تستهلك رجعة ولا تعوض الأيام الناقصة الأخرى.
- التقييمات ذات الأوقات المفقودة توقف تأكيد النتيجة عند الحاجة إلى التحقق. أخطاء المزامنة أو انقطاع الاتصال تمنع عرض نتيجة مؤكدة. التقييم المتزامن متأخرًا يعاد احتسابه بحسب وقت حدوثه.
- المبالغ المعروضة حصص الفروع؛ لا يوزع هذا التغيير المكافأة على الموظفات ولا يغير أرصدتهن الشهرية أو قواعد صلاحيات البيانات.
- لا توجد بيانات عرض أو نتائج ثابتة في التطبيق. بيانات الفحص معزولة، ولم تتصل ببيانات الإنتاج.

## التحقق

اختبارات `tests/seaMission.test.mjs` تغطي الحدود الزمنية، الجمعة، منع التكرار والتعويض، أهداف المراحل وحدودها، استقلال الرجعات وعدم انتقالها، الاستبعاد بأقل من النصف، نهاية الشهر، المزامنة المتأخرة، وعدم اكتمال الوقت. جرى كذلك فحص المتصفح من ٣٢٠ إلى ١٤٤٠ بكسل، اختيار الفروع، التنقل، انقطاع الاتصال، وفحص axe للواجهة الجديدة.

## الرسومات

ولّدت الرسومات بأداة توليد الصور المدمجة، ثم حُوّلت إلى WebP للتحميل. مجموعها نحو ١٧٩ كيلوبايت. الشعار هو شعار التطبيق القائم. النصوص والتقييمات والأزرار عناصر واجهة حقيقية وليست جزءًا من الصور.

### `src/assets/sea/island.webp`

طلب التوليد النهائي:

```text
Create a production web app raster illustration asset for an Arabic sea challenge dashboard. Match approved look: elegant soft low-poly faceted 3D geometry, icy blue crystal edges, bright luminous turquoise water, polished royal-blue highlights, gentle daylight, no harsh dark shadows. Not pixel art, not emoji, no text, no letters, no interface, no watermark. Isolated small tropical treasure island centered, rocky pale blue and sandy beige polygon base, two graceful low-poly green palm trees and an open golden treasure chest on sand, small blue flag. Front elevated three-quarter view. Completely transparent background outside island, roomy tight useful composition, object fills 88% of frame. Wide 3:2 composition. Include subtle water lapping ONLY around island base, no rectangular backdrop.
```

### `src/assets/sea/boat.webp`

طلب التوليد النهائي:

```text
Create a production web app raster illustration asset for an Arabic sea challenge dashboard. Match approved look: elegant soft low-poly faceted 3D geometry, icy blue crystal edges, bright luminous turquoise water, polished royal-blue highlights, gentle daylight, no harsh dark shadows. Not pixel art, not emoji, no text, no letters, no interface, no watermark. One isolated elegant small wooden sailboat with white and royal blue triangular sails and warm brown hull, seen from slightly above front side, bow pointing LEFT. Entire boat fills 88% of square frame, centered. Tiny soft turquoise ripple underneath. Transparent background everywhere else. A realistic low-poly miniature rendered object, not a flat icon or emoji.
```

### `src/assets/sea/ocean.webp`

طلب التوليد النهائي:

```text
Create a production web app raster illustration asset for an Arabic sea challenge dashboard. Match approved look: elegant soft low-poly faceted 3D geometry, icy blue crystal edges, bright luminous turquoise water, polished royal-blue highlights, gentle daylight, no harsh dark shadows. Not pixel art, not emoji, no text, no letters, no interface, no watermark. WIDE landscape 3:2 background texture only. Calm luminous turquoise polygon-faceted ocean covers bottom 80%, fading to very pale icy blue mist at top 20%, no horizon line. Soft white glints and subtle broad wave facets. Pale blue faceted crystal rocks occupy only far lower left and far lower right corners. Empty center for boats and labels to be layered with code. NO island, NO trees, NO boats, NO treasure, NO text, NO UI. Full bleed opaque image.
```
