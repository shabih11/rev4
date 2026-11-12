import { test, expect, mockService, login } from './fixtures.js';

test('branch missions show confirmed rewards and Wednesday coffee teaser with compact level digits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-11T09:00:00+03:00'));
  const service = await mockService(page, { role: 'employee' });
  const stars = Array.from({ length: 9 }, (_, i) => Math.round(50 * 1.25 ** i / 5) * 5).reduce((a, b) => a + b, 0);
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { missions: true, avatars: false, tiers: false }, baseline: {}, baselineDay: null,
    store: { wallet: { available: 0, earned: 0, spent: 0, stars }, collections: [], equipped: {}, selectedVariant: null },
  } }));
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-11T09:00:00+03:00', directory: [service.account], reviews: [], notes: [], hours: {}, disabledEmployeeIds: [],
    branchBadgeRewards: [{ branch: 'جاليري', badge: 'milestone500', period: '2026-11-01' }],
  } }));
  await login(page);
  const level = page.getByRole('heading', { level: 1 }).getByRole('img', { name: 'المستوى 10', exact: true });
  await expect(level).toBeVisible();
  const bounds = await level.locator('text').evaluate(element => {
    const box = (element as SVGGraphicsElement).getBBox();
    return { left: box.x, right: box.x + box.width };
  });
  expect(bounds.left).toBeGreaterThan(30);
  expect(bounds.right).toBeLessThan(70);
  const missions = page.getByRole('region', { name: 'مهام الفرع', exact: true });
  const earned = missions.getByRole('listitem').filter({ hasText: '٥٠٠ تقييم' });
  await expect(earned).toContainText('تم اكتساب المكافأة');
  await expect(earned).toHaveClass(/border-emerald-500/);
  await expect(missions.getByRole('listitem').filter({ hasText: 'ألف تقييم' })).not.toContainText('تم اكتساب المكافأة');
  const coffee = missions.getByRole('listitem').filter({ hasText: 'قهوة الأحد' });
  await expect(coffee).toContainText('تبدأ غدًا');
  await expect(missions).not.toContainText('تُكتسب تلقائيًا عند تحقيق الهدف');
  await expect(missions).not.toContainText('يُفعّل تلقائيًا');
  const sea = page.getByRole('region', { name: 'مهمة البحر اليوم' });
  await expect(sea).toContainText('مهمة البحر (يوميًا)');
  await expect(sea).toContainText('+20 نجمة');
  await expect(sea).toContainText('+25 عملة');
  await missions.screenshot({ path: test.info().outputPath('branch-missions-mobile.png') });
  await page.clock.setFixedTime(new Date('2026-11-12T09:00:00+03:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(coffee).toBeVisible();
  await expect(coffee).not.toContainText('تبدأ غدًا');
  await page.clock.setFixedTime(new Date('2026-11-16T09:00:00+03:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(coffee).toHaveCount(0);
  expect(service.unexpected).toEqual([]);
});

for (const completed of [false, true]) test(`sea daily card is ${completed ? 'green for all branch staff' : 'pending'} without personal reviews`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-11T18:00:00+03:00'));
  const service = await mockService(page, { role: 'employee' });
  await page.route('**/sea_mission_completions?*', route => route.fulfill({ json: completed ? [{ branch: 'جاليري', day: 11, approved_at: '2026-11-11T17:00:00+03:00' }] : [] }));
  await login(page);
  const sea = page.getByRole('region', { name: 'مهمة البحر اليوم' });
  await expect(sea).toContainText('مهمة البحر (يوميًا)');
  await expect(sea).toContainText('+20 نجمة');
  await expect(sea).toContainText('+25 عملة');
  if (completed) {
    await expect(sea).toHaveClass(/border-emerald-500/);
    await expect(sea).toContainText('تم اكتساب المكافأة لجميع موظفات الفرع');
  } else await expect(sea).not.toContainText('تم اكتساب المكافأة');
  await sea.screenshot({ path: test.info().outputPath('sea-daily.png') });
  expect(service.unexpected).toEqual([]);
});
