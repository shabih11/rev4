import { test, expect, mockService, login } from './fixtures.js';
import type { Page } from '@playwright/test';

async function coinService(page: Page, { failFirst = false, delay = 0, empty = false, lostResponse = false, role = 'employee' }: {
  failFirst?: boolean; delay?: number; empty?: boolean; lostResponse?: boolean; role?: 'employee' | 'admin' | 'manager' | 'viewer';
} = {}) {
  const service = await mockService(page, { role });
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.route(`${origin}/**`, route => route.continue());
  let pending = empty ? [] : [
    { id: 'daily:2026-11-04:1', title: 'أثران في يوم واحد · الخضراء', period: '2026-11-04', coins: 5 },
    { id: 'partner:2026-11:1', title: 'ثنائي متألق · الخضراء', period: '2026-11', coins: 10 },
  ];
  let available = 20;
  let version = 1;
  const calls: string[] = [];
  const wallet = () => ({ earned: 35, spent: 0, available, stars: 30,
    pendingCoins: pending.reduce((sum, item) => sum + item.coins, 0), pendingAchievements: pending });
  await page.route('**/rest/v1/app_state*', route => route.fulfill({ json: { version } }));
  await page.route('**/rpc/get_employee_features', route => route.fulfill({ json: {
    settings: { competition: false, balanceGrowth: false, tiers: false, avatars: false, missions: true, silverAt: 8, goldAt: 11 },
    baseline: {}, baselineDay: null, store: { collections: [], equipped: {}, selectedVariant: null, wallet: wallet() },
  } }));
  await page.route('**/rpc/get_avatar_store', route => route.fulfill({ json: { wallet: wallet() } }));
  await page.route('**/rpc/collect_coin_achievement', async route => {
    const args = route.request().postDataJSON();
    expect(Object.keys(args)).toEqual(['achievement_id']);
    calls.push(args.achievement_id);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (failFirst && calls.length === 1) return route.fulfill({ status: 500, json: { message: 'Synthetic failure' } });
    const achievement = pending.find(item => item.id === args.achievement_id);
    if (achievement) available += achievement.coins;
    pending = pending.filter(item => item.id !== args.achievement_id);
    version++;
    if (lostResponse && calls.length === 1) return route.abort('failed');
    return route.fulfill({ json: wallet() });
  });
  return { ...service, calls };
}

