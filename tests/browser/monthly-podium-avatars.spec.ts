import { test, expect, mockService, login, employee } from './fixtures.js';

for (const width of [390, 1280]) test(`podium uses the result month's avatar at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const service = await mockService(page, { role: 'employee' });
  Object.assign(service.account, { manualStats: { positive: 5, monthReviews: 20 } });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, competition: false, balanceGrowth: false, tiers: false, silverAt: 8, goldAt: 11 }, baselineDay: null, baseline: {},
    store: { collections: [], wallet: null, selectedVariant: null, equipped: { [employee.id]: 'bundled/current-month.webp' } },
  } }));
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: { generatedAt: '2026-11-04', directory: [{ ...service.account, manualStats: { positive: 5, monthReviews: 20 } }], reviews: [], notes: [], hours: {} } }));
  let requestedMonth = '';
  await page.route('**/rpc/get_monthly_avatars', route => {
    requestedMonth = route.request().postDataJSON().requested_month;
    return route.fulfill({ json: { [employee.id]: 'bundled/result-month.webp' } });
  });
  await login(page);
  await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
  await expect(page.locator('.swiper-slide-active .crystal-standing-avatar img')).toHaveAttribute('src', /current-month.webp$/);
  await page.getByRole('button', { name: /^نتائج / }).click();
  const podium = page.getByRole('main', { name: 'تتويج جميع موظفات الفئة الذهبية' });
  await expect(podium).toBeVisible();
  await expect(podium.locator('.results-platform-avatar img').first()).toHaveAttribute('src', /result-month.webp$/);
  const month = new Date(); month.setDate(1); month.setMonth(month.getMonth() - 1);
  expect(requestedMonth).toBe(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`);
  expect(service.unexpected).toEqual([]);
});

test('podium reports historical avatar read failures instead of showing current avatars', async ({ page }) => {
  await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_monthly_avatars', route => route.fulfill({ status: 500, json: { message: 'Test failure' } }));
  await login(page);
  await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
  await page.getByRole('button', { name: /^نتائج / }).click();
  await expect(page.getByText('تعذر تحميل أفتارات شهر النتيجة. حدّثي الصفحة لإعادة المحاولة.')).toBeVisible();
  await expect(page.getByRole('main', { name: 'تتويج جميع موظفات الفئة الذهبية' })).toHaveCount(0);
});
