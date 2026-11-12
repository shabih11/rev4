/// <reference lib="dom" />
import { test, expect, login, mockService } from './fixtures.js';

for (const scenario of [
  { name: 'bright day', hour: 12, cloud: 0, symbol: 'clearsky_day', wind: 2, light: 'sunny', effect: 'clear' },
  { name: 'cloudy weather during sunny hours', hour: 12, cloud: 90, symbol: 'cloudy', wind: 2, light: 'sunny', effect: 'cloudy' },
  { name: 'rainy iPhone day', hour: 12, cloud: 95, symbol: 'rain', wind: 4, light: 'sunny', effect: 'rain' },
  { name: 'rainy coffee fleet', hour: 16, cloud: 95, symbol: 'rain', wind: 4, light: 'sunny', effect: 'rain' },
  { name: 'rainy working fleet', hour: 15, cloud: 95, symbol: 'rain', wind: 4, light: 'sunny', effect: 'rain' },
  { name: 'soft afternoon', hour: 17, cloud: 0, symbol: 'clearsky_day', wind: 2, light: 'soft', effect: 'clear' },
  { name: 'partially dark evening', hour: 23, cloud: 0, symbol: 'clearsky_night', wind: 2, light: 'dusk', effect: 'clear' },
  { name: 'stormy evening', hour: 23, cloud: 90, symbol: 'rainandthunder', wind: 12, light: 'dusk', effect: 'storm' },
  { name: 'rainy sleeping fleet', hour: '00', cloud: 95, symbol: 'rain', wind: 4, light: 'night', effect: 'rain' },
  { name: 'moonlit sleep', hour: '00', cloud: 0, symbol: 'clearsky_night', wind: 2, light: 'night', effect: 'clear' },
  { name: 'windy mobile day', hour: 12, cloud: 10, symbol: 'fair_day', wind: 9, light: 'sunny', effect: 'wind' },
] as const) {
  test(`Riyadh weather renders ${scenario.name}`, async ({ page }) => {
    const now = new Date(`2026-11-05T${scenario.hour}:10:00+03:00`);
    await page.clock.setFixedTime(now);
    if (scenario.effect === 'wind' || scenario.effect === 'rain') await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page);
    let requests = 0;
    await page.route('**/functions/v1/riyadh-weather', route => {
      requests++;
      return route.fulfill({ json: { points: [{ time: now.getTime() - 600000, temperature: 25, cloud: scenario.cloud,
        symbol: scenario.symbol, wind: scenario.wind, rain: ['storm', 'rain'].includes(scenario.effect) ? 2 : 0 }] } });
    });
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto('./#/?view=sea');
    const map = page.locator('.sea-map');
    await expect(map).toHaveAttribute('data-light', scenario.light);
    await expect(map).toHaveAttribute('data-weather', scenario.effect);
    if (scenario.name === 'rainy sleeping fleet') {
      await expect(page.locator('.sea-vessel[data-scene="sleep"]')).toHaveCount(6);
      for (const boat of await page.locator('.sea-vessel-boat').all()) {
        await expect(boat).toHaveAttribute('src', /-rain-sleep/);
        await expect.poll(() => boat.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      await expect(page.locator('.sea-hull-ripples')).toHaveCount(12);
    }
    if (scenario.name === 'rainy coffee fleet' || scenario.name === 'rainy working fleet') {
      const coffee = scenario.name === 'rainy coffee fleet';
      await expect(page.locator(`.sea-vessel[data-scene="${coffee ? 'coffee' : 'adventure'}"]`)).toHaveCount(6);
      const sources = [];
      for (const boat of await page.locator('.sea-vessel-boat').all()) {
        await expect(boat).toHaveAttribute('src', coffee ? /-rain-coffee/ : /-rain-work/);
        await expect.poll(() => boat.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        sources.push(await boat.getAttribute('src'));
      }
      expect(new Set(sources).size).toBe(6);
      const activity = await page.locator('.sea-vessel').first().evaluate(el => ({
        duration: parseFloat(getComputedStyle(el).getPropertyValue('--ripple-duration')),
        strength: parseFloat(getComputedStyle(el).getPropertyValue('--ripple-strength')),
      }));
      expect(activity.duration).toBeLessThan(5.8);
      expect(activity.strength).toBeGreaterThan(.26);
    }
    if (scenario.name === 'moonlit sleep') {
      for (const boat of await page.locator('.sea-vessel-boat').all()) await expect(boat).not.toHaveAttribute('src', /-rain-sleep/);
    }
    const fleet = await page.locator('.sea-fleet > li').evaluateAll(items => items.map(item => ({
      sleeping: item.querySelector('.sea-vessel')?.getAttribute('data-scene') === 'sleep',
      y: parseFloat((item as HTMLElement).style.getPropertyValue('--berth-y')),
    })));
    for (const sleeping of fleet.filter(item => item.sleeping)) {
      for (const awake of fleet.filter(item => !item.sleeping)) expect(sleeping.y).toBeGreaterThan(awake.y);
    }
    await expect(page.getByRole('complementary', { name: 'طقس الرياض' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'MET Norway' })).toHaveCount(0);
    if (scenario.effect === 'storm' || scenario.effect === 'rain') {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect(map).toHaveAttribute('data-weather-art', 'true');
      await expect.poll(() => page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      expect(await page.locator('.sea-backdrop img').evaluate(el => (el as HTMLImageElement).currentSrc)).toContain(`weather-${scenario.effect}`);
      const ripple = page.locator('.sea-hull-ripples').first();
      const floatingBoats = await page.locator('.sea-vessel').count();
      await expect(page.locator('.sea-hull-ripples')).toHaveCount(floatingBoats * 2);
      if (floatingBoats) expect(await ripple.evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('sea-hull-ripple');
      const rain = page.locator('.sea-rain');
      expect(await rain.evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('sea-rainfall');
      const before = await rain.evaluate(el => getComputedStyle(el, '::before').transform);
      await expect.poll(() => rain.evaluate(el => getComputedStyle(el, '::before').transform)).not.toBe(before);
      await expect(page.getByRole('button', { name: /حركة الطقس/ })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath('rain-moving.png') });
      await expect(page.locator('.sea-rain')).toBeVisible();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await page.locator('.sea-rain').evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('none');
      if (floatingBoats) expect(await ripple.evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('none');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(requests).toBe(1);
    expect(service.unexpected).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`weather-${scenario.light}-${scenario.effect}.png`) });
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