for (const width of [390, 1280]) {
  test(`employee opens achievements and collects coins individually at width ${width}`, async ({ page }) => {
    const service = await coinService(page);
    await page.setViewportSize({ width, height: 844 });
    await login(page, { destination: 'leaderboard' });
    const notification = page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ });
    await expect(notification).toContainText('20');
    expect(service.calls).toEqual([]);
    await expect(page).toHaveURL(/#\/$/);
    await notification.click();
    const dialog = page.getByRole('dialog', { name: 'الإنجازات والمكافآت' });
    await expect(dialog.getByRole('listitem')).toHaveCount(2);
    await expect(dialog.getByText('2026-11-04', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('اضغطي «جمع»', { exact: false })).toHaveCount(0);
    await expect(dialog.locator('header')).toHaveClass(/glass-modal-header/);
    await expect(dialog.getByRole('button', { name: 'جمع مكافأة أثران في يوم واحد · الخضراء', exact: true })).toHaveText('10 عملة');
    await page.screenshot({ path: test.info().outputPath(`coin-collection-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'جمع مكافأة أثران في يوم واحد · الخضراء', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('تم جمع المكافأة وتحديث رصيدك.');
    await expect(dialog.getByText('رصيدك المتاح:')).toContainText('30');
    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'إغلاق الإنجازات' }).click();
    await page.reload();
    await notification.click();
    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'جمع مكافأة ثنائي متألق · الخضراء', exact: true }).click();
    await expect(dialog.getByText('لا توجد عملات بانتظار الجمع.')).toBeVisible();
    await expect(dialog.getByText('رصيدك المتاح:')).toContainText('40');
    await dialog.getByRole('button', { name: 'إغلاق الإنجازات' }).click();
    await expect(notification).toHaveCount(0);
    expect(service.calls).toEqual(['daily:2026-11-04:1', 'partner:2026-11:1']);
    expect(service.unexpected).toEqual([]);
  });
}

test('failed collection preserves the reward and allows a safe retry', async ({ page }) => {
  const service = await coinService(page, { failFirst: true });
  await login(page, { destination: 'leaderboard' });
  await page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ }).click();
  const dialog = page.getByRole('dialog');
  const collect = dialog.getByRole('button', { name: 'جمع مكافأة أثران في يوم واحد · الخضراء', exact: true });
  await collect.click();
  await expect(dialog.getByRole('alert')).toContainText('تعذر تأكيد الجمع');
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await expect(dialog.getByText('رصيدك المتاح:')).toContainText('20');
  await collect.click();
  await expect(dialog.getByRole('status')).toContainText('تم جمع المكافأة');
  await expect(dialog.getByText('رصيدك المتاح:')).toContainText('30');
  expect(service.calls).toHaveLength(2);
  expect(service.unexpected).toEqual([]);
});

test('repeated clicks cannot submit another collection while a request is in flight', async ({ page }) => {
  const service = await coinService(page, { delay: 500 });
  await login(page, { destination: 'leaderboard' });
  await page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ }).click();
  const dialog = page.getByRole('dialog');
  const collect = dialog.getByRole('button', { name: 'جمع مكافأة أثران في يوم واحد · الخضراء', exact: true });
  await collect.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(dialog.getByRole('button', { name: 'جمع مكافأة ثنائي متألق · الخضراء' })).toBeDisabled();
  await expect(dialog.getByRole('status')).toContainText('تم جمع المكافأة');
  expect(service.calls).toHaveLength(1);
});

test('no collection notification appears without pending rewards', async ({ page }) => {
  const service = await coinService(page, { empty: true });
  await login(page, { destination: 'leaderboard' });
  await expect(page.getByRole('navigation', { name: 'التنقل', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ })).toHaveCount(0);
  expect(service.calls).toEqual([]);
});

for (const role of ['admin', 'manager', 'viewer'] as const) test(`${role} cannot see or collect an employee reward on the leaderboard`, async ({ page }) => {
  const service = await coinService(page, { role });
  await login(page, { destination: 'leaderboard' });
  await expect(page.getByRole('navigation', { name: 'التنقل', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ })).toHaveCount(0);
  expect(service.calls).toEqual([]);
  expect(service.unexpected).toEqual([]);
});

test('an empty leaderboard still exposes the signed-in employee collection dialog', async ({ page }) => {
  const service = await coinService(page);
  await page.route('**/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-04T12:00:00+03:00', directory: [], reviews: [], notes: [], hours: {}, disabledEmployeeIds: [],
  } }));
  await login(page, { destination: 'leaderboard' });
  await expect(page.getByText('لا توجد نتائج لعرضها بعد.')).toBeVisible();
  await page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ }).click();
  const dialog = page.getByRole('dialog', { name: 'الإنجازات والمكافآت' });
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'جمع مكافأة أثران في يوم واحد · الخضراء', exact: true }).click();
  await expect(dialog.getByText('رصيدك المتاح:')).toContainText('30');
  expect(service.calls).toEqual(['daily:2026-11-04:1']);
});

test('lost collection response verifies the server wallet without paying twice', async ({ page }) => {
  const service = await coinService(page, { lostResponse: true });
  await login(page, { destination: 'leaderboard' });
  await page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'جمع مكافأة أثران في يوم واحد · الخضراء', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('تم تحديث رصيدك.');
  await expect(dialog.getByText('رصيدك المتاح:')).toContainText('30');
  await expect(dialog.getByRole('listitem')).toHaveCount(1);
  expect(service.calls).toHaveLength(1);
  expect(service.unexpected).toEqual([]);
});

test('collection works when AbortSignal.timeout is unavailable', async ({ page }) => {
  const service = await coinService(page);
  await login(page, { destination: 'leaderboard' });
  await page.getByRole('button', { name: /لديكِ عملات بانتظار الجمع/ }).click();
  await page.evaluate(() => Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true }));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'جمع مكافأة أثران في يوم واحد · الخضراء', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('تم جمع المكافأة وتحديث رصيدك.');
  expect(service.calls).toHaveLength(1);
});
