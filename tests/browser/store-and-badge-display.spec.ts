import { test, expect, mockService, login, employee } from './fixtures.js';
for (const width of [320,390]) test(`silver stars, approved milestones and compact badges at ${width}`, async ({page})=>{
 await page.setViewportSize({width,height:900});
 await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+03:00'));
 const service=await mockService(page,{role:'employee'});
 await page.route('**/rpc/get_employee_features',route=>route.fulfill({json:{settings:{tiers:true,missions:true,branchBadges:true,avatars:true},baseline:{},baselineDay:null,store:{collections:[],equipped:{},wallet:{available:0,earned:0,spent:0}}}}));
 await page.route('**/rpc/get_read_model',route=>route.fulfill({json:{generatedAt:'2026-11-11T12:00:00+03:00',directory:[service.account],notes:[],hours:{},disabledEmployeeIds:[],
 reviews:Array.from({length:8},(_,i)=>({id:`r${i}`,branch:'جاليري',rating:'5',date:'11-11-2026',time:'10:00',linkedEmployeeIds:[employee.id]})),
 branchBadgeRewards:[{branch:'جاليري',badge:'milestone500',period:'2026-11-01'},{branch:'جاليري',badge:'milestone',period:'2026-11-01'}]}}));
 await login(page);
 await expect(page.getByAltText('شارة فرع جاليري لبلوغ ٥٠٠ تقييم')).toBeVisible();
 await expect(page.getByAltText('شارة فرع جاليري لبلوغ ١٬٠٠٠ تقييم')).toBeVisible();
 await expect(page.locator('.employee-level-star path').first()).toHaveAttribute('fill','#b8c3d1');
 await page.getByRole('link',{name:'لوحة الترتيب',exact:true}).click();
 await page.getByRole('button',{name:'الفروع',exact:true}).click();
 const badges=page.getByRole('region',{name:'فرع تجريبي لمعاينة الشارات'});
 await expect(badges).toBeVisible();
 const boxes=await badges.locator('ul > li > button').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,right:r.right,left:r.left}}));
 expect(boxes).toHaveLength(5);
 expect(new Set(boxes.map(box=>Math.round(box.y))).size).toBe(1);
 expect(boxes.every(box=>box.left>=0&&box.right<=width)).toBe(true);
 await badges.scrollIntoViewIfNeeded();
 await page.waitForTimeout(600);
 await badges.screenshot({path:`/tmp/compact-badges-${width}.png`});
});

test('LV is first, catalogue stays gold, and unavailable models keep their price',async({page})=>{
 await mockService(page,{role:'employee'});
 const base={id:'regular',name:'Other',price:500,enabled:true,variants:[]};
 const variants=[{id:'sold',name:'مملوك',price:12499,ownerId:'other',ownerName:'مالكة'},{id:'free',name:'متاح',price:12999,ownerId:null},{id:'own',name:'ملكي',price:13499,ownerId:employee.id}].map(v=>({...v,imagePath:'bundled/saudi-abaya-lv-olympia-v1/avatar-01-c.png',enabled:true}));
 await page.route('**/rpc/get_employee_features',route=>route.fulfill({json:{settings:{avatars:true},baseline:{},baselineDay:null,store:{wallet:{available:0,earned:0,spent:0},equipped:{},selectedVariant:'own',collections:[base,{...base,id:'lv',name:'LV Olympia',price:12499,variants}]}}}));
 await login(page);
 await page.getByRole('button',{name:'افتار',exact:true}).click();
 const groups=page.locator('.avatar-shop article');
 await expect(groups.first()).toContainText('LV Olympia');
 await page.getByRole('button',{name:/LV Olympia/}).click();
 for(const name of ['مملوك','متاح','ملكي']) await expect(page.getByRole('button',{name:`عرض ${name} مكبرًا`}).locator('img')).toHaveAttribute('src',/lv-olympia-gold-v1/);
 const panel=page.locator('#avatar-group-lv');
 for(const amount of ['12,500','13,000','13,500']) await expect(panel).toContainText(amount);
 await expect(panel.getByRole('button',{name:'مالكة',exact:true})).toBeDisabled();
 await expect(panel.getByRole('button',{name:'الرصيد غير كافٍ',exact:true})).toBeDisabled();
});
