'use strict';

// v17.1: 정규화 스킬 프로필(사용자 제공, ord-all-upper-skill-profile/1.0)
// 다이제스트 검증.
//  - 72개 TMO 코드 전량 커버(본체 61 + 폼·분기 11)
//  - allowKillVerdict=false 정책 보존: 시뮬레이터는 참고치만 반환
//  - 평타 한정 보스 타임라인 산수(재생 차감·잔여 HP) 검증

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
  'ord_core.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('스킬 다이제스트는 전투 수치 72개 TMO 코드를 전량 커버한다',()=>{
  const skills=global.ORD_UPPER_SKILLS,combat=global.ORD_UPPER_COMBAT;
  assert.strictEqual(skills.version,'2305C');
  assert.strictEqual(skills.allowKillVerdict,false,'킬 판정 금지 정책이 다이제스트에 보존돼야 한다');
  const combatCodes=Object.keys(combat.rows),covered=combatCodes.filter(code=>skills.byTmo[code]);
  assert.strictEqual(covered.length,combatCodes.length,`uncovered: ${combatCodes.filter(code=>!skills.byTmo[code]).join(',')}`);
});

test('크로커다일 프로필: 트리거·확률·데미지 클래스가 구조화되어 있다',()=>{
  const croc=units.find(u=>u.id==='F50h');
  const profile=C.upperSkillProfile(croc);
  assert(profile,'F50h 프로필 누락');
  assert.strictEqual(profile.id,'limited.crocodile');
  assert(profile.skills.length>=3,'스킬 수 부족');
  const proc=profile.skills.find(s=>s.t==='attack_proc'&&s.p!=null);
  assert(proc,'확률 발동 스킬 누락');
  assert(proc.p>0&&proc.p<1,'확률은 0~1 소수');
  const damaged=profile.skills.find(s=>s.d>0);
  assert(damaged&&['physical','magic'].includes(damaged.dc),'데미지 클래스 누락');
});

test('폼·분기 유닛도 codes 매핑으로 프로필이 조회된다',()=>{
  const phoenix=units.find(u=>(u.codes||[]).includes('Q90h'))||units.find(u=>u.id==='Q90h');
  assert(phoenix,'마르코 불사조폼 카탈로그 누락');
  const profile=C.upperSkillProfile(phoenix);
  assert(profile,'폼 유닛 프로필 조회 실패');
});

test('simulateBossFlat: 평타 한정 참고치이며 킬 판정을 내리지 않는다',()=>{
  const roger=units.find(u=>u.id==='J40h')||units.find(u=>(u.codes||[]).includes('J40h'));
  const sim=C.simulateBossFlat(roger,1,{round:50,gorosei:'saturn',armorReduce:211,speedBuffPct:0});
  assert(sim,'시뮬 결과 없음');
  assert.strictEqual(sim.verdictAllowed,false,'verdictAllowed는 false 고정');
  assert.strictEqual(sim.basis,'flat-attack-only');
  assert.strictEqual(sim.windowSec,60);
  // 산수 검증: dealt = max(0, effectiveDps - regen) × 60, remaining = hp - dealt.
  const expectDealt=Math.min(Math.max(0,sim.effectiveDps-sim.regen)*60,sim.hp);
  assert(Math.abs(sim.dealt-expectDealt)<1,'dealt 산수 불일치');
  assert(Math.abs(sim.remaining-Math.max(0,sim.hp-expectDealt))<1,'remaining 산수 불일치');
  // 로저 평타 963,047 × 상성/방어 배율로는 센고쿠 1.976억을 60초에 못 깎는다.
  assert(sim.remaining>0,'평타 단독으로 센고쿠 처치가 나오면 산수가 잘못된 것');
  const withSkills=C.simulateBossFlat(roger,1,{round:50,gorosei:'saturn',armorReduce:211,skillDps:5e7});
  assert(withSkills.remaining<sim.remaining,'skillDps 훅이 잔여 HP를 줄여야 한다');
});

test('UI·번들 배선: 다이제스트 로드와 상세 프로필 표시가 존재한다',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  assert(app.includes('upperSkillProfile'),'상세 프로필 접근 누락');
  assert(app.includes('detail-skill-profile'),'상세 프로필 마크업 누락');
  assert(app.includes('킬 판정은 AST 정규화 후'),'킬 판정 비활성 고지 누락');
  const helper=fs.readFileSync(path.join(EXT,'ord_helper.html'),'utf8');
  assert(helper.includes('ord_upper_skill_digest.js'),'helper 로드 누락');
  assert(fs.existsSync(path.resolve(__dirname,'../data/ORD_2305C_all_upper_skill_profiles.json')),'원본 프로필 보관 누락');
});

let failures=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);}
  catch(error){failures+=1;console.error(`FAIL ${name}`);console.error(error&&error.message||error);}
}
console.log(`V17_1_SKILL_PROFILE ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exit(1);
