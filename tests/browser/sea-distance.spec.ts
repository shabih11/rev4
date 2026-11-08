import { test, expect, login, mockService, employee } from './fixtures.js';

for (const mobile of [true, false]) {
  test(`day glare ends at 15:00 (${mobile ? 'mobile' : 'desktop'})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const service = await mockService(page);
    await page.route(`${new URL(baseURL!).origin}/**`, route => route.continue());
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    for (const [time, prefix, light] of [['14:59:59', 'ocean-distant-glare', 'sunny'],
      ['15:00:00', 'ocean-distant', 'sunny'], ['16:59:59', 'ocean-distant', 'sunny'], ['17:00:00', 'ocean-distant', 'soft']]) {
      await page.clock.setFixedTime(new Date(`2026-11-05T${time}+03:00`));
      await page.goto('./#/?view=sea');
      await page.reload();
      await expect(page.locator('.sea-map')).toHaveAttribute('data-light', light);
      const expected = `${prefix}-${mobile ? 'mobile' : 'desktop'}.webp`;
      await expect.poll(() => page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).currentSrc)).toContain(expected);
      await expect.poll(() => page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.screenshot({ path: `/tmp/rev4-glare-${mobile ? 'mobile' : 'desktop'}-${time.slice(0, 2)}.png` });
    }
    expect(service.unexpected).toEqual([]);
  });
  test(`night scenery keeps the previous image after the fifteenth (${mobile ? 'mobile' : 'desktop'})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const service = await mockService(page);
    await page.route(`${new URL(baseURL!).origin}/**`, route => route.continue());
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    for (const day of [5, 15, 16]) {
      await page.clock.setFixedTime(new Date(`2026-11-${String(day).padStart(2, '0')}T02:00:00+03:00`));
      await page.goto('./#/?view=sea');
      await page.reload();
      await expect(page.locator('.sea-map')).toHaveAttribute('data-light', 'night');
      const expected = `${day < 16 ? 'ocean-distant-night' : 'ocean-night'}-${mobile ? 'mobile' : 'desktop'}`;
      await expect.poll(() => page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).currentSrc)).toContain(expected);
      await expect.poll(() => page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator('.sea-island')).toHaveCount(day < 16 ? 0 : 1);
      await page.screenshot({ path: `/tmp/rev4-night-${mobile ? 'mobile' : 'desktop'}-${day}.png` });
    }
    expect(service.unexpected).toEqual([]);
  });
  test(`single rescue leads toward the island (${mobile ? 'mobile' : 'desktop'})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const service = await mockService(page);
    await page.route(`${new URL(baseURL!).origin}/**`, route => route.continue());
    const reviews = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة'].flatMap(branch =>
      [5, 6, 7].flatMap(day => (day === 7 && branch !== 'جاليري' ? [] : [0, 1]).map(index => ({ id: `${branch}-${day}-${index}`, branch,
        rating: '5', date: `2026-11-0${day}`, time: `15:0${index}`, linkedEmployeeIds: [] }))));
    await page.route('**/rest/v1/rpc/get_read_model', route => route.fulfill({ json: {
      generatedAt: '2026-11-07T15:05:00+03:00', directory: [employee], reviews, notes: [], hours: {}, disabledEmployeeIds: [],
    } }));
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.clock.setFixedTime(new Date('2026-11-07T15:05:00+03:00'));
    await page.goto('./#/?view=sea');
    const rescue = page.locator('.sea-vessel[data-scene="rescue"]');
    await expect(rescue).toHaveCount(1);
    const box = (await rescue.boundingBox())!;
    const map = (await page.locator('.sea-map').boundingBox())!;
    expect(box.x + box.width / 2).toBeGreaterThan(map.x + map.width * .55);
    expect(box.width).toBeGreaterThan(mobile ? map.width * .25 : 200);
    expect(box.y + box.height).toBeLessThanOrEqual(map.y + map.height);
    const ordinary = await page.locator('.sea-vessel:not([data-scene="rescue"])').evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect();
      return { y: parseFloat((el.parentElement as HTMLElement).style.getPropertyValue('--berth-y')),
        width: rect.width, bottom: rect.bottom, z: Number(getComputedStyle(el.parentElement!).zIndex) };
    }).sort((a, b) => a.y - b.y));
    expect(ordinary.at(-1)!.width).toBeGreaterThan(ordinary[0].width * 1.15);
    expect(ordinary.at(-1)!.width).toBeLessThan(ordinary[0].width * 1.6);
    for (let index = 1; index < ordinary.length; index++) expect(ordinary[index].width).toBeGreaterThanOrEqual(ordinary[index - 1].width);
    for (const other of ordinary) expect(box.y + box.height).toBeLessThan(other.bottom);
    const rescueZ = await rescue.evaluate(el => Number(getComputedStyle(el.parentElement!).zIndex));
    expect(rescueZ).toBeLessThan(Math.min(...ordinary.map(item => item.z)));
    const boxes = await page.locator('.sea-vessel').evaluateAll(elements => elements.map(el => {
      const { left, right, top, bottom } = el.getBoundingClientRect();
      return { left, right, top, bottom };
    }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.right + 4 <= b.left || b.right + 4 <= a.left || a.bottom + 4 <= b.top || b.bottom + 4 <= a.top).toBe(true);
    }
    const achieverY = await page.locator('.sea-vessel[data-scene="celebrate"]').evaluate(el =>
      parseFloat((el.parentElement as HTMLElement).style.getPropertyValue('--berth-y')));
    expect(achieverY).toBe(ordinary[0].y);
    await page.screenshot({ path: `/tmp/rev4-rescue-front-${mobile ? 'mobile' : 'desktop'}.png` });
    expect(service.unexpected).toEqual([]);
  });
  test(`scenery changes after the fifteenth (${mobile ? 'mobile' : 'desktop'})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const service = await mockService(page);
    await page.route(`${new URL(baseURL!).origin}/**`, route => route.continue());
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    for (const day of [5, 15, 16]) {
      await page.clock.setFixedTime(new Date(`2026-11-${String(day).padStart(2, '0')}T15:00:00+03:00`));
      await page.goto('./#/?view=sea');
      await page.reload();
      await expect(page.locator('.sea-map')).toHaveAttribute('data-distance', day < 16 ? 'distant' : 'near');
      await expect(page.locator('.sea-island')).toHaveCount(day < 16 ? 0 : 1);
      await expect(page.locator('.sea-distant-water')).toHaveCount(day < 16 ? 1 : 0);
      await expect(page.locator('.sea-vessel')).toHaveCount(6);
      await expect.poll(() => page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      if (day < 16) {
        await expect.poll(() => page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).currentSrc)).toContain(`ocean-distant-${mobile ? 'mobile' : 'desktop'}`);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/rev4-distance-${mobile ? 'mobile' : 'desktop'}-${day}.png` });
    }
    expect(service.unexpected).toEqual([]);
  });
}
