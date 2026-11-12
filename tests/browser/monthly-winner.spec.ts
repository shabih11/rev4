import { test, expect, mockService, login, employee } from './fixtures.js';

test('previous month crown appears beside the name on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account, { ...employee, id: 'second', name: 'موظفة ثانية' }], notes: [], hours: {}, disabledEmployeeIds: [],
    reviews: [{ id: 'second-review', branch: 'جاليري', rating: '5', date: '04-11-2026', time: '10:00', linkedEmployeeIds: ['second'] }, { id: 'november', branch: 'جاليري', rating: '5', date: '04-11-2026', time: '10:00', linkedEmployeeIds: [employee.id] }, { id: 'october', branch: 'جاليري', rating: '5', date: '31-10-2026', time: '10:00', linkedEmployeeIds: [employee.id] }],
  } }));
  await login(page);
  const crown = page.getByRole('img', { name: 'المركز الأول في الشهر السابق', exact: true });
  await expect(crown.first()).toBeVisible();
  await expect(crown.first().locator('xpath=ancestor::*[contains(@class, "employee-identity")][last()]')).toContainText(service.account.name);
  await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
  await expect(page.locator('.crystal-standing-avatar img').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('.crystal-standing-avatar img').first()).toHaveCSS('object-fit', 'contain');
  await page.getByRole('button', { name: 'الموظفات', exact: true }).click();
  const identity = page.locator('.employee-list-identity').first();
  await expect(page.locator('.employee-card-avatar').getByRole('img', { name: 'المركز الأول في الشهر السابق', exact: true })).toBeVisible();
  await expect(page.locator('.employee-card-avatar .employee-level-star')).toHaveCount(1);
  await expect(page.locator('.employee-identity-person .employee-level-star')).toHaveCount(0);
  await identity.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/rev4-card-layout.png' });
});
