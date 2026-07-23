'use strict';

// v17.6: 외부 감사 P0 확정 지적 수정 검증.
//  P0-1 리롤 총 2회 제한  P0-2 152킬 자격 풀  P0-3 단일·끝딜 분리
//  P0-4 상위 동적 역할 희귀 보호  P0-5 역할 완성 후 화력 보강
//  P0-6 첫 희귀·전설 마감 탈출  P0-7 기본 계통 자동

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
const P=global.ORDV15Policy;
const E=global.ORDV15Engine;
const units=global.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}
const byName=n=>units.find(u=>C.nameOf(u)===n)||units.find(u=>C.nameOf(u).startsWith(n));

// v16.7 리롤 테스트와 같은 실측 상태(로그7 58라 + 무용 마딜 희귀).
const REROLL_FIXTURE={
  counts:{'300h':1,'500h':3,'600h':1,'700h':1,'810e':5,'910h':1,F30h:1,IC0h:1,L00h:1,O20h:1,O30h:1,P00h:1,Q30h:1,Z20h:1,unit_1779016886375_9574:1,'120h':1},
  settings:rerollsUsed=>({mode:'physical',magicRoute:'auto',currentRound:58,gorosei:'warcury',postLegendRoute:'upper',virtualSpecialId:'610h',superKumaOwned:true,rerollsUsed}),
  locks:[{stage:'upper',id:'unit_1747756917990_920',source:'v15-exact-route'}]
};
function rerollDecision(rerollsUsed){
  return E.decide({catalog:units,snapshot:{source:'t',counts:REROLL_FIXTURE.counts,currentAbilities:{},wispCountFound:true,wispCount:5},settings:REROLL_FIXTURE.settings(rerollsUsed),locks:REROLL_FIXTURE.locks});
}

test('P0-1: 리롤 0/2에서는 리롤 후보가 나오고, 2/2 소진 후에는 전부 보류된다',()=>{
  const fresh=rerollDecision(0);
  const freshRows=(fresh.rare&&fresh.rare.rows||[]).filter(row=>C.num(row.reroll)>0);
  assert(freshRows.length>0,'0/2 상태에서 리롤 후보가 없다(픽스처 붕괴)');
  const spent=rerollDecision(2);
  const spentRows=(spent.rare&&spent.rare.rows||[]).filter(row=>C.num(row.reroll)>0);
  assert.strictEqual(spentRows.length,0,'2/2 소진 후에도 리롤 후보가 남았다');
  assert(!spent.rare.safeReroll,'소진 후 safeReroll이 남았다');
  assert.notStrictEqual(spent.state,'REROLL_ONE','소진 후 REROLL_ONE 상태가 나왔다');
  assert((spent.rare.rows||[]).some(row=>/리롤 2회/.test(row.reason||'')),'소진 사유 문구 없음');
});

test('P0-1: UI가 리롤 확정을 2회로 클램프·차단한다(소스 검증)',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes("Math.min(2,C.num(this.state.rerollsUsed)+1)"),'확정 핸들러 클램프 누락');
  assert(app.includes('리롤은 게임당 2회입니다'),'UI 이중 차단 누락');
  assert(app.includes('rerollsUsed:C.num(settings.rerollsUsed)'),'판단 캐시 키에 rerollsUsed 누락');
});

test('P0-2: 152킬 자격 풀은 압살롬 제외 32종이고 모델이 무자격 ID를 거부한다',()=>{
  const db=C.buildDb(units);
  const pool=C.eligible152Specials(db);
  assert.strictEqual(db.specials.length,33,'특별함 33종 전제');
  assert.strictEqual(pool.length,32,'자격 풀은 32종');
  assert(!pool.some(u=>u.id==='010h'),'압살롬이 자격 풀에 남아 있다');
  assert.strictEqual(C.eligible152SpecialId(db,'010h'),false);
  assert.strictEqual(C.eligible152SpecialId(db,pool[0].id),true);
  assert.strictEqual(C.eligible152SpecialId(db,'no-such-id'),false);
  // 모델: 압살롬 선택은 무시되고 거부 가정이 남는다.
  const model=M.build({catalog:units,snapshot:{source:'t',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts:{'810e':3},currentAbilities:{},wispCountFound:true,wispCount:3},settings:{mode:'',magicRoute:'auto',currentRound:10,gorosei:'none',virtualSpecialId:'010h',superKumaOwned:true},locks:[]});
  assert.strictEqual(C.num(model.effective.counts['010h']),0,'압살롬 가상 재료가 삽입됐다');
  assert((model.effective.assumptions||[]).some(a=>a.kind==='virtual-152-special-rejected'),'거부 가정 누락');
  // core normalizeState도 동일 거부.
  const state=C.normalizeState(units,{counts:{'810e':3},currentAbilities:{}},{virtualSpecialId:'010h',manualCounts:{}});
  assert.strictEqual(C.num(state.counts['010h']),0,'normalizeState가 압살롬을 삽입했다');
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert((app.match(/eligible152Specials/g)||[]).length>=3,'UI select 3곳이 자격 풀을 쓰지 않는다');
});

