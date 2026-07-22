'use strict';

// Regression replay for ORD_2305_20260720_210515_active.ordlog.json.
//
// That magic singleEnd run sat in a silent HOLD from round 43 to round 62
// while required deficits stayed open (이감 65/102, 단일 1/2, 검증된 보조
// 단일·끝딜 2/3).  Three structural v15 defects caused it:
//   1. the action universe was legendish+uppers only, so a Rare that closes a
//      required combat role could never be proposed;
//   2. policy evaluation used durable-final-only counts, so no Rare craft
//      could ever register as an improvement;
//   3. main-upper strategic requirements (Dragon's 단일/끝딜) were outside the
//      static route groups and invisible to the whole judgement pipeline.
// The fixtures below are the exact reconstructed TMO states (snapshot folds)
// of rounds 50 and 57 from that log.  v16 must produce either an executable
// required-deficit repair or an explicit recovery ladder — never a silent
// empty board.

const assert=require('assert');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
const originalWarn=console.warn;
console.warn=()=>{};
for(const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_core.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const Engine=global.ORDV15Engine;
const units=global.ORD_TMO_UNITS;

const FIXTURES={
  r50:{
    round:50,wisp:4,
    counts:{'100h':5,'200h':1,'300h':2,'310h':1,'400h':7,'500h':2,'600h':3,'700h':2,'720h':1,'780h':1,'800h':1,'810e':4,'900h':5,'910h':1,D10h:2,D40h:1,G00h:1,J30h:1,K00h:1,Q20h:1,U10h:1,X20h:1,Z30h:1,unit_1767884925665_1037:1}
  },
  r57:{
    round:57,wisp:2,
    counts:{'100h':1,'200h':1,'300h':2,'310h':1,'400h':4,'500h':1,'550h':1,'600h':1,'700h':7,'780h':1,'800h':2,'810e':2,'900h':1,D10h:1,D40h:1,E00h:1,G00h:1,I00h:2,J30h:1,M00h:1,Q20h:1,Q30h:1,X20h:1,Z30h:1}
  }
};

function decide(fixture){
  return Engine.decide({
    catalog:units,
    snapshot:{source:'stall-recovery-replay',counts:fixture.counts,currentAbilities:{},wispCountFound:true,wispCount:fixture.wisp},
    settings:{mode:'magic',magicRoute:'singleEnd',currentRound:fixture.round,gorosei:'saturn',postLegendRoute:'upper',superKumaOwned:true},
    locks:[{stage:'upper',id:'D40h',source:'v15-exact-route'}]
  });
}

function requirementByKey(decision,key){
  return(decision.assessment&&decision.assessment.requirements||[]).find(row=>row.key===key);
}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('r50 replay proposes a required-deficit repair instead of holding',()=>{
  const decision=decide(FIXTURES.r50);
  const actionable=decision.state==='ACT_NOW'&&decision.action;
  const guided=decision.recovery&&decision.recovery.targets&&decision.recovery.targets.length>0;
  assert(actionable||guided,`the r50 stall state must yield an action or a recovery ladder, got ${decision.state}`);
  if(actionable){
    // v17.4: the guard is against 이감 starvation, not a specific step order —
    // crafting is not once-per-round, and the historical 페로나-first pick was
    // itself a tie-break artifact (uncommon combat roles are not credited in
    // the judged vectors).  Accept any plan whose same-round path reduces the
    // open 이감 deficit, first action or a later funded step.
    const repairsSlowNow=(decision.action.deltas||[]).some(row=>row.key==='slow'&&row.gapGain>0);
    const steps=decision.bestPath&&decision.bestPath.steps||[];
    const pathRepairsSlow=steps.some(step=>{
      const unit=units.find(u=>u.id===step.id);
      if(!unit)return false;
      const role=global.ORDCore.roleProfile(unit);
      return Number(role.slow)+Number(role.triggerSlow)>0;
    });
    assert(repairsSlowNow||pathRepairsSlow,'the r50 plan must reduce the open 이감 deficit within its funded path');
  }
});

test('r57 replay never returns the silent empty board from the log',()=>{
  const decision=decide(FIXTURES.r57);
  const actionable=decision.state==='ACT_NOW'&&decision.action;
  const guided=decision.recovery&&decision.recovery.targets&&decision.recovery.targets.length>0;
  assert(actionable||guided,`round 57 held for 10+ recorded rounds; v16 must act or guide, got ${decision.state}`);
});

test('main-upper strategic requirements (단일/끝딜) join the judged requirement table',()=>{
  const decision=decide(FIXTURES.r57);
  const single=requirementByKey(decision,'single');
  assert(single,'Dragon single-target requirement is missing from the assessment');
  assert(single.required!==false,'the single requirement must stay required');
  assert(Number(single.target)>=2,'Dragon requires two single-target dealers');
  const structural=decision.assessment.structuralPass;
  assert.strictEqual(structural,false,'open strategic requirements must block structuralPass');
});

test('live Rare combat roles are credited by the assessment (no durable-only blindness)',()=>{
  const decision=decide(FIXTURES.r57);
  const slow=requirementByKey(decision,'slow');
  assert(slow,'slow requirement missing');
  assert(Number(slow.current)>0,'owned live slow contributions were zeroed out by a durable-only evaluation');
});

test('policy evaluate publishes a concrete status/label (labeled-statement bug fixed)',()=>{
  const decision=decide(FIXTURES.r57);
  assert(['structural','developing','unsafe'].includes(decision.assessment.status),`status was '${decision.assessment.status}'`);
  assert(decision.assessment.label&&decision.assessment.label.length>0,'assessment label is empty');
});

test('recovery plan names nearest closers with wisp distance when crafting is blocked',()=>{
  const model=decide(FIXTURES.r57).model;
  const P=global.ORDV15Policy;
  const route=P.resolveRoute(model.intent,model.settings);
  const assessment=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks:[]});
  const plan=Engine._test.recoveryPlan(model,route,[],assessment);
  assert(plan&&plan.targets.length>0,'recovery plan must exist while required deficits are open');
  for(const target of plan.targets){
    assert(target.name,'recovery target lacks a name');
    assert(target.roleLabel,'recovery target lacks a role label');
    assert(Number.isFinite(Number(target.wispCost)),'recovery target lacks a wisp cost');
  }
});

