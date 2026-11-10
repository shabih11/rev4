import { test, expect, login, mockService } from './fixtures.js';
const employees = [
 {id:'test-employee',name:'موظفة اختبار',branch:'جاليري',has_account:true,disabled:false,events:4,sessions:1,views:2,clicks:1,active_seconds:15,active_days:1,last_seen:'2026-11-04T12:00:00+03:00',logins:1,failed_logins:2},
 {id:'test-inactive',name:'موظفة غير نشطة',branch:'جاليري',has_account:true,disabled:false,events:0,sessions:0,views:0,clicks:0,active_seconds:0,active_days:0,last_seen:null,logins:0,failed_logins:0},
];
for (const width of [390,1280]) test(`usage dashboard is readable at ${width}px and filters employee profiles`,async({page})=>{
 await page.setViewportSize({width,height:844});
 const service=await mockService(page);
 await page.route('**/rest/v1/rpc/get_usage_report',route=>{
  const {target}=route.request().postDataJSON();
  return route.fulfill({json:{employees:target?employees.filter(e=>e.id===target):employees,pages:[{page:'dashboard',views:2,reached:1,engaged:1,clicks:1,active_seconds:15}],events:[],sessions:[],audit:[],since:'2026-10-28T09:00:00Z'}});
 });
 await login(page);
 await page.getByRole('button',{name:'تحليلات الاستخدام',exact:true}).filter({visible:true}).click();
 await expect(page.getByRole('heading',{name:'تحليلات استخدام الموظفات'})).toBeVisible();
 await expect(page.getByText('50٪',{exact:true})).toHaveCount(2);
 await page.getByLabel('غير النشطات في الفترة فقط').check();
 await expect(page.getByRole('button').filter({hasText:'موظفة غير نشطة'})).toBeVisible();
 await expect(page.getByRole('button').filter({hasText:'موظفة اختبار'})).toHaveCount(0);
 await page.getByLabel('غير النشطات في الفترة فقط').uncheck();
 await page.getByRole('button').filter({hasText:'موظفة اختبار'}).click();
 await expect(page.getByRole('heading',{name:'ملف موظفة اختبار'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:`../usage-${width}.png`,fullPage:true});
 expect(service.unexpected).toEqual([]);
});

test('telemetry batches only allowlisted fields and stops active time after idle',async({page})=>{
 await mockService(page,{role:'employee'});
 const batches: Record<string,unknown>[][]=[];
 await page.route('**/rest/v1/rpc/record_usage_batch',route=>{batches.push(route.request().postDataJSON().batch);return route.fulfill({json:null});});
 await login(page);
 await expect(page).toHaveURL(/#\/dashboard$/);
 await page.clock.install(); await page.clock.setSystemTime(new Date('2026-11-04T12:00:00+03:00'));
 await page.getByRole('button',{name:'شخصي',exact:true}).click();
 await page.clock.runFor(16000);
 await expect.poll(()=>batches.flat().filter(e=>e.kind==='page_view'&&e.page==='profile').length).toBeGreaterThan(0);
 await page.clock.runFor(70000);
 const activeBefore=batches.flat().filter(e=>e.kind==='active').length;
 expect(activeBefore).toBeGreaterThan(0);
 await page.clock.runFor(45000);
 expect(batches.flat().filter(e=>e.kind==='active').length).toBe(activeBefore);
 const all=batches.flat();
 expect(all.some(e=>e.kind==='click'&&e.action==='navigation')).toBe(true);
 for(const e of all) expect(Object.keys(e).sort()).toEqual(['action','id','kind','page','seconds','session']);
 expect(JSON.stringify(all)).not.toContain('test@example.invalid');
 expect(JSON.stringify(all)).not.toContain('test-only-password');
});

 test('telemetry retries identical event IDs and ignores hidden time',async({page})=>{
 await mockService(page,{role:'employee'});
 const batches: {id:string;kind:string;session:string}[][]=[];
 await page.route('**/rest/v1/rpc/record_usage_batch',route=>{batches.push(route.request().postDataJSON().batch);return route.fulfill({status:batches.length===1?503:200,json:batches.length===1?{message:'offline'}:null});});
 await login(page); await expect(page).toHaveURL(/#\/dashboard$/); await page.clock.install(); await page.clock.setSystemTime(new Date('2026-11-04T12:00:00+03:00'));
 await page.clock.runFor(16000);
 await expect.poll(()=>batches.length).toBeGreaterThan(1);
 expect(batches[1].slice(0,batches[0].length)).toEqual(batches[0]);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 const before=batches.flat().filter(e=>e.kind==='active').length;
 await page.clock.runFor(45000);
 expect(batches.flat().filter(e=>e.kind==='active').length).toBe(before);
 await page.clock.runFor(30*60000);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pointerdown'));});
 await page.clock.runFor(16000);
 await expect.poll(async()=>{await page.clock.runFor(15000); return new Set(batches.flat().filter(e=>e.kind==='session_start').map(e=>e.session)).size;}).toBe(2);
 });
