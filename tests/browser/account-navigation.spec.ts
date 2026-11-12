import { test, expect, login, mockService } from './fixtures.js';

for (const role of ['manager', 'employee', 'admin'] as const) {
  test(`${role} lands on the leaderboard and opens its account through its name`, async ({ page }) => {
    if (role === 'manager') await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page, { role });
    await login(page, { destination: 'leaderboard' });
    await expect(page).toHaveURL(/#\/$/);
    const name = role === 'manager' ? service.account.branch : service.account.name;
    const accountLink = page.getByRole('navigation', { name: 'التنقل' }).getByRole('link', { name, exact: true });
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveText(name);
    await expect(accountLink).toHaveAttribute('href', '#/dashboard');
    await accountLink.click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    if (role === 'manager') await expect(page.getByRole('heading', { name: service.account.branch, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).first().click();
    await expect(page).toHaveURL(/#\/$/);
    expect(service.unexpected).toEqual([]);
    expect(service.writes).toEqual([]);
  });
}

test('viewer lands on the leaderboard with logout instead of an account dashboard', async ({ page }) => {
  const service = await mockService(page, { role: 'viewer' });
  await login(page, { destination: 'leaderboard' });
  await expect(page).toHaveURL(/#\/$/);
  const navigation = page.getByRole('navigation', { name: 'التنقل', exact: true });
  await expect(navigation.locator('a[href="#/dashboard"]')).toHaveCount(0);
  await navigation.getByRole('button', { name: 'خروج', exact: true }).click();
  await expect(page).toHaveURL(/#\/login$/);
  expect(service.unexpected).toEqual([]);
});