// Fourth log (ORD_2305_20260721_145141): Alvida auto-detected at round 20
// pushed the spec search below round 25 for the first time, tripping a latent
// `const hold` reassignment in rareDisposition — five rounds of '판단 엔진
// 점검 필요' on the live screen.  Exact folded TMO state of the first crash.
const ALVIDA_R20={
  round:20,wisp:7,
  counts:{'100h':1,'200h':3,'300h':1,'400h':2,'500h':3,'700h':5,'800h':4,'810e':7,'900h':3,C20h:1,E20h:1,F10h:1,I00h:1,I10h:1,J10h:1,L00h:1,L20h:1,M00h:1,O00h:1,Q80h:1,S00h:1,T30h:1,U00h:1,X00h:1}
};
function decideAlvida(){
  return Engine.decide({
    catalog:units,
    snapshot:{source:'alvida-r20-replay',counts:ALVIDA_R20.counts,currentAbilities:{},wispCountFound:true,wispCount:ALVIDA_R20.wisp},
    settings:{mode:'physical',magicRoute:'auto',currentRound:ALVIDA_R20.round,gorosei:'saturn',postLegendRoute:'upper',superKumaOwned:true},
    locks:[{stage:'upper',id:'Q80h',source:'tmo'}]
  });
}

test('pre-round-25 spec search with spare rares no longer crashes (const hold regression)',()=>{
  const decision=decideAlvida();
  assert.notStrictEqual(decision.state,'SYNC_BLOCKED',`engine returned its crash fallback: ${decision.reason}`);
  assert(decision.state,'decision state missing');
});

