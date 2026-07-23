'use strict';

// Real-browser smoke for the v16 one-screen cockpit: eight regions rendered,
// no horizontal overflow, the grid fills a desktop viewport, and the
// round-50 replay fixture (open 이감/단일 deficits) shows an actionable next
// step instead of the silent HOLD recorded in the 2026-07-20 loss log.

const assert=require('assert');
const fs=require('fs');
const path=require('path');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const {chromium}=require('playwright');

(async()=>{
  const candidates=[
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    '/opt/pw-browsers/chromium',
    '/tmp/ord-chromium',
    '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'
  ].filter(Boolean);
  const executablePath=candidates.find(fs.existsSync);
  if(!executablePath){console.log('SKIP  UI smoke: Playwright Chromium executable not installed');return;}

  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
    await page.route('http*://**',route=>route.abort());
    const REGIONS=['next-action','next-preparation','current-spec','buildable-legends','kill-152','gorosei','upper-info','game-recording'];
    for(const cfg of [{name:'desktop',width:1920,height:1080},{name:'laptop',width:1440,height:900},{name:'mobile',width:430,height:900}]){
      await page.setViewportSize({width:cfg.width,height:cfg.height});
      await page.goto('file://'+path.resolve(__dirname,'ui_fixture.html'),{waitUntil:'domcontentloaded'});
      await page.waitForSelector('.v151-grid');
      const metrics=await page.evaluate(()=>{
        const app=window.TEST_APP,decision=app.plan().plan.v15Decision||{};
        const grid=document.querySelector('.v151-grid'),gridRect=grid.getBoundingClientRect();
        return{
          version:window.ORDCore.VERSION,
          health:app.health(),
          decisionState:decision.state||'',
          hasAction:!!(decision.action&&decision.action.id),
          hasRecovery:!!(decision.recovery&&decision.recovery.targets&&decision.recovery.targets.length),
          regions:[...document.querySelectorAll('[data-region]')].map(node=>node.dataset.region),
          panelCount:document.querySelectorAll('.v151-panel').length,
          specCards:document.querySelectorAll('.v151-spec-card').length,
          specBars:document.querySelectorAll('.v151-spec-bar').length,
          scrollWidth:document.documentElement.scrollWidth,
          clientWidth:document.documentElement.clientWidth,
          viewportHeight:window.innerHeight,
          gridHeight:gridRect.height,
          legacyTabs:document.querySelectorAll('.ord-tabs').length
        };
      });
      assert.strictEqual(metrics.version,'17.5.0');
      assert.strictEqual(metrics.health.ready,true,`${cfg.name} fixture health blocked`);
      assert.deepStrictEqual(metrics.regions,REGIONS,`${cfg.name} region set/order changed`);
      assert.strictEqual(metrics.panelCount,8,`${cfg.name} expected exactly eight panels`);
      assert(metrics.specCards>=4,`${cfg.name} spec cards missing`);
      assert.strictEqual(metrics.specBars,metrics.specCards,`${cfg.name} spec progress bars missing`);
      assert(metrics.hasAction||metrics.hasRecovery,`${cfg.name} replay of the recorded stall must show an action or recovery ladder (state=${metrics.decisionState})`);
      assert.strictEqual(metrics.legacyTabs,0,`${cfg.name} legacy tab bar returned`);
      assert(metrics.scrollWidth<=metrics.clientWidth+1,`${cfg.name} horizontal overflow: ${metrics.scrollWidth-metrics.clientWidth}`);
      if(cfg.width>=1440)assert(metrics.gridHeight>=metrics.viewportHeight*.8,`${cfg.name} cockpit leaves the bottom of the screen empty (grid ${Math.round(metrics.gridHeight)}px of ${metrics.viewportHeight}px)`);
      await page.screenshot({path:path.resolve(__dirname,`ui_${cfg.name}_v16.png`),fullPage:cfg.width<1440});
      console.log(`PASS  ${cfg.name} state=${metrics.decisionState} panels=${metrics.panelCount} grid=${Math.round(metrics.gridHeight)}px/${metrics.viewportHeight}px`);
    }

    await page.setViewportSize({width:1600,height:1000});
    await page.goto('file://'+path.resolve(__dirname,'ui_fixture.html'),{waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-region="next-action"] [data-act="detail"]');
    await page.locator('[data-region="next-action"] [data-act="detail"]').first().click();
    await page.waitForSelector('.detail-modal');
    const detail=await page.evaluate(()=>({title:(document.querySelector('.detail-modal h2')||{}).textContent||''}));
    assert(detail.title.length>0,'detail modal has no title');
    await page.locator('.modal-x').click();
    assert.strictEqual(await page.locator('.detail-modal').count(),0);
    console.log('PASS  detail modal opens from the next-action panel and closes');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
