import { test, expect, mockService, login, employee } from './fixtures.js';

test('exclusive models show buyers and checkout requires invoice confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await mockService(page, { role: 'employee' });
  let purchases = 0;
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
    reviews: Array.from({ length: 0 }, (_, i) => ({ id: `r-${i}`, branch: 'جاليري', rating: '5', date: '03-11-2026', time: '10:00', linkedEmployeeIds: [employee.id] })),
  } }));
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { wallet: { earned: 20000, spent: 0, available: 20000 }, equipped: {}, selectedVariant: null, collections: [{
      id: 'lv', name: 'LV Olympia', price: 9500, enabled: true, variants: [
        { id: 'sold', name: 'ليلة فضية', imagePath: null, price: 10049, enabled: true, ownerId: 'partner', ownerName: 'فاطمة' },
        { id: 'free', name: 'أفق', imagePath: 'bundled/saudi-modern-abaya-v1/avatar-03-a.webp', price: 10199, enabled: true, ownerId: null },
      ],
    }] },
  } }));
  await page.route('**/rpc/purchase_avatar', route => {
    expect(route.request().postDataJSON()).toEqual({ variant: 'free', expected_price: 10199 });
    purchases++;
    return route.fulfill({ json: null });
  });
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  const group = page.getByRole('button', { name: /LV Olympia/ });
  await expect(group).toContainText('فاطمة');
  await expect(group).toContainText('10,049');
  await expect(group).toContainText('يبدأ من');
  await expect(group).not.toContainText('9,500');
  await group.click();
  const artwork = page.getByRole('button', { name: 'عرض أفق مكبرًا' });
  await artwork.screenshot({ path: test.info().outputPath('avatar-platform.png') });
  await expect(page.getByRole('heading', { name: /^أفق/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /اقتناء بـ/ })).toHaveCSS('background-color', 'rgb(15, 118, 110)');
  await artwork.click();
  const preview = page.getByRole('dialog', { name: 'أفق', exact: true });
  await expect(preview).toBeVisible();
  const bounds = await preview.boundingBox();
  expect(bounds?.width).toBe(390);
  expect(bounds?.height).toBe(844);
  await preview.screenshot({ path: test.info().outputPath('avatar-preview.png') });
  await expect(preview.getByRole('button')).toHaveCount(4);
  await expect(preview.locator('img')).toHaveCSS('scale', '0.85 1');
  await expect(preview.locator('.avatar-preview-image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 300, id: 1 }, { x: 220, y: 500, id: 2 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 170, y: 250, id: 1 }, { x: 220, y: 550, id: 2 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(preview).toBeVisible();
  expect(await preview.locator('.avatar-preview-image').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThan(1);
  await preview.getByRole('button', { name: 'إظهار الأفتار كاملًا' }).click();
  await expect(preview.locator('.avatar-preview-image')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await preview.getByRole('button', { name: 'تكبير الصورة', exact: true }).click();
  await expect(preview.locator('output')).toHaveText('150%');
  const viewport = preview.locator('.avatar-preview-viewport');
  await viewport.hover();
  await page.mouse.wheel(0, -300);
  await expect.poll(() => preview.locator('.avatar-preview-image').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThan(1.5);
  const area = (await viewport.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width, area.y + area.height, { steps: 5 });
  await page.mouse.up();
  const position = await viewport.evaluate(el => {
    const matrix = new DOMMatrix(getComputedStyle(el.querySelector('.avatar-preview-image')!).transform);
    return { zoom: matrix.a, x: matrix.e, y: matrix.f, width: el.clientWidth, height: el.clientHeight };
  });
  expect(Math.abs(position.x)).toBeLessThanOrEqual(position.width * (position.zoom - 1) / 2 + 1);
  expect(Math.abs(position.y)).toBeLessThanOrEqual(position.height * (position.zoom - 1) / 2 + 1);
  await preview.getByRole('button', { name: 'إظهار الأفتار كاملًا' }).click();
  const resetBounds = (await preview.getByRole('button', { name: 'إظهار الأفتار كاملًا' }).boundingBox())!;
  expect(resetBounds.y + resetBounds.height).toBeLessThanOrEqual(844);
  await preview.screenshot({ path: '/tmp/rev4-avatar-preview-fit.png' });
  await preview.getByRole('button', { name: 'إغلاق الصورة' }).click();
  await expect(preview).toHaveCount(0);
  await expect(artwork).toBeFocused();
  await artwork.click();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 300, id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 440, id: 1 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(preview).toHaveCount(0);
  await expect(artwork).toBeFocused();
  await artwork.click();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'فاطمة', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /اقتناء بـ/ }).click();
  const invoice = page.getByRole('dialog', { name: 'فاتورة الطلب' });
  await expect(invoice).toContainText('حساب اختبار');
  await expect(invoice).toContainText('10,199');
  await expect(invoice).toContainText('9,801');
  expect(purchases).toBe(0);
  await invoice.getByRole('button', { name: 'إلغاء', exact: true }).click();
  expect(purchases).toBe(0);
  await page.getByRole('button', { name: /اقتناء بـ/ }).click();
  await invoice.getByRole('button', { name: 'تأكيد الاقتناء' }).click();
  const receipt = page.getByRole('dialog', { name: 'تم تأكيد الطلب' });
  await expect(receipt).toContainText('اكتمل الدفع بالعملات');
  expect(purchases).toBe(1);
  await receipt.screenshot({ path: test.info().outputPath('invoice-mobile.png') });
  expect(await receipt.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await receipt.getByRole('button', { name: 'العودة للمتجر' }).click();
  await expect(receipt).toHaveCount(0);
  expect(service.unexpected).toEqual([]);
});

for (const goldEntitled of [false, true]) test(`ordinary invoice has no paid gold add-on; privilege=${goldEntitled}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true }, baseline: {}, baselineDay: null,
    store: { goldEntitled, wallet: { earned: 20000, spent: 0, available: 20000 }, equipped: {}, selectedVariant: null, collections: [{
      id: 'nb', name: 'New Balance 1906R', price: 1949, enabled: true, variants: [
        { id: 'free', name: 'أنامل', imagePath: 'bundled/saudi-dark-v1/avatar-08-a.webp', price: 2049, enabled: true, ownerId: null },
      ],
    }] },
  } }));
  let purchases = 0;
  await page.route('**/rpc/purchase_avatar', route => {
    expect(route.request().postDataJSON()).toEqual({ variant: 'free', expected_price: 2049 });
    purchases++; return route.fulfill({ json: null });
  });
  await page.route('**/rpc/purchase_gold_avatar', () => { throw new Error('Standalone gold purchase is forbidden'); });
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  await page.getByRole('button', { name: /New Balance 1906R/ }).click();
  await page.getByRole('button', { name: /اقتناء بـ/ }).click();
  const invoice = page.getByRole('dialog', { name: 'فاتورة الطلب' });
  await expect(invoice.getByRole('button', { name: /أم خماس/ })).toHaveCount(0);
  await expect(invoice).toContainText('2,049');
  await expect(invoice).toContainText('17,951');
  expect(await invoice.locator('img').evaluate(el => getComputedStyle(el).scale)).toBe('0.85 1');
  await invoice.screenshot({ path: test.info().outputPath('ordinary-invoice.png') });
  await invoice.getByRole('button', { name: 'تأكيد الاقتناء' }).click();
  await expect(page.getByRole('dialog', { name: 'تم تأكيد الطلب' })).toContainText(goldEntitled ? 'طلب تحويل' : 'اكتمل الدفع بالعملات');
  expect(purchases).toBe(1);
});
