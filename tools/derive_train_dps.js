#!/usr/bin/env node
'use strict';

// v17.3 — FSM 트레인 정규화(ORD_2305C_..._fsm_trains.json)에서 "공격 유발
// 트레인"의 발동 1회당 기대 피해를 도출하고, v17.2 즉시 프록 결과와 합쳐
// ord_upper_skill_dps.js 를 재생성한다.
//
// 감사 계약 준수:
//  - skillDps = E[damagePerActivation] × activationRatePerSecond.
//    공격 유발 트레인의 rate = 공격속도 × JASS 발동 확률(런타임에 곱한다).
//  - 틱 수는 tickGroups[].tickCount / verifiedTimingFixture 우선.
//  - 등록 provenance는 발동 확률로 합산하지 않는다(activation.alternatives만).
//  - event_or_runtime_dependent 트레인은 fixture가 없으면 제외.
//  - 주 대상 적중 지시자 = 1(보스 단일 기준), 유닛 수 무조건 곱하기 금지.
//  - 스펠·수동·이벤트 발동 트레인은 시전 정책 미정이므로 제외(개수 기록).
//  - strict = 미해석 조건 0(하한) / approx = 통과(진단용).

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const FSM_PATH=path.join(ROOT,'data/ORD_2305C_all_upper_skill_profiles_fsm_trains.json');
const AST_PATH=path.join(ROOT,'data/ORD_2305C_all_upper_skill_profiles_action_ast.json');
const OUT_PATH=path.join(ROOT,'ord_tmo_auto_extension_v15_0_0_rebuild/ord_upper_skill_dps.js');

const fsm=JSON.parse(fs.readFileSync(FSM_PATH,'utf8'));
const ast=JSON.parse(fs.readFileSync(AST_PATH,'utf8'));

// 기존 모듈(v17.2 즉시 프록 도출)을 먼저 읽는다.  이 도구는 그 위에
// trains 필드를 더해 같은 파일을 재생성한다.
global.window=global;
delete require.cache[require.resolve(OUT_PATH)];
const previous=require(OUT_PATH);

// ── 액션 참조 → universal 여부 (액션 AST의 source 문자열 기준)
const actionById=new Map(ast.actionAst.actions.map(a=>[a.actionId,a]));
const isUniversalRef=ref=>{const a=actionById.get(ref);return a?/DAMAGE_TYPE_UNIVERSAL/.test(String(a.source||'')):false;};

// ── 프로필별 공격 진입 폐쇄(동기 호출 + 정적 디스패치)
const fns=ast.actionAst.functions;
const attackClosureByProfile={};
for(const profile of ast.profiles){
  const seen=new Set();
  const stack=(profile.actionProgram.entryPoints||[]).filter(e=>e.kind==='attack_started').map(e=>e.function);
  while(stack.length){
    const f=stack.pop();
    if(seen.has(f))continue;
    seen.add(f);
    const fn=fns[f];
    if(!fn)continue;
    for(const edge of fn.callEdges||[]){
      const callee=typeof edge==='string'?edge:edge.target;
      if(callee&&fns[callee]&&!seen.has(callee))stack.push(callee);
    }
  }
  attackClosureByProfile[profile.profileId]=seen;
}