test('Alvida waives stun requirements: stunless route is not gated or chased',()=>{
  const decision=decideAlvida();
  const stunBase=requirementByKey(decision,'stunBase'),stunFull=requirementByKey(decision,'stunFull');
  assert(stunBase&&stunBase.waived===true,'Alvida stunBase must be waived');
  assert(stunFull&&stunFull.waived===true,'Alvida stunFull must be waived');
  const blockers=decision.assessment.blockers||[];
  assert(!blockers.some(text=>/스턴/.test(text)),`stun still listed as a blocker: ${blockers.join(' | ')}`);
  for(const target of decision.recovery&&decision.recovery.targets||[])
    assert(!['stunBase','stunFull'].includes(target.roleKey),'recovery ladder chased a waived stun role');
  const slow=requirementByKey(decision,'slow');
  assert(slow&&slow.required!==false&&!slow.waived,'slow must stay a hard requirement for the stunless route');
});

// Sixth log (ORD_2305_20260722_025701, magic singleEnd, upper 480h 시노부):
// at round 53 the only open requirement (충분한 1.5스턴 +0.25) had no
// affordable closer, yet a feasible zero-regression squeeze — 변화된
// 도플라밍고 raising 단·끝 3→3.5 — sat in 보류 for three rounds.  The
// surplus-upgrade rule must approve it immediately.
const SHINOBU_R53={
  round:53,wisp:4,upperId:'480h',
  counts:{'100h':2,'130h':1,'140h':1,'400h':1,'480h':1,'500h':1,'600h':1,'700h':1,'810e':4,'900h':3,C30h:1,D10h:1,E00h:1,E30h:1,J30h:1,X30h:1,Y20h:1,unit_1779015610844_6407:1}
};

test('unclosable-gap surplus squeeze (변화 도플라밍고) is approved, not held',()=>{
  const decision=Engine.decide({
    catalog:units,
    snapshot:{source:'shinobu-r53-replay',counts:SHINOBU_R53.counts,currentAbilities:{},wispCountFound:true,wispCount:SHINOBU_R53.wisp},
    settings:{mode:'magic',magicRoute:'singleEnd',currentRound:SHINOBU_R53.round,gorosei:'wculee',postLegendRoute:'upper',superKumaOwned:true},
    locks:[{stage:'upper',id:SHINOBU_R53.upperId,source:'tmo'}]
  });
  assert.strictEqual(decision.state,'ACT_NOW',`surplus squeeze must not be held: ${decision.state} ${decision.reason}`);
  assert(decision.action&&decision.action.id==='S50h',`expected changed Doflamingo, got ${decision.action&&decision.action.name}`);
});

test('transcend uppers stay comparable: Super Kuma assumed until spent',()=>{
  const model=decide(FIXTURES.r57).model;
  assert.strictEqual(model.effective.counts[global.ORDCore.SUPER_KUMA_ID]||0,1,'Kuma must be assumed while transcend is available');
  assert(model.patch.assumptions.some(row=>row.kind==='transcend-available'),'assumption record missing');
});

