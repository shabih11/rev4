import { test, expect, mockService, login } from './fixtures.js';
import type { Page } from '@playwright/test';

async function openStore(page: Page, initial = 1949, fail = false, collectionName = 'Test Shoes') {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockService(page);
  let base = initial, modelPrice = initial, version = 1;
  const changes: { step: number; expected_price: number; requested_variant: string | null }[] = [];
  await page.route('**/rest/v1/app_state*', route => route.fulfill({ json: { version } }));
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true }, baseline: {}, baselineDay: null,
    store: { collections: [{ id: 'shoe', name: collectionName, price: base, enabled: base > 0, variants: [
      { id: 'style', name: 'نموذج اختبار', imagePath: 'bundled/saudi-dark-v1/avatar-08-a.webp', price: modelPrice, enabled: modelPrice > 0, ownerId: null },
    ] }], wallet: null, equipped: {} },
  } }));
  await page.route('**/rpc/adjust_avatar_price', route => {
    const body = route.request().postDataJSON();
    changes.push(body);
    if (fail) return route.fulfill({ status: 409, json: { code: 'PT409', message: 'write-conflict' } });
    expect(body.expected_price).toBe(body.requested_variant ? modelPrice : base);
    const minimum = collectionName === 'LV Olympia' ? 12499 : 0;
    const maximum = minimum ? 1000000 : 4000;
    const next = body.step === 0 || (body.step < 0 && body.expected_price <= minimum) ? 0 : Math.max(minimum, Math.min(maximum, body.expected_price + body.step));
    if (body.requested_variant) modelPrice = next;
    else { modelPrice = next === 0 ? 0 : Math.max(0, Math.min(4000, modelPrice + next - base)); base = next; }
    version++;
    return route.fulfill({ json: null });
  });
  await login(page);
  await page.getByRole('button', { name: 'متجر الأفتارات', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(collectionName) }).first().click();
  const model = page.getByRole('group', { name: 'تعديل سعر النموذج نموذج اختبار', exact: true });
  return { changes, model, shoe: page.getByRole('group', { name: `تعديل سعر الحذاء ${collectionName}`, exact: true }) };
}

test('admin prices remain separate and models use the full white store area', async ({ page }) => {
  const { model, shoe, changes } = await openStore(page);
  await shoe.getByRole('button', { name: /زيادة/ }).click();
  await expect(shoe).toContainText('2,000');
  await expect(model).toContainText('2,000');
  await model.getByRole('button', { name: /زيادة/ }).click();
  await expect(model).toContainText('2,050');
  await shoe.getByRole('button', { name: /خفض/ }).click();
  await expect(model).toContainText('2,000');
  const art = page.locator('#admin-avatar-group-shoe .shop-art-stage');
  await expect(art).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(art.locator('img')).toHaveCSS('object-fit', 'contain');
  await expect(art.locator('img')).toHaveCSS('scale', '0.85 1');
  await expect(page.getByText('نسخة واحدة متاحة', { exact: true })).toHaveCount(0);
  await expect(page.locator('#admin-avatar-group-shoe h4')).toHaveText('نموذج اختبار');
  await expect(page.getByText(/أشكال متاحة|استكشاف الأشكال|إخفاء الأشكال/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /إخفاء نموذج/ })).toHaveCount(0);
  await expect(page.locator('.avatar-shop').first()).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.workspace-panel')).toHaveCount(0);
  const main = page.locator('main');
  await expect(main).toHaveCSS('padding-right', '0px');
  await expect(main).toHaveCSS('padding-left', '0px');
  expect(changes.map(change => change.step)).toEqual([50, 50, -50]);
  await page.locator('#admin-avatar-group-shoe').screenshot({ path: test.info().outputPath('price-model.png') });
});

test('holding changes 500 per second, clamps at zero and 4000, and stops on release', async ({ page }) => {
  const { model, changes } = await openStore(page, 449);
  async function hold(name: RegExp) {
    const button = model.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  }
  await hold(/خفض/);
  await expect(model.getByRole('button', { name: /خفض/ })).toBeDisabled();
  await page.mouse.up();
  await expect(page.locator('#admin-avatar-group-shoe')).toContainText('غير معروض للبيع');
  expect(changes.map(change => change.step)).toEqual([-500]);
  await hold(/زيادة/);
  await expect(model.locator('bdi').first()).toHaveText('500');
  await page.mouse.up();
  const count = changes.length;
  await page.waitForTimeout(1200);
  expect(changes).toHaveLength(count);
  await hold(/زيادة/);
  await expect(model.getByRole('button', { name: /زيادة/ })).toBeDisabled({ timeout: 10000 });
  await page.mouse.up();
  await expect(model).toContainText('4,000');
  expect(changes.every(change => Math.abs(change.step) === 500)).toBe(true);
});

test('a stale price stops holding and displays a save error', async ({ page }) => {
  const { model, changes } = await openStore(page, 449, true);
  await model.getByRole('button', { name: /زيادة/ }).click();
  await expect(page.getByRole('alert')).toContainText('تعذر حفظ السعر');
  await expect(model).toContainText('450');
  expect(changes).toHaveLength(1);
});

 test('premium avatar restores at 12499 and can increase above the ordinary store limit', async ({ page }) => {
  const { model, changes } = await openStore(page, 12499, false, 'LV Olympia');
  await expect(model.getByRole('button', { name: /زيادة/ })).toBeEnabled();
  await model.getByRole('button', { name: /خفض/ }).click();
  await expect(model.getByRole('button', { name: /خفض/ })).toBeDisabled();
  await model.getByRole('button', { name: /زيادة/ }).click();
  await expect(model).toContainText('12,500');
  await model.getByRole('button', { name: /زيادة/ }).click();
  await expect(model).toContainText('12,550');
  expect(changes.map(change => change.expected_price)).toEqual([12499, 0, 12499]);
});

test.describe('mobile price shortcuts', () => {
  test.use({ hasTouch: true });
for (const premium of [false, true]) test(`direct price shortcuts update model and collection on mobile (premium=${premium})`, async ({ page }) => {
  const initial = premium ? 20000 : 1949;
  const { model, shoe, changes } = await openStore(page, initial, false, premium ? 'LV Olympia' : 'Test Shoes');
  await model.getByRole('button', { name: /إضافة 500/ }).tap();
  await expect(model).toContainText((Math.round((initial + 500) / 10) * 10).toLocaleString('en-US'));
  await model.getByRole('button', { name: /تصفير/ }).tap();
  await expect(model.getByRole('button', { name: /تصفير/ })).toBeDisabled();
  await expect(page.locator('#admin-avatar-group-shoe')).toContainText('غير معروض للبيع');
  await shoe.getByRole('button', { name: /تصفير/ }).tap();
  await expect(shoe.getByRole('button', { name: /تصفير/ })).toBeDisabled();
  await shoe.getByRole('button', { name: /إضافة 500/ }).tap();
  await expect(shoe).toContainText(premium ? '12,500' : '500');
  expect(changes.map(({ step }) => step)).toEqual([500, 0, 0, 500]);
  await page.screenshot({ path: test.info().outputPath('price-shortcuts-mobile.png'), fullPage: true });
});

});
