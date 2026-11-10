import { test, expect, mockService } from './fixtures.js';

for (const count of [999, 1000]) {
  test(`branch header awards milestone only at 1000 and shows qualifying campaign badges (${count})`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+03:00'));
    await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page, { role: 'manager' });
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
    const header = page.locator('header').first();
    await expect(header.getByRole('img', { name: 'قهوة الأحد، الفرع الفائز: جاليري', exact: true })).toBeVisible();
    await expect(header.getByRole('img', { name: 'الانطلاق الصاروخي، فرع جاليري: ١٠٠ تقييم خلال أسبوع', exact: true })).toBeVisible();
    const milestone = header.getByRole('img', { name: 'شارة فرع جاليري لبلوغ ١٬٠٠٠ تقييم', exact: true });
    if (count === 1000) await expect(milestone).toBeVisible();
    else await expect(milestone).toHaveCount(0);
    await expect(header.getByRole('img', { name: /شارة البحر/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(seaReads).toBe(0); // Before mission end, displaying a badge needs no approvals query.
    expect(service.unexpected).toEqual([]);
  });
}
