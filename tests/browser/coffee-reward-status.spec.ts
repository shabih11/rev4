import { test, expect, mockService, login } from './fixtures.js';
for (const [count, collected, label] of [[4, false, 'غير مكتملة'], [5, false, 'جاهزة للجمع'], [5, true, 'تم الجمع']] as const) {
  test(`coffee reward with ${count} contributions shows ${label}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-12T12:00:00+03:00'));
    const service = await mockService(page, { role: 'employee' });
    await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
      generatedAt: '2026-11-12T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
      branchBadgeRewards: [{ branch: 'جاليري', badge: 'coffee', period: '2026-11-01' }],
      reviews: Array.from({ length: count }, (_, i) => ({ id: `coffee-${i}`, branch: 'جاليري', rating: '5', date: '05-11-2026', time: '12:00', linkedEmployeeIds: [service.account.id] })),
    } }));
    await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
      settings: { missions: false, avatars: true, tiers: false }, baseline: {}, baselineDay: null,
      store: { wallet: { earned: 125, spent: 0, available: 0, coffeeRewards: [{ branch: 'جاليري', period: '2026-11-01', eligible: count >= 5, collected }] }, collections: [], equipped: {}, selectedVariant: null },
    } }));
    await login(page);
    const coffee = page.getByRole('region', { name: 'مهام الفرع', exact: true }).getByRole('listitem').filter({ hasText: 'قهوة الأحد' });
    await expect(coffee).toContainText(label);
    await expect(coffee).not.toContainText('تم اكتساب المكافأة');
    await expect(coffee).toContainText('+125 عملة');
    await expect(coffee).toContainText('+100 نجمة');
    if (count === 4) await expect(coffee).not.toHaveClass(/border-emerald-500/);
    await coffee.screenshot({ path: test.info().outputPath('coffee-status.png') });
    expect(service.unexpected).toEqual([]);
  });
}