// Seventh log (ORD_2305_20260722_051421, physical, locked transcend upper
// (A)쵸파 몬스터포인트): from round 41 to the round-60 boss the engine sat in
// full 재료 보호 — the locked upper's quote needed 54~78 selection wisp while
// the player held 5~20 — and recommended nothing for 21 rounds.  이감 stayed
// 0~60/102, 광보잡 stayed open, and the line died to Big Mom.  While the
// upper is far from affordable, only its tree materials may stay locked; the
// survival search must keep running on the remaining stock.  Exact folded
// TMO states of rounds 45 and 58 from that log.
const CHOPPER_UPPER='unit_1747756917990_920';
const CHOPPER_R45={
  round:45,wisp:20,
  counts:{'100h':3,'200h':2,'400h':2,'600h':1,'610h':1,'700h':3,'800h':4,'810e':20,'900h':1,B00h:1,B10h:1,E00h:3,H40h:2,J00h:4,J20h:1,M00h:3,N10h:1,O20h:1,O30h:1,Q30h:1,S00h:1,U00h:3,Z20h:1,unit_1767884906256_4990:1,unit_1767884925665_1037:1,unit_1767884970331_9084:1},
  abilities:{'공격속도 증가':10,'공중이동':1,'방어력 감소':59,'스턴':1.2,'이동속도 감소':40,'체력 재생':1.25}
};
const CHOPPER_R58={
  round:58,wisp:5,
  counts:{'300h':1,'500h':3,'600h':1,'700h':1,'810e':5,'910h':1,F30h:1,IC0h:1,L00h:1,O20h:1,O30h:1,P00h:1,Q30h:1,Z20h:1,unit_1779016886375_9574:1},
  abilities:{'공중이동':3,'광폭화':1,'단일방어력 감소':20,'마나 재생':1,'발동방어력 감소':20,'발동이동속도 감소':11,'방어력 감소':111,'보스 잡기':1,'스턴':1.7,'아머브레이크':2,'이동속도 감소':40,'체력 재생':2.25}
};
function decideChopper(fixture,wispOverride){
  const counts=Object.assign({},fixture.counts);
  if(wispOverride!=null)counts['810e']=wispOverride;
  return Engine.decide({
    catalog:units,
    snapshot:{source:'chopper-hold-replay',counts,currentAbilities:fixture.abilities,wispCountFound:true,wispCount:counts['810e']},
    settings:{mode:'physical',magicRoute:'auto',currentRound:fixture.round,gorosei:'warcury',postLegendRoute:'upper',virtualSpecialId:'610h',superKumaOwned:true},
    locks:[{stage:'upper',id:CHOPPER_UPPER,source:'v15-exact-route'}]
  });
}

test('far-from-affordable upper lock no longer freezes the board (r45: 광보잡 closes)',()=>{
  const decision=decideChopper(CHOPPER_R45);
  assert.notStrictEqual(decision.state,'PREPARE',`21 recorded rounds of 재료 보호 must not recur: ${decision.state} ${decision.reason}`);
  assert.strictEqual(decision.state,'ACT_NOW',`the r45 state has an affordable 광보잡 closer, got ${decision.state}`);
  const repairs=(decision.action.deltas||[]).some(row=>['bossFrenzy','slow','armor','stunBase'].includes(row.key)&&(row.closed||row.gapGain>0));
  assert(repairs,`the action must close an open survival deficit, got ${decision.action.name}`);
  assert(decision.upperReserve&&decision.upperReserve.reservedUnits>0,'upper tree materials must stay reserved during the survival search');
  assert(Number(decision.upperReserve.wispShort)>0,'the reservation note must expose the wisp shortfall');
});

test('r58 replay recommends the manual 변화 비비 line (이감+깍) the player had to find alone',()=>{
  const decision=decideChopper(CHOPPER_R58);
  assert.strictEqual(decision.state,'ACT_NOW',`expected the 이감 repair, got ${decision.state} ${decision.reason}`);
  const repairsSlow=(decision.action.deltas||[]).some(row=>row.key==='slow'&&row.gapGain>0);
  assert(repairsSlow,`the r58 action must reduce the open 이감 deficit, got ${decision.action.name}`);
  assert(decision.upperReserve,'upper reservation info missing from the searched decision');
});

test('inside the near-completion wisp band the full 재료 보호 hold is preserved',()=>{
  const decision=decideChopper(CHOPPER_R58,60);
  assert.strictEqual(decision.state,'PREPARE',`wisp 60 of ~70 is inside the hold band, got ${decision.state}`);
  assert.strictEqual(decision.label,'확정 상위 재료 보호',`unexpected label ${decision.label}`);
});