// ── 조건 확률 평가 (v17.2 도출기와 동일 규약)
function evalConst(expr){
  if(!expr||typeof expr!=='object')return null;
  switch(expr.node){
    case 'literal':return typeof expr.value==='number'?expr.value:null;
    case 'group':return evalConst(expr.expression||expr.inner);
    case 'unary':{const v=evalConst(expr.operand||expr.expression);return v==null?null:expr.operator==='-'?-v:v;}
    case 'binary':{const l=evalConst(expr.left),r=evalConst(expr.right);if(l==null||r==null)return null;
      switch(expr.operator){case '+':return l+r;case '-':return l-r;case '*':return l*r;case '/':return r?l/r:null;default:return null;}}
    case 'call':{
      if(expr.function==='zL'||expr.function==='zM'){const a=evalConst(expr.arguments&&expr.arguments[0]),b=evalConst(expr.arguments&&expr.arguments[1]);return a==null||b==null?null:(a+b)/2;}
      if((expr.function==='I2R'||expr.function==='R2I')&&expr.arguments&&expr.arguments.length===1)return evalConst(expr.arguments[0]);
      return null;}
    default:return null;
  }
}
function probOf(cond){
  if(!cond||cond.node!=='binary')return null;
  const roll=side=>side&&side.node==='call'&&(side.function==='zL'||side.function==='zM')?{low:evalConst(side.arguments&&side.arguments[0]),high:evalConst(side.arguments&&side.arguments[1]),integer:side.function==='zL'}:null;
  let r=roll(cond.left),k=evalConst(cond.right),op=cond.operator,flip=false;
  if(!r){r=roll(cond.right);k=evalConst(cond.left);flip=true;}
  if(!r||r.low==null||r.high==null||k==null)return null;
  if(flip)op=op==='<='?'>=':op==='<'?'>':op==='>='?'<=':op==='>'?'<':op;
  const span=r.integer?r.high-r.low+1:r.high-r.low;
  if(span<=0)return null;
  const clamp=v=>Math.max(0,Math.min(1,v));
  if(r.integer){
    if(op==='<=')return clamp((Math.floor(k)-r.low+1)/span);
    if(op==='<')return clamp((Math.ceil(k)-r.low)/span);
    if(op==='>=')return clamp((r.high-Math.ceil(k)+1)/span);
    if(op==='>')return clamp((r.high-Math.floor(k))/span);
  }else{
    if(op==='<='||op==='<')return clamp((k-r.low)/span);
    if(op==='>='||op==='>')return clamp((r.high-k)/span);
  }
  return null;
}
// 스킬 보유·대상 생존/적군류 가드는 상시 참으로 본다.
const passGuard=cond=>/GetUnitAbilityLevel|LIFE|Life|DEAD|Alive|Enemy|IsUnit|GetWidgetLife/.test(String(cond&&cond.expression&&cond.expression.source||cond&&cond.source||''));
function conditionsProb(conditions,stats){
  let strict=1,approx=1;
  for(const cond of conditions||[]){
    const expr=cond.expression||cond;
    const q=probOf(expr);
    if(q!=null){const eff=cond.truth===false?1-q:q;strict*=eff;approx*=eff;}
    else if(passGuard(cond)){stats.passGuards+=1;}
    else{stats.unknownConditions+=1;strict=0;}
  }
  return{strict,approx};
}

// ── 실행 수: fixture 우선, 아니면 권위 variants의 tickCount 가중합
function executionCount(train,actionRef,stats){
  const fixture=train.timeline.verifiedTimingFixture;
  if(fixture&&fixture.executionCountByActionRef&&fixture.executionCountByActionRef[actionRef]!=null)
    return{count:Number(fixture.executionCountByActionRef[actionRef]),basis:'fixture'};
  if(train.timeline.status!=='exact_static'&&train.timeline.status!=='branched_static'){stats.runtimeTimelineSkipped+=1;return null;}
  let total=0,weightSum=0;
  for(const variant of train.timeline.variants||[]){
    const weight=variant.pathProbabilityFromInternalRng!=null?Number(variant.pathProbabilityFromInternalRng):1;
    let count=0;
    for(const group of variant.tickGroups||[])if(group.actionRef===actionRef)count+=Number(group.tickCount)||0;
    total+=weight*count;weightSum+=weight;
  }
  if(weightSum<=0)return{count:0,basis:'variants'};
  return{count:total/Math.max(1e-9,weightSum)*(weightSum>1?weightSum:1)/(weightSum>1?weightSum:1)*1+((weightSum<=1)?0:0)||total,basis:'variants'};
}

