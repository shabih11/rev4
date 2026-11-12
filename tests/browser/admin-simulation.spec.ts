import { test, expect, mockService, login, employee } from './fixtures.js';

test('admin simulates employee and manager, blocks writes and presence, and returns without logout', async ({ page }) => {
  const service = await mockService(page);
  const manager = { ...employee, id: 'test-manager-target', role: 'manager', name: 'مديرة اختبار' };
  let enabled = false;
  let target = employee, activeId = '', counter = 0;
  const reads: string[] = [], control: string[] = [];
  await page.route(/\/rest\/v1\/rpc\/[^/]*simulation[^/?]*(\?.*)?$/, async route => {
    const request = route.request(), name = new URL(request.url()).pathname.split('/').pop();
    const args = request.postDataJSON() || {};
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (name === 'get_simulation_enabled') return reply(enabled);
    if (name === 'set_simulation_enabled') { enabled = args.new_enabled; return reply(null); }
    if (name === 'simulation_targets') return reply([employee, manager]);
    if (name === 'start_simulation') {
      target = args.target_profile === manager.id ? manager : employee;
      activeId = `test-simulation-${++counter}`; control.push('start');
      return reply({ id: activeId, target });
    }
    if (name === 'stop_simulation') { control.push('stop'); return reply(null); }
    if (name === 'simulation_read') {
      expect(args.simulation_id).toBe(activeId); reads.push(args.operation);
      if (args.operation === 'get_my_account') return reply({ ...target, mustSetUsername: false, mustChangePassword: false });
      if (args.operation === 'get_read_model') return reply({ generatedAt: '2026-11-04T12:00:00+03:00', directory: [target], reviews: [], notes: [], hours: {} });
      if (args.operation === 'get_employee_features') return reply(null);
      if (args.operation === 'app_state') return reply([{ version: 1 }]);
      if (args.operation === 'sea_mission_completions') return reply([]);
      if (args.operation === 'read_rows') return reply(args.args.source === 'branches' ? [{ id: 'جاليري', name: 'جاليري', start: '16:00', end: '07:00', nextDayTime: '07:00' }] : []);
      if (args.operation === 'get_employee_last_presence' || args.operation === 'get_branch_last_presence') return reply({});
      if (args.operation === 'management_contact') return reply([]);
      return reply({ code: 'TEST_UNMOCKED', message: args.operation }, 500);
    }
    return reply(null, 404);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const bar = page.getByRole('complementary', { name: 'محاكاة الحسابات' });
  const floating = bar.getByRole('button', { name: 'إظهار تفاصيل المحاكاة' });
  await expect(floating).toBeVisible();
  const position = (await floating.boundingBox())!;
  expect(position.x).toBeLessThan(24);
  expect(position.y + position.height).toBeGreaterThan(page.viewportSize()!.height - 24);
  await floating.click();
  const toggle = bar.getByRole('checkbox', { name: 'تفعيل المحاكاة' });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await bar.getByLabel('اختيار حساب للمحاكاة').selectOption(employee.id);
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(bar).toContainText('محاكاة حساب (موظفة اختبار - جاليري)');
  await expect(bar).not.toContainText('المسؤول الأصلي');
  await bar.getByRole('button', { name: 'طي تفاصيل المحاكاة' }).click();
  await expect(floating).toHaveAttribute('aria-expanded', 'false');
  expect((await bar.boundingBox())!.height).toBeLessThan(80);
  await page.screenshot({ path: test.info().outputPath('simulation-collapsed-mobile.png') });
  await floating.click();
  await expect(bar.getByLabel('اختيار حساب للمحاكاة')).toBeVisible();
  await expect.poll(() => reads.includes('get_read_model')).toBe(true);
  // Exercise the same shared client used by every mutation component.
  const write = await page.evaluate(async () => {
    const modulePath = '/rev4/src/lib/supabase.ts';
    const { supabase } = await import(/* @vite-ignore */ modulePath);
    const { error } = await supabase.rpc('equip_gem', { requested: 'ruby' });
    return error?.code;
  });
  expect(write).toBe('42501');
  await bar.getByLabel('اختيار حساب للمحاكاة').selectOption(manager.id);
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(bar).toContainText('محاكاة حساب (مديرة اختبار - جاليري)');
  await page.screenshot({ path: test.info().outputPath('simulation-panel-mobile.png') });
  await bar.getByRole('button', { name: 'إغلاق وضع المحاكاة' }).click();
  await expect(floating).toBeVisible();
  await floating.click();
  await bar.getByLabel('اختيار حساب للمحاكاة').selectOption(employee.id);
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(bar).toContainText('محاكاة حساب');
  await bar.getByRole('button', { name: 'طي تفاصيل المحاكاة' }).click();
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  // The icon remains available after the simulated session ends.
  if (await floating.isVisible()) await floating.click();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await bar.getByRole('button', { name: 'طي تفاصيل المحاكاة' }).click();
  await expect(floating).toBeVisible();
  expect(control).toEqual(['start', 'start', 'stop', 'start', 'stop']);
  expect(reads).not.toContain('record_employee_page_presence');
  expect(service.writes).toEqual([]);
  expect(service.unexpected).toEqual([]);
});
