'use strict';

// v17.10: 판정-결과 자동 대조 리포트.
//  실전 로그 2판(20260723)을 그대로 재생해 수동 분석과 같은 결론이
//  자동으로 나오는지 고정하고, 실행 감지(제작 확인 + 스냅샷 수량 증가)
//  오탐 방지와 앱 배선을 검증한다.

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const M=require(path.join(EXT,'ord_run_log_compactor.js'));

const tests=[];
function test(name,fn){tests.push([name,fn]);}
const loadEvents=name=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data',name),'utf8')).events;

test('실전 로그 B(물딜 62라 전멸): 수동 분석 결론이 자동으로 재현된다',()=>{
  const report=M.verdictReport(loadEvents('ORD_2305_20260723_215148_active.ordlog.json'));
  assert(report,'리포트 생성 실패');
  assert.strictEqual(report.endState,'wiped');
  assert.strictEqual(report.endRound,62);
  assert.strictEqual(report.wipe.lastLiveBoard,8);
  // 울티 2가 52~62라 11라운드 미실행 — 이 판의 핵심 결론.
  const ulti=report.unexecuted.find(row=>/울티/.test(row.name));
  assert(ulti,'울티 미실행 구간 누락');
  assert.strictEqual(ulti.toRound,62);
  assert(ulti.rounds>=10,`울티 미실행 ${ulti.rounds}라 — 10라 이상이어야 함`);
  // 방깎 결손이 끝까지 열려 있었다.
  const armor=report.deficits.find(row=>row.key==='armor');
  assert(armor&&armor.openAtEnd,'방깎 끝까지 개방이 잡히지 않음');
  assert(armor.openRounds>=30,`방깎 개방 ${armor.openRounds}라`);
  assert(armor.maxGap>=150,'방깎 최대 부족 과소');
  // 방향 선택 대기와 리롤 미사용.
  assert(report.waitCost.routeChoice>=10,'방향 선택 대기 라운드 과소');
  assert.strictEqual(report.reroll.used,0);
  assert(report.advice.length>=3,'조언이 3건 미만');
  assert(report.advice.some(text=>/울티/.test(text)),'조언에 미실행 추천 없음');
});

test('실전 로그 A(마딜 67라 도달): 종료 신호 없으면 active, 전멸 오탐 없음',()=>{
  const report=M.verdictReport(loadEvents('ORD_2305_20260723_064335_active.ordlog.json'));
  assert(report,'리포트 생성 실패');
  assert.strictEqual(report.endState,'active');
  assert.strictEqual(report.wipe,null);
  assert.strictEqual(report.endRound,67);
  // 실제 제작된 나미(29~33라 뒤 제작 감지)는 미실행에 없어야 한다 —
  // 스냅샷 수량 증가 기반 실행 감지의 오탐 방지.
  assert(!report.unexecuted.some(row=>/나미/.test(row.name)),'게임 내 제작된 나미가 미실행으로 오판됨');
  // 리롤 제안 다수·사용 0.
  assert(report.reroll.suggestedRounds>=5);
  assert.strictEqual(report.reroll.used,0);
  const bossFrenzy=report.deficits.find(row=>row.key==='bossFrenzy');
  assert(bossFrenzy&&bossFrenzy.openAtEnd,'광보잡 개방 누락');
});

test('합성: 제작 확인 이벤트가 스트릭을 실행 처리하고, 2라운드 스트릭은 보고하지 않는다',()=>{
  const decision=(round,state,action,requirements)=>({type:'decision',round,payload:{round,v15:{state,action:action?{id:action,name:action}:null,assessment:{requirements:requirements||[]}}}});
  const gap=(key,label,gapValue)=>({key,label,required:true,gap:gapValue,current:0,target:gapValue});
  // A는 3라운드 추천 뒤 제작 확인 → 실행 처리. B는 2라운드뿐 → 미보고.
  const events=[
    decision(10,'ACT_NOW','unit-A',[gap('armor','상시 풀방깎',50)]),
    decision(11,'ACT_NOW','unit-A',[gap('armor','상시 풀방깎',50)]),
    decision(12,'ACT_NOW','unit-A',[gap('armor','상시 풀방깎',50)]),
    {type:'user-action',round:12,payload:{action:'build-confirmed',steps:[{id:'unit-A'}]}},
    decision(13,'ACT_NOW','unit-B',[gap('armor','상시 풀방깎',20)]),
    decision(14,'ACT_NOW','unit-B',[gap('armor','상시 풀방깎',20)]),
    decision(15,'HOLD',null,[])
  ];
  const report=M.verdictReport(events);
  assert(report,'리포트 없음');
  assert.strictEqual(report.unexecuted.length,0,'실행된 A 또는 2라운드 B가 미실행으로 보고됨');
  const armor=report.deficits.find(row=>row.key==='armor');
  assert(armor&&armor.openRounds===5,`방깎 개방 라운드 ${armor&&armor.openRounds}`);
  assert.strictEqual(armor.openAtEnd,false,'마지막 판정에서 닫힌 결손이 끝까지 개방으로 표시됨');
});

