import { test, expect, login, mockService } from './fixtures.js';

for (const role of ['admin', 'manager', 'employee'] as const) {
  test(`sea completion controls and persistence for ${role}`, async ({ page }) => {
    if (role === 'admin') await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page, { role });
    const approvals: { branch: string; day: number; approved_at: string }[] = [];
    let writes = 0;
    await page.route('**/rest/v1/sea_mission_completions*', async route => {
      if (route.request().method() === 'POST') {
        writes++;
        const args = route.request().postDataJSON();
        const saved = { ...args, approved_at: '2026-11-05T15:00:00+03:00' };
        approvals.push(saved);
        return route.fulfill({ json: saved });
      }
      return route.fulfill({ json: approvals });
    });
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.clock.setFixedTime(new Date('2026-11-05T15:00:00+03:00'));
    await page.goto('./#/?view=sea');
    const boat = page.locator('li[data-branch="شرق"] .sea-vessel');
    const save = page.getByRole('button', { name: 'اعتماد إنجاز اليوم — شرق' });
    await expect(boat).toBeVisible();
    await expect(save).toHaveCount(0);
    await boat.click();
    await expect(save).toHaveCount(0);
    await page.reload();
    await boat.dblclick();
    if (role !== 'admin') {
      await expect(save).toHaveCount(0);
      expect(writes).toBe(0);
    } else {
      await save.click();
      await expect(boat).toHaveAttribute('data-scene', 'celebrate');
      await expect(page.getByRole('status')).toContainText('تم اعتماد');
      await page.reload();
      await expect(boat).toHaveAttribute('data-scene', 'celebrate');
      await expect(save).toHaveCount(0);
      await boat.dblclick();
      await expect(save).toBeDisabled();
      await expect(save).toHaveAttribute('aria-pressed', 'true');
      expect(approvals[0]).toMatchObject({ branch: 'شرق', day: 5 });
      await page.screenshot({ path: test.info().outputPath('sea-completion.png') });
      expect(writes).toBe(1);
    }
    expect(service.unexpected).toEqual([]);
  });
}

test('failed save keeps the boat unchanged and allows retry', async ({ page }) => {
  await mockService(page);
  await page.route('**/rest/v1/sea_mission_completions*', route => route.fulfill(route.request().method() === 'POST'
    ? { status: 403, json: { message: 'denied' } } : { json: [] }));
  await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
  await login(page);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.clock.setFixedTime(new Date('2026-11-05T15:00:00+03:00'));
  await page.goto('./#/?view=sea');
  const boat = page.locator('li[data-branch="شرق"] .sea-vessel');
  const save = page.getByRole('button', { name: 'اعتماد إنجاز اليوم — شرق' });
  await boat.dblclick();
  await save.click();
  await expect(page.getByRole('status')).toContainText('تعذر حفظ');
  await expect(boat).not.toHaveAttribute('data-scene', 'celebrate');
  await expect(save).toBeEnabled();
});
