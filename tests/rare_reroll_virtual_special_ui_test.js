'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const catalog=global.ORD_TMO_UNITS;
const db=C.buildDb(catalog);
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}
function settings(extra={}){return Object.assign({mode:'physical',magicRoute:'auto',targetSquadCount:9,purpose:'',postLegendRoute:'',gorosei:'none',superKumaOwned:true,virtualSpecialId:'',wispOverride:'',upperPreviewId:'',currentRound:7,manualCounts:{},allowWarped:true,recommendWarped:false,changedUsed:0,seraphUsed:0,transcendUsed:0},extra);}

check('game-flow panel is removed and the v15 Rare board has exactly use, hold and reroll lanes',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(!source.includes('renderFlowTimeline'));
  assert(!source.includes('게임 흐름'));
  const [used,held,rerolled]=db.rares.slice(0,3),state=C.normalizeState(catalog,{counts:{[used.id]:1,[held.id]:1,[rerolled.id]:1},units:[],currentAbilities:{}},settings()),app=Object.create(App.prototype);
  app.state={locks:[],virtualSpecialId:''};
  const rows=[
    {id:used.id,name:C.displayNameOf(used),unit:used,initial:1,use:1,hold:0,reroll:0,reason:'다음 제작에 사용'},
    {id:held.id,name:C.displayNameOf(held),unit:held,initial:1,use:0,hold:1,reroll:0,reason:'생존 역할 경로 보호'},
    {id:rerolled.id,name:C.displayNameOf(rerolled),unit:rerolled,initial:1,use:0,hold:0,reroll:1,reason:'확정 사용처 없음'}
  ];
  const html=app.renderV15RareBoard(state,{v15Decision:{rare:{rows,safeReroll:rows[2]}}});
  assert(html.includes('<h2>희귀 패</h2>'));
  assert.strictEqual((html.match(/class="v15-rare-group use"/g)||[]).length,1);
  assert.strictEqual((html.match(/class="v15-rare-group hold"/g)||[]).length,1);
  assert.strictEqual((html.match(/class="v15-rare-group reroll"/g)||[]).length,1);
  for(const label of ['<b>사용</b>','<b>보류</b>','<b>리롤</b>'])assert(html.includes(label),label);
  for(const row of rows)assert.strictEqual(C.num(row.use)+C.num(row.hold)+C.num(row.reroll),row.initial,'Rare card must have one exclusive disposition');
});

check('selected 152-kill Special is consumed by Rare recipes and is shown inside the Rare hand panel',()=>{
  const special=db.specials.find(unit=>C.displayNameOf(unit)==='X-드레이크'),rare=db.rares.find(unit=>C.displayNameOf(unit)==='거프'&&(unit.stuffs||[]).some(item=>item.id===special.id));
  assert(special&&rare,'virtual Special fixture missing');
  const snapshot={counts:{[C.WISP_ID]:40},units:[],currentAbilities:{}},without=C.normalizeState(catalog,snapshot,settings()),withVirtual=C.normalizeState(catalog,snapshot,settings({virtualSpecialId:special.id}));
  const baseSolve=C.recipeSolve(db,rare.id,without.counts),virtualSolve=C.recipeSolve(db,rare.id,withVirtual.counts);
  assert.strictEqual(withVirtual.counts[special.id],1);
  assert.strictEqual(virtualSolve.consumed[special.id],1);
  assert(virtualSolve.wispCost<baseSolve.wispCost,`${baseSolve.wispCost} -> ${virtualSolve.wispCost}`);
  const plan=C.recommendationPlan(withVirtual,[],settings({virtualSpecialId:special.id}),global.ORD_UPPER_MEMO,global.ORD_SYNERGY_MEMO),eligible=plan.rows.filter(row=>C.isRare(row.unit)&&C.num(row.solve.consumed[special.id])>0);
  assert(eligible.some(row=>row.unit.id===rare.id));
  for(let i=1;i<eligible.length;i++)assert(eligible[i-1].progress>=eligible[i].progress,'virtual Special changed TMO completion order');
  const app=Object.create(App.prototype);app.state={virtualSpecialId:special.id,locks:[],directionStatus:'selected'};
  const rareRow={id:rare.id,name:C.displayNameOf(rare),unit:rare,initial:1,use:1,hold:0,reroll:0,reason:`152킬 ${C.displayNameOf(special)} 사용`};
  const html=app.renderV15RareBoard(withVirtual,{v15Decision:{rare:{rows:[rareRow],safeReroll:null}}}),visible=html.replace(/<[^>]+>/g,' ');
  assert(html.includes('class="v15-reward-special"'));
  assert(html.includes('data-opt="virtualSpecialId"'));
  assert(visible.includes('152킬 특별함 · 희귀 계산에 합산'));
  assert(visible.includes(`${C.displayNameOf(special)}(특별함) 1기 반영`));
  assert(visible.includes(C.displayNameOf(rare)),'Rare consumer must stay in the same Rare board as the selected reward');
  assert(visible.includes(`152킬 ${C.displayNameOf(special)} 사용`),'the Rare row must identify reward consumption');
});

check('the active v15.1 screen renders one 152 selector and no legacy Rare board',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const sidebar=source.slice(source.indexOf('renderSidebar(state'),source.indexOf('trustCopy(html'));
  const reward=source.slice(source.indexOf('  renderV151RewardForecast('),source.indexOf('  renderV151Gorosei('));
  const coach=source.slice(source.indexOf('  renderCoach(state'),source.indexOf('  renderCoachDetails('));const gorosei=source.slice(source.indexOf('  renderV151Gorosei('),source.indexOf('  v151ClearWhy('));
  assert(!sidebar.includes('data-opt="virtualSpecialId"'),'sidebar duplicated the 152-kill selector');
  assert.strictEqual((reward.match(/data-opt="virtualSpecialId"/g)||[]).length,1,'active reward panel must have one selector');
  assert(gorosei.includes('renderV151RewardForecast(state,plan)'),'152 forecast must render inside the gorosei panel');
  assert(!coach.includes('renderV15RareBoard('),'legacy Rare board must not be reachable from the v15.1 screen');
  assert(!coach.includes('renderRareResolution('),'legacy Rare renderer must not be reachable from the v15 cockpit');
  assert(!coach.includes('data-region="kill-152"'),'standalone kill-152 panel must stay removed');assert(coach.includes('data-region="gorosei"'));
});

check('changing the virtual Special invalidates both squad and upper-ranking caches',()=>{
  const app=Object.create(App.prototype);app.state={virtualSpecialId:''};app._squadCacheKey='squad';app._upperRankCacheKey='upper';app._upperRankCache=[1];app._deferredExternalRender=true;app.persist=()=>{};app.render=()=>{};
  app.setOpt('virtualSpecialId','K10h');
  assert.strictEqual(app._squadCacheKey,'');
  assert.strictEqual(app._upperRankCacheKey,'');
  assert.deepStrictEqual(app._upperRankCache,[]);
});

console.log(`\n${checks}/${checks} Rare reroll and virtual-Special UI checks passed.`);
