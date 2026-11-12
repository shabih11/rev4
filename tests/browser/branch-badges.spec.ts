import { test, expect, mockService, login } from './fixtures.js';
const settings = { competition: false, balanceGrowth: false, tiers: false, avatars: false, silverAt: 8, goldAt: 11 };

for (const count of [999, 1000]) {
  test(`branch header awards milestone only at 1000 and shows qualifying campaign badges (${count})`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+03:00'));
    await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page, { role: 'manager' });
    await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: { settings: { competition: false, balanceGrowth: false, tiers: false, avatars: false, silverAt: 8, goldAt: 11, branchBadges: true }, baseline: {}, baselineDay: null } }));
    let seaReads = 0;
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/sea_mission_completions')) seaReads++; });
    await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
      generatedAt: '2026-11-10T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
      reviews: Array.from({ length: count }, (_, i) => ({ id: `badge-${i}`, branch: 'جاليري', rating: '5', date: '06-11-2026', time: '12:00', linkedEmployeeIds: [] })),
    } }));
    await page.goto('./#/login');
    await page.getByLabel('اسم المستخدم أو البريد الإلكتروني', { exact: true }).fill('test@example.invalid');
    await page.getByLabel('كلمة المرور', { exact: true }).fill('test-only-password');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await page.getByRole('link', { name: 'جاليري', exact: true }).click();
    const header = page.locator('header').first();
    await expect(header.getByRole('img', { name: 'قهوة الأحد، الفرع الفائز: جاليري', exact: true })).toBeVisible();
    await expect(header.getByRole('img', { name: 'الانطلاق الصاروخي، فرع جاليري: ١٠٠ تقييم خلال أسبوع', exact: true })).toBeVisible();
    const milestone = header.getByRole('img', { name: 'شارة فرع جاليري لبلوغ ١٬٠٠٠ تقييم', exact: true });
    if (count === 1000) await expect(milestone).toBeVisible();
    else await expect(milestone).toHaveCount(0);
    await expect(header.getByRole('img', { name: /شارة البحر/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: { settings: { ...settings, branchBadges: false }, baseline: {}, baselineDay: null } }));
    await page.reload();
    await expect(header.getByRole('img', { name: /قهوة الأحد|الانطلاق الصاروخي|شارة فرع|شارة البحر/ })).toHaveCount(0);
    expect(seaReads).toBe(0); // Before mission end, displaying a badge needs no approvals query.
    expect(service.unexpected).toEqual([]);
  });
}

test('admin saves the branchBadges switch through global feature settings', async ({ page }) => {
  const service = await mockService(page, { role: 'admin' });
  await page.route('**/rpc/simulation_targets', route => route.fulfill({ json: [] }));
  let saved = { ...settings, branchBadges: false };
  let revision = 1;
  let fetchedBranchBadges = false;
  await page.route('**/rest/v1/app_state*', route => route.fulfill({ json: { version: revision } }));
  await page.route('**/rpc/get_employee_features', route => {
    fetchedBranchBadges = saved.branchBadges;
    return route.fulfill({ json: { settings: saved, baseline: {}, baselineDay: null } });
  });
  const payloads: typeof saved[] = [];
  await page.route('**/rpc/save_employee_features', route => {
    const args = route.request().postDataJSON();
    expect(args.expected).toEqual(saved);
    saved = args.requested;
    revision++;
    payloads.push(saved);
    return route.fulfill({ json: null });
  });
  await login(page);
  await page.getByRole('button', { name: 'الميزات الإضافية', exact: true }).first().click();
  const toggle = page.getByRole('switch', { name: 'شارات الفروع', exact: false });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByRole('button', { name: 'حفظ الميزات', exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  await expect.poll(() => fetchedBranchBadges).toBe(true);
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.getByRole('button', { name: 'حفظ الميزات', exact: true }).click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads.map(value => value.branchBadges)).toEqual([true, false]);
  expect(service.unexpected).toEqual([]);
});

for (const flag of [false, undefined]) {
  test(`branch badge preview is hidden when disabled or absent: ${flag}`, async ({ page }) => {
    await mockService(page, { role: 'admin' });
    await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: { settings: { ...settings, ...(flag === undefined ? {} : { branchBadges: flag }) }, baseline: {}, baselineDay: null } }));
    await login(page);
    await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'فرع تجريبي لمعاينة الشارات' })).toHaveCount(0);
  });
}
