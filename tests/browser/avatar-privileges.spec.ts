import { test, expect, mockService, login, employee } from './fixtures.js';


for (const active of [false, true]) test(`avatar privileges and old selection are ${active ? 'unlocked' : 'locked'} by monthly purchase`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_online_employees', route => route.fulfill({ json: {} }));
  const state = { uses: [] as object[], seaReturns: [], closures: [], purchaseMonths: active ? ['2026-11-01'] : ['2026-10-01'] };
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, avatarPrivileges: state,
    reviews: [{ id: 'negative', rating: '1', date: '03-11-2026', time: '10:00', branch: 'جاليري', linkedEmployeeIds: [employee.id] }],
  } }));
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { monthActive: active, goldEntitled: false, wallet: { available: 100, earned: 100, spent: 0 }, equipped: {}, selectedVariant: null,
      collections: [{ id: 'owned', name: 'ستايل مملوك', enabled: true, price: 100, variants: [{ id: 'old', name: 'أفتاري السابق', imagePath: null, enabled: true, ownerId: employee.id }] }] },
  } }));
  let calls = 0;
  await page.route('**/rest/v1/app_state*', route => route.fulfill({ json: { version: 1 + calls } }));
  await page.route('**/rpc/use_avatar_privilege', route => {
    expect(route.request().postDataJSON()).toEqual({ requested_month: '2026-11-01', requested_kind: 'erase', requested_target: 'negative' });
    calls++; state.uses.push({ id: 1, period: '2026-11-01', actor: employee.id, kind: 'erase', reviewId: 'negative', recipients: [employee.id], gold: false });
    return route.fulfill({ json: null });
  });
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  const panel = page.getByRole('region', { name: 'امتيازات أفتارك' });
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: /ستايل مملوك/ }).click();
  const oldAvatar = page.getByRole('button', { name: 'استخدام هذا الشكل' });
  if (!active) {
    await expect(panel.getByRole('button', { name: 'إزالة تقييم سلبي' })).toHaveAttribute('data-available', 'false');
    await expect(oldAvatar).toBeDisabled();
    await panel.getByRole('button', { name: 'إزالة تقييم سلبي' }).click();
    await expect(page.getByRole('dialog', { name: 'إزالة تقييم سلبي' })).toContainText('اشتري أفتارًا');
  } else {
    await expect(oldAvatar).toBeEnabled();
    await expect(panel.getByRole('button', { name: /إزالة تقييم سلبي/ })).toHaveAttribute('data-available', 'true');
    await panel.getByRole('button', { name: /إزالة تقييم سلبي/ }).click();
    const modal = page.getByRole('dialog', { name: 'إزالة تقييم سلبي' });
    await modal.getByLabel('التقييم السلبي المراد محو أثره').selectOption('negative');
    await modal.getByRole('button', { name: 'تأكيد إزالة الأثر' }).click();
    await expect(modal).toContainText('استُخدمت هذه الميزة لهذا الشهر');
    await modal.getByRole('button', { name: 'إغلاق', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'إزالة تقييم سلبي' })).toHaveAttribute('data-available', 'false');
    expect(calls).toBe(1);
  }
  if (!active) await page.getByRole('dialog', { name: 'إزالة تقييم سلبي' }).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expect(panel.getByRole('button')).toHaveCount(3);
  await expect(panel.getByLabel('شهر الاستحقاق')).toHaveCount(0);
  await panel.screenshot({ path: test.info().outputPath('avatar-privileges.png') });
  expect(service.unexpected).toEqual([]);
});

test('all golden employees appear in two podium rows and admin closure requires confirmation', async ({ page }) => {
  const service = await mockService(page);
  await page.route('**/rpc/get_online_employees', route => route.fulfill({ json: {} }));
  const golden = Array.from({ length: 10 }, (_, index) => ({ ...employee, id: `gold-${index}`, name: `موظفة ذهبية ${index}`, manualStats: { positive: 5, monthReviews: 20 } }));
  const state = { uses: [], seaReturns: [], purchaseMonths: [], closures: [] as object[] };
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account, ...golden, { ...employee, id: 'silver', manualStats: { positive: 3, monthReviews: 12 } }], notes: [], reviews: [], hours: {}, avatarPrivileges: state,
  } }));
  let calls = 0;
  await page.route('**/rest/v1/app_state*', route => route.fulfill({ json: { version: 1 + calls } }));
  await page.route('**/rpc/close_reward_month', route => {
    expect(route.request().postDataJSON()).toEqual({ requested_month: '2026-10-01' });
    calls++; state.closures.push({ period: '2026-10-01', closedAt: '2026-11-04', snapshot: {} });
    return route.fulfill({ json: null });
  });
  await login(page);
  await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
  await page.getByRole('button', { name: /^نتائج / }).click();
  await expect(page.locator('.results-platform')).toHaveCount(10);
  const tops = await page.locator('.results-platform').evaluateAll(nodes => [...new Set(nodes.map(node => (node as HTMLElement).style.top))]);
  expect(tops).toHaveLength(2);
  const closure = page.getByRole('region', { name: 'إغلاق مكافآت الشهر', exact: true });
  await closure.getByRole('button', { name: 'إغلاق مكافآت الشهر', exact: true }).click();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'تأكيد إغلاق المكافآت' }).click();
  await expect(closure).toContainText('مغلقة');
  expect(calls).toBe(1);
  await page.locator('.results-podium').screenshot({ path: test.info().outputPath('golden-two-rows.png') });
  expect(service.unexpected).toEqual([]);
});

