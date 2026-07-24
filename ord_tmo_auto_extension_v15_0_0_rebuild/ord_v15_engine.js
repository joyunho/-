(function(root,factory){
'use strict';
const api=factory(root&&root.ORDCore,root&&root.ORDV15Model,root&&root.ORDV15Ledger,root&&root.ORDV15Policy);
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDV15Engine=api;
})(typeof window!=='undefined'?window:globalThis,function(C,M,L,P){
'use strict';

const VERSION='17.10.0';
const MAX_CANDIDATES=36;
const BEAM_WIDTH=6;
const HORIZON=2;
const HAND_TIERS=['rare','special','uncommon','common'];
const AUTHORITY='ord-v15-decision-engine';
const ROUTE_CANDIDATE_LIMIT=6;
// Keep room for one best candidate per missing route role.  Filling the whole
// cap with the direct score first made those reserved role candidates no-ops.
const UPPER_PROJECTION_SHORTLIST=5;
const UPPER_PROJECTION_CAP=8;
const SUPPORT_STATIC_PROBE_CAP=30;
const SUPPORT_CANDIDATE_CAP=12;
const SUPPORT_BEAM_WIDTH=3;
const COMPLETION_MILESTONES=Object.freeze({
  firstRare:Object.freeze({key:'firstRare',label:'첫 희귀',dueRound:7}),
  firstFinal:Object.freeze({key:'firstFinal',label:'첫 전설·히든',dueRound:20}),
  additionalFinal:Object.freeze({key:'additionalFinal',label:'추가 전설·히든',dueRound:null})
});
// v16.6: full 재료 보호 (all crafting locked) only inside this wisp band of
// the locked upper's quote; farther out, only the upper's own tree materials
// are reserved and the survival search keeps running.
const UPPER_HOLD_WISP_BAND=4;
const UPPER_HOLD_WISP_RATIO=.15;
const RECIPE_PROFILE_CACHE=new WeakMap();
function num(value){return C&&C.num?C.num(value):(Number(value)||0);}
function round(value,digits=3){const p=Math.pow(10,digits);return Math.round(num(value)*p)/p;}
function clone(map){return Object.assign({},map||{});}
function nameOf(unit){return C.displayNameOf?C.displayNameOf(unit):String(unit&&unit.name||unit&&unit.id||'');}
function tierOf(unit){return C.tierKey(unit);}
function sum(map){return Object.values(map||{}).reduce((total,value)=>total+num(value),0);}
function lockedUpper(locks){return(locks||[]).find(lock=>lock&&lock.stage==='upper')||null;}
function routeFamilyOk(unit,route){if(!unit||!route)return false;const family=C.familyOf(unit);if(C.isUpper(unit))return family===route.mode||family==='neutral';return family===route.mode||family==='neutral'||C.roleContribution(unit,route.mode).utility>0;}
function pseudoUnit(unit){const group=C.groupName(unit),name=nameOf(unit);return /아이템|랜덤|신비/.test(group)||/풀이감|풀방깎/.test(name);}
function finalUnit(unit){return!!unit&&(C.isLegendish(unit)||C.isUpper(unit));}
// v16.1: a pre-game 물딜/마딜 choice restricts completion-phase candidates to
// that family (neutral units always stay).  자동 keeps both families.
// v16.7: 계열 필터 재정의 — 희귀 이하 재료·희귀 후보는 계열을 구분하지
// 않는다.  전설급·상위 후보만 필터를 받고, 자동 모드에서는 첫 전설(보유
// 비상위 전설·히든)이 물딜/마딜 한쪽으로 수렴한 순간부터 그 계열을
// 따른다(중립·혼합 보유면 필터 없음).
function familyIntent(model){
  const mode=model.intent.damageMode;
  if(mode==='physical'||mode==='magic')return mode;
  let physical=0,magic=0;
  for(const unit of model.knowledge.db.legendish){
    if(C.isUpper(unit)||C.isShip(unit)||!/전설|히든/.test(C.groupName(unit)))continue;
    if(num(model.effective.counts[unit.id])<=0)continue;
    const family=C.familyOf(unit);
    if(family==='physical')physical+=1;else if(family==='magic')magic+=1;
  }
  if(physical>0&&magic<=0)return'physical';
  if(magic>0&&physical<=0)return'magic';
  return'';
}
function intentFamilyOk(model,unit){
  if(!unit||!C.isLegendish(unit)&&!C.isUpper(unit))return true;
  const mode=familyIntent(model);
  if(mode!=='physical'&&mode!=='magic')return true;
  return C.familyOf(unit)!==(mode==='physical'?'magic':'physical');
}
function recipeProfile(model,unit){
  const db=model&&model.knowledge&&model.knowledge.db;if(!db||!unit)return{finalAncestors:new Set(),warpedNodes:new Set(),rare:{},special:{},uncommon:{},common:{}};
  let byId=RECIPE_PROFILE_CACHE.get(db);if(!byId){byId=new Map();RECIPE_PROFILE_CACHE.set(db,byId);}if(byId.has(unit.id))return byId.get(unit.id);
  const profile={finalAncestors:new Set(),warpedNodes:new Set(),rare:{},special:{},uncommon:{},common:{}},rootId=unit.id,add=(map,id,value)=>map[id]=num(map[id])+num(value);
  function walk(id,multiplier,path){const current=db.byId.get(id);if(!current||path.has(id))return;const next=new Set(path);next.add(id);if(id!==rootId){if(finalUnit(current))profile.finalAncestors.add(id);if(C.isWarped(current))profile.warpedNodes.add(id);const tier=tierOf(current);if(profile[tier])add(profile[tier],id,multiplier);}for(const stuff of current.stuffs||[])walk(stuff.id,multiplier*num(stuff.count),next);}
  if(C.isWarped(unit))profile.warpedNodes.add(unit.id);walk(unit.id,1,new Set());byId.set(unit.id,profile);return profile;
}
function mapOverlap(left,right){let total=0;for(const id of new Set(Object.keys(left||{}).concat(Object.keys(right||{}))))total+=Math.min(num(left&&left[id]),num(right&&right[id]));return total;}
function pairMaterialOverlap(model,left,right){
  if(!left||!right)return{lineage:false,rare:0,special:0,uncommon:0,common:0,denseRare:false,penalty:0};const a=recipeProfile(model,left),b=recipeProfile(model,right),rare=mapOverlap(a.rare,b.rare),special=mapOverlap(a.special,b.special),uncommon=mapOverlap(a.uncommon,b.uncommon),common=mapOverlap(a.common,b.common),rareBase=Math.max(1,Math.min(sum(a.rare),sum(b.rare))),rareRatio=rare/rareBase,lineage=a.finalAncestors.has(right.id)||b.finalAncestors.has(left.id),denseRare=rare>=2&&rareRatio>=.75;return{lineage,rare,special,uncommon,common,rareRatio:round(rareRatio),denseRare,penalty:round(rare*55+special*9+uncommon*3+common*.18+(denseRare?120:0))};
}
function lineageConflictKeys(model,lineup){const keys=new Set();for(let left=0;left<(lineup||[]).length;left++)for(let right=left+1;right<lineup.length;right++)if(pairMaterialOverlap(model,lineup[left],lineup[right]).lineage)keys.add([lineup[left].id,lineup[right].id].sort().join('|'));return keys;}
function introducesLineageConflict(model,before,after){const prior=lineageConflictKeys(model,before);for(const key of lineageConflictKeys(model,after))if(!prior.has(key))return true;return false;}
function ownedFinals(model,counts){return M.finalEntries(model,counts||model.effective.counts);}
function upperAllowed(model,unit,route,locks,counts){
  if(!C.isUpper(unit))return true;const lock=lockedUpper(locks),owned=new Set(model.knowledge.db.uppers.filter(other=>num(counts[other.id])>0).map(other=>C.canonicalUpperId(other.id))),key=C.canonicalUpperId(unit.id),lockedKey=lock&&C.canonicalUpperId(lock.id),maxUpper=route.key==='dual'?2:1;
  if(owned.has(key)||owned.size>=maxUpper)return false;
  // A confirmed but unfinished upper is a commitment, not a soft score bonus.
  // Until it is actually observed, no other upper may become the authority action.
  if(lockedKey&&!owned.has(lockedKey)&&lockedKey!==key)return false;
  return true;
}
function allCandidates(model,route,locks,counts){return model.knowledge.db.legendish.concat(model.knowledge.db.uppers).filter(unit=>unit&&!pseudoUnit(unit)&&routeFamilyOk(unit,route)&&upperAllowed(model,unit,route,locks,counts));}
// v16: the assessment counts Rare/Special direct combat roles, so the action
// space must be able to close a required gap with a Rare craft too.  The old
// legend-only universe is why every recorded loss ended in a silent HOLD while
// cheap Rare closers existed in the hand.
function combatPowerScore(unit,route){
  const contribution=C.roleContribution(unit,route.mode);
  const common=num(contribution.attack)*1.5+num(contribution.subdamage)*12+num(contribution.boss)*6+num(contribution.frenzy)*6+num(contribution.bossFrenzy)*10;
  if(route.mode==='magic')return round(common+num(contribution.single)*18+num(contribution.end)*18+num(contribution.singleEndExpected)*8+num(contribution.magicSupport)*5+num(contribution.toki)*10);
  // Armor-break and speed are structural support axes. Once their required
  // targets are closed, extra copies are not evidence of more boss damage,
  // so they must not unlock the round-50 firepower exception by themselves.
  return round(common);
}
function boardCombatScore(model,counts,route){
  let score=0;
  for(const unit of model.knowledge.db.units)score+=Math.max(0,num(counts&&counts[unit.id]))*combatPowerScore(unit,route);
  return round(score);
}
function combatRareCandidates(model,route,assessment,counts){
  const open=new Set((assessment&&assessment.requirements||[]).filter(row=>num(row.gap)>0&&!row.waived).map(row=>row.key));
  // v17.6(감사 P0-5): 필수 결손이 전부 닫힌 50라+ 보스 창에서는 보스
  // 화력 축에 기여하는 희귀도 후보 우주에 남긴다 — 아니면 화력 보강
  // 제작이 탐색 자체에 들어오지 못해 영구 HOLD가 된다.
  const keys=open.size?open:model.round.value>=50?new Set(['single','end','singleEndExpected','attack','toki','subdamage','boss','frenzy','bossFrenzy','magicSupport']):null;
  if(!keys||!keys.size)return[];
  return model.knowledge.db.rares.filter(unit=>{
    if(!unit||pseudoUnit(unit))return false;
    const contribution=C.roleContribution(unit,route.mode);
    return[...keys].some(key=>num(contribution[key])>0);
  });
}
function actionUniverse(model,route,locks,assessment,counts){
  const base=allCandidates(model,route,locks,counts),seen=new Set(base.map(unit=>unit.id));
  return base.concat(combatRareCandidates(model,route,assessment,counts).filter(unit=>!seen.has(unit.id)));
}
function relevantKeys(assessment){const keys=new Set();for(const group of assessment.groups||[])for(const row of group.rows||[])if(num(row.gap)>0)keys.add(row.key);return keys;}
function potentialScore(unit,assessment,route,lock){
  const contribution=C.roleContribution(unit,route.mode),keys=relevantKeys(assessment);let score=0,index=0;for(const group of assessment.groups||[]){const weight=Math.max(1,8-index*1.4);for(const row of group.rows||[])if(num(row.gap)>0&&num(contribution[row.key])>0)score+=weight*Math.min(1,num(contribution[row.key])/Math.max(.01,num(row.gap)));index++;}if(C.isUpper(unit)&&lock&&C.canonicalUpperId(lock.id)===C.canonicalUpperId(unit.id))score+=80;if(C.isUpper(unit)&&keys.has('main'))score+=24;return score;
}
function makeRow(model,quote,assessment,reason){
  const unit=quote.unit,story=C.storyGrade(unit),role=C.roleProfile(unit),completion=M.completionFor?M.completionFor(model,unit):null,progress=completion?num(completion.rankingPercent):num(model.effective.percent[unit.id]),rareUse=sum(quote.rareUse),commonTop=C.commonTop(model.knowledge.db,quote.solve.lowestMissing||{},3),blocked=quote.blocked.slice();if(quote.wisp.cost>quote.wisp.before)blocked.push(`선택 위습 ${quote.wisp.cost-quote.wisp.before}개 부족`);
  return{unit,solve:quote.solve,currentSolve:quote.solve,feasible:quote.feasible,blocked:[...new Set(blocked)],availableWisp:quote.wisp.before,wispGap:Math.max(0,quote.wisp.cost-quote.wisp.before),wispBreakdown:{current:quote.wisp.cost,planned:quote.wisp.cost,available:quote.wisp.before,gap:Math.max(0,quote.wisp.cost-quote.wisp.before),basis:'v15-exact-ledger'},progress,progressOriginal:completion?num(completion.originalTmoPercent):progress,progressPredicted:completion?num(completion.predictedTmoPercent):progress,completionProjection:completion,role,story,rareUse,rareSpend:{total:rareUse,byId:Object.entries(quote.rareUse||{}).map(([id,use])=>({id,name:C.materialName(model.knowledge.db,id),use,num:use}))},commonTop,why:{headline:reason||'현재 패의 정확한 순차 원장으로 계산했습니다.',approved:quote.feasible},v15Quote:quote,v15Assessment:assessment};
}
function completionMilestone(value){
  if(value&&typeof value==='object')return{key:String(value.key||''),label:String(value.label||''),dueRound:Number.isFinite(value.dueRound)?num(value.dueRound):null};
  if(COMPLETION_MILESTONES[value])return COMPLETION_MILESTONES[value];
  const label=String(value||'');
  if(label==='첫 희귀')return COMPLETION_MILESTONES.firstRare;
  if(label==='첫 전설·히든')return COMPLETION_MILESTONES.firstFinal;
  return{key:'custom',label,dueRound:null};
}
function completionDecision(model,units,milestone){
  const milestoneSpec=completionMilestone(milestone),label=milestoneSpec.label;
  // v16.7: 같은 완성도·같은 선위 소모라면 스토리 파괴 속도(스토리 등급
  // 점수)가 빠른 쪽을 먼저 설계한다 — 첫 희귀·첫 전설 공통.
  const quoted=units.map(unit=>{const completion=M.completionFor?M.completionFor(model,unit):null;return{unit,quote:L.quote(model,unit,model.effective.counts,{availableRound:model.round.value}),completion:completion?num(completion.rankingPercent):num(model.effective.percent[unit.id]),completionDetail:completion,story:num(C.storyGrade(unit).score)};}).filter(item=>num(model.effective.counts[item.unit.id])<=0&&item.quote.prerequisite.allowed&&!item.quote.blocked.some(reason=>/조합 근거 부족|레시피 순환/.test(reason))).sort((a,b)=>b.completion-a.completion||Number(b.quote.feasible)-Number(a.quote.feasible)||a.quote.wisp.cost-b.quote.wisp.cost||b.story-a.story||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));
  let best=quoted[0],deadlineEscape=null;
  // v17.6(감사 P0-6): 완성도 1순위가 지금 제작 불가인 채 하드 마감(첫
  // 희귀 7라 · 첫 전설 20라)에 도달하면, 즉시 제작 가능한 차선으로
  // 전환한다.  마감 전에는 기존 원칙(TMO 최고 완성도 우선) 유지.
  const dueRound=milestoneSpec.dueRound;
  if(best&&!best.quote.feasible&&Number.isFinite(dueRound)&&model.round.value>=dueRound){
    const feasibleBest=quoted.find(item=>item.quote.feasible);
    if(feasibleBest){deadlineEscape={passedName:nameOf(best.unit),passedCompletion:round(best.completion,1),dueRound};best=feasibleBest;}
  }
  if(!best)return{version:VERSION,state:'HOLD',authority:true,label:`${label} 후보 없음`,reason:'특수 선행재료가 없거나 조합 데이터를 확인할 수 없습니다.',action:null,alternatives:[],unknowns:[]};
  const projected=!!(best.completionDetail&&best.completionDetail.isProjected),escapeNote=deadlineEscape?`${deadlineEscape.dueRound}라 마감 도달 — 완성도 1순위 ${deadlineEscape.passedName}(${deadlineEscape.passedCompletion}%)는 지금 제작 불가라 즉시 제작 가능한 후보로 전환했습니다(계속 기다리려면 그쪽 재료를 수동으로 모으세요). `:'',completionReason=`${escapeNote}${projected?`${label} 후보는 152킬 특별함 포함 예상 TMO 완성도 ${round(best.completion,1)}%로 가장 가깝습니다. 원 TMO ${round(best.completionDetail.originalTmoPercent,1)}%에서 레시피 환산 +${round(best.completionDetail.delta,1)}%p입니다.`:`${label} 후보는 원 TMO 완성도 ${round(best.completion,1)}%${deadlineEscape?'로 즉시 제작 가능합니다':'로 가장 가깝습니다'}.`}`,row=makeRow(model,best.quote,null,completionReason),state=best.quote.feasible?'ACT_NOW':'PREPARE';
  const candidate={id:best.unit.id,name:nameOf(best.unit),unit:best.unit,row,quote:best.quote,completion:best.completionDetail,wispCost:best.quote.wisp.cost,wispAfter:best.quote.wisp.after,result:'completion-rule',stopCondition:`선택 위습이 ${best.quote.wisp.cost}개보다 적거나 패가 바뀌면 만들지 말고 다시 동기화`};
  return{version:VERSION,state,authority:true,label:state==='ACT_NOW'?`${label} 제작`:`${label} 재료 준비`,reason:row.why.headline,action:state==='ACT_NOW'?candidate:null,blockedAction:state==='ACT_NOW'?null:candidate,rare:rareLedgerForQuote(model,best.quote,state,label),alternatives:quoted.filter(item=>item.unit.id!==best.unit.id).slice(0,2).map(item=>({id:item.unit.id,name:nameOf(item.unit),wispCost:item.quote.wisp.cost,completion:item.completionDetail,reason:item.completionDetail&&item.completionDetail.isProjected?`예상 TMO ${round(item.completion,1)}% · 원본 ${round(item.completionDetail.originalTmoPercent,1)}%`:`원 TMO ${round(item.completion,1)}%` })),unknowns:[],evidence:{ledger:'exact-sequential',completionRule:true,completionMilestone:milestoneSpec.key,completionBasis:projected?'observed-tmo-plus-recipe-counterfactual':'observed-tmo',virtualSpecialProjected:projected,deadlineEscape:deadlineEscape?{dueRound:deadlineEscape.dueRound,passed:deadlineEscape.passedName}:null,futureDropsCredited:false,clearClaim:false}};
}
function rareLedgerForQuote(model,quote,state,label){
  const rows=[];for(const unit of model.knowledge.db.rares){const initial=Math.max(0,num(model.effective.counts[unit.id]));if(initial<=0)continue;const planned=Math.min(initial,num(quote&&quote.rareUse&&quote.rareUse[unit.id])),use=state==='ACT_NOW'?planned:0,hold=initial-use,reason=use?`${label} 즉시 재료`:planned?`${label} 제작 재료 보호`:`${label} 확정 전 안전 보류`;rows.push({id:unit.id,name:nameOf(unit),unit,initial,use,hold,reroll:0,reason,proof:{planned,use,exclusive:use+hold===initial}});}
  return{basis:'exact-quote-no-reroll-before-milestone',rows,use:rows.filter(row=>row.use>0),hold:rows.filter(row=>row.hold>0),reroll:[],safeReroll:null,conflict:rows.some(row=>!row.proof.exclusive)};
}
function committedUpperDecision(model,route,locks,lock){
  const lockKey=C.canonicalUpperId(lock.id),unit=model.knowledge.db.byId.get(lock.id)||model.knowledge.db.uppers.find(row=>C.canonicalUpperId(row.id)===lockKey);if(!unit)return null;
  const quote=L.quote(model,unit,model.effective.counts,{availableRound:model.round.value}),before=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks}),after=quote.feasible?P.evaluate(model,quote.after,route,{round:model.round.value,locks}):before,state=quote.feasible?'ACT_NOW':'PREPARE',deltas=quote.feasible?requirementDeltas(before,after):[],
  // v17.5: 레일리(히든)·해적선 차단은 재료 문제가 아니라 스토리 10 보상
  // 미수령이다 — 보호 문구 대신 수령 안내를 앞세운다.
  storyBlocked=!quote.feasible&&quote.blocked.some(text=>/레일리|해적선/.test(String(text)))&&story10RewardOpen(model),
  reason=quote.feasible?`확정한 메인 상위 ${nameOf(unit)}를 먼저 완성합니다. 다른 제작으로 예약 재료를 소비하지 않습니다.`:`${storyBlocked?`스토리 10라운드 보상에서 레일리(히든)+해적선을 선택하면 ${nameOf(unit)} 경로가 열립니다(${C.STORY10_FORFEITS} 포기). `:''}확정한 메인 상위 ${nameOf(unit)}의 재료와 선택 위습을 보호합니다. 완성 전에는 다른 제작과 희귀 리롤을 잠급니다.${quote.blocked.length?` · 차단: ${quote.blocked.join(' · ')}`:''}`,row=makeRow(model,quote,after,reason),candidate={id:unit.id,name:nameOf(unit),unit,row,quote,wispCost:num(quote.wisp.cost),wispAfter:quote.feasible?num(quote.wisp.after):null,result:'committed-upper-first',reason,deltas,stopCondition:`표시 재료가 하나라도 바뀌거나 선택 위습이 ${num(quote.wisp.cost)}개 미만이면 만들지 말고 다시 동기화`,path:quote.feasible?[{id:unit.id,name:nameOf(unit),wispCost:num(quote.wisp.cost)}]:[]};
  return{state,label:quote.feasible?'확정 상위 지금 제작':'확정 상위 재료 보호',reason,action:quote.feasible?candidate:null,blockedAction:quote.feasible?null:candidate,assessment:before,afterAction:after,bestPath:quote.feasible?{steps:candidate.path,assessment:after,remainingWisp:num(quote.wisp.after),deadEnds:[]}:null,rare:rareLedgerForQuote(model,quote,state,`확정 상위 ${nameOf(unit)}`),alternatives:[],unknowns:before.unknowns||[],search:{candidateCount:1,pathCount:quote.feasible?1:0,horizon:0,beamWidth:0,committedUpper:true},evidence:{observed:M.observedEvidence(model),ledger:'exact-current-stock',lockedUpper:unit.id,upperFirst:true,futureDropsCredited:false,clearClaim:false}};
}
function resourceTotals(sequence){const tiers=Object.fromEntries(HAND_TIERS.map(tier=>[tier,0]));let wisp=0;for(const step of sequence||[]){wisp+=num(step.quote.wisp.cost);for(const tier of HAND_TIERS)tiers[tier]+=num(step.quote.tiers.totals[tier]);}return{tiers,wisp};}
function groupImprovement(before,after,index){const left=before.groups&&before.groups[index],right=after.groups&&after.groups[index];if(!left||!right)return false;return right.missed<left.missed||right.missed===left.missed&&right.debt+1e-9<left.debt;}
function futureCoverage(model,node,route,locks,candidateUnits){
  const due=node.assessment.checkpoint.dueRound,unresolved=(node.assessment.groups||[]).filter(group=>!group.pass),unresolvedKeys=new Set(unresolved.flatMap(group=>group.keys||[])),covered=new Set(),affordable=[];
  if(!unresolved.length)return{unresolved:[],covered:[],deadEnds:[],affordableCount:0,examples:[]};
  for(const unit of candidateUnits||[]){const contribution=C.roleContribution(unit,route.mode);if(![...unresolvedKeys].some(key=>num(contribution[key])>0))continue;const q=L.quote(model,unit,node.counts,{availableRound:due});if(!q.feasible||introducesLineageConflict(model,ownedFinals(model,node.counts),ownedFinals(model,q.after)))continue;const after=P.evaluate(model,q.after,route,{round:due,locks});let improved=false;for(const group of unresolved)if(groupImprovement(node.assessment,after,group.index)){covered.add(group.index);improved=true;}if(improved)affordable.push({id:unit.id,name:nameOf(unit),wispCost:q.wisp.cost});if(covered.size>=unresolved.length)break;}
  return{unresolved:unresolved.map(group=>group.index),covered:[...covered],deadEnds:unresolved.filter(group=>!covered.has(group.index)).map(group=>({index:group.index,label:group.label})),affordableCount:affordable.length,examples:affordable.slice(0,6)};
}
function nodeBase(model,counts,route,locks,initial,sequence){const assessment=P.evaluate(model,counts,route,{round:model.round.value,locks}),resources=resourceTotals(sequence),story=(sequence||[]).reduce((total,step)=>total+num(C.storyGrade(step.quote.unit).score),0),completion=(sequence||[]).reduce((total,step)=>total+num(model.effective.percent[step.quote.unit.id]),0),combat=(sequence||[]).reduce((total,step)=>total+combatPowerScore(step.quote.unit,route),0),regression=P.compareVector(assessment.checkpointVector,initial.checkpointVector)>0?1:0;return{counts,assessment,sequence:sequence||[],resources,story,completion,combat,regression,coverage:null,rankVector:[]};}
function nodeRank(model,node,initial){
  const coverage=node.coverage||{deadEnds:[],affordableCount:0},remainingWisp=num(node.counts[C.WISP_ID]),unresolved=(node.assessment.groups||[]).filter(group=>!group.pass).length,reserveTarget=Math.min(num(model.effective.counts[C.WISP_ID]),Math.max(2,unresolved*2)),reserveGap=Math.max(0,reserveTarget-remainingWisp),tier=node.resources.tiers,checkpoint=(node.assessment.checkpointVector||[]).slice(),rareExcess=checkpoint.length?checkpoint.pop():0;
  node.reserve={target:reserveTarget,remaining:remainingWisp,gap:reserveGap};node.rankVector=[node.regression].concat(checkpoint,[coverage.deadEnds.length],node.assessment.fullVector,[reserveGap,-num(node.combat),rareExcess,-num(tier.rare),-num(tier.special),-num(tier.uncommon),-num(tier.common),num(node.resources.wisp),-coverage.affordableCount,-node.story,-node.completion]);return node.rankVector;
}
function compareNodes(a,b){const vector=P.compareVector(a.rankVector,b.rankVector);if(vector)return vector;const aid=(a.sequence||[]).map(step=>step.quote.targetId).join('|'),bid=(b.sequence||[]).map(step=>step.quote.targetId).join('|');return aid.localeCompare(bid);}
function candidatePool(model,route,locks,assessment,counts,availableRound,restrictedUnits){
  // After the first expansion no new stock appears: every later quote can
  // only consume the already proven stock.  Re-ranking the bounded first-step
  // universe is therefore sufficient and avoids walking the full TMO catalog
  // once for every beam node while the game is running.
  const lock=lockedUpper(locks),rows=[],source=restrictedUnits||allCandidates(model,route,locks,counts),beforeLineup=ownedFinals(model,counts);for(const unit of source){const quote=L.quote(model,unit,counts,{availableRound:availableRound||model.round.value}),potential=potentialScore(unit,assessment,route,lock),combat=combatPowerScore(unit,route);if(quote.feasible&&introducesLineageConflict(model,beforeLineup,ownedFinals(model,quote.after)))continue;if(!quote.feasible&&potential<=0&&combat<=0)continue;rows.push({unit,quote,potential,combat,completion:num(model.effective.percent[unit.id])});}
  rows.sort((a,b)=>Number(b.quote.feasible)-Number(a.quote.feasible)||b.potential-a.potential||b.combat-a.combat||a.quote.wisp.cost-b.quote.wisp.cost||b.completion-a.completion||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));const picked=rows.slice(0,MAX_CANDIDATES),seen=new Set(picked.map(row=>row.unit.id));
  for(const group of assessment.groups||[])for(const key of group.keys){const best=rows.filter(row=>num(C.roleContribution(row.unit,route.mode)[key])>0).sort((a,b)=>Number(b.quote.feasible)-Number(a.quote.feasible)||a.quote.wisp.cost-b.quote.wisp.cost||b.potential-a.potential)[0];if(best&&!seen.has(best.unit.id)){seen.add(best.unit.id);picked.push(best);}}
  return picked;
}
// v16: the wisp reservation is no longer a physical-mode round-40 special
// case.  For every route, every open required role keeps its cheapest current
// closer craftable: any feasible candidate whose aftermath would starve one of
// those closers is removed from the pool before ranking.
function protectCriticalBudget(model,route,locks,assessment,rows,counts){
  const source=rows||[],none={applied:false,reason:'',criticalIds:[],rows:source};
  const open=(assessment.requirements||[]).filter(row=>num(row.gap)>0&&!row.waived);
  if(!open.length)return none;
  const closers=new Map();
  for(const req of open){
    const best=source.filter(row=>row.quote.feasible&&num(C.roleContribution(row.unit,route.mode)[req.key])>0).sort((a,b)=>a.quote.wisp.cost-b.quote.wisp.cost||num(b.potential)-num(a.potential)||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'))[0];
    if(best)closers.set(req.key,{key:req.key,label:req.label,row:best});
  }
  if(!closers.size)return none;
  const criticalIds=[...new Set([...closers.values()].map(item=>item.row.unit.id))],kept=[];
  for(const row of source){
    if(!row.quote.feasible||criticalIds.includes(row.unit.id)){kept.push(row);continue;}
    const contribution=C.roleContribution(row.unit,route.mode);
    const preserves=[...closers.values()].every(item=>num(contribution[item.key])>0||L.quote(model,item.row.unit,row.quote.after,{availableRound:model.round.value}).feasible);
    if(preserves)kept.push(row);
  }
  if(kept.length===source.length)return Object.assign({},none,{criticalIds});
  const labels=[...closers.values()].map(item=>item.label);
  return{applied:true,reason:`남은 필수 결손(${labels.slice(0,3).join(' · ')})의 최저 선위 마감 경로를 예약하고, 이를 굶기는 제작을 제외했습니다.`,criticalIds,rows:kept,filteredIds:source.filter(row=>!kept.includes(row)).map(row=>row.unit.id)};
}
// v16 recovery ladder: when no craft is provable, still name the nearest unit
// that closes each open required role, with its exact missing materials and
// wisp distance.  A silent HOLD is never an acceptable answer.
function recoveryPlan(model,route,locks,assessment,options){
  if(!route||!assessment)return null;
  const limit=options&&options.limit||4,counts=model.effective.counts,open=(assessment.requirements||[]).filter(row=>num(row.gap)>0&&!row.waived);
  if(!open.length)return null;
  const universe=actionUniverse(model,route,locks,assessment,counts),targets=[],seen=new Set();
  for(const req of open){
    const rows=[];
    for(const unit of universe){
      const contribution=C.roleContribution(unit,route.mode);if(num(contribution[req.key])<=0)continue;
      const quote=L.quote(model,unit,counts,{availableRound:model.round.value});
      if(!quote.prerequisite.allowed||quote.blocked.some(reason=>/조합 근거 부족|레시피 순환/.test(reason)))continue;
      rows.push({unit,quote,gain:Math.min(num(contribution[req.key]),num(req.gap))});
    }
    rows.sort((a,b)=>Number(b.quote.feasible)-Number(a.quote.feasible)||a.quote.wisp.cost-b.quote.wisp.cost||b.gain-a.gain||nameOf(a.unit).localeCompare(nameOf(b.unit),'ko'));
    const best=rows[0];if(!best||seen.has(best.unit.id))continue;seen.add(best.unit.id);
    const missing=C.commonTop?C.commonTop(model.knowledge.db,best.quote.solve&&best.quote.solve.lowestMissing||{},3).map(item=>({id:item.id,name:item.name,count:num(item.count!=null?item.count:item.need)})):[];
    targets.push({id:best.unit.id,name:nameOf(best.unit),tier:tierOf(best.unit),roleKey:req.key,roleLabel:req.label,gain:round(best.gain),wispCost:num(best.quote.wisp.cost),wispGap:Math.max(0,num(best.quote.wisp.cost)-num(best.quote.wisp.before)),feasible:best.quote.feasible,missing});
    if(targets.length>=limit)break;
  }
  return targets.length?{basis:'nearest-closer-per-open-role',note:options&&options.note||'남은 필수 역할을 닫는 최근접 목표',targets}:null;
}
function expand(model,node,row,route,locks,initial){const quote=L.quote(model,row.unit,node.counts,{availableRound:model.round.value});if(!quote.feasible)return null;const before=ownedFinals(model,node.counts),after=ownedFinals(model,quote.after);if(introducesLineageConflict(model,before,after))return null;const next=nodeBase(model,quote.after,route,locks,initial,node.sequence.concat({quote}));return next;}
function search(model,route,locks){
  const initialAssessment=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks}),initial=nodeBase(model,model.effective.counts,route,locks,initialAssessment,[]),universe=actionUniverse(model,route,locks,initialAssessment,model.effective.counts),rawPool=candidatePool(model,route,locks,initialAssessment,model.effective.counts,model.round.value,universe),budgetGuard=protectCriticalBudget(model,route,locks,initialAssessment,rawPool,model.effective.counts),basePool=budgetGuard.rows,candidateUnits=basePool.map(row=>row.unit),initialCoverage=futureCoverage(model,initial,route,locks,candidateUnits);initial.coverage=initialCoverage;nodeRank(model,initial,initialAssessment);
  // Coverage is an expensive exact re-quote. First rank all executable nodes
  // by the declarative role/checkpoint vector, then run coverage only for the
  // bounded finalists. This preserves role-diverse candidates from
  // candidatePool while avoiding O(nodes * full-catalog) work on every TMO
  // update.
  let frontier=[];for(const row of basePool){const node=expand(model,initial,row,route,locks,initialAssessment);if(!node)continue;nodeRank(model,node,initialAssessment);frontier.push(node);}frontier.sort(compareNodes);frontier=frontier.slice(0,BEAM_WIDTH*2);for(const node of frontier){node.coverage=futureCoverage(model,node,route,locks,candidateUnits);nodeRank(model,node,initialAssessment);}frontier.sort(compareNodes);let archive=frontier.slice();frontier=frontier.slice(0,BEAM_WIDTH);
  for(let depth=1;depth<HORIZON;depth++){
    const children=[];for(const node of frontier){const pool=candidatePool(model,route,locks,node.assessment,node.counts,model.round.value,candidateUnits).slice(0,16);for(const row of pool){if(node.sequence.some(step=>step.quote.targetId===row.unit.id))continue;const next=expand(model,node,row,route,locks,initialAssessment);if(!next)continue;nodeRank(model,next,initialAssessment);children.push(next);}}
    if(!children.length)break;children.sort(compareNodes);const finalists=children.slice(0,BEAM_WIDTH*2);for(const node of finalists){node.coverage=futureCoverage(model,node,route,locks,candidateUnits);nodeRank(model,node,initialAssessment);}finalists.sort(compareNodes);frontier=finalists.slice(0,BEAM_WIDTH);archive=archive.concat(finalists);
  }
  const byFirst=new Map();for(const node of archive.sort(compareNodes)){const id=node.sequence[0]&&node.sequence[0].quote.targetId;if(id&&!byFirst.has(id))byFirst.set(id,node);}const paths=[...byFirst.values()].sort(compareNodes),best=paths[0]||null;return{initial,initialAssessment,initialCoverage,basePool,rawPool,paths,best,budgetGuard};
}
function requirementDeltas(before,after){const map=new Map((before.requirements||[]).map(row=>[row.key,row]));return(after.requirements||[]).map(row=>{const prior=map.get(row.key)||row,delta=num(row.current)-num(prior.current),gapGain=num(prior.gap)-num(row.gap);return{key:row.key,label:row.label,before:num(prior.current),after:num(row.current),target:num(row.target),delta:round(delta),gapGain:round(gapGain),closed:num(prior.gap)>0&&num(row.gap)<=0};}).filter(row=>Math.abs(row.delta)>1e-9||row.closed);}
function freeNonRegressiveRepair(quote,before,after){
  if(!quote||!quote.feasible||num(quote.wisp&&quote.wisp.cost)>0)return false;
  const prior=new Map((before&&before.requirements||[]).map(row=>[row.key,row]));
  let strictlyImproves=false;
  for(const row of after&&after.requirements||[]){
    const left=prior.get(row.key);if(!left)continue;
    const beforeGap=num(left.gap),afterGap=num(row.gap);
    if(afterGap>beforeGap+1e-9)return false;
    if(afterGap<beforeGap-1e-9)strictlyImproves=true;
  }
  return strictlyImproves;
}
function routeOptions(model){
  const selected=P.resolveRoute(model.intent,model.settings);if(selected)return[selected];
  if(model.intent.damageMode==='magic')return[P.ROUTES.dual,P.ROUTES.singleEnd];
  if(model.intent.damageMode==='physical')return[P.ROUTES.physical];
  return[P.ROUTES.physical,P.ROUTES.dual,P.ROUTES.singleEnd];
}
function rolePotential(unit,route){const contribution=C.roleContribution(unit,route.mode);let score=0;for(let index=0;index<route.groups.length;index++){const weight=Math.max(1,route.groups.length-index);for(const key of route.groups[index])score+=weight*Math.min(1,num(contribution[key]));}return round(score);}
function routeCandidateCompare(left,right){
  const a=left.rankVector||[],b=right.rankVector||[],length=Math.max(a.length,b.length);for(let index=0;index<length;index++){const delta=num(a[index])-num(b[index]);if(Math.abs(delta)>1e-9)return delta;}return nameOf(left.unit).localeCompare(nameOf(right.unit),'ko')||String(left.id).localeCompare(String(right.id));
}
function remainingOverlap(model,unit,counts){let penalty=0,densePairs=0;for(const existing of ownedFinals(model,counts)){if(existing.id===unit.id)continue;const pair=pairMaterialOverlap(model,unit,existing);if(pair.denseRare)densePairs++;penalty+=pair.penalty;}return{penalty:round(penalty),densePairs};}
function lineupOverlap(model,lineup){let penalty=0,densePairs=0;for(let left=0;left<(lineup||[]).length;left++)for(let right=left+1;right<lineup.length;right++){const pair=pairMaterialOverlap(model,lineup[left],lineup[right]);if(pair.denseRare)densePairs++;penalty+=pair.penalty;}return{penalty:round(penalty),densePairs};}
function safeRoleImprovement(before,after){
  const prior=new Map((before&&before.requirements||[]).map(row=>[row.key,row]));let improved=false;
  for(const row of after&&after.requirements||[]){const left=prior.get(row.key);if(!left)continue;if(num(row.gap)>num(left.gap)+1e-9)return false;if(num(row.gap)+1e-9<num(left.gap))improved=true;}
  return improved;
}
function supportNodeRank(node){const tier=node.resources.tiers,overlap=node.overlap||{penalty:0,densePairs:0};node.rankVector=[].concat(node.assessment.fullVector,[-num(tier.rare),-num(tier.special),-num(tier.uncommon),-num(tier.common),num(node.resources.wisp),num(node.warpedCount),num(overlap.densePairs),num(overlap.penalty)]);return node.rankVector;}
function compareSupportNodes(left,right){const vector=P.compareVector(left.rankVector,right.rankVector);if(vector)return vector;return(left.steps||[]).map(step=>step.quote.targetId).join('|').localeCompare((right.steps||[]).map(step=>step.quote.targetId).join('|'));}
function makeSupportNode(model,counts,assessment,steps,warpedCount){const resources=resourceTotals(steps),overlap=lineupOverlap(model,ownedFinals(model,counts)),node={counts,assessment,steps,resources,warpedCount:num(warpedCount),overlap,rankVector:[]};supportNodeRank(node);return node;}
function supportUniverse(model,route,locks,counts,assessment){
  const beforeLineup=ownedFinals(model,counts),lock=lockedUpper(locks),staticRows=allCandidates(model,route,locks,counts).map(unit=>{const potential=potentialScore(unit,assessment,route,lock),profile=recipeProfile(model,unit);return{unit,potential,profile};}).filter(row=>row.potential>0).sort((left,right)=>right.potential-left.potential||sum(right.profile.rare)-sum(left.profile.rare)||sum(right.profile.special)-sum(left.profile.special)||num(model.effective.percent[right.unit.id])-num(model.effective.percent[left.unit.id])||nameOf(left.unit).localeCompare(nameOf(right.unit),'ko')).slice(0,SUPPORT_STATIC_PROBE_CAP),rows=[];for(const prepared of staticRows){const unit=prepared.unit,quote=L.quote(model,unit,counts,{availableRound:model.round.value});if(!quote.feasible||introducesLineageConflict(model,beforeLineup,ownedFinals(model,quote.after)))continue;const after=P.evaluate(model,quote.after,route,{round:model.round.value,locks});if(!safeRoleImprovement(assessment,after))continue;const tiers=quote.tiers&&quote.tiers.totals||{},potential=prepared.potential;rows.push({unit,quote,after,potential,tiers,warpedRequired:!!(C.requiresWarpedCraft&&C.requiresWarpedCraft(model.knowledge.db,unit,counts))});}
  rows.sort((left,right)=>P.compareVector(left.after.fullVector,right.after.fullVector)||right.potential-left.potential||-num(left.tiers.rare)+num(right.tiers.rare)||-num(left.tiers.special)+num(right.tiers.special)||-num(left.tiers.uncommon)+num(right.tiers.uncommon)||-num(left.tiers.common)+num(right.tiers.common)||left.quote.wisp.cost-right.quote.wisp.cost||nameOf(left.unit).localeCompare(nameOf(right.unit),'ko'));return rows.slice(0,SUPPORT_CANDIDATE_CAP);
}
function projectSupportPrefix(model,row,route){
  if(!row.quote||!row.quote.feasible)return{steps:[],supportSteps:[],assessment:null,tiers:{rare:0,special:0,uncommon:0,common:0},wispUsed:0,remainingWisp:num(row.quote&&row.quote.wisp&&row.quote.wisp.before),requiredUpperWisp:num(row.quote&&row.quote.wisp&&row.quote.wisp.cost),wispDebt:Math.max(0,num(row.quote&&row.quote.wisp&&row.quote.wisp.cost)-num(row.quote&&row.quote.wisp&&row.quote.wisp.before)),deadEnds:[],affordableCount:0,exactPrefix:false,basis:'upper-not-currently-craftable'};
  const locks=[{stage:'upper',id:row.id,source:'v15-route-projection'}],initialAssessment=P.evaluate(model,row.quote.after,route,{round:model.round.value,locks}),initial=makeSupportNode(model,row.quote.after,initialAssessment,[],row.warped&&row.warped.required?1:0),universe=supportUniverse(model,route,locks,initial.counts,initial.assessment),candidateUnits=universe.map(item=>item.unit);let frontier=[],archive=[];
  for(const item of universe){const node=makeSupportNode(model,item.quote.after,item.after,[{quote:item.quote}],initial.warpedCount+(item.warpedRequired?1:0));frontier.push(node);}frontier.sort(compareSupportNodes);archive=frontier.slice();frontier=frontier.slice(0,SUPPORT_BEAM_WIDTH);
  for(const node of frontier){for(const item of universe){if(node.steps.some(step=>step.quote.targetId===item.unit.id))continue;const quote=L.quote(model,item.unit,node.counts,{availableRound:model.round.value});if(!quote.feasible||introducesLineageConflict(model,ownedFinals(model,node.counts),ownedFinals(model,quote.after)))continue;const after=P.evaluate(model,quote.after,route,{round:model.round.value,locks});if(!safeRoleImprovement(node.assessment,after))continue;archive.push(makeSupportNode(model,quote.after,after,node.steps.concat({quote}),node.warpedCount+(C.requiresWarpedCraft&&C.requiresWarpedCraft(model.knowledge.db,item.unit,node.counts)?1:0)));}}
  archive.sort(compareSupportNodes);const best=archive[0]||initial,coverage=futureCoverage(model,{counts:best.counts,assessment:best.assessment},route,locks,candidateUnits),allSteps=[{quote:row.quote}].concat(best.steps),cumulative=resourceTotals(allSteps),supportSteps=best.steps.map((step,index)=>({order:index+1,id:step.quote.targetId,name:nameOf(step.quote.unit),wispCost:num(step.quote.wisp.cost),wispAfter:num(step.quote.wisp.after),tiers:Object.assign({rare:0,special:0,uncommon:0,common:0},step.quote.tiers&&step.quote.tiers.totals||{})}));
  return{steps:allSteps,supportSteps,assessment:best.assessment,tiers:cumulative.tiers,wispUsed:cumulative.wisp,remainingWisp:num(best.counts[C.WISP_ID]),requiredUpperWisp:num(row.quote.wisp.cost),wispDebt:0,deadEnds:coverage.deadEnds,affordableCount:coverage.affordableCount,warpedCount:best.warpedCount,materialOverlap:best.overlap,exactPrefix:true,basis:'upper-plus-up-to-two-exact-supports'};
}
function story10RewardOpen(model){
  // 스토리 10 확정 보상(레일리(히든)+해적선)은 사용자가 다른 보상(초월
  // 쿠마·상자)을 선언하지 않은 동안만 계획에 넣을 수 있다.
  const choice=String(model.settings&&model.settings.story10Reward||'');
  return choice===''||choice==='rayleigh';
}
function upperRouteRow(model,unit,route){
  const counts=model.effective.counts;let quote=L.quote(model,unit,counts,{availableRound:model.round.value}),storyReward=false;
  // v17.5: 레일리(히든)·해적선만 막힌 상위(예: 핸콕 영원)는 스토리 10
  // 보상 수령을 전제로 방향 후보에 남긴다.  전설·희귀 완성 단계에는
  // 절대 적용하지 않는다 — 초반에는 레일리를 도박 말고 얻을 길이 없다.
  if((!quote.prerequisite.allowed||quote.blocked.length)&&story10RewardOpen(model)){
    const credited=Object.assign({},counts);
    credited[C.RAYLEIGH_HIDDEN_ID]=num(credited[C.RAYLEIGH_HIDDEN_ID])+1;
    credited[C.PIRATE_SHIP_ID]=num(credited[C.PIRATE_SHIP_ID])+1;
    const retry=L.quote(model,unit,credited,{availableRound:model.round.value});
    if(retry.prerequisite.allowed&&!retry.blocked.length){quote=retry;storyReward=true;}
  }
  // Missing special items, exhausted one-off resources, malformed recipes and
  // other hard rules are not a recommendation. A finite wisp shortage is the
  // only reason an unfinished upper may remain as a direction commitment.
  if(!quote.prerequisite.allowed||quote.blocked.length)return null;
  const beforeLineup=ownedFinals(model,counts),afterLineup=ownedFinals(model,quote.after);if(introducesLineageConflict(model,beforeLineup,afterLineup))return null;
  const temporaryLocks=[{stage:'upper',id:unit.id,source:'v15-route-projection'}],projected=quote.feasible?P.evaluate(model,quote.after,route,{round:model.round.value,locks:temporaryLocks}):null,tiers=Object.assign({rare:0,special:0,uncommon:0,common:0},quote.tiers&&quote.tiers.totals||{}),inventory=M.tierInventory(model,counts),warpedRequired=!!(C.requiresWarpedCraft&&C.requiresWarpedCraft(model.knowledge.db,unit,counts)),profile=recipeProfile(model,unit),overlap=remainingOverlap(model,unit,quote.after),completion=num(model.effective.percent[unit.id]),wispGap=Math.max(0,num(quote.wisp.cost)-num(quote.wisp.before)),potential=rolePotential(unit,route),projectedVector=projected?projected.fullVector:[99,99,99,99],rankVector=[quote.feasible?0:1].concat(projectedVector,[-num(tiers.rare),-num(tiers.special),-num(tiers.uncommon),-num(tiers.common),wispGap,num(quote.wisp.cost),warpedRequired?1:0,num(profile.warpedNodes.size),num(overlap.penalty),-potential,-completion]),uses=`희귀 ${num(tiers.rare)}/${num(inventory.rare&&inventory.rare.total)} · 특별 ${num(tiers.special)}/${num(inventory.special&&inventory.special.total)} · 안흔 ${num(tiers.uncommon)}/${num(inventory.uncommon&&inventory.uncommon.total)}`;
  return{id:unit.id,name:nameOf(unit),unit,routeKey:route.key,routeLabel:route.label,mode:route.mode,locked:false,keepUpper:false,canCommit:true,feasible:quote.feasible&&!storyReward,storyReward,quote,completion:round(completion,1),wispCost:num(quote.wisp.cost),wispAfter:quote.feasible?num(quote.wisp.after):null,wispGap,tiers,upperTiers:Object.assign({},tiers),tierAvailable:{rare:num(inventory.rare&&inventory.rare.total),special:num(inventory.special&&inventory.special.total),uncommon:num(inventory.uncommon&&inventory.uncommon.total),common:num(inventory.common&&inventory.common.total)},warped:{required:warpedRequired,nodes:num(profile.warpedNodes.size),costReflectedInWisp:true},materialOverlap:overlap,rolePotential:potential,projectedAssessment:projected,rankVector,reason:`현재 패 정확 원장: ${uses} · 선택위습 ${num(quote.wisp.cost)}${wispGap?` (현재 ${wispGap} 부족)`:''}${warpedRequired?' · 왜곡 제작 비용 포함':''}${storyReward?` · 스토리 10 보상(레일리+해적선) 수령 전제 — ${C.STORY10_FORFEITS} 포기`:''}.`,evidence:{ledger:'exact-current-stock',specialPrerequisite:storyReward?'story10-reward-planned':'observed',upperEquivalent:3,fixedFinalParty:false,combat:'unmeasured'}};
}
function lockedMagicRouteRows(model,lock){
  const unit=model.knowledge.db.byId.get(lock&&lock.id);if(!unit||C.familyOf(unit)!=='magic')return[];
  return[P.ROUTES.dual,P.ROUTES.singleEnd].map(route=>{const assessment=P.evaluate(model,model.effective.counts,route,{round:model.round.value,locks:[lock]}),rankVector=assessment.checkpointVector.concat(assessment.fullVector);return{id:unit.id,name:nameOf(unit),unit,routeKey:route.key,routeLabel:route.label,mode:'magic',locked:true,keepUpper:true,canCommit:true,feasible:true,quote:null,completion:round(num(model.effective.percent[unit.id]),1),wispCost:0,wispAfter:num(model.effective.counts[C.WISP_ID]),wispGap:0,tiers:{rare:0,special:0,uncommon:0,common:0},tierAvailable:{},warped:{required:false,nodes:0,costReflectedInWisp:true},materialOverlap:{penalty:0,densePairs:0},rolePotential:0,projectedAssessment:assessment,rankVector,reason:`고정 상위 ${nameOf(unit)}는 유지합니다. 현재 보유 역할만 ${route.label} 기준으로 다시 계산했습니다.`,evidence:{ledger:'no-craft-route-choice',keptUpperLock:true,fixedFinalParty:false,combat:'unmeasured'}};}).sort(routeCandidateCompare);
}
function projectUpperRouteRow(model,row,route){
  const projection=projectSupportPrefix(model,row,route),exact=projection.exactPrefix===true,tiers=exact?Object.assign({rare:0,special:0,uncommon:0,common:0},projection.tiers):Object.assign({rare:0,special:0,uncommon:0,common:0},row.upperTiers||row.tiers),assessment=projection.assessment||row.projectedAssessment,roleVector=assessment?assessment.fullVector:[99,99,99,99],overlap=projection.materialOverlap||row.materialOverlap||{penalty:0,densePairs:0},warpedCount=num(projection.warpedCount)+(projection.warpedCount==null&&row.warped&&row.warped.required?1:0),support=exact?projection.supportSteps||[]:[],stepSummary=exact?[{order:1,kind:'upper',id:row.id,name:row.name,wispCost:num(row.quote&&row.quote.wisp.cost),wispAfter:num(row.quote&&row.quote.wisp.after),tiers:Object.assign({},row.upperTiers||row.tiers)}].concat(support.map((step,index)=>Object.assign({},step,{order:index+2,kind:'support'}))):[],wispUsed=exact?num(projection.wispUsed):num(row.quote&&row.quote.wisp&&row.quote.wisp.cost),rankVector=[row.feasible?0:1,num((projection.deadEnds||[]).length)].concat(roleVector,[-num(tiers.rare),-num(tiers.special),-num(tiers.uncommon),-num(tiers.common),num(row.wispGap),wispUsed,warpedCount,num(overlap.densePairs),num(overlap.penalty),-num(row.completion)]),supportNames=support.map(step=>step.name).join(' → '),reason=exact?`상위+현재 패 확정 경로: ${row.name}${supportNames?` → ${supportNames}`:''} · 희귀 ${num(tiers.rare)} · 특별 ${num(tiers.special)} · 안흔 ${num(tiers.uncommon)} · 누적 선위 ${wispUsed}${projection.deadEnds&&projection.deadEnds.length?` · 이후 막힌 역할 ${projection.deadEnds.map(item=>item.label).slice(0,2).join(' / ')}`:''}${row.warped&&row.warped.required?' · 왜곡 비용 포함':''}.`:`방향 후보: ${row.name} · 현재 제작 선위 ${num(projection.requiredUpperWisp)} 필요, ${num(projection.wispDebt)} 부족. 확정 제작 경로로 표시하지 않습니다.`,
  reasonWithStory=row.storyReward?`${reason} · 스토리 10 보상(레일리+해적선) 수령 전제 — ${C.STORY10_FORFEITS} 포기.`:reason;
  return Object.assign({},row,{tiers,wispCost:wispUsed,wispAfter:exact?projection.remainingWisp:null,projectedAssessment:assessment,materialOverlap:overlap,rankVector,reason:reasonWithStory,projectedSupport:{basis:projection.basis,exactPrefix:exact,steps:stepSummary,supportSteps:support,tiers:exact?projection.tiers:{rare:0,special:0,uncommon:0,common:0},wispUsed:exact?num(projection.wispUsed):0,remainingWisp:projection.remainingWisp,requiredUpperWisp:num(projection.requiredUpperWisp),wispDebt:num(projection.wispDebt),deadEnds:projection.deadEnds||[],affordableCount:num(projection.affordableCount),futureDropsCredited:false,fixedFinalParty:false,combat:'unmeasured'}});
}
function upperProjectionShortlist(rows,route){const sorted=(rows||[]).slice().sort(routeCandidateCompare),picked=sorted.slice(0,UPPER_PROJECTION_SHORTLIST),seen=new Set(picked.map(row=>C.canonicalUpperId(row.id)));for(const key of [...new Set((route.groups||[]).flat())]){const best=sorted.filter(row=>num(C.roleContribution(row.unit,route.mode)[key])>0).sort((left,right)=>num(C.roleContribution(right.unit,route.mode)[key])-num(C.roleContribution(left.unit,route.mode)[key])||routeCandidateCompare(left,right))[0];if(best&&!seen.has(C.canonicalUpperId(best.id))){seen.add(C.canonicalUpperId(best.id));picked.push(best);}if(picked.length>=UPPER_PROJECTION_CAP)break;}return picked.slice(0,UPPER_PROJECTION_CAP);}
// v17.3: 종착점 클리어 가치 — "지금 가까운 상위"가 아니라 "클리어에
// 유리한 상위"가 앞서도록 하는 현재주의 교정.  근거는 전부 실측 데이터:
// 스토리 실측 랭크, 평타+스킬 하한 DPS의 60라 필요치 대비, 라인 자립도
// (보유 조합의 보조딜로 상쇄), 보유 희귀 활용률.  50라 준비 창을 넘기는
// 도달 시점은 강하게 할인한다 — 시간이 없을 때만 현재주의가 옳다.
function clearValueScore(model,row){
  const unit=row.unit;
  const grade=C.storyLeagueGrade?C.storyLeagueGrade(unit):null;
  const story=grade&&num(grade.maxRank)>0?1-(num(grade.rank)-1)/Math.max(1,num(grade.maxRank)):num(C.storyGrade(unit).score)/100;
  const preview=C.bossPreview?C.bossPreview(60,model.settings.gorosei):null;
  let dpsCover=0;
  if(preview&&preview.bossArmor!=null&&C.upperBossDps){
    const level=Math.max(1,num(model.settings.upperResearchLevel)||1);
    const combat=C.upperBossDps(unit,level,{bossArmor:preview.bossArmor,armorReduce:180});
    const proc=C.upperSkillProcDps?C.upperSkillProcDps(unit,level,{bossArmor:preview.bossArmor,armorReduce:180}):null;
    if(combat)dpsCover=Math.min(1.2,(combat.effective+(proc?proc.dps:0))/Math.max(1,num(preview.dpsNeed)));
  }
  const strategy=C.upperStrategy(unit);
  let line=.5;
  if(strategy.lineSelf==='self')line=1;
  else if(strategy.lineSelf==='support')line=ownedFinals(model,model.effective.counts).some(owned=>C.roleProfile(owned).supportDamage)?.6:.2;
  const rareUtil=num(row.tierAvailable&&row.tierAvailable.rare)>0?Math.min(1,num(row.tiers&&row.tiers.rare)/num(row.tierAvailable.rare)):0;
  // 유틸 킷(스턴·이감·방깎)은 DPS 하한에 잡히지 않는 실전 가치다 —
  // 핸콕 영원류 유틸 상위가 저평가되지 않게 별도 축으로 넣는다.
  const kit=C.roleProfile(unit),utility=Math.min(1,.4*Math.min(1,num(kit.stun)/1.5)+.3*Math.min(1,(num(kit.slow)+num(kit.triggerSlow))/60)+.3*Math.min(1,(num(kit.armor)+num(kit.triggerArmor))/60));
  // 선위 부족 → 예상 라운드: 드랍이 트리 재료를 직접 채우므로 순수 선위
  // 구매 가정보다 훨씬 빠르다.  실측 로그 기준(예: 크로커다일 r33 선택 →
  // r38 완성, 선위환산 ~20/5라) 라운드당 4선위 환산으로 본다.
  const roundsToGo=row.feasible?0:Math.ceil(num(row.wispGap)/4);
  const eta=model.round.value+roundsToGo;
  const deadlineFactor=eta<=47?1:eta<=52?.6:eta<=58?.35:.15;
  const value=(.3*story+.3*dpsCover+.15*line+.12*rareUtil+.13*utility)*deadlineFactor;
  return{value:round(value,4),story:round(story,3),dpsCover:round(dpsCover,3),line:round(line,2),rareUtil:round(rareUtil,3),utility:round(utility,3),roundsToGo,deadlineFactor};
}
function clearValueCompare(left,right){
  const delta=num(right.clearValue&&right.clearValue.value)-num(left.clearValue&&left.clearValue.value);
  if(Math.abs(delta)>1e-9)return delta;
  return routeCandidateCompare(left,right);
}
function upperRouteCandidates(model,locks){
  const lock=lockedUpper(locks);if(lock&&!P.resolveRoute(model.intent,model.settings))return lockedMagicRouteRows(model,lock);
  const options=routeOptions(model),byRoute=[];
  const gapOf=row=>row.feasible?0:num(row.wispGap);
  const nearestOf=list=>list.reduce((best,row)=>!best||gapOf(row)<gapOf(best)-1e-9||Math.abs(gapOf(row)-gapOf(best))<=1e-9&&clearValueCompare(row,best)<0?row:best,null);
  for(const route of options){const canonical=new Map();for(const unit of model.knowledge.db.uppers){if(!routeFamilyOk(unit,route))continue;const row=upperRouteRow(model,unit,route);if(!row)continue;row.clearValue=clearValueScore(model,row);const key=C.canonicalUpperId(unit.id),prior=canonical.get(key);if(!prior||clearValueCompare(row,prior)<0)canonical.set(key,row);}
    // 숏리스트도 클리어 가치 순으로 뽑는다 — 도달 거리 순 숏리스트는
    // 멀지만 좋은 상위(예: 핸콕 영원)를 투영 전에 잘라버린다.
    const ranked=[...canonical.values()].sort(clearValueCompare);
    const shortlist=ranked.slice(0,UPPER_PROJECTION_CAP);
    // 단, 지금 패에서 가장 빨리 완성되는 상위(현재주의 선택지)는 가치가
    // 낮아도 투영에 태운다 — 최종 화면에서 가치 비교의 기준점이 된다.
    const laneNearest=nearestOf(ranked);
    if(laneNearest&&!shortlist.includes(laneNearest))shortlist.push(laneNearest);
    const rows=shortlist.map(row=>projectUpperRouteRow(model,row,route));
    for(const row of rows)if(!row.clearValue)row.clearValue=clearValueScore(model,row);
    rows.sort(clearValueCompare);byRoute.push({route,rows});}
  const dedupe=list=>{const seenCanonical=new Map();const out=[];for(const row of list){const key=C.canonicalUpperId(row.id);const prior=seenCanonical.get(key);if(prior==null){seenCanonical.set(key,out.length);out.push(row);}else if(clearValueCompare(row,out[prior])<0)out[prior]=row;}return out;};
  // 최종 목록: 클리어 가치 순 + "최단 완성" 앵커 보장.  친구 사례(흰수염
  // 불멸 vs 핸콕 영원)처럼 눈앞의 쉬운 선택이 목록에서 사라지면 사용자는
  // 가치 차이를 볼 수 없다 — 순위는 가치가 정하고, 자리는 하나 보장한다.
  const pool=dedupe(byRoute.flatMap(lane=>lane.rows).sort(clearValueCompare));
  const picked=pool.slice(0,ROUTE_CANDIDATE_LIMIT);
  const nearest=nearestOf(pool);
  if(nearest){nearest.nearestBuild=true;if(!picked.includes(nearest)){if(picked.length>=ROUTE_CANDIDATE_LIMIT)picked[picked.length-1]=nearest;else picked.push(nearest);}}
  return picked;
}
function liveRareProtection(model,counts,route,locks,rareId){
  if(num(counts[rareId])<=0)return[];const settings=Object.assign({},model.settings,{magicRoute:route.key,_resolvedMagicRoute:route.key}),before=M.roleState(model,counts,route.mode,settings,locks,false),afterCounts=clone(counts);afterCounts[rareId]=Math.max(0,num(afterCounts[rareId])-1);const after=M.roleState(model,afterCounts,route.mode,settings,locks,false);
  // v17.6(감사 P0-4): 정적 route.groups 키만 비교하면 상위 전략 needs로
  // 동적 추가된 필수 역할(예: 드래곤 단일 2·끝딜 1)이 보호 비교에서
  // 빠져, 그 역할에만 기여하는 희귀가 리롤 후보로 샜다.  필수(waived
  // 제외) 역할 전체를 제거 전/후로 비교한다.
  const afterMap=new Map((after.deficits.requirements||[]).map(row=>[row.key,row])),labels=[];
  for(const left of before.deficits.requirements||[]){
    if(left.required===false||left.waived)continue;
    const right=afterMap.get(left.key);
    if(right&&num(right.gap)>num(left.gap)+1e-9)labels.push(left.label);
  }
  return[...new Set(labels)];
}
function rareDisposition(model,route,locks,searchResult){
  const counts=model.effective.counts,best=searchResult.best,paths=searchResult.paths||[],first=best&&best.sequence[0],useMap=clone(first&&first.quote.rareUse),bestFuture={};for(const step of best&&best.sequence.slice(1)||[])for(const [id,value] of Object.entries(step.quote.rareUse||{}))bestFuture[id]=num(bestFuture[id])+num(value);const pathMaximum={};for(const path of paths){const pathUse={};for(const step of path.sequence||[])for(const [id,value] of Object.entries(step.quote.rareUse||{}))pathUse[id]=num(pathUse[id])+num(value);for(const [id,value] of Object.entries(pathUse))pathMaximum[id]=Math.max(num(pathMaximum[id]),num(value));}const rows=[];
  // v17.6(감사 P0-1): 희귀 리롤은 게임당 총 2회 확정 규칙.  소진하면
  // 리롤 후보 자체를 만들지 않는다 — REROLL_ONE 상태도 자연히 사라진다.
  const rerollBudget=Math.max(0,2-num(model.settings.rerollsUsed));
  for(const unit of model.knowledge.db.rares){const initial=Math.max(0,num(counts[unit.id]));if(initial<=0)continue;let remaining=initial,use=Math.min(remaining,num(useMap[unit.id]));remaining-=use;const liveLabels=liveRareProtection(model,counts,route,locks,unit.id),alternativeNeed=Math.max(0,num(pathMaximum[unit.id])-use),future=Math.max(num(bestFuture[unit.id]),alternativeNeed);let hold=Math.min(remaining,Math.max(future,liveLabels.length?1:0));remaining-=hold;const rerollAllowed=model.round.value>=25&&rerollBudget>0,reroll=rerollAllowed?remaining:0;if(!rerollAllowed){hold+=remaining;remaining=0;}const reason=use?`${first&&nameOf(first.quote.unit)} 즉시 재료`:liveLabels.length?`현재 전투 ${liveLabels.join(' · ')} 보호`:hold?(model.round.value>=25&&rerollBudget<=0?'리롤 2회 모두 사용 — 남은 희귀는 보류':'검토한 모든 현재 패 경로에서 사용'):'검토한 현재 패 경로와 전투 역할에 사용처 없음';rows.push({id:unit.id,name:nameOf(unit),unit,initial,use,hold,reroll,reason,proof:{consideredPaths:paths.length,committedFuture:num(bestFuture[unit.id]),alternativeNeed,liveCombat:liveLabels,exclusive:use+hold+reroll===initial}});}
  const conflict=rows.some(row=>!row.proof.exclusive),safeReroll=conflict?null:rows.filter(row=>row.reroll>0).sort((a,b)=>b.reroll-a.reroll||a.name.localeCompare(b.name,'ko')||String(a.id).localeCompare(String(b.id)))[0]||null;return{basis:'single-authority-with-feasible-path-proof',rows,use:rows.filter(row=>row.use>0),hold:rows.filter(row=>row.hold>0),reroll:rows.filter(row=>row.reroll>0),safeReroll,conflict};
}
function exclusionReason(best,path){if(path.coverage.deadEnds.length>best.coverage.deadEnds.length)return'남은 선택 위습으로 필수 역할을 닫는 경로가 줄어듭니다.';const checkpoint=P.compareVector(path.assessment.checkpointVector,best.assessment.checkpointVector);if(checkpoint>0)return'현재 라운드 마감 결손을 덜 줄입니다.';const full=P.compareVector(path.assessment.fullVector,best.assessment.fullVector);if(full>0)return'전체 필수 역할 결손이 더 많이 남습니다.';if(path.resources.wisp>best.resources.wisp)return`같은 수준의 진행에 선택 위습을 ${path.resources.wisp-best.resources.wisp}개 더 씁니다.`;return'희귀·특별·안흔 패의 전체 경로 활용도가 낮습니다.';}
function buildDecision(input){
  if(!C||!M||!L||!P)throw new Error('ORDV15Engine requires ORDCore, model, ledger, and policy modules.');
  input=input||{};const model=input.model||M.build(input),locks=input.locks||[],roundNow=model.round.value,final=M.finalSummary(model,model.effective.counts),rareTotal=model.knowledge.db.rares.reduce((total,unit)=>total+Math.max(0,num(model.effective.counts[unit.id])),0),finalize=decision=>Object.assign(decision,{version:VERSION,authority:true,authorityEngine:AUTHORITY,inputFingerprint:model.fingerprint,model});
  // Milestones are inventory states, not date windows. Missing the nominal
  // deadline must not silently advance the user into upper planning.
  if(rareTotal<=0&&final.legendEquivalent<=0)return finalize(completionDecision(model,model.knowledge.db.rares.filter(unit=>intentFamilyOk(model,unit)),COMPLETION_MILESTONES.firstRare));
  if(final.legendEquivalent<=0){const candidates=model.knowledge.db.legendish.filter(unit=>!C.isUpper(unit)&&/전설|히든/.test(C.groupName(unit))&&!C.isShip(unit)&&intentFamilyOk(model,unit));return finalize(completionDecision(model,candidates,COMPLETION_MILESTONES.firstFinal));}
  const route=P.resolveRoute(model.intent,model.settings),lock=lockedUpper(locks),postLegend=String(model.settings.postLegendRoute||'');
  // The user explicitly chose "another legend/hidden" after the first one.
  // Keep the same completion authority until they switch to upper preparation.
  if(postLegend==='legend'&&final.nonUpperFinalCount>0&&final.upperCount<=0&&!lock){const candidates=model.knowledge.db.legendish.filter(unit=>!C.isUpper(unit)&&/전설|히든/.test(C.groupName(unit))&&!C.isShip(unit)&&intentFamilyOk(model,unit));return finalize(completionDecision(model,candidates,COMPLETION_MILESTONES.additionalFinal));}
  if(!route||!lock&&final.upperCount<=0){const routeCandidates=upperRouteCandidates(model,locks),lockedDetail=!!lock&&!route,leadRoute=route||routeOptions(model)[0],leadAssessment=P.evaluate(model,model.effective.counts,leadRoute,{round:roundNow,locks});return finalize({state:'ROUTE_CHOICE',label:lockedDetail?'고정 상위의 마딜 세부 경로 선택':'상위 방향 선택',reason:lockedDetail?'감지된 메인 상위는 바꾸지 않고 dual·singleEnd 중 역할표만 선택합니다.':'최종 9기를 강요하지 않습니다. 현재 패의 희귀→특별→안흔 소비와 정확 선택위습으로 메인 상위만 최대 6개 비교합니다.',action:null,assessment:P.evaluate(model,model.effective.counts,route,{round:roundNow,locks}),routeCandidates,routeChoiceKind:lockedDetail?'locked-magic-detail':'upper',recovery:recoveryPlan(model,leadRoute,locks,leadAssessment,{note:`방향 확정 전 참고 · ${leadRoute.label} 기준 결손 목표`}),alternatives:[],rare:{basis:'route-uncommitted',rows:model.knowledge.db.rares.filter(unit=>num(model.effective.counts[unit.id])>0).map(unit=>({id:unit.id,name:nameOf(unit),unit,initial:num(model.effective.counts[unit.id]),use:0,hold:num(model.effective.counts[unit.id]),reroll:0,reason:'경로 확정 전 안전 보류'})),use:[],hold:[],reroll:[],safeReroll:null,conflict:false},unknowns:['50~65라 실제 보스 DPS','라인 처리력'],evidence:{observed:M.observedEvidence(model),ledger:'exact-current-stock',candidateLimit:ROUTE_CANDIDATE_LIMIT,futureDropsCredited:false,fixedFinalParty:false,clearClaim:false}});}
  // A selected but not-yet-observed upper is a hard milestone reservation.
  // Do not let a tempting support legend spend its rares or finite wisps first.
  // v16.6: but the reservation must not freeze the whole board.  A recorded
  // loss sat in full 재료 보호 for 21 rounds (wisp 7~20 vs a 54~78 quote)
  // while 이감/광보잡 starved into the round-60 boss.  While the locked upper
  // is far from affordable, only its own tree materials stay locked: the
  // search runs on the remaining stock so survival deficits keep closing
  // while wisp income accumulates.  The full hold now applies only inside
  // the near-completion band.
  let searchModel=model,upperReserve=null,upperFallback=null;
  if(route&&lock){const lockKey=C.canonicalUpperId(lock.id),owned=model.knowledge.db.uppers.some(unit=>num(model.effective.counts[unit.id])>0&&C.canonicalUpperId(unit.id)===lockKey);if(!owned){const committed=committedUpperDecision(model,route,locks,lock);if(committed){
    const committedQuote=committed.blockedAction&&committed.blockedAction.quote||null,wispShort=committedQuote?Math.max(0,num(committedQuote.wisp.cost)-num(committedQuote.wisp.before)):0,nearlyAffordable=committedQuote?wispShort<=Math.max(UPPER_HOLD_WISP_BAND,num(committedQuote.wisp.cost)*UPPER_HOLD_WISP_RATIO):false;
    if(committed.state==='ACT_NOW'||nearlyAffordable)return finalize(committed);
    const reservedCounts=Object.assign({},model.effective.counts);let reservedUnits=0;
    for(const [id,qty] of Object.entries(committedQuote&&committedQuote.consumed||{})){if(id===C.WISP_ID)continue;const take=Math.min(num(reservedCounts[id]),num(qty));if(take>0){reservedCounts[id]=num(reservedCounts[id])-take;reservedUnits+=take;}}
    searchModel=Object.assign({},model,{effective:Object.assign({},model.effective,{counts:reservedCounts})});
    upperFallback=committed;
    upperReserve={id:committed.blockedAction.id,name:committed.blockedAction.name,reservedUnits,wispCost:num(committedQuote.wisp.cost),wispBefore:num(committedQuote.wisp.before),wispShort,holdBand:Math.max(UPPER_HOLD_WISP_BAND,round(num(committedQuote.wisp.cost)*UPPER_HOLD_WISP_RATIO,1)),storyRewardNeeded:(committedQuote.blocked||[]).some(text=>/레일리|해적선/.test(String(text)))&&story10RewardOpen(model)};
  }}}
  const searched=search(searchModel,route,locks),best=searched.best;
  if(!best){const rare=rareDisposition(searchModel,route,locks,searched),recovery=recoveryPlan(searchModel,route,locks,searched.initialAssessment);
    // With an upper reservation active, an empty search keeps the familiar
    // 재료 보호 authority instead of a generic hold, enriched with the
    // recovery targets computed on the reserved stock.
    if(upperFallback&&!rare.safeReroll)return finalize(Object.assign(upperFallback,{recovery,upperReserve}));
    return finalize({state:rare.safeReroll?'REROLL_ONE':'HOLD',label:rare.safeReroll?'희귀 1장 리롤 후 재계산':'현재 패 소비 보류',reason:rare.safeReroll?`${rare.safeReroll.name}은 검토한 현재 패 경로와 현재 전투 역할에 사용처가 없습니다.`:recovery?'지금 증명되는 제작은 없습니다. 아래 회복 목표의 재료를 모으거나 리롤로 찾으세요.':'현재 패로 다음 필수 조건을 안전하게 개선하는 제작을 증명하지 못했습니다.',action:null,assessment:searched.initialAssessment,rare,recovery,upperReserve,alternatives:[],unknowns:searched.initialAssessment.unknowns,search:{candidateCount:searched.basePool.length,pathCount:0,horizon:HORIZON}});}
  const first=best.sequence[0],firstAssessment=P.evaluate(searchModel,first.quote.after,route,{round:roundNow,locks}),deltas=requirementDeltas(searched.initialAssessment,firstAssessment),improves=P.improved(searched.initialAssessment,firstAssessment),pathLoss=best.coverage.deadEnds.length>searched.initialCoverage.deadEnds.length,budgetProtected=!!(searched.budgetGuard&&searched.budgetGuard.applied&&searched.budgetGuard.criticalIds.includes(first.quote.targetId)),freeRepair=freeNonRegressiveRepair(first.quote,searched.initialAssessment,firstAssessment),openRequiredKeys=new Set((searched.initialAssessment.requirements||[]).filter(row=>row.required!==false&&!row.waived&&num(row.gap)>0).map(row=>row.key)),requiredRepair=deltas.some(row=>openRequiredKeys.has(row.key)&&(row.closed||row.gapGain>0)),
  // v16.5: when every remaining open requirement is a coverage dead end (no
  // affordable closer exists in the current hand), a feasible non-regressive
  // craft that still raises the board — more legend equivalent or a surplus
  // past an already-met target (e.g. 변화 도플라밍고 pushing 단·끝 3→3.5) —
  // must not be held.  The recorded run kept exactly such a squeeze in 보류
  // for three rounds.
  deadEndIndexes=new Set((searched.initialCoverage.deadEnds||[]).map(item=>item.index)),openGroupsClosable=(searched.initialAssessment.groups||[]).filter(group=>group.rows.some(row=>row.required!==false&&!row.waived&&num(row.gap)>0)).some(group=>!deadEndIndexes.has(group.index)),noHarm=deltas.every(row=>num(row.gapGain)>=0),equivalentGain=num(firstAssessment.actual&&firstAssessment.actual.legendEquivalent)-num(searched.initialAssessment.actual&&searched.initialAssessment.actual.legendEquivalent),beforeStructure=new Map((searched.initialAssessment.structureRows||[]).map(row=>[row.key,row])),structureGain=(firstAssessment.structureRows||[]).some(row=>{const prior=beforeStructure.get(row.key);return prior&&num(prior.gap)>num(row.gap)+1e-9;}),combatBefore=boardCombatScore(searchModel,searchModel.effective.counts,route),combatAfter=boardCombatScore(searchModel,first.quote.after,route),combatGain=round(combatAfter-combatBefore),meaningfulProgress=requiredRepair||structureGain||deltas.some(row=>num(row.gapGain)>0),surplusUpgrade=first.quote.feasible&&best.regression===0&&openRequiredKeys.size>0&&!openGroupsClosable&&noHarm&&(structureGain||deltas.some(row=>num(row.delta)>0)||combatGain>0),
  // v17.6(감사 P0-5): 필수 역할표가 전부 닫힌 뒤에도 보스 화력이 실제로
  // 충분하다는 증거는 없다(킬 판정 금지 정책).  50라 보스 창부터는 어떤
  // 필수 역할도 깎지 않으면서 보스 화력 축(단일·끝딜·환산·1.5스턴)을
  // 올리는 제작을 HOLD하지 않는다 — 55라 도플 2연속 사망의 잔여 구멍.
  // 이 분기만은 잉여 희귀 경제선(rareExcess) 회귀를 무시한다: 4/6/9
  // 환산은 사용자 정의상 '경제 경고선'이지 보스전 화력 거부 사유가
  // 아니다.  안전선은 noHarm — 어떤 필수 역할의 결손도 다시 열리지
  // 않아야 한다(충족 초과분 안에서의 소모는 허용).
  firepowerUpgrade=first.quote.feasible&&openRequiredKeys.size===0&&roundNow>=50&&noHarm&&equivalentGain>=0&&combatGain>0,
  commit=first.quote.feasible&&(best.regression===0&&(improves&&meaningfulProgress&&(!pathLoss||budgetProtected||freeRepair||requiredRepair)||surplusUpgrade)||firepowerUpgrade),reasonParts=deltas.filter(row=>row.gapGain>0).slice(0,3).map(row=>row.closed?`${row.label} 충족`:`${row.label} ${round(row.before)}→${round(row.after)}`),result=firstAssessment.structuralPass?'structural-only':'progress-only',guardReason=budgetProtected?`${searched.budgetGuard.reason} `:freeRepair&&pathLoss?'선택 위습을 쓰지 않고 필수 역할을 회귀 없이 보강합니다. ':'',reason=reasonParts.length?`${guardReason}${reasonParts.join(' · ')}. ${best.reserve.remaining}선위를 남겨 후속 필수 역할 경로를 보호합니다.`:firepowerUpgrade&&!improves&&!surplusUpgrade?`필수 역할은 모두 충족 — 검증된 전투 기여 점수 ${round(combatBefore,1)}→${round(combatAfter,1)}를 회귀 없이 올립니다. 실제 보스 DPS는 자동 측정하지 않으므로 화력 충분 판정은 하지 않습니다.`:surplusUpgrade&&!improves?`남은 필수 결손은 현재 패로 닫을 수 없습니다. 회귀 없이 스펙을 더 올리는 제작에 여유 자원을 씁니다.`:`${guardReason}현재 마감과 전체 필수 조건을 동시에 개선하는 현재 패 경로입니다.`,row=makeRow(searchModel,first.quote,firstAssessment,reason),action={id:first.quote.targetId,name:nameOf(first.quote.unit),unit:first.quote.unit,row,quote:first.quote,wispCost:first.quote.wisp.cost,wispAfter:first.quote.wisp.after,result,reason,deltas,stopCondition:`${Object.keys(first.quote.consumed||{}).length?'표시 재료가 하나라도 바뀌거나 ':''}선택 위습이 ${first.quote.wisp.cost}개 미만이면 만들지 말고 다시 동기화`,path:first.quote.targetId?best.sequence.map(step=>({id:step.quote.targetId,name:nameOf(step.quote.unit),wispCost:step.quote.wisp.cost})):[]},rare=rareDisposition(searchModel,route,locks,searched),alternatives=searched.paths.slice(1,3).map(path=>{const step=path.sequence[0];return{id:step.quote.targetId,name:nameOf(step.quote.unit),wispCost:step.quote.wisp.cost,reason:exclusionReason(best,path),residual:path.assessment.blockers.slice(0,3)};}),state=commit?'ACT_NOW':rare.safeReroll?'REROLL_ONE':'HOLD',compactGuard=searched.budgetGuard?{applied:!!searched.budgetGuard.applied,reason:searched.budgetGuard.reason||'',criticalIds:(searched.budgetGuard.criticalIds||[]).slice(),filteredIds:(searched.budgetGuard.filteredIds||[]).slice()}:null;
  return finalize({state,label:state==='ACT_NOW'?'지금 제작':state==='REROLL_ONE'?'희귀 1장 리롤 후 재계산':'현재 패 소비 보류',reason:state==='ACT_NOW'?reason:state==='REROLL_ONE'?`${rare.safeReroll.name} 1장만 리롤하고 즉시 다시 읽으세요.`:'후속 필수 역할 경로를 보존하는 확정 제작을 찾지 못했습니다.',action:state==='ACT_NOW'?action:null,blockedAction:state==='ACT_NOW'?null:action,assessment:searched.initialAssessment,afterAction:firstAssessment,bestPath:{steps:action.path,assessment:best.assessment,remainingWisp:best.reserve.remaining,deadEnds:best.coverage.deadEnds},rare,recovery:state==='ACT_NOW'?null:recoveryPlan(searchModel,route,locks,searched.initialAssessment),upperReserve,alternatives,unknowns:searched.initialAssessment.unknowns,search:{candidateCount:searched.basePool.length,unfilteredCandidateCount:searched.rawPool.length,pathCount:searched.paths.length,horizon:HORIZON,beamWidth:BEAM_WIDTH,budgetGuard:compactGuard},evidence:{observed:M.observedEvidence(model),ledger:'exact-sequential',futureDropsCredited:false,clearClaim:false,freeNonRegressiveRepair:freeRepair}});
}

return{VERSION,AUTHORITY,decide:buildDecision,_test:{allCandidates,combatPowerScore,boardCombatScore,combatRareCandidates,actionUniverse,recoveryPlan,intentFamilyOk,familyIntent,potentialScore,candidatePool,protectCriticalBudget,futureCoverage,nodeRank,compareNodes,search,rareDisposition,liveRareProtection,completionDecision,requirementDeltas,freeNonRegressiveRepair,resourceTotals,makeRow,upperAllowed,recipeProfile,pairMaterialOverlap,introducesLineageConflict,upperRouteCandidates,upperRouteRow,routeCandidateCompare,clearValueScore,clearValueCompare,routeOptions,expand}};
});

