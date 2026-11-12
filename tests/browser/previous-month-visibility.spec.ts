import { test, expect, mockService, login } from './fixtures.js';

for (const [instant, visible] of [['2026-11-15T23:59:00+03:00', true], ['2026-11-16T00:00:00+03:00', false]] as const) {
  test(`previous month button is ${visible ? 'visible' : 'hidden'} at ${instant}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date(instant));
    const service = await mockService(page, { role: 'employee' });
    const origin = new URL(test.info().project.use.baseURL!).origin;
    await page.route(`${origin}/**`, route => route.continue());
    await login(page);
    await page.goto('./#/');
    await expect(page.getByRole('button', { name: 'الموظفات', exact: true })).toBeVisible();
    const button = page.getByRole('button', { name: /^نتائج / });
    await expect(button).toHaveCount(visible ? 1 : 0);
    await page.locator('.recognition-header').screenshot({ path: test.info().outputPath('month-button.png') });
    expect(service.unexpected).toEqual([]);
  });
}