test('gold sea return displays its icon on the boat only during its phase', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00+03:00'));
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_online_employees', route => route.fulfill({ json: {} }));
  await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
  const reviews = [5, 7].flatMap(day => [0, 1].map(index => ({ id: `sea-${day}-${index}`, branch: 'جاليري', rating: '5', date: `${day.toString().padStart(2, '0')}-11-2026`, time: `15:0${index}`, linkedEmployeeIds: [employee.id] })));
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-08T12:00:00+03:00', directory: [service.account], reviews, notes: [], hours: {},
    avatarPrivileges: { uses: [], closures: [], purchaseMonths: ['2026-11-01'], seaReturns: [{ branch: 'جاليري', day: 6, actor: employee.id, usedAt: '2026-11-07T15:00:00+03:00' }] },
  } }));
  await login(page);
  await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).click();
  await page.getByRole('link', { name: 'مهمة البحر', exact: true }).click();
  await expect(page.locator('.sea-vessel').filter({ has: page.getByRole('img', { name: 'إنقاذ أم خماس' }) })).toHaveCount(1);
  await page.clock.setFixedTime(new Date('2026-11-16T15:00:00+03:00'));
  await page.reload();
  await expect(page.getByRole('region', { name: 'رحلة الفروع إلى الجزيرة', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'إنقاذ أم خماس' })).toHaveCount(0);
  expect(service.unexpected).toEqual([]);
});

test('threshold light and Plus dialog reflect actual eligibility and paid review shares', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_online_employees', route => route.fulfill({ json: {} }));
  Object.assign(service.account, { manualStats: { positive: 4.25, monthReviews: 19.5 } });
  const partner = { ...employee, id: 'partner', name: 'شريكة اختبار' };
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account, partner], notes: [], hours: {},
    avatarPrivileges: { uses: [], closures: [], seaReturns: [], purchaseMonths: ['2026-11-01'] },
    reviews: [
      { id: 'plus', rating: '5', date: '03-11-2026', time: '10:00', branch: 'جاليري', linkedEmployeeIds: [employee.id, partner.id], avatarRewardEmployeeIds: [employee.id, partner.id] },
      { id: 'not-paid', rating: '5', date: '02-11-2026', time: '11:00', branch: 'جاليري', linkedEmployeeIds: [employee.id], goldPlus: true, avatarRewardEmployeeIds: [] },
    ],
  } }));
  await page.route('**/rpc/read_rows*', route => {
    const args = route.request().postDataJSON();
    return route.fulfill({ json: args.source === 'reviews' ? [{ id: 'plus', reviewerName: 'عميلة اختبار', comment: 'خدمة مميزة من الفريق', rating: '5', date: '03-11-2026', time: '10:00', branch: 'جاليري', linkedEmployeeIds: [employee.id, partner.id] }] : [] });
  });
  // 4.25 + .125 + .25 positive points plus six quality points = 10.625.
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, rounding: true, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { monthActive: true, goldEntitled: false, wallet: { available: 0, earned: 0, spent: 0 }, collections: [], equipped: {}, selectedVariant: null },
  } }));
  await login(page);
  await page.getByRole('button', { name: 'افتار', exact: true }).click();
  const panel = page.getByRole('region', { name: 'امتيازات أفتارك' });
  await expect(panel.getByRole('button', { name: /تجاوز عتبة/ })).toHaveAttribute('data-available', 'true');
  await panel.getByRole('button', { name: /تجاوز عتبة/ }).click();
  await expect(page.getByRole('dialog', { name: 'تجاوز عتبة' }).getByLabel('الموظفة المراد إكمال استحقاقها')).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: /تقييمات بلس/ }).click();
  const modal = page.getByRole('dialog', { name: 'تقييمات بلس' });
  await expect(modal.getByRole('listitem')).toHaveCount(1);
  await expect(modal).toContainText('شريكة اختبار');
  await expect(modal).toContainText('خدمة مميزة من الفريق');
  await expect(modal).toContainText('٨ ريال');
  await modal.screenshot({ path: test.info().outputPath('avatar-plus-dialog.png') });
  expect(service.unexpected).toEqual([]);
});
