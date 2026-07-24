'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));

const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore;

const UPPER={id:'trust-upper',name:'검증용 물딜 상위',groupName:'초월 [물딜]',abilities:{},stuffs:[]};
const ARMOR={id:'trust-armor',name:'검증용 방깎',groupName:'전설 [물딜]',abilities:{'방어력 감소':180},stuffs:[]};
const SLOW={id:'trust-slow',name:'검증용 이감',groupName:'전설 [물딜]',abilities:{'이동속도 감소':102},stuffs:[]};
const STUN_HALF={id:'trust-stun-half',name:'검증용 0.5 스턴',groupName:'전설 [스턴]',abilities:{스턴:.5},stuffs:[]};
const STUN_FULL={id:'trust-stun-full',name:'검증용 1.5 스턴',groupName:'전설 [스턴]',abilities:{스턴:1.5},stuffs:[]};
const BOSS_FRENZY={id:'trust-boss-frenzy',name:'검증용 광보잡',groupName:'전설 [물딜]',abilities:{'보스 잡기':true,광폭화:true},stuffs:[]};
const FILLER_A={id:'trust-filler-a',name:'검증용 보강 A',groupName:'전설 [물딜]',abilities:{},stuffs:[]};
const FILLER_B={id:'trust-filler-b',name:'검증용 보강 B',groupName:'전설 [물딜]',abilities:{},stuffs:[]};
const RARE={id:'trust-rare',name:'검증용 잔여 희귀',groupName:'희귀함',abilities:{},stuffs:[]};
const CATALOG=[UPPER,ARMOR,SLOW,STUN_HALF,STUN_FULL,BOSS_FRENZY,FILLER_A,FILLER_B,RARE];

function stateFrom(counts){
  return C.normalizeState(CATALOG,{source:'trust-contract',counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});
}

function combatCounts(equivalent,stun){
  assert([7,8,9].includes(equivalent));
  const counts={
    [UPPER.id]:1,
    [ARMOR.id]:1,
    [SLOW.id]:1,
    [stun>=1.5?STUN_FULL.id:STUN_HALF.id]:1,
    [BOSS_FRENZY.id]:1,
    [C.WISP_ID]:0
  };
  if(equivalent>=8)counts[FILLER_A.id]=1;
  if(equivalent>=9)counts[FILLER_B.id]=1;
  return counts;
}

function resultFor(state,options={}){
  const actualUnits=P._test.finalEntries(state,state.counts);
  const finalLineup=options.finalLineup||actualUnits.map(unit=>({id:unit.id,name:C.displayNameOf(unit),unit,status:'owned'}));
  const plannedEquivalent=options.plannedEquivalent==null
    ?P._test.legendEquivalentCount(finalLineup.map(row=>row.unit).filter(Boolean))
    :options.plannedEquivalent;
  return{
    mode:'physical',
    magicRoute:'physical',
    afterStock:Object.assign({},options.afterStock||state.counts),
    actions:options.actions||[],
    finalLineup,
    plannedBoardCount:options.plannedBoardCount==null?finalLineup.length:options.plannedBoardCount,
    plannedLegendEquivalent:plannedEquivalent,
    rareAllocation:[]
  };
}