// Eighth log (ORD_2305_20260722_064137, physical, upper F50h 크로커다일):
// died at the ROUND-50 boss with 광보잡 0/1 open for the entire game while a
// 0~1-wisp closer (킬러) stayed feasible for eight straight rounds — armor's
// partial progress (100/180) always outranked the untouched one-unit role in
// the static group order.  Exact folded TMO state of round 44.  The v16.8
// ordering rule must recommend the 광보잡 closer, and the low-line-damage
// upper (desc: 약한 스킬딜러) must demand a 보조·방무딜 support unit.
const CROC_R44={
  round:44,wisp:14,
  counts:{'100h':2,'200h':2,'300h':1,'400h':4,'500h':5,'510h':2,'520h':1,'600h':1,'700h':2,'800h':4,'810e':14,'900h':2,A00h:1,C00h:3,C10h:1,E00h:2,E20h:2,F50h:1,G10h:1,G30h:1,IC0h:1,K20h:1,K50h:1,M00h:1,M30h:1,N30h:1,O00h:1,Q30h:1,R10h:1,Y00h:2}
};

test('round-50 boss regression: untouched 광보잡 outranks partial armor from round 40',()=>{
  const snap=CROC_R44;
  const decision=Engine.decide({
    catalog:units,
    snapshot:{source:'croc-r44-replay',counts:snap.counts,currentAbilities:{},wispCountFound:true,wispCount:snap.wisp},
    settings:{mode:'physical',magicRoute:'auto',currentRound:snap.round,gorosei:'saturn',postLegendRoute:'upper',virtualSpecialId:'210h',superKumaOwned:true},
    locks:[{stage:'upper',id:'F50h',source:'tmo'}]
  });
  assert.strictEqual(decision.state,'ACT_NOW',`a cheap 광보잡 closer exists, got ${decision.state} ${decision.reason}`);
  const closesBossFrenzy=(decision.action.deltas||[]).some(row=>row.key==='bossFrenzy'&&(row.closed||row.gapGain>0));
  assert(closesBossFrenzy,`the recommendation must close 광보잡, got ${decision.action.name}`);
});

test('low-line-damage upper (크로커다일) requires a 보조·방무딜 support unit',()=>{
  const strategy=global.ORDCore.upperStrategy(units.find(unit=>unit.id==='F50h'));
  assert(strategy.needs.some(need=>need.key==='subdamage'),'F50h must demand subdamage support');
  const decision=Engine.decide({
    catalog:units,
    snapshot:{source:'croc-subdamage-replay',counts:CROC_R44.counts,currentAbilities:{},wispCountFound:true,wispCount:CROC_R44.wisp},
    settings:{mode:'physical',magicRoute:'auto',currentRound:CROC_R44.round,gorosei:'saturn',postLegendRoute:'upper',virtualSpecialId:'210h',superKumaOwned:true},
    locks:[{stage:'upper',id:'F50h',source:'tmo'}]
  });
  const row=(decision.assessment&&decision.assessment.requirements||[]).find(item=>item.key==='subdamage');
  assert(row,'subdamage requirement missing from the judged assessment');
  assert(row.required!==false,'subdamage must be a hard requirement for the weak-line upper');
});

test('generic rule: any upper described as 약한 스킬딜러 demands support damage',()=>{
  const fake={id:'ZZTESTUP',name:'테스트 상위',groupName:'초월 [물딜]',desc:'유틸은 좋지만 약한 스킬딜러',abilities:{'이동속도 감소':30},stuffs:[]};
  const strategy=global.ORDCore.upperStrategy(fake);
  assert(strategy.needs.some(need=>need.key==='subdamage'),'desc-driven weak-line rule missing');
});

let failures=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);}
  catch(error){failures+=1;console.error(`FAIL ${name}`);console.error(error&&error.message||error);}
}
console.log(`V16_STALL_RECOVERY ${tests.length-failures}/${tests.length} passed`);
if(failures)process.exit(1);
