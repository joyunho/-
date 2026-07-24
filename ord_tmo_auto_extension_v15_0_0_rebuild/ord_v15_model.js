(function(root,factory){
'use strict';
const api=factory(root&&root.ORDCore);
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDV15Model=api;
})(typeof window!=='undefined'?window:globalThis,function(C){
'use strict';

const VERSION='17.10.0';
const HAND_TIERS=['rare','special','uncommon','common'];

function num(value){return C&&C.num?C.num(value):(Number(value)||0);}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clone(map){return Object.assign({},map||{});}
function cloneCounts(map){const out={};for(const [id,value] of Object.entries(map||{}))out[id]=Math.max(0,Math.floor(num(value)));return out;}
function stablePairs(map){return Object.entries(map||{}).filter(([,value])=>num(value)!==0).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));}
function digestText(value){
  const text=String(value||'');let hash=2166136261;
  for(let index=0;index<text.length;index++){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return(hash>>>0).toString(16).padStart(8,'0');
}
function copyCountsFromSnapshot(units,snapshot){
  const counts=cloneCounts(snapshot&&snapshot.counts);
  for(const unit of units||[])if(unit&&unit.id&&unit.count!=null&&!Object.prototype.hasOwnProperty.call(counts,unit.id))counts[unit.id]=Math.max(0,num(unit.count));
  if(snapshot&&snapshot.wispCountFound===true&&snapshot.wispCount!=null)counts[C.WISP_ID]=Math.max(0,num(snapshot.wispCount));
  return counts;
}
function currentAbilities(snapshot){
  const out={};
  for(const [key,value] of Object.entries(snapshot&&snapshot.currentAbilities||{}))out[C.canonicalAbility?C.canonicalAbility(key):key]=num(value);
  return out;
}
function completionMap(units){const out={};for(const unit of units||[])out[unit.id]=clamp(num(unit.tmoPercent!=null?unit.tmoPercent:unit.percent),0,100);return out;}
function completionDetail(original,raw,context){
  const projected=!!(raw&&raw.projected),predicted=projected?num(raw.expected):num(original),delta=projected?num(raw.delta):0;
  return Object.assign({
    originalTmoPercent:clamp(num(original),0,100),predictedTmoPercent:clamp(predicted,0,100),rankingPercent:clamp(predicted,0,100),delta,
    isProjected:projected,estimated:projected,sourceOriginal:'tmo-live',sourcePrediction:projected?'local-recipe-counterfactual':'none',
    virtualSpecialId:String(context&&context.virtualId||''),virtualApplied:!!(context&&context.virtualApplied),alreadyObserved:!!(context&&context.alreadyObserved)
  },raw||{});
}
function completionDetails(db,units,observedPercent,beforeCounts,afterCounts,context){
  const out={},virtualId=String(context&&context.virtualId||''),virtualApplied=!!(context&&context.virtualApplied),alreadyObserved=!!(context&&context.alreadyObserved);
  for(const unit of units||[]){
    const original=clamp(num(observedPercent&&observedPercent[unit.id]),0,100);let raw=null;
    if(C.isRare(unit)&&virtualApplied&&typeof C.predictCompletionWithAddedMaterial==='function')raw=C.predictCompletionWithAddedMaterial(db,unit.id,beforeCounts,afterCounts,original,virtualId);
    if(!raw){const reason=virtualId?(alreadyObserved?'actual-special-already-observed':'virtual-special-not-injected'):'no-virtual-special-selected';raw={observed:original,expected:original,display:Math.floor(original),delta:0,projected:false,estimated:false,method:'observed-tmo',reason};}
    out[unit.id]=completionDetail(original,raw,{virtualId,virtualApplied,alreadyObserved});
  }
  return out;
}
function applyScenarioPatch(observed,settings){
  const counts=cloneCounts(observed.counts),assumptions=[],manual=clone(settings&&settings.manualCounts);
  for(const [id,value] of Object.entries(manual)){
    if(value===''||value==null)continue;
    const before=num(counts[id]),after=Math.max(0,num(value));counts[id]=after;
    if(before!==after)assumptions.push({kind:'manual-count',id,before,after,evidence:'user'});
  }
  // v17.6(감사 P0-2): 152킬 보상 자격 풀(특별함 33종 중 압살롬 제외
  // 32종) 밖의 ID는 무시하고 가정 목록에 거부 사실을 남긴다.
  const requestedVirtualId=String(settings&&settings.virtualSpecialId||'');
  const virtualEligible=!requestedVirtualId||!C.eligible152SpecialId||C.eligible152SpecialId(observed.db,requestedVirtualId);
  const virtualId=virtualEligible?requestedVirtualId:'';
  if(requestedVirtualId&&!virtualEligible)assumptions.push({kind:'virtual-152-special-rejected',id:requestedVirtualId,before:0,after:0,evidence:'ineligible-pool'});
  const baselineId=String(settings&&settings.virtualSpecialBaselineId||''),baselineCaptured=!!virtualId&&baselineId===virtualId&&Object.prototype.hasOwnProperty.call(settings||{},'virtualSpecialBaselineCount'),virtualBaselineCount=baselineCaptured?Math.max(0,Math.floor(num(settings.virtualSpecialBaselineCount))):0,observedVirtualCount=num(observed.counts[virtualId]),alreadyObserved=!!virtualId&&(baselineCaptured?observedVirtualCount>virtualBaselineCount:observedVirtualCount>0);let virtualApplied=false;
  if(virtualId&&!alreadyObserved){const before=num(counts[virtualId]),after=before+1;counts[virtualId]=after;virtualApplied=true;assumptions.push({kind:'virtual-152-special',id:virtualId,before,after,evidence:'user',baseline:virtualBaselineCount});}
  // v16.5: 초월쿠마 is obtainable at will until the one transcend is spent —
  // that is the game rule the '초월 가능/소진' toggle expresses.  Assume one
  // Kuma while transcend is available so transcend uppers stay comparable in
  // the route choice; '소진' removes it.  Other special prerequisites
  // (레일리·해적선 등) must still be observed in the TMO hand.
  if(settings&&settings.superKumaOwned===false){if(num(counts[C.SUPER_KUMA_ID])>0){const before=num(counts[C.SUPER_KUMA_ID]);counts[C.SUPER_KUMA_ID]=0;assumptions.push({kind:'transcend-unavailable',id:C.SUPER_KUMA_ID,before,after:0,evidence:'user-setting'});}}
  else if(num(counts[C.SUPER_KUMA_ID])<=0){counts[C.SUPER_KUMA_ID]=1;assumptions.push({kind:'transcend-available',id:C.SUPER_KUMA_ID,before:0,after:1,evidence:'game-rule-until-spent'});}
  if(settings&&settings.wispOverride!==''&&settings&&settings.wispOverride!=null){const before=num(counts[C.WISP_ID]),after=Math.max(0,num(settings.wispOverride));counts[C.WISP_ID]=after;if(before!==after)assumptions.push({kind:'wisp-override',id:C.WISP_ID,before,after,evidence:'user'});}
  return{counts,assumptions,virtualId,virtualApplied,alreadyObserved,baselineId:baselineCaptured?baselineId:'',baselineCount:virtualBaselineCount,baselineCaptured,observedVirtualCount};
}
function build(input){
  if(!C||typeof C.mergeLiveCatalog!=='function'||typeof C.buildDb!=='function')throw new Error('ORDV15Model requires ORDCore to be loaded first.');
  input=input||{};const settings=clone(input.settings),snapshot=input.snapshot||{},catalog=input.catalog||[],units=C.mergeLiveCatalog(catalog,snapshot),db=C.buildDb(units),observedCounts=copyCountsFromSnapshot(units,snapshot),observed={kind:'observed',db,units,counts:observedCounts,currentAbilities:currentAbilities(snapshot),percent:completionMap(units),snapshot,wisp:num(observedCounts[C.WISP_ID]),sourceHealth:{source:String(snapshot.source||''),sessionId:String(snapshot.sessionId||''),seq:num(snapshot.seq),observedAt:num(snapshot.at||snapshot.bridgeAt),dataChangedAt:num(snapshot.dataChangedAt),complete:!!(snapshot.collection&&snapshot.collection.found&&snapshot.countDiscovery&&snapshot.countDiscovery.found),wispObserved:snapshot.wispCountFound===true}},patched=applyScenarioPatch(observed,settings),beforeVirtual=cloneCounts(patched.counts);
  if(patched.virtualApplied)beforeVirtual[patched.virtualId]=Math.max(0,num(beforeVirtual[patched.virtualId])-1);
  const completionById=completionDetails(db,units,observed.percent,beforeVirtual,patched.counts,patched),effective={kind:'effective',db,units,rawCounts:observedCounts,counts:patched.counts,currentAbilities:observed.currentAbilities,percent:observed.percent,completionById,wisp:num(patched.counts[C.WISP_ID]),snapshot,virtualId:patched.virtualId,virtualApplied:patched.virtualApplied,virtualResolved:patched.alreadyObserved,virtualSpecialBaselineId:patched.baselineId,virtualSpecialBaselineCount:patched.baselineCount,assumptions:patched.assumptions};
  // Completion and live abilities can change while unit counts stay constant.
  // They must therefore participate in the authority fingerprint; otherwise a
  // cached first-legend decision can survive a newer TMO observation.
  const fingerprint=digestText(JSON.stringify({sessionId:observed.sourceHealth.sessionId,seq:observed.sourceHealth.seq,dataHash:String(snapshot.dataHash||''),dataChangedAt:observed.sourceHealth.dataChangedAt,round:num(settings.currentRound),mode:settings.mode||'',route:settings.magicRoute||'',postLegendRoute:settings.postLegendRoute||'',virtualId:patched.virtualId,virtualApplied:patched.virtualApplied,virtualBaselineId:patched.baselineId,virtualBaselineCount:patched.baselineCount,counts:stablePairs(effective.counts),abilities:stablePairs(effective.currentAbilities),percent:stablePairs(effective.percent),assumptions:effective.assumptions.map(row=>[row.kind,row.id,row.after])}));
  return{version:VERSION,knowledge:{db,units},observed,effective,patch:{manualCounts:clone(settings.manualCounts),virtualSpecialId:patched.virtualId,virtualSpecial:{id:patched.virtualId,selected:!!patched.virtualId,applied:patched.virtualApplied,alreadyObserved:patched.alreadyObserved,resolved:patched.alreadyObserved,baselineId:patched.baselineId,baselineCount:patched.baselineCount,baselineCaptured:patched.baselineCaptured,observedCount:patched.observedVirtualCount},wispOverride:settings.wispOverride,superKumaOwned:settings.superKumaOwned,assumptions:patched.assumptions},intent:{damageMode:['physical','magic'].includes(settings.mode)?settings.mode:'undecided',magicRoute:['dual','singleEnd'].includes(settings.magicRoute)?settings.magicRoute:'undecided',upperPreviewId:String(settings.upperPreviewId||''),gorosei:String(settings.gorosei||'none')},round:{value:Math.max(1,Math.round(num(settings.currentRound)||1)),source:snapshot.autoRound&&snapshot.autoRound.active?'tmo-auto':'timer-or-user',confidence:snapshot.autoRound&&snapshot.autoRound.active?'observed':'estimated'},settings,fingerprint};
}
function completionFor(model,unitOrId){
  const id=String(unitOrId&&unitOrId.id||unitOrId||''),detail=model&&model.effective&&model.effective.completionById&&model.effective.completionById[id];
  if(detail)return detail;const original=clamp(num(model&&model.observed&&model.observed.percent&&model.observed.percent[id]),0,100);return completionDetail(original,null,{virtualId:model&&model.patch&&model.patch.virtualSpecialId});
}
function completionScore(model,unitOrId){return num(completionFor(model,unitOrId).rankingPercent);}
function withCounts(model,counts,options){
  const base=model&&model.effective||model||{},copy=cloneCounts(counts),current=options&&options.keepObservedAbilities?clone(base.currentAbilities):{};
  return Object.assign({},base,{counts:copy,wisp:num(copy[C.WISP_ID]),currentAbilities:current});
}
function durableCounts(model,counts){
  const db=model.knowledge?model.knowledge.db:model.db,out=clone(counts||model.effective&&model.effective.counts||model.counts);
  for(const unit of db.units)if(!C.isLegendish(unit)&&!C.isUpper(unit))out[unit.id]=0;
  return out;
}
function finalEntries(model,counts){
  const db=model.knowledge?model.knowledge.db:model.db,source=counts||model.effective&&model.effective.counts||model.counts,out=[],upperSeen=new Set();
  for(const unit of db.units){let amount=Math.floor(Math.max(0,num(source[unit.id])));if(amount<=0||!C.isLegendish(unit)&&!C.isUpper(unit))continue;if(C.isUpper(unit)){const key=C.canonicalUpperId(unit.id);if(upperSeen.has(key))continue;upperSeen.add(key);amount=1;}for(let index=0;index<amount;index++)out.push(unit);}
  return out;
}
function finalSummary(model,counts){
  const units=finalEntries(model,counts),upperKeys=new Set(units.filter(C.isUpper).map(unit=>C.canonicalUpperId(unit.id))),upperCount=upperKeys.size,nonUpper=units.filter(unit=>!C.isUpper(unit)).length;
  return{units,unitIds:units.map(unit=>unit.id),boardCount:upperCount+nonUpper,upperCount,nonUpperFinalCount:nonUpper,legendEquivalent:upperCount*3+nonUpper};
}
function tierInventory(model,counts){
  const db=model.knowledge?model.knowledge.db:model.db,source=counts||model.effective&&model.effective.counts||model.counts,tiers=Object.fromEntries(HAND_TIERS.map(tier=>[tier,{total:0,types:0,byId:[]}])) ;
  for(const unit of db.units){const tier=C.tierKey(unit);if(!tiers[tier])continue;const count=Math.max(0,num(source[unit.id]));if(count<=0)continue;tiers[tier].total+=count;tiers[tier].types++;tiers[tier].byId.push({id:unit.id,name:C.displayNameOf(unit),count});}
  return tiers;
}
function roleState(model,counts,mode,settings,locks,durable){
  // Both bases stay unit-derived: the engine compares hypothetical boards, and
  // an observed board-level ability total cannot be transferred to a board the
  // player does not have yet.  In-game purchased upgrades are therefore not
  // credited here — a known limitation until a transition-aware spec exists.
  const source=durable?durableCounts(model,counts):clone(counts),state=withCounts(model,source),main=C.mainUpper(state,locks||[],settings||{}),evaluationSettings=Object.assign({},settings||{},main?{_upperUnit:main}:{}),spec=C.currentSpec(state,mode,evaluationSettings),deficits=C.deficits(spec,mode,evaluationSettings);
  return{basis:durable?'durable-final-only':'live-owned',state,mainUpper:main,spec,deficits};
}
function observedEvidence(model){return{snapshot:model.observed.sourceHealth,assumptions:model.patch.assumptions.slice(),round:model.round};}

return{VERSION,HAND_TIERS,build,completionFor,completionScore,withCounts,durableCounts,finalEntries,finalSummary,tierInventory,roleState,observedEvidence,_test:{copyCountsFromSnapshot,applyScenarioPatch,completionDetails,completionDetail,digestText,stablePairs,cloneCounts}};
});

