import { test, expect, login, mockService } from './fixtures.js';

for (const scenario of [
  { name: 'sinking', time: '2026-11-05T23:30:00', scene: 'distress', mobile: false },
  { name: 'sinking-after-midnight', time: '2026-11-06T00:00:00', scene: 'distress', mobile: false },
  { name: 'sinking-before-opening-mobile', time: '2026-11-06T13:59:59', scene: 'distress', mobile: true },
  { name: 'eliminated', time: '2026-11-06T14:00:00', scene: 'capsized', mobile: false },
  { name: 'rescue-desktop', time: '2026-11-07T12:00:00', scene: 'rescue', mobile: false },
  { name: 'rescue-night-mobile', time: '2026-11-07T01:00:00', scene: 'rescue', mobile: true },
  { name: 'wreck-desktop', time: '2026-11-08T12:00:00', scene: 'wreck', mobile: false },
  { name: 'wreck-mobile', time: '2026-11-09T12:00:00', scene: 'wreck', mobile: true },
]) {
  test(`boats show ${scenario.name} with loaded transparent artwork`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${scenario.time}+03:00`));
    if (scenario.mobile) await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page);
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto('./#/?view=sea');
    const boats = page.locator(`.sea-vessel[data-scene="${scenario.scene}"]`);
    await expect(page.getByRole('button', { name: 'مشهد القوارب المقلوبة' })).toHaveCount(0);
    await expect(boats).toHaveCount(6);
    await expect(page.locator('.sea-vessel-wake')).toHaveCount(0);
    await expect(boats.locator('.sea-hull-ripples')).toHaveCount(12);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const ripple = boats.first().locator('.sea-hull-ripples').first();
    const before = await ripple.evaluate(el => getComputedStyle(el, '::before').transform);
    await expect.poll(() => ripple.evaluate(el => getComputedStyle(el, '::before').transform)).not.toBe(before);
    await expect.poll(() => boats.locator('.sea-vessel-boat').evaluateAll(images =>
      images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)))
      .toBe(true);
    if (scenario.scene === 'rescue') {
      const boxes = await boats.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(scenario.mobile ? 390 : 1280);
      }
    }
    await boats.first().click();
    await expect(boats.first()).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(service.unexpected).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`sea-${scenario.name}.png`) });
  });
}

for (const mobile of [false, true]) {
  test(`rescue stays ahead of other branches without overlap (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-07T15:00:00+03:00'));
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page);
    await page.route('https://supabase.test.invalid/rest/v1/rpc/get_read_model', route => route.fulfill({ json: {
      generatedAt: '2026-11-07T15:00:00+03:00', directory: [service.account],
      reviews: ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة'].flatMap(branch => [5, 6].flatMap(day => [0, 1].map(index => ({
        id: `${branch}-${day}-${index}`, branch, rating: '5', date: `2026-11-0${day}`, time: '15:00:00', linkedEmployeeIds: [],
      })))), notes: [], hours: {}, disabledEmployeeIds: [],
    } }));
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto('./#/?view=sea');
    const rescue = page.locator('.sea-vessel[data-scene="rescue"]');
    await expect(rescue).toHaveCount(1);
    await expect(page.locator('.sea-vessel')).toHaveCount(6);
    await expect.poll(() => page.locator('.sea-vessel-boat').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete))).toBe(true);
    const box = await rescue.boundingBox();
    const otherBoxes = await page.locator('.sea-vessel:not([data-scene="rescue"])').evaluateAll(elements => elements.map(element => {
      const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }));
    expect(otherBoxes.every(other => box!.y + box!.height < other.bottom)).toBe(true);
    expect(otherBoxes.every(other => box!.x + box!.width <= other.left || other.right <= box!.x
      || box!.y + box!.height <= other.top || other.bottom <= box!.y)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`sea-mixed-rescue-${mobile ? 'mobile' : 'desktop'}.png`) });
    expect(service.unexpected).toEqual([]);
  });
}

for (const width of [390,1280]) test(`capsized and sailing boats share the same scene at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await page.clock.setFixedTime(new Date('2026-11-06T14:00:00+03:00'));
  const service=await mockService(page);
  await page.route('**/rpc/get_read_model',route=>route.fulfill({json:{
    generatedAt:'2026-11-06T14:00:00+03:00',directory:[service.account],notes:[],hours:{},disabledEmployeeIds:[],
    reviews:['جاليري','ذافيو','سلام','القصر','المملكة'].flatMap(branch=>[0,1].map(i=>({id:`${branch}-${i}`,branch,rating:'5',date:'2026-11-05',time:'15:00:00',linkedEmployeeIds:[]}))),
  }}));
  await page.route('**/functions/v1/riyadh-weather',route=>route.fulfill({status:503,json:{}}));
  await login(page);
  await page.goto('./#/?view=sea');
  const scene=page.getByRole('region',{name:'رحلة الفروع إلى الجزيرة',exact:true});
  await expect(scene.locator('.sea-vessel')).toHaveCount(6);
  await expect(scene.locator('.sea-vessel[data-scene="capsized"]')).toHaveCount(1);
  await expect(scene.locator('.sea-vessel:not([data-scene="capsized"])')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'مشهد القوارب المقلوبة'})).toHaveCount(0);
  await scene.screenshot({path:`/tmp/sea-unified-${width}.png`});
  expect(service.unexpected).toEqual([]);
});
