import { test, expect, login, mockService, employee } from './fixtures.js';

test('halfway artwork follows daily reviews and gives way to completion on desktop and mobile', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-05T15:00:00+03:00'));
  const service = await mockService(page);
  let count = 1;
  let version = 1;
  await page.route(url => url.origin === 'https://supabase.test.invalid' && url.pathname === '/rest/v1/app_state',
    route => route.fulfill({ json: { version } }));
  const branches = ['جاليري', 'ذافيو', 'سلام', 'القصر', 'المملكة', 'شرق'];
  await page.route('https://supabase.test.invalid/rest/v1/rpc/get_read_model', route => route.fulfill({ json: {
    generatedAt: '2026-11-05T15:00:00+03:00', directory: [service.account, employee],
    reviews: branches.flatMap(branch => Array.from({ length: count }, (_, index) => ({
      id: `halfway-${branch}-${index}`, branch, rating: '5', date: '2026-11-05', time: '14:30:00', linkedEmployeeIds: [],
    }))), notes: [], hours: {}, disabledEmployeeIds: [],
  } }));
  await page.route('**/functions/v1/riyadh-weather', route => route.fulfill({ status: 503, json: {} }));
  await login(page);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await page.goto('./#/?view=sea');
  const halfway = page.locator('.sea-vessel[data-scene="halfway"]');
  await expect(halfway).toHaveCount(6);
  await expect.poll(() => halfway.locator('.sea-vessel-boat').evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  await page.screenshot({ path: '/tmp/rev4-sea-halfway-desktop.png' });

  count = 2;
  version++;
  await page.clock.setFixedTime(new Date('2026-11-05T20:00:00+03:00'));
  await page.reload();
  await expect(page.locator('.sea-vessel[data-scene="celebrate"]')).toHaveCount(6);
  await expect(halfway).toHaveCount(0);
  const completed = page.locator('.sea-vessel[data-scene="celebrate"]').first();
  await expect(completed).toHaveAttribute('aria-pressed', 'false');
  await expect(completed.locator('.sea-branch-name')).toBeVisible();
  await expect(completed.locator('.sea-branch-name')).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(await completed.locator('.sea-vessel-boat').evaluate(element => getComputedStyle(element).filter)).toContain('74, 222, 128');
  await completed.click();
  await expect(completed).toHaveAttribute('aria-pressed', 'true');
  expect(await completed.locator('.sea-vessel-boat').evaluate(element => getComputedStyle(element).filter)).toContain('74, 222, 128');
  await page.screenshot({ path: '/tmp/rev4-sea-completed-desktop.png' });

  count = 0;
  version++;
  await page.reload();
  await expect(page.locator('.sea-vessel[data-scene="adventure"]')).toHaveCount(6);
  await expect(page.locator('.sea-branch-name')).toHaveCount(0);

  count = 1;
  version++;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(halfway).toHaveCount(6);
  await expect.poll(() => halfway.locator('.sea-vessel-boat').evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(service.unexpected).toEqual([]);
  await page.screenshot({ path: '/tmp/rev4-sea-halfway-mobile.png' });
});
