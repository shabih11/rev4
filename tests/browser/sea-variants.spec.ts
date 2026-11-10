import { test, expect, login, mockService } from './fixtures.js';

test('midday artwork varies by branch and time slot, and the coffee scene uses the seated crews', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T14:35:00+03:00'));
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await mockService(page);
  await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
  await login(page);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto('./#/?view=sea');

  const kingdom = page.locator('[data-branch="المملكة"] .sea-vessel-boat');
  const east = page.locator('[data-branch="شرق"] .sea-vessel-boat');
  await expect(kingdom).toHaveAttribute('src', /kingdom-midday-alt/);
  await expect(east).toHaveAttribute('src', /east-adventure/);
  await page.screenshot({ path: test.info().outputPath('midday.png') });

  await page.clock.setFixedTime(new Date('2026-11-05T15:05:00+03:00'));
  await page.reload();
  await expect(kingdom).toHaveAttribute('src', /kingdom-adventure/);
  await expect(east).toHaveAttribute('src', /east-midday-alt/);

  await page.clock.setFixedTime(new Date('2026-11-05T16:05:00+03:00'));
  await page.reload();
  const coffee = page.locator('.sea-vessel[data-scene="coffee"] .sea-vessel-boat[src*="-coffee-alt"]');
  await expect(coffee).toHaveCount(6);
  await expect.poll(() => coffee.evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  expect(service.unexpected).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('coffee.png') });
});
