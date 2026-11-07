import { test, expect, login, mockService } from './fixtures.js';

for (const state of ['recorded', 'unseen', 'failed'] as const) {
  test(`admin sees ${state} branch account presence`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page);
    let requests = 0;
    await page.route('**/rpc/get_branch_last_presence', route => {
      requests++;
      return route.fulfill(state === 'failed' ? { status: 503, json: {} } : {
        json: { 'جاليري': state === 'recorded' ? '2026-11-04T09:05:00Z' : null },
      });
    });
    await login(page);
    await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'ترتيب الموظفة ونتائجها' })).toBeVisible();
    expect(requests).toBe(0);
    await page.getByRole('button', { name: 'الفروع', exact: true }).click();
    const presence = page.getByText('آخر ظهور لحساب الفرع:', { exact: false }).first();
    await expect(presence).toContainText(state === 'failed' ? 'تعذر التحميل' : state === 'unseen' ? 'لم يُسجل حضور بعد' : '12:05');
    expect(requests).toBe(1);
    if (state === 'recorded') {
      await expect(page.locator('.glass-modal-shell')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: '/tmp/rev4-branch-presence.png' });
    }
    expect(service.unexpected).toEqual([]);
  });
}

for (const role of ['manager', 'employee'] as const) {
  test(`${role} cannot see branch presence`, async ({ page }) => {
    const service = await mockService(page, { role });
    let requests = 0;
    await page.route('**/rpc/get_branch_last_presence', route => { requests++; return route.fulfill({ json: {} }); });
    await login(page);
    await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'ترتيب الموظفة ونتائجها' })).toBeVisible();
    await page.getByRole('button', { name: 'الفروع', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'الفروع', exact: true })).toBeVisible();
    await expect(page.getByText('آخر ظهور لحساب الفرع:', { exact: false })).toHaveCount(0);
    expect(requests).toBe(0);
    expect(service.unexpected).toEqual([]);
  });
}
