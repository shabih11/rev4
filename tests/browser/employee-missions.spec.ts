import { test, expect, mockService, login, employee } from './fixtures.js';
import type { Page } from '@playwright/test';

const settings = { competition: false, balanceGrowth: false, tiers: false, avatars: false, rounding: false, silverAt: 8, goldAt: 11 };
async function missionService(page: Page) {
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: { settings: { ...settings, missions: true }, baseline: {}, baselineDay: null } }));
  return service;
}

const imported = (id: string, date: string, ids = [employee.id, 'colleague'], rating = '5') => ({ id, branch: 'جاليري', rating, date, time: '10:00', linkedEmployeeIds: ids });

test('review missions display level, shared effort rewards and reset daily progress without losing stars', async ({ page }) => {
  const service = await missionService(page);
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
    reviews: [imported('1', '04-11-2026'), imported('2', '04-11-2026')],
  } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const missions = page.getByRole('region', { name: 'رحلة الإنجاز' });
  await expect(page.getByRole('heading', { level: 1 }).getByRole('img', { name: 'المستوى 1', exact: true })).toBeVisible();
  await expect(missions.getByRole('heading', { name: 'رحلة الإنجاز', exact: true })).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'أي آم سبيشل', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('employee-header-mobile.png') });
  await expect(missions.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  await expect(missions.getByRole('listitem').filter({ hasText: '3 تقييمات في يوم' }).locator('img')).toHaveAttribute('data-grade', '1');
  const pair = missions.getByRole('listitem').filter({ hasText: 'ثنائي متألق' });
  await expect(pair).not.toContainText('درجات مكتملة');
  await expect(missions.getByText('جاهزة للانطلاق')).toHaveCount(0);
  await expect(missions.getByText('امحي أثر تقييم سلبي', { exact: true })).toHaveCount(0);
  await expect(missions.getByText('كيف تُحسب المستويات والمكافآت؟', { exact: true })).toHaveCount(0);
  await expect(pair).toContainText('+34 نجمة');
  await expect(pair).toContainText('+23 عملة');
  await page.screenshot({ path: test.info().outputPath('employee-missions-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('employee-missions-desktop.png'), fullPage: true });
  await page.clock.setFixedTime(new Date('2026-11-05T00:01:00+03:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(missions.locator('header')).not.toContainText('مجموعك');
  await expect(missions).not.toContainText('نجوم التقييمات');
  await expect(missions).not.toContainText('مكافآت المهام');
  const daily = missions.getByRole('listitem').filter({ hasText: 'تقييمين في يوم' });
  await expect(daily).not.toContainText('0/2');
  await expect(pair).not.toContainText('درجات مكتملة');
  expect(service.writes).toEqual([]);
  expect(service.unexpected).toEqual([]);
});

test('an imported negative exposes recovery with actual surplus-share progress', async ({ page }) => {
  const service = await missionService(page);
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
    reviews: [imported('negative', '01-11-2026', [employee.id], '1'), ...Array.from({ length: 23 }, (_, i) => imported(`p-${i}`, '04-11-2026', [employee.id]))],
  } }));
  await login(page);
  const recovery = page.getByRole('region', { name: 'رحلة الإنجاز' }).getByRole('listitem').filter({ hasText: 'امحي أثر تقييم سلبي' });
  await expect(recovery).not.toContainText('3/4');
  await expect(recovery).toContainText('+25 نجمة');
  await expect(recovery).not.toContainText('درجات مكتملة');
  expect(service.unexpected).toEqual([]);
});

test('failed mission sync never displays an unconfirmed level', async ({ page }) => {
  await mockService(page, { role: 'employee' });
  await page.route('**/rpc/get_read_model', route => route.fulfill({ status: 500, json: { message: 'Test unavailable' } }));
  await login(page);
  const missions = page.getByRole('region', { name: 'رحلة الإنجاز' });
  await expect(page.getByText('تعذر تحميل النتائج. لا يمكن عرض نتيجة مؤكدة الآن.')).toBeVisible();
  await expect(missions).toHaveCount(0);
  await expect(missions.getByRole('progressbar')).toHaveCount(0);
});

