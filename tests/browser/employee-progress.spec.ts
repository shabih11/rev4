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
      generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account, { ...employee, id: 'test-partner', name: 'فاطمة' }], notes: [], hours: {}, disabledEmployeeIds: [],
      reviews: ['10', '11'].flatMap(month => Array.from({ length: 10 }, (_, i) => ({ id: `${month}-${i}`, branch: 'جاليري', rating: '5', date: `03-${month}-2026`, time: '10:00', linkedEmployeeIds: month === '11' && i === 9 ? [employee.id, 'test-partner'] : [employee.id] }))),
    } }));
    await page.route('**/storage/v1/object/sign/avatar-store/*', route => route.fulfill({ json: { signedURL: '/object/sign/avatar-store/owned.webp?token=test' } }));
    await page.route('**/object/sign/avatar-store/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160"><rect x="30" y="10" width="40" height="140" rx="20" fill="#2563eb"/></svg>' }));
    await page.route('**/rpc/equip_avatar', route => {
      expect(route.request().postDataJSON()).toEqual({ variant: 'owned-avatar' });
      return route.fulfill({ json: null });
    });
    await login(page);
    await expect(page.getByRole('region', { name: 'نتائجي' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'رحلة الإنجاز' }).getByRole('progressbar')).toBeVisible();
    await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
    await page.getByRole('button', { name: 'الموظفات', exact: true }).click();
    await page.getByRole('button').filter({ hasText: 'حساب اختبار' }).last().click();
    const modal = page.getByRole('dialog', { name: 'بيانات حساب اختبار' });
    await expect(modal.getByRole('img', { name: 'المستوى 3', exact: true })).toBeVisible();
    await expect(modal.getByRole('progressbar')).toHaveCount(0);
    const badges = modal.getByRole('region', { name: 'شارات الموظفة' });
    const harvest = badges.getByRole('button', { name: 'حصاد الشهر' });
    await expect(badges).not.toContainText('تفاصيل المهمة');
    await expect(harvest.locator('img')).toHaveAttribute('src', /\/grades\//);
    await expect.poll(() => harvest.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await harvest.click();
    await expect(harvest).toHaveAttribute('aria-expanded', 'true');
    await expect(badges.getByText(/3 نوفمبر.*مع فاطمة/)).toBeVisible();
    await harvest.click();
    await expect(harvest).toHaveAttribute('aria-expanded', 'false');
    await page.clock.setFixedTime(new Date('2026-12-01T12:00:00+03:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(harvest.locator('img')).toHaveAttribute('src', /\/grades\//);
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+03:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const collection = modal.getByRole('region', { name: 'مجموعة أفاتارات الموظفة' });
    await expect(collection).not.toContainText('أفاتاراتي');
    await expect(collection).toContainText('130 عملة');
    await expect(collection.getByRole('img', { name: 'حساب اختبار' })).toBeVisible();
    await collection.getByRole('button', { name: 'الأفاتار التالي' }).click();
    await expect(collection.getByRole('img', { name: 'أفاتار مقتنى' })).toBeVisible();
    await collection.getByRole('button', { name: 'استخدام الأفاتار', exact: true }).click();
    await expect(collection.getByRole('status')).toHaveText('تم تحديث الأفاتار.');
    await expect(collection.getByRole('button', { name: 'استخدام الأفاتار' })).toHaveCount(0);
    await badges.scrollIntoViewIfNeeded();
    await modal.screenshot({ path: test.info().outputPath(`employee-summary-${width}.png`) });
    expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(service.unexpected).toEqual([]);
  });
}

test('bronze may collect coins and use owned avatars while purchases are locked', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, silverAt: 8, goldAt: 11, competition: false, balanceGrowth: false }, baseline: {}, baselineDay: null,
    store: { wallet: { earned: 1000, spent: 0, available: 1000 }, equipped: {}, selectedVariant: null, collections: [{ id: 'c', name: 'اختبار شراء', price: 300, enabled: true, variants: [{ id: 'v', name: 'شكل جديد', imagePath: null, enabled: true, ownerId: null }] }] },
  } }));
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  const heading = page.locator('.avatar-shop header');
  await expect(heading).toContainText('1,000');
  await expect(page.getByText('رصيد المتجر', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /اختبار شراء/ }).click();
  await expect(page.getByRole('button', { name: /اقتناء بـ/ })).toBeEnabled();
  expect(service.unexpected).toEqual([]);
});

test('sea mission appears before opening and the gold upgrade uses the fixed burqa price', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T00:01:00+03:00'));
  const service = await mockService(page, { role: 'employee' });
  let requested = false;
  await page.route('**/rest/v1/app_state?*', route => route.fulfill({ json: { version: requested ? 2 : 1 } }));
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, silverAt: 8, goldAt: 11, competition: false, balanceGrowth: false }, baseline: {}, baselineDay: null,
    store: { wallet: { earned: 11000, spent: 699, available: 10301 }, equipped: {}, selectedVariant: null, collections: [{
      id: 'owned-c', name: 'موديل اختبار', price: 349, enabled: true,
      variants: [{ id: 'owned-v', name: 'أفاتار مقتنى', imagePath: null, enabled: true, ownerId: employee.id, price: 399, paidPrice: 699, goldUpgrade: requested ? 'pending' : null }],
    }] },
  } }));
  await page.route('**/rpc/purchase_gold_avatar', route => {
    expect(route.request().postDataJSON()).toEqual({ variant: 'owned-v', expected_price: 9500 });
    requested = true;
    return route.fulfill({ json: null });
  });
  await login(page);
  const sea = page.getByRole('region', { name: 'مهمة البحر اليوم' });
  await expect(sea).toContainText('التقدم 0 / 2');
  await expect(sea).toContainText('بانتظار اكتمال الهدف');
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  await page.getByRole('button', { name: /موديل اختبار/ }).click();
  await expect(page.getByRole('button', { name: /شراء برقع أم خماس/ })).toHaveCount(0);
  expect(requested).toBe(false);
  expect(service.unexpected).toEqual([]);
});
