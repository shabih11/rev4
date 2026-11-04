import { test, expect, login, mockService, employee } from './fixtures.js';

for (const role of ['admin', 'manager', 'employee'] as const) {
  test(`verified ${role} login reaches its dashboard and logout clears access`, async ({ page }) => {
    const service = await mockService(page, { role });
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page.getByRole('button', { name: /خروج/ }).first()).toBeVisible();
    await page.getByRole('button', { name: /خروج/ }).first().click();
    await expect(page).toHaveURL(/#\/login$/);
    await page.goto('./#/dashboard');
    await expect(page).toHaveURL(/#\/login$/);
    expect(service.unexpected).toEqual([]);
  });
}

test('invalid credentials stay on login with an actionable error', async ({ page }) => {
  const service = await mockService(page, { invalidPassword: true });
  await login(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/#\/login$/);
  expect(service.unexpected).toEqual([]);
});

test('valid authentication without membership cannot enter the dashboard', async ({ page }) => {
  const service = await mockService(page, { denied: true });
  await login(page);
  await expect(page.getByRole('alert')).toContainText('غير مخوّل');
  await expect(page).toHaveURL(/#\/login$/);
  expect(service.writes).toHaveLength(0);
  expect(service.unexpected).toEqual([]);
});

async function prepareShift(page: Parameters<typeof login>[0]) {
  await login(page);
  await expect(page.getByRole('heading', { name: 'تقويم شفتات الفرع' })).toBeVisible();
  await page.getByRole('button', { name: /^4 —$/ }).click();
  await page.getByRole('button', { name: 'إضافة الشفت الأول', exact: true }).click();
  await page.getByRole('button', { name: 'إضافة الشفت', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('اختاري موظفة');
  await page.getByRole('checkbox', { name: employee.name, exact: true }).check();
}

test('a shift is saved once, displayed after reload, and can be edited', async ({ page }) => {
  const service = await mockService(page);
  await prepareShift(page);
  await page.getByRole('button', { name: 'إضافة الشفت', exact: true }).click();
  await expect.poll(() => service.writes.length).toBe(1);
  expect(service.writes[0].source).toBe('timeline');
  expect(service.writes[0].changes[0].after).toMatchObject({ type: 'shift', branch: 'جاليري', employees: [{ id: employee.id, name: employee.name }] });
  await expect(page.getByRole('button', { name: 'تعديل موظفات الشفت' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^4 شفت 1$/ }).click();
  await page.getByRole('button', { name: 'تعديل موظفات الشفت' }).click();
  await expect(page.getByRole('checkbox', { name: employee.name, exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'موظفة اختبار ثانية', exact: true }).check();
  await page.getByRole('button', { name: 'حفظ الموظفات', exact: true }).click();
  await expect.poll(() => service.writes.length).toBe(2);
  expect(service.writes[1].changes[0].before?.employees).toEqual([{ id: employee.id, name: employee.name }]);
  expect(service.writes[1].changes[0].after?.employees).toHaveLength(2);
  await expect(page.getByRole('button', { name: 'تعديل موظفات الشفت' })).toBeVisible();
  expect(service.unexpected).toEqual([]);
});

test('a conflicting save reports failure and never displays an unsaved shift', async ({ page }) => {
  const service = await mockService(page, { writeFailure: true });
  await prepareShift(page);
  await page.getByRole('button', { name: 'إضافة الشفت', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('تغيرت البيانات');
  await expect(page.getByRole('button', { name: 'تعديل موظفات الشفت' })).toHaveCount(0);
  expect(service.timeline).toHaveLength(0);
  expect(service.writes).toHaveLength(1);
  expect(service.unexpected).toEqual([]);
});
