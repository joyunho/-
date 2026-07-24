'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of [
  'ord_story_nonupper_data.js','ord_story_upper_data.js','ord_units_data.js',
  'ord_data_patch.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js',
  'ord_v15_policy.js','ord_v15_engine.js'
])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,L=global.ORDV15Ledger,
  P=global.ORDV15Policy,E=global.ORDV15Engine;

const wisp={id:C.WISP_ID,name:'선택위습',groupName:'특수재료',abilities:{},stuffs:[]};
const common={id:'v15-common',name:'테스트 흔함',groupName:'흔함',abilities:{},stuffs:[]};
const rareA={id:'v15-rare-a',name:'첫 희귀 A',groupName:'희귀함',abilities:{},stuffs:[{id:C.WISP_ID,count:3}]};
const rareB={id:'v15-rare-b',name:'첫 희귀 B',groupName:'희귀함',abilities:{},stuffs:[{id:C.WISP_ID,count:1}]};
const legendA={id:'v15-legend-a',name:'첫 전설 A',groupName:'전설 [물딜]',abilities:{'방어력 감소':20},stuffs:[{id:rareA.id,count:1}]};
const legendB={id:'v15-legend-b',name:'추가 전설 B',groupName:'히든 [물딜]',abilities:{'이동속도 감소':20},stuffs:[{id:C.WISP_ID,count:1}]};
const upperA={id:'v15-upper-a',name:'메인 상위 A',groupName:'초월 [물딜]',abilities:{'방어력 감소':50},stuffs:[{id:C.WISP_ID,count:1}]};
const orphanRare={id:'v15-orphan-rare',name:'근거 없는 희귀',groupName:'희귀함',abilities:{},stuffs:[]};
const orphanConsumer={id:'v15-orphan-consumer',name:'근거 없는 소비자',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:orphanRare.id,count:1}]};
const zombie={id:'unit_1767884889420_456',name:'좀비',groupName:'특수재료',abilities:{},stuffs:[]};
const absalom={id:'v15-absalom',name:'압살롬',groupName:'전설 [물딜]',abilities:{},stuffs:[{id:zombie.id,count:1}]};
const superKuma={id:C.SUPER_KUMA_ID,name:'초월쿠마',groupName:'특수재료',hardSpecial:true,abilities:{},stuffs:[]};
const transcend={id:'v15-transcend',name:'테스트 초월',groupName:'초월 [물딜]',abilities:{'방어력 감소':40},stuffs:[{id:superKuma.id,count:1}]};
const catalog=[wisp,common,rareA,rareB,legendA,legendB,upperA,orphanRare,orphanConsumer,zombie,absalom,superKuma,transcend];

function input({counts={},percent={},settings={},abilities={}}={}){
  const rows=catalog.map(unit=>Object.assign({},unit,{count:Number(counts[unit.id]||0),tmoPercent:Number(percent[unit.id]||0)}));
  return{catalog,snapshot:{source:'fixture',sessionId:'v15-test',seq:1,at:1000,dataChangedAt:1000,wispCountFound:true,wispCount:Number(counts[C.WISP_ID]||0),counts:Object.assign({},counts),currentAbilities:abilities,units:rows},settings:Object.assign({currentRound:25,mode:'physical',magicRoute:'physical',postLegendRoute:'',manualCounts:{},superKumaOwned:false,wispOverride:'',virtualSpecialId:'',gorosei:'none'},settings),locks:[]};
}

assert.strictEqual(M.VERSION,'17.9.0');
assert.strictEqual(L.VERSION,'17.9.0');
assert.strictEqual(P.VERSION,'17.9.0');
assert.strictEqual(E.AUTHORITY,'ord-v15-decision-engine');

// Observed TMO counts remain immutable evidence; user corrections live only in
// the effective scenario and are recorded as assumptions.
{
  const model=M.build(input({counts:{[common.id]:1,[C.WISP_ID]:2},settings:{manualCounts:{[common.id]:4}}}));
  assert.strictEqual(model.observed.counts[common.id],1);
  assert.strictEqual(model.effective.counts[common.id],4);
  assert(model.patch.assumptions.some(row=>row.kind==='manual-count'&&row.id===common.id));
  const changed=M.build(input({counts:{[common.id]:1,[C.WISP_ID]:2},percent:{[rareA.id]:90}}));
  const changedAgain=M.build(input({counts:{[common.id]:1,[C.WISP_ID]:2},percent:{[rareA.id]:91}}));
  assert.notStrictEqual(changed.fingerprint,changedAgain.fingerprint,'completion-only TMO change reused an old authority fingerprint');
}

