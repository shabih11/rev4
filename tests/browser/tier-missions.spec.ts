import { test, expect, mockService, login } from './fixtures.js';
import type { Page } from '@playwright/test';

const mission = (tier: 'silver' | 'gold', current: number, completed = false, collected = false) => ({
  id: `tier:2026-11:${tier}`, tier, target: tier === 'silver' ? 8 : 11,
  current, coins: tier === 'silver' ? 100 : 250, stars: tier === 'silver' ? 100 : 250, completed, collected,
});

async function tierService(page: Page, missions: ReturnType<typeof mission>[], tiers = true) {
  const service = await mockService(page, { role: 'employee' });
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.route(`${origin}/**`, route => route.continue());
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { competition: false, missions: true, tiers, avatars: false, silverAt: 8, goldAt: 11 }, baseline: {}, baselineDay: null,
    store: { collections: [], equipped: {}, selectedVariant: null, wallet: { available: 0, earned: 0, spent: 0, stars: 0, tierMissions: missions } },
  } }));
  return service;
}

for (const width of [390, 1280]) test(`silver and gold goals show their independent rewards at ${width}px`, async ({ page }) => {
  const service = await tierService(page, [mission('silver', 6), mission('gold', 6)]);
  await page.setViewportSize({ width, height: 844 });
  await login(page);
  const section = page.getByRole('region', { name: 'مهام الرتب', exact: true });
  const silver = section.getByRole('listitem').filter({ hasText: 'انتقلي إلى الفضية' });
  const gold = section.getByRole('listitem').filter({ hasText: 'انتقلي إلى الذهبية' });
  await expect(silver).toContainText('+100 عملة');
  await expect(silver).toContainText('+100 نجمة');
  await expect(gold).toContainText('+250 عملة');
  await expect(gold).toContainText('+250 نجمة');
  await expect(silver.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '6');
  await section.screenshot({ path: test.info().outputPath(`tier-missions-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(service.unexpected).toEqual([]);
});

test('a reached silver tier remains an achievement while gold stays a goal', async ({ page }) => {
  await tierService(page, [mission('silver', 8, true), mission('gold', 8)]);
  await login(page);
  const section = page.getByRole('region', { name: 'مهام الرتب' });
  const silver = section.getByRole('listitem').filter({ hasText: 'إنجاز الفضية' });
  await expect(silver).toContainText('اجمعي عملاته من لوحة الترتيب');
  await expect(silver.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
  await expect(section.getByRole('heading', { name: 'انتقلي إلى الذهبية' })).toBeVisible();
});

test('both achievements identify already collected coins without another collect button', async ({ page }) => {
  await tierService(page, [mission('silver', 8, true, true), mission('gold', 11, true, true)]);
  await login(page);
  const section = page.getByRole('region', { name: 'مهام الرتب' });
  await expect(section.getByText('إنجاز مكتمل · تم جمع العملات.')).toHaveCount(2);
  await expect(section.getByRole('button')).toHaveCount(0);
});

test('disabled tiers do not display unavailable tier missions', async ({ page }) => {
  await tierService(page, [mission('silver', 6), mission('gold', 6)], false);
  await login(page);
  await expect(page.getByRole('region', { name: 'رحلة الإنجاز' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'مهام الرتب' })).toHaveCount(0);
});
