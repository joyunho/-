'use strict';

// v17.8: 실전 로그 2판(20260723) 피드백 + 사용자 요구 7건 회귀.
//  1) 암브 가중치·정착 추정 모델(맵 확정 cap 75)과 정적 게이트 분리
//  2) 스펙 패널 밀집 행·심각도 정렬  3) 1번 패널 판단 데이터 스트립
//  4) 보스 카드 필요 vs 보유 대조  5) 상위 후보 선위·부족 희귀 명시
//  6) 상세 모달 상위 경로  7) 전멸 후 새 게임 라운드 자동 재정렬

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('암브 가중치: true=1 · 수치 값 유지 · 명시적 0은 무효(기존 abilityBool 버그 수정)',()=>{
  const cases=[['V20h',1],['W30h',1],['unit_1779016993983_754',.5],['990H',0]];
  for(const [id,weight] of cases){
    const unit=units.find(u=>u.id===id);
    assert(unit,`픽스처 유닛 없음: ${id}`);
    const profile=C.roleProfile(unit);
    assert.strictEqual(C.num(profile.armorBreakWeight),weight,`${id} 암브 가중치`);
    assert.strictEqual(profile.armorBreak,weight>0,`${id} 암브 불리언`);
  }
});

test('암브 정착 추정: 75×(1−0.5^w) · 상한 75 · 소스마다 체감',()=>{
  assert.strictEqual(C.ARMOR_BREAK_CAP,75);
  assert.deepStrictEqual([0,.5,1,2,3,5].map(C.armorBreakStacks),[0,22,38,56,66,73]);
  // 증가분 체감: w1→2 (+18) > w2→3 (+10) > w3→5 (+7)
  const inc=w=>C.armorBreakStacks(w+1)-C.armorBreakStacks(w);
  assert(inc(1)>inc(2)&&inc(2)>inc(3),'스택 증가분이 체감하지 않는다');
});

test('암브 모델: 62라 전멸 재현(정적 83·카이도 방어 395·암브 2소스) — 피해 +18.3%',()=>{
  const model=C.armorBreakModel({armorBreak:2,armorBreakUnits:2},{bossArmor:395,armorReduce:83});
  assert.strictEqual(model.stacks,56);
  assert.strictEqual(model.units,2);
  assert.strictEqual(model.measured,false,'암브 환산이 실측으로 위장됐다');
  assert.strictEqual(model.multiplierWithout,.138);
  assert.strictEqual(model.multiplierWith,.163);
  assert.strictEqual(model.gainPercent,18.3);
  assert(model.perStackGainPercent>0,'스택당 한계 효율 없음');
});

test('암브는 표시·참고 계산 전용 — 정적 방깎 하드 게이트를 낮추지 않는다',()=>{
  // 같은 정적 방깎에 암브 소스만 추가돼도 armor 필수 행의 current/gap은 불변.
  const spec=extra=>Object.assign({source:'t',mode:'physical',main:1,stun:1.5,slow:102,triggerSlow:0,triggerSlowSources:0,armor:120,triggerArmor:0,boss:1,frenzy:1,armorBreak:0,armorBreakUnits:0},extra);
  const settings={mode:'physical',gorosei:'none'};
  const without=C.deficits(spec({}),'physical',settings);
  const withAb=C.deficits(spec({armorBreak:3,armorBreakUnits:3}),'physical',settings);
  const armorOf=result=>result.requirements.find(row=>row.key==='armor');
  assert.strictEqual(armorOf(withAb).current,armorOf(without).current,'암브가 정적 방깎 현재값에 새어 들어갔다');
  assert.strictEqual(armorOf(withAb).gap,armorOf(without).gap,'암브가 방깎 게이트를 완화했다');
});

test('보유 집계: 스모커+베르고+S-샤크 = 가중 2.5 · 소스 3기',()=>{
  const counts={V20h:1,W30h:1,unit_1779016993983_754:1};
  const state=C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{}});
  const spec=C.currentSpec(state,'physical',{});
  assert.strictEqual(C.num(spec.armorBreak),2.5,'암브 가중 합');
  assert.strictEqual(C.num(spec.armorBreakUnits),3,'암브 소스 수');
});

test('UI 배선: 스펙 밀집 행·판단 스트립·보스 대조·후보 선위·상위 경로·중간재료 제거(소스 검증)',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('v151-spec-tiles'),'스펙 결손 타일 컨테이너 누락');
  assert(app.includes('v151-spec-summary'),'스펙 결손 요약 스트립 누락');
  assert(app.includes('severity(b)-severity(a)'),'심각도 정렬 누락');
  assert(app.includes('암브 ${C.num(abModel.units)}기 환산'),'스펙 암브 환산 주석 누락');
  assert(app.includes('v151ActionFacts'),'1번 패널 판단 데이터 스트립 누락');
  assert(app.includes('리롤 잔여'),'리롤 잔여 표기 누락');
  assert(app.includes('v151-route-quick'),'ROUTE_CHOICE 인라인 확정 누락');
  assert(app.includes('유효 방깎 = 정적'),'보스 카드 유효 방깎 대조 누락');
  assert(app.includes('vs 내 상위 추정 하한'),'보스 필요 vs 보유 대조 누락');
  assert(app.includes('충족 표시도 킬 보장 아님'),'킬 판정 금지 고지 누락');
  assert(app.includes('필요 선위 <b>'),'후보 카드 필요 선위 명시 누락');
  assert(app.includes('v151UpperPathsFor'),'상위 경로 계산기 누락');
  assert(app.includes('이 유닛으로 갈 수 있는 상위'),'상세 모달 상위 경로 섹션 누락');
  assert(!app.includes('직접 만들어야 하는 중간 재료'),'중간 재료 섹션이 남아 있다');
  assert(!app.includes('계산 검증 펼치기'),'계산 검증 섹션이 남아 있다');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(css.includes('.v151-spec-tile{'),'스펙 결손 타일 CSS 누락');
  assert(css.includes('.v151-action-facts{'),'판단 스트립 CSS 누락');
  assert(css.includes('.upper-path-grid{'),'상위 경로 CSS 누락');
});

test('전멸 후 새 게임 감지 시 라운드 자동 재정렬(소스 검증)',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('round-realigned-after-wipe'),'재정렬 감사 기록 누락');
  assert(app.includes('this._terminalWipeAt=Date.now()'),'전멸 시각 기록 누락');
  assert(app.includes('라운드를 1로 재정렬했습니다'),'재정렬 안내 문구 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_8_FEEDBACK ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
