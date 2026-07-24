(function(global){
'use strict';

const VERSION='17.9.0';
const WISP_ID='810e';
const SUPER_KUMA_ID='unit_1767884940750_9880';
// v17.5: 스토리 10라운드 확정 보상 — 레일리(히든)+해적선 묶음을 다른
// 선택지(초월 쿠마·유니크 아이템·목재/골드 상자)와 맞바꾼다.
const PIRATE_SHIP_ID='unit_1767884925665_1037';
const STORY10_FORFEITS='초월 쿠마 · 유니크 아이템 · 목재/골드 상자';
const MAX_WISP_COST=23;
const PREFERRED_WISP_COST=10;
const WATCH_CANDIDATE_CAP=6;
const POST_LEGEND_ROUTES={CHOICE:'',LEGEND:'legend',UPPER:'upper'};
const SPECIAL_IDS={
  [WISP_ID]:'선택위습',
  'unit_1767884906256_4990':'레일리(히든)',
  'unit_1767884925665_1037':'해적선',
  [SUPER_KUMA_ID]:'초월쿠마',
  'unit_1779016778159_2512':'그린블러드',
  'unit_1767884840242_5227':'랜덤유닛',
  'unit_1767884871133_6843':'토큰',
  'unit_1767884970331_9084':'고대의 배',
  'unit_1761061085749_3333':'메구밍 (전퍼스킬)',
  'unit_1761061295036_310':'옌',
  'unit_1761061550524_6203':'카미조 토우마 (단일스턴·코비 용기의 외침)',
  'unit_1761061102389_3':'센토 이스즈 (바제스)',
  'unit_1767884889420_456':'좀비'
};
const RAYLEIGH_HIDDEN_ID='unit_1767884906256_4990';
const PIRATE_SHIP_MATERIAL_ID='unit_1767884925665_1037';
const COMMON_NAMES=['루피','조로','나미','우솝','상디','쵸파','버기','해군 총병','해군 칼병'];
const COMMON_COLORS={
  '루피':'#ef4444','조로':'#22c55e','나미':'#f97316','우솝':'#eab308','상디':'#3b82f6',
  '쵸파':'#ec4899','버기':'#a855f7','해군 총병':'#64748b','해군 칼병':'#94a3b8'
};
const DISPLAY_NAME_OVERRIDES={
  'L30h':'써니호 (광폭화)',
  'unit_1779017164417_3162':'S-베어 (유틸·짤스턴 0.25·마뎀증 8·마방깎 1)',
  'E30h':'코비 (단일·발동 체젠·공증)',
  'X30h':'방주맥심 (발동이감 30·마방깎 10·폭뎀증 10)',
  'unit_1779015610844_6407':'바제스 왜곡 (마딜 단일 1)',
  'unit_1767884840242_5227':'랜덤유닛',
  'unit_1767884871133_6843':'토큰',
  'unit_1767884970331_9084':'고대의 배'
};
// TMO's flag number is an internal shorthand, not a unit tier. Keep the
// calculation name above intact and use these labels only when drawing UI.
// This separation is important: adding "(왜곡)" to nameOf() would change
// role-regex matches and could silently add combat roles.
const UI_NAME_OVERRIDES={
  'G30h':'징베(전설)','S30h':'울티(전설)','F30h':'카르가라(전설)','HA0h':'킹(전설)','MC0h':'히바리(전설)',
  'Q20h':'라분(전설)','U20h':'검은수염(전설)','Z90h':'네코(전설)','R20h':'로브 루치(전설)','Y20h':'루나메(전설)',
  'X20h':'블랙마리아(전설)','430h':'상디(전설)','730h':'슈가(전설)','S20h':'조로(전설)','I30h':'제파(전설)',
  'N30h':'료쿠규(히든)','M30h':'사보(히든)','740h':'피셔타이거(히든)','J30h':'시류(히든)','Z30h':'아카이누(히든)',
  'J70h':'캐럿(변화)','unit_1752903381904_1445':'블랙마리아(왜곡)','V30h':'코알라(왜곡)','IC0h':'퀸(왜곡)',
  '840h':'페로나(왜곡)','unit_1779015610844_6407':'바제스(왜곡)','U30h':'레드포스호(해적선)',
  // Same-name high-tier pairs without a flag number are qualified as well.
  '720h':'슈가(희귀)','O20h':'에이스(전설)','unit_1779015467592_9245':'에이스(왜곡)','L70h':'캐럿(히든)'
};
const FAMILY_OVERRIDES={
  'S50h':'magic','W50h':'physical','KC0h':'magic','unit_1752903381904_1445':'physical',
  'V30h':'neutral','IC0h':'physical','840h':'magic','unit_1779015467592_9245':'physical','R30h':'magic'
};
const BOSS_ROUNDS=new Set([10,20,30,40,50,55,60,65,70,75]);

const ABILITY_ALIASES={
  '이동 속도 감소':'이동속도 감소','발동 이동속도 감소':'발동이동속도 감소','발동이속도 감소':'발동이동속도 감소',
  '단일 이동속도 감소':'단일이동속도 감소','단일이속도 감소':'단일이동속도 감소',
  '방어력감소':'방어력 감소','발동방어력감소':'발동방어력 감소','단일방어력감소':'단일방어력 감소','중첩방어력감소':'중첩방어력 감소',
  '보스잡기':'보스 잡기','마법방어력 감소':'마법 방어력 감소','마법데미지 증가':'마법 대미지 증가',
  '폭발형 데미지 증폭':'폭발형 대미지 증폭','범위끝딜':'범위 끝딜','모든대미지증가':'모든피해증가'
};

// v16.9: 2.305 [C] 맵 파싱 검증값 반영 —
//  이감 102 = 풀이감 기준, 117 = 나스쥬로(적 이속 +15%) 상쇄 조건부 목표.
//  방깎 180 = 실전선, 211 = 공개 공략 풀방깎 목표(워큐리는 몹 방어 +10).
//  스턴 0.5 = 하드 최소, 1.0 = 운용선, 1.5 = 안정선, 2.0+ = 과투자 주의.
const GOROSEI={
  none:{key:'none',name:'아직 모름',slowPhysical:102,slowMagic:102,armorSoft:180,armorSafe:211,stun:1.5},
  nasjuro:{key:'nasjuro',name:'나스쥬로',slowPhysical:117,slowMagic:117,armorSoft:180,armorSafe:211,stun:1.5},
  warcury:{key:'warcury',name:'워큐리',slowPhysical:102,slowMagic:102,armorSoft:190,armorSafe:221,stun:1.5},
  saturn:{key:'saturn',name:'새턴',slowPhysical:102,slowMagic:102,armorSoft:180,armorSafe:211,stun:1.5}
};
const CONTROL_ENVELOPE={
  stableStun:1.5,
  slowFloorRatio:.88,
  physicalOperationalStun:1,
  // 물딜은 사용자가 정한 실전 우선순위대로 0.5스턴을 하드 최소선으로
  // 인정합니다. 1.0이 운용선, 1.5는 편안한 안정선입니다.
  physicalExpertStun:.5,
  magicOperationalStun:1,
  efficientStunCap:1.5,
  triggerSafeWeightOne:.5,
  triggerSafeWeightMulti:.65,
  triggerExpectedWeightOne:.75,
  triggerExpectedWeightMulti:.85
};
const CONTROL_PROFILES={
  physical:{
    operational:{slow:1,stun:1,expertStun:.5},
    stable:{slow:1,stun:1.5},
    conditional:{slow:.88,stun:1.5}
  },
  magic:{
    operational:{slow:1,stun:1},
    stable:{slow:1,stun:1.5},
    conditional:{slow:.88,stun:1.5}
  }
};
// v16.9: 2.305 [C] 맵 스크립트 파싱 확정값 (사용자 검증 제공).
//  보스 HP 오로성 보정과 재생은 신세계(51라 이후) 보스에만 적용.
//  광폭몹은 51라 이후 비보스 라운드 시작 7.5초에 플레이어당 1마리.
const BOSS_META={
  bossRounds:[10,20,30,40,50,55,60,65],
  rounds:{
    10:{boss:'아론',hp:137750},
    20:{boss:'크로커다일',hp:807500},
    30:{boss:'에넬',hp:7125000},
    40:{boss:'루치',hp:27550000},
    50:{boss:'센고쿠',hp:197600000},
    55:{boss:'도플라밍고',hp:116821500},
    60:{boss:'빅 맘',hp:121125000},
    65:{boss:'카이도',hp:129152500}
  },
  // 보스 방어 (2.305 [C] 파싱 확정, 50라 이후만 확보).
  bossArmor:{50:350,55:360,60:372,65:395},
  goroseiBossHpBonusNewWorld:{warcury:10000000,saturn:10000000,nasjuro:25000000},
  goroseiBossRegenNewWorld:{base:50000,warcury:350000,nasjuro:350000,saturn:725000},
  goroseiMobHpBonusNewWorld:{saturn:10000000,nasjuro:10000000,warcury:20000000},
  goroseiMobArmorBonus:{warcury:10},
  goroseiMobSpeedPct:{nasjuro:15},
  timers:{normal:35,boss:60,prepAfter50:70,newWorld:32},
  mobs:{perRound:35,spawnIntervalSec:.5,frenzyFromRound:51,frenzyAtSec:7.5,countLimitBase:70,countLimitFrom41:50},
  lineCurve:{
    29:{name:'슈라',hp:114560,armor:40,speed:387},
    39:{name:'스팬담 특수몹',hp:1,armor:39,speed:387},
    49:{name:'아카이누',hp:34650000,armor:138,speed:387},
    55:{name:'트레볼',hp:86726200,armor:183,speed:387,newWorld:true},
    60:{name:'제우스',hp:124251000,armor:180,speed:387,newWorld:true},
    65:{name:'오로치',hp:161775800,armor:191,speed:387,newWorld:true}
  }
};
// 다음 보스 라운드의 오로성 반영 HP·재생·제한시간과 "보스 단독 최소 실효
// DPS", 동반(또는 직전) 라인 웨이브를 계산합니다.  실제 전투는 일반몹
// 최대 35마리가 겹치므로 이 DPS는 하한선이지 클리어 보장선이 아닙니다.
function bossPreview(roundNow,goroseiKey){
  const r=Math.max(1,Math.round(num(roundNow)||1)),next=BOSS_META.bossRounds.find(x=>x>=r);
  if(next==null)return null;
  const base=BOSS_META.rounds[next],newWorld=next>50,g=String(goroseiKey||'');
  const hpBonus=newWorld?num(BOSS_META.goroseiBossHpBonusNewWorld[g]||0):0;
  const regen=newWorld?num(BOSS_META.goroseiBossRegenNewWorld[g]!=null?BOSS_META.goroseiBossRegenNewWorld[g]:BOSS_META.goroseiBossRegenNewWorld.base):0;
  const time=newWorld?BOSS_META.timers.newWorld:BOSS_META.timers.boss;
  const hp=num(base.hp)+hpBonus,dpsNeed=Math.round((hp+regen*time)/time);
  const lineRound=newWorld?next:next-1,lineBase=BOSS_META.lineCurve[lineRound]||null;
  let line=null;
  if(lineBase){
    const mobBonus=lineBase.newWorld?num(BOSS_META.goroseiMobHpBonusNewWorld[g]||0):0;
    line={round:lineRound,name:lineBase.name,hp:num(lineBase.hp)+mobBonus,armor:num(lineBase.armor)+num(BOSS_META.goroseiMobArmorBonus[g]||0),count:BOSS_META.mobs.perRound,withBoss:!!lineBase.newWorld};
  }
  return{round:next,boss:base.boss,hp,hpBonus,regen,time,dpsNeed,newWorld,bossArmor:BOSS_META.bossArmor[next]!=null?num(BOSS_META.bossArmor[next]):null,line};
}
// v17: 2.305는 워크3 기본 방어계수 0.06을 0.02로 바꿨다(맵 상수 확정).
// 방깎으로 방어가 음수까지 내려가며 실제로 피해가 증폭된다 —
// 방깎을 211 등으로 clamp하면 안 된다.
const DEFENSE_ARMOR=0.02;
function armorMultiplier(effectiveArmor){
  const armor=num(effectiveArmor);
  return armor>=0?1/(1+DEFENSE_ARMOR*armor):2-Math.pow(1-DEFENSE_ARMOR,-armor);
}
// 보스 상성: 관통 1.25 · 일반 1 · 공성 0.75 · 패기(hero) 1.05.
// DAMAGE_TYPE_UNIVERSAL 스킬은 수치 방어를 무시하므로 이 표는 평타 전용.
const ATTACK_TYPE_VS_BOSS={pierce:1.25,normal:1,siege:.75,hero:1.05};
// v17.8: 아머브레이크(암브) — 맵 확정 메커니즘. 스킬·평타가 적에게
// "N의 아머브레이크"를 부여하고 대상당 최대 75까지 중첩되며, 중첩 1은
// 방어력 1 감소와 같다(내가중수 툴팁: "아머브레이크로 깎인 방어력
// 감소량 만큼 … 1%씩"). 스택 도달 속도는 공격 빈도에 달려 있어 측정
// 하지 않는다 — 대신 소스 가중치 합 w의 보스전 정착 추정
// 75×(1−0.5^w)를 쓰는 보수 모델을 명시한다(가중 1≈38, 2≈56, 3≈66).
// 이 환산은 표시·필요 DPS 참고 계산에만 쓰고, 제작 하드 게이트의
// 정적 방깎 목표는 낮추지 않는다(암브 유닛이 묶이거나 죽으면 사라지는
// 조건부 자원이기 때문).
const ARMOR_BREAK_CAP=75;
function armorBreakStacks(weight){const w=Math.max(0,num(weight));return w<=0?0:Math.round(ARMOR_BREAK_CAP*(1-Math.pow(.5,w)));}
function armorBreakModel(spec,options){
  options=options||{};
  const weight=Math.max(0,num(spec&&spec.armorBreak)),units=Math.max(0,num(spec&&spec.armorBreakUnits));
  const stacks=armorBreakStacks(weight),staticReduce=num(options.armorReduce);
  const out={weight:round2(weight),units,stacks,cap:ARMOR_BREAK_CAP,addedReduce:stacks,basis:'map-cap75-steadystate-estimate',measured:false};
  if(options.bossArmor!=null){
    const bossArmor=num(options.bossArmor);
    const before=armorMultiplier(bossArmor-staticReduce),after=armorMultiplier(bossArmor-staticReduce-stacks),nextOne=armorMultiplier(bossArmor-staticReduce-stacks-1);
    out.multiplierWithout=round3(before);
    out.multiplierWith=round3(after);
    out.gainPercent=round2(before>0?(after/before-1)*100:0);
    out.perStackGainPercent=round3(after>0?(nextOne/after-1)*100:0);
  }
  return out;
}
function upperCombatFor(unit){
  const table=(typeof window!=='undefined'?window:globalThis).ORD_UPPER_COMBAT;
  if(!table||!table.rows||!unit)return null;
  if(table.rows[unit.id])return table.rows[unit.id];
  for(const code of unit.codes||[])if(table.rows[code])return table.rows[code];
  return null;
}
// 평타 raw DPS (스킬 제외).  level은 해당 등급 공업 실제 연구 레벨(시작 1).
function upperRawDps(unit,level,speedBuffPct){
  const row=upperCombatFor(unit);if(!row)return null;
  const n=Math.max(1,Math.round(num(level)||1));
  const hit=num(row.avg)+num(row.r1dmg)+num(row.rndmg)*(n-1);
  const speed=Math.min(1+(num(row.r1spd)+num(row.rnspd)*(n-1))/100+num(speedBuffPct)/100,5);
  return{raw:hit*speed/Math.max(.01,num(row.bat)),hit,speedMultiplier:speed,atkType:row.atkType,row};
}
// 보스 평타 실효 DPS와, 특정 방깎에서 필요한 raw DPS.
function upperBossDps(unit,level,options){
  options=options||{};const rawInfo=upperRawDps(unit,level,options.speedBuffPct);
  if(!rawInfo)return null;
  const bossArmor=num(options.bossArmor),armorReduce=num(options.armorReduce);
  const multiplier=armorMultiplier(bossArmor-armorReduce)*num(ATTACK_TYPE_VS_BOSS[rawInfo.atkType]!=null?ATTACK_TYPE_VS_BOSS[rawInfo.atkType]:1);
  return Object.assign({},rawInfo,{effective:rawInfo.raw*multiplier,multiplier});
}
function bossRawDpsNeed(preview,armorReduce,atkType){
  if(!preview||preview.bossArmor==null)return null;
  const typeMod=num(ATTACK_TYPE_VS_BOSS[atkType]!=null?ATTACK_TYPE_VS_BOSS[atkType]:1);
  return Math.round(num(preview.dpsNeed)/(armorMultiplier(num(preview.bossArmor)-num(armorReduce))*typeMod));
}
// v17.1: 정규화 스킬 프로필 다이제스트 접근자 (사용자 제공 63 프로필).
// allowKillVerdict=false — 액션 AST 정규화 전에는 표시·참고용으로만 쓴다.
function upperSkillProfile(unit){
  const table=(typeof window!=='undefined'?window:globalThis).ORD_UPPER_SKILLS;
  if(!table||!table.byTmo||!unit)return null;
  if(table.byTmo[unit.id])return table.byTmo[unit.id];
  for(const code of unit.codes||[])if(table.byTmo[code])return table.byTmo[code];
  return null;
}
// v17.2: 액션 AST 정적 도출 — 자동공격 유발 스킬의 기대 데미지 하한.
// strict(미해석 조건 분기=0, 명시 확률 게이트만 통과)만 수치로 쓰고,
// approx(조건 통과 상한)는 진단용이다.  수동 시전·FSM 트레인 미포함,
// allowKillVerdict=false 유지.
function upperSkillProcDps(unit,level,options){
  options=options||{};
  const table=(typeof window!=='undefined'?window:globalThis).ORD_UPPER_SKILL_DPS;
  const rawInfo=upperRawDps(unit,level,options.speedBuffPct);
  if(!table||!table.byProfile||!rawInfo)return null;
  let profileId=null;
  if(table.byTmo[unit.id])profileId=table.byTmo[unit.id];
  else for(const code of unit.codes||[])if(table.byTmo[code]){profileId=table.byTmo[code];break;}
  if(!profileId||!table.byProfile[profileId])return null;
  const derived=table.byProfile[profileId],strict=derived.perAttack&&derived.perAttack.strict||{affected:0,universal:0};
  const attacksPerSec=rawInfo.speedMultiplier/Math.max(.01,num(rawInfo.row.bat));
  const armorMult=options.bossArmor!=null?armorMultiplier(num(options.bossArmor)-num(options.armorReduce)):1;
  let dps=num(strict.universal)*attacksPerSec+num(strict.affected)*attacksPerSec*armorMult;
  // v17.3: RNG 게이트 공격유발 FSM 트레인 하한.  BD1 재진입 의미론에
  // 따라 발동률은 1/활성 지속시간을 넘지 않는다.
  let trainDps=0;
  const trainSlot=table.trainsByProfile&&table.trainsByProfile[profileId];
  for(const train of trainSlot&&trainSlot.trains||[]){
    const rate=Math.min(attacksPerSec*num(train.p),num(train.dur)>0?1/num(train.dur):attacksPerSec*num(train.p));
    trainDps+=(num(train.e&&train.e.universal)+num(train.e&&train.e.affected)*armorMult)*rate;
  }
  dps+=trainDps;
  return{profileId,perAttackStrict:num(strict.affected)+num(strict.universal),dps,trainDps,attacksPerSec,basis:'static-lower-bound-attack-proc-and-rng-trains',coverage:derived.coverage||null};
}
// 평타 한정 보스 타임라인 참고치.  options.skillDps에 upperSkillProcDps의
// 하한을 넣을 수 있다 — 그래도 킬 판정은 내리지 않는다.
function simulateBossFlat(unit,level,options){
  options=options||{};
  const preview=bossPreview(options.round||50,options.gorosei);
  if(!preview||preview.bossArmor==null)return null;
  const combat=upperBossDps(unit,level,{bossArmor:preview.bossArmor,armorReduce:options.armorReduce,speedBuffPct:options.speedBuffPct});
  if(!combat)return null;
  const netDps=combat.effective+num(options.skillDps)-num(preview.regen),dealt=Math.max(0,netDps)*preview.time,remaining=Math.max(0,num(preview.hp)-dealt);
  return{basis:'flat-attack-only',verdictAllowed:false,round:preview.round,boss:preview.boss,windowSec:preview.time,hp:num(preview.hp),regen:num(preview.regen),effectiveDps:combat.effective,netDps,dealt:Math.min(dealt,num(preview.hp)),remaining,remainingRatio:num(preview.hp)?round2(100*remaining/num(preview.hp)):0};
}

// 조합 후 ID가 바뀌는 상위는 한 경로로 취급합니다. 뒤쪽 ID일수록 실제 활성 형태입니다.
const UPPER_VARIANT_FAMILIES=[
  ['F90H','unit_1767356628978_5789'],
  ['190H','unit_1747756917990_920'],
  ['M70h','unit_1767886180546_6011'],
  ['H90H','unit_1767886116631_3690'],
  ['E40h','unit_1767886057577_8465'],
  ['KB0H','KB0H_']
];
const UPPER_VARIANT_CANONICAL={};
const UPPER_VARIANT_PRIORITY={};
for(const family of UPPER_VARIANT_FAMILIES)family.forEach((id,index)=>{UPPER_VARIANT_CANONICAL[id]=family[0];UPPER_VARIANT_PRIORITY[id]=index;});

// 유닛 설명에 명시된 상위+상위 조합. 숫자 스펙은 abilities/스턴표로 다시 계산하고,
// 이 표는 '왜 같이 쓰는가'라는 전략 조건에만 사용합니다.
const UPPER_PAIR_SYNERGIES=[
  {a:'890H',b:'I70h',label:'로빈+카타쿠리',reason:'로빈의 보조딜 공백을 카타쿠리의 방깎·체젠·광보잡이 메웁니다.'},
  {a:'890H',b:'unit_1745689336668_9114',label:'로빈+마르코',reason:'로빈의 스턴·방깎 축에 마르코의 상시 이감60·체젠을 더합니다.'},
  {a:'unit_1745689336668_9114',b:'I70h',label:'마르코+카타쿠리',reason:'이감·체젠과 방깎·광보잡을 서로 나눠 맡습니다.'},
  {a:'M70h',b:'190H',label:'카이도+쵸파',reason:'카이도의 공격력 패널티와 느린 공속을 쵸파의 공증·공속으로 직접 보완합니다.'},
  {a:'M70h',b:'A50h',label:'카이도+버기',reason:'버기의 공증·공속이 카이도의 패널티를 상쇄하지만 고비용 조합입니다.'},
  {a:'Q80h',b:'A90H',label:'알비다+징베',reason:'알비다가 공급하는 암브가 징베의 암브 비례 스킬을 강화합니다.'},
  {a:'Q80h',b:'IA0h',label:'알비다+킹',reason:'알비다가 킹의 핵심 조건인 암브를 공급합니다.'},
  {a:'Q80h',b:'J40h',label:'알비다+로져',reason:'알비다의 암브·보조축에 로져의 방깎·이감·공증·광폭 처리를 더합니다.'},
  {a:'Q80h',b:'E90H',label:'알비다+도플라밍고',reason:'암브와 발동 이감·발동 방깎을 함께 구성합니다.'},
  {a:'290H',b:'A50h',label:'사보+버기',reason:'버기의 다중 버프가 버프 수에 비례하는 사보 운용과 맞습니다.'},
  {a:'F90H',b:'J40h',label:'조로+로져',reason:'조로의 스킬딜 축에 로져의 방깎·이감·공증을 보강합니다.'},
  {a:'Z80H',b:'950h',label:'샹크스+에이스',reason:'샹크스의 내장 고스턴에 에이스의 상시 이감45·끝딜을 더합니다.'},
  {a:'Z80H',b:'Q40h',label:'샹크스+빅맘',reason:'내장 고스턴과 높은 이감을 결합하되 빅맘 특강 상태를 확인해야 합니다.'},
  {a:'Z80H',b:'E50h',label:'샹크스+에넬',reason:'샹크스의 제어에 에넬의 마방깎·마젠·발동 이감을 더합니다.'},
  {a:'D40h',b:'W80H',label:'드래곤+루치',reason:'드래곤의 폭뎀증·스턴과 루치의 단일2·광폭 처리를 연결합니다.'},
  {a:'E40h',b:'H90H',label:'센고쿠+상디',reason:'센고쿠의 현퍼·공증 축에 상디의 단일·발동 이감을 보강합니다.'},
  {a:'E50h',b:'Y80H',label:'에넬+프랑키',reason:'마나 스킬형 에넬에 프랑키의 마젠5를 더합니다.'},
  {a:'O80h',b:'4B0H',label:'마르코+키드',reason:'마르코의 체젠이 체젠 비례 키드 스턴을 강화합니다.'}
];

const UPPER_STRATEGY_OVERRIDES={
  'I70h':{key:'attack',label:'공증·체젠형 물딜',summary:'저렴한 메인 상위로 빠르게 스토리 보상을 회수하고 방깎·보잡을 이어 붙이는 경로입니다.',needs:[['attack','공증 버프',30],['regen','체젠',1]]},
  '890H':{key:'subdamage',label:'보조딜 필수 스킬딜형',summary:'자체 스턴·방깎·공증은 있지만 보조딜러가 없으면 라인딜이 빈니다.',needs:[['subdamage','보조·방무딜',1]]},
  'F50h':{key:'subdamage',label:'유틸 만능형 물딜 · 보조딜 필수',summary:'이감·스턴·방깎을 두루 채우지만 자체 스킬딜이 약해(약한 스킬딜러) 보조·방무딜러가 없으면 라인이 밀립니다. 50라 보스 전에 보조딜을 먼저 확보하세요.',needs:[['subdamage','보조·방무딜',1]]},
  'Q80h':{key:'armorBreak',label:'암브·넉백 무스턴 물딜',summary:'스턴을 짜지 않고 이감을 상한까지 채워 넉백으로 라인을 관리하는 경로입니다. 스턴 대신 암브·스펙으로 마감합니다.',needs:[['armorBreak','암브 연계',1]],waives:['stunBase','stunFull']},
  'IA0h':{key:'armorBreak',label:'암브형 물딜',summary:'암브가 있어야 제 성능을 내므로 암브 공급 유닛을 먼저 확인합니다.',needs:[['armorBreak','암브 연계',1]]},
  'A90H':{key:'armorBreak',label:'암브 비례 스킬형',summary:'암브 수에 따라 스킬이 강해지며 발동 이감은 상시 이감과 분리해 봐야 합니다.',needs:[['armorBreak','추가 암브',2]]},
  'F90H':{key:'skill',label:'스킬딜형 물딜',summary:'스킬 수치가 고정된 축이라 공속과 방깎을 우선 보강합니다.',needs:[['speed','공속 버프',20]]},
  'DB0H':{key:'slowPenalty',label:'고이감 비례 물딜',summary:'이감이 높을수록 강해지지만 자체 이감 -10 페널티가 있어 다른 이감 유닛을 먼저 확보해야 합니다.',needs:[]},
  'M70h':{key:'penalty',label:'공증 패널티 단독딜러',summary:'아군 공격력 -75 패널티가 있어 여러 딜러보다 공증·공속 보조에 자원을 집중합니다.',needs:[['attack','공증 패널티 상쇄',60],['speed','공속 보강',20]]},
  'C40h':{key:'armorPenalty',label:'버프 비례·고스턴 물딜',summary:'실측 1.117스턴과 보잡은 있지만 방깎 -15 페널티와 버프 수 비례 딜 조건 때문에 다상위를 억지로 늘리지 않습니다.',needs:[['attack','공증·버프 보강',30]]},
  '4B0H':{key:'regen',label:'체젠 비례 제어형',summary:'체젠이 높을수록 스턴이 강해지므로 체젠 파트너가 실제 성능 조건입니다.',needs:[['regen','체젠 버프',2]]},
  'D40h':{key:'singleEnd',label:'폭뎀 단끝형 마딜',summary:'라인딜이 약해 단일·끝딜 유닛으로 한 마리씩 처치해야 하는 고난도 경로입니다.',needs:[['single','단일',2],['end','끝딜',1]]},
  'E50h':{key:'mana',label:'마젠·마방깎형 마딜',summary:'마나 스킬 가동과 마방깎을 살리도록 마젠·광보잡 파트너를 붙입니다.',needs:[['mana','마젠',4]]},
  'Z80H':{key:'builtInStun',label:'내장 고스턴 마딜',summary:'스턴은 이미 충분하므로 두 번째 스턴을 만들지 말고 이감·단끝·광보잡을 채웁니다.',needs:[]}
};
// v16.9: 2.305 공개 공략 근거의 상위 라인 자립도.  목록에 없는 상위는
// unknown으로 남긴다 — 근거 없이 '약'으로 확정하지 않는다(검증 지침).
//  self    = 라인 자립도가 높음(보조딜 강제 없음)
//  support = 보강 필요·조건부(다른 라인 보강 요구가 없으면 보조·방무딜 1 요구)
const UPPER_LINE_PROFILE={
  '490H':{line:'self'},'5B0H':{line:'self'},'V80H':{line:'self'},'Q40h':{line:'self'},
  'H90H':{line:'self'},'unit_1767886116631_3690':{line:'self'},'590H':{line:'self'},
  '760h':{line:'self'},'N50H':{line:'self'},
  'D40h':{line:'support',covered:'single-end'},
  '480h':{line:'support'},'Z80H':{line:'support'},'G40h':{line:'support'},
  '090H':{line:'support'},'G50h':{line:'support',note:'41라 이전 조합 조건'},
  'JC0h':{line:'support'},'040h':{line:'support'},
  '890H':{line:'support'},'F50h':{line:'support'}
};

// 2.300~2.305 연구표. displayStun은 표기값, capture는 표의 발동 포획률입니다.
// 내부 합산은 capture에서 복원한 비반올림 유효 스턴을 사용합니다.
const STUN_RESEARCH={
  'V10h':{displayStun:.159,capture:22.53},'B20h':{displayStun:.151,capture:21.63},'A20h':{displayStun:.152,capture:21.76},'C20h':{displayStun:.172,capture:24.22},'E20h':{displayStun:.138,capture:19.98},
  'W20h':{displayStun:.935,capture:77.78},'Q20h':{displayStun:.878,capture:75.66},'Z20h':{displayStun:1.001,capture:80.03},'530h':{displayStun:.953,capture:78.42},'930h':{displayStun:1.034,capture:81.06},'030h':{displayStun:.525,capture:57.02},'130h':{displayStun:.748,capture:70},
  // 써니호는 광폭 처리 전용입니다. 과거 연구표의 포획률은 실제 스턴 역할로
  // 합산하지 않습니다.
  'O30h':{displayStun:.501,capture:55.34},'L30h':{displayStun:0,capture:0},'140h':{displayStun:.506,capture:55.74},'Y30h':{displayStun:.5,capture:55.26},'740h':{displayStun:.961,capture:78.71},
  '890H':{displayStun:1.263,capture:86.89},'990H':{displayStun:.476,capture:53.51},'XB0H':{displayStun:.636,capture:64.05},'290H':{displayStun:.139,capture:20},'U80H':{displayStun:1.264,capture:86.91},'Z80H':{displayStun:2.015,capture:96.09},'790H':{displayStun:1.242,capture:86.44},
  'B90H':{displayStun:0,capture:0},'unit_1779054378124_5918':{displayStun:1.152,capture:84.34},'F90H':{displayStun:.397,capture:47.19},'unit_1767356628978_5789':{displayStun:.397,capture:47.19},'4B0H':{displayStun:.186,capture:25.84},'5B0H':{displayStun:.999,capture:79.98},'X80H':{displayStun:1.068,capture:82.09},
  'C40h':{displayStun:1.117,capture:83.34},'D40h':{displayStun:1.448,capture:90.28},'E40h':{displayStun:1.145,capture:84.17},'unit_1767886057577_8465':{displayStun:1.858,capture:94.97},'B40h':{displayStun:1.87,capture:95.07},'A40h':{displayStun:.576,capture:60.44},
  'KB0H':{displayStun:1.092,capture:82.75},'KB0H_':{displayStun:1.092,capture:82.75},'760h':{displayStun:.64,capture:64.29},'B50h':{displayStun:.999,capture:79.97},'C50h':{displayStun:.863,capture:75.05},'unit_1767356778906_9384':{displayStun:1.312,capture:87.89},
  'F50h':{displayStun:.548,capture:58.58},'unit_1761060487951_749':{displayStun:.421,capture:49.2},'unit_1761062338921_7460':{displayStun:.633,capture:63.87},
  'unit_1761061031358_4977':{displayStun:.736,capture:69.39},'unit_1761062663657_987':{displayStun:2.168,capture:96.95},'unit_1761126198374_11':{displayStun:.908,capture:76.81},
  'unit_1752903381904_1445':{displayStun:.748,capture:70},'IC0h':{displayStun:.427,capture:49.73},'unit_1779016778159_2512':{displayStun:.317,capture:40}
};

// 희귀 42종 전체 스토리 파괴 실측 (갤러리 250029 데미지% ×100).
// 이전 16종 부분 표를 전면 대체한다 — 값 체계는 같은 스케일이지만 측정이
// 새로 이루어져 일부 순위가 다르다(예: 샹크스 2260→1457).
const STORY_RARE_BENCHMARKS={
  Q10h:3173,Y10h:2860,E20h:2798,X90h:2797,I20h:2530,K20h:2449,X10h:2152,R10h:2016,
  Z10h:2013,'620h':2005,V10h:1890,'020h':1812,L50h:1708,F20h:1682,'320h':1619,'220h':1580,
  M10h:1574,M20h:1563,H40h:1542,L20h:1521,H20h:1489,P10h:1471,'520h':1470,'920h':1457,
  G20h:1447,L10h:1380,J20h:1359,K50h:1147,S10h:1090,'120h':1081,T10h:1071,U10h:971,
  W10h:925,D20h:919,A20h:904,'820h':899,B20h:874,'720h':851,N10h:829,C20h:803,
  O10h:733,'420h':729
};
const STORY_RARE_VALUES=Object.values(STORY_RARE_BENCHMARKS).map(num);
const STORY_RARE_MIN=Math.min(...STORY_RARE_VALUES),STORY_RARE_MAX=Math.max(...STORY_RARE_VALUES);
const STORY_RARE_RANKS=Object.freeze(Object.fromEntries(Object.entries(STORY_RARE_BENCHMARKS)
  .sort((a,b)=>num(b[1])-num(a[1])||String(a[0]).localeCompare(String(b[0])))
  .map(([id],index)=>[id,index+1])));
const STORY_RESEARCHED={
  'G50h':{score:98,tier:'S',note:'상위 스토리 파괴 최상위권'},'D40h':{score:81,tier:'A',note:'불멸 스토리 파괴 상위권'},'JC0h':{score:73,tier:'A',note:'영원 강화 스토리 상위권'},'W80H':{score:58,tier:'B',note:'상위 스토리 중상위권'},'090H':{score:34,tier:'D',note:'상위 스토리 파괴 기준 낮음'},'F40h':{score:20,tier:'D',note:'상위 스토리 파괴 기준 낮음'},
  '740h':{score:94,tier:'S',note:'스토리 파괴 최상위권'},'Y20h':{score:94,tier:'S',note:'피셔타이거급 스토리'},'Z30h':{score:88,tier:'S',note:'편차는 있으나 평균·고점이 높음'},'S20h':{score:84,tier:'A',note:'고점이 매우 높은 스토리'},'F30h':{score:80,tier:'A',note:'저점과 안정성이 좋음'},'unit_1779015610844_6407':{score:72,tier:'A',note:'왜곡됨 스토리 성능 우수'},'J70h':{score:66,tier:'B',note:'변화됨 스토리 성능 양호'},'V30h':{score:61,tier:'B',note:'스토리 보조 성능 중상'},'B30h':{score:38,tier:'D',note:'방깎 없이 스토리 효율이 낮음'},'030h':{score:35,tier:'D',note:'스토리 파괴만 보면 낮음'},'Q30h':{score:5,tier:'D',note:'스토리 파괴 최하위권'}
};

// The two measured tables use different units for their first rows (seconds)
// and remaining rows (percent). Never compare those raw values. The source
// rank is the only ordering input; score is merely a rank-normalized UI value.
const STORY_MEASURED_SOURCES=[
  {key:'nonupper',label:'비상위',data:global.ORD_STORY_NONUPPER_V2305},
  {key:'upper',label:'상위',data:global.ORD_STORY_UPPER_V2305}
].filter(source=>source.data&&typeof source.data==='object').map(source=>{
  const ranks=Object.values(source.data).map(row=>num(row&&row.rank)).filter(rank=>rank>0);
  return Object.assign(source,{maxRank:ranks.length?Math.max(...ranks):1});
});
const STORY_LEAGUES=Object.freeze({
  rare:Object.freeze({key:'rare',label:'희귀',size:Object.keys(STORY_RARE_BENCHMARKS).length,description:'희귀 실험값이 큰 순서로 독립 순위를 매깁니다.'}),
  upper:Object.freeze({key:'upper',label:'상위',size:(STORY_MEASURED_SOURCES.find(source=>source.key==='upper')||{}).maxRank||80,description:'상위 원본 1~80위 안에서만 독립 등급을 매깁니다.'}),
  legend:Object.freeze({key:'legend',label:'전설급',size:(STORY_MEASURED_SOURCES.find(source=>source.key==='nonupper')||{}).maxRank||76,description:'왜곡·전설·히든·변화·특수 원본 1~76위 안에서만 독립 등급을 매깁니다.'})
});
// Each measured league is divided independently by its original source rank.
// Keep this order in one exported constant so data, UI filters and tests cannot
// silently disagree about the user-requested nine story grades.
// v17.7: SSS~F are equal-quantile bands inside each independent league
// (상위 / 전설급 / 희귀). Raw source ranks and measurements stay unchanged.
const STORY_GRADE_TIERS=Object.freeze(['SSS','SS','S','A','B','C','D','E','F']);

function storyMeasuredLookup(id){
  for(const source of STORY_MEASURED_SOURCES){
    const row=source.data[id];
    if(row&&num(row.rank)>0)return{source,row};
  }
  return null;
}
function storyMeasuredTier(tableTier){
  const tier=Math.max(1,num(tableTier));
  return tier===1?'S':tier===2?'A':tier===3?'B':tier===4?'C':'D';
}
function storyMeasuredScore(rank,maxRank){
  const r=Math.max(1,num(rank)),max=Math.max(r,num(maxRank));
  return max<=1?100:clamp(Math.round(100*(max-r)/(max-1)),0,100);
}
function storyMeasuredMetric(row){
  const prefix=row.approximate?'약 ':'';
  if(row.metricType==='seconds')return`${prefix}${num(row.value)}초 파괴`;
  if(row.metricType==='percent')return`${prefix}${num(row.value)}%`;
  return'';
}

const MAGIC_SINGLE=[
 [/로브\s*루치/,1],[/^상디|상디\s*\(/,1],[/코비/,1],[/스튜시/,1],[/캐럿/,0.6],[/레이쥬/,0.5],[/류마/,0.5],[/도플라밍고.*변화/,0.5],[/바제스.*왜곡/,1]
];
const MAGIC_END=[
 [/S-스네이크|S 스네이크/,1],[/S-베어|S 베어/,1],[/시류/,1],[/^조로|조로\s*\(/,1],[/시노부/,1],[/보아\s*핸콕/,1],[/카쿠.*변화/,0.5],[/브룩.*초월/,1],[/테조로/,1],[/우타/,0.5],[/류마/,1]
];
// 단일·끝딜 하드 게이트는 이름 추정값이 아니라 TMO abilities에 직접
// 들어온 수치만 사용합니다. 아래 값은 화면의 "이론 상한"에만 쓰며
// 클리어 확정이나 희귀 리롤을 열지 않습니다.
const UNVERIFIED_FINISH_MAX={
  'unit_1779017164417_3162':1 // S-베어: 기존 패치 표기만 있고 원 abilities 근거 없음
};
const MAGIC_BG_FULL=[/네코마무시/,/루나메/,/제파/,/아카이누/,/키쿠/,/베이비\s*5/,/뱀초/,/제트/];
const MAGIC_FRENZY=[/검은수염/,/로우/,/아인/,/비비.*영원/,/오뎅/,/보아\s*핸콕.*영원/];
const MAGIC_BOSS=[/레드필드/,/타시기.*초월/,/키자루.*초월/,/드래곤.*불멸/,/에이스.*영원/];
const PHYSICAL_BG_FULL=[/킬러/,/피셔타이거/,/S-호크|S 호크/,/레드포스호/,/카타쿠리/,/릴리스/,/우솝.*초월/,/스코퍼\s*가반/];
const PHYSICAL_BOSS=[/히바리/,/사보.*초월/];
const PHYSICAL_FRENZY=[/센고쿠.*전설/,/블랙마리아.*왜곡/,/보니.*초월/,/로저.*불멸/];
const UTILITY_MAGIC=[/슈가/,/페로나.*왜곡/,/방주맥심/,/나미.*전설/,/캐럿.*히든/,/코알라.*왜곡/,/코비/,/로우/,/모리아/,/검은수염/,/브룩.*초월/,/아오키지/,/우타/,/오뎅/,/미호크.*영원/];
const UTILITY_PHYSICAL=[/징베/,/모비딕호/,/퀸.*왜곡/,/센고쿠.*전설/,/마르코.*전설/,/레일리/,/스모커/,/울티/,/샬롯\s*크래커/,/히바리/,/흰수염/,/드래곤.*전설/,/라분/,/시키.*전설/,/베르고/,/피셔타이거/,/이완코브/,/알비다/,/S-샤크|S 샤크/,/베가펑크/,/아틀라스/,/후지토라.*초월/,/쵸파.*초월/,/불릿/,/버기.*영원/,/니카/];

function num(v){
  if(v===true)return 1;if(v===false||v==null)return 0;if(typeof v==='number')return Number.isFinite(v)?v:0;
  const m=String(v).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function round2(v){return Math.round(num(v)*100)/100;}
function round3(v){return Math.round(num(v)*1000)/1000;}
function round6(v){return Math.round(num(v)*1000000)/1000000;}
function stunFromCaptureRate(rate){rate=clamp(num(rate),0,99.999999);return rate<=0?0:Math.log(1-rate/100)/Math.log(.2);}
function stunResearch(u){
  const base=u&&STUN_RESEARCH[u.id];if(!base)return null;
  return{displayStun:num(base.displayStun),capture:round2(base.capture),exactStun:stunFromCaptureRate(base.capture),active:false,condition:'',base:{displayStun:num(base.displayStun),capture:round2(base.capture)},variant:null};
}
function stunTableValue(u){const row=stunResearch(u);return row?row.exactStun:null;}
function stunCaptureRate(stun){return round2((1-Math.pow(.2,Math.max(0,num(stun))))*100);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cleanName(s){return String(s||'').replace(/[💙💖🚩🚁▶◆♥🔻🔺🤍]/g,' ').replace(/\s+/g,' ').trim();}
function canonicalAbility(k){const x=String(k||'').replace(/\s+/g,' ').trim();return ABILITY_ALIASES[x]||x;}
function groupName(u){return String(u&&u.groupName||'');}
function nameOf(u){return u&&DISPLAY_NAME_OVERRIDES[u.id]||cleanName(u&&u.name||'');}
function displayNameOf(u){return u&&UI_NAME_OVERRIDES[u.id]||nameOf(u);}
function isRare(u){return groupName(u).includes('희귀함');}
function isCommon(u){return groupName(u)==='흔함';}
function isUncommon(u){return groupName(u)==='안흔함';}
function isSpecialTier(u){return groupName(u)==='특별함';}
function isUpper(u){return /제한됨|초월|불멸|영원/.test(groupName(u));}
function isLegendish(u){return /전설|히든|왜곡됨|변화된|세라핌|해적선/.test(groupName(u))&&!isUpper(u);}
function isChanged(u){return groupName(u).includes('변화된');}
function isWarped(u){return groupName(u).includes('왜곡됨');}
function isShip(u){return groupName(u).includes('해적선');}
function isSeraph(u){return groupName(u).includes('세라핌');}
function isMystic(u){return groupName(u).includes('신비함');}
function isRandom(u){return groupName(u).includes('랜덤유닛');}
function isItem(u){return /아이템|기타/.test(groupName(u));}
function isTranscend(u){return groupName(u).includes('초월');}
// Returns true only when this build would have to create a warped unit that is
// not already in the current hand. Warped wood remains universally available;
// this is a recommendation-cost gate, including upper recipes that consume a
// warped unit somewhere below the target.
function requiresWarpedCraft(db,target,counts){
  if(!db||!target)return false;const stock=cloneCounts(counts),visiting=new Set();
  function need(id,amount){amount=Math.max(0,num(amount));if(amount<=0)return false;const have=Math.min(amount,num(stock[id]));stock[id]=Math.max(0,num(stock[id])-have);amount-=have;if(amount<=0)return false;const unit=db.byId.get(id);if(!unit)return false;if(isWarped(unit))return true;if(visiting.has(id))return false;visiting.add(id);for(const stuff of unit.stuffs||[]){if(need(stuff.id,amount*num(stuff.count))){visiting.delete(id);return true;}}visiting.delete(id);return false;}
  return need(target.id,1);
}
function isAbsalom(u){return /^압살롬(?:\s|\(|$)/.test(nameOf(u));}
// v17.6(감사 P0-2): 152킬 보상 특별함은 33종 중 압살롬 제외 32종 균등
// 추첨 — UI 목록과 모델 검증이 이 단일 권위 함수를 함께 쓴다.
function eligible152Specials(db){return(db&&db.specials||[]).filter(u=>!isAbsalom(u));}
function eligible152SpecialId(db,id){if(!id)return false;const u=db&&db.byId&&db.byId.get(id);return!!u&&isSpecialTier(u)&&!isAbsalom(u);}
function canonicalUpperId(id){return UPPER_VARIANT_CANONICAL[id]||id||'';}
function upperVariantPriority(id){return num(UPPER_VARIANT_PRIORITY[id]);}
function activeUpperVariant(state,u){
  if(!u)return null;const canonical=canonicalUpperId(u.id),family=UPPER_VARIANT_FAMILIES.find(ids=>ids[0]===canonical);if(!family)return u;
  const owned=family.map(id=>state.db.byId.get(id)).filter(Boolean).filter(x=>num(state.counts[x.id])>0).sort((a,b)=>upperVariantPriority(b.id)-upperVariantPriority(a.id));return owned[0]||u;
}
function upperPairSynergy(a,b){
  if(!a||!b)return null;const ca=canonicalUpperId(a.id),cb=canonicalUpperId(b.id);return UPPER_PAIR_SYNERGIES.find(x=>(canonicalUpperId(x.a)===ca&&canonicalUpperId(x.b)===cb)||(canonicalUpperId(x.a)===cb&&canonicalUpperId(x.b)===ca))||null;
}
function tierKey(u){
  if(isCommon(u))return'common';if(isUncommon(u))return'uncommon';if(isSpecialTier(u))return'special';if(isRare(u))return'rare';
  if(isUpper(u))return'upper';if(isLegendish(u))return'legend';if(groupName(u)==='특수재료'||SPECIAL_IDS[u&&u.id])return'hard';return'other';
}
function familyOf(u){
  if(u&&FAMILY_OVERRIDES[u.id])return FAMILY_OVERRIDES[u.id];
  const g=groupName(u);if(g.includes('[물딜]'))return'physical';if(g.includes('[마딜]'))return'magic';if(g.includes('[스턴]'))return'neutral';
  const n=nameOf(u);
  if(isWarped(u)&&/바제스/.test(n))return'magic';
  if(MAGIC_SINGLE.some(([r])=>r.test(n))||MAGIC_END.some(([r])=>r.test(n))||MAGIC_BG_FULL.some(r=>r.test(n))||MAGIC_FRENZY.some(r=>r.test(n))||MAGIC_BOSS.some(r=>r.test(n))||UTILITY_MAGIC.some(r=>r.test(n)))return'magic';
  if(PHYSICAL_BG_FULL.some(r=>r.test(n))||PHYSICAL_BOSS.some(r=>r.test(n))||PHYSICAL_FRENZY.some(r=>r.test(n))||UTILITY_PHYSICAL.some(r=>r.test(n)))return'physical';
  return'neutral';
}
function abilityValue(u,key){
  const a=u&&u.abilities||{},target=canonicalAbility(key);for(const [k,v] of Object.entries(a)){if(canonicalAbility(k)===target)return num(v);}return 0;
}
function abilityBool(u,key){
  const a=u&&u.abilities||{},target=canonicalAbility(key);for(const [k,v] of Object.entries(a)){if(canonicalAbility(k)!==target)continue;if(v===false||String(v).toLowerCase()==='false'||v==null||v==='')return false;return true;}return false;
}
function firstMatchValue(name,list){for(const [re,v] of list){if(re.test(name))return v;}return 0;}
function anyMatch(name,list){return list.some(re=>re.test(name));}
function numberInName(name,re){const m=String(name||'').match(re);return m?num(m[1]):0;}

function magicFinishProfile(u){
  if(!u)return{directSingle:0,directEnd:0,directCredit:0,maxCredit:0,verified:false,theoretical:false,tags:[]};
  const directSingle=Math.max(0,abilityValue(u,'단일')),directEnd=Math.max(0,abilityValue(u,'끝딜'),abilityValue(u,'범위 끝딜')),directCredit=isUpper(u)?0:Math.min(1,Math.max(directSingle,directEnd)),unverified=isUpper(u)?0:num(UNVERIFIED_FINISH_MAX[u.id]),maxCredit=Math.max(directCredit,Math.min(1,unverified)),abilities=u.abilities||{},tags=[];
  if(Object.keys(abilities).some(key=>/순간이동|블링크/.test(key)))tags.push('위치 조작');
  if(Object.keys(abilities).some(key=>/발동|마나/.test(key)))tags.push('발동 관리');
  if(/시류|스튜시|카쿠|시노부/.test(nameOf(u)))tags.push('수동 컨트롤');
  return{directSingle:round2(directSingle),directEnd:round2(directEnd),directCredit:round2(directCredit),maxCredit:round2(maxCredit),verified:directCredit>0,theoretical:maxCredit>directCredit,tags:[...new Set(tags)]};
}
function evaluateMagicSingleEnd(lineup){
  const rows=[];for(const item of lineup||[]){const unit=item&&item.unit||item;if(!unit||isUpper(unit))continue;const profile=magicFinishProfile(unit);if(profile.maxCredit<=0)continue;rows.push({id:unit.id,name:displayNameOf(unit),unit,directCredit:profile.directCredit,maxCredit:profile.maxCredit,verified:profile.verified,theoretical:profile.theoretical,tags:profile.tags});}
  const expected=round2(rows.reduce((sum,row)=>sum+row.directCredit,0)),largest=round2(rows.reduce((max,row)=>Math.max(max,row.directCredit),0)),stable=round2(Math.max(0,expected-largest)),maximum=round2(rows.reduce((sum,row)=>sum+row.maxCredit,0)),verifiedUnits=rows.filter(row=>row.directCredit>0).length,maxUnits=rows.filter(row=>row.maxCredit>0).length;
  let status='insufficient',label='단끝 스펙 부족',note=`검증된 보조 단·끝 운용값이 ${expected}/3입니다.`;
  if(stable>=3){status='stable';label='스펙상 안정 후보';note=`보조 한 기를 놓쳐도 ${stable}/3이 남는 정적 스펙입니다. 실제 클리어는 운영에 따라 달라집니다.`;}
  else if(expected>=3&&verifiedUnits>=3){status='control';label='컨트롤 의존';note=`일반 운용 ${expected}/3이지만 한 기를 놓치면 ${stable}/3입니다. 단일·끝딜 컨트롤이 필요합니다.`;}
  else if(maximum>=3&&maxUnits>=3){status='theoretical';label='자료 확인 필요 · 확정 금지';note=`직접 확인값은 ${expected}/3이고 보정 포함 이론 상한만 ${maximum}/3입니다.`;}
  return{status,label,note,stable,expected,maximum,largest,verifiedUnits,maxUnits,rows,riskTags:[...new Set(rows.flatMap(row=>row.tags||[]))]};
}

const ROLE_PROFILE_CACHE=new WeakMap();
function roleProfile(u){
  if(u&&typeof u==='object'&&ROLE_PROFILE_CACHE.has(u))return ROLE_PROFILE_CACHE.get(u);
  const n=nameOf(u),g=groupName(u),family=familyOf(u);
  const measuredStun=stunTableValue(u);
  let stun=measuredStun==null?abilityValue(u,'스턴'):measuredStun;
  if(/료쿠규/.test(n)||(isShip(u)&&/^(?:레드포스호|써니호)/.test(n)))stun=0;
  // 실제 단·끝 수치는 abilities만 신뢰합니다. 이름 정규식은 family 추정에만
  // 남겨 두며 조로 상위·우타 헤드셋·캐럿 변화·류마 히든에 역할을 덧붙이지 않습니다.
  let single=abilityValue(u,'단일');
  let end=Math.max(abilityValue(u,'끝딜'),abilityValue(u,'범위 끝딜'));
  let boss=abilityBool(u,'보스 잡기'),frenzy=abilityBool(u,'광폭화');
  if(anyMatch(n,MAGIC_BG_FULL)||anyMatch(n,PHYSICAL_BG_FULL)){boss=true;frenzy=true;}
  if(anyMatch(n,MAGIC_BOSS)||anyMatch(n,PHYSICAL_BOSS))boss=true;
  if(anyMatch(n,MAGIC_FRENZY)||anyMatch(n,PHYSICAL_FRENZY))frenzy=true;
  if(u&&u.id==='240h'){boss=true;frenzy=false;}
  if(isShip(u)&&/^써니호/.test(n)){boss=false;frenzy=true;}
  if(/S-베어|S 베어/.test(n)){stun=.25;boss=false;frenzy=false;}
  // Koala (warped) is shared physical/magic utility, not a boss/frenzy handler.
  // ID correction wins even when a live TMO payload still contains both flags.
  if(u&&u.id==='V30h'){boss=false;frenzy=false;}
  if(/바제스/.test(n)&&isWarped(u))single=1;
  let armor=abilityValue(u,'방어력 감소'),triggerArmor=abilityValue(u,'발동방어력 감소'),singleArmor=abilityValue(u,'단일방어력 감소'),stackArmor=abilityValue(u,'중첩방어력 감소');
  if(/바제스/.test(n)&&isWarped(u)){armor=0;triggerArmor=0;}
  if(/퀸/.test(n)&&isWarped(u)){armor=0;triggerArmor=20;}
  if(/센고쿠/.test(n)&&/전설 \[물딜\]/.test(g)){armor=0;triggerArmor=18;}
  if(/징베/.test(n)&&/전설 \[물딜\]/.test(g)){armor=0;singleArmor=25;}
  if(/코알라/.test(n)&&isWarped(u)){armor=0;triggerArmor=0;}
  let slow=abilityValue(u,'이동속도 감소'),triggerSlow=abilityValue(u,'발동이동속도 감소');
  let singleSlow=abilityValue(u,'단일이동속도 감소')||numberInName(n,/단일이감\s*(\d+(?:\.\d+)?)/);
  let magicDef=abilityValue(u,'마법 방어력 감소');
  let magicAmp=Math.max(abilityValue(u,'마법 대미지 증가'),abilityValue(u,'단일마법 대미지 증가'),abilityValue(u,'모든피해증가'));
  let explosionAmp=abilityValue(u,'폭발형 대미지 증폭');
  if(/방주맥심/.test(n)){magicDef=10;explosionAmp=10;triggerSlow=30;}
  if(/S-베어|S 베어/.test(n)){magicDef=1;magicAmp=8;}
  // v17.8: 암브는 불리언이 아니라 소스 가중치다(카탈로그 값 0.1~2,
  // true=1). 명시적 0은 패치로 무효화된 유닛이므로 false로 취급한다
  // (기존 abilityBool은 0을 true로 읽는 버그가 있었다).
  const armorBreakRaw=(()=>{const a=u&&u.abilities||{};for(const [k,v] of Object.entries(a))if(canonicalAbility(k)==='아머브레이크')return v;return undefined;})();
  const armorBreakWeight=armorBreakRaw==null||armorBreakRaw===''?0:Number.isFinite(Number(armorBreakRaw))?Math.max(0,num(armorBreakRaw)):(String(armorBreakRaw).toLowerCase()==='false'?0:1);
  const armorBreak=armorBreakWeight>0;
  const percent=abilityBool(u,'범위 전체 체력 퍼센트 대미지')||abilityBool(u,'범위 현재 체력 퍼센트 대미지')||abilityBool(u,'범위 잃은 체력 퍼센트 대미지');
  let supportDamage=abilityBool(u,'보조딜')||abilityBool(u,'방어력 무시 대미지')||percent;
  let utility=(family==='magic'?UTILITY_MAGIC:UTILITY_PHYSICAL).some(re=>re.test(n));
  if(abilityBool(u,'유닛삭제')||armorBreak||magicDef>0||magicAmp>0||explosionAmp>0||supportDamage)utility=true;
  if(u&&u.id==='R30h'){utility=true;supportDamage=true;}
  // Koala and Baratie are explicit shared physical/magic utility. S-Bear's
  // magic amplification and magic-defense reduction are utility as well.
  const sharedUtility=!!(u&&(u.id==='V30h'||u.id==='P30h'));
  if(sharedUtility||u&&u.id==='unit_1779017164417_3162')utility=true;
  const mana=abilityValue(u,'마나 재생'),attackRaw=abilityValue(u,'공격력 증가'),triggerAttack=abilityValue(u,'발동공격력 증가'),speed=abilityValue(u,'공격속도 증가'),regen=abilityValue(u,'체력 재생'),deletion=abilityBool(u,'유닛삭제');
  const profile={family,stun:round6(stun),slow,triggerSlow,singleSlow,armor,triggerArmor,singleArmor,stackArmor,boss,frenzy,single,end,magicDef,magicAmp,explosionAmp,mana,attack:Math.max(0,attackRaw),attackPenalty:Math.max(0,-attackRaw),triggerAttack,speed,regen,armorBreak,armorBreakWeight:round2(armorBreakWeight),utility,sharedUtility,supportDamage,percent,deletion};if(u&&typeof u==='object')ROLE_PROFILE_CACHE.set(u,profile);return profile;
}

function partnerNameTokens(u){
  const raw=nameOf(u).replace(/^\([A-Z]\)\s*/i,'').replace(/\([^)]*\)/g,' ').replace(/\b(?:초월|전설|히든|영원|불멸|제한됨)\b/g,' ').replace(/[^0-9A-Za-z가-힣\s-]/g,' '),words=raw.split(/\s+/).filter(Boolean),tokens=[];if(words.length>=2)tokens.push(`${words[0]} ${words[1]}`);if(words[0])tokens.push(words[0]);if(words.length>1)tokens.push(words[words.length-1]);return[...new Set(tokens.filter(x=>x.length>=2))];
}
function descriptionPartnerSynergy(upper,candidate){
  if(!upper||!candidate||upper.id===candidate.id)return null;const desc=cleanName(upper.desc||'');if(!desc)return null;for(const token of partnerNameTokens(candidate)){let at=desc.indexOf(token);while(at>=0){const window=desc.slice(Math.max(0,at-35),Math.min(desc.length,at+token.length+35));if(/추천|조합|필수|달아|같이|세트|시너지/.test(window))return{label:`설명 직접 연계 · ${token}`,reason:`${nameOf(upper)} 스킬 설명이 ${token}을(를) 추천하거나 필수 연계로 지정합니다.`,source:'unit-desc'};at=desc.indexOf(token,at+token.length);}}return null;
}
function strategyConditions(u,role){
  const desc=cleanName(u&&u.desc||''),out=[],add=value=>{value=String(value||'').replace(/\s+/g,' ').trim();if(value&&!out.includes(value))out.push(value.length>105?`${value.slice(0,102)}…`:value);};if(role.slow<0)add(`자체 이감 ${round2(role.slow)} 페널티`);if(role.armor<0)add(`자체 방깎 ${round2(role.armor)} 페널티`);if(role.attackPenalty)add(`아군 공격력 -${round2(role.attackPenalty)} 페널티`);for(const part of desc.split(/[.\n\[\]]+/)){if(/필수|비례|페널티|특강|성장형|빨리|뉴비|추천 조합|이감이 높|다상위|단일.*끝딜|보조딜러/.test(part))add(part);}return out.slice(0,5);
}

function upperStrategy(u){
  if(!u)return{key:'none',label:'상위 미확정',summary:'메인 상위를 먼저 확정하세요.',needs:[],waives:[],partners:[],conditions:[]};
  const canonical=canonicalUpperId(u.id),role=roleProfile(u),desc=cleanName(u.desc||''),override=UPPER_STRATEGY_OVERRIDES[canonical]||{},needs=(override.needs||[]).map(([key,label,target])=>({key,label,target,reason:`${override.label||'상위'} 핵심 시너지`})),waives=(override.waives||[]).slice();let label=override.label,summary=override.summary;const addNeed=(key,needLabel,target,reason)=>{if(!needs.some(x=>x.key===key))needs.push({key,label:needLabel,target,reason});};
  if(/보조딜러\s*필수/.test(desc))addNeed('subdamage','보조·방무딜',1,'상위 스킬 설명의 보조딜러 필수 조건');
  // v16.9: 공략 근거 라인 자립도 표.  support인데 별도 라인 보강 요구
  // (예: 드래곤 단일·끝딜)가 없으면 보조·방무딜 1을 요구하고, self는
  // 설명 추정 규칙보다 우선해 자립으로 확정한다.
  const lineProfile=UPPER_LINE_PROFILE[canonical]||UPPER_LINE_PROFILE[u.id]||null;
  if(lineProfile&&lineProfile.line==='support'&&lineProfile.covered!=='single-end')addNeed('subdamage','보조·방무딜(라인 보강)',1,'공략 근거: 상위 자체 라인딜 보강 필요');
  // v16.8: 상위 자체 라인딜이 약하다고 명시된 경우(예: 크로커다일 '약한
  // 스킬딜러') 보조·방무딜을 필수 역할로 요구한다 — 50라 보스 라인 붕괴의
  // 재발 방지 규칙.  공략 근거 self로 확정된 상위에는 적용하지 않는다.
  if((!lineProfile||lineProfile.line!=='self')&&/약한\s*스킬\s*딜러|약한\s*스킬딜|라인딜?이?\s*(?:약|부족|빈)/.test(desc))addNeed('subdamage','보조·방무딜(라인 보강)',1,'상위 스킬 설명의 약한 라인딜 조건');if(/암브.*필수|필수.*암브/.test(desc))addNeed('armorBreak','암브 연계',1,'상위 스킬 설명의 암브 필수 조건');if(/공속.*(?:필수|챙)/.test(desc))addNeed('speed','공속 보강',20,'상위 스킬 설명의 공속 조건');if(/체젠.*필수/.test(desc))addNeed('regen','체젠 버프',2,'체젠 비례 스킬 조건');if(/공증이 있어야|공증.*필수/.test(desc))addNeed('attack','공증 버프',30,'공증 조건부 스킬');if(/보잡.*필수|보스.*필요/.test(desc))addNeed('boss','보잡',1,'상위 설명의 보잡 필수 조건');
  if(!label&&role.family==='physical'&&role.armorBreak){label='암브 연계형 물딜';summary='암브 수와 방깎을 함께 올릴 때 효율이 커집니다.';addNeed('armorBreak','암브 연계',1,'암브 계열 상위 조건');}
  if(!label&&role.family==='physical'&&(role.attack||role.speed)){label='버프·범위딜형 물딜';summary=`풀방깎을 먼저 맞추고 ${role.attack?`공증 ${round2(role.attack)}`:''}${role.attack&&role.speed?' · ':''}${role.speed?`공속 ${round2(role.speed)}`:''} 버프를 스플·스킬딜러에 연결합니다.`;}
  if(!label&&role.family==='physical'){label=role.supportDamage?'보조·방무딜형 물딜':'물리 스킬·범위딜형';summary='풀방깎을 먼저 맞추고 부족한 공속·보잡·이감을 실제 보유 스킬에서 보강합니다.';}
  if(!label&&role.family==='magic'&&(role.single||role.end)){label='단일·끝딜형 마딜';summary='풀이감과 광보잡을 확보한 뒤 단일·끝딜 배치로 라인을 처리합니다.';}
  if(!label&&role.family==='magic'&&(role.magicDef||role.magicAmp||role.explosionAmp)){label='마방깎·증폭 연계형 마딜';summary='마방깎·마뎀증·폭뎀증 종류를 구분해 해당 데미지 유닛과 연결합니다.';}
  if(!label&&role.family==='magic'){label='라인딜·방무딜형 마딜';summary='두 번째 상위, 마방깎·증폭, 광보잡을 실제 스킬에 맞춰 보강합니다.';}
  if(!label){label='복합 상위';summary='실제 상시·발동 스킬과 현재 결손의 순증으로 파트너를 고릅니다.';}
  const partners=UPPER_PAIR_SYNERGIES.filter(x=>canonicalUpperId(x.a)===canonical||canonicalUpperId(x.b)===canonical).map(x=>({unitId:canonicalUpperId(x.a)===canonical?x.b:x.a,label:x.label,reason:x.reason})),conditions=strategyConditions(u,role);
  return{key:override.key||'generic',label,summary,needs,waives,partners,conditions,description:desc,attackPenalty:role.attackPenalty,lineSelf:lineProfile?lineProfile.line:needs.some(x=>x.key==='subdamage')?'support':'unknown',lineNote:lineProfile&&lineProfile.note||''};
}

function skillFacts(u){
  const r=roleProfile(u),always=[],trigger=[],research=[],researchVariants=[],penalties=[],mechanics=[],stunMeta=stunResearch(u),measuredStun=!!stunMeta,push=(list,key,label,value)=>{if(value===true||num(value)>0)list.push({key,label,value:value===true?1:round3(value)});},penalty=(key,label,value)=>{if(num(value)<0)penalties.push({key,label,value:round3(value)});};
  if(stunMeta)research.push({key:'stun',label:stunMeta.active?'조건부 연구표 유효 스턴':'연구표 유효 스턴',value:stunMeta.displayStun,capture:stunMeta.capture,activeCondition:stunMeta.active?stunMeta.condition:''});else push(always,'stun','유효 스턴',r.stun);if(stunMeta&&stunMeta.variant)researchVariants.push({key:'stun',label:stunMeta.variant.label,value:stunMeta.variant.displayStun,capture:stunMeta.variant.capture,active:stunMeta.active});push(always,'slow','상시 이감',r.slow);penalty('slow','이감 페널티',r.slow);push(trigger,'triggerSlow','발동 이감',r.triggerSlow);penalty('triggerSlow','발동 이감 페널티',r.triggerSlow);push(always,'singleSlow','단일 이감',r.singleSlow);push(always,'armor','상시 방깎',r.armor);penalty('armor','방깎 페널티',r.armor);push(trigger,'triggerArmor','발동 방깎',r.triggerArmor);penalty('triggerArmor','발동 방깎 페널티',r.triggerArmor);push(always,'singleArmor','단일 방깎',r.singleArmor);push(always,'stackArmor','중첩 방깎',r.stackArmor);push(always,'magicDef','마방깎',r.magicDef);push(always,'magicAmp','마뎀증',r.magicAmp);push(always,'explosionAmp','폭뎀증',r.explosionAmp);push(always,'attack','공증',r.attack);if(r.attackPenalty)penalties.push({key:'attackPenalty',label:'아군 공증 페널티',value:-round2(r.attackPenalty)});push(trigger,'triggerAttack','발동 공증',r.triggerAttack);push(always,'speed','공속',r.speed);push(always,'regen','체젠',r.regen);push(always,'mana','마젠',r.mana);push(always,'single','단일',r.single);push(always,'end','끝딜',r.end);
  if(r.armorBreak)mechanics.push({key:'armorBreak',label:'아머브레이크'});if(r.boss&&r.frenzy)mechanics.push({key:'bossFrenzy',label:'광보잡'});else if(r.boss)mechanics.push({key:'boss',label:'보잡'});else if(r.frenzy)mechanics.push({key:'frenzy',label:'광폭 처리'});if(r.percent)mechanics.push({key:'percent',label:'범위 퍼센트 딜'});if(r.supportDamage)mechanics.push({key:'supportDamage',label:'보조·방무딜'});if(r.deletion)mechanics.push({key:'deletion',label:'유닛 삭제'});
  return{always,trigger,research,researchVariants,penalties,mechanics,measuredStun,source:'2.305 abilities + 유효 스턴 연구표'};
}

function storyGrade(u){
  if(!u)return{score:0,tier:'—',label:'스토리 —',note:'유닛 정보 없음',basis:'na',basisLabel:'해당 없음',measured:false};const measured=storyMeasuredLookup(u.id);if(measured){const row=measured.row,rank=num(row.rank),tier=storyMeasuredTier(row.tableTier),score=storyMeasuredScore(rank,measured.source.maxRank),metric=storyMeasuredMetric(row),variants=Array.isArray(row.variants)?row.variants.slice():[row],note=[`${measured.source.label} 실측 ${rank}위`,metric,row.note].filter(Boolean).join(' · ');return{score,tier,label:`스토리 ${tier} · ${rank}위`,note,basis:'measured',basisLabel:'실측',measured:true,rank,storyRank:rank,tableTier:num(row.tableTier),metricType:row.metricType,value:num(row.value),approximate:!!row.approximate,stateKey:row.stateKey||'',scope:measured.source.key,aliasOf:row.aliasOf||'',rankBasis:'measured-rank',measurement:row,variants,variantCount:variants.length};}const raw=STORY_RARE_BENCHMARKS[u.id];if(raw){const score=Math.round(20+80*(raw-STORY_RARE_MIN)/Math.max(1,STORY_RARE_MAX-STORY_RARE_MIN)),tier=score>=85?'S':score>=70?'A':score>=52?'B':score>=35?'C':'D';return{score,tier,label:`스토리 ${tier}`,note:`희귀 스토리 데미지 ${(raw/100).toFixed(2)}%`,basis:'measured',basisLabel:'실측',measured:true};}
  const known=STORY_RESEARCHED[u.id];if(known)return{score:known.score,tier:known.tier,label:`스토리 ${known.tier}`,note:known.note,basis:'research',basisLabel:'자료',measured:false};
  if(isItem(u)||['unit_1746119237460_7641','RANDOM'].includes(u.id))return{score:0,tier:'—',label:'스토리 —',note:'아이템·기준 안내 행으로 스토리 전투 등급 없음',basis:'na',basisLabel:'해당 없음',measured:false};
  const r=roleProfile(u);let score=24+(r.supportDamage?16:0)+(r.percent?10:0)+(r.boss?8:0)+(r.frenzy?8:0)+Math.min(15,Math.max(0,r.armor+r.triggerArmor)*.25)+Math.min(12,(r.single+r.end)*6);score=clamp(Math.round(score),15,78);const tier=score>=70?'A':score>=52?'B':score>=35?'C':'D',materialTier=isCommon(u)||isUncommon(u)||isSpecialTier(u);return{score,tier,label:`스토리 ${tier}`,note:materialTier?'재료 단계 유닛 · 스킬 역할 기반 추정, DPS 실측 아님':'스킬 역할 기반 추정 · 스토리 DPS 실측 아님',basis:'estimated',basisLabel:'추정',measured:false};
}

// Story combat data comes from three incomparable sources.  Keep the raw
// source grade above intact for recommendation compatibility, and derive the
// user-facing league grade separately.  The source rank is never inferred for
// an unmeasured unit.
function storyLeagueKey(u,grade){
  if(!u)return'';const g=grade||storyGrade(u);
  if(isRare(u))return'rare';
  if(g.scope==='upper'||isUpper(u))return'upper';
  if(g.scope==='nonupper'||isLegendish(u))return'legend';
  return'';
}
function storyLeagueTier(rank,size){
  const r=Math.max(0,num(rank)),n=Math.max(0,num(size));if(!r||!n||r>n)return'—';
  // Preserve the equal-quantile policy with the requested nine bands. Using
  // cumulative ceil boundaries assigns every source rank exactly once while
  // keeping the best rank in SSS and the last rank in F for every league size.
  const index=STORY_GRADE_TIERS.findIndex((tier,offset)=>r<=Math.ceil(n*(offset+1)/STORY_GRADE_TIERS.length));
  return STORY_GRADE_TIERS[index<0?STORY_GRADE_TIERS.length-1:index];
}
function storyLeagueGrade(u,sourceGrade){
  if(!u)return null;const source=sourceGrade||storyGrade(u),league=storyLeagueKey(u,source),meta=STORY_LEAGUES[league];if(!meta)return null;
  let leagueRank=0;
  if(league==='rare'&&STORY_RARE_RANKS[u.id])leagueRank=STORY_RARE_RANKS[u.id];
  else if(league==='upper'&&source.scope==='upper'&&num(source.storyRank)>0)leagueRank=num(source.storyRank);
  else if(league==='legend'&&source.scope==='nonupper'&&num(source.storyRank)>0)leagueRank=num(source.storyRank);
  const ranked=leagueRank>0,leagueScore=ranked?storyMeasuredScore(leagueRank,meta.size):null,leagueTier=ranked?storyLeagueTier(leagueRank,meta.size):source.tier;
  const rankText=ranked?`${leagueRank}/${meta.size}위`:'순위 외';
  return Object.assign({},source,{
    sourceTier:source.tier,sourceScore:source.score,sourceLabel:source.label,sourceNote:source.note,sourceRank:num(source.storyRank)||0,sourceTableTier:num(source.tableTier)||0,
    storyGroup:league,storyGroupLabel:meta.label,league,leagueLabel:meta.label,leagueRank:ranked?leagueRank:null,leagueSize:meta.size,leagueScore,leagueTier,
    tier:leagueTier,score:ranked?leagueScore:source.score,label:`${meta.label} 스토리 ${leagueTier} · ${rankText}`,note:`${meta.label} 리그 ${rankText} · ${source.note}`,
    leagueRanked:ranked,leagueBasis:ranked?'measured-rank':'unranked-estimate'
  });
}
function storyLeagueRows(units,league){
  const requested=STORY_LEAGUES[league]?league:'';
  return(units||[]).map(unit=>{const sourceGrade=storyGrade(unit),grade=storyLeagueGrade(unit,sourceGrade);return grade?{unit,grade,sourceGrade,league:grade.league}:null;}).filter(row=>row&&(!requested||row.league===requested)).sort((a,b)=>{
    const ar=a.grade.leagueRanked,br=b.grade.leagueRanked;if(ar!==br)return ar?-1:1;
    if(ar&&br&&a.grade.leagueRank!==b.grade.leagueRank)return a.grade.leagueRank-b.grade.leagueRank;
    const basisRank={measured:0,research:1,estimated:2,na:3},ab=basisRank[a.sourceGrade.basis]??4,bb=basisRank[b.sourceGrade.basis]??4;
    return ab-bb||num(b.sourceGrade.score)-num(a.sourceGrade.score)||displayNameOf(a.unit).localeCompare(displayNameOf(b.unit),'ko');
  });
}

function buildDb(units){
  const list=(units||[]).map(u=>Object.assign({},u,{name:cleanName(u.name)})),byId=new Map(list.map(u=>[u.id,u])),byGroup=new Map();
  for(const u of list){const g=groupName(u);if(!byGroup.has(g))byGroup.set(g,[]);byGroup.get(g).push(u);}
  return{units:list,byId,byGroup,commons:list.filter(u=>isCommon(u)&&COMMON_NAMES.includes(nameOf(u))),uncommons:list.filter(isUncommon),specials:list.filter(isSpecialTier),rares:list.filter(isRare),legendish:list.filter(isLegendish),uppers:list.filter(isUpper)};
}
function mergeLiveCatalog(catalog,snapshot){
  const liveMap=new Map();for(const row of snapshot&&snapshot.units||[]){const d=row.data||row;liveMap.set(row.id,Object.assign({},d,row));}
  const out=[];for(const base of catalog||[]){const live=liveMap.get(base.id)||{},hasLiveAbilities=Object.prototype.hasOwnProperty.call(live,'abilities'),merged=Object.assign({},base,live,{abilities:hasLiveAbilities?Object.assign({},live.abilities||{}):Object.assign({},base.abilities||{})});merged.tmoPercent=live.tmoPercent!=null?num(live.tmoPercent):live.percent!=null?num(live.percent):num(base.percent);merged.count=live.count!=null?num(live.count):0;out.push(merged);}
  for(const [id,live] of liveMap){if(!out.some(u=>u.id===id))out.push(Object.assign({},live));}return out;
}
function normalizeState(catalog,snapshot,settings){
  const merged=mergeLiveCatalog(catalog,snapshot||{}),db=buildDb(merged),rawCounts=Object.assign({},snapshot&&snapshot.counts||{});
  for(const u of merged){if(u.count!=null&&!Object.prototype.hasOwnProperty.call(rawCounts,u.id))rawCounts[u.id]=num(u.count);}const counts=Object.assign({},rawCounts),manual=settings&&settings.manualCounts||{};
  for(const [id,v] of Object.entries(manual)){if(v!==''&&v!=null)counts[id]=Math.max(0,num(v));}
  // v17.6(감사 P0-2): 자격 없는 ID(압살롬·비특별·미존재)는 무시한다 —
  // 규칙상 불가능한 가상 재료가 추천 계산에 섞이지 않게.
  let virtualResolved=false,virtualApplied=false;const requestedVirtualId=settings&&settings.virtualSpecialId||'',virtualId=eligible152SpecialId(db,requestedVirtualId)?requestedVirtualId:'',baselineId=String(settings&&settings.virtualSpecialBaselineId||''),baselineCaptured=!!virtualId&&baselineId===virtualId&&Object.prototype.hasOwnProperty.call(settings||{},'virtualSpecialBaselineCount'),virtualBaselineCount=baselineCaptured?Math.max(0,Math.floor(num(settings.virtualSpecialBaselineCount))):0,rawVirtualCount=num(rawCounts[virtualId]);
  if(virtualId){
    virtualResolved=baselineCaptured?rawVirtualCount>virtualBaselineCount:rawVirtualCount>0;
    if(!virtualResolved){counts[virtualId]=Math.max(0,num(counts[virtualId]))+1;virtualApplied=true;}
  }
  if(settings&&settings.superKumaOwned===false)counts[SUPER_KUMA_ID]=0;else counts[SUPER_KUMA_ID]=Math.max(1,num(counts[SUPER_KUMA_ID]));
  const wispOverride=settings&&settings.wispOverride;if(wispOverride!==''&&wispOverride!=null)counts[WISP_ID]=Math.max(0,num(wispOverride));
  const currentAbilities={};for(const [k,v] of Object.entries(snapshot&&snapshot.currentAbilities||{}))currentAbilities[canonicalAbility(k)]=num(v);
  const percent={};for(const u of merged)percent[u.id]=clamp(num(u.tmoPercent),0,100);
  return{db,units:merged,rawCounts,counts,currentAbilities,percent,wisp:num(counts[WISP_ID]),virtualId,virtualResolved,virtualApplied,virtualSpecialBaselineId:baselineCaptured?baselineId:'',virtualSpecialBaselineCount:virtualBaselineCount,stunConditions:{},snapshot:snapshot||{}};
}

function cloneCounts(c){return Object.assign({},c||{});}
function addTo(map,id,v){if(num(v)>0)map[id]=(map[id]||0)+num(v);}
function recipeSolve(db,targetId,initialCounts){
  const stock=cloneCounts(initialCounts),missing={},direct=[],commonRequired={},commonUsed={},lowestMissing={},rareUse={},specialUse={},consumed={},cycles=[],buildNeeded={common:{},uncommon:{},special:{},rare:{},upper:{},legend:{},hard:{},other:{}};let wispCost=0;
  const target=db.byId.get(targetId);
  function acquire(id,qty,stack){
    qty=num(qty);if(qty<=0)return;if(id===WISP_ID){wispCost+=qty;return;}
    const u=db.byId.get(id),tier=u?tierKey(u):(SPECIAL_IDS[id]?'hard':'other');if(tier==='common')addTo(commonRequired,id,qty);
    const have=Math.min(num(stock[id]),qty);if(have>0){stock[id]-=have;addTo(consumed,id,have);if(tier==='common')addTo(commonUsed,id,have);if(tier==='rare')addTo(rareUse,id,have);if(tier==='special')addTo(specialUse,id,have);qty-=have;}
    if(qty<=0)return;addTo(buildNeeded[tier]||(buildNeeded[tier]={}),id,qty);if(tier==='common')addTo(lowestMissing,id,qty);
    if(stack.has(id)){addTo(missing,id,qty);cycles.push(id);return;}
    if(!u||!Array.isArray(u.stuffs)||!u.stuffs.length||tier==='hard'||isItem(u)||isRandom(u)||isMystic(u)){addTo(missing,id,qty);return;}
    const next=new Set(stack);next.add(id);for(const s of u.stuffs||[])acquire(s.id,num(s.count)*qty,next);
  }
  if(target){for(const s of target.stuffs||[])direct.push({id:s.id,count:num(s.count),owned:num(stock[s.id])});}
  acquire(targetId,1,new Set());
  const missingByTier={common:{},uncommon:{},special:{},rare:{},hard:{},other:{}};for(const [id,c] of Object.entries(missing)){const u=db.byId.get(id),t=u?tierKey(u):(SPECIAL_IDS[id]?'hard':'other');if(!missingByTier[t])missingByTier[t]={};missingByTier[t][id]=c;}
  const hardMissing=Object.entries(missingByTier.hard||{}).map(([id,count])=>({id,count,name:SPECIAL_IDS[id]||nameOf(db.byId.get(id))||id}));
  return{target,targetId,wispCost,stockAfter:stock,missing,missingByTier,buildNeeded,hardMissing,direct,commonSpend:commonRequired,commonRequired,commonUsed,lowestMissing,rareUse,specialUse,consumed,cycles};
}
// Predict the *change* that one scenario-only material would cause to TMO's
// displayed completion.  The live TMO value remains the anchor: we only add
// the counterfactual fraction of the recipe that becomes satisfied.  This is
// deliberately not presented as a second observed TMO value.
//
// A Rare recipe ultimately expands to selection-wisp/common equivalents.  By
// solving the exact same hand before and after the added material, the freed
// lower materials are naturally re-used by the remaining branches.  Dividing
// that marginal saving by the empty-hand recipe cost gives a stable estimate
// without inventing a per-tier weight table.
function predictCompletionWithAddedMaterial(db,targetId,beforeCounts,afterCounts,observedPercent,materialId){
  const observed=clamp(num(observedPercent),0,100),base={
    observed,expected:observed,display:Math.floor(observed),delta:0,
    projected:false,estimated:false,materialId:String(materialId||''),
    method:'observed-tmo',reason:'no-counterfactual-material',
    recipe:{totalWispEquivalent:0,beforeWispEquivalent:0,afterWispEquivalent:0,savedWispEquivalent:0,materialConsumed:0}
  };
  if(!db||!db.byId||!db.byId.has(targetId)||!materialId)return base;
  const before=recipeSolve(db,targetId,beforeCounts||{}),after=recipeSolve(db,targetId,afterCounts||{}),empty=recipeSolve(db,targetId,{}),beforeUse=num(before.consumed&&before.consumed[materialId]),afterUse=num(after.consumed&&after.consumed[materialId]),materialConsumed=Math.max(0,afterUse-beforeUse),total=Math.max(0,num(empty.wispCost)),saved=Math.max(0,num(before.wispCost)-num(after.wispCost));
  const recipe={totalWispEquivalent:total,beforeWispEquivalent:num(before.wispCost),afterWispEquivalent:num(after.wispCost),savedWispEquivalent:saved,materialConsumed,cyclesBefore:(before.cycles||[]).slice(),cyclesAfter:(after.cycles||[]).slice()};
  if(materialConsumed<=0)return Object.assign({},base,{reason:'selected-material-not-used',recipe});
  if(total<=0)return Object.assign({},base,{reason:'recipe-has-no-wisp-equivalent-basis',recipe});
  if((before.cycles||[]).length||(after.cycles||[]).length)return Object.assign({},base,{reason:'recipe-cycle-prevents-estimate',recipe});
  if(saved<=0)return Object.assign({},base,{reason:'selected-material-does-not-reduce-recipe-distance',recipe});
  const delta=round2(100*saved/total),expected=round2(clamp(observed+delta,0,100));
  return{observed,expected,display:Math.floor(expected),delta:round2(expected-observed),projected:true,estimated:true,materialId:String(materialId),method:'observed-tmo-plus-recipe-counterfactual',reason:'selected-material-reduces-exact-recipe-distance',recipe};
}
function reserveTargets(db,counts,targetIds){
  const unique=[...new Set((targetIds||[]).filter(Boolean))];
  function contains(parentId,childId,path){if(parentId===childId)return true;if(path.has(parentId))return false;const u=db.byId.get(parentId);if(!u)return false;const next=new Set(path);next.add(parentId);return(u.stuffs||[]).some(s=>contains(s.id,childId,next));}
  const roots=unique.filter(id=>!unique.some(other=>other!==id&&contains(other,id,new Set())));
  let stock=cloneCounts(counts),remainingWisp=num(counts&&counts[WISP_ID]),reservedWispCost=0;const reservations=[];
  for(const id of roots){const r=recipeSolve(db,id,stock);stock=r.stockAfter;remainingWisp=Math.max(0,remainingWisp-r.wispCost);stock[WISP_ID]=remainingWisp;reservedWispCost+=r.wispCost;reservations.push(r);}
  return{stock,reservations,remainingWisp,reservedWispCost};
}
function materialName(db,id){return SPECIAL_IDS[id]||nameOf(db.byId.get(id))||id;}
function mapText(db,map,limit=8){return Object.entries(map||{}).sort((a,b)=>num(b[1])-num(a[1])).slice(0,limit).map(([id,c])=>`${materialName(db,id)} ${c}`).join(' · ')||'없음';}
function commonTop(db,map,limit=3){return Object.entries(map||{}).sort((a,b)=>num(b[1])-num(a[1])).slice(0,limit).map(([id,count])=>({id,name:materialName(db,id),count,color:COMMON_COLORS[materialName(db,id)]||'#64748b'}));}

// TMO 레시피에는 일반 조합으로 만들 수 없는 선행 재료/유닛도 stuffs로 함께 들어옵니다.
// 이들은 완성도와 별개로 실제 패에 잡힌 뒤에만 추천 후보가 될 수 있습니다.
function specialPrerequisiteMeta(db,id){
  if(!id||id===WISP_ID)return null;const u=db&&db.byId&&db.byId.get(id);
  if(id===RAYLEIGH_HIDDEN_ID)return{kind:'rayleigh',name:materialName(db,id)};
  if(id===PIRATE_SHIP_MATERIAL_ID||isShip(u))return{kind:'ship',name:materialName(db,id)};
  if(isItem(u))return{kind:'item',name:materialName(db,id)};
  if(isRandom(u)||u&&u.hardSpecial===true||u&&tierKey(u)==='hard')return{kind:'special',name:materialName(db,id)};
  return null;
}
function specialPrerequisiteStatus(db,unit,counts){
  const stock=cloneCounts(counts),missingById=new Map(),path=new Set();let exception=false;
  const addMissing=(id,count,meta)=>{const previous=missingById.get(id);if(previous)previous.count+=count;else missingById.set(id,{id,name:meta.name||materialName(db,id),count,kind:meta.kind});};
  function acquire(id,quantity,underAbsalom){
    let qty=Math.max(0,num(quantity));if(qty<=0||id===WISP_ID)return;
    const have=Math.min(Math.max(0,num(stock[id])),qty);if(have>0){stock[id]-=have;qty-=have;}if(qty<=0)return;
    const u=db&&db.byId&&db.byId.get(id),meta=specialPrerequisiteMeta(db,id);
    if(meta){if(underAbsalom){exception=true;return;}addMissing(id,qty,meta);return;}
    if(!u||!Array.isArray(u.stuffs)||!u.stuffs.length||path.has(id))return;
    path.add(id);const childUnderAbsalom=underAbsalom||isAbsalom(u);for(const stuff of u.stuffs)acquire(stuff.id,num(stuff.count)*qty,childUnderAbsalom);path.delete(id);
  }
  if(unit&&Array.isArray(unit.stuffs)){const underAbsalom=isAbsalom(unit);for(const stuff of unit.stuffs)acquire(stuff.id,num(stuff.count),underAbsalom);}
  const missing=[...missingById.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko')||String(a.id).localeCompare(String(b.id))),allowed=missing.length===0;
  return{allowed,blocked:!allowed,missing,exception};
}

function completionPercent(state,u){return clamp(num(state.percent[u.id]),0,100);}
function ownedUnits(state,pred){const out=[];for(const u of state.db.units){const c=num(state.counts[u.id]);if(c<=0||pred&&!pred(u))continue;for(let i=0;i<c;i++)out.push(u);}return out;}
function hasRawAbility(state,key){return Object.prototype.hasOwnProperty.call(state.currentAbilities,canonicalAbility(key));}
function rawAbility(state,key){return num(state.currentAbilities[canonicalAbility(key)]);}
function isMeasuredControlUnit(u){return stunTableValue(u)!=null;}
function isRoleBearingUnit(u){return!!u&&!isCommon(u)&&!isUncommon(u)&&(isUpper(u)||isLegendish(u)||isRare(u)||isMeasuredControlUnit(u)||Object.keys(u.abilities||{}).some(key=>['스턴','이동속도 감소','발동이동속도 감소','단일이동속도 감소','방어력 감소','발동방어력 감소','단일방어력 감소','중첩방어력 감소','아머브레이크','보스 잡기','광폭화','단일','끝딜','마나 재생','공격력 증가','발동공격력 증가','공격속도 증가','체력 재생','마법 방어력 감소','마법 대미지 증가','폭발형 대미지 증폭','유닛삭제'].includes(canonicalAbility(key))));}
function ownedRoleUnits(state){
  const raw=ownedUnits(state,isRoleBearingUnit),out=[],variants=new Map();for(const u of raw){if(isUpper(u)&&UPPER_VARIANT_CANONICAL[u.id]){const key=canonicalUpperId(u.id),previous=variants.get(key);if(!previous||upperVariantPriority(u.id)>upperVariantPriority(previous.id))variants.set(key,u);}else out.push(u);}return out.concat([...variants.values()]);
}
function ownedDisplayUnits(state,pred){const raw=ownedUnits(state,pred),out=[],variants=new Map();for(const u of raw){if(isUpper(u)&&UPPER_VARIANT_CANONICAL[u.id]){const key=canonicalUpperId(u.id),previous=variants.get(key);if(!previous||upperVariantPriority(u.id)>upperVariantPriority(previous.id))variants.set(key,u);}else out.push(u);}return out.concat([...variants.values()]);}
function ownedRoleEntries(state){
  const out=[],variants=new Map();for(const u of state.db.units){const count=num(state.counts[u.id]);if(count<=0||!isRoleBearingUnit(u))continue;if(isUpper(u)&&UPPER_VARIANT_CANONICAL[u.id]){const key=canonicalUpperId(u.id),previous=variants.get(key);if(!previous||upperVariantPriority(u.id)>upperVariantPriority(previous.unit.id))variants.set(key,{unit:u,count:1});}else out.push({unit:u,count});}return out.concat([...variants.values()]);
}
function ownedRoleCounts(state,mode){
  const entries=ownedRoleEntries(state);let main=0,stun=0,slow=0,triggerSlow=0,triggerSlowSources=0,armor=0,triggerArmor=0,singleArmor=0,stackArmor=0,armorBreak=0,armorBreakUnits=0,single=0,end=0,singleEndUnits=0,singleEndExpected=0,singleEndMax=0,singleEndLargest=0,toki=0,boss=0,frenzy=0,utility=0,subdamage=0,magicDef=0,magicAmp=0,explosionAmp=0,attack=0,triggerAttack=0,speed=0,regen=0,mana=0,deletion=0,total=0;let vegaSeen=false;
  for(const entry of entries){const u=entry.unit,count=isUpper(u)&&/베가펑크/.test(nameOf(u))?(vegaSeen?0:1):entry.count;if(isUpper(u)&&/베가펑크/.test(nameOf(u)))vegaSeen=true;if(count<=0)continue;const r=roleProfile(u),finish=magicFinishProfile(u),n=nameOf(u);total+=count;if(isUpper(u)&&(r.family===mode||r.family==='neutral'))main+=count;stun+=r.stun*count;slow+=r.slow*count;triggerSlow+=r.triggerSlow*count;if(r.triggerSlow>0)triggerSlowSources+=count;armor+=r.armor*count;triggerArmor+=r.triggerArmor*count;singleArmor+=r.singleArmor*count;stackArmor+=r.stackArmor*count;armorBreak+=num(r.armorBreakWeight)*count;if(r.armorBreak)armorBreakUnits+=count;single+=r.single*count;end+=r.end*count;if(finish.directCredit>0)singleEndUnits+=count;singleEndExpected+=finish.directCredit*count;singleEndMax+=finish.maxCredit*count;singleEndLargest=Math.max(singleEndLargest,finish.directCredit);if(/^토키(?:\s|\()/.test(n))toki+=count;if(r.boss)boss+=count;if(r.frenzy)frenzy+=count;if(r.utility)utility+=count;if(r.supportDamage)subdamage+=count;magicDef+=r.magicDef*count;magicAmp+=r.magicAmp*count;explosionAmp+=r.explosionAmp*count;attack+=(r.attack-r.attackPenalty)*count;triggerAttack+=r.triggerAttack*count;speed+=r.speed*count;regen+=r.regen*count;mana+=r.mana*count;if(r.deletion)deletion+=count;}
  return{main,stun:round6(stun),slow:round2(slow),triggerSlow:round2(triggerSlow),triggerSlowSources,armor:round2(armor),triggerArmor:round2(triggerArmor),singleArmor:round2(singleArmor),stackArmor:round2(stackArmor),armorBreak:round2(armorBreak),armorBreakUnits,single:round2(single),end:round2(end),singleEnd:round2(single+end),singleEndUnits:round2(singleEndUnits),singleEndExpected:round2(singleEndExpected),singleEndMax:round2(singleEndMax),singleEndLargest:round2(singleEndLargest),singleEndStable:round2(Math.max(0,singleEndExpected-singleEndLargest)),toki:round2(toki),boss,frenzy,bossFrenzy:Math.min(boss,frenzy),utility,subdamage,magicDef:round2(magicDef),magicAmp:round2(magicAmp),explosionAmp:round2(explosionAmp),attack:round2(attack),triggerAttack:round2(triggerAttack),speed:round2(speed),regen:round2(regen),mana:round2(mana),deletion,total};
}
function ownedRawRoleCounts(state){
  const entries=ownedRoleEntries(state);let stun=0,slow=0,triggerSlow=0,armor=0,triggerArmor=0,singleArmor=0,stackArmor=0,armorBreak=0,magicDef=0,magicAmp=0,explosionAmp=0,attack=0,triggerAttack=0,speed=0,regen=0,mana=0;let vegaSeen=false;for(const entry of entries){const u=entry.unit,count=isUpper(u)&&/베가펑크/.test(nameOf(u))?(vegaSeen?0:1):entry.count;if(isUpper(u)&&/베가펑크/.test(nameOf(u)))vegaSeen=true;if(count<=0)continue;stun+=abilityValue(u,'스턴')*count;slow+=abilityValue(u,'이동속도 감소')*count;triggerSlow+=abilityValue(u,'발동이동속도 감소')*count;armor+=abilityValue(u,'방어력 감소')*count;triggerArmor+=abilityValue(u,'발동방어력 감소')*count;singleArmor+=abilityValue(u,'단일방어력 감소')*count;stackArmor+=abilityValue(u,'중첩방어력 감소')*count;armorBreak+=num(roleProfile(u).armorBreakWeight)*count;magicDef+=abilityValue(u,'마법 방어력 감소')*count;magicAmp+=Math.max(abilityValue(u,'마법 대미지 증가'),abilityValue(u,'단일마법 대미지 증가'),abilityValue(u,'모든피해증가'))*count;explosionAmp+=abilityValue(u,'폭발형 대미지 증폭')*count;attack+=abilityValue(u,'공격력 증가')*count;triggerAttack+=abilityValue(u,'발동공격력 증가')*count;speed+=abilityValue(u,'공격속도 증가')*count;regen+=abilityValue(u,'체력 재생')*count;mana+=abilityValue(u,'마나 재생')*count;}return{stun:round6(stun),slow:round2(slow),triggerSlow:round2(triggerSlow),armor:round2(armor),triggerArmor:round2(triggerArmor),singleArmor:round2(singleArmor),stackArmor:round2(stackArmor),armorBreak:round2(armorBreak),magicDef:round2(magicDef),magicAmp:round2(magicAmp),explosionAmp:round2(explosionAmp),attack:round2(attack),triggerAttack:round2(triggerAttack),speed:round2(speed),regen:round2(regen),mana:round2(mana)};
}
function transitionSpec(spec,state,beforeCounts,afterCounts,mode,sourceSuffix){
  const before=ownedRoleCounts(Object.assign({},state,{counts:beforeCounts}),mode),after=ownedRoleCounts(Object.assign({},state,{counts:afterCounts}),mode),out=Object.assign({},spec),signed=new Set(['slow','triggerSlow','armor','triggerArmor','attack','triggerAttack']);for(const key of ['main','stun','slow','triggerSlow','triggerSlowSources','armor','triggerArmor','singleArmor','stackArmor','armorBreak','armorBreakUnits','single','end','singleEndUnits','singleEndExpected','singleEndMax','toki','boss','frenzy','utility','subdamage','magicDef','magicAmp','explosionAmp','attack','triggerAttack','speed','regen','mana','deletion']){const value=num(out[key])+num(after[key])-num(before[key]);out[key]=(key==='stun'?round6:round2)(signed.has(key)?value:Math.max(0,value));}out.singleEnd=round2(out.single+out.end);out.singleEndLargest=round2(after.singleEndLargest);out.singleEndStable=round2(Math.max(0,num(out.singleEndExpected)-num(out.singleEndLargest)));out.bossFrenzy=Math.min(num(out.boss),num(out.frenzy));if(sourceSuffix)out.source=`${out.source}${sourceSuffix}`;return out;
}
function applyBuildStep(state,spec,stock,unit,mode,availableWisp){
  const before=cloneCounts(stock),solve=recipeSolve(state.db,unit.id,before),after=cloneCounts(solve.stockAfter),remainingWisp=Math.max(0,num(availableWisp)-solve.wispCost);after[WISP_ID]=remainingWisp;after[unit.id]=num(after[unit.id])+1;return{solve,stock:after,remainingWisp,spec:transitionSpec(spec,state,before,after,mode,'')};
}
function projectedCountsForTarget(state,u,baseCounts){
  const before=cloneCounts(baseCounts||state.counts);if(!u||num(before[u.id])>0)return before;const solve=recipeSolve(state.db,u.id,before),after=solve.stockAfter;after[u.id]=num(after[u.id])+1;after[WISP_ID]=Math.max(0,num(before[WISP_ID])-solve.wispCost);return after;
}
function currentSpec(state,mode,settings,projectedUpper){
  const rc=ownedRoleCounts(state,mode),rawRc=ownedRawRoleCounts(state),raw=Object.keys(state.currentAbilities).length>0,corrected=(key,fallback,rawBase,precision=2,signed=false)=>hasRawAbility(state,key)?(precision===6?round6:precision===3?round3:round2)(signed?rawAbility(state,key)+num(fallback)-num(rawBase):Math.max(0,rawAbility(state,key)+num(fallback)-num(rawBase))):fallback;
  const rawMagicKeys=['마법 대미지 증가','단일마법 대미지 증가','모든피해증가'].filter(k=>hasRawAbility(state,k)),magicAmp=rawMagicKeys.length?round2(Math.max(0,Math.max(...rawMagicKeys.map(k=>rawAbility(state,k)))+rc.magicAmp-rawRc.magicAmp)):rc.magicAmp;
  let spec={source:raw?'TMO 원문 + 역할 교정':'보유 유닛 추정',mode,main:rc.main,stun:corrected('스턴',rc.stun,rawRc.stun,6),slow:corrected('이동속도 감소',rc.slow,rawRc.slow,2,true),triggerSlow:corrected('발동이동속도 감소',rc.triggerSlow,rawRc.triggerSlow,2,true),triggerSlowSources:rc.triggerSlowSources,armor:corrected('방어력 감소',rc.armor,rawRc.armor,2,true),triggerArmor:corrected('발동방어력 감소',rc.triggerArmor,rawRc.triggerArmor,2,true),singleArmor:corrected('단일방어력 감소',rc.singleArmor,rawRc.singleArmor),stackArmor:corrected('중첩방어력 감소',rc.stackArmor,rawRc.stackArmor),armorBreak:corrected('아머브레이크',rc.armorBreak,rawRc.armorBreak),armorBreakUnits:rc.armorBreakUnits,single:rc.single,end:rc.end,singleEnd:rc.singleEnd,singleEndUnits:rc.singleEndUnits,singleEndExpected:rc.singleEndExpected,singleEndMax:rc.singleEndMax,singleEndLargest:rc.singleEndLargest,singleEndStable:rc.singleEndStable,toki:rc.toki,boss:rc.boss,frenzy:rc.frenzy,bossFrenzy:rc.bossFrenzy,utility:rc.utility,subdamage:rc.subdamage,magicDef:corrected('마법 방어력 감소',rc.magicDef,rawRc.magicDef),magicAmp,explosionAmp:corrected('폭발형 대미지 증폭',rc.explosionAmp,rawRc.explosionAmp),attack:corrected('공격력 증가',rc.attack,rawRc.attack,2,true),triggerAttack:corrected('발동공격력 증가',rc.triggerAttack,rawRc.triggerAttack,2,true),speed:corrected('공격속도 증가',rc.speed,rawRc.speed),regen:corrected('체력 재생',rc.regen,rawRc.regen),mana:corrected('마나 재생',rc.mana,rawRc.mana),deletion:rc.deletion};
  // v17: 연구소 4종은 다단계가 아니라 1회 구매 체크박스로 확정됐다
  // (2.305 [C]/[R] 동일): 공업 +12% · 이감업 +10%p · 체젠 +0.45/s ·
  // 마젠 +0.8/s.  TMO 애드온은 연구 상태를 전송하지 않으므로 사용자
  // 체크 입력만이 근거이고, 미체크는 0 가산이다.
  const lab=settings&&settings.labResearch||null;
  if(lab&&(lab.attack||lab.slow||lab.hpRegen||lab.mpRegen)){
    if(lab.attack)spec.attack=round2(num(spec.attack)+12);
    if(lab.slow)spec.slow=round2(num(spec.slow)+10);
    if(lab.hpRegen)spec.regen=round2(num(spec.regen)+.45);
    if(lab.mpRegen)spec.mana=round2(num(spec.mana)+.8);
    spec.labResearch=Object.assign({},lab);
    spec.source=`${spec.source} + 연구소`;
  }
  if(projectedUpper&&num(state.counts[projectedUpper.id])<=0){const after=projectedCountsForTarget(state,projectedUpper,state.counts);spec=transitionSpec(spec,state,state.counts,after,mode,' + 확정 상위 예상');}return spec;
}
function finalGradeSpec(state,mode,settings,projectedUpper){
  const live=currentSpec(state,mode,settings,projectedUpper),finalCounts=cloneCounts(state.counts);for(const unit of state.db.units)if(!isLegendish(unit)&&!isUpper(unit))finalCounts[unit.id]=0;
  return transitionSpec(live,state,state.counts,finalCounts,mode,' · 판매 후 최종 전설급만');
}
function controlEnvelope(slow,stun,targetSlow,targetStun,mode,meta){
  const r=CONTROL_ENVELOPE,profileMode=mode==='magic'?'magic':'physical',m=meta||{};slow=round2(Math.max(0,num(slow)));stun=round6(Math.max(0,num(stun)));targetSlow=Math.max(.01,num(targetSlow));targetStun=Math.max(.01,num(targetStun));
  const staticSlow=round2(m.staticSlow!=null?Math.max(0,num(m.staticSlow)):slow),triggerSlow=round2(Math.max(0,num(m.triggerSlow))),conditionalSlow=round2(m.conditionalSlow!=null?Math.max(slow,num(m.conditionalSlow)):slow),maxSlow=round2(m.maxSlow!=null?Math.max(conditionalSlow,num(m.maxSlow)):Math.max(conditionalSlow,staticSlow+triggerSlow)),slowRatio=slow/targetSlow,slowFloor=round2(targetSlow*r.slowFloorRatio),fullSlow=slow+1e-9>=targetSlow,floorSlow=slow+1e-9>=slowFloor;
  const damageReady=!!m.damageReady,finishReady=!!m.finishReady,operationalStun=round3(profileMode==='physical'?r.physicalOperationalStun:finishReady?1:r.magicOperationalStun),expertStun=profileMode==='physical'?r.physicalExpertStun:operationalStun,stableStun=r.stableStun;
  const stable=fullSlow&&stun+1e-9>=stableStun,operational=fullSlow&&stun+1e-9>=operationalStun,expertPhysical=!stable&&!operational&&profileMode==='physical'&&damageReady&&fullSlow&&stun+1e-9>=expertStun,conditional=!stable&&!operational&&!expertPhysical&&floorSlow&&stun+1e-9>=stableStun,edge=operational||expertPhysical||conditional;
  const requiredSlow=round2(targetSlow),slowGap=round2(Math.max(0,requiredSlow-slow)),requiredStun=round3(fullSlow&&profileMode==='physical'&&damageReady?expertStun:fullSlow?operationalStun:floorSlow?stableStun:operationalStun),rawStunGap=round3(Math.max(0,requiredStun-stun)),recommendStun=fullSlow&&rawStunGap>0&&requiredStun<=r.efficientStunCap+1e-9,stunGap=recommendStun?rawStunGap:0;
  const slowProgress=clamp(slow/targetSlow,0,1),stunProgress=clamp(stun/Math.max(.01,operationalStun),0,1),controlCompletion=stable?1:edge?.9:clamp(.55*slowProgress+.3*stunProgress,0,.85),alternatives=[];
  if(slowGap>0)alternatives.push({key:'slow',label:'이감 우선 보강',current:slow,target:requiredSlow,gap:slowGap,primary:true});if(recommendStun)alternatives.push({key:'stun',label:'유효 스턴 보강',current:stun,target:requiredStun,gap:stunGap,primary:slowGap<=0});
  const route=stable?'comfortable':operational?'operational':expertPhysical?'expert-physical':conditional?'conditional-slow':'danger';let note;
  if(stable)note=`풀이감 + 유효 스턴 ${stableStun}의 편안한 제어 안정선입니다. 추가 스턴은 추천하지 않습니다.`;
  else if(operational)note=`역할표 운영 진입선입니다. ${profileMode==='physical'?'방깎·보잡·실제 보스 화력':'단끝·광보잡·두 번째 상위'}이 남았다면 스턴보다 그 역할을 먼저 채우세요. 보스 처치 보장은 별도입니다.`;
  else if(expertPhysical)note=`물딜 0.5스턴 하드 최소선입니다. 상시 방깎·광보잡·풀이감은 갖췄지만 보스 DPS 실측이 없으면 클리어 판정으로 쓰지 않습니다. 1.5스턴은 마지막 안정 보강입니다.`;
  else if(conditional)note=`이감 ${round2(slow)}은 조건부 운영권입니다. 스턴을 2까지 올리지 말고 이감 ${requiredSlow}을 먼저 맞추세요.`;
  else if(!floorSlow)note=`이감 ${round2(slow)}은 위험권입니다. 유효 스턴 ${stun}이 높아도 안정권으로 올리지 않으며 이감 +${slowGap}을 먼저 권합니다.`;
  else if(!fullSlow)note=`이감이 ${requiredSlow}에 못 미칩니다. 두 번째 스턴보다 이감 +${slowGap}을 먼저 채우세요.`;
  else note=`풀이감은 갖췄습니다. 운영 가능선까지 유효 스턴 +${rawStunGap}이 필요합니다.`;
  const captureRate=stunCaptureRate(stun),captureAtHalf=stunCaptureRate(.5),captureAtExpert=stunCaptureRate(expertStun),captureAtOperational=stunCaptureRate(operationalStun),captureAtOne=stunCaptureRate(1),captureAtStable=stunCaptureRate(stableStun),captureAtTwo=stunCaptureRate(2);
  return{status:stable?'safe':edge?'edge':'danger',label:stable?'편안한 제어 안정선':operational?'역할표 운영 진입선':expertPhysical?'물딜 0.5 최소선 · 화력 미검증':conditional?'조건부 운영권':'위험권',route,profileMode,slow,stableSlow:slow,stun,staticSlow,triggerSlow,conditionalSlow,expectedSlow:conditionalSlow,maxSlow,triggerSlowSources:num(m.triggerSlowSources),triggerSafeWeight:num(m.triggerSafeWeight),triggerExpectedWeight:num(m.triggerExpectedWeight),captureRate,targetSlow:round2(targetSlow),targetStun:round2(targetStun),safeFullStun:stableStun,edgeFullStun:operationalStun,operationalStun,expertStun,expertPhysical,stableStun,safeLowSlow:slowFloor,safeLowStun:stableStun,dangerExampleSlow:Math.round(targetSlow*.49),dangerExampleStun:2,mixedMinSlow:slowFloor,mixedMinStun:operationalStun,slowOverrideTarget:targetSlow,stunOverrideTarget:null,requiredSlow,requiredStun,edgeRequiredStun:operationalStun,slowGap,stunGap,rawStunGap,recommendStun,controlCompletion:round2(controlCompletion),clearCompletion:stable?1:edge?0.9:round2(controlCompletion),slowRatio:round2(slowRatio),conditionalSlowRatio:round2(conditionalSlow/targetSlow),stunRatio:round2(stun/targetStun),slowCredit:round2(slowProgress),stunCredit:round2(clamp(stun/stableStun,0,1)),envelopeScore:round2(controlCompletion),mixedFloorPassed:floorSlow,mixedSafe:stable,slowOverride:false,stunOverride:false,efficientStunCap:r.efficientStunCap,overEfficientStun:stun>r.efficientStunCap+.0005,damageReady,finishReady,alternatives,captureBenchmarks:{half:captureAtHalf,expert:captureAtExpert,operational:captureAtOperational,one:captureAtOne,stable:captureAtStable,two:captureAtTwo,gainOneToStable:round2(captureAtStable-captureAtOne),gainStableToTwo:round2(captureAtTwo-captureAtStable)},note};
}
function controlState(spec,mode,settings){
  const g=GOROSEI[settings&&settings.gorosei]||GOROSEI.none,targetSlow=mode==='magic'?g.slowMagic:g.slowPhysical,staticSlow=Math.max(0,num(spec.slow)),triggerSlow=Math.max(0,num(spec.triggerSlow)),triggerSlowSources=Math.max(triggerSlow>0?1:0,num(spec.triggerSlowSources)),multi=triggerSlowSources>=2,safeWeight=triggerSlow?multi?CONTROL_ENVELOPE.triggerSafeWeightMulti:CONTROL_ENVELOPE.triggerSafeWeightOne:1,expectedWeight=triggerSlow?multi?CONTROL_ENVELOPE.triggerExpectedWeightMulti:CONTROL_ENVELOPE.triggerExpectedWeightOne:1,stableSlow=staticSlow+triggerSlow*safeWeight,conditionalSlow=staticSlow+triggerSlow*expectedWeight;
  // 발동 방깎은 끊길 수 있으므로 0.5스턴 예외를 여는 풀방깎 판정에도
  // 넣지 않습니다. 상시 방깎만 하드 게이트를 닫고 발동 수치는 참고값입니다.
  // 물딜은 상시 방깎 180~210 구간의 진입선(워큐리 190)을 먼저
  // 확보합니다. 210을 하드 게이트로 두면 1.5스턴을 채우려다 방깎과
  // 이감·광보잡을 잃는 조합이 선택되므로, 210은 이후 보강 목표입니다.
  const upper=settings&&settings._upperUnit||null,exceptionActive=physicalArmorException(upper)&&enoughPhysicalBuffs(spec,settings),armorTarget=exceptionActive?120:g.armorSoft,staticArmor=num(spec.armor),triggerArmor=Math.max(0,num(spec.triggerArmor)),damageReady=mode==='physical'&&staticArmor>=armorTarget&&num(spec.boss)>=1&&num(spec.frenzy)>=1,finishReady=mode==='magic'&&num(spec.main)>=2&&num(spec.boss)>=1&&num(spec.frenzy)>=1&&num(spec.single)>=2&&num(spec.end)>=1;
  return controlEnvelope(stableSlow,spec.stun,targetSlow,g.stun,mode,{staticSlow,triggerSlow,conditionalSlow,maxSlow:staticSlow+triggerSlow,triggerSlowSources,triggerSafeWeight:safeWeight,triggerExpectedWeight:expectedWeight,damageReady,finishReady});
}
function normalizeMagicRoute(value){
  value=String(value||'auto').toLowerCase();if(['dual','double','twoupper','two-upper','2upper','상위2'].includes(value))return'dual';if(['singleend','single-end','oneupper','one-upper','1upper','단끝'].includes(value))return'singleEnd';return'auto';
}
function physicalArmorException(upper){
  if(!upper)return false;const n=nameOf(upper),g=groupName(upper);return(/니카/.test(n)&&g.includes('영원'))||(/거프/.test(n)&&g.includes('불멸'));
}
function enoughPhysicalBuffs(spec,settings){
  if(settings&&settings.armorExceptionBuffReady===true)return true;if(settings&&settings.armorExceptionBuffReady===false)return false;const attack=num(spec.attack)+num(spec.triggerAttack)*.65,speed=num(spec.speed);return attack>=60||(attack>=30&&speed>=20);
}
function routeDistance(requirements){
  return round2((requirements||[]).filter(r=>r.required!==false).reduce((sum,r)=>sum+num(r.weight)*clamp((num(r.target)-num(r.current))/Math.max(.01,num(r.target)),0,1),0));
}
function clearProfileDetails(spec,mode,settings){
  spec=spec||{};settings=settings||{};mode=mode==='magic'?'magic':'physical';const g=GOROSEI[settings.gorosei]||GOROSEI.none,ctl=controlState(spec,mode,settings),slowTarget=mode==='magic'?g.slowMagic:g.slowPhysical,stun=num(spec.stun),stunBase=Math.min(.5,Math.max(0,stun)),stunFull=Math.max(0,stun),bossFrenzy=Math.min(num(spec.boss),num(spec.frenzy));
  if(mode==='physical'){
    const upper=settings._upperUnit||null,exceptionEligible=physicalArmorException(upper),buffReady=enoughPhysicalBuffs(spec,settings),exceptionActive=exceptionEligible&&buffReady,armorFloor=exceptionActive?120:g.armorSoft,armorIdeal=exceptionActive?120:g.armorSafe,armorTarget=armorFloor,armorCurrent=num(spec.armor),triggerArmor=Math.max(0,num(spec.triggerArmor)),armorExpected=armorCurrent+triggerArmor*.65,armorMaximum=armorCurrent+triggerArmor;
    const requirements=[
      {key:'main',label:'상위 딜러',current:num(spec.main),target:1,weight:120},
      {key:'armor',label:exceptionActive?'버프 예외 상시 방깎':'상시 풀방깎',current:armorCurrent,target:armorTarget,weight:110,meta:{floor:armorFloor,safe:armorIdeal,ideal:armorIdeal,range:exceptionActive?'120+':`${armorFloor}~${armorIdeal}`,static:round2(armorCurrent),trigger:round2(triggerArmor),expected:round2(armorExpected),maximum:round2(armorMaximum),conditionalOnly:armorCurrent<armorTarget&&armorExpected>=armorTarget}},
      {key:'stunBase',label:'최소 0.5 스턴',current:stunBase,target:.5,weight:110},
      {key:'slow',label:`이감 ${slowTarget}%`,current:ctl.slow,target:slowTarget,weight:95},
      {key:'bossFrenzy',label:'광보잡',current:bossFrenzy,target:1,weight:95},
      {key:'stunFull',label:'충분한 1.5 스턴',current:stunFull,target:1.5,weight:35,meta:{lastPriority:true}}
    ];
    return{mode,key:'physical',label:'물딜 상위 1 + 상시 풀방깎',requirements,distance:routeDistance(requirements),armorFloor,armorTarget,armorIdeal,armorCurrent:round2(armorCurrent),armorStatic:round2(armorCurrent),armorTrigger:round2(triggerArmor),armorExpected:round2(armorExpected),armorMaximum:round2(armorMaximum),armorConditionalOnly:armorCurrent<armorTarget&&armorExpected>=armorTarget,armorExceptionEligible:exceptionEligible,armorExceptionBuffReady:buffReady,armorExceptionActive:exceptionActive,slowTarget,stunTarget:1.5,priority:['armor','stunBase','slow','bossFrenzy','stunFull'],note:exceptionActive?'니카 영원함/거프 불멸 + 충분한 버프 예외도 상시 방깎 120부터 계산합니다.':'표준 물딜은 0.5스턴과 상시 방깎 180을 먼저 고정하고, 이감·광보잡 뒤에 남는 자리로 1.5스턴을 보강합니다. 210은 완성 보강 목표입니다.'};
  }
  const singleEndExpected=spec.singleEndExpected!=null?num(spec.singleEndExpected):0,singleEndStable=spec.singleEndStable!=null?num(spec.singleEndStable):Math.max(0,singleEndExpected-num(spec.singleEndLargest)),singleEndMaximum=spec.singleEndMax!=null?num(spec.singleEndMax):singleEndExpected,dual=[
    {key:'main',label:'상위 딜러 2',current:num(spec.main),target:2,weight:110},
    {key:'stunBase',label:'최소 0.5 스턴',current:stunBase,target:.5,weight:110},
    {key:'slow',label:`이감 ${slowTarget}%`,current:ctl.slow,target:slowTarget,weight:95},
    {key:'stunFull',label:'충분한 1.5 스턴',current:stunFull,target:1.5,weight:85},
    {key:'bossFrenzy',label:'광보잡',current:bossFrenzy,target:1,weight:70},
    {key:'toki',label:'토키',current:num(spec.toki),target:1,weight:70}
  ],singleEnd=[
    {key:'main',label:'상위 딜러 1',current:num(spec.main),target:1,weight:120},
    {key:'bossFrenzy',label:'광보잡',current:bossFrenzy,target:1,weight:110},
    {key:'stunBase',label:'최소 0.5 스턴',current:stunBase,target:.5,weight:110},
    {key:'slow',label:`이감 ${slowTarget}%`,current:ctl.slow,target:slowTarget,weight:95},
    {key:'stunFull',label:'충분한 1.5 스턴',current:stunFull,target:1.5,weight:85},
    {key:'singleEndExpected',label:'검증된 보조 단일·끝딜',current:singleEndExpected,target:3,weight:70,meta:{stable:round2(singleEndStable),maximum:round2(singleEndMaximum),verifiedUnits:num(spec.singleEndUnits)}},
    // v17.6(감사 P0-3): 합산 환산만 검사하면 단일 전용 3기(끝딜 0)나
    // 끝딜 전용 3기도 통과한다.  사용자 기준 악몽 스펙(단일 2~3 ·
    // 끝딜 1~2)대로 두 축을 독립 필수로 하드 컷한다.
    {key:'single',label:'단일딜 환산 2',current:num(spec.single),target:2,weight:68},
    {key:'end',label:'끝딜 환산 1',current:num(spec.end),target:1,weight:66}
  ],dualDistance=routeDistance(dual),singleEndDistance=routeDistance(singleEnd),requested=normalizeMagicRoute(settings._resolvedMagicRoute||settings.magicRoute),selected=requested==='auto'?(dualDistance<=singleEndDistance?'dual':'singleEnd'):requested,requirements=selected==='dual'?dual:singleEnd;
  return{mode,key:selected,label:selected==='dual'?'마딜 2상위 + 토키':'마딜 1상위 + 단일·끝딜',requested,requirements,distance:selected==='dual'?dualDistance:singleEndDistance,slowTarget,stunTarget:1.5,singleEndFloor:3,singleEndStable:3,priority:selected==='dual'?['main','stunBase','slow','stunFull','bossFrenzy','toki']:['bossFrenzy','stunBase','slow','stunFull','singleEndExpected'],routes:{dual:{key:'dual',label:'2상위 + 토키',distance:dualDistance,requirements:dual},singleEnd:{key:'singleEnd',label:'1상위 + 단·끝 3~4',distance:singleEndDistance,requirements:singleEnd}},note:selected==='dual'?'두 번째 상위와 0.5스턴을 최우선으로 보고, 토키·광보잡을 마감합니다.':'광보잡과 0.5스턴을 먼저 지키고, 단·끝은 메인 상위를 제외한 직접 abilities 기여만 합산합니다.'};
}
function deficits(spec,mode,settings){
  const ctl=controlState(spec,mode,settings),profile=clearProfileDetails(spec,mode,settings),req=[],upper=settings&&settings._upperUnit,strategy=upperStrategy(upper);
  const add=(key,label,current,target,weight,required=true,meta={})=>req.push(Object.assign({key,label,current:round2(current),target:round2(target),gap:round2(Math.max(0,target-current)),weight,required,recommended:!required,status:current>=target?'ok':current>=target*.7?'warn':'bad'},meta));
  for(const r of profile.requirements)add(r.key,r.label,r.current,r.target,r.weight,r.required!==false,r.meta||{});
  if(mode==='physical'&&!profile.requirements.some(r=>r.key==='bossFrenzy')){add('bossFrenzy','보스·광폭 보조',Math.min(num(spec.boss),num(spec.frenzy)),1,95,true);}
  if(mode==='magic'){if(profile.key==='singleEnd')add('singleEndStable','한 기 누락 후 단일·끝딜 하한',num(spec.singleEndStable),3,34,false,{recommended:true,maximum:num(spec.singleEndMax)});add('magicSupport','마딜 증폭·마방깎',num(spec.magicDef)+num(spec.magicAmp)+num(spec.explosionAmp),1,32,false,{recommended:true});}
  for(const need of strategy.needs||[]){const current=num(spec[need.key]),existing=req.find(x=>x.key===need.key);
    // v17.6: 기본 경로 행이 이미 있으면 건너뛰지 말고 더 높은 목표로
    // 승격한다 — 상위 전략 요구가 기본 하드 컷보다 셀 수 있다.
    if(existing){if(num(need.target)>num(existing.target)){existing.target=round2(need.target);existing.gap=round2(Math.max(0,num(existing.target)-num(existing.current)));existing.label=need.label;existing.status=existing.current>=existing.target?'ok':existing.current>=existing.target*.7?'warn':'bad';existing.mechanic=true;existing.reason=need.reason;}continue;}
    add(need.key,need.label,current,need.target,60,true,{mechanic:true,reason:need.reason});}
  // v16.3: some uppers legitimately play without a role the generic route
  // demands (e.g. Alvida's stunless knockback line).  A waived row stays
  // visible but no longer gates, scores, or attracts recovery targets.
  const waivedKeys=new Set(strategy.waives||[]);
  if(waivedKeys.size)for(const row of req)if(waivedKeys.has(row.key)){row.required=false;row.recommended=false;row.waived=true;if(row.gap>0)row.status='waived';row.label=`${row.label} · 면제(스펙 대체)`;}
  const clearRows=req.filter(x=>x.required&&x.gap>0).sort((a,b)=>b.weight-a.weight),buildRows=req.filter(x=>(x.required||x.recommended)&&x.gap>0).sort((a,b)=>b.weight-a.weight),required=req.filter(x=>x.required),denominator=required.reduce((s,x)=>s+x.weight,0)||1,readiness=Math.round(required.reduce((s,x)=>s+x.weight*clamp(x.current/Math.max(.01,x.target),0,1),0)/denominator*100);
  return{rows:buildRows,buildRows,clearRows,requirements:req,control:ctl,readiness,strategy,profile,route:profile.key};
}
function roleContribution(u,mode){
  const r=roleProfile(u),magic=mode==='magic',finish=magicFinishProfile(u);return{main:isUpper(u)&&(r.family===mode||r.family==='neutral')?1:0,stun:r.stun,stunBase:Math.min(.5,r.stun),stunFull:r.stun,slow:r.slow+r.triggerSlow,armor:r.armor,triggerArmor:r.triggerArmor,boss:r.boss?1:0,frenzy:r.frenzy?1:0,bossFrenzy:r.boss&&r.frenzy?1:0,toki:magic&&/^토키(?:\s|\()/.test(nameOf(u))?1:0,single:magic?r.single:0,end:magic?r.end:0,singleEnd:magic?r.single+r.end:0,singleEndUnits:magic&&finish.directCredit>0?1:0,singleEndExpected:magic?finish.directCredit:0,singleEndMax:magic?finish.maxCredit:0,magicSupport:r.magicDef+r.magicAmp+r.explosionAmp,armorBreak:r.armorBreak?1:0,attack:r.attack-r.attackPenalty+r.triggerAttack*.65,speed:r.speed,regen:r.regen,mana:r.mana,deletion:r.deletion?1:0,utility:r.utility?1:0,subdamage:r.supportDamage?1:0};
}
function coverageScore(contrib,def){let score=0;const covers=[];for(const d of def.rows){const v=num(contrib[d.key]);if(v>0){score+=d.weight*Math.min(1,v/Math.max(.01,d.gap));covers.push(d.label);}}return{score:round2(score),covers};}
function netCoverageScore(beforeDef,afterDef){
  const afterByKey=new Map((afterDef&&afterDef.requirements||[]).map(x=>[x.key,x])),covers=[],byKey={},rank={danger:0,edge:1,safe:2},beforeCtl=beforeDef&&beforeDef.control||{},afterCtl=afterDef&&afterDef.control||{};let score=0;
  for(const before of beforeDef&&beforeDef.requirements||[]){if(!before.required&&!before.recommended)continue;const after=afterByKey.get(before.key)||before,improvement=num(before.gap)-num(after.gap),weight=before.required?before.weight:before.weight*.65;let value=0;if(improvement>0){value=weight*Math.min(1,improvement/Math.max(.01,num(before.gap)));covers.push(before.label);}else if(improvement<0){const base=before.key==='control'?Math.max(.01,num(before.target)):num(before.gap)>0?num(before.gap):Math.max(.01,num(before.target));value=-weight*Math.min(1,-improvement/base);}else if(before.key==='control'&&num(rank[afterCtl.status])<num(rank[beforeCtl.status]))value=-weight*.5*(num(rank[beforeCtl.status])-num(rank[afterCtl.status]));byKey[before.key]=round2(value);score+=value;}
  return{score:round2(score),covers,byKey};
}

function requirementImpact(beforeDef,afterDef){
  const afterByKey=new Map((afterDef&&afterDef.requirements||[]).map(x=>[x.key,x])),beforeCtl=beforeDef&&beforeDef.control||{},afterCtl=afterDef&&afterDef.control||{},rank={danger:0,edge:1,safe:2},controlRegressed=num(rank[afterCtl.status])<num(rank[beforeCtl.status]),rows=[];for(const before of beforeDef&&beforeDef.requirements||[]){const after=afterByKey.get(before.key)||before,delta=round2(num(after.current)-num(before.current)),gapBefore=num(before.gap),gapAfter=num(after.gap),statusRegression=before.key==='control'&&controlRegressed;rows.push({key:before.key,label:statusRegression?'제어 안정도':before.label,before:num(before.current),after:num(after.current),target:num(before.target),delta,gapBefore,gapAfter,closed:gapBefore>0&&gapAfter<=0,regressed:gapAfter>gapBefore+.005||statusRegression,statusRegression,required:!!before.required,recommended:!!before.recommended,mechanic:!!before.mechanic});}
  const improved=rows.filter(x=>x.gapAfter+1e-9<x.gapBefore),regressed=rows.filter(x=>x.regressed),closedClear=rows.filter(x=>x.closed&&x.required),closedRecommended=rows.filter(x=>x.closed&&x.recommended);return{rows,improved,regressed,closedClear,closedRecommended,readinessGain:round2(num(afterDef&&afterDef.readiness)-num(beforeDef&&beforeDef.readiness)),control:{beforeStatus:beforeCtl.status||'danger',afterStatus:afterCtl.status||'danger',improved:num(rank[afterCtl.status])-num(rank[beforeCtl.status])>0,regressed:controlRegressed,before:beforeCtl,after:afterCtl}};
}

function annotateCandidateValue(rows){
  const list=rows||[],rank={danger:0,edge:1,safe:2};for(const row of list){const impact=row.impact||{rows:[],improved:[],closedClear:[],closedRecommended:[],control:{},regressed:[]},gateKeys=impact.closedClear.map(x=>x.key),keys=gateKeys.length?gateKeys:impact.control.improved?['control']:impact.improved.map(x=>x.key),oursByKey=new Map((impact.rows||[]).map(x=>[x.key,x])),equivalent=other=>{const oi=other.impact||{},otherByKey=new Map((oi.rows||[]).map(x=>[x.key,x]));if((oi.regressed||[]).some(x=>x.required)&&!(impact.regressed||[]).some(x=>x.required))return false;return keys.length>0&&keys.every(key=>{const ours=oursByKey.get(key),alt=otherByKey.get(key);if(!ours||!alt)return false;if(ours.closed)return!!alt.closed;if(key==='control'&&impact.control.improved)return num(rank[oi.control&&oi.control.afterStatus])>=num(rank[impact.control.afterStatus]);const oursGain=num(ours.gapBefore)-num(ours.gapAfter),altGain=num(alt.gapBefore)-num(alt.gapAfter);return altGain+1e-9>=oursGain*.8;});},cheaper=list.filter(x=>x!==row&&x.feasible&&x.solve.wispCost<row.solve.wispCost&&equivalent(x)).sort((a,b)=>a.solve.wispCost-b.solve.wispCost||b.coverage-a.coverage)[0]||null;row.cheaperAlternative=cheaper?{unit:cheaper.unit,wispCost:cheaper.solve.wispCost,covers:(cheaper.impact.improved||[]).filter(x=>keys.includes(x.key)).map(x=>x.label)}:null;
    const high=row.solve.wispCost>PREFERRED_WISP_COST,gate=impact.closedClear.length>0,controlGate=!!impact.control.improved,essential=gate||controlGate,mechanic=impact.closedRecommended.some(x=>x.mechanic)||!!row.pairSynergy,noCheaper=!row.cheaperAlternative,signals=[essential,mechanic].filter(Boolean).length,controlBlocked=!!row.controlWaste,criticalRegression=impact.regressed.some(x=>x.required),approved=!controlBlocked&&!criticalRegression&&(!high||essential&&noCheaper);row.valueStatus=approved?(high?'worth':'efficient'):'hold';
    const gains=(impact.closedClear.length?impact.closedClear:impact.improved).slice(0,3).map(x=>x.closed?`${x.label} 충족`:`${x.label} ${round2(x.before)}→${round2(x.after)}`);if(row.pairSynergy)gains.push(row.pairSynergy.label);if(!gains.length&&row.rareSpend&&row.rareSpend.total)gains.push(`희귀 ${row.rareSpend.total}장 소진`);if(!gains.length)gains.push('현재 패 재료 효율');
    let headline;if(controlBlocked)headline=`보류: 이감이 위험권인 상태에서 순수 스턴을 더 짜도 클리어선이 되지 않습니다. 풀이감을 먼저 맞추세요.`;else if(criticalRegression)headline=`보류: 재료를 소모하면 ${impact.regressed.filter(x=>x.required).map(x=>`${x.label} ${round2(x.before)}→${round2(x.after)}`).join(' · ')}로 필수 클리어 스펙이 후퇴합니다.`;else if(high&&approved)headline=`선위 ${row.solve.wispCost} 투자 가치: ${gains.join(' · ')} · 필수 게이트 해결 · 더 싼 동등 대안 없음`;else if(high)headline=`보류: 선위 ${row.solve.wispCost} 대비 ${!essential?'필수 클리어 게이트를 닫지 못합니다':'동등한 저비용 대안이 있습니다'}${row.cheaperAlternative?` · ${nameOf(row.cheaperAlternative.unit)}(${row.cheaperAlternative.wispCost})`:''}`;else headline=`지금 만드는 이유: ${gains.join(' · ')}`;row.why={headline,gains,highCost:high,approved,signals,controlBlocked,criticalRegression,tradeoffs:impact.regressed.map(x=>`${x.label} ${round2(x.before)}→${round2(x.after)}`),alternative:row.cheaperAlternative};
  }return list;
}

// 변신/특강으로 ID가 바뀌는 상위는 한 경로로 보이고, 현재 패에서 가장 실행 가능한 형태만 남깁니다.
function dedupeCandidateRows(rows){
  const out=[],upperByFamily=new Map();for(const row of rows||[]){if(!row||!row.unit||!isUpper(row.unit)){out.push(row);continue;}const key=canonicalUpperId(row.unit.id),previous=upperByFamily.get(key);if(!previous||compareRows(row,previous)<0)upperByFamily.set(key,row);}return out.concat([...upperByFamily.values()]);
}

function upperMemoFor(u,memo){if(!u||!memo||!memo.byUnitId)return null;let ix=memo.byUnitId[u.id];if(typeof ix!=='number')ix=memo.byUnitId[canonicalUpperId(u.id)];return typeof ix==='number'?memo.entries[ix]:null;}
function synergyRankFor(upper,u,synergyMemo){const e=upperMemoFor(upper,synergyMemo);if(!e)return 999;for(const s of e.supports||[]){if((s.unitIds||[]).includes(u.id))return num(s.rank)||999;}return 999;}
function mainUpper(state,locks,settings){
  const selected=(locks||[]).find(x=>x.stage==='upper');if(selected&&state.db.byId.has(selected.id))return state.db.byId.get(selected.id);const preview=settings&&settings.upperPreviewId;if(preview&&state.db.byId.has(preview))return activeUpperVariant(state,state.db.byId.get(preview));
  const owned=state.db.uppers.filter(u=>num(state.counts[u.id])>0).sort((a,b)=>upperVariantPriority(b.id)-upperVariantPriority(a.id)||completionPercent(state,b)-completionPercent(state,a)),seen=new Set();for(const u of owned){const key=canonicalUpperId(u.id);if(seen.has(key))continue;seen.add(key);return u;}return null;
}
function inferMode(state,locks,settings){
  if(settings&&(settings.mode==='physical'||settings.mode==='magic'))return settings.mode;const upper=mainUpper(state,locks,settings);if(upper){const f=familyOf(upper);if(f!=='neutral')return f;}const legend=(locks||[]).find(x=>x.stage==='legend');if(legend){const u=state.db.byId.get(legend.id),f=familyOf(u);if(f!=='neutral')return f;}const owned=ownedUnits(state,u=>isLegendish(u)||isUpper(u));let p=0,m=0;for(const u of owned){const f=familyOf(u);if(f==='physical')p++;if(f==='magic')m++;}return m>p?'magic':'physical';
}
function hardBlocked(state,u,solve,settings,round,ruleCounts){
  const counts=ruleCounts||state.counts;if(!u)return['유닛 없음'];const reasons=[],sameFamilyOwned=state.db.uppers.some(x=>canonicalUpperId(x.id)===canonicalUpperId(u.id)&&num(counts[x.id])>0);if(sameFamilyOwned)reasons.push('이미 보유');if(isChanged(u)&&round<50)reasons.push('변화됨은 50라부터');if(isTranscend(u)&&settings&&settings.superKumaOwned===false)reasons.push('이번 판 초월 사용 불가');
  const inventorySeraph=state.db.units.some(x=>isSeraph(x)&&num(counts[x.id])>0),inventoryTrans=state.db.units.some(x=>isTranscend(x)&&num(counts[x.id])>0),inventoryChanged=state.db.units.reduce((n,x)=>n+(isChanged(x)?num(counts[x.id]):0),0),ownedSeraph=inventorySeraph||num(settings&&settings.seraphUsed)>0,ownedTrans=inventoryTrans||num(settings&&settings.transcendUsed)>0,ownedChanged=Math.max(inventoryChanged,num(settings&&settings.changedUsed)),upperFamilies=new Set(state.db.uppers.filter(x=>num(counts[x.id])>0).map(x=>canonicalUpperId(x.id))),upperCount=upperFamilies.size;
  if(isSeraph(u)&&(ownedSeraph||settings&&settings._plannedSeraph))reasons.push('세라핌은 게임당 1회');if(isTranscend(u)&&(ownedTrans||settings&&settings._plannedTranscend))reasons.push('초월은 게임당 1회');if(isChanged(u)&&ownedChanged+(ruleCounts?0:num(settings&&settings._plannedChanged))>=2)reasons.push('변화됨은 게임당 2회');if(isUpper(u)&&upperCount>=2)reasons.push('상위 2개 보유로 추가 상위 제외');
  const prerequisite=specialPrerequisiteStatus(state.db,u,counts);for(const x of prerequisite.missing)reasons.push(`${x.name} 필요`);
  for(const x of solve.hardMissing)if(!specialPrerequisiteMeta(state.db,x.id))reasons.push(`${x.name} 필요`);for(const [mid] of Object.entries(solve.missingByTier.other||{}))if(!specialPrerequisiteMeta(state.db,mid))reasons.push(`${materialName(state.db,mid)} 필요`);if(solve.wispCost>MAX_WISP_COST)reasons.push(`선위 ${MAX_WISP_COST+1}개 이상 후보 제외`);return [...new Set(reasons)];
}
function rareUseCount(solve){return Object.values(solve.rareUse||{}).reduce((a,b)=>a+num(b),0);}
function rareTargetsForRound(round){
  round=Math.max(1,num(round)||1);if(round<=7)return{total:8,types:6};if(round<=20)return{total:7,types:5};if(round<=30)return{total:6,types:4};if(round<=34)return{total:5,types:4};if(round<=39)return{total:3,types:3};if(round<=44)return{total:1,types:1};return{total:0,types:0};
}
function rareInventoryFor(state,spendableCounts,protectedById){
  const stock=spendableCounts||state.counts,provided=protectedById||{},byId=[],protectedMap={};let total=0,types=0,duplicates=0,protectedCount=0,protectedTypes=0,expendable=0,expendableTypes=0;
  for(const u of state.db.rares){const free=Math.max(0,num(stock[u.id])),locked=Math.max(0,num(provided[u.id])),have=free+locked;if(have<=0)continue;total+=have;types++;duplicates+=Math.max(0,have-1);protectedCount+=locked;expendable+=free;if(locked>0){protectedTypes++;protectedMap[u.id]=locked;}if(free>0)expendableTypes++;byId.push({id:u.id,name:nameOf(u),have,protected:locked,expendable:free,duplicates:Math.max(0,have-1)});}
  byId.sort((a,b)=>b.expendable-a.expendable||b.have-a.have||a.name.localeCompare(b.name,'ko'));return{total,types,duplicates,protected:protectedCount,protectedTypes,expendable,expendableTypes,byId,protectedById:protectedMap};
}
function protectedRareMap(state,reservedStock){
  const out={};for(const u of state.db.rares){const used=Math.max(0,num(state.counts[u.id])-num(reservedStock&&reservedStock[u.id]));if(used>0)out[u.id]=used;}return out;
}
function rarePressureForInventory(inventory,round){
  const inv=inventory||{total:0,types:0,duplicates:0,protected:0,protectedTypes:0,expendable:0},baseTarget=rareTargetsForRound(round),targetTotal=Math.max(baseTarget.total,num(inv.protected)),targetTypes=Math.max(baseTarget.types,num(inv.protectedTypes)),excessTotal=Math.max(0,num(inv.total)-targetTotal),excessTypes=Math.max(0,num(inv.types)-targetTypes),spendableExcess=Math.min(num(inv.expendable),Math.max(excessTotal,excessTypes)),score=excessTotal||excessTypes?clamp(Math.round(excessTotal*14+excessTypes*9+Math.max(0,num(inv.duplicates)-1)*3),0,100):0;
  const status=score>=75?'critical':score>=45?'high':score>0?'watch':'safe',label=status==='critical'?'패 압박 매우 높음':status==='high'?'패 압박 높음':status==='watch'?'희귀 정리 권장':'희귀 여유',shouldSpend=spendableExcess>0;
  return{score,status,label,note:`총 ${num(inv.total)}장 · 보호 ${num(inv.protected)}장 · 소진 가능 ${num(inv.expendable)}장 · 목표 ${targetTotal}장`,targetTotal,targetTypes,baseTargetTotal:baseTarget.total,baseTargetTypes:baseTarget.types,total:num(inv.total),types:num(inv.types),protected:num(inv.protected),expendable:num(inv.expendable),excessTotal,excessTypes,spendableExcess,shouldSpend};
}
function rareSpendForSolve(state,solve,stock){
  const rows=[];let total=0,duplicates=0,clears=0,weighted=0;for(const [id,value] of Object.entries(solve&&solve.rareUse||{})){const have=Math.max(0,num(stock&&stock[id])),use=Math.min(have,Math.max(0,num(value)));if(use<=0)continue;const duplicateUse=Math.min(use,Math.max(0,have-1)),clear=have-use<=0?1:0;total+=use;duplicates+=duplicateUse;clears+=clear;weighted+=use+duplicateUse*.45+clear*.35;rows.push({id,name:materialName(state.db,id),have,use,after:Math.max(0,have-use),duplicates:duplicateUse,clears:clear});}
  rows.sort((a,b)=>b.use-a.use||a.name.localeCompare(b.name,'ko'));return{total,types:rows.length,duplicates,clears,weighted:round2(weighted),byId:rows};
}
function aggregateRareSpend(state,actions,inventory,pressure,selectionMode){
  const chosen=selectionMode==='queue'?(actions||[]):(actions||[]).slice(0,1),byMap={};let plannedSpend=0,duplicates=0,clears=0;for(const row of chosen){const spend=row.rareSpend||{total:0,byId:[]};plannedSpend+=num(spend.total);duplicates+=num(spend.duplicates);clears+=num(spend.clears);for(const x of spend.byId||[]){if(!byMap[x.id])byMap[x.id]={id:x.id,name:x.name,use:0};byMap[x.id].use+=num(x.use);}}
  const first=actions&&actions[0]&&actions[0].rareSpend||{total:0},next=num(first.total),afterNext=Math.max(num(inventory.protected),num(inventory.total)-next),after=Math.max(num(inventory.protected),num(inventory.total)-plannedSpend),byId=Object.values(byMap).map(x=>{const inv=(inventory.byId||[]).find(y=>y.id===x.id)||{};return Object.assign(x,{have:num(inv.have),protected:num(inv.protected),after:Math.max(num(inv.protected),num(inv.have)-x.use)});}).sort((a,b)=>b.use-a.use||a.name.localeCompare(b.name,'ko'));
  return{next,plannedSpend,afterNext,after,protected:num(inventory.protected),target:num(pressure.targetTotal),types:byId.length,duplicates,clears,byId};
}
function tierPriority(u){if(/전설|히든/.test(groupName(u)))return 5;if(isWarped(u))return 5;if(isSeraph(u))return 4;if(isShip(u))return 3;if(isChanged(u))return 2;return 1;}
function rowScore(row,purpose){
  const cost=row.solve.wispCost,preferred=cost<=PREFERRED_WISP_COST?14:0,over=Math.max(0,cost-PREFERRED_WISP_COST)*8,synergy=row.synergy<=10?Math.max(1,7-row.synergy*.6):0,pair=row.pairSynergy?12:0,waste=row.controlWaste?90:0;
  const severity=num(row.rarePressure&&row.rarePressure.score)/100,phaseWeight=purpose==='spec'?(num(row.round)>=51?34:num(row.round)>=40?28:22):purpose==='upper'?24:purpose==='story'?18:0,pressureBonus=num(row.rareSpend&&row.rareSpend.weighted)*severity*phaseWeight;
  if(purpose==='rare')return row.story.score+row.progress*.2+row.rareUse*7-cost*6+preferred;
  if(purpose==='story')return row.story.score*1.5+row.coverage*.15+row.rareUse*8+row.progress*.08-cost*5+preferred-over*.4+pressureBonus;
  if(purpose==='upper')return row.progress*2.4+row.rareUse*14-cost*4+preferred-over*.5+pressureBonus;
  return row.coverage*1.35+synergy+pair+tierPriority(row.unit)*8+row.rareUse*6-cost*3+preferred-over+pressureBonus-waste;
}
function candidateRow(state,u,ctx){
  const stock=ctx.stock||state.counts,availableWisp=ctx.availableWisp!=null?num(ctx.availableWisp):state.wisp,solve=recipeSolve(state.db,u.id,stock),currentSolve=recipeSolve(state.db,u.id,state.counts),round=ctx.round||1,blocked=hardBlocked(state,u,solve,ctx.settings||{},round,ctx.ruleCounts||stock),feasible=blocked.length===0&&solve.wispCost<=availableWisp,progress=completionPercent(state,u),role=roleProfile(u),contrib=roleContribution(u,ctx.mode);let cover=coverageScore(contrib,ctx.deficits),projectedSpec=ctx.spec||null,projectedDeficits=ctx.deficits||null,impact={rows:[],improved:[],regressed:[],closedClear:[],closedRecommended:[],control:{}};
  if(ctx.spec){const after=cloneCounts(solve.stockAfter);after[WISP_ID]=Math.max(0,availableWisp-solve.wispCost);after[u.id]=num(after[u.id])+1;projectedSpec=transitionSpec(ctx.spec,state,stock,after,ctx.mode,'');const projectionSettings=Object.assign({},ctx.settings||{},ctx.upper?{_upperUnit:ctx.upper}:isUpper(u)?{_upperUnit:u}:{});projectedDeficits=deficits(projectedSpec,ctx.mode,projectionSettings);cover=netCoverageScore(ctx.deficits,projectedDeficits);impact=requirementImpact(ctx.deficits,projectedDeficits);}
  const beforeCtl=ctx.deficits&&ctx.deficits.control||{},afterCtl=projectedDeficits&&projectedDeficits.control||{},nonControlGain=impact.improved.some(x=>x.key!=='control'),pureStun=role.stun>0&&role.slow+role.triggerSlow<=0,controlWaste=pureStun&&!nonControlGain&&(num(beforeCtl.stun)>=num(beforeCtl.operationalStun)||num(beforeCtl.stun)>=CONTROL_ENVELOPE.efficientStunCap||num(beforeCtl.slowGap)>0&&afterCtl.status==='danger');if(controlWaste&&cover.byKey&&num(cover.byKey.control)>0){cover.score=round2(cover.score-num(cover.byKey.control)*.85);}
  const story=storyGrade(u),rareUse=rareUseCount(solve),rareSpend=rareSpendForSolve(state,solve,stock),rareInventory=ctx.rareInventory||rareInventoryFor(state,stock,ctx.rareProtected),rarePressure=ctx.rarePressure||rarePressureForInventory(rareInventory,round),synergy=ctx.upper?synergyRankFor(ctx.upper,u,ctx.synergyMemo):999,pairSynergy=ctx.upper?(isUpper(u)?upperPairSynergy(ctx.upper,u):null)||descriptionPartnerSynergy(ctx.upper,u):null,wispGap=Math.max(0,solve.wispCost-availableWisp);
  const row={unit:u,solve,currentSolve,wispBreakdown:{current:currentSolve.wispCost,planned:solve.wispCost,available:availableWisp,gap:wispGap,basis:ctx.costBasis||'protected'},blocked,feasible,progress,role,contrib,coverage:cover.score,covers:cover.covers,coverageByKey:cover.byKey||{},projectedSpec,projectedDeficits,impact,controlWaste,pairSynergy,story,rareUse,rareSpend,rareAfter:Math.max(num(rareInventory.protected),num(rareInventory.total)-rareSpend.total),rarePressure,round,synergy,wispGap,commonTop:commonTop(state.db,solve.lowestMissing),family:role.family,availableWisp,tierPriority:tierPriority(u)};row.score=round2(rowScore(row,ctx.purpose));return row;
}
function compareRows(a,b){if(a.feasible!==b.feasible)return b.feasible-a.feasible;if(a.score!==b.score)return b.score-a.score;if(a.solve.wispCost!==b.solve.wispCost)return a.solve.wispCost-b.solve.wispCost;if(a.progress!==b.progress)return b.progress-a.progress;if(a.synergy!==b.synergy)return a.synergy-b.synergy;return nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');}
function compareCompletionRows(a,b){
  if(a.progress!==b.progress)return b.progress-a.progress;
  if(a.solve.wispCost!==b.solve.wispCost)return a.solve.wispCost-b.solve.wispCost;
  const byName=nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');if(byName)return byName;
  const aid=String(a.unit&&a.unit.id||''),bid=String(b.unit&&b.unit.id||'');return aid===bid?0:aid<bid?-1:1;
}
function candidatePool(state,purpose,mode,settings,round){
  const openBoth=!!(settings&&settings._openBoth);if(purpose==='choice')return[];if(purpose==='rare')return state.db.rares;
  if(purpose==='upper')return state.db.uppers.filter(u=>openBoth||familyOf(u)===mode||familyOf(u)==='neutral');
  if(purpose==='story')return state.db.legendish.filter(u=>/^전설|^히든/.test(groupName(u)));
  return state.db.legendish.concat(state.db.uppers).filter(u=>!isMystic(u)&&!isRandom(u)&&!isItem(u)).filter(u=>{const f=familyOf(u);return f===mode||f==='neutral';});
}
function watchBlockIsTerminal(reason){return /이미 보유|베이비\s*5 제외|게임당 [12]회|상위 2개 보유/.test(reason||'');}
function watchKindFor(row,purpose){
  const blocked=row.blocked||[];if(blocked.some(x=>/초월 사용 불가|50라부터|목재 사용 미확인/.test(x)))return'unlock';if(blocked.some(x=>/필요$/.test(x)))return'material';if(row.valueStatus==='hold')return'value';if(row.wispGap>0)return'wisp';if(purpose==='upper'&&row.progress<80)return'progress';return'alternative';
}
function watchReasonFor(row,purpose){
  const blocked=row.blocked||[],gate=blocked.find(x=>/초월 사용 불가|50라부터|목재 사용 미확인/.test(x)),material=blocked.find(x=>/필요$/.test(x));if(gate)return gate;if(material)return material;if(row.valueStatus==='hold'&&row.why)return row.why.headline;if(row.wispGap>0)return`선위 ${row.wispGap}개 더 필요`;if(purpose==='upper'&&row.progress<80)return`완성도 ${row.progress}% · 80%까지 ${Math.max(0,80-row.progress)}%`;if(blocked.length)return blocked[0];return'즉시 후보 다음 순위';
}
function compareWatchRows(a,b,purpose){
  if(purpose==='upper'&&a.progress!==b.progress)return b.progress-a.progress;const at=a.blocked.some(watchBlockIsTerminal),bt=b.blocked.some(watchBlockIsTerminal);if(at!==bt)return at-bt;if(a.feasible!==b.feasible)return b.feasible-a.feasible;if(a.wispGap!==b.wispGap)return a.wispGap-b.wispGap;if(a.progress!==b.progress)return b.progress-a.progress;if(a.score!==b.score)return b.score-a.score;return nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');
}
function watchCandidates(state,rows,actions,purpose,def){
  if(purpose==='spec'&&!(def&&def.rows&&def.rows.length))return[];const actionIds=new Set((actions||[]).map(x=>x.unit.id)),eligible=(rows||[]).filter(row=>!actionIds.has(row.unit.id)&&!num(state.counts[row.unit.id])).filter(row=>!(row.blocked||[]).some(watchBlockIsTerminal)).filter(row=>{
    if(purpose==='upper')return row.progress>=60;if(purpose==='spec')return row.coverage>0||num(row.rareSpend&&row.rareSpend.total)>0;return row.feasible||row.wispGap<=15||row.progress>=25||row.rareUse>0||(row.blocked||[]).some(x=>/50라부터|목재 사용 미확인|필요$/.test(x));
  }).sort((a,b)=>compareWatchRows(a,b,purpose)).slice(0,WATCH_CANDIDATE_CAP);return eligible.map(row=>Object.assign({},row,{watchKind:watchKindFor(row,purpose),watchReason:watchReasonFor(row,purpose)}));
}
function selectCompatibleQueue(state,pool,ctx,limit){
  const selected=[],candidates=pool.slice();let stock=cloneCounts(ctx.stock||state.counts),availableWisp=num(ctx.availableWisp),plannedSeraph=false,plannedTranscend=false,plannedChanged=0,runningSpec=Object.assign({},ctx.spec),runningDeficits=ctx.deficits;
  while(selected.length<limit&&candidates.length){const rareInventory=rareInventoryFor(state,stock,ctx.rareProtected),rarePressure=rarePressureForInventory(rareInventory,ctx.round),needsRoles=!!runningDeficits.rows.length,needsRareSpend=rarePressure.shouldSpend;if(!needsRoles&&!needsRareSpend)break;const settings=Object.assign({},ctx.settings,{_plannedSeraph:plannedSeraph,_plannedTranscend:plannedTranscend,_plannedChanged:plannedChanged}),allRows=annotateCandidateValue(dedupeCandidateRows(candidates.map(u=>candidateRow(state,u,Object.assign({},ctx,{spec:runningSpec,stock,ruleCounts:stock,availableWisp,settings,deficits:runningDeficits,purpose:'spec',rareInventory,rarePressure}))).filter(x=>x.feasible))),approved=allRows.filter(x=>x.valueStatus!=='hold'),roleRows=needsRoles?approved.filter(x=>x.coverage>0):[],spendRows=needsRareSpend?approved.filter(x=>x.coverage>=0&&x.rareSpend.total>0):[],rows=(roleRows.length?roleRows:spendRows).sort(compareRows);if(!rows.length)break;const best=rows[0],built=applyBuildStep(state,runningSpec,stock,best.unit,ctx.mode,availableWisp);selected.push(best);stock=built.stock;availableWisp=built.remainingWisp;runningSpec=built.spec;runningDeficits=deficits(runningSpec,ctx.mode,settings);if(isSeraph(best.unit))plannedSeraph=true;if(isTranscend(best.unit))plannedTranscend=true;if(isChanged(best.unit))plannedChanged++;}
  return{rows:selected,stockAfter:stock,remainingWisp:availableWisp,specAfter:runningSpec,deficitsAfter:runningDeficits};
}
function recommendationPlan(state,locks,settings,upperMemo,synergyMemo){
  settings=settings||{};const flow=gameFlow(state,locks,settings),completionForced=['rare','story'].includes(flow.purpose),upper=mainUpper(state,locks,settings),mode=inferMode(state,locks,settings),round=num(settings.currentRound)||1,lockedUpper=(locks||[]).find(x=>x.stage==='upper'&&state.db.byId.has(x.id)),projectedUpper=lockedUpper?state.db.byId.get(lockedUpper.id):null,purpose=flow.purpose==='choice'?'choice':completionForced?flow.purpose:settings.purpose||flow.purpose,legendLock=(locks||[]).find(x=>x.stage==='legend'&&state.db.byId.has(x.id)),neutralLegend=legendLock&&familyOf(state.db.byId.get(legendLock.id))==='neutral',ownedFamilies=new Set(ownedRoleUnits(state).filter(u=>isLegendish(u)||isUpper(u)).map(familyOf).filter(x=>x!=='neutral')),openBoth=completionForced&&purpose==='story'||!upper&&!settings.mode&&(!!neutralLegend||(!legendLock&&ownedFamilies.size!==1&&['story','upper'].includes(purpose))),localSettings=Object.assign({},settings,{_openBoth:openBoth,_upperUnit:upper||projectedUpper||null});
  const reserveIds=(locks||[]).filter(x=>['rare','legend','upper'].includes(x.stage)).map(x=>x.id),reserved=reserveTargets(state.db,state.counts,reserveIds),rareProtected=protectedRareMap(state,reserved.stock),rareInventory=rareInventoryFor(state,reserved.stock,rareProtected),rarePressure=rarePressureForInventory(rareInventory,round),projectedStock=cloneCounts(reserved.stock);if(projectedUpper&&num(state.counts[projectedUpper.id])<=0)projectedStock[projectedUpper.id]=num(projectedStock[projectedUpper.id])+1;const spec=currentSpec(state,mode,localSettings,projectedUpper);let def=deficits(spec,mode,localSettings);if(mode==='magic'&&normalizeMagicRoute(settings.magicRoute)==='auto'){localSettings._resolvedMagicRoute=def.route;def=deficits(spec,mode,localSettings);}const stock=purpose==='spec'?projectedStock:reserved.stock,availableWisp=reserved.remainingWisp,ctx={mode,spec,deficits:def,settings:localSettings,round,purpose,upper,stock,ruleCounts:stock,availableWisp,synergyMemo,rareProtected,rareInventory,rarePressure,costBasis:reserveIds.length?'protected':'current'};
  const completionInventory=completionForced?rareInventoryFor(state,state.counts,{}):rareInventory,completionPressure=completionForced?rarePressureForInventory(completionInventory,round):rarePressure,completionCtx=completionForced?Object.assign({},ctx,{stock:state.counts,ruleCounts:state.counts,availableWisp:state.wisp,rareProtected:{},rareInventory:completionInventory,rarePressure:completionPressure,costBasis:'current'}):ctx,ruleStock=completionCtx.ruleCounts||completionCtx.stock||state.counts,pool=candidatePool(state,purpose,mode,localSettings,round).filter(u=>!num(state.counts[u.id])).filter(u=>specialPrerequisiteStatus(state.db,u,ruleStock).allowed),rowFor=u=>{const family=openBoth&&familyOf(u)!=='neutral'?familyOf(u):mode,rowCtx=completionCtx;if(family===mode)return candidateRow(state,u,rowCtx);const alternateSettings=Object.assign({},localSettings,{_upperUnit:isUpper(u)?u:null}),alternateSpec=currentSpec(state,family,alternateSettings,projectedUpper),alternateDef=deficits(alternateSpec,family,alternateSettings);return candidateRow(state,u,Object.assign({},rowCtx,{mode:family,spec:alternateSpec,deficits:alternateDef,settings:alternateSettings}));};let rows=annotateCandidateValue(dedupeCandidateRows(pool.map(rowFor))).sort(completionForced?compareCompletionRows:compareRows),actions=[],queueResult=null,actionCap=purpose==='choice'?0:purpose==='spec'?5:3,selectionMode=purpose==='choice'?'decision':purpose==='spec'?'queue':'alternatives';
  if(completionForced){
    rows.forEach((row,index)=>{row.completionRank=index+1;row.why=Object.assign({},row.why||{},{headline:`TMO 완성도 ${round2(row.progress)}% ${index+1}위 · 전략 점수와 예약보다 완성도를 먼저 적용`});});
    actions=rows.slice(0,actionCap);
  }
  else if(purpose==='spec'){queueResult=selectCompatibleQueue(state,pool,ctx,actionCap);actions=queueResult.rows;}
  else if(purpose==='upper')actions=rows.filter(x=>x.feasible&&x.progress>=80&&x.valueStatus!=='hold').slice(0,actionCap);
  else actions=rows.filter(x=>x.feasible&&x.valueStatus!=='hold').slice(0,actionCap);
  const prep=[];
  let watchRows=rows,watchDef=def;if(selectionMode==='queue'&&queueResult){const queuedRareInventory=rareInventoryFor(state,queueResult.stockAfter,rareProtected),queuedRarePressure=rarePressureForInventory(queuedRareInventory,round),queuedCtx=Object.assign({},ctx,{stock:queueResult.stockAfter,ruleCounts:queueResult.stockAfter,availableWisp:queueResult.remainingWisp,spec:queueResult.specAfter,deficits:queueResult.deficitsAfter,rareInventory:queuedRareInventory,rarePressure:queuedRarePressure,costBasis:'sequential'}),actionIds=new Set(actions.map(row=>row.unit.id));watchRows=annotateCandidateValue(dedupeCandidateRows(pool.filter(u=>!actionIds.has(u.id)).map(u=>candidateRow(state,u,queuedCtx)))).sort(compareRows);watchDef=queueResult.deficitsAfter;}
  let watch=watchCandidates(state,watchRows,actions,purpose,watchDef),upperBuildRow=null;
  // A confirmed Upper is a route lock, not a promise that the entire final
  // party can already be funded.  Around round 30 the Upper itself is the
  // story-push checkpoint, so price it once against the real TMO hand and put
  // it ahead of every support.  The generic spec queue uses a projected Upper
  // stock and therefore must not be reused here (that would consume the same
  // reserved recipe twice and can make a buildable Upper look impossible).
  if(flow.phase==='upper-build'&&projectedUpper&&num(state.counts[projectedUpper.id])<=0){
    const upperSettings=Object.assign({},localSettings,{_upperUnit:projectedUpper}),actualSpec=currentSpec(state,mode,Object.assign({},upperSettings,{_upperUnit:null}),null),actualDef=deficits(actualSpec,mode,upperSettings),actualInventory=rareInventoryFor(state,state.counts,{}),actualPressure=rarePressureForInventory(actualInventory,round);
    upperBuildRow=candidateRow(state,projectedUpper,{mode,spec:actualSpec,deficits:actualDef,settings:upperSettings,round,purpose:'upper',upper:projectedUpper,stock:state.counts,ruleCounts:state.counts,availableWisp:state.wisp,synergyMemo,rareProtected:{},rareInventory:actualInventory,rarePressure:actualPressure,costBasis:'current'});
    const missingReason=upperBuildRow.blocked&&upperBuildRow.blocked[0]||upperBuildRow.wispGap>0&&`선위 ${upperBuildRow.wispGap}개 부족`||'표시된 재료 부족';upperBuildRow.why=Object.assign({},upperBuildRow.why||{},{headline:upperBuildRow.feasible?'30라 전 스토리 진행을 위해 확정 상위를 먼저 제작합니다. 최종 보조 조합은 제작 뒤 남은 패로 다시 계산합니다.':`상위 방향은 확정되었습니다. ${missingReason}을 채우면 보조 조합보다 먼저 제작합니다.`});
    upperBuildRow.watchKind=upperBuildRow.feasible?'upper-first':upperBuildRow.blocked&&upperBuildRow.blocked.length?'material':'wisp';upperBuildRow.watchReason=upperBuildRow.feasible?'30라 스토리 진행용 상위 최우선':upperBuildRow.why.headline;
    actions=upperBuildRow.feasible?[upperBuildRow]:[];watch=[upperBuildRow].concat(watch.filter(row=>canonicalUpperId(row.unit.id)!==canonicalUpperId(projectedUpper.id))).slice(0,WATCH_CANDIDATE_CAP);selectionMode='upper-first';actionCap=1;
  }
  const rareSpend=aggregateRareSpend(state,actions,completionInventory,completionPressure,selectionMode);
  return{mode,spec,deficits:def,purpose,flow,upper,actions,prep,watch,rows,reserved,rareInventory:completionInventory,rarePressure:completionPressure,rareSpend,round,settings:localSettings,availableWisp:completionForced?state.wisp:availableWisp,actionCap,watchCap:WATCH_CANDIDATE_CAP,selectionMode,projectedUpper,upperBuildRow,compareBoth:openBoth,completionForced};
}
function progressionCounts(state){
  const rare=state.db.rares.reduce((sum,u)=>sum+num(state.counts[u.id]),0),legend=state.db.legendish.reduce((sum,u)=>sum+num(state.counts[u.id]),0),legendHidden=state.db.legendish.filter(u=>/^전설|^히든/.test(groupName(u))).reduce((sum,u)=>sum+num(state.counts[u.id]),0),upperFamilies=new Set();for(const u of state.db.uppers)if(num(state.counts[u.id])>0)upperFamilies.add(canonicalUpperId(u.id));return{rare,legend,legendHidden,upper:upperFamilies.size,squad:legend+upperFamilies.size*3,board:legend+upperFamilies.size};
}
function normalizePostLegendRoute(value){
  value=String(value||'').trim().toLowerCase();
  if(['legend','additional-legend','additionallegend','more-legend','story'].includes(value))return POST_LEGEND_ROUTES.LEGEND;
  if(['upper','prepare-upper','prepareupper','upper-ready'].includes(value))return POST_LEGEND_ROUTES.UPPER;
  return POST_LEGEND_ROUTES.CHOICE;
}
function gameFlow(state,locks,settings){
  settings=settings||{};locks=locks||[];const round=Math.max(1,num(settings.currentRound)||1),counts=progressionCounts(state),validLock=stage=>locks.find(x=>x.stage===stage&&state.db.byId.has(x.id)),upperLock=validLock('upper'),upperPreview=settings.upperPreviewId&&state.db.byId.has(settings.upperPreviewId)?state.db.byId.get(settings.upperPreviewId):null,upperUnit=mainUpper(state,locks,settings),upperDecided=!!(upperLock||upperPreview||upperUnit),upperBuilt=counts.upper>0,legendSecured=counts.legendHidden>0||upperBuilt,rareSecured=counts.rare>0||counts.legend>0||upperBuilt,postLegendRoute=normalizePostLegendRoute(settings.postLegendRoute),postLegendDecisionRequired=legendSecured&&!upperDecided&&!postLegendRoute,target=clamp(Math.round(num(settings.targetSquadCount)||9),9,11),by50Target=Math.min(9,target),mode=inferMode(state,locks,settings),projectedUpper=upperLock&&!upperBuilt?state.db.byId.get(upperLock.id):null,squadReady=counts.squad>=target,localSettings=Object.assign({},settings,{_upperUnit:upperUnit||projectedUpper||null}),spec=upperDecided&&squadReady?finalGradeSpec(state,mode,localSettings,projectedUpper):null,def=spec?deficits(spec,mode,localSettings):null,clearReady=settings._clearReady!=null?!!settings._clearReady:!!(def&&!def.clearRows.length);
  let purpose='spec',phase='reinforce',label='전설급 보강',note='상위의 부족 스펙을 채우면서 최소 9기 조합을 완성합니다.',deadline=null;
  if(!rareSecured){purpose='rare';phase='first-rare';label='첫 희귀 제작';deadline=7;note='7라운드 안에 첫 희귀를 만들어 선택 위습 1개를 확보합니다.';}
  else if(!legendSecured){purpose='story';phase='first-legend';label='첫 전설·히든 제작';deadline=20;note='현재 희귀·특별·안흔·흔함 패에서 가장 가까운 전설 또는 히든을 20라 전에 만듭니다.';}
  else if(!upperDecided&&!postLegendRoute){purpose='choice';phase='post-legend-choice';label='첫 전설 이후 진행 선택';deadline=25;note='추가 전설·히든을 더 만들지, 현재 패로 상위를 준비할지 선택하세요.';}
  else if(!upperDecided&&postLegendRoute===POST_LEGEND_ROUTES.LEGEND){purpose='story';phase='additional-legend';label='추가 전설·히든 제작';note='현재 TMO 완성도 순서대로 전설·히든을 더 추천합니다. 상위를 준비할 때 진행 선택을 바꾸세요.';}
  else if(!upperDecided){purpose='upper';phase='upper-choice';label='상위·딜 계통 결정';deadline=25;note='현재 희귀 패를 최대한 소모하는 상위와 물딜·마딜 계통을 비교합니다.';}
  else if(!upperBuilt){phase='upper-build';label='상위 제작 + 라인 전설';deadline=30;note='확정 상위 재료를 보호하고 30라 전후에 상위와 라인 방어용 전설 1기를 마련합니다.';}
  else if(round<=50&&counts.squad<by50Target){phase='reinforce';label='50라 전 9환산 보강';deadline=50;note=`50라 전까지 상위 결손을 메우며 실제 전설 환산 ${by50Target}기를 보수적 구조 최소선으로 맞춥니다.`;}
  else if(round>50&&(!squadReady||!clearReady)){phase='final-patch';label='50라 이후 마지막 보강';note='전설·히든 1기, 해적선 1기, 희귀 2기 또는 변화됨 중 가장 싼 경로로 마지막 결손을 닫습니다.';}
  else if(squadReady&&clearReady){phase='upgrade-control';label='판매·업그레이드·컨트롤';note='최종 유닛을 제외한 재료를 정리하고 이감·공격력·체젠·마젠 업그레이드와 컨트롤에 집중합니다.';}
  const rewards=[],expectedRareIncome=0,milestones=[
    {key:'rare',round:7,done:rareSecured,label:'첫 희귀 + 선택 위습'},
    {key:'legend',round:20,done:legendSecured,label:'첫 전설·히든'},
    {key:'postLegendRoute',round:20,done:upperDecided||!!postLegendRoute,label:'첫 전설 이후 진행 선택'},
    {key:'upperChoice',round:25,done:upperDecided,label:'상위·딜 계통 결정'},
    {key:'lineHold',round:30,done:upperBuilt&&counts.legend>=1,label:'상위 + 라인 전설'},
    {key:'nine',round:50,done:counts.squad>=by50Target,label:`실제 전설 환산 ${by50Target}기`},
    {key:'final',round:65,done:squadReady&&clearReady,label:`최종 ${target}~11기 + 클리어 스펙`}
  ];
  return{round,purpose,phase,label,note,deadline,urgent:deadline!=null&&round>=deadline-2,overdue:deadline!=null&&round>deadline,counts,target,stretchTarget:11,by50Target,mode,rareSecured,legendSecured,postLegendRoute,postLegendDecisionRequired,upperDecided,upperBuilt,squadReady,clearReady,rewards,expectedRareIncome:round2(expectedRareIncome),milestones,deficits:def};
}
// 구버전 호출 호환용입니다. 실제 추천은 보유·락 상태를 보는 gameFlow를 사용합니다.
function milestonePurpose(round,hasUpper,hasLockedUpper){if(hasUpper||hasLockedUpper)return'spec';if(num(round)<=7)return'rare';if(num(round)<=20)return'story';return'upper';}
function phaseForRound(round){round=num(round)||1;if(round<=7)return{key:'rare',label:'첫 희귀 + 선택 위습',note:'7라운드 안에 첫 희귀를 완성합니다.'};if(round<=20)return{key:'story',label:'첫 전설·히든',note:'첫 전설 또는 히든을 늦어도 20라 전에 완성합니다.'};if(round<=25)return{key:'route',label:'상위·딜 계통 결정',note:'희귀 8장 전후의 전체 패로 상위와 물딜·마딜을 결정합니다.'};if(round<=30)return{key:'upper',label:'상위 + 라인 전설',note:'상위 하나와 희귀보다 강한 라인 방어 전설을 마련합니다.'};if(round<=50)return{key:'spec',label:'50라 전 9환산 보강',note:'상위 결손을 채우며 실제 전설 환산 9기를 보수적 구조 최소선으로 맞춥니다.'};return{key:'finish',label:'최종 9기+ 마감',note:'전설·히든, 해적선, 희귀 2기, 변화됨 중 최저비용 경로로 마지막 스펙을 채웁니다.'};}
function roundDuration(round,settings){return BOSS_ROUNDS.has(round)?num(settings.roundBossSeconds)||60:num(settings.roundNormalSeconds)||35;}
function roundClock(settings,now){
  const s=settings||{},started=num(s.roundStartedAt),prep=num(s.roundPrepSeconds)||10,round=Math.max(1,num(s.currentRound)||1);if(!started)return{running:false,round,label:`${round}라 · 수동`,remaining:0,prep:false};let elapsed=Math.max(0,Math.floor(((now||Date.now())-started)/1000));if(elapsed<prep)return{running:true,round:0,label:'준비',remaining:prep-elapsed,prep:true};elapsed-=prep;let r=1;while(elapsed>=roundDuration(r,s)&&r<80){elapsed-=roundDuration(r,s);r++;}return{running:true,round:r,label:`${r}라${BOSS_ROUNDS.has(r)?' · 보스':''}`,remaining:Math.max(0,roundDuration(r,s)-elapsed),prep:false};
}

function rareNeedsForTarget(db,targetId){const counts={};function walk(id,mul,path){const u=db.byId.get(id);if(!u||path.has(id))return;if(isRare(u)){counts[id]=(counts[id]||0)+mul;return;}const next=new Set(path);next.add(id);for(const s of u.stuffs||[])walk(s.id,mul*num(s.count),next);}walk(targetId,1,new Set());return counts;}
function rareResolution(state,plan,locks){
  const p=plan||{},nowNeed={},holdNeed={};function add(dst,map){for(const [id,c] of Object.entries(map||{}))dst[id]=(dst[id]||0)+num(c);}function addMax(dst,map){for(const [id,c] of Object.entries(map||{}))dst[id]=Math.max(num(dst[id]),num(c));}function rowUse(row){return row&&row.solve&&row.solve.rareUse||row&&row.unit&&rareNeedsForTarget(state.db,row.unit.id)||{};}
  let protectedMap=p.rareInventory&&p.rareInventory.protectedById;if(!protectedMap){const ids=(locks||[]).filter(x=>['rare','upper','legend'].includes(x.stage)).map(x=>x.id),reserved=reserveTargets(state.db,state.counts,ids);protectedMap=protectedRareMap(state,reserved.stock);}add(nowNeed,protectedMap);if(p.actions&&p.actions[0])add(nowNeed,rowUse(p.actions[0]));
  if(p.selectionMode==='queue'){for(const row of (p.actions||[]).slice(1))add(holdNeed,rowUse(row));}else for(const row of (p.actions||[]).slice(1))addMax(holdNeed,rowUse(row));
  const rows=[];for(const u of state.db.rares){const have=num(state.counts[u.id]);if(have<=0)continue;const use=Math.min(have,num(nowNeed[u.id])),remain=have-use,hold=Math.min(remain,num(holdNeed[u.id])),reroll=Math.max(0,remain-hold);rows.push({unit:u,have,use,hold,reroll,protected:Math.min(have,num(protectedMap[u.id])),excess:reroll});}return rows.sort((a,b)=>(b.use+b.hold)-(a.use+a.hold)||b.reroll-a.reroll);
}
function supportTierUse(state,row){
  const used={rare:0,special:0,uncommon:0,common:0};
  for(const [id,value] of Object.entries(row&&row.solve&&row.solve.consumed||{})){
    const tier=tierKey(state&&state.db&&state.db.byId.get(id));
    if(Object.prototype.hasOwnProperty.call(used,tier))used[tier]+=num(value);
  }
  for(const key of Object.keys(used))used[key]=round2(used[key]);
  return used;
}
function supportClearStage(row,plan){
  const clearRows=plan&&plan.deficits&&plan.deficits.clearRows||[],impact=row&&row.impact||{},impactRows=impact.rows||[],byKey=new Map(impactRows.map(item=>[item.key,item])),regressed=(impact.regressed||[]).filter(item=>item.required);
  if(regressed.length)return{index:clearRows.length+2,level:2,label:`필수 후퇴 · ${regressed.map(item=>item.label).slice(0,2).join(' · ')}`};
  if(!clearRows.length)return{index:0,level:0,label:'필수 조건 동급'};
  // The display must preserve the same equal-priority gates as the party
  // planner. In particular, physical armor and the minimum 0.5 stun are one
  // stage, as are safe slow and boss/frenzy coverage.
  const mode=plan&&plan.mode,route=plan&&plan.resolvedMagicRoute||plan&&plan.deficits&&plan.deficits.route||plan&&plan.settings&&plan.settings._resolvedMagicRoute||'singleEnd',priority=mode==='physical'?[['armor','stunBase'],['slow','bossFrenzy'],['stunFull']]:route==='dual'?[['main','stunBase'],['slow'],['stunFull'],['bossFrenzy','toki']]:[['main'],['bossFrenzy','stunBase'],['slow'],['stunFull'],['singleEndExpected','single','end']],missing=new Set(clearRows.map(item=>item.key)),grouped=new Set(),groups=[];
  for(const keys of priority){const active=keys.filter(key=>missing.has(key));if(active.length){groups.push(active);active.forEach(key=>grouped.add(key));}}
  for(const need of clearRows)if(!grouped.has(need.key))groups.push([need.key]);
  for(let index=0;index<groups.length;index++){
    const changes=groups[index].map(key=>byKey.get(key)).filter(Boolean).filter(change=>num(change.gapBefore)-num(change.gapAfter)>0);if(!changes.length)continue;
    const closed=changes.some(change=>change.closed),labels=changes.map(change=>change.label).filter(Boolean).slice(0,2).join(' · ');
    return{index,level:closed?0:1,label:`${labels||'필수 역할'} ${closed?'충족':'보강'}`};
  }
  return{index:groups.length+1,level:1,label:row&&row.pairSynergy?'상위 시너지 보강':'후순위 패 효율'};
}
function compareSupportRows(a,b){
  const availability=row=>row.feasible&&row.valueStatus!=='hold'?0:row.feasible?1:2,availableOrder=availability(a)-availability(b);if(availableOrder)return availableOrder;
  const as=a.supportStage||{},bs=b.supportStage||{};if(num(as.index)!==num(bs.index))return num(as.index)-num(bs.index);if(num(as.level)!==num(bs.level))return num(as.level)-num(bs.level);
  for(const tier of ['rare','special','uncommon','common'])if(num(a.tierUse&&a.tierUse[tier])!==num(b.tierUse&&b.tierUse[tier]))return num(b.tierUse&&b.tierUse[tier])-num(a.tierUse&&a.tierUse[tier]);
  const aw=num(a.solve&&a.solve.wispCost),bw=num(b.solve&&b.solve.wispCost);if(aw!==bw)return aw-bw;
  if(!!a.pairSynergy!==!!b.pairSynergy)return Number(!!b.pairSynergy)-Number(!!a.pairSynergy);if(num(a.coverage)!==num(b.coverage))return num(b.coverage)-num(a.coverage);
  return nameOf(a.unit).localeCompare(nameOf(b.unit),'ko');
}
function upperProfileData(state,upper,plan,upperMemo,synergyMemo){
  if(!upper)return null;plan=plan||{};const memo=upperMemoFor(upper,upperMemo),role=roleProfile(upper),facts=skillFacts(upper),strategy=upperStrategy(upper),mode=familyOf(upper)==='neutral'?plan.mode:familyOf(upper),supports=(plan.rows||[]).filter(row=>row&&row.unit&&row.unit.id!==upper.id&&canonicalUpperId(row.unit.id)!==canonicalUpperId(upper.id)&&num(state.counts[row.unit.id])<=0).filter(row=>num(row.coverage)>0||row.pairSynergy).map(row=>Object.assign({},row,{tierUse:supportTierUse(state,row),supportStage:supportClearStage(row,plan)})).sort(compareSupportRows);
  supports.forEach((row,index)=>{row.supportRank=index+1;row.supportStageLabel=row.supportStage.label;});
  return{upper,memo,role,facts,strategy,mode,rankedSupports:supports,now:supports.filter(row=>row.feasible&&row.valueStatus!=='hold').slice(0,3),later:supports.filter(row=>!row.feasible||row.valueStatus==='hold').slice(0,5)};
}
function statusForRow(row,state){if(row.feasible)return{key:'ready',label:row.solve.wispCost?`선위 ${row.solve.wispCost} · 제작 가능`:'즉시 제작 가능'};if(row.blocked.length)return{key:'blocked',label:row.blocked[0]};return{key:'wait',label:`선위 ${row.wispGap}개 더 필요`};}
function summarizeRoles(row,mode){
  const r=row.role,parts=[];if(r.stun)parts.push(`스턴 ${round3(r.stun)}`);if(r.slow)parts.push(`상시이감 ${r.slow}`);if(r.triggerSlow)parts.push(`발동이감 ${r.triggerSlow}`);if(r.singleSlow)parts.push(`단일이감 ${r.singleSlow}`);if(mode==='physical'&&r.armor)parts.push(`상시방깎 ${r.armor}`);if(mode==='physical'&&r.triggerArmor)parts.push(`발동방깎 ${r.triggerArmor}`);if(r.armorBreak)parts.push('암브');if(mode==='magic'&&r.single)parts.push(`단일 ${r.single}`);if(mode==='magic'&&r.end)parts.push(`끝딜 ${r.end}`);if(r.boss&&r.frenzy)parts.push('광보잡');else if(r.boss)parts.push('보잡');else if(r.frenzy)parts.push('광폭');if(r.sharedUtility)parts.push('공용 유틸');if(r.supportDamage)parts.push('보조딜');if(r.magicDef||r.magicAmp||r.explosionAmp)parts.push('마딜 유틸');else if(r.utility&&!r.supportDamage&&!r.sharedUtility)parts.push('유틸');if(r.attack)parts.push(`공증 ${r.attack}`);if(r.speed)parts.push(`공속 ${r.speed}`);if(r.regen)parts.push(`체젠 ${r.regen}`);if(r.mana)parts.push(`마젠 ${r.mana}`);return parts.slice(0,6).join(' · ')||'역할 보조';
}
function snapshotHealth(snapshot,now){
  const s=snapshot||{},time=now||Date.now(),seconds=value=>value?Math.floor(Math.max(0,time-num(value))/1000):9999;
  const bridgeAt=num(s.bridgeAt||s.at),scanAt=num(s.scanAt||s.at),dataChangedAt=num(s.dataChangedAt||s.at);
  const ageSec=seconds(bridgeAt),scanAgeSec=seconds(scanAt),dataAgeSec=seconds(dataChangedAt);
  const result=(key,label,ready,note)=>({key,label,ready,ageSec,bridgeAgeSec:ageSec,scanAgeSec,dataAgeSec,note});
  if(!bridgeAt)return result('missing','TMO 미수신',false,'TMO.GG 데스크톱 프로그램과 32172 조합도우미를 먼저 연 뒤 다시 읽기를 눌러주세요. 기존 34366도 호환됩니다.');
  if(s.source==='manual'&&num(s.unitCount)>=80)return result('partial','오프라인 수동 모드',true,'자동 진행도·능력치 없이 수동으로 입력한 보유 유닛을 기준으로 계산합니다.');
  if(s.source!=='tmo')return result('error','알 수 없는 데이터 원본',false,'지원하는 TMO 연동 또는 동봉 수동 실행 파일에서 다시 시작해 주세요.');
  const helper=String(s.helperId||''),supportedHelper=helper==='32172'||helper==='34366';
  if(!supportedHelper||s.parser!=='ord-tmo-parser-v13-adapter')return result('error','지원하지 않는 TMO 도우미',false,'TMO 32172를 사용하세요. 기존 34366은 호환 모드로 지원합니다.');
  if(ageSec>12||scanAgeSec>12)return result('stale','TMO 새 스캔 없음',false,`브리지 ${ageSec}초·DOM 스캔 ${scanAgeSec}초 전입니다. TMO 탭과 확장 프로그램을 확인해 주세요. 오래된 추천은 숨겼습니다.`);
  const collection=s.collection||{},countDiscovery=s.countDiscovery||{},unitCount=num(s.unitCount),parsed=num(countDiscovery.parsed),coverage=unitCount?parsed/unitCount:0,confidence=num(collection.confidence);
  const catalogSize=typeof global!=='undefined'&&global.ORD_TMO_UNITS?global.ORD_TMO_UNITS.length:0,unitMin=catalogSize?Math.max(200,catalogSize-7):300,unitMax=catalogSize?Math.min(380,catalogSize+73):380;if(collection.found!==true||countDiscovery.found!==true||unitCount<unitMin||unitCount>unitMax||coverage!==1||num(countDiscovery.missing)>0||num(countDiscovery.ambiguous)>0||confidence<.72)return result('error','유닛 수량 수집 불완전',false,`유닛 ${unitCount}개·수량 ${parsed}/${unitCount}개·누락 ${num(countDiscovery.missing)}개·모호 ${num(countDiscovery.ambiguous)}개·신뢰도 ${Math.round(confidence*100)}%입니다. 실패한 수량을 0으로 쓰지 않고 이전 정상 패를 보호합니다.`);
  if(s.wispCountFound!==true)return result('error','선택 위습 수량 미확인',false,'선택 위습은 제작 가능 여부를 바꾸므로 수량을 임의로 0 처리하지 않습니다. TMO 탭을 새로고침하거나 수동 보정하세요.');
  if(s.connected===false)return result('partial','패 수집 정상 · 데스크톱 미연동',true,'패 수량은 정상입니다. 자동 게임 연동까지 쓰려면 TMO.GG 데스크톱 프로그램을 실행하세요.');
  if(num(s.abilityCount)<3)return result('partial','패 정상 · 현재 능력치 보정 중',true,'보유 수량은 정상 수신했고 빠진 현재 능력치는 보유 유닛 역할값으로 보완합니다.');
  if(ageSec>7||scanAgeSec>7)return result('lag','TMO 수신 지연',true,`브리지 ${ageSec}초·DOM 스캔 ${scanAgeSec}초 전입니다. 12초를 넘으면 추천을 자동으로 숨깁니다.`);
  return result('ok','TMO 실시간 정상',true,`현재 패·진행도·능력치를 반영합니다. 패 자체 변경은 ${dataAgeSec<9999?`${dataAgeSec}초 전`:'아직 없음'}이며 하트비트는 새 패로 세지 않습니다.`);
}
function debugFixture(){return{VERSION,roleProfile,magicFinishProfile,evaluateMagicSingleEnd,skillFacts,upperStrategy,upperPairSynergy,storyGrade,storyLeagueKey,storyLeagueTier,storyLeagueGrade,storyLeagueRows,recipeSolve,predictCompletionWithAddedMaterial,specialPrerequisiteStatus,currentSpec,controlEnvelope,controlState,clearProfileDetails,deficits,recommendationPlan,gameFlow,progressionCounts,normalizePostLegendRoute,selectCompatibleQueue,rareTargetsForRound,rareInventoryFor,rarePressureForInventory,rareSpendForSolve,rowScore,roundClock,snapshotHealth};}

global.ORDCore={VERSION,WISP_ID,SUPER_KUMA_ID,RAYLEIGH_HIDDEN_ID,PIRATE_SHIP_ID,STORY10_FORFEITS,SPECIAL_IDS,eligible152Specials,eligible152SpecialId,COMMON_COLORS,GOROSEI,CONTROL_ENVELOPE,CONTROL_PROFILES,BOSS_META,bossPreview,UPPER_LINE_PROFILE,DEFENSE_ARMOR,armorMultiplier,ARMOR_BREAK_CAP,armorBreakStacks,armorBreakModel,ATTACK_TYPE_VS_BOSS,upperCombatFor,upperRawDps,upperBossDps,bossRawDpsNeed,upperSkillProfile,upperSkillProcDps,simulateBossFlat,STUN_RESEARCH,STORY_RARE_BENCHMARKS,STORY_RARE_RANKS,STORY_RESEARCHED,STORY_LEAGUES,STORY_GRADE_TIERS,UPPER_VARIANT_FAMILIES,POST_LEGEND_ROUTES,MAX_WISP_COST,PREFERRED_WISP_COST,num,esc,cleanName,canonicalAbility,groupName,nameOf,displayNameOf,tierKey,isRare,isCommon,isUncommon,isSpecialTier,isUpper,isLegendish,isChanged,isWarped,isShip,isSeraph,isTranscend,requiresWarpedCraft,familyOf,canonicalUpperId,activeUpperVariant,upperPairSynergy,descriptionPartnerSynergy,roleProfile,magicFinishProfile,evaluateMagicSingleEnd,skillFacts,upperStrategy,stunResearch,stunCaptureRate,storyGrade,storyLeagueKey,storyLeagueTier,storyLeagueGrade,storyLeagueRows,buildDb,mergeLiveCatalog,normalizeState,recipeSolve,predictCompletionWithAddedMaterial,reserveTargets,specialPrerequisiteStatus,materialName,mapText,commonTop,completionPercent,ownedUnits,ownedDisplayUnits,isRoleBearingUnit,currentSpec,finalGradeSpec,applyBuildStep,controlEnvelope,controlState,clearProfileDetails,deficits,roleContribution,upperMemoFor,synergyRankFor,mainUpper,inferMode,candidateRow,recommendationPlan,gameFlow,normalizePostLegendRoute,milestonePurpose,phaseForRound,roundClock,rareResolution,rareTargetsForRound,rareInventoryFor,rarePressureForInventory,rareSpendForSolve,upperProfileData,statusForRow,summarizeRoles,snapshotHealth,debugFixture};
})(window);

