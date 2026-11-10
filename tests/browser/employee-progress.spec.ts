import { test, expect, mockService, login, employee } from './fixtures.js';

for (const width of [390, 1280]) {
  test(`employee summary shows November level, historical wallet, badges and owned avatars at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const service = await mockService(page, { role: 'employee' });
    const owned = { id: 'owned-avatar', name: 'أفاتار مقتنى', imagePath: 'owned.webp', enabled: false, ownerId: employee.id, ownerName: 'حساب اختبار' };
    await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
      settings: { missions: true, avatars: true, tiers: true, silverAt: 8, goldAt: 11, competition: false, balanceGrowth: false }, baseline: {}, baselineDay: null,
      store: { wallet: { earned: 145, spent: 20, available: 125 }, equipped: {}, selectedVariant: null, collections: [{ id: 'collection', name: 'مجموعة اختبار', price: 300, enabled: false, variants: [owned] }] },
    } }));
    await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
      generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
      reviews: ['10', '11'].flatMap(month => Array.from({ length: 10 }, (_, i) => ({ id: `${month}-${i}`, branch: 'جاليري', rating: '5', date: `03-${month}-2026`, time: '10:00', linkedEmployeeIds: [employee.id] }))),
    } }));
    await page.route('**/storage/v1/object/sign/avatar-store/*', route => route.fulfill({ json: { signedURL: '/object/sign/avatar-store/owned.webp?token=test' } }));
    await page.route('**/object/sign/avatar-store/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160"><rect x="30" y="10" width="40" height="140" rx="20" fill="#2563eb"/></svg>' }));
    await page.route('**/rpc/equip_avatar', route => {
      expect(route.request().postDataJSON()).toEqual({ variant: 'owned-avatar' });
      return route.fulfill({ json: null });
    });
    await login(page);
    await expect(page.getByRole('region', { name: 'نتائجي' })).toBeVisible();
    await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
    await page.getByRole('button', { name: 'الموظفات', exact: true }).click();
    await page.getByRole('button').filter({ hasText: 'حساب اختبار' }).last().click();
    const modal = page.getByRole('dialog', { name: 'بيانات حساب اختبار' });
    await expect(modal.getByRole('region', { name: 'مستوى الموظفة' })).toContainText('85 نجمة تقدم');
    await expect(modal.getByRole('progressbar', { name: 'تقدم مستوى الموظفة' })).toHaveAttribute('aria-valuenow', '35');
    await expect(modal.getByRole('region', { name: 'إنجازات الموظفة' })).toContainText('مكتسب');
    const collection = modal.getByRole('region', { name: 'مجموعة أفاتارات الموظفة' });
    await expect(collection).toContainText('125 عملة');
    await expect(collection).toContainText('أفاتار مقتنى');
    await collection.getByRole('button', { name: 'استخدام الأفاتار', exact: true }).click();
    await expect(collection.getByRole('status')).toHaveText('تم تحديث الأفاتار.');
    await modal.getByRole('region', { name: 'مستوى الموظفة' }).scrollIntoViewIfNeeded();
    await modal.screenshot({ path: test.info().outputPath(`employee-summary-${width}.png`) });
    expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(service.unexpected).toEqual([]);
  });
}

test('bronze may collect coins and use owned avatars while purchases are locked', async ({ page }) => {
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, silverAt: 8, goldAt: 11, competition: false, balanceGrowth: false }, baseline: {}, baselineDay: null,
    store: { wallet: { earned: 1000, spent: 0, available: 1000 }, equipped: {}, selectedVariant: null, collections: [{ id: 'c', name: 'اختبار شراء', price: 300, enabled: true, variants: [{ id: 'v', name: 'شكل جديد', imagePath: null, enabled: true, ownerId: null }] }] },
  } }));
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  await page.getByRole('button', { name: /اختبار شراء/ }).click();
  await expect(page.getByRole('button', { name: 'للفضية فأعلى', exact: true })).toBeDisabled();
  expect(service.unexpected).toEqual([]);
});