const byProfileTrains={};
const globalStats={trains:fsm.trains.length,included:0,excludedNonAttack:0,skippedRuntime:0,skippedNonConst:0};
for(const train of fsm.trains){
  const owners=(train.owners||[]).map(o=>o.profileId).filter(Boolean);
  if(!owners.length)continue;
  const stats={unknownConditions:0,passGuards:0,runtimeTimelineSkipped:0};
  // 공격 유발 대안만 발동 확률로 인정한다.
  // 공격 폐쇄 안 + 명시 RNG 게이트(zL/zM 확률<1)가 있는 대안만 "공격당
  // 확률 발동"으로 인정한다.  무조건(p=1) 대안은 공격당 재발동이라는
  // 보장이 없고(BD1 재진입 의미론·디스패치 경유 가능성) 값이 오염되므로
  // 제외하고 개수만 기록한다.
  let actStrict=0,actApprox=0,attackLinked=false,rngGated=false;
  for(const alt of train.activation&&train.activation.alternatives||[]){
    const caller=alt.callerFunction;
    const isAttack=owners.some(profileId=>attackClosureByProfile[profileId]&&attackClosureByProfile[profileId].has(caller));
    if(!isAttack)continue;
    attackLinked=true;
    const hasRng=(alt.conditions||[]).some(cond=>{const q=probOf(cond.expression||cond);return q!=null&&q<1;});
    if(!hasRng)continue;
    rngGated=true;
    const{strict,approx}=conditionsProb(alt.conditions,stats);
    actStrict=1-(1-actStrict)*(1-strict);
    actApprox=1-(1-actApprox)*(1-approx);
  }
  if(!attackLinked){globalStats.excludedNonAttack+=1;continue;}
  if(!rngGated){globalStats.excludedUnconditional=(globalStats.excludedUnconditional||0)+1;continue;}
  // strict 확률 0 = 미해석 조건에 막혀 확정 불가.  런타임은 strict만
  // 소비하므로(v17.2 정책) 자리만 차지하는 p=0 트레인은 내보내지 않는다.
  if(actStrict<=0){globalStats.excludedUnconfirmedStrict=(globalStats.excludedUnconfirmedStrict||0)+1;continue;}
  // 발동 1회당 기대 피해: 항별 기대식 × 실행 수 × 항 조건 확률.
  let perActStrict={affected:0,universal:0},perActApprox={affected:0,universal:0},evaluable=true,runtime=false;
  for(const term of train.damage&&train.damage.terms||[]){
    const amount=evalConst(term.amountExpectedExpression);
    if(amount==null){evaluable=false;break;}
    const exec=executionCount(train,term.actionRef,stats);
    if(!exec){runtime=true;break;}
    const{strict,approx}=conditionsProb(term.conditions,stats);
    const key=isUniversalRef(term.actionRef)?'universal':'affected';
    perActStrict[key]+=amount*exec.count*strict;
    perActApprox[key]+=amount*exec.count*approx;
  }
  if(runtime){globalStats.skippedRuntime+=1;continue;}
  if(!evaluable){globalStats.skippedNonConst+=1;continue;}
  globalStats.included+=1;
  // BD1 재진입 의미론: 실행 중 재발동은 새 프레임을 만들지 않으므로
  // 발동률은 1/활성 지속시간을 넘을 수 없다.  지속시간을 함께 내보내
  // 런타임에서 rate=min(공격률×p, 1/duration)으로 캡한다.
  let duration=0;
  for(const variant of train.timeline.variants||[])duration=Math.max(duration,Number(variant.activeDurationSeconds)||0);
  const round2v=v=>Math.round(v*100)/100;
  for(const profileId of owners){
    const slot=byProfileTrains[profileId]=byProfileTrains[profileId]||{trains:[],unknownConditions:0};
    slot.unknownConditions+=stats.unknownConditions;
    slot.trains.push({
      id:train.trainId,
      p:round2v(actStrict),
      pa:round2v(actApprox),
      dur:round2v(duration),
      e:{affected:round2v(perActStrict.affected),universal:round2v(perActStrict.universal)},
      ea:{affected:round2v(perActApprox.affected),universal:round2v(perActApprox.universal)}
    });
  }
}

const payload={
  version:'2305C-fsm-trains-1',
  schema:fsm.schemaVersion,
  allowSkillDpsDerivation:true,
  allowKillVerdict:false,
  basis:previous.basis.split(' · FSM 공격유발 트레인 포함')[0]+' · FSM 공격유발 트레인 포함(스펠·수동·이벤트 제외)',
  byProfile:previous.byProfile,
  trainsByProfile:byProfileTrains,
  byTmo:previous.byTmo,
  trainStats:globalStats
};
const js='(function(global){\n'+
"'use strict';\n"+
'// 액션 AST 즉시 프록(v17.2) + FSM 공격유발 트레인(v17.3) 정적 하한.\n'+
'// tools/derive_skill_dps.js + tools/derive_train_dps.js 가 생성.\n'+
'// 스펠·수동·이벤트 트레인 제외 · 주 대상 1 기준 · 킬 판정 금지 유지.\n'+
'const ORD_UPPER_SKILL_DPS='+JSON.stringify(payload)+';\n'+
'global.ORD_UPPER_SKILL_DPS=ORD_UPPER_SKILL_DPS;\n'+
"if(typeof module==='object'&&module.exports)module.exports=ORD_UPPER_SKILL_DPS;\n"+
'})(typeof window!=="undefined"?window:globalThis);\n';
fs.writeFileSync(OUT_PATH,js);

// 미리보기: 4타/초 가정 시 트레인 DPS 하한(캡 적용)
const previewAps=4;
const rows=Object.entries(byProfileTrains).map(([id,slot])=>{
  let dps=0;
  for(const train of slot.trains){
    const rate=Math.min(previewAps*train.p,train.dur>0?1/train.dur:previewAps*train.p);
    dps+=(train.e.affected+train.e.universal)*rate;
  }
  return{id,dps,trains:slot.trains.length};
}).sort((a,b)=>b.dps-a.dps);
console.log('train stats:',JSON.stringify(globalStats));
console.log('profile'.padEnd(26),'trainDPS@4aps(하한)','trains');
for(const r of rows.slice(0,15))console.log(r.id.padEnd(26),String(Math.round(r.dps)).padStart(16),String(r.trains).padStart(6));
console.log('output',OUT_PATH,js.length,'bytes');
