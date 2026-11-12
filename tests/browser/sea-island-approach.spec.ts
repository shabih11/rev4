import { test, expect, login, mockService } from './fixtures.js';
for (const mobile of [true, false]) {
  test(`ten island views keep their scale and follow the shoreline schedule (${mobile ? 'mobile' : 'desktop'})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.setViewportSize(mobile ? {width:390,height:844} : {width:1440,height:1000});
    const coastRequests = new Set<number>();
    page.on('request', request => { const match = request.url().match(/coast-visible-day-(\d+)/); if(match && request.resourceType()==='image') coastRequests.add(Number(match[1])); });
    const service = await mockService(page);
    await page.route(`${new URL(baseURL!).origin}/**`, route => route.continue());
    await page.route('**/rest/v1/rpc/get_online_employees', route => route.fulfill({json:[]}));
    const branches = ['جاليري','ذافيو','سلام','القصر','المملكة','شرق'];
    await page.route('**/rest/v1/sea_mission_completions*', route => route.fulfill({json:branches.flatMap(branch=>Array.from({length:20},(_,i)=>({branch,day:i+5,approved_at:'2026-11-15T18:00:00+03:00'})))}));
    let raining = false;
    let forecastTime = 0;
    await page.route('**/functions/v1/riyadh-weather', route => route.fulfill(raining ? {json:{points:[{time:forecastTime-600000,temperature:25,cloud:95,wind:4,rain:2,symbol:'rain'}]}} : {status:503,json:{}}));
    await login(page);
    await expect(page).toHaveURL(/#\/dashboard$/);
    for (const rain of [false,true]) {
      raining = rain;
      let baseline = 0, previousWidth = 0, previousHeight = 0;
      for (let day=16; day<=25; day++) {
        forecastTime = Date.parse(`2026-11-${day}T15:00:00+03:00`);
        await page.clock.setFixedTime(new Date(forecastTime));
        await page.goto('./#/dashboard');
        await page.getByRole('link', {name:'لوحة الترتيب',exact:true}).click();
        await page.getByRole('link', {name:'مهمة البحر',exact:true}).click();
        const island = page.locator('.sea-island-approach');
        const shoreBreak = page.locator('.sea-shore-break img');
        await expect(shoreBreak).toBeVisible();
        await expect.poll(() => shoreBreak.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        expect(await shoreBreak.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
        await expect(page.locator('.sea-map')).toHaveAttribute('data-approach-day',String(day-15));
        await expect(page.locator('.sea-map')).toHaveAttribute('data-weather',rain ? 'rain' : 'unavailable');
        await expect(island.locator('img')).toHaveAttribute('src',new RegExp(`${day<=20?'island-approach':'coast-visible'}-day-${day-15}`));
        await expect.poll(()=>island.locator('img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
        const map = (await page.locator('.sea-map').boundingBox())!;
        const box = (await island.boundingBox())!;
        const bottom = (box.y+box.height-map.y)/map.height;
        const expectedAspect = await island.evaluate(el => Number(getComputedStyle(el).getPropertyValue('--island-frame-aspect')));
        expect(Math.abs(box.width/box.height-expectedAspect)).toBeLessThan(.02);
        if(day===16) baseline=bottom;
        const arrival = await page.locator('.sea-map').evaluate(el => parseFloat((el as HTMLElement).style.getPropertyValue('--coast-arrival-y'))/100);
        const landingProgress = Math.max(0,(day-22)/3);
        const beforeLanding = baseline+Math.min(2,Math.max(0,day-20))*.01;
        const expectedShoreline = beforeLanding*(1-landingProgress)+arrival*landingProgress;
        expect(Math.abs(bottom-expectedShoreline)*map.height).toBeLessThan(1);
        if(day===25) {
          const boatWaterlines = await page.locator('.sea-vessel:not([data-scene="rescue"]):not([data-scene="wreck"]):not([data-scene="capsized"]):not([data-scene="distress"]) .sea-vessel-boat').evaluateAll(images => images.map(img => {const box=img.getBoundingClientRect();return box.top+box.height*.95;}));
          expect(Math.abs(map.y+bottom*map.height-Math.min(...boatWaterlines))).toBeLessThan(3);
        }
        if(day<=20) {
          expect(box.width).toBeGreaterThan(previousWidth);
          expect(box.height).toBeGreaterThan(previousHeight);
        } else {
          expect(Math.abs(box.width-map.width)).toBeLessThan(1);
          const currentSrc = await island.locator('img').evaluate(el => (el as HTMLImageElement).currentSrc);
          expect(currentSrc).toContain(`coast-visible-day-${day-15}${mobile?'-mobile':''}.webp`);
          if(!rain) expect([...coastRequests].every(requestedDay=>requestedDay<=day-15)).toBe(true);
        }
        const expectedScale = .5 * Math.pow(1.1, day-16);
        const actualScale = await island.evaluate(el => Number(getComputedStyle(el).getPropertyValue('--approach-scale')));
        expect(actualScale).toBeCloseTo(expectedScale, 6);
        if(previousWidth && day<=20) {
          expect(Math.abs(box.width/previousWidth-1.1)).toBeLessThan(.001);
          expect(Math.abs(box.height/previousHeight-1.1)).toBeLessThan(.001);
        }
        const sourceRatio = await island.locator('img').evaluate(el => {
          const img = el as HTMLImageElement;
          return { rendered:img.getBoundingClientRect().width/img.getBoundingClientRect().height, natural:img.naturalWidth/img.naturalHeight };
        });
        expect(Math.abs(sourceRatio.rendered-sourceRatio.natural)).toBeLessThan(.001);
        previousWidth=box.width; previousHeight=box.height;
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        if(rain) await expect(page.locator('.sea-rain')).toBeVisible();
        if(day===25 && !rain) {
          await page.emulateMedia({reducedMotion:'no-preference'});
          expect(await shoreBreak.evaluate(el => getComputedStyle(el).animationName)).toBe('sea-shore-wash');
          const before = await shoreBreak.evaluate(el => getComputedStyle(el).transform);
          await expect.poll(() => shoreBreak.evaluate(el => getComputedStyle(el).transform)).not.toBe(before);
          await page.emulateMedia({reducedMotion:'reduce'});
          expect(await shoreBreak.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
        }
        if(!rain) await page.locator('.sea-map').screenshot({path:test.info().outputPath(`rev4-beach-arrival-${mobile?'mobile':'desktop'}-day-${day-15}.png`),animations:'disabled'});
        await page.screenshot({path:test.info().outputPath(`rev4-island-${mobile?'mobile':'desktop'}-${rain?'rain':'clear'}-${day}.png`),clip:{x:map.x,y:map.y,width:map.width,height:map.height*Math.max(.43,bottom+.12)}});
      }
    }
    expect(service.unexpected).toEqual([]);
  });
}