// First milestones remain completion-authority rules after their nominal
// deadlines. PREPARE is not an executable action.
{
  const prepare=E.decide(input({counts:{[C.WISP_ID]:0},percent:{[rareA.id]:99,[rareB.id]:80},settings:{currentRound:12}}));
  assert.strictEqual(prepare.state,'PREPARE');
  assert.strictEqual(prepare.action,null);
  assert.strictEqual(prepare.blockedAction.id,rareA.id);
  assert.strictEqual(prepare.authorityEngine,E.AUTHORITY);

  const firstLegend=E.decide(input({counts:{[rareA.id]:1,[C.WISP_ID]:2},percent:{[legendA.id]:96,[legendB.id]:90},settings:{currentRound:23}}));
  assert.strictEqual(firstLegend.state,'ACT_NOW');
  assert.strictEqual(firstLegend.action.id,legendA.id);
  assert.match(firstLegend.label,/첫 전설/);
}

// Explicit post-legend "legend" choice must remain a completion decision and
// must not recommend the already-owned highest-completion legend again.
{
  const more=E.decide(input({counts:{[legendA.id]:1,[C.WISP_ID]:2},percent:{[legendA.id]:100,[legendB.id]:93},settings:{currentRound:25,postLegendRoute:'legend'}}));
  assert.strictEqual(more.state,'ACT_NOW');
  assert.strictEqual(more.action.id,legendB.id);
  assert.match(more.label,/추가 전설/);

  const choose=E.decide(input({counts:{[legendA.id]:1,[C.WISP_ID]:2},percent:{[legendA.id]:100,[legendB.id]:93},settings:{currentRound:25,postLegendRoute:''}}));
  assert.strictEqual(choose.state,'ROUTE_CHOICE');
  assert.strictEqual(choose.action,null);
  assert.strictEqual(choose.rare.safeReroll,null);
}

// Exact ledger rejects non-Common leaf shortages and stale sequential quotes.
{
  const model=M.build(input({counts:{[C.WISP_ID]:99}}));
  const blocked=L.quote(model,orphanConsumer,model.effective.counts);
  assert.strictEqual(blocked.feasible,false);
  assert(blocked.blocked.some(reason=>/조합 근거 부족/.test(reason)),blocked.blocked);
  const ready=L.quote(model,legendB,model.effective.counts);
  assert.strictEqual(ready.feasible,true);
  const stale=Object.assign({},model.effective.counts,{[common.id]:1});
  assert.strictEqual(L.apply(model,ready,stale).ok,false);
}

// Absalom is the sole special-prerequisite exception: the zombie leaf may be
// absent without turning an otherwise exact recipe into a false block.
{
  const model=M.build(input({counts:{[C.WISP_ID]:0}})),quote=L.quote(model,absalom,model.effective.counts);
  assert.strictEqual(quote.prerequisite.exception,true);
  assert.strictEqual(quote.feasible,true,quote.blocked);
  assert.strictEqual(L.apply(model,quote,model.effective.counts).ok,true);
}

// v16.5: 초월쿠마 is obtainable at will until the single transcend is spent —
// the '초월 가능' toggle asserts that game rule, so one Kuma is assumed and
// transcend uppers stay comparable in the route choice.  '소진' removes it.
// Other special prerequisites (레일리 등) must still be observed.
{
  const assumed=M.build(input({counts:{[C.WISP_ID]:0},settings:{superKumaOwned:true}}));
  assert.strictEqual(assumed.effective.counts[C.SUPER_KUMA_ID]||0,1,'transcend availability must assume one Kuma');
  assert(assumed.patch.assumptions.some(row=>row.kind==='transcend-available'),'the assumed Kuma must be a recorded assumption');
  assert.strictEqual(L.quote(assumed,transcend,assumed.effective.counts).prerequisite.allowed,true);
  const spent=M.build(input({counts:{[C.SUPER_KUMA_ID]:1,[C.WISP_ID]:0},settings:{superKumaOwned:false}}));
  assert.strictEqual(spent.effective.counts[C.SUPER_KUMA_ID]||0,0,'spent transcend must remove the Kuma');
  const blocked=L.quote(spent,transcend,spent.effective.counts);
  assert.strictEqual(blocked.feasible,false);
  assert(blocked.blocked.some(reason=>/초월쿠마 필요/.test(reason)),blocked.blocked);
}

// Policy never upgrades a structural role sheet into a measured clear claim.
{
  const model=M.build(input({counts:{[legendA.id]:1,[upperA.id]:1,[C.WISP_ID]:0},settings:{currentRound:50}}));
  const assessment=P.evaluate(model,model.effective.counts,P.ROUTES.physical,{round:50,locks:[{stage:'upper',id:upperA.id}]});
  assert.notStrictEqual(assessment.status,'verified');
  assert.strictEqual(assessment.evidence.combat,'unmeasured');
  assert(assessment.unknowns.some(text=>/보스 DPS/.test(text)));
}

console.log('PASS v15 model keeps observed evidence separate from scenario patches');
console.log('PASS v15 exact ledger blocks unproved leaves and preserves Absalom exception');
console.log('PASS v15 single authority handles first/additional completion milestones');
console.log('PASS v15 policy never claims unmeasured combat verification');
