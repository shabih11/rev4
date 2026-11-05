import { test, expect, login, mockService } from './fixtures.js';

for (const scenario of [
  { name: 'sinking', time: '2026-11-05T23:30:00', scene: 'distress', mobile: false },
  { name: 'eliminated', time: '2026-11-06T14:00:00', scene: 'capsized', mobile: false },
  { name: 'eliminated-night-mobile', time: '2026-11-07T01:00:00', scene: 'capsized', mobile: true },
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
    await expect(boats).toHaveCount(6);
    await expect(page.locator('.sea-vessel-wake')).toHaveCount(0);
    await expect.poll(() => boats.locator('.sea-vessel-boat').evaluateAll(images =>
      images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)))
      .toBe(true);
    await boats.first().click();
    await expect(boats.first()).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(service.unexpected).toEqual([]);
    await page.screenshot({ path: `/tmp/rev4-sea-${scenario.name}.png` });
  });
}
