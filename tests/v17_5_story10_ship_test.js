'use strict';

// v17.5: 스토리 10 확정 보상 계획 + 해적선 활용.
//  - 레일리(히든)만 막힌 상위(핸콕 영원)는 스토리 10 보상 수령을 전제로
//    방향 후보에 남는다(storyReward 플래그).  다른 보상을 선언하면 제외.
//  - 전설·희귀 완성 단계에는 절대 크레딧이 새지 않는다.
//  - 해적선 보유 시 배 완성체(방주맥심 등)별 부족 희귀를 상시 노출.
//  - 확정 상위 예약 배지에 스토리 10 수령 안내가 붙는다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
const originalWarn=console.warn;
console.warn=()=>{};
for(const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const M=global.ORDV15Model;
const E=global.ORDV15Engine;
const units=global.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}
const find=(pat,groupPat)=>units.find(u=>pat.test(C.nameOf(u))&&(!groupPat||groupPat.test(C.groupName(u))));

function upperStageModel(story10Reward){
  const counts={'810e':12};
  for(const u of [find(/^마르코/,/전설/),find(/^킬러/,/히든|전설/),find(/흰수염/,/전설/)]){assert(u);counts[u.id]=1;}
  for(const pat of [/센토마루/,/와이퍼/,/^브룩/,/핸콕/,/기어\s*서드/,/^비비/,/^카쿠/,/호킨스/]){
    const u=units.find(x=>pat.test(C.nameOf(x))&&/희귀/.test(C.groupName(x)));assert(u);counts[u.id]=(counts[u.id]||0)+1;
  }
  return M.build({catalog:units,snapshot:{source:'test',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:12},settings:{mode:'',magicRoute:'auto',currentRound:26,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true,upperResearchLevel:1,story10Reward},locks:[]});
}

test('레일리 미보유 패: 핸콕 영원이 스토리 10 전제(storyReward)로 후보에 남는다',()=>{
  for(const choice of ['','rayleigh']){
    const rows=E._test.upperRouteCandidates(upperStageModel(choice),[]);
    const han=rows.find(r=>C.canonicalUpperId(r.id)===C.canonicalUpperId('C50h'));
    assert(han,`story10=${JSON.stringify(choice)}: 핸영 후보 누락`);
    assert.strictEqual(han.storyReward,true,'storyReward 플래그 누락');
    assert.strictEqual(han.feasible,false,'미수령 보상 전제 후보가 지금 제작 가능으로 표시됨');
    assert(/스토리 10 보상/.test(han.reason),'후보 사유에 수령 전제 문구 없음');
  }
});

test('다른 보상 선언(kuma/chest): 레일리 전제 후보를 제외한다',()=>{
  for(const choice of ['kuma','chest']){
    const rows=E._test.upperRouteCandidates(upperStageModel(choice),[]);
    assert(!rows.some(r=>C.canonicalUpperId(r.id)===C.canonicalUpperId('C50h')),`story10=${choice}에서 핸영이 남아 있다`);
  }
});

test('전설·희귀 완성 단계에는 스토리 크레딧이 새지 않는다',()=>{
  const counts={'810e':8};
  for(const pat of [/센토마루/,/와이퍼/,/^브룩/,/핸콕/,/기어\s*서드/]){
    const u=units.find(x=>pat.test(C.nameOf(x))&&/희귀/.test(C.groupName(x)));assert(u);counts[u.id]=1;
  }
  const model=M.build({catalog:units,snapshot:{source:'test',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:8},settings:{mode:'',magicRoute:'auto',currentRound:12,gorosei:'none',postLegendRoute:'',superKumaOwned:true,story10Reward:''},locks:[]});
  assert.strictEqual(C.num(model.effective.counts[C.RAYLEIGH_HIDDEN_ID]),0,'유효 보드에 가상 레일리가 있다');
  const decision=E.decide({model,locks:[]});
  const mentioned=[decision.action&&decision.action.name].concat((decision.alternatives||[]).map(row=>row.name)).filter(Boolean).join(' ');
  assert(!/레일리/.test(mentioned),'전설 단계 추천에 레일리 경로가 등장했다');
});

