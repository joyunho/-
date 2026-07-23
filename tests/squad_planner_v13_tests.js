'use strict';
const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
require(path.join(EXT,'ord_units_data.js'));
require(path.join(EXT,'ord_data_patch.js'));
require(path.join(EXT,'ord_core.js'));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS;

function stateFromCounts(counts){return C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true,wispOverride:'',stunConditions:{}});}
function abundantState(){
  const counts={[C.WISP_ID]:120};
  for(const u of units)if(C.isCommon(u)||C.isUncommon(u)||C.isSpecialTier(u)||C.isRare(u))counts[u.id]=10;
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=10;counts[C.WISP_ID]=120;return stateFromCounts(counts);
}
function commonOnlyState(usopp){
  const counts={[C.WISP_ID]:400};for(const u of units)if(C.isCommon(u))counts[u.id]=u.id==='700h'?usopp:40;
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=10;counts[C.WISP_ID]=400;return stateFromCounts(counts);
}
function plan(state,extra={}){return P.planFinalSquad({state,settings:Object.assign({mode:'physical',currentRound:50,targetSquadCount:9,allowWarped:true,recommendWarped:true},extra)});}
function upperCount(lineup){return new Set(lineup.filter(x=>C.isUpper(x.unit)).map(x=>C.canonicalUpperId(x.id))).size;}

const tests=[];function test(name,fn){tests.push([name,fn]);}

test('builds seven board units worth nine Legend-equivalents',()=>{
  const result=plan(abundantState());assert.strictEqual(result.targetCount,9);assert.strictEqual(result.targetBoardCount,7);assert.strictEqual(result.projectedCount,9);assert.strictEqual(result.projectedBoardCount,7);assert.strictEqual(result.plannedCount,9);assert.strictEqual(result.plannedBoardCount,7);assert.strictEqual(result.complete,true);assert.strictEqual(result.finalLineup.length,7);assert(result.actions.length>=7);assert.strictEqual(result.roleCoverage.complete,true);assert(upperCount(result.finalLineup)>=1);assert(result.rareAllocation.some(x=>x.spent>0));
});

test('target eleven is treated as nine board units with one three-unit Upper',()=>{
  const result=plan(abundantState(),{targetSquadCount:11});assert.strictEqual(result.targetCount,11);assert.strictEqual(result.targetBoardCount,9);assert.strictEqual(result.projectedCount,11);assert.strictEqual(result.projectedBoardCount,9);assert.strictEqual(result.finalLineup.length,9);assert.strictEqual(result.complete,true);
});

test('a scarce Usopp stock is surfaced and equal-clear plans prefer lower common pressure',()=>{
  const stocked=P.planFinalSquad({state:commonOnlyState(40),settings:{mode:'physical',currentRound:50,targetSquadCount:9,allowWarped:true,recommendWarped:true},bottleneckCommons:['우솝']}),scarce=P.planFinalSquad({state:commonOnlyState(0),settings:{mode:'physical',currentRound:50,targetSquadCount:9,allowWarped:true,recommendWarped:true},bottleneckCommons:['우솝']}),normalNeed=C.num(stocked.resourceUse.commonRequired['700h']),scarceNeed=C.num(scarce.resourceUse.commonRequired['700h']),row=scarce.bottlenecks.find(x=>x.name==='우솝');
  assert.strictEqual(scarce.projectedCount,9);assert.strictEqual(scarce.projectedBoardCount,7);assert(row);assert.strictEqual(row.severity,'high');assert.strictEqual(row.substituted,scarceNeed);assert.match(row.why,/우솝|필수 스펙|선위/);
  const comparable=pressure=>({complete:true,requirements:{complete:true,readiness:100},requiredDebt:0,projectedCount:7,target:7,blueprintMatched:0,rareClearedTypes:3,rareUsedTypes:3,used:{rare:4,wisp:0,commonPressure:pressure},excessStun:0,excessSlow:0,materialOverlap:{penalty:0},score:0,actions:[]});
  assert(P._test.nodeCompare(comparable(10),comparable(20))<0,'equal-clear route ignored the lower common-pressure plan');
  assert(scarceNeed>0&&normalNeed>0,'fixture must exercise real Usopp recipe demand');
});

