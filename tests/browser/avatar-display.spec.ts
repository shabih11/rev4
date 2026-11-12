import { test, expect, mockService, login, employee } from './fixtures.js';

for (const width of [390,1280]) test(`equipped avatars fit dashboard, store, leaderboard and card at ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await mockService(page,{role:'employee'});
  const path='bundled/saudi-abaya-lv-olympia-v1/avatar-01-c.png';
  await page.route('**/rpc/get_employee_features',route=>route.fulfill({json:{
    settings:{avatars:true,tiers:true,silverAt:8,goldAt:11},baseline:{},baselineDay:null,
    store:{wallet:{earned:20000,spent:0,available:20000},equipped:{[employee.id]:path},selectedVariant:'owned',collections:[{
      id:'lv',name:'LV Olympia',price:12499,enabled:true,variants:[{id:'owned',name:'أسود',imagePath:path,price:12499,enabled:true,ownerId:employee.id,ownerName:'حساب اختبار'}],
    }]},
  }}));
  async function fit(selector:string) {
    const images=page.locator(selector);
    await expect(images.first()).toBeVisible();
    for (const image of await images.all()) {
      await expect(image).toHaveCSS('object-fit','contain');
      await expect(image).toHaveCSS('transform','none');
      await expect(image).toHaveCSS('scale','0.85 1');
    }
  }
  await login(page);
  await fit('.employee-avatar.h-52 img');
  const hero=page.locator('.employee-avatar.h-52');
  expect((await hero.boundingBox())!.height).toBeGreaterThanOrEqual(208);
  await hero.screenshot({path:`/tmp/avatar-dashboard-${width}.png`});
  await page.getByRole('button',{name:'افتار',exact:true}).click();
  await page.getByRole('button',{name:/LV Olympia/}).click();
  await fit('.avatar-shop img');
  await page.getByRole('button',{name:'عرض أسود مكبرًا'}).click();
  await fit('.avatar-preview img');
  await page.getByRole('button',{name:'إغلاق الصورة'}).click();
  await page.getByRole('button',{name:'لوحتي',exact:true}).click();
  await page.getByRole('link',{name:'لوحة الترتيب',exact:true}).click();
  await fit('.swiper-slide-active .crystal-standing-avatar img');
  await page.getByRole('button',{name:'فتح بيانات حساب اختبار',exact:true}).click();
  const card=page.getByRole('dialog',{name:'بيانات حساب اختبار',exact:true});
  await expect(card).toBeVisible();
  await fit('[aria-label="مجموعة أفاتارات الموظفة"] img');
  await card.screenshot({path:`/tmp/avatar-card-${width}.png`});
});