test('확정 상위 예약: 레일리 차단 시 스토리 10 수령 안내가 붙는다',()=>{
  const counts={'810e':12};
  for(const u of [find(/^마르코/,/전설/),find(/^킬러/,/히든|전설/),find(/흰수염/,/전설/)])counts[u.id]=1;
  for(const pat of [/센토마루/,/와이퍼/,/^브룩/,/핸콕/,/기어\s*서드/,/^비비/,/^카쿠/,/호킨스/]){
    const u=units.find(x=>pat.test(C.nameOf(x))&&/희귀/.test(C.groupName(x)));counts[u.id]=(counts[u.id]||0)+1;
  }
  const model=M.build({catalog:units,snapshot:{source:'test',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:12},settings:{mode:'magic',magicRoute:'singleEnd',currentRound:30,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true,story10Reward:''},locks:[]});
  const decision=E.decide({model,locks:[{stage:'upper',id:'C50h',source:'test'}]});
  assert(decision.upperReserve,'상위 예약 정보 누락');
  assert.strictEqual(decision.upperReserve.storyRewardNeeded,true,'storyRewardNeeded 플래그 누락');
});

test('해적선 활용 계획: 부족 희귀가 리롤 목표로 나열된다',()=>{
  require(path.join(EXT,'ord_upper_memo.js'));
  require(path.join(EXT,'ord_synergy_memo.js'));
  require(path.join(EXT,'ord_squad_planner.js'));
  require(path.join(EXT,'ord_app.js'));
  const App=global.ORDApp.App;
  const app=Object.create(App.prototype);
  const db=C.buildDb(units);
  const moby=units.find(u=>u.id==='Q30h');
  const partial={};
  partial[C.PIRATE_SHIP_ID]=2;
  for(const s of moby.stuffs)if(s.id!==C.PIRATE_SHIP_ID)partial[s.id]=1;
  const jozu=moby.stuffs.find(s=>s.id!==C.PIRATE_SHIP_ID);
  partial[jozu.id]=0;
  const plan=app.v151ShipPlan({db,counts:partial});
  assert(plan&&plan.shipCount===2,'배 보유 수 인식 실패');
  // v17.9: 전설급 완성체와 상위(제한됨) 소비를 구분해 반환한다.
  assert(plan.legendRows.length>=3,'배 전설급 완성체 3종이 모두 나열되어야 한다');
  assert(plan.legendRows.every(row=>row.kind==='legend'),'전설급 그룹에 다른 등급이 섞였다');
  assert(plan.upperRows.every(row=>row.kind==='upper'),'상위 그룹에 다른 등급이 섞였다');
  const mobyRow=plan.legendRows.find(row=>row.unit.id==='Q30h');
  assert(mobyRow,'모비딕호 행 누락');
  assert.strictEqual(mobyRow.feasible,false);
  assert(mobyRow.missing.some(m=>m.id===jozu.id),'부족 재료가 나열되지 않았다');
  assert.strictEqual(plan.legendRows[0].missing.length<=plan.legendRows[plan.legendRows.length-1].missing.length,true,'부족 적은 순 정렬 위반');
  assert(plan.recommendedId,'추천 대상이 비어 있다');
  assert.strictEqual(app.v151ShipPlan({db,counts:{}}),null,'배 없으면 계획 없음');
});

test('배선: 설정·배지·패널·기록 필드',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  const compactor=fs.readFileSync(path.join(EXT,'ord_run_log_compactor.js'),'utf8');
  assert(app.includes('data-opt="story10Reward"'),'스토리 10 설정 셀렉트 누락');
  assert(app.includes('story10Reward:this.state.story10Reward'),'settings 전달 누락');
  assert(app.includes('v151-story10-badge'),'후보 배지 누락');
  assert(app.includes('v151-ship-plan'),'해적선 계획 블록 누락');
  assert(app.includes('스토리 10 보상에서 레일리+해적선을 선택해야 열립니다'),'예약 배지 안내 누락');
  assert(css.includes('.v151-ship-plan'),'배 계획 CSS 누락');
  assert(css.includes('.v151-story10-badge'),'배지 CSS 누락');
  assert(compactor.includes('storyReward:row.storyReward===true'),'기록 storyReward 필드 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_5_STORY10_SHIP ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