test('P0-3: 단일 전용·끝딜 전용 조합은 구조 통과하지 못한다',()=>{
  const spec=extra=>Object.assign({source:'t',mode:'magic',main:1,stun:1.6,slow:117,triggerSlow:0,triggerSlowSources:0,armor:0,triggerArmor:0,boss:1,frenzy:1,toki:0,single:0,end:0,singleEnd:0,singleEndUnits:3,singleEndExpected:3,singleEndMax:3,singleEndLargest:1,singleEndStable:2,magicDef:0,magicAmp:0,explosionAmp:0},extra);
  const settings={mode:'magic',magicRoute:'singleEnd',_resolvedMagicRoute:'singleEnd',gorosei:'none'};
  const singleOnly=C.deficits(spec({single:3,end:0}),'magic',settings);
  assert(singleOnly.clearRows.some(x=>x.key==='end'),'단일 3/끝딜 0이 통과했다');
  const endOnly=C.deficits(spec({single:0,end:3}),'magic',settings);
  assert(endOnly.clearRows.some(x=>x.key==='single'),'단일 0/끝딜 3이 통과했다');
  const balanced=C.deficits(spec({single:2,end:1}),'magic',settings);
  assert(!balanced.clearRows.some(x=>x.key==='single'||x.key==='end'),'단일 2/끝딜 1이 거부됐다');
});

test('P0-4: 상위 동적 필수 역할(끝딜)에 기여하는 유닛 제거가 보호 라벨을 남긴다',()=>{
  const zoro=byName('조로 1');
  const counts={'810e':5,D40h:1};counts[zoro.id]=1;
  const locks=[{stage:'upper',id:'D40h',source:'t'}];
  const model=M.build({catalog:units,snapshot:{source:'t',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:5},settings:{mode:'magic',magicRoute:'dual',currentRound:40,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true},locks});
  // dual 경로의 정적 그룹에는 end 키가 없다 — 보호는 이제 필수 역할
  // 전체 비교라 드래곤 needs의 끝딜 회귀를 잡아야 한다.
  const labels=E._test.liveRareProtection(model,model.effective.counts,P.ROUTES.dual,locks,zoro.id);
  assert(labels.some(label=>/끝딜/.test(label)),`끝딜 보호 라벨 누락: [${labels.join(', ')}]`);
});

// P0-5 픽스처: 물딜 필수 역할 전부 충족 + 아카이누(보스딜 희귀) 재료 보유.
// v17.7: 화력 예외는 combatGain(전투 기여 점수 상승)으로만 열리므로
// 스턴 전용 희귀(바제스)는 더 이상 트리거가 아니다 — 의도된 강화.
function firepowerFixture(round){
  const picks={F50h:1};
  for(const [n,c] of [['료쿠규 2',2],['에이스 (깍40 공증20 이감20)',2],['킹 3',1],['스모커 (이감50 암브)',1],['시키 (1스턴, 암브)',1],['바르톨로메오 (0.9스턴, 깍 12)',1],['킬러 (광보잡, 깍12)',1],['흰수염 (깍15 발동이감 보조딜)',1]]){
    const u=byName(n);assert(u,`픽스처 유닛 없음: ${n}`);picks[u.id]=(picks[u.id]||0)+c;
  }
  const akainu=units.find(u=>u.id==='P10h');
  for(const s of akainu.stuffs)picks[s.id]=(picks[s.id]||0)+s.count;
  picks['810e']=3;
  const locks=[{stage:'upper',id:'F50h',source:'t'}];
  return{model:M.build({catalog:units,snapshot:{source:'t',sessionId:'s',seq:round,at:round,dataChangedAt:round,counts:picks,currentAbilities:{},wispCountFound:true,wispCount:3},settings:{mode:'physical',magicRoute:'auto',currentRound:round,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true},locks}),locks};
}

