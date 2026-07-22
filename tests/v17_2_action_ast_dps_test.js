'use strict';

// v17.2: 액션 AST(2.0-action-ast) 정적 도출 검증.
//  - 63 프로필 전량에 도출 결과 존재, strict ≤ approx 불변식
//  - strict는 명시 확률 게이트 프록만 포함(예: 로저 4.5%×145만=65,250/타)
//  - upperSkillProcDps: 공속·방어 반영 DPS 하한, universal은 방어 무시
//  - allowKillVerdict=false 정책이 도출 산출물에도 보존

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
  'ord_core.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;
const TABLE=global.ORD_UPPER_SKILL_DPS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}
const byId=id=>units.find(u=>u.id===id)||units.find(u=>(u.codes||[]).includes(id));

test('도출 산출물: 63 프로필 전량 · strict ≤ approx · 킬 판정 금지 보존',()=>{
  // v17.3: FSM 트레인 도출이 같은 테이블을 재생성한다 — 정책 필드는 불변.
  assert.strictEqual(TABLE.version,'2305C-fsm-trains-1');
  assert.strictEqual(TABLE.allowKillVerdict,false,'allowKillVerdict=false 정책 보존');
  assert.strictEqual(TABLE.allowSkillDpsDerivation,true);
  const profiles=Object.entries(TABLE.byProfile);
  assert.strictEqual(profiles.length,63,'전투 프로필 63개');
  for(const [id,row] of profiles){
    const strict=row.perAttack.strict.affected+row.perAttack.strict.universal;
    const approx=row.perAttack.approx.affected+row.perAttack.approx.universal;
    assert(strict>=0&&approx>=0,`${id} 음수 기대값`);
    assert(strict<=approx+1e-6,`${id} strict(${strict}) > approx(${approx})`);
  }
});

test('로저: 4.5% 프록(기대 65,250/타)이 strict로 도출된다',()=>{
  const roger=TABLE.byProfile['immortal.roger'];
  assert(roger,'로저 프로필 누락');
  const strict=roger.perAttack.strict.affected+roger.perAttack.strict.universal;
  assert(Math.abs(strict-65250)<1,`로저 strict/타 ${strict} (기대 65,250)`);
});

test('upperSkillProcDps: 공속 반영 DPS 하한 + universal 방어 무시',()=>{
  const roger=byId('J40h');
  const result=C.upperSkillProcDps(roger,1,{bossArmor:350,armorReduce:211,speedBuffPct:0});
  assert(result,'로저 스킬 프록 DPS 없음');
  assert.strictEqual(result.basis,'static-lower-bound-attack-proc-and-rng-trains');
  // 공속배율 3.1 / BAT 0.49 → 약 6.327타/초.
  assert(Math.abs(result.attacksPerSec-3.1/0.49)<.01,'attacksPerSec 불일치');
  // affected 버킷은 방어 배율(350-211=139 → 0.2646)을 곱해야 한다.
  const strict=TABLE.byProfile['immortal.roger'].perAttack.strict;
  let expected=strict.universal*result.attacksPerSec+strict.affected*result.attacksPerSec*C.armorMultiplier(139);
  // v17.3: RNG 게이트 트레인 기대치가 더해진다(BD1 재진입은 1/지속시간 상한).
  const trainSlot=TABLE.trainsByProfile&&TABLE.trainsByProfile['immortal.roger'];
  for(const train of trainSlot&&trainSlot.trains||[]){
    const rate=Math.min(result.attacksPerSec*train.p,train.dur>0?1/train.dur:result.attacksPerSec*train.p);
    expected+=((train.e&&train.e.universal||0)+(train.e&&train.e.affected||0)*C.armorMultiplier(139))*rate;
  }
  assert(Math.abs(result.dps-expected)<1,`dps ${result.dps} vs ${expected}`);
  assert(result.dps>0,'하한은 양수여야 한다');
});

test('simulateBossFlat에 스킬 하한을 결합하면 잔여 HP가 줄어든다',()=>{
  const roger=byId('J40h');
  const proc=C.upperSkillProcDps(roger,1,{bossArmor:350,armorReduce:211});
  const flat=C.simulateBossFlat(roger,1,{round:50,gorosei:'saturn',armorReduce:211});
  const withSkill=C.simulateBossFlat(roger,1,{round:50,gorosei:'saturn',armorReduce:211,skillDps:proc.dps});
  assert(withSkill.remaining<=flat.remaining,'스킬 하한 결합이 잔여 HP를 늘릴 수 없다');
  assert.strictEqual(withSkill.verdictAllowed,false,'킬 판정은 여전히 금지');
});

test('UI·번들 배선: 스킬 DPS 모듈 로드와 결합 표시가 존재한다',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('upperSkillProcDps'),'panel 7 결합 표시 누락');
  assert(app.includes('AST 하한'),'하한 표기 누락');
  const helper=fs.readFileSync(path.join(EXT,'ord_helper.html'),'utf8');
  assert(helper.includes('ord_upper_skill_dps.js'),'helper 로드 누락');
  assert(fs.existsSync(path.resolve(__dirname,'../data/ORD_2305C_all_upper_skill_profiles_action_ast.json')),'AST 원본 보관 누락');
  assert(fs.existsSync(path.resolve(__dirname,'../tools/derive_skill_dps.js')),'도출 도구 누락');
});

let failures=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);}
  catch(error){failures+=1;console.error(`FAIL ${name}`);console.error(error&&error.message||error);}
}
console.log(`V17_2_ACTION_AST_DPS ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exit(1);
