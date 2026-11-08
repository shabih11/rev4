import { test, expect, login, mockService } from './fixtures.js';

for (const [positives, negatives, points, quality] of [[20, 2, '10.0', '5.0'], [21, 2, '10.1', '5.13'], [28, 2, '11.0', '6.0'], [24, 1, '11.0', '6.0'], [24, 2, '10.5', '5.5']] as const) {
  test(`${positives} positives and ${negatives} negatives display the recovered employee score`, async ({ page }) => {
    const service = await mockService(page, { role: 'employee' });
    await page.route('https://supabase.test.invalid/rest/v1/rpc/get_read_model', route => route.fulfill({ json: {
      generatedAt: '2026-11-04T12:00:00+03:00', directory: [service.account], notes: [], hours: {}, disabledEmployeeIds: [],
      reviews: Array.from({ length: positives + negatives }, (_, index) => ({
        id: `recovery-${index}`, branch: service.account.branch, rating: index < positives ? '5' : '1',
        date: index < positives ? '02-11-2026' : '03-11-2026', time: '12:00', linkedEmployeeIds: [service.account.id],
      })),
    } }));
    await login(page);
    const results = page.getByRole('region', { name: 'نتائجي', exact: true });
    await expect(results.locator('summary')).toContainText(points);
    await results.locator('summary').click();
    const details = results.getByRole('definition');
    await expect(details.nth(0)).toHaveText(String(positives));
    await expect(details.nth(1)).toHaveText('5.0');
    await expect(details.nth(2)).toHaveText(quality);
    if (quality === '6.0') await expect(results.getByLabel('أسباب نقص الجودة')).toHaveCount(0);
    expect(service.writes).toEqual([]);
    expect(service.unexpected).toEqual([]);
  });
}
