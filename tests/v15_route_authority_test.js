'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js'])require(path.join(EXT,file));

const C=global.ORDCore,M=global.ORDV15Model,L=global.ORDV15Ledger,P=global.ORDV15Policy,E=global.ORDV15Engine;
const wisp={id:C.WISP_ID,name:'선택위습',groupName:'특수재료',abilities:{},stuffs:[]};
const common={id:'route-common',name:'흔함',groupName:'흔함',abilities:{},stuffs:[]};
const uncommon={id:'route-uncommon',name:'안흔함',groupName:'안흔함',abilities:{},stuffs:[{id:common.id,count:1}]};
const special={id:'route-special',name:'특별함',groupName:'특별함',abilities:{},stuffs:[{id:uncommon.id,count:1}]};
const rareA={id:'route-rare-a',name:'희귀 A',groupName:'희귀함',abilities:{},stuffs:[{id:special.id,count:1}]};
const rareB={id:'route-rare-b',name:'희귀 B',groupName:'희귀함',abilities:{},stuffs:[{id:special.id,count:1}]};
const ownedLegend={id:'route-owned-legend',name:'보유 전설',groupName:'전설 [물딜]',abilities:{'방어력 감소':20},stuffs:[{id:rareB.id,count:1}]};
const upperRareHeavy={id:'route-upper-heavy',name:'희귀 소모 상위',groupName:'제한됨 [물딜]',abilities:{'방어력 감소':50},stuffs:[{id:rareA.id,count:2},{id:special.id,count:1},{id:uncommon.id,count:1},{id:C.WISP_ID,count:1}]};
const upperRareLight={id:'route-upper-light',name:'저소모 상위',groupName:'제한됨 [물딜]',abilities:{'이동속도 감소':40},stuffs:[{id:rareB.id,count:1}]};
const rayleigh={id:'unit_1767884906256_4990',name:'레일리(히든)',groupName:'특수재료',abilities:{},stuffs:[]};
const upperHard={id:'route-upper-hard',name:'레일리 필요 상위',groupName:'제한됨 [물딜]',abilities:{'스턴':1},stuffs:[{id:rayleigh.id,count:1}]};
const magicUpper={id:'route-magic-upper',name:'감지 마딜 상위',groupName:'제한됨 [마딜]',abilities:{'끝딜':1},stuffs:[{id:rareB.id,count:1}]};
const extras=Array.from({length:6},(_,index)=>({id:`route-upper-extra-${index}`,name:`후보 ${index}`,groupName:'제한됨 [물딜]',abilities:{},stuffs:[{id:C.WISP_ID,count:index+2}]}));
const catalog=[wisp,common,uncommon,special,rareA,rareB,ownedLegend,upperRareHeavy,upperRareLight,upperHard,magicUpper,rayleigh].concat(extras);

function input({counts={},percent={},settings={},locks=[]}={}){
  const units=catalog.map(unit=>Object.assign({},unit,{count:Number(counts[unit.id]||0),tmoPercent:Number(percent[unit.id]||0)}));
  return{catalog,snapshot:{source:'route-fixture',sessionId:'route-authority',seq:1,at:1,dataChangedAt:1,wispCountFound:true,wispCount:Number(counts[C.WISP_ID]||0),counts:Object.assign({},counts),currentAbilities:{},units},settings:Object.assign({currentRound:25,mode:'physical',magicRoute:'auto',postLegendRoute:'upper',manualCounts:{},superKumaOwned:false,wispOverride:'',virtualSpecialId:'',gorosei:'none'},settings),locks};
}

// The v15 authority ranks only the current exact ledger, caps the board at six,
// and treats Rare -> Special -> Uncommon burn before completion percentage.
{
  const decision=E.decide(input({counts:{[ownedLegend.id]:1,[rareA.id]:2,[rareB.id]:2,[special.id]:1,[uncommon.id]:1,[C.WISP_ID]:10},percent:{[upperRareHeavy.id]:45,[upperRareLight.id]:99,[upperHard.id]:100}}));
  assert.strictEqual(decision.state,'ROUTE_CHOICE');
  assert(decision.routeCandidates.length<=6);
  assert.strictEqual(decision.routeCandidates[0].id,upperRareHeavy.id,decision.routeCandidates.map(row=>[row.id,row.rankVector]));
  assert.strictEqual(decision.routeCandidates[0].tiers.rare,2);
  assert.strictEqual(decision.routeCandidates[0].tiers.special,1);
  assert.strictEqual(decision.routeCandidates[0].tiers.uncommon,1);
  assert.strictEqual(decision.routeCandidates[0].wispCost,1);
  // v17.5: 레일리(히든)만 막힌 상위는 스토리 10 보상 수령 전제로 후보에
  // 남을 수 있다 — 단 storyReward 표시가 붙고 지금 제작 가능이 아니어야
  // 하며, 다른 보상을 선언하면 예전처럼 완전히 제외된다.
  const hardRow=decision.routeCandidates.find(row=>row.id===upperHard.id);
  if(hardRow){
    assert.strictEqual(hardRow.storyReward,true,'Rayleigh-gated upper must be flagged as story-reward-planned');
    assert.strictEqual(hardRow.feasible,false,'story-reward-planned upper must not claim buildable-now');
  }
  const declined=E.decide(input({counts:{[ownedLegend.id]:1,[rareA.id]:2,[rareB.id]:2,[special.id]:1,[uncommon.id]:1,[C.WISP_ID]:10},percent:{[upperRareHeavy.id]:45,[upperRareLight.id]:99,[upperHard.id]:100},settings:{story10Reward:'kuma'}}));
  assert(!declined.routeCandidates.some(row=>row.id===upperHard.id),'missing Rayleigh prerequisite leaked after declaring another story-10 reward');
  assert.strictEqual(decision.evidence.fixedFinalParty,false);
}

