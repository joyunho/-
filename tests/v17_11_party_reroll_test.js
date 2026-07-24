'use strict';

// v17.11: 리롤 목표 안내 + 50라 위습 수입 전제 클리어 파티(9~11환산).
//  수입 모델: 선택 위습 0.6/라(로그 2판 실측 하한) · 랜덤 위습 2/라
//  (사용자 확인 맵 사실, 특정 흔함 기대 2/9/라). 확정 게이트는 불변.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));
const C=global.ORDCore;
const App=global.ORDApp.App;
const units=global.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('위습 수입 예측: 선택 0.6/라 실측 · 랜덤 2/라 · 흔함 기대 2/9/라 · 클램프',()=>{
  const projection=C.wispIncomeProjection(30,50);
  assert.strictEqual(projection.rounds,20);
  assert.strictEqual(projection.selectionPerRound,.6);
  assert.strictEqual(projection.selectionTotal,12);
  assert.strictEqual(projection.randomPerRound,2);
  assert.strictEqual(projection.randomTotal,40);
  assert.strictEqual(projection.commonKindPerRound,.22);
  assert.strictEqual(projection.measured.selection,true,'선택 위습은 실측 표시');
  assert.strictEqual(projection.measured.random,false,'랜덤 위습은 사용자 확인 가정 표시');
  // 50라를 넘긴 시점은 수입 0으로 클램프.
  assert.strictEqual(C.wispIncomeProjection(55,50).rounds,0);
});

test('리롤 목표: 부족 희귀 취합 + 1회당 k/41 · 남은 2회 내 1개 이상 확률',()=>{
  const app=Object.create(App.prototype);
  app.state={rerollsUsed:0,upperPreviewId:'',directionUpperId:'',mode:''};
  app.upperLock=()=>null;
  const db=C.buildDb(units);
  const state={db,counts:{}};
  const plan={squadPlan:{handFit:{futurePending:[
    {id:'K20h',name:'쵸파 혼포인트',tier:'rare',count:1,unitId:'x',unitName:'x'},
    {id:'W10h',name:'바르톨로메오',tier:'rare',count:2,unitId:'y',unitName:'y'},
    {id:'300h',name:'조로',tier:'common',count:3,unitId:'x',unitName:'x'}
  ]}}};
  const result=app.v151RerollTargets(state,plan,{rare:{reroll:[{id:'X90h',name:'X-드레이크',reroll:1}],conflict:false}});
  assert(result,'목표 없음');
  assert.strictEqual(result.kinds,2,'희귀만 목표로 취합해야 한다(흔함 제외)');
  assert.strictEqual(result.perRollPercent,4.9,'1회당 2/41=4.9%');
  // 1-(39/41)^2 = 9.5%
  assert.strictEqual(result.anyHitPercent,9.5,'남은 2회 내 1개 이상');
  assert.strictEqual(result.rollAway.length,1,'돌릴 무용 희귀 목록');
  // 리롤 소진 시 확률 0.
  app.state.rerollsUsed=2;
  const spent=app.v151RerollTargets(state,plan,{rare:{reroll:[],conflict:false}});
  assert.strictEqual(spent.rerollLeft,0);
  assert.strictEqual(spent.anyHitPercent,0);
});

test('클리어 파티: 선위 수입 시간표·랜덤 위습 기대·희귀 결손 분류',()=>{
  const app=Object.create(App.prototype);
  app.state={rerollsUsed:0,upperPreviewId:'F50h',directionUpperId:'',mode:'physical'};
  app.upperLock=()=>null;
  app.actualRound=()=>30;
  const db=C.buildDb(units);
  const state={db,counts:{},wisp:4};
  const plan={rows:[],squadPlan:{plannedCount:9,targetCount:9,
    finalLineup:[{id:'unit-now',name:'지금 가능'},{id:'unit-wisp',name:'선위 대기'},{id:'unit-common',name:'흔함 대기'},{id:'unit-rare',name:'희귀 결손'}],
    actions:[{id:'unit-now',wispCost:4},{id:'unit-wisp',wispCost:6}],
    handFit:{futurePending:[
      {id:'300h',name:'조로',tier:'common',count:2,unitId:'unit-common',unitName:'흔함 대기'},
      {id:'K20h',name:'쵸파 혼포인트',tier:'rare',count:1,unitId:'unit-rare',unitName:'희귀 결손'}
    ]}}};
  const party=app.v151ClearParty(state,plan);
  assert(party,'파티 없음');
  const byId=Object.fromEntries(party.rows.map(row=>[row.id,row]));
  assert.strictEqual(byId['unit-now'].tone,'now','누적 4선위는 보유 4로 지금 가능');
  // 누적 10선위, 보유 4 → 부족 6 → ceil(6/0.6)=10라 뒤 = 40라.
  assert.strictEqual(byId['unit-wisp'].tone,'wait');
  assert(byId['unit-wisp'].badge.includes('~40라'),`선위 도착 라운드: ${byId['unit-wisp'].badge}`);
  // 특정 흔함 2개 기대 = ceil(2/(2/9))=9라 뒤 = 39라.
  assert(byId['unit-common'].badge.includes('~39라'),`랜덤 위습 기대: ${byId['unit-common'].badge}`);
  assert(byId['unit-common'].badge.includes('랜덤 위습'));
  assert.strictEqual(byId['unit-rare'].tone,'rare');
  assert(byId['unit-rare'].badge.includes('쵸파'),'희귀 결손은 리롤 목표 이름을 보여준다');
  // 총 필요 10 vs 보유 4 + 수입 12 = 16 → 충당.
  assert.strictEqual(party.totalNeed,10);
  assert.strictEqual(party.projected,16);
  assert.strictEqual(party.funded,true);
});

test('배선: 상위 패널 파티 렌더 · 2번 패널 리롤 목표 · 가정 고지(소스 검증)',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('renderV151ClearParty(state,plan)'),'상위 패널 파티 렌더 누락');
  assert(app.includes('클리어 파티 참고안'),'파티 제목 누락');
  assert(app.includes('여유 확장(11환산 후보)'),'11환산 확장 누락');
  assert(app.includes('파티 확정은 현재 패 검증만 사용합니다'),'확정 게이트 불변 고지 누락');
  assert(app.includes('리롤 목표 ${rerollTargets.kinds}종'),'리롤 목표 블록 누락');
  assert(app.includes('/41 = ${rerollTargets.perRollPercent}%'),'적중 확률 표기 누락');
  assert(app.includes('돌릴 후보(사용처 없음)'),'돌릴 무용 희귀 안내 누락');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(css.includes('.v151-clear-party{'),'파티 CSS 누락');
  assert(css.includes('.v151-reroll-targets{'),'리롤 목표 CSS 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_11_PARTY_REROLL ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
