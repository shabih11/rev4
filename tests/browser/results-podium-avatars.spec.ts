import { test, expect, mockService, login, employee } from './fixtures.js';

for (const width of [390, 1280]) test(`results podium shows full avatars at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
    reviews: [{ id: 'october', branch: 'جاليري', rating: '5', date: '31-10-2026', time: '10:00', linkedEmployeeIds: [employee.id] }],
  } }));
  await login(page);
  await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
  await page.getByRole('button', { name: /^نتائج / }).click();
  const podium = page.getByRole('main', { name: 'منصة الأوائل السبع' });
  await expect(podium).toBeVisible();
  const avatar = podium.locator('.results-platform-avatar img').first();
  await expect(avatar).toHaveCSS('transform', 'none');
  await expect(avatar).toHaveCSS('object-fit', 'contain');
  await expect(avatar).toHaveCSS('object-position', '50% 100%');
  await podium.screenshot({ path: test.info().outputPath('results-podium-avatars.png') });
  expect(service.unexpected).toEqual([]);
});
