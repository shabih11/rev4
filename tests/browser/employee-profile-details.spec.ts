import { test, expect, mockService, login } from './fixtures.js';

for (const width of [390, 1280]) test(`personal profile shows employee public details without rename at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, missions: true, branchBadges: true, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { wallet: { available: 100, earned: 100, spent: 0, stars: 200 }, equipped: {}, selectedVariant: null, collections: [] },
  } }));
  await login(page);
  await page.getByRole('button', { name: 'شخصي', exact: true }).click();
  const profile = page.getByRole('region', { name: 'بيانات حساب اختبار', exact: true });
  await expect(profile).toBeVisible();
  await expect(profile.getByRole('img', { name: /^المستوى / })).toBeVisible();
  await expect(profile.getByRole('region', { name: 'شارات الموظفة' })).toBeVisible();
  await expect(profile.getByRole('region', { name: 'ملخص بيانات الموظفة' })).toBeVisible();
  await expect(profile).toContainText('رصيد الشهر');
  await expect(profile).toContainText('إجمالي التقييمات');
  await expect(page.getByRole('heading', { name: 'تعديل الاسم' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'حفظ الاسم' })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(profile.getByRole('button', { name: 'إغلاق', exact: true })).toHaveCount(0);
  await profile.screenshot({ path: test.info().outputPath('employee-profile.png') });
  expect(await profile.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await profile.getByRole('button', { name: 'عرض تفاصيل النقاط من الملخص' }).click();
  await expect(profile).toContainText('نقاط الشهر الحالي');
  await profile.getByRole('button', { name: 'ملخصي', exact: true }).click();
  await expect(profile.getByRole('region', { name: 'ملخص بيانات الموظفة' })).toBeVisible();
  expect(service.unexpected).toEqual([]);
});
