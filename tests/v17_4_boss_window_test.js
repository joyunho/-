'use strict';

// v17.4: 55라 도플라밍고 2연속 사망 대응.
//  - 정책: 50라 보스 창(dueRound>=50)부터 보스 화력 역할(단일·끝딜·1.5스턴·
//    토키)이 열린 그룹은 화력 없는 그룹 뒤에 설 수 없다.
//  - UI: 후보 카드 "왜" 설명(v151ClearWhy), 46라+ 보스 카운트다운 경고.
//  - 기록: routeCandidates에 clearValue 부분점수·nearestBuild 보존.

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

const P=global.ORDV15Policy;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

// 두 번째 55라 사망 로그의 실측 상태: 생존 조각(이감 7/117)은 부분 진행,
// 보스 화력(단일·끝딜 0.5/3 · 1.5스턴 0.4/1.5)은 열림.
function lateRole(){
  return{deficits:{requirements:[
    {key:'main',label:'상위 딜러',current:1,target:1,gap:0,required:true},
    {key:'bossFrenzy',label:'광보잡',current:1,target:1,gap:0,required:true},
    {key:'stunBase',label:'최소 0.5스턴',current:.9,target:.5,gap:0,required:true},
    {key:'slow',label:'이감 117%',current:110,target:117,gap:7,required:true},
    {key:'stunFull',label:'충분한 1.5스턴',current:1.1,target:1.5,gap:.4,required:true},
    {key:'singleEndExpected',label:'검증된 단일·끝딜',current:2.5,target:3,gap:.5,required:true}
  ]}};
}
const groupIndexOf=(groups,key)=>groups.findIndex(group=>group.keys.includes(key));

test('보스 창(55라): 단일·끝딜·1.5스턴 그룹이 이감 조각 그룹보다 앞선다',()=>{
  const groups=P._test.groupRows(P.ROUTES.singleEnd,lateRole(),{dueRound:55});
  const se=groupIndexOf(groups,'singleEndExpected'),sf=groupIndexOf(groups,'stunFull'),slow=groupIndexOf(groups,'slow');
  assert(se>=0&&sf>=0&&slow>=0,'그룹 누락');
  assert(sf<slow,`1.5스턴 그룹(${sf})이 이감 그룹(${slow}) 뒤다`);
  assert(se<slow,`단일·끝딜 그룹(${se})이 이감 그룹(${slow}) 뒤다`);
});

test('보스 창 이전(45라): 정적 순서 유지 — 이감이 단일·끝딜보다 앞',()=>{
  const groups=P._test.groupRows(P.ROUTES.singleEnd,lateRole(),{dueRound:45});
  const se=groupIndexOf(groups,'singleEndExpected'),slow=groupIndexOf(groups,'slow');
  assert(slow<se,'45라 창에서 보스 화력 부양이 미리 발동했다');
});

test('보스 창이라도 크게 열린 생존 풀(이감 75%)은 화력에 밀리지 않는다',()=>{
  const role=lateRole();
  for(const row of role.deficits.requirements)if(row.key==='slow'){row.current=25;row.gap=77;}
  const groups=P._test.groupRows(P.ROUTES.singleEnd,role,{dueRound:55});
  const se=groupIndexOf(groups,'singleEndExpected'),slow=groupIndexOf(groups,'slow');
  assert(slow<se,'생존 위기(이감 25/102 수준)가 보스 화력에 밀렸다 — 라인사가 보스보다 먼저 온다');
});

test('보스 창이라도 화력 역할이 닫혀 있으면 순서를 바꾸지 않는다',()=>{
  const role=lateRole();
  for(const row of role.deficits.requirements)if(row.key==='stunFull'||row.key==='singleEndExpected'){row.gap=0;}
  const groups=P._test.groupRows(P.ROUTES.singleEnd,role,{dueRound:55});
  const se=groupIndexOf(groups,'singleEndExpected'),slow=groupIndexOf(groups,'slow');
  assert(slow<se,'닫힌 화력 그룹이 여전히 부양됐다');
});

test('UI 배선: 후보 "왜" 설명 · 보스 카운트다운 경고 · CSS',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(app.includes('v151ClearWhy'),'후보 왜 설명 빌더 누락');
  assert(app.includes('v151-clear-why'),'왜 설명 마크업 누락');
  assert(app.includes('보스 화력 역할을 생존 조각보다 먼저 닫으세요'),'보스 경고 문구 누락');
  assert(app.includes('v151-boss-warn'),'보스 경고 마크업 누락');
  assert(css.includes('.v151-clear-why'),'왜 설명 CSS 누락');
  assert(css.includes('.v151-boss-warn'),'보스 경고 CSS 누락');
});

test('기록: routeCandidates에 clearValue 부분점수와 nearestBuild가 남는다',()=>{
  const compactorPath=path.join(EXT,'ord_run_log_compactor.js');
  const source=fs.readFileSync(compactorPath,'utf8');
  assert(source.includes('nearestBuild:row.nearestBuild===true'),'nearestBuild 기록 누락');
  assert(source.includes('deadlineFactor:rounded(value.deadlineFactor)'),'clearValue 기록 누락');
  delete require.cache[require.resolve(compactorPath)];
  const compactor=require(compactorPath);
  const compact=compactor._test&&compactor._test.compactV15RouteCandidate;
  assert(typeof compact==='function','compactV15RouteCandidate 테스트 노출 누락');
  const row=compact({id:'C50h',name:'핸콕',routeKey:'dual',feasible:false,wispGap:61,nearestBuild:true,clearValue:{value:.4064,story:.64,dpsCover:.016,line:.5,rareUtil:.25,utility:.805,roundsToGo:16,deadlineFactor:1}},0);
  assert.strictEqual(row.nearestBuild,true);
  assert(row.clearValue&&Math.abs(row.clearValue.value-.406)<.01,'clearValue.value 기록 오류');
  const bare=compact({id:'A40h',name:'흰수염',routeKey:'physical',feasible:true},1);
  assert.strictEqual(bare.clearValue,null,'clearValue 없는 행은 null');
  assert.strictEqual(bare.nearestBuild,false);
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_4_BOSS_WINDOW ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
