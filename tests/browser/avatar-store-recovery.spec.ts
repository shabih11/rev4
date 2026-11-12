import { test, expect, mockService, login } from './fixtures.js';

test('temporary feature failure retries instead of caching a disabled avatar store', async ({ page }) => {
  const service = await mockService(page, { role: 'employee' });
  let reads = 0;
  await page.route('**/rpc/get_employee_features', route => {
    if (++reads === 1) return route.fulfill({ status: 503, json: { message: 'temporary feature failure' } });
    return route.fulfill({ json: { settings: { avatars: true, tiers: false, missions: false }, baseline: {}, baselineDay: null,
      store: { collections: [], equipped: {}, selectedVariant: null, wallet: { earned: 630, spent: 0, available: 630 } } } });
  });
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  await expect(page.getByText('متجر الأفتارات غير متاح حاليًا.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.avatar-shop')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('.avatar-shop header')).toContainText('630');
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(service.unexpected).toEqual([]);
});

test('intentionally disabled avatar store remains disabled', async ({ page }) => {
  await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: false, tiers: false, missions: false }, baseline: {}, baselineDay: null,
  } }));
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  await expect(page.getByText('متجر الأفتارات غير متاح حاليًا.', { exact: true })).toBeVisible();
});