test('합성: 3라운드 미실행 스트릭은 보고되고 전멸 이벤트에서 절단된다',()=>{
  const decision=(round,state,action)=>({type:'decision',round,payload:{round,v15:{state,action:action?{id:action,name:action}:null,assessment:{requirements:[]}}}});
  const events=[
    {type:'snapshot',payload:{schema:M.SNAPSHOT_SCHEMA,kind:'full',counts:{'unit-C':0},progress:{},currentAbilities:{}}},
    decision(50,'ACT_NOW','unit-C'),
    decision(51,'ACT_NOW','unit-C'),
    decision(52,'ACT_NOW','unit-C'),
    {type:'user-action',round:52,payload:{action:'suspected-terminal-wipe',round:52,lastLiveBoard:6}},
    // 전멸 뒤 새 게임 소음 — 리포트에 섞이면 안 된다.
    decision(1,'PREPARE',null),
    {type:'user-action',round:1,payload:{action:'rare-reroll-confirmed',targetId:'x'}}
  ];
  const report=M.verdictReport(events);
  assert.strictEqual(report.endState,'wiped');
  assert.strictEqual(report.endRound,52);
  assert.strictEqual(report.unexecuted.length,1);
  assert.strictEqual(report.unexecuted[0].id,'unit-C');
  assert.strictEqual(report.reroll.used,0,'전멸 뒤 이벤트가 리포트에 섞였다');
});

test('감사 수정: 선두가 잘린 로그(델타 체인 단절)는 미실행을 단정하지 않는다',()=>{
  // full 스냅샷 없이 delta만 남은 head-trim 로그 — 수량 증거가 없으므로
  // 3라운드 스트릭이라도 미실행으로 보고하면 안 된다.
  const decision=(round,action)=>({type:'decision',round,payload:{round,v15:{state:'ACT_NOW',action:{id:action,name:action},assessment:{requirements:[]}}}});
  const delta={type:'snapshot',round:10,payload:{schema:M.SNAPSHOT_SCHEMA,kind:'delta',counts:{},progress:{},currentAbilities:{}}};
  const report=M.verdictReport([delta,decision(10,'unit-D'),decision(11,'unit-D'),decision(12,'unit-D'),{type:'decision',round:13,payload:{round:13,v15:{state:'HOLD',action:null,assessment:{requirements:[]}}}}]);
  assert(report,'리포트 없음');
  assert.strictEqual(report.unexecuted.length,0,'증거 없는 구간의 스트릭이 미실행으로 단정됐다');
});

test('감사 수정: full 스냅샷 이후 구간은 수량 증거로 실행/미실행을 정상 판정한다',()=>{
  const decision=(round,action)=>({type:'decision',round,payload:{round,v15:{state:'ACT_NOW',action:{id:action,name:action},assessment:{requirements:[]}}}});
  const full=counts=>({type:'snapshot',payload:{schema:M.SNAPSHOT_SCHEMA,kind:'full',counts,progress:{},currentAbilities:{}}});
  const hold=round=>({type:'decision',round,payload:{round,v15:{state:'HOLD',action:null,assessment:{requirements:[]}}}});
  // 수량이 늘지 않는 3라운드 스트릭 → 미실행 보고.
  const stuck=M.verdictReport([full({'unit-E':0}),decision(20,'unit-E'),decision(21,'unit-E'),decision(22,'unit-E'),hold(23)]);
  assert.strictEqual(stuck.unexecuted.length,1,'증거 있는 미실행이 억제됐다');
  // 스트릭 뒤 수량 증가 → 실행 처리.
  const done=M.verdictReport([full({'unit-E':0}),decision(20,'unit-E'),decision(21,'unit-E'),decision(22,'unit-E'),full({'unit-E':1}),hold(23)]);
  assert.strictEqual(done.unexecuted.length,0,'수량 증가가 실행으로 인정되지 않았다');
});

test('앱 배선: 전멸·결과 저장 기록, 키 캐시 렌더, 50킬 체크포인트, 새 게임 캐시 초기화(소스 검증)',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes("this.recordVerdictReport('terminal-wipe')"),'전멸 시 리포트 기록 누락');
  assert(app.includes("this.recordVerdictReport(kind==='r50_killed'?'r50-checkpoint':'run-result')"),'결과 저장 시 항상 새 리포트 기록 누락');
  assert(app.includes("if(kind==='r50_killed')this._lastVerdictReport=null"),'50킬 체크포인트가 캐시를 고정한다');
  assert(app.includes("action:'verdict-report'"),'감사 이벤트 기록 누락');
  assert(app.includes('renderVerdictReport(this.verdictReportForDisplay())'),'결과 모달 키 캐시 렌더 누락');
  assert(app.includes('verdictReportForDisplay()'),'표시용 키 캐시 누락');
  assert((app.match(/this\.clearVerdictCache\(\)/g)||[]).length>=2,'새 게임·리셋 캐시 초기화 누락');
  assert(app.includes('판정-결과 자동 대조'),'리포트 제목 카피 누락');
  assert(app.includes('성공·실패 추정 아님'),'추정 금지 고지 누락');
  const css=fs.readFileSync(path.join(EXT,'ord_app.css'),'utf8');
  assert(css.includes('.verdict-report{'),'리포트 CSS 누락');
  // 재구성 전용 소비자는 digest를 계산하지 않는다(성능).
  const compactor=fs.readFileSync(path.join(EXT,'ord_run_log_compactor.js'),'utf8');
  assert(compactor.includes('{digest:false}'),'verdictReport 재구성 digest 생략 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_10_VERDICT ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
