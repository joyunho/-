'use strict';

// v16.9: 사용자 검증 2.305 [C] 맵 데이터 반영 검증.
//  - 보스 HP·재생·타이머와 "보스 단독 최소 실효 DPS" 재현
//  - 인게임 수동 업그레이드 가산(미입력 null과 0 구분)
//  - 이감 102/117 · 방깎 180/211(워큐리 190/221) · 스턴 운용 1.0 상수
//  - 상위 라인 자립도 표(공략 근거, unknown 기본)와 보조딜 요구 배선
//  - 152킬 = 시작 시 1/32 고정 추첨 모델 · 희귀 리롤 1/41 카피

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
  'ord_core.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('보스 단독 최소 실효 DPS가 검증표를 재현한다',()=>{
  assert.strictEqual(C.bossPreview(21,'saturn').round,30);
  assert.strictEqual(C.bossPreview(30,'saturn').dpsNeed,118750,'30라 에넬');
  assert.strictEqual(C.bossPreview(40,'warcury').dpsNeed,459167,'40라 루치');
  assert.strictEqual(C.bossPreview(50,'nasjuro').dpsNeed,3293333,'50라 센고쿠(오로성 보정은 신세계부터)');
  assert.strictEqual(C.bossPreview(60,'warcury').dpsNeed,4447656,'60라 빅맘 워큐리');
  assert.strictEqual(C.bossPreview(60,'nasjuro').dpsNeed,4916406,'60라 빅맘 나스쥬로');
  assert.strictEqual(C.bossPreview(65,'warcury').dpsNeed,4698516,'65라 카이도 워큐리');
  assert.strictEqual(C.bossPreview(65,'nasjuro').dpsNeed,5167266,'65라 카이도 나스쥬로');
  const sixty=C.bossPreview(60,'saturn');
  assert.strictEqual(sixty.time,32,'신세계 보스는 32초');
  assert.strictEqual(sixty.regen,725000,'새턴 보스 재생 72.5만/초');
  assert.strictEqual(C.bossPreview(50,'saturn').time,60,'50라 이전 보스는 60초');
});

test('보스 미리보기가 직전/동시 라인 웨이브를 구분해 노출한다',()=>{
  const fifty=C.bossPreview(46,'warcury');
  assert.strictEqual(fifty.round,50);
  assert.strictEqual(fifty.line.round,49,'50라 보스는 직전 49라 라인');
  assert.strictEqual(fifty.line.name,'아카이누');
  assert.strictEqual(fifty.line.withBoss,false);
  assert.strictEqual(fifty.line.hp,34650000,'구세계 라인은 오로성 몹 HP 보정 없음');
  const sixty=C.bossPreview(56,'warcury');
  assert.strictEqual(sixty.line.round,60,'신세계 보스는 동시 라인');
  assert.strictEqual(sixty.line.hp,124251000+20000000,'워큐리 몹 HP +2000만');
  assert.strictEqual(sixty.line.armor,180+10,'워큐리 몹 방어 +10');
  assert.strictEqual(sixty.line.withBoss,true);
});

test('수동 업그레이드는 입력된 필드만 가산하고 미입력은 건드리지 않는다',()=>{
  const snapshot={counts:{},currentAbilities:{},wispCountFound:true,wispCount:0};
  const base={mode:'physical',gorosei:'saturn'};
  const state=C.normalizeState(units,snapshot,base);
  const plain=C.currentSpec(state,'physical',base);
  const upgraded=C.currentSpec(state,'physical',Object.assign({},base,{manualUpgrades:{slow:10,attack:25,regen:null,mana:'',speed:null,round:41}}));
  assert.strictEqual(C.num(upgraded.slow),C.num(plain.slow)+10,'이감업 +10 가산');
  assert.strictEqual(C.num(upgraded.attack),C.num(plain.attack)+25,'공업 +25 가산');
  assert.strictEqual(C.num(upgraded.regen),C.num(plain.regen),'null 미입력은 불변');
  assert.strictEqual(C.num(upgraded.mana),C.num(plain.mana),'빈 문자열 미입력은 불변');
  assert(upgraded.source.includes('수동 업그레이드'),'가산 출처 표기');
  const untouched=C.currentSpec(state,'physical',Object.assign({},base,{manualUpgrades:{slow:null,attack:null,regen:null,mana:null,speed:null,round:null}}));
  assert(!untouched.source.includes('수동 업그레이드'),'전부 미입력이면 출처 표기도 없다');
});

