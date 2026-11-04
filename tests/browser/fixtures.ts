import { test as base, expect, type Page } from '@playwright/test';

type Role = 'admin' | 'manager' | 'employee';
type Row = { id: string; [key: string]: unknown };
export const employee = { id: 'test-employee', name: 'موظفة اختبار', role: 'employee', branch: 'جاليري', email: '',
  points: 0, reviewsCount: 0, imageUrl: '', stats: { positive: 0, negative: 2, complaints: 0, safety: 0 } };
const uid = '00000000-0000-4000-8000-000000000001';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: uid, role: 'authenticated', exp: 4102444800 })}.test-signature`;

export async function mockService(page: Page, { role = 'admin', denied = false, writeFailure = false, invalidPassword = false }: {
  role?: Role; denied?: boolean; writeFailure?: boolean; invalidPassword?: boolean;
} = {}) {
  const account = { ...employee, id: role === 'employee' ? employee.id : `test-${role}`, name: 'حساب اختبار', role,
    mustSetUsername: false, mustChangePassword: false };
  const directory = role === 'employee' ? [account] : [account, employee, { ...employee, id: 'test-second-employee', name: 'موظفة اختبار ثانية' }];
  const branches = [{ id: 'جاليري', name: 'جاليري', start: '16:00', end: '07:00', nextDayTime: '07:00' }];
  const timeline: Row[] = [];
  const writes: Array<{ source: string; changes: Array<{ id: string; before: Row | null; after: Row | null }> }> = [];
  const unexpected: string[] = [];
  // Fail closed: every non-local HTTP request is intercepted, including accidental production URLs.
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (url.origin === 'https://fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.origin !== 'https://supabase.test.invalid') { unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/v1/token') {
      if (invalidPassword) return reply({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
      return reply({ access_token: accessToken, refresh_token: 'test-only-refresh', token_type: 'bearer', expires_in: 3600,
        user: { id: uid, email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } });
    }
    if (url.pathname === '/auth/v1/user') return reply({ id: uid, email: 'test@example.invalid', aud: 'authenticated', role: 'authenticated' });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/app_state') return reply({ version: 1 });
    const name = url.pathname.split('/rpc/')[1];
    const args = request.postDataJSON() || {};
    if (name === 'get_my_account') return denied ? reply({ code: '42501', message: 'Membership required' }, 403) : reply(account);
    if (name === 'get_read_model') return reply({ generatedAt: '2026-11-04T12:00:00+03:00', directory, reviews: [], notes: [], hours: {}, disabledEmployeeIds: [] });
    if (name === 'get_employee_features') return reply(null);
    if (name === 'get_accounts') return reply(directory);
    if (name === 'get_employee_last_presence') return reply({});
    if (name === 'record_employee_page_presence') return reply(null);
    if (name === 'read_rows') return reply(args.source === 'branches' ? branches : args.source === 'timeline' ? timeline : []);
    if (name === 'write_rows') {
      writes.push(args);
      if (writeFailure) return reply({ code: 'PT409', message: 'Stale write' }, 409);
      const rows = args.source === 'timeline' ? timeline : args.source === 'branches' ? branches : [];
      for (const change of args.changes) {
        const index = rows.findIndex((row: Row) => row.id === change.id);
        if (index >= 0) rows.splice(index, 1);
        if (change.after) rows.push(change.after);
      }
      return reply(null);
    }
    unexpected.push(url.pathname);
    return reply({ code: 'TEST_UNMOCKED', message: 'Unhandled test endpoint' }, 500);
  });
  await page.routeWebSocket('**/*', socket => socket.close());
  return { account, timeline, writes, unexpected };
}

export async function login(page: Page) {
  await page.goto('./#/login');
  await page.getByLabel('اسم المستخدم أو البريد الإلكتروني', { exact: true }).fill('test@example.invalid');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
}

export const test = base.extend({
  page: async ({ page }, runTest) => {
    await page.clock.setFixedTime(new Date('2026-11-04T12:00:00+03:00'));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await runTest(page);
    expect(errors).toEqual([]);
  },
});
export { expect };
