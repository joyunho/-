'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
require(path.join(EXT,'ord_units_data.js'));
require(path.join(EXT,'ord_data_patch.js'));
require(path.join(EXT,'ord_core.js'));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);

function stateFromCounts(counts){return C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});}
function stockedCounts(){
  const counts={[C.WISP_ID]:36,V20h:1};
  for(const u of units){if(C.isCommon(u))counts[u.id]=14;else if(C.isUncommon(u))counts[u.id]=7;else if(C.isSpecialTier(u))counts[u.id]=4;}
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;
  for(const u of db.rares.slice(0,8))counts[u.id]=C.num(counts[u.id])+1;
  return counts;
}
function physicalPlan(){return P.planFinalSquad({state:stateFromCounts(stockedCounts()),settings:{mode:'physical',currentRound:25,targetSquadCount:9,superKumaOwned:true,recommendWarped:true},locks:[{stage:'upper',id:'J40h'}],bottleneckCommons:['우솝']});}
function replaySafePrefix(state,prefix){
  assert(prefix&&prefix.basis==='current-tmo-stock-only');
  let stock=Object.assign({},state.counts),wisp=C.num(stock[C.WISP_ID]);
  for(const action of prefix.actions||[]){
    const prerequisite=P._test.prerequisiteStatus(state,state.db.byId.get(action.id),stock),solve=C.recipeSolve(state.db,action.id,stock);
    assert.strictEqual(prerequisite.allowed,true,`${action.name} prerequisite was not owned`);
    assert.deepStrictEqual(solve.hardMissing,[]);
    assert.deepStrictEqual(solve.missing,{},`${action.name} cannot be rebuilt from current sequential stock`);
    assert(solve.wispCost<=wisp,`${action.name} exceeds remaining selection wisps`);
    wisp-=solve.wispCost;
    stock=Object.assign({},solve.stockAfter,{[C.WISP_ID]:wisp});
    stock[action.id]=C.num(stock[action.id])+1;
    assert.strictEqual(action.remainingWisp,wisp);
  }
  for(const id of new Set(Object.keys(stock).concat(Object.keys(prefix.afterStock||{}))))assert.strictEqual(C.num(stock[id]),C.num(prefix.afterStock&&prefix.afterStock[id]),`safePrefix afterStock mismatch: ${id}`);
}

const tests=[];function test(name,fn){tests.push([name,fn]);}

test('physical seven-board/nine-equivalent plan keeps hard gates including the 1.5-stun last gate (v17.7)',()=>{
  const state=stateFromCounts(stockedCounts()),result=P.planFinalSquad({state,settings:{mode:'physical',currentRound:25,targetSquadCount:9,superKumaOwned:true,recommendWarped:true},locks:[{stage:'upper',id:'J40h'}],bottleneckCommons:['우솝']}),coverage=result.roleCoverage.planned,byKey=Object.fromEntries(coverage.rows.map(row=>[row.key,row]));
  assert.strictEqual(result.targetBoardCount,7);
  assert.strictEqual(result.finalLineup.length,7);
  assert.strictEqual(result.projectedCount,9);
  assert.strictEqual(result.projectedBoardCount,7);
  assert.strictEqual(result.complete,true);
  assert(byKey.armor.current>=byKey.armor.target,`armor ${byKey.armor.current}/${byKey.armor.target}`);
  assert(byKey.stunBase.current>=.5,`minimum stun ${byKey.stunBase.current}`);
  assert(byKey.slow.current>=102,`slow ${byKey.slow.current}`);
  assert(byKey.bossFrenzy.current>=1,`boss/frenzy ${byKey.bossFrenzy.current}`);
  assert.strictEqual(byKey.stunFull.required,true,'v17.7: 1.5 stun is the last-priority hard gate');
  assert(byKey.stunFull.current>=1.5,`1.5 stun gate open: ${byKey.stunFull.current}`);
  assert(byKey.stunFull.current<=2.05,`unnecessary stun stack ${byKey.stunFull.current}`);
  assert(coverage.excessStun<=.55,`excess stun ${coverage.excessStun}`);
  assert.strictEqual(result.wispBudget.fullPartyFeasible,true);
  assert.strictEqual(result.routeEvaluation.roleOnly,true);
  assert.strictEqual(result.routeEvaluation.combatVerified,false,'static role coverage is not measured boss damage');
  replaySafePrefix(state,result.safePrefix);
  const pureStunners=result.finalLineup.filter(row=>{const r=C.roleProfile(row.unit);return r.stun>0&&!r.armor&&!r.triggerArmor&&!r.slow&&!r.triggerSlow&&!r.attack&&!r.speed&&!r.boss&&!r.frenzy&&!r.supportDamage;});
  assert(pureStunners.length<=1,`repeated pure stun slots: ${pureStunners.map(x=>x.name).join(', ')}`);
});