test('검증 상수: 이감 102/117 · 방깎 180/211(워큐리 190/221) · 스턴 운용 1.0',()=>{
  assert.strictEqual(C.GOROSEI.none.slowPhysical,102);
  assert.strictEqual(C.GOROSEI.nasjuro.slowPhysical,117,'117은 나스쥬로 이속 +15% 상쇄 조건부 목표');
  assert.strictEqual(C.GOROSEI.none.armorSoft,180);
  assert.strictEqual(C.GOROSEI.none.armorSafe,211,'공개 공략 풀방깎 목표');
  assert.strictEqual(C.GOROSEI.warcury.armorSoft,190,'워큐리 몹 방어 +10 반영');
  assert.strictEqual(C.GOROSEI.warcury.armorSafe,221);
  assert.strictEqual(C.CONTROL_ENVELOPE.physicalOperationalStun,1,'스턴 운용선 1.0');
  assert.strictEqual(C.CONTROL_ENVELOPE.magicOperationalStun,1);
  assert.strictEqual(C.CONTROL_ENVELOPE.physicalExpertStun,.5,'0.5 하드 최소 유지');
  assert.strictEqual(C.CONTROL_ENVELOPE.stableStun,1.5,'1.5 안정선 유지');
});

test('상위 라인 자립도: self는 보조딜 강제 없음, support는 요구, 미등재는 unknown',()=>{
  const byId=id=>units.find(u=>u.id===id);
  const nami=C.upperStrategy(byId('V80H'));
  assert.strictEqual(nami.lineSelf,'self','나미 초월은 라인 자립');
  assert(!nami.needs.some(n=>n.key==='subdamage'),'자립형에 보조딜 강제 금지');
  const ryuma=C.upperStrategy(byId('JC0h'));
  assert.strictEqual(ryuma.lineSelf,'support');
  assert(ryuma.needs.some(n=>n.key==='subdamage'),'류마 영원은 보조·방무딜 요구');
  const dragon=C.upperStrategy(byId('D40h'));
  assert.strictEqual(dragon.lineSelf,'support');
  assert(!dragon.needs.some(n=>n.key==='subdamage'),'드래곤은 단일·끝딜 요구가 라인 보강을 대신한다');
  assert(dragon.needs.some(n=>n.key==='single'),'드래곤 단일 요구 유지');
});

test('152킬 풀은 특별함 33종 중 압살롬 제외 32종이다',()=>{
  const db=C.buildDb(units);
  const specials=db.units.filter(u=>C.isSpecialTier(u));
  assert.strictEqual(specials.length,33,'특별함 총수');
  const pool=specials.filter(u=>!/압살롬/.test(C.nameOf(u)));
  assert.strictEqual(pool.length,32,'압살롬 제외 32종 균등 풀');
});

test('UI·정책 카피: 1/32 고정 추첨, 리롤 1/41, 전설 환산 경제선',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('1/32'),'152킬 고정 추첨 카피 누락');
  assert(app.includes('1/41'),'리롤 확률 카피 누락');
  assert(app.includes('v151-upg-row'),'수동 업그레이드 입력 UI 누락');
  assert(app.includes('v151-boss-preview'),'보스 미리보기 UI 누락');
  assert(app.includes('v151-line-badge'),'라인 자립 배지 누락');
  const policy=fs.readFileSync(path.join(EXT,'ord_v15_policy.js'),'utf8');
  assert(policy.includes('전설 환산(경제선)'),'환산 경제선 라벨 누락');
});

let failures=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);}
  catch(error){failures+=1;console.error(`FAIL ${name}`);console.error(error&&error.message||error);}
}
console.log(`V16_9_MAP_DATA ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exit(1);