function timeline(equivalent,stun,round){
  const state=stateFrom(combatCounts(equivalent,stun));
  const result=resultFor(state);
  return P._test.timelineReadiness(
    state,
    result,
    {mode:'physical',magicRoute:'physical',currentRound:round,gorosei:'none'},
    [UPPER.id]
  );
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('active checkpoint follows the nearest live deadline after a passed checkpoint',()=>{
  const cases=[
    [25,30],[30,40],
    [31,40],[39,40],[40,45],
    [41,45],[44,45],[45,50],
    [46,50],[49,50],[50,50]
  ];
  for(const [round,dueRound] of cases){
    const value=timeline(9,1.5,round);
    assert.strictEqual(
      value.currentCheckpoint.dueRound,
      dueRound,
      `${round}라에 ${value.currentCheckpoint.dueRound}라 체크가 활성화됨`
    );
    const prefix=P._test.exactPrefixCheckpoint(round,value.actual,'physical','physical',value.rare.unassigned);
    assert.strictEqual(prefix.dueRound,dueRound,`${round}라 UI 체크와 safePrefix 목표가 다름`);
  }
});

test('survival checkpoints require eight equivalents at R45 and nine at R50',()=>{
  const t45Seven=timeline(7,1.5,45),t45Eight=timeline(8,1.5,45);
  const t50Eight=timeline(8,1.5,50),t50Nine=timeline(9,1.5,50);
  const r45Seven=t45Seven.checkpoints.find(row=>row.key==='r45');
  const r45Eight=t45Eight.checkpoints.find(row=>row.key==='r45');
  const r50Eight=t50Eight.checkpoints.find(row=>row.key==='r50');
  const r50Nine=t50Nine.checkpoints.find(row=>row.key==='r50');

  assert.strictEqual(r45Seven.requiredEquivalent,8);
  assert.strictEqual(r45Seven.pass,false,'환산 7을 45라 생존선으로 통과시킴');
  assert.strictEqual(r45Eight.pass,true,'환산 8의 완성 역할표가 45라 구조선을 통과하지 못함');
  assert.strictEqual(r50Eight.requiredEquivalent,9);
  assert.strictEqual(r50Eight.pass,false,'환산 8을 50라 보수 생존선으로 통과시킴');
  assert.strictEqual(r50Nine.pass,true,'환산 9의 완성 역할표가 50라 구조선을 통과하지 못함');

  assert.strictEqual(P._test.exactPrefixCheckpoint(45,t45Seven.actual,'physical','physical',0).equivalent,8);
  assert.strictEqual(P._test.exactPrefixCheckpoint(50,t50Eight.actual,'physical','physical',0).equivalent,9);
});

test('physical R50 blocks the 0.5-stun minimum and accepts 1.5 only as an unverified structural pass',()=>{
  const half=timeline(9,.5,50),full=timeline(9,1.5,50);
  const halfCheckpoint=half.checkpoints.find(row=>row.key==='r50');
  const fullCheckpoint=full.checkpoints.find(row=>row.key==='r50');

  assert.strictEqual(half.actual.spec.stun,.5);
  assert.strictEqual(half.actual.controlCore.pass,false,'DPS 근거 없는 0.5스턴을 50라 제어선으로 통과시킴');
  assert.strictEqual(halfCheckpoint.pass,false);
  assert(halfCheckpoint.blockers.some(text=>/1\.5|충분한.*스턴/.test(text)),halfCheckpoint.blockers);

  assert.strictEqual(full.actual.spec.stun,1.5);
  assert.strictEqual(full.actual.controlCore.pass,true);
  assert.strictEqual(fullCheckpoint.pass,true);
  assert.strictEqual(full.boss50.status,'unverified');
  assert.strictEqual(full.boss50.verified,false);
  assert.match(full.boss50.evidence,/DPS.*실측.*없/);
});

test('future blueprint and craftable stock never enter the actual checkpoint snapshot',()=>{
  const state=stateFrom({[C.WISP_ID]:0});
  const afterStock={
    [UPPER.id]:1,
    [ARMOR.id]:1,
    [C.WISP_ID]:0
  };
  const futureUnits=[UPPER,ARMOR,SLOW,STUN_FULL,BOSS_FRENZY,FILLER_A,FILLER_B];
  const finalLineup=futureUnits.map(unit=>({id:unit.id,name:C.displayNameOf(unit),unit,status:'future'}));
  const result=resultFor(state,{
    afterStock,
    actions:[{id:UPPER.id},{id:ARMOR.id}],
    finalLineup,
    plannedBoardCount:7,
    plannedEquivalent:9
  });
  const value=P._test.timelineReadiness(
    state,
    result,
    {mode:'physical',magicRoute:'physical',currentRound:50,gorosei:'none'},
    [UPPER.id]
  );

  assert.strictEqual(value.source,'tmo-live-roles+owned-final-count');
  assert.strictEqual(value.actual.boardCount,0);
  assert.strictEqual(value.actual.legendEquivalent,0);
  assert.deepStrictEqual(value.actual.unitIds,[]);
  assert.strictEqual(value.craftableNow.legendEquivalent,4);
  assert.strictEqual(value.blueprint.legendEquivalent,9);
  assert.strictEqual(value.checkpoints.find(row=>row.key==='r50').pass,false);
  assert.strictEqual(value.boss50.status,'blocked');
  assert.strictEqual(value.boss50.verified,false);
});

test('virtual spent or reserved rare cards never clear the actual round-50 rare gate',()=>{
  const counts=combatCounts(9,1.5);counts[RARE.id]=2;const state=stateFrom(counts),afterStock=Object.assign({},state.counts,{[RARE.id]:0}),result=resultFor(state,{afterStock});
  result.rareAllocation=[{id:RARE.id,name:RARE.name,initial:2,spent:2,reserved:0,remaining:0,conflict:0,usedBy:[]}];
  const value=P._test.timelineReadiness(state,result,{mode:'physical',magicRoute:'physical',currentRound:50,gorosei:'none'},[UPPER.id]),r50=value.checkpoints.find(row=>row.key==='r50');
  assert.strictEqual(value.rare.pass,true,'allocation 계산 자체는 충족해야 회귀가 유효합니다.');
  assert.strictEqual(value.rare.actualOwned,2);
  assert.strictEqual(value.rare.actualCleared,false);
  assert.strictEqual(value.boss50.rarePass,false);
  assert.strictEqual(r50.pass,false,'가상 spent가 실제 희귀 2장을 없앤 것으로 처리됨');
  assert.strictEqual(r50.craftablePass,true,'실제 제작 후에는 recoverable 계산이 가능해야 합니다.');
  assert(r50.blockers.some(text=>/실제 잔여 희귀 2장/.test(text)),r50.blockers);
});

test('actual eight and immediately craftable nine stays recoverable, never actual-pass',()=>{
  const state=stateFrom(combatCounts(8,1.5)),afterStock=Object.assign({},state.counts,{[FILLER_B.id]:1}),result=resultFor(state,{afterStock,actions:[{id:FILLER_B.id}]});
  const value=P._test.timelineReadiness(state,result,{mode:'physical',magicRoute:'physical',currentRound:50,gorosei:'none'},[UPPER.id]),r50=value.checkpoints.find(row=>row.key==='r50');
  assert.strictEqual(value.actual.legendEquivalent,8);
  assert.strictEqual(value.craftableNow.legendEquivalent,9);
  assert.strictEqual(r50.pass,false);
  assert.strictEqual(r50.craftablePass,true);
  assert.strictEqual(value.boss50.status,'recoverable');
});

test('current-stock guaranteed upper route outranks a zero-prefix-wisp speculative route',()=>{
  const common={prefixVector:[0,0],prefixActionCount:1,prefixRequirementPriority:[],prefixRareRemaining:0,prefixTierUse:{},prefixCommonPressure:0,prefixStoryProxy:0,roleComplete:true,clearComplete:true,fullyBuildable:true,handFeasible:true,wispFeasible:true,projectedCount:9,readiness:100,lineagePairs:0,controlCapOverflow:0,tierUse:{},wispCost:2,rareClearedTypes:0,rareUsedTypes:0,handFitMetrics:{},materialOverlapPenalty:0,controlExcessScore:0,excessStun:0,excessSlow:0,rareConflict:0,completion:80,upperName:'경로',upperId:'route'};
  const sure=Object.assign({},common,{guaranteed:true,prefixWispUsed:2,wispShortage:0,futureDependencyCount:0,upperId:'sure'}),speculative=Object.assign({},common,{guaranteed:false,prefixWispUsed:0,wispShortage:99,futureDependencyCount:9,upperId:'spec'});
  assert(P._test.upperBlueprintCompare(sure,speculative)<0,'미래 선위 부채 경로가 현재 패 보장 경로를 추월함');
});

test('v15 trust UI exposes evidence boundaries and never paints advice as clear proof',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8'),css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  const decision=app.slice(app.indexOf('  renderV151NextAction('),app.indexOf('  renderV151Preparation('));
  const gaps=app.slice(app.indexOf('  renderV151CurrentSpec('),app.indexOf('  v151BuildableLegendRows('));
  const coach=app.slice(app.indexOf('  renderCoach(state'),app.indexOf('  renderCoachDetails('));
  for(const phrase of ['decision.reason','stopCondition','패가 바뀌면','TMO 확인'])assert(decision.includes(phrase),phrase);
  assert(decision.includes('wispCost'),'정확한 행동 선위가 사라짐');
  assert(decision.includes('wispAfter'),'행동 후 유한 선위 잔액이 사라짐');
  assert(!decision.includes('클리어 확률'));
  assert(!gaps.includes('클리어 확률'));
  assert(!decision.includes('흔함 소비'));
  assert(coach.includes('renderV151NextAction(state,plan,health)'));
  assert(coach.includes('renderV151CurrentSpec(state,plan)'));
  assert(!coach.includes('renderV15RareBoard('));
  assert.strictEqual((coach.match(/data-region=/g)||[]).length,7);
  assert(css.includes('--v15-calc:#38c6e8'),'계산 조언의 청록색 근거 범례가 사라짐');
  assert(css.includes('--v15-observed:#36d58a'),'TMO 관측의 녹색 근거 범례가 사라짐');
  assert(css.includes('.v151-sync.ok:before'),'TMO 관측 상태의 시각 구분이 사라짐');
});

let passed=0;
const failures=[];
for(const [name,fn] of tests){
  try{
    fn();
    passed++;
    console.log('PASS',name);
  }catch(error){
    console.error('FAIL',name);
    console.error(error&&error.stack||error);
    failures.push([name,error]);
  }
}
console.log(`Trust-rebuild P0 contract tests: ${passed}/${tests.length} passed`);
if(failures.length)process.exitCode=1;
