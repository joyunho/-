'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS;
function replaySafePrefix(state,prefix){
  assert(prefix&&prefix.basis==='current-tmo-stock-only','safePrefix must use only the current TMO stock');
  let stock=Object.assign({},state.counts),wisp=C.num(stock[C.WISP_ID]);
  for(const action of prefix.actions||[]){
    const prerequisite=P._test.prerequisiteStatus(state,state.db.byId.get(action.id),stock),solve=C.recipeSolve(state.db,action.id,stock);
    assert.strictEqual(prerequisite.allowed,true,`${action.name} prerequisite was not owned`);
    assert.deepStrictEqual(solve.hardMissing,[]);
    assert.deepStrictEqual(solve.missing,{},`${action.name} cannot be rebuilt from the sequential hand`);
    assert(solve.wispCost<=wisp,`${action.name} exceeds remaining selection wisps`);
    assert.deepStrictEqual(action.spend,solve.consumed,`${action.name} spend ledger changed`);
    wisp-=solve.wispCost;
    stock=Object.assign({},solve.stockAfter,{[C.WISP_ID]:wisp});
    stock[action.id]=C.num(stock[action.id])+1;
    assert.strictEqual(action.remainingWisp,wisp);
  }
  for(const id of new Set(Object.keys(stock).concat(Object.keys(prefix.afterStock||{}))))assert.strictEqual(C.num(stock[id]),C.num(prefix.afterStock&&prefix.afterStock[id]),`safePrefix afterStock mismatch: ${id}`);
}

const counts={
  // 흔함 63
  '300h':5,'200h':8,'100h':10,'700h':5,'400h':9,'800h':4,'500h':8,'900h':9,'600h':5,
  // 안흔함 8
  'G00h':2,'O00h':1,'N00h':1,'E00h':2,'L00h':2,
  // 특별함 8
  'B00h':1,'E10h':1,'I10h':2,'A10h':1,'710h':1,'R00h':1,'P00h':1,
  // 희귀함 6
  'Z10h':1,'C20h':1,'320h':1,'K20h':2,'L50h':1
};
// 7라 첫 희귀 보상으로 받은 선택 위습 한 개만 현재 예산으로 둔다.
counts[C.WISP_ID]=1;

const state=C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
const result=P.planFinalSquad({state,settings:{
  mode:'physical',currentRound:25,targetSquadCount:9,upperPreviewId:'190H',
  superKumaOwned:true,recommendWarped:true
}});

assert.strictEqual(result.targetCount,9,'외부 목표는 전설 환산 9기입니다.');
assert.strictEqual(result.targetBoardCount,7,'물딜 환산 9기의 실제 보드 목표는 7칸입니다.');
assert(result.plannedCount<result.targetCount,'미래 랜덤 드랍을 채운 것으로 보고 9환산을 확정했습니다.');
assert(result.plannedBoardCount<result.targetBoardCount);
assert.strictEqual(result.plannedBoardCount,result.finalLineup.length);
const upperCount=result.finalLineup.filter(row=>C.isUpper(row.unit)).length;
assert.strictEqual(result.plannedCount,result.finalLineup.length+upperCount*2,'상위 3환산은 자원 진행도에만 정확히 반영해야 합니다.');

const coverage=result.roleCoverage.planned,byKey=Object.fromEntries(coverage.rows.map(row=>[row.key,row]));
assert.strictEqual(result.roleCoverage.basis,'final-only');
assert.strictEqual(coverage.spec.total,result.finalLineup.length,'역할표에 보유 하위패나 미선택 유닛이 섞였습니다.');
assert.strictEqual(coverage.complete,false,'부분 미래 참고안을 완성 역할표로 표시했습니다.');
assert(['armor','slow','bossFrenzy'].some(key=>byKey[key]&&byKey[key].gap>0),'실제 남은 핵심 역할 결손이 숨겨졌습니다.');
assert.strictEqual(byKey.stunFull.required,true,'v17.7: 물딜 1.5 스턴은 마지막 우선순위 필수 하드 게이트다.');
assert.strictEqual(result.routeEvaluation.status,'insufficient');
assert.strictEqual(result.routeEvaluation.combatVerified,false,'정적 역할표를 50라 보스 화력 검증으로 승격했습니다.');
assert.strictEqual(result.decision.gates.operationalReady,false);
assert.strictEqual(result.wispBudget.available,1);
assert(result.wispBudget.required>result.wispBudget.available,'미래 일반 패 부족분이 누적 선택위습 빚에서 사라졌습니다.');
assert.strictEqual(result.wispBudget.required,result.wispBudget.worstCaseRequired);
assert.strictEqual(result.wispBudget.shortage,result.wispBudget.required-result.wispBudget.available);
assert.strictEqual(result.wispBudget.unfundedDebt,result.wispBudget.shortage);
assert.strictEqual(result.wispBudget.fullPartyFeasible,false);
assert.strictEqual(result.wispBudget.evidence,'future-random-drops-not-funded');
assert.strictEqual(result.handFit.feasible,false);
assert.strictEqual(result.handFit.hardConflictTotal,0);
assert.deepStrictEqual(result.safePrefix.actions.map(action=>action.id),['190H'],'현재 패로 증명된 쵸파 상위 외 미래 유닛을 확정했습니다.');
assert.strictEqual(result.safePrefix.wispUsed,1);
assert.strictEqual(result.safePrefix.stage.legendEquivalent,3);
assert.strictEqual(result.safePrefix.checkpointPass,false);
replaySafePrefix(state,result.safePrefix);

