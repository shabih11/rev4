import { test, expect, mockService, login } from './fixtures.js';
import type { Page } from '@playwright/test';

async function rankService(page: Page, challenge: Record<string, unknown> | null) {
  const service = await mockService(page, { role: 'employee' });
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.route(`${origin}/**`, route => route.continue());
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { competition: true, missions: true, avatars: false, tiers: false, silverAt: 8, goldAt: 11 },
    baseline: {}, baselineDay: null,
    store: { collections: [], equipped: {}, selectedVariant: null,
      wallet: { available: 0, earned: 0, spent: 0, stars: 0, rankChallenge: challenge } },
  } }));
  return service;
}

const active = { active: true, rank: 11, targetId: 'fatima', targetName: 'فاطمة', targetBranch: 'المملكة', targetRank: 10, coins: 90, stars: 90, alreadyEarned: false };

for (const width of [390, 1280]) test(`rank mission names the next employee, branch and both rewards at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const service = await rankService(page, active);
  await login(page);
  const mission = page.getByRole('region', { name: 'تحدي التجاوز', exact: true });
  await expect(mission.getByRole('heading', { name: 'تجاوزي فاطمة (المملكة)', exact: true })).toBeVisible();
  await expect(mission).toContainText('+90 عملة');
  await expect(mission).toContainText('+90 نجمة');
  await expect(mission).not.toContainText('التعادل لا يُعد تجاوزًا');
  await mission.screenshot({ path: test.info().outputPath(`rank-mission-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(service.writes).toEqual([]);
  expect(service.unexpected).toEqual([]);
});

test('locked mission explains both opening conditions without offering an unearned reward', async ({ page }) => {
  await rankService(page, { active: false });
  await login(page);
  const mission = page.getByRole('region', { name: 'تحدي التجاوز', exact: true });
  await expect(mission).toContainText('رصيد ٢٠ تقييمًا أو بعد اليوم العاشر');
  await expect(mission.getByRole('heading', { name: /^تجاوزي / })).toHaveCount(0);
  await expect(mission).not.toContainText('عملة');
});

test('the leader sees a completed state without a fictitious opponent', async ({ page }) => {
  await rankService(page, { active: true, leading: true, rank: 1 });
  await login(page);
  await expect(page.getByRole('region', { name: 'تحدي التجاوز' })).toContainText('أنتِ في الصدارة');
  await expect(page.getByRole('heading', { name: /تجاوزي/ })).toHaveCount(0);
});

test('regaining an already rewarded position does not promise another reward', async ({ page }) => {
  await rankService(page, { ...active, alreadyEarned: true, coins: 0, stars: 0 });
  await login(page);
  const mission = page.getByRole('region', { name: 'تحدي التجاوز' });
  await expect(mission).toContainText('سبق اكتساب مكافأة هذا المركز هذا الشهر');
  await expect(mission).not.toContainText('+90');
});
