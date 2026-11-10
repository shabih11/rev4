import { test, expect, mockService, login, employee } from './fixtures.js';

test('admin simulates employee and manager, blocks writes and presence, and returns without logout', async ({ page }) => {
  const service = await mockService(page);
  const manager = { ...employee, id: 'test-manager-target', role: 'manager', name: 'مديرة اختبار' };
  let target = employee, activeId = '', counter = 0;
  const reads: string[] = [], control: string[] = [];
  await page.route(/\/rest\/v1\/rpc\/[^/]*simulation[^/?]*(\?.*)?$/, async route => {
    const request = route.request(), name = new URL(request.url()).pathname.split('/').pop();
    const args = request.postDataJSON() || {};
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
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
  await login(page);
  const bar = page.getByRole('complementary', { name: 'محاكاة الحسابات' });
  await bar.getByLabel('عرض كما تظهر للحساب').selectOption(employee.id);
  await bar.getByRole('button', { name: 'بدء المحاكاة', exact: true }).click();
  await expect(bar).toContainText('محاكاة للقراءة فقط: موظفة اختبار');
  await expect(bar).toContainText('المسؤول الأصلي: حساب اختبار');
  await expect.poll(() => reads.includes('get_read_model')).toBe(true);
  // Exercise the same shared client used by every mutation component.
  const write = await page.evaluate(async () => {
    const modulePath = '/rev4/src/lib/supabase.ts';
    const { supabase } = await import(/* @vite-ignore */ modulePath);
    const { error } = await supabase.rpc('equip_gem', { requested: 'ruby' });
    return error?.code;
  });
  expect(write).toBe('42501');
  await bar.getByLabel('التبديل إلى حساب آخر').selectOption(manager.id);
  await bar.getByRole('button', { name: 'تبديل', exact: true }).click();
  await expect(bar).toContainText('محاكاة للقراءة فقط: مديرة اختبار');
  await expect(bar).toContainText('المسؤول الأصلي: حساب اختبار');
  await bar.getByRole('button', { name: 'العودة إلى المسؤول', exact: true }).click();
  await expect(bar.getByRole('button', { name: 'بدء المحاكاة' })).toBeVisible();
  await bar.getByLabel('عرض كما تظهر للحساب').selectOption(employee.id);
  await bar.getByRole('button', { name: 'بدء المحاكاة', exact: true }).click();
  await expect(bar).toContainText('محاكاة للقراءة فقط');
  await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
  await expect(bar.getByRole('button', { name: 'بدء المحاكاة' })).toBeVisible();
  expect(control).toEqual(['start', 'start', 'stop', 'start', 'stop']);
  expect(reads).not.toContain('record_employee_page_presence');
  expect(service.writes).toEqual([]);
  expect(service.unexpected).toEqual([]);
});