test('final coverage excludes every leftover rare and equals the seven real board units only',()=>{
  const counts=stockedCounts();for(const u of db.rares)counts[u.id]=10;counts[C.WISP_ID]=120;
  const result=P.planFinalSquad({state:stateFromCounts(counts),settings:{mode:'physical',currentRound:55,targetSquadCount:9,superKumaOwned:true,recommendWarped:true}}),coverage=result.roleCoverage.planned,lineupStun=result.finalLineup.reduce((sum,row)=>sum+C.num(C.roleProfile(row.unit).stun),0);
  assert.strictEqual(result.roleCoverage.basis,'final-only');
  assert.strictEqual(coverage.basis,'final-only');
  assert.strictEqual(coverage.spec.total,7);
  assert.strictEqual(result.plannedCount,9);
  assert(Math.abs(coverage.spec.stun-lineupStun)<1e-5,`${coverage.spec.stun} != lineup ${lineupStun}`);
  assert(result.roleCoverage.currentStage.spec.stun>5,'fixture must have noisy lower-tier live stun');
  assert(coverage.spec.stun<=2.05,`lower-tier stun leaked into final coverage: ${coverage.spec.stun}`);
});

test('stun contribution becomes zero after 1.5 and remains valuable before the target',()=>{
  const base={main:1,stun:1.5,slow:102,triggerSlow:0,armor:210,triggerArmor:0,boss:0,frenzy:0},vector={stun:1,stunBase:.5,stunFull:1};
  const met=P._test.requirementRows(base,[],'physical','physical',{gorosei:'none'},null),short=P._test.requirementRows(Object.assign({},base,{stun:1}),[],'physical','physical',{gorosei:'none'},null);
  assert.strictEqual(P._test.staticPotential(vector,met),0);
  assert(P._test.staticPotential(vector,short)>0);
});

test('rare-use map accounts for every current rare and names its final destination',()=>{
  const result=physicalPlan(),summary=result.rareSummary;
  assert.strictEqual(summary.initial,8);
  assert.strictEqual(summary.initial,summary.spent+summary.reserved+summary.reroll);
  assert.strictEqual(summary.conflict,0);
  assert(result.rareAllocation.every(row=>row.usedBy.length>0||row.rerollSuggested));
  assert(result.rareAllocation.flatMap(row=>row.usedBy).every(dest=>dest.id&&dest.name&&['spent','reserved','conflict'].includes(dest.status)));
});

