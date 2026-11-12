import { test, expect, mockService, login } from './fixtures.js';

test('admin can stop and enable owner scheduled presence and sees save failures', async ({ page }) => {
  const service = await mockService(page);
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { avatars: true, tiers: true, branchBadges: true, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { collections: [], equipped: {}, wallet: null },
  } }));
  await page.route('**/rpc/get_owner_presence_settings', route => route.fulfill({ json: { enabled: true, available: true } }));
  const changes: boolean[] = [];
  let fail = false;
  await page.route('**/rpc/set_owner_presence_enabled', route => {
    changes.push(route.request().postDataJSON().requested);
    return fail ? route.fulfill({ status: 403, json: { message: 'denied' } }) : route.fulfill({ json: null });
  });
  await login(page);
  await page.getByRole('button', { name: 'الميزات الإضافية', exact: true }).click();
  const panel = page.getByRole('region', { name: 'حضور محمد التلقائي' });
  const toggle = panel.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  fail = true;
  await toggle.click();
  await expect(panel.getByRole('status')).toContainText('تعذر الحفظ');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(changes).toEqual([false, true, false]);
  expect(service.unexpected).toEqual([]);
});
