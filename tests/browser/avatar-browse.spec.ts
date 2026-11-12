import { test, expect, mockService, login } from './fixtures.js';

for (const width of [390, 1280]) test(`store puts balance first and browses across collections at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { wallet: { available: 630, earned: 630, spent: 0 }, equipped: {}, selectedVariant: null, collections: [
      { id: 'one', name: 'الحذاء الأول', price: 349, enabled: true, variants: [
        { id: 'a', name: 'النموذج الأول', price: 349, enabled: true, imagePath: 'bundled/saudi-modern-abaya-v1/avatar-03-a.webp' },
        { id: 'b', name: 'النموذج الثاني', price: 399, enabled: true, imagePath: 'bundled/saudi-dark-v1/avatar-08-a.webp' },
      ] },
      { id: 'two', name: 'الحذاء الثاني', price: 499, enabled: true, variants: [
        { id: 'c', name: 'النموذج الثالث', enabled: true, imagePath: 'bundled/saudi-modern-abaya-v1/avatar-03-a.webp' },
      ] },
    ] },
  } }));
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  const shop = page.locator('.avatar-shop');
  await expect(shop.getByRole('region', { name: 'امتيازات أفتارك' })).toHaveCount(0);
  await expect(shop.getByRole('button', { name: 'استخدام الأفاتار الافتراضي' })).toHaveCount(0);
  await expect(shop.locator('header img')).toHaveCount(0);
  await expect(shop.locator('header')).toContainText('630');
  await shop.screenshot({ path: test.info().outputPath('store-before-preview.png') });
  await expect(page.getByRole('button', { name: 'تصفح الأفتارات مكبّرة' })).toHaveCount(0);
  await page.getByRole('button', { name: /الحذاء الأول/ }).click();
  await page.getByRole('button', { name: 'عرض النموذج الأول مكبرًا' }).click();
  const preview = page.getByRole('dialog');
  await expect(preview.getByRole('heading')).toHaveText('النموذج الأول');
  await expect(preview.getByLabel('سعر النموذج')).toContainText('350');
  await preview.locator('.avatar-preview-viewport').dblclick();
  expect(await preview.locator('.avatar-preview-image').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(2.5);
  await preview.getByRole('button', { name: 'الأفتار التالي', exact: true }).click();
  await expect(preview.getByRole('heading')).toHaveText('النموذج الثاني');
  await expect(preview.getByLabel('سعر النموذج')).toContainText('400');
  expect(await preview.locator('.avatar-preview-image').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(2.5);
  await preview.getByRole('button', { name: 'الأفتار التالي', exact: true }).click();
  await expect(preview).toContainText('الحذاء الثاني');
  await expect(preview.getByRole('heading')).toHaveText('النموذج الثالث');
  await expect(preview.getByLabel('سعر النموذج')).toContainText('500');
  await preview.screenshot({ path: test.info().outputPath('browse-closeup.png') });
  await preview.getByRole('button', { name: 'الأفتار السابق', exact: true }).click();
  await expect(preview.getByRole('heading')).toHaveText('النموذج الثاني');
  await preview.getByRole('button', { name: 'الأفتار التالي', exact: true }).click();
  await preview.getByRole('button', { name: 'الانتقال', exact: true }).click();
  await expect(preview).toHaveCount(0);
  const card = page.locator('#avatar-item-c');
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  await expect(page.getByRole('button', { name: /الحذاء الثاني/ })).toHaveAttribute('aria-expanded', 'true');
  expect(service.unexpected).toEqual([]);
});