// A locked magic upper with an unresolved route may only choose the detail
// route. It must never be replaced by another upper candidate.
{
  const locks=[{stage:'upper',id:magicUpper.id,source:'tmo',sticky:true}],decision=E.decide(input({counts:{[ownedLegend.id]:1,[magicUpper.id]:1,[C.WISP_ID]:5},settings:{mode:'magic',magicRoute:'auto'},locks}));
  assert.strictEqual(decision.state,'ROUTE_CHOICE');
  assert.strictEqual(decision.routeChoiceKind,'locked-magic-detail');
  assert.deepStrictEqual(new Set(decision.routeCandidates.map(row=>row.routeKey)),new Set(['dual','singleEnd']));
  assert(decision.routeCandidates.every(row=>row.id===magicUpper.id&&row.keepUpper&&row.locked));
}

// Once the user commits an unfinished upper, it is the only crafting
// authority.  Its material cards cannot silently become reroll or support
// legend stock while the upper is waiting for wisps.
{
  const locks=[{stage:'upper',id:upperRareHeavy.id,source:'v15-exact-route',sticky:true}],waiting=E.decide(input({counts:{[ownedLegend.id]:1,[rareA.id]:2,[special.id]:1,[uncommon.id]:1,[C.WISP_ID]:0},settings:{mode:'physical',magicRoute:'physical'},locks}));
  assert.strictEqual(waiting.state,'PREPARE');
  assert.strictEqual(waiting.action,null);
  assert.strictEqual(waiting.blockedAction.id,upperRareHeavy.id);
  assert(waiting.rare.rows.every(row=>row.reroll===0&&row.use===0&&row.hold===row.initial));

  const ready=E.decide(input({counts:{[ownedLegend.id]:1,[rareA.id]:2,[special.id]:1,[uncommon.id]:1,[C.WISP_ID]:5},settings:{mode:'physical',magicRoute:'physical'},locks}));
  assert.strictEqual(ready.state,'ACT_NOW');
  assert.strictEqual(ready.action.id,upperRareHeavy.id);
  assert(ready.rare.rows.find(row=>row.id===rareA.id).use>0);
}

// Completion-only milestones also expose the real rare ledger instead of an
// empty right rail.
{
  const decision=E.decide(input({counts:{[rareA.id]:1,[rareB.id]:1,[C.WISP_ID]:3},percent:{[ownedLegend.id]:90}}));
  assert.strictEqual(decision.state,'ACT_NOW');
  assert.strictEqual(decision.action.id,ownedLegend.id);
  assert.strictEqual(decision.rare.rows.reduce((total,row)=>total+row.initial,0),2);
  assert.strictEqual(decision.rare.rows.find(row=>row.id===rareB.id).use,1);
  assert.strictEqual(decision.rare.rows.find(row=>row.id===rareA.id).hold,1);
}

// V15 owns the ancestor/warped rule independently of the legacy planner. An
// upgrade that consumes its ancestor is allowed; rebuilding that ancestor next
// to the warped descendant is rejected by the action expansion itself.
{
  const realCatalog=global.ORD_TMO_UNITS,db=C.buildDb(realCatalog),ace=db.byId.get('O20h'),warped=db.byId.get('unit_1779015467592_9245');
  assert(ace&&warped);
  const fakeModel={knowledge:{db},effective:{counts:{},percent:{}},round:{value:50},settings:{mode:'physical',magicRoute:'physical'},intent:{damageMode:'physical',magicRoute:'undecided'}};
  assert.strictEqual(E._test.introducesLineageConflict(fakeModel,[ace],[warped]),false);
  assert.strictEqual(E._test.introducesLineageConflict(fakeModel,[warped],[warped,ace]),true);

  const abundant={[warped.id]:1,[C.WISP_ID]:100};for(const unit of realCatalog)if(C.isCommon(unit)||C.isUncommon(unit)||C.isSpecialTier(unit)||C.isRare(unit))abundant[unit.id]=10;
  const routeInput={catalog:realCatalog,snapshot:{source:'lineage',sessionId:'lineage',seq:1,at:1,dataChangedAt:1,wispCountFound:true,wispCount:100,counts:abundant,currentAbilities:{},units:[]},settings:{currentRound:50,mode:'physical',magicRoute:'auto',postLegendRoute:'upper',manualCounts:{},superKumaOwned:true,wispOverride:'',virtualSpecialId:'',gorosei:'none'},locks:[]},model=M.build(routeInput),quote=L.quote(model,ace,model.effective.counts,{availableRound:50});
  assert.strictEqual(quote.feasible,true,quote.blocked);
  const initial=P.evaluate(model,model.effective.counts,P.ROUTES.physical,{round:50,locks:[]}),node={counts:model.effective.counts,assessment:initial,sequence:[]};
  assert.strictEqual(E._test.expand(model,node,{unit:ace},P.ROUTES.physical,[],initial),null,'action search rebuilt Ace beside warped Ace');
}

console.log('PASS v15 route authority uses exact high-tier ledger and six-candidate cap');
console.log('PASS locked magic upper only selects dual/singleEnd detail route');
console.log('PASS unfinished upper lock owns crafting authority and rare reservation');
console.log('PASS completion milestones expose an exclusive rare ledger');
console.log('PASS v15 action search rejects ancestor + warped coexistence');