test('sequential actions never spend the same material twice',()=>{
  const state=abundantState(),result=plan(state);let stock=Object.assign({},state.counts),wisp=C.num(stock[C.WISP_ID]);
  for(const action of result.actions){const expected=C.recipeSolve(state.db,action.id,stock);assert.deepStrictEqual(action.solve.consumed,expected.consumed,`${action.name} must solve from the prior after-stock`);assert.strictEqual(action.wispCost,expected.wispCost);assert(expected.wispCost<=wisp);stock=Object.assign({},expected.stockAfter);wisp-=expected.wispCost;stock[C.WISP_ID]=wisp;stock[action.id]=C.num(stock[action.id])+1;assert.deepStrictEqual(action.afterStock,stock);}
  assert.deepStrictEqual(result.afterStock,stock);
});

test('selection wisps are debited exactly once from the projected stock',()=>{
  const state=commonOnlyState(0),result=plan(state),spent=result.actions.reduce((s,x)=>s+x.wispCost,0),initial=C.num(state.counts[C.WISP_ID]);assert(spent>0,'fixture must require selection wisps');assert.strictEqual(result.resourceUse.wisp,spent);assert.strictEqual(result.remainingWisp,initial-spent);assert.strictEqual(result.afterStock[C.WISP_ID],result.remainingWisp);
});

test('explicit dual-magic route contains two uppers and Toki when resources allow',()=>{
  const result=plan(abundantState(),{mode:'magic',magicRoute:'dual'}),toki=result.finalLineup.find(x=>/토키/.test(x.name));assert.strictEqual(result.magicRoute,'dual');assert.strictEqual(result.complete,true);assert.strictEqual(upperCount(result.finalLineup),2);assert(toki,'dual route must reserve a Toki slot');assert.strictEqual(result.roleCoverage.rows.find(x=>x.key==='toki').gap,0);
});

test('round-50 final patch menu exposes all four fallback mechanisms',()=>{
  const before=plan(abundantState(),{currentRound:49}),after=plan(abundantState(),{currentRound:55});
  const expected=[
    ['legendHidden','전설·히든 1기'],
    ['ship','해적선 1기'],
    ['rarePair','희귀 2기 보강'],
    ['changed','변화됨 1기']
  ];
  assert.deepStrictEqual(after.finalPatchOptions.map(option=>[option.kind,option.label]),expected);
  assert.strictEqual(new Set(after.finalPatchOptions.map(option=>option.kind)).size,4);
  for(const kind of ['ship','rarePair','changed']){
    const locked=before.finalPatchOptions.find(option=>option.kind===kind);
    const unlocked=after.finalPatchOptions.find(option=>option.kind===kind);
    assert.strictEqual(locked.availableRound,50,`${kind} round gate`);
    assert.strictEqual(locked.status,'locked',`${kind} must stay locked before round 50`);
    assert.notStrictEqual(unlocked.status,'locked',`${kind} remained locked after round 50`);
    assert(unlocked.reason,`${kind} must explain how it patches the squad`);
  }
  const rarePair=after.finalPatchOptions.find(option=>option.kind==='rarePair');
  assert.strictEqual(rarePair.ids.length,2);
  assert.match(rarePair.reason,/새 보상/);
});

test('legacy warped switches cannot turn off warped recommendations',()=>{
  const warped=units.find(C.isWarped);assert(warped);
  const state=stateFromCounts({[C.WISP_ID]:100}),settings=P._test.normalizeSettings({settings:{mode:C.familyOf(warped)==='magic'?'magic':'physical',currentRound:50,allowWarped:false}});
  assert.strictEqual(settings.allowWarped,true);
  assert.strictEqual(settings.recommendWarped,true);
  assert.strictEqual(P._test.allowedCandidate(warped,settings.mode,'physical',settings,state,state.counts),true);
  const staleOff=P._test.normalizeSettings({settings:Object.assign({},settings,{allowWarped:false,recommendWarped:false})});
  assert.strictEqual(staleOff.recommendWarped,true);
  assert.strictEqual(P._test.allowedCandidate(warped,staleOff.mode,'physical',staleOff,state,state.counts),true);
});