test('zero-wisp partial hand does not reserve rares into an imaginary nine-unit future party',()=>{
  const counts={[C.WISP_ID]:0};for(const u of db.rares.slice(0,3))counts[u.id]=1;
  const state=stateFromCounts(counts),result=P.planFinalSquad({state,settings:{mode:'physical',currentRound:25,targetSquadCount:9,superKumaOwned:true,recommendWarped:true}});
  assert.strictEqual(result.projectedCount,0);
  assert.strictEqual(result.rareSummary.initial,3);
  assert.strictEqual(
    result.rareSummary.initial,
    result.rareSummary.spent+result.rareSummary.reserved+result.rareSummary.reroll,
    'every current rare must be reserved, spent, or explicitly left as a reroll candidate'
  );
  assert.strictEqual(result.rareSummary.reserved,0,'unbuildable future slots must not reserve current rares');
  assert.strictEqual(result.rareSummary.reroll,3);
  assert(result.plannedCount<result.targetCount);
  assert(result.plannedBoardCount<result.targetBoardCount);
  assert.strictEqual(result.wispBudget.fullPartyFeasible,false);
  assert.strictEqual(result.wispBudget.evidence,'future-random-drops-not-funded');
  assert.strictEqual(result.routeEvaluation.combatVerified,false);
  assert.strictEqual(result.safePrefix.checkpointPass,false);
  replaySafePrefix(state,result.safePrefix);
  assert.strictEqual(result.rareSummary.conflict,0,'future slots reused a Rare already reserved elsewhere');
  assert(result.rareAllocation.every(row=>row.conflict===0));
  assert(result.rareAllocation.every(row=>row.usedBy.reduce((sum,dest)=>sum+dest.count,0)<=row.initial));
});

test('Rayleigh, ship and item prerequisites gate planner candidates; Absalom branch remains exempt',()=>{
  const settings={mode:'physical',currentRound:55,allowWarped:true,recommendWarped:true,superKumaOwned:true},blank=stateFromCounts({[C.WISP_ID]:100}),rayleigh=db.byId.get('A30h'),ship=db.byId.get('U30h'),absalomBranch=db.byId.get('P20h');
  assert.strictEqual(P._test.allowedCandidate(rayleigh,'physical','physical',settings,blank,blank.counts),false);
  assert.strictEqual(P._test.allowedCandidate(ship,'physical','physical',settings,blank,blank.counts),false);
  assert.strictEqual(P._test.prerequisiteStatus(blank,absalomBranch,blank.counts).allowed,true);
  const rayleighMaterial=rayleigh.stuffs.find(stuff=>/레일리/.test(C.materialName(db,stuff.id))).id,shipMaterial=ship.stuffs.find(stuff=>/해적선/.test(C.materialName(db,stuff.id))).id,owned=stateFromCounts({[C.WISP_ID]:100,[rayleighMaterial]:1,[shipMaterial]:1});
  assert.strictEqual(P._test.allowedCandidate(rayleigh,'physical','physical',settings,owned,owned.counts),true);
  assert.strictEqual(P._test.allowedCandidate(ship,'physical','physical',settings,owned,owned.counts),true);
});

test('automatic magic planning compares both clear templates and reports the selected reason',()=>{
  const counts=stockedCounts();for(const u of db.rares)counts[u.id]=Math.max(2,C.num(counts[u.id]));counts[C.WISP_ID]=120;
  const result=P.planFinalSquad({state:stateFromCounts(counts),settings:{mode:'magic',magicRoute:'auto',currentRound:55,targetSquadCount:9,superKumaOwned:true,recommendWarped:true}});
  assert(result.routeComparison&&result.routeComparison.reason);
  assert.deepStrictEqual(result.routeComparison.routes.map(row=>row.route).sort(),['dual','singleEnd']);
  assert.strictEqual(result.routeComparison.routes.filter(row=>row.selected).length,1);
  assert.strictEqual(result.routeComparison.selected,result.magicRoute);
  const dual=result.routeComparison.routes.find(row=>row.route==='dual'),single=result.routeComparison.routes.find(row=>row.route==='singleEnd');
  assert.strictEqual(dual.plannedCount,9);assert.strictEqual(single.plannedCount,9);
});

test('squad UI separates current-stock proof from the unverified future role sheet',()=>{
  const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  for(const label of ['미래 참고안의 역할표','마딜 두 경로 실제 비교','추가 스턴 가점 0','현재 TMO 패만 사용','보스 화력 미검증'])assert(source.includes(label),label);
  assert(!source.includes('TMO 코드'),'raw TMO code label is still visible');
  assert(!source.includes('allocationRows.slice(0,16)'),'rare allocation map still truncates large hands');
});

let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
console.log(`Squad planner v14.0.0 weighted-party tests: ${passed}/${tests.length} passed`);
