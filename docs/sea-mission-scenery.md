# منظر مهمة البحر

البحر يملأ المساحة المتبقية أسفل أزرار التنقل، بعرض الصفحة دون إطار أو حواف بطاقة. تبقى لكل فرع خانة سفينة مستقلة حتى بعد الغرق؛ تستخدم السفن المغادرة صورة من الخلف، وتستخدم السفن الغارقة الصورة الجانبية السابقة مع تأثير الغرق نفسه.

تبدأ الجزيرة عند الأفق بحجم ٩٪ من حجمها القريب، وتتقدم مرحلة واحدة عند افتتاح أول فرع لكل يوم عمل. تكون أبعد ما يمكن في ٥ نوفمبر وأقرب ما يمكن في ٣٠ نوفمبر، ثم تبقى ثابتة. تقدم المنظر مستقل عن عدد الفروع الناجية، ولا يغير احتساب الغرق أو المكافآت. الاختبارات في `tests/seaMission.test.mjs` تتحقق من التقدم اليومي وحدود الجمعة وعدم توقف المشهد عند غرق الجميع.

الرسومات الجديدة مولدة بأداة توليد الصور المدمجة ومحفوظة بصيغة WebP. الجزيرة والسفينة الغارقة من الملفات القائمة. الخلفيتان مصممتان للجوال والكمبيوتر ليبقى الأفق والأمواج في منظور مناسب، دون تكبير موجات الكمبيوتر على شاشة ضيقة. تقدم الجزيرة انتقال قصير فقط عند تغير اليوم، ويُلغى عند تفضيل تقليل الحركة.

## طلبات التوليد النهائية

### `src/assets/sea/boat-stern.webp`

مرجع التعديل: `src/assets/sea/boat.webp`، بخلفية شفافة.

```text
Use case: precise-object-edit. Asset type: transparent sailing boat sprite for a production web scene. Reference image is the SAME boat style and materials to preserve: warm wooden hull, royal-blue and white sails, gentle faceted geometry. Change VIEWPOINT completely: see the boat DIRECTLY FROM BEHIND ITS STERN as it sails AWAY from the viewer toward the TOP CENTER / distant horizon. The flat squared wooden stern/transom faces the camera at bottom center; the narrow bow points away and is obscured by hull/deck. Both left and right sides are symmetrical about the mast, no broadside, no side-on diagonal, no frontal bow view. Camera slightly elevated just enough to see some interior deck ahead of stern. Full mast and sails visible, royal blue/white sails extending to sides naturally in wind, wooden rudder/stern detail facing camera. A tiny realistic fine turquoise foam wake trails BEHIND the stern toward bottom edge. Soft bright daylight, refined low-poly boat with realistic subtle water ripple matching island image. Isolate ONE boat, centered, 85% frame height, no people, no text, no labels, NO island, transparent background. Portrait composition. Keep the stern as the nearest wide hull surface.
```

### `src/assets/sea/ocean-distance.webp`

مرجع المياه والألوان: `src/assets/sea/island.webp`، بخلفية معتمة.

```text
Use case: illustration-story. Asset type: immersive full-screen ocean scene BACKGROUND ONLY. Reference image is supporting water/color reference: match the NATURAL delicate turquoise ripples and fine white foam around its island base, but do NOT include that island, trees, chest or any object. Generate a wide landscape 1536x1024 or larger high fidelity seascape seen from a LOW ELEVATED CAMERA looking far out to a very distant centered horizon. Horizon around upper 20%, pale icy-blue clear bright sky above. Water is luminous natural azure and turquoise with fine organic realistic waves, small soft ripples and sunlight caustic glints, absolutely NOT angular polygonal sheets or giant triangular facets, no diagonal streaks. Perspective: tiny densely spaced ripples toward horizon, slightly larger but still soft natural wavelets in foreground. Palette pale cool blue at horizon fading into turquoise toward foreground, akin to clear tropical water. Calm pleasant daylight. No land, no rocks, no island, no boats, no paths, no UI, no text, no emoji, no large white breaking waves, no cartoon wave icons. Empty useful scene so transparent boats and island can be layered in code. Full bleed opaque. Rich natural watery microtexture but never noisy, gloomy or oversaturated neon.
```

### `src/assets/sea/ocean-distance-mobile.webp`

مرجع التعديل: خلفية الكمبيوتر المولدة أعلاه، بخلفية معتمة.

```text
Use case: precise-object-edit. Asset type: portrait mobile full-page ocean BACKGROUND. Recompose reference natural ocean to a tall PORTRAIT 1024x1792 or 1024x1536. Preserve same turquoise/azure water and pale bright sky, soft natural waves, water perspective. Keep horizon EXACTLY at 20% of total height. Fill upper 20% with pale cool blue cloudless sky. Below horizon fill entire rest with fine small organic wavelets, with dense very tiny far-away ripples and slightly larger foreground wavelets. This is a distant voyage view, avoid large swelling waves or overscaled caustics. No islands, ships, rocks, objects, paths, labels or text. Camera aimed forward to central distant horizon. Full bleed opaque background. Natural and serene, no angular polygons, no borders or UI.
```
