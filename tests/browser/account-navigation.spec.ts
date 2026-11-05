import { test, expect, login, mockService } from './fixtures.js';

for (const role of ['manager', 'employee', 'admin'] as const) {
  test(`${role} can open the leaderboard and return through its account name`, async ({ page }) => {
    if (role === 'manager') await page.setViewportSize({ width: 390, height: 844 });
    const service = await mockService(page, { role });
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    if (role === 'manager') {
      await expect(page.getByRole('heading', { name: service.account.branch, exact: true })).toBeVisible();
      await page.screenshot({ path: '/tmp/rev4-manager-navigation.png' });
    }
    await page.getByRole('link', { name: 'لوحة الترتيب', exact: true }).first().click();
    await expect(page).toHaveURL(/#\/$/);
    const name = role === 'manager' ? service.account.branch : service.account.name;
    const accountLink = page.getByRole('navigation', { name: 'التنقل' }).getByRole('link', { name, exact: true });
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveText(name);
    await expect(accountLink).toHaveAttribute('href', '#/dashboard');
    await accountLink.click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    expect(service.unexpected).toEqual([]);
    expect(service.writes).toEqual([]);
  });
}
