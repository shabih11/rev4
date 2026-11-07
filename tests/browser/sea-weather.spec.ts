/// <reference lib="dom" />
import { test, expect, login, mockService } from './fixtures.js';

for (const scenario of [
  { name: 'bright day', hour: 12, cloud: 0, symbol: 'clearsky_day', wind: 2, light: 'sunny', effect: 'clear' },
  { name: 'cloudy weather during sunny hours', hour: 12, cloud: 90, symbol: 'cloudy', wind: 2, light: 'sunny', effect: 'cloudy' },
  { name: 'soft afternoon', hour: 16, cloud: 0, symbol: 'clearsky_day', wind: 2, light: 'soft', effect: 'clear' },
  { name: 'partially dark evening', hour: 20, cloud: 0, symbol: 'clearsky_night', wind: 2, light: 'dusk', effect: 'clear' },
  { name: 'stormy evening', hour: 23, cloud: 90, symbol: 'rainandthunder', wind: 12, light: 'dusk', effect: 'storm' },
  { name: 'moonlit sleep', hour: '00', cloud: 0, symbol: 'clearsky_night', wind: 2, light: 'night', effect: 'clear' },
  { name: 'windy mobile day', hour: 12, cloud: 10, symbol: 'fair_day', wind: 9, light: 'sunny', effect: 'wind' },
] as const) {
  test(`Riyadh weather renders ${scenario.name}`, async ({ page }) => {
    const now = new Date(`2026-11-05T${scenario.hour}:10:00+03:00`);
    await page.clock.setFixedTime(now);
    if (scenario.effect === 'wind') await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page);
    let requests = 0;
    await page.route('**/functions/v1/riyadh-weather', route => {
      requests++;
      return route.fulfill({ json: { points: [{ time: now.getTime() - 600000, temperature: 25, cloud: scenario.cloud,
        symbol: scenario.symbol, wind: scenario.wind, rain: scenario.effect === 'storm' ? 2 : 0 }] } });
    });
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto('./#/?view=sea');
    const map = page.locator('.sea-map');
    await expect(map).toHaveAttribute('data-light', scenario.light);
    await expect(map).toHaveAttribute('data-weather', scenario.effect);
    const fleet = await page.locator('.sea-fleet > li').evaluateAll(items => items.map(item => ({
      sleeping: item.querySelector('.sea-vessel')?.getAttribute('data-scene') === 'sleep',
      y: parseFloat((item as HTMLElement).style.getPropertyValue('--berth-y')),
    })));
    for (const sleeping of fleet.filter(item => item.sleeping)) {
      for (const awake of fleet.filter(item => !item.sleeping)) expect(sleeping.y).toBeGreaterThan(awake.y);
    }
    await expect(page.getByRole('complementary', { name: 'طقس الرياض' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'MET Norway' })).toHaveCount(0);
    if (scenario.effect === 'storm') {
      await expect(page.locator('.sea-rain')).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await page.locator('.sea-rain').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(requests).toBe(1);
    expect(service.unexpected).toEqual([]);
    await page.screenshot({ path: `/tmp/rev4-weather-${scenario.light}-${scenario.effect}.png` });
  });
}

test('weather failure keeps the fleet and falls back to time-based lighting', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T12:10:00+03:00'));
  const service = await mockService(page);
  await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: { error: 'weather_unavailable' } }));
  await login(page);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto('./#/?view=sea');
  await expect(page.locator('.sea-map')).toHaveAttribute('data-weather', 'unavailable');
  await expect(page.locator('.sea-map')).toHaveAttribute('data-light', 'sunny');
  await expect(page.getByRole('complementary', { name: 'طقس الرياض' })).toHaveCount(0);
  await expect(page.locator('.sea-vessel')).toHaveCount(6);
  expect(service.unexpected).toEqual([]);
});
