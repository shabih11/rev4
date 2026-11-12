import { test, expect, mockService, login, employee } from './fixtures.js';

test('avatar settings appear immediately below their trigger and milestone approvals show coin-only amounts', async ({ page }) => {
  const service = await mockService(page);
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, branchBadges: true, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { collections: [], equipped: {}, wallet: null },
  } }));
  const approvals: unknown[] = [];
  await page.route('**/rpc/approve_branch_badge_reward', route => {
    approvals.push(route.request().postDataJSON());
    return route.fulfill({ json: null });
  });
  await login(page);
  await page.getByRole('button', { name: 'متجر الأفتارات', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'الإعدادات', exact: true });
  await trigger.click();
  const panel = page.getByRole('region', { name: 'إعدادات متجر الأفتارات', exact: true });
  await expect(panel).toBeVisible();
  const triggerBox = await trigger.boundingBox(), panelBox = await panel.boundingBox();
  expect(panelBox!.y - (triggerBox!.y + triggerBox!.height)).toBeLessThan(60);
  await panel.screenshot({ path: test.info().outputPath('settings-near-button.png') });
  await trigger.click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'الميزات الإضافية', exact: true }).click();
  const form = page.getByRole('heading', { name: 'اعتماد مكافآت شارات الفروع' }).locator('..');
  await form.getByRole('radio', { name: 'جاليري', exact: true }).check();
  await expect(form.getByRole('status').first()).toContainText('10,000');
  await expect(form.getByRole('button', { name: 'اعتماد مكافأة الشارة' })).toBeDisabled();
  await expect(form.getByRole('checkbox', { name: employee.name, exact: true })).not.toBeChecked();
  await form.getByRole('combobox').selectOption('milestone500');
  await expect(form.getByRole('status').first()).toContainText('1,000');
  await form.getByRole('checkbox', { name: employee.name, exact: true }).check();
  await expect(form.getByRole('combobox').locator('option')).toHaveCount(2);
  await form.getByRole('button', { name: 'اعتماد مكافأة الشارة' }).click();
  await expect.poll(() => approvals.length).toBe(1);
  expect(approvals[0]).toEqual({ requested_branch: 'جاليري', requested_badge: 'milestone500', requested_employee_ids: [employee.id] });
  await expect(form).toContainText('اعتُمدت المكافأة للموظفات المحددات فقط.');
  await form.getByRole('combobox').selectOption('milestone');
  await expect(form.getByRole('checkbox', { name: employee.name, exact: true })).not.toBeChecked();
  await form.getByRole('checkbox', { name: employee.name, exact: true }).check();
  await form.getByRole('button', { name: 'اعتماد مكافأة الشارة' }).click();
  await expect.poll(() => approvals.length).toBe(2);
  expect(approvals[1]).toEqual({ requested_branch: 'جاليري', requested_badge: 'milestone', requested_employee_ids: [employee.id] });
  expect(service.unexpected).toEqual([]);
});