for (const flag of [false, undefined]) {
  test(`missions remain hidden with disabled or legacy settings: ${flag}`, async ({ page }) => {
    await mockService(page, { role: 'employee' });
    await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: { settings: { ...settings, ...(flag === undefined ? {} : { missions: flag }) }, baseline: {}, baselineDay: null } }));
    await login(page);
    await expect(page.getByRole('region', { name: 'نتائجي' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'رحلة الإنجاز' })).toHaveCount(0);
  });
}

test('admin saves the missions switch through global feature settings', async ({ page }) => {
  const service = await mockService(page, { role: 'admin' });
  let saved = { ...settings, missions: false };
  let revision = 1;
  let fetchedMissions = false;
  await page.route('**/rest/v1/app_state*', route => route.fulfill({ json: { version: revision } }));
  await page.route('**/rpc/get_employee_features', route => {
    fetchedMissions = saved.missions;
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
  const toggle = page.getByRole('switch', { name: 'المهام والمستويات', exact: false });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByRole('button', { name: 'حفظ الميزات', exact: true }).click();
  await expect.poll(() => payloads.length).toBe(1);
  await expect.poll(() => fetchedMissions).toBe(true);
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.getByRole('button', { name: 'حفظ الميزات', exact: true }).click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads.map(value => value.missions)).toEqual([true, false]);
  expect(service.unexpected).toEqual([]);
});

test('mission badges use green, blue and gold as daily targets advance', async ({ page }) => {
  const service = await missionService(page);
  let count = 0;
  await page.route('**/rest/v1/app_state*', route => route.fulfill({ json: { version: count + 1 } }));
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
    reviews: Array.from({ length: count }, (_, i) => imported(`grade-${i}`, '04-11-2026', [employee.id])),
  } }));
  await login(page);
  for (const [value, band, title, target] of [[0,0,'تقييمين في يوم',2], [2,1,'3 تقييمات في يوم',3], [3,2,'5 تقييمات في يوم',5], [5,2,'5 تقييمات في يوم',5]] as const) {
    count = value;
    if (value) await page.reload();
    const mission = page.getByRole('region', { name: 'رحلة الإنجاز' }).getByRole('listitem').filter({ hasText: title });
    await expect(mission.locator('img')).toHaveAttribute('data-grade', String(band));
    await expect(mission.locator('img')).toHaveAttribute('src', new RegExp(`/grades/${['green','blue','gold'][band]}/`));
    await expect(mission.locator('img')).toHaveCSS('filter', 'none');
    await expect(mission).not.toContainText(`${value}/${target}`);
    await mission.screenshot({ path: test.info().outputPath(`grade-${value}.png`) });
  }
  expect(service.unexpected).toEqual([]);
});

test('daily task uses concise text and updated first grade rewards', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-12T12:00:00+03:00'));
  await missionService(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const daily = page.getByRole('region', { name: 'رحلة الإنجاز' }).getByRole('listitem').filter({ hasText: 'تقييمين في يوم' });
  await expect(daily).toContainText('+13 نجمة');
  await expect(daily).toContainText('+15 عملة');
  await expect(daily).not.toContainText('الدرجة');
  await expect(daily).not.toContainText('0/2');
  const partner = page.getByRole('region', { name: 'رحلة الإنجاز' }).getByRole('listitem').filter({ hasText: 'ثنائي متألق' });
  await expect(partner).toContainText('اكتسبي 10 تقييمات إيجابية مع الشريكة نفسها');
  await expect(partner).toContainText('+88 عملة');
  await expect(partner).toContainText('+98 نجمة');
  await daily.screenshot({ path: test.info().outputPath('daily-concise.png') });
  await partner.screenshot({ path: test.info().outputPath('partner-concise.png') });
});