// UI 상단의 제어 판정도 플래너와 같은 하드 최소선을 사용해야 합니다.
// 예전 연구값 0.748 때문에 0.5스턴 조합을 "위험권"으로 되돌리면 안 됩니다.
const minimumControl=C.controlState({main:1,armor:180,stun:.5,slow:102,triggerSlow:0,boss:1,frenzy:1},'physical',{gorosei:'none'});
assert.strictEqual(minimumControl.status,'edge');
assert.strictEqual(minimumControl.label,'물딜 0.5 최소선 · 화력 미검증');
assert.strictEqual(minimumControl.expertStun,.5);

// 전 패를 털 수 있는 비교안도 클리어 게이트보다 앞설 수 없습니다.
const fullHandIds=['190H','N30h','F30h','M30h','540h','unit_1752903381904_1445','unit_1779015467592_9245'];
const altCounts=Object.fromEntries(fullHandIds.map(id=>[id,1]));
const altState=C.normalizeState(units,{counts:altCounts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
const altSpec=C.finalGradeSpec(altState,'physical',{gorosei:'none'},null);
const altProfile=C.clearProfileDetails(altSpec,'physical',{gorosei:'none',_upperUnit:altState.db.byId.get('190H')});
const altSlow=altProfile.requirements.find(row=>row.key==='slow');
assert.strictEqual(altSlow.current,95);
assert.strictEqual(altSlow.target-altSlow.current,7,'전 패 소모안은 안전 이감이 정확히 7 부족해야 합니다.');

// 선택 위습이 늘면 정확한 라인업은 바뀔 수 있다. 대신 현재 재고로
// 증명되는 prefix와 체크포인트 진행이 뒤로 가지 않아야 한다.
let previousProjected=-1,previousPrefixCount=-1,previousVector=null;
for(const wisp of [0,10,30,100,200]){
  const variedCounts=Object.assign({},counts,{[C.WISP_ID]:wisp});
  const variedState=C.normalizeState(units,{counts:variedCounts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
  const varied=P.planFinalSquad({state:variedState,settings:{mode:'physical',currentRound:25,targetSquadCount:9,upperPreviewId:'190H',superKumaOwned:true,recommendWarped:true}});
  assert(varied.projectedCount>=previousProjected,`선택위습 ${wisp}개에서 현재 제작 가능 환산이 감소했습니다.`);
  assert(varied.safePrefix.actions.length>=previousPrefixCount,`선택위습 ${wisp}개에서 확정 prefix가 짧아졌습니다.`);
  if(previousVector)assert(P._test.comparePriorityVectors(varied.safePrefix.rankVector,previousVector)<=0,`선택위습 ${wisp}개에서 체크포인트 prefix가 악화됐습니다.`);
  assert(varied.safePrefix.actions.length<=2,'현재 패 확정 영역이 재계산 범위를 넘어 고정 9기로 확장됐습니다.');
  assert.strictEqual(varied.routeEvaluation.combatVerified,false);
  replaySafePrefix(variedState,varied.safePrefix);
  if(varied.wispBudget.fullPartyFeasible){assert(varied.plannedCount>=varied.targetCount);assert.strictEqual(varied.wispBudget.shortage,0);}else assert(['future-random-drops-not-funded','role-incomplete'].includes(varied.wispBudget.evidence),`unexpected evidence: ${varied.wispBudget.evidence}`);
  previousProjected=varied.projectedCount;previousPrefixCount=varied.safePrefix.actions.length;previousVector=varied.safePrefix.rankVector;
}

console.log('PASS 25R hand exposes the unfunded future bill instead of claiming a fixed nine-unit clear');
console.log('PASS upper counts as three resource equivalents without becoming boss-damage proof');
console.log('PASS current-stock safePrefix is sequentially reproducible');
console.log('PASS larger selection-wisp budgets improve proven progress without freezing lineup identity');