test('P0-5: 역할표 완성 후에도 50라+에서는 화력 보강 제작이 승인된다',()=>{
  const{model,locks}=firepowerFixture(56);
  const ev=P.evaluate(model,model.effective.counts,P.ROUTES.physical,{round:56,locks});
  assert.strictEqual((ev.requirements||[]).filter(r=>r.required&&!r.waived&&C.num(r.gap)>0).length,0,'픽스처가 완전 충족 상태가 아니다');
  const decision=E.decide({model,locks});
  assert.strictEqual(decision.state,'ACT_NOW',`완성 상태 화력 보강이 ${decision.state}로 남았다`);
  assert.strictEqual(decision.action&&decision.action.id,'P10h','화력 보강 대상이 아카이누가 아니다');
  assert(/검증된 전투 기여 점수/.test(String(decision.reason||'')),'화력 보강 사유 문구 없음');
  assert(/화력 충분 판정은 하지 않습니다/.test(String(decision.reason||'')),'킬 판정 금지 고지 누락');
});

test('P0-5: 같은 상태라도 50라 이전에는 화력 보강 분기가 발동하지 않는다',()=>{
  const{model,locks}=firepowerFixture(40);
  const decision=E.decide({model,locks});
  assert.notStrictEqual(decision.state,'ACT_NOW','40라에서 화력 보강이 미리 발동했다');
});

// P0-6 픽스처: 합성 카탈로그 — 완성도 99% 불가 후보 vs 96% 즉시 가능 후보.
function deadlineFixture(round){
  const wisp={id:C.WISP_ID,name:'선택위습',groupName:'특수재료',abilities:{},stuffs:[]};
  const common={id:'dl-common',name:'흔함',groupName:'흔함',abilities:{},stuffs:[]};
  const rareTop={id:'dl-rare-top',name:'희귀 최고완성',groupName:'희귀함',abilities:{},stuffs:[{id:common.id,count:1},{id:C.WISP_ID,count:9}]};
  const rareNow={id:'dl-rare-now',name:'희귀 즉시가능',groupName:'희귀함',abilities:{},stuffs:[{id:common.id,count:1}]};
  const catalog=[wisp,common,rareTop,rareNow];
  return E.decide({catalog,snapshot:{source:'t',counts:{[common.id]:2,[C.WISP_ID]:2},currentAbilities:{},wispCountFound:true,wispCount:2,units:catalog.map(u=>Object.assign({},u,{count:u.id===common.id?2:0,tmoPercent:u.id===rareTop.id?99:u.id===rareNow.id?96:0}))},settings:{mode:'',magicRoute:'auto',currentRound:round,postLegendRoute:'',gorosei:'none',superKumaOwned:false,manualCounts:{}},locks:[]});
}

test('P0-6: 7라 마감 도달 시 제작 불가 99%에서 즉시 가능 96%로 전환한다',()=>{
  const early=deadlineFixture(5);
  assert.strictEqual(early.state,'PREPARE','마감 전에는 최고 완성도 우선(PREPARE) 유지');
  assert.strictEqual(early.blockedAction&&early.blockedAction.id,'dl-rare-top');
  const due=deadlineFixture(8);
  assert.strictEqual(due.state,'ACT_NOW',`마감 도달에도 ${due.state}`);
  assert.strictEqual(due.action&&due.action.id,'dl-rare-now','즉시 가능 차선으로 전환되지 않았다');
  assert(/마감 도달/.test(String(due.reason||'')),'마감 전환 고지 문구 없음');
  assert(due.evidence&&due.evidence.deadlineEscape&&due.evidence.deadlineEscape.dueRound===7,'deadlineEscape 증거 누락');
});

test('P0-7: 기본 계통은 자동이고 새 게임 리셋이 계통을 유지하지 않는다(소스 검증)',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes("tab:'coach',mode:'',magicRoute:'auto'"),'기본값이 자동이 아니다');
  assert(app.includes("state.mode=['','physical','magic'].includes(state.mode)?state.mode:'';"),'정규화 폴백이 자동이 아니다');
  assert(!/const keep=\{tab:'coach',mode:this\.state\.mode/.test(app),'새 게임 리셋이 계통을 계속 유지한다');
});

test('감사 후속: run_all SKIP 분리 집계·스토리 9단계 통일(소스 검증)',()=>{
  const runAll=fs.readFileSync(path.join(__dirname,'run_all.js'),'utf8');
  assert(runAll.includes('skippedRun'),'run_all SKIP 식별 누락');
  assert(runAll.includes('ORD_REQUIRE_ALL'),'CI 강제 스위치 누락');
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(!app.includes("['S','A','B','C','D'].map(x=>`<option"),'스토리 필터가 아직 5단계다');
  assert(app.includes('아홉 구간'),'스토리 안내문이 9단계가 아니다');
  const readme=fs.readFileSync(path.join(EXT,'README.txt'),'utf8');
  assert(readme.includes('SSS'),'README가 9단계(SSS~F)를 안내하지 않는다');
  assert(!readme.includes('7단계'),'README에 7단계 잔재가 남아 있다');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_6_AUDIT_P0 ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