test('planner requirement order and weights are derived from core clear priorities',()=>{
  const spec={main:0,stun:0,slow:0,triggerSlow:0,triggerSlowSources:0,armor:0,triggerArmor:0,boss:0,frenzy:0,toki:0,singleEnd:0,singleEndUnits:0,magicDef:0,magicAmp:0,explosionAmp:0};
  const cases=[['physical','physical'],['magic','dual'],['magic','singleEnd']];
  for(const [mode,route] of cases){
    const settings={mode,magicRoute:route,gorosei:'none',currentRound:50,targetSquadCount:9};
    const core=C.clearProfileDetails(spec,mode,Object.assign({},settings,{_resolvedMagicRoute:route}));
    const rows=P._test.requirementRows(spec,[],mode,route,settings,null).rows.filter(row=>row.required);
    assert.deepStrictEqual(rows.map(row=>[row.key,row.weight]),core.requirements.filter(row=>row.required!==false).map(row=>[row.key,row.weight]),`${mode}/${route} drifted from core`);
  }

  const physical=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'none'},null).rows.filter(row=>row.required);
  const pw=Object.fromEntries(physical.map(row=>[row.key,row.weight]));
  // v17.7: 물딜 1.5스턴이 마지막 우선순위 필수 게이트로 승격됐다.
  assert.deepStrictEqual(physical.map(row=>row.key),['main','armor','stunBase','slow','bossFrenzy','stunFull']);
  assert.strictEqual(pw.armor,pw.stunBase);
  assert.strictEqual(pw.slow,pw.bossFrenzy);
  const lastGate=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'none'},null).rows.find(row=>row.key==='stunFull');
  assert.strictEqual(lastGate.required,true);assert(pw.slow>lastGate.weight);

  const dual=P._test.requirementRows(spec,[],'magic','dual',{gorosei:'none'},null).rows.filter(row=>row.required);
  const dw=Object.fromEntries(dual.map(row=>[row.key,row.weight]));
  assert.deepStrictEqual(dual.map(row=>row.key),['main','stunBase','slow','stunFull','bossFrenzy','toki']);
  assert.strictEqual(dw.main,dw.stunBase);
  assert(dw.stunBase>dw.slow&&dw.slow>dw.stunFull&&dw.stunFull>dw.bossFrenzy);
  assert.strictEqual(dw.bossFrenzy,dw.toki);

  const single=P._test.requirementRows(spec,[],'magic','singleEnd',{gorosei:'none'},null).rows.filter(row=>row.required);
  const sw=Object.fromEntries(single.map(row=>[row.key,row.weight]));
  // v17.6(감사 P0-3): 단일·끝딜 독립 하드 컷 행이 추가됐다.
  assert.deepStrictEqual(single.map(row=>row.key),['main','bossFrenzy','stunBase','slow','stunFull','singleEndExpected','single','end']);
  assert.strictEqual(sw.bossFrenzy,sw.stunBase);
  assert(sw.stunBase>sw.slow&&sw.slow>sw.stunFull&&sw.stunFull>sw.singleEndExpected);
  assert(sw.singleEndExpected>sw.single&&sw.single>sw.end);
});

test('the bounded search is deterministic and keeps warmed p95 bounded',()=>{
  const state=abundantState(),signatures=[],times=[];plan(state);
  for(let i=0;i<6;i++){const started=process.hrtime.bigint(),result=plan(state);times.push(Number(process.hrtime.bigint()-started)/1e6);signatures.push(result.actions.map(x=>x.id).join('|'));}
  assert.strictEqual(new Set(signatures).size,1,'same snapshot must yield the same action order');times.sort((a,b)=>a-b);const p95=times[Math.ceil(times.length*.95)-1];
  // Shared-CI CPU speed varies by 2-3x between sessions; 500ms tripped on a
  // slow container with byte-identical code.  1500ms still fails instantly on
  // any real algorithmic blowup (unbounded search is tens of seconds).
  assert(p95<1500,`p95 ${p95.toFixed(1)}ms must stay bounded below 1500ms`);
});

let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
console.log(`Squad planner v13 tests: ${passed}/${tests.length} passed`);
