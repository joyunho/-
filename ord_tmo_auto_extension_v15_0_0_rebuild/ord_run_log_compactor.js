(function(root,factory){
'use strict';
const api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.ORDRunLogCompactor=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';

// This module is intentionally an allow-list, not a generic object sanitizer.
// Planner/catalog objects contain images, long skill text and chat commands;
// none of those fields can cross the functions below into a run log.
const VERSION='1.0.0';
const SNAPSHOT_SCHEMA='ord-snapshot-compact-v1';
const DECISION_SCHEMA='ord-decision-compact-v3';
const TIERS=Object.freeze(['rare','special','uncommon','common']);
const LIMITS=Object.freeze({
  // v16: caps sit well above the 303-unit catalog so boundary keys cannot
  // flap in and out of the sorted truncation window, forging false deltas.
  counts:512,progress:512,abilities:128,
  actions:3,watch:6,directionLanes:3,directionRows:2,lineup:12,
  deficitRows:14,rareRows:48,rareDestinations:4,checkpoints:6,
  mapItems:32,string:220,id:72,maxSnapshotBytes:120000,maxDecisionBytes:90000
});

function finite(value){const number=Number(value);return Number.isFinite(number)?number:null;}
function number(value,fallback){const result=finite(value);return result==null?(fallback==null?0:fallback):result;}
function rounded(value){const result=finite(value);return result==null?0:Math.round(result*1000000)/1000000;}
function bool(value){return value===true;}
function has(source,key){return!!source&&Object.prototype.hasOwnProperty.call(source,key);}
function first(source,keys){for(const key of keys)if(source&&source[key]!=null)return source[key];return undefined;}
function text(value,limit){
  if(value==null)return'';
  let result=String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/(?:https?:\/\/|www\.)\S+/gi,'[removed]').replace(/\s+/g,' ').trim();
  const cap=Math.max(1,Math.min(LIMITS.string,number(limit,LIMITS.string)));
  return result.length>cap?`${result.slice(0,cap-1)}…`:result;
}
function id(value){return text(value,LIMITS.id);}
function cleanStringList(value,limit,itemLimit){
  const result=[];
  for(const item of Array.isArray(value)?value:[]){const clean=text(item,itemLimit||100);if(clean&&!result.includes(clean))result.push(clean);if(result.length>=limit)break;}
  return result;
}
function sortObject(source){const out={};for(const key of Object.keys(source||{}).sort())out[key]=source[key];return out;}
function canonical(value){
  if(value==null||typeof value==='boolean'||typeof value==='string')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(Array.isArray(value))return value.map(canonical);
  const out={};for(const key of Object.keys(value||{}).sort())out[key]=canonical(value[key]);return out;
}
function stableStringify(value){return JSON.stringify(canonical(value));}
function hash32(value,seed){let hash=seed>>>0;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(16).padStart(8,'0');}
function stableDigest(value){const body=stableStringify(value);return`c1-${hash32(body,2166136261)}${hash32(body,3339675911)}`;}
function dedupe(previousDigest,value){const digest=stableDigest(value);return{digest,duplicate:!!previousDigest&&String(previousDigest)===digest};}

function numericMap(source,options){
  options=options||{};const rows=[];
  for(const [rawKey,rawValue] of Object.entries(source||{})){
    const key=id(rawKey),value=finite(rawValue);if(!key||value==null||(options.positiveOnly&&value<=0))continue;
    rows.push([key,rounded(value)]);
  }
  rows.sort((left,right)=>left[0].localeCompare(right[0]));const out={};
  for(const [key,value] of rows.slice(0,options.limit||LIMITS.mapItems))out[key]=value;
  return out;
}
function snapshotProgress(snapshot){
  const source={};
  for(const [key,value] of Object.entries(snapshot&&snapshot.progress||snapshot&&snapshot.percent||{}))if(number(value)>0)source[key]=value;
  for(const row of snapshot&&snapshot.units||[]){const key=id(row&&row.id),value=first(row,['tmoPercent','percent']);if(key&&finite(value)!=null&&number(value)>0)source[key]=value;}
  if(!Object.keys(source).length)for(const row of snapshot&&snapshot.progressSample||[]){const key=id(row&&row.id),value=first(row,['percent','tmoPercent']);if(key&&finite(value)!=null&&number(value)>0)source[key]=value;}
  return numericMap(source,{positiveOnly:true,limit:LIMITS.progress});
}
function snapshotCounts(snapshot){
  const source=Object.assign({},snapshot&&snapshot.counts||{});
  if(!Object.keys(source).length)for(const row of snapshot&&snapshot.units||[]){const key=id(row&&row.id);if(key&&finite(row&&row.count)!=null)source[key]=row.count;}
  return numericMap(source,{positiveOnly:true,limit:LIMITS.counts});
}
function snapshotAbilities(snapshot){return numericMap(snapshot&&snapshot.currentAbilities||{},{positiveOnly:false,limit:LIMITS.abilities});}
function baselineOf(snapshot){
  const body={counts:snapshotCounts(snapshot),progress:snapshotProgress(snapshot),currentAbilities:snapshotAbilities(snapshot)};
  return Object.assign(body,{digest:stableDigest(body)});
}
function normalizeBaseline(value){
  const source=value&&value.baseline||value||{},body={counts:sortObject(source.counts||{}),progress:sortObject(source.progress||{}),currentAbilities:sortObject(source.currentAbilities||{})};
  return Object.assign(body,{digest:source.digest||stableDigest(body)});
}
function mapDelta(previous,next){
  const out={};for(const key of [...new Set(Object.keys(previous||{}).concat(Object.keys(next||{})))].sort()){
    if(!has(next,key)){out[key]=null;continue;}if(!has(previous,key)||previous[key]!==next[key])out[key]=next[key];
  }return out;
}
function observed(snapshot){
  const collection=snapshot&&snapshot.collection||{},out={};
  for(const [key,value] of [['seq',snapshot&&snapshot.seq],['dataChangedAt',snapshot&&snapshot.dataChangedAt],['unitCount',snapshot&&snapshot.unitCount],['playableUnitCount',snapshot&&snapshot.playableUnitCount],['wispCount',snapshot&&snapshot.wispCount]])if(finite(value)!=null)out[key]=rounded(value);
  if(snapshot&&snapshot.wispCountFound!=null)out.wispCountFound=bool(snapshot.wispCountFound);
  if(finite(collection.confidence)!=null)out.confidence=rounded(collection.confidence);
  return out;
}
function compactSnapshot(snapshot,previousBaseline){
  const next=baselineOf(snapshot||{}),previous=previousBaseline?normalizeBaseline(previousBaseline):null,duplicate=!!previous&&previous.digest===next.digest;
  const body=previous?{schema:SNAPSHOT_SCHEMA,kind:'delta',observed:observed(snapshot),counts:mapDelta(previous.counts,next.counts),progress:mapDelta(previous.progress,next.progress),currentAbilities:mapDelta(previous.currentAbilities,next.currentAbilities)}:{schema:SNAPSHOT_SCHEMA,kind:'full',observed:observed(snapshot),counts:next.counts,progress:next.progress,currentAbilities:next.currentAbilities};
  const record=Object.assign(body,{stateDigest:next.digest,recordDigest:stableDigest(body)});
  return{record,baseline:next,digest:next.digest,duplicate};
}
function applyPatch(base,patch){const out=Object.assign({},base||{});for(const [key,value] of Object.entries(patch||{})){if(value==null)delete out[key];else out[key]=rounded(value);}return sortObject(out);}
function applySnapshotRecord(previousBaseline,record,options){
  if(!record||record.schema!==SNAPSHOT_SCHEMA||!['full','delta'].includes(record.kind))throw new TypeError('Compact ORD snapshot record is required');
  if(record.kind==='delta'&&!previousBaseline)throw new TypeError('A baseline is required before a snapshot delta');
  const prior=record.kind==='full'?{counts:{},progress:{},currentAbilities:{}}:normalizeBaseline(previousBaseline),body={counts:applyPatch(record.kind==='full'?{}:prior.counts,record.counts),progress:applyPatch(record.kind==='full'?{}:prior.progress,record.progress),currentAbilities:applyPatch(record.kind==='full'?{}:prior.currentAbilities,record.currentAbilities)};
  // digest는 중복 판정용 — 재구성 전용 소비자(verdictReport)는 생략해
  // 레코드당 stableDigest 비용을 아낀다.
  return options&&options.digest===false?body:Object.assign(body,{digest:stableDigest(body)});
}
function reconstructSnapshots(records){const states=[];let baseline=null;for(const record of records||[]){baseline=applySnapshotRecord(baseline,record);states.push(baseline);}return states;}

function unitRef(value){
  if(!value)return{id:'',name:''};if(typeof value==='string')return{id:id(value),name:''};
  const unit=value.unit&&typeof value.unit==='object'?value.unit:value;
  return{id:id(first(value,['id','unitId','upperId'])||unit.id),name:text(first(value,['name','unitName','upperName'])||unit.name,100)};
}
function groupTier(value){
  const group=text(value,80).toLowerCase();
  if(/희귀|rare/.test(group))return'rare';if(/특별|special/.test(group))return'special';if(/안흔|uncommon/.test(group))return'uncommon';if(/흔함|common/.test(group))return'common';return'';
}
function stateUnit(state,unitId){
  const db=state&&state.db;if(db&&db.byId&&typeof db.byId.get==='function')return db.byId.get(unitId)||null;if(db&&db.byId&&db.byId[unitId])return db.byId[unitId];
  return(state&&state.units||[]).find(unit=>String(unit&&unit.id||'')===String(unitId))||null;
}
function tierCountsFromConsumed(action,state){
  const source=action&&action.tierUse||action&&action.consumedTierCounts||action&&action.consumedTiers||{},out={rare:0,special:0,uncommon:0,common:0};let direct=false;
  for(const tier of TIERS)if(finite(source[tier])!=null){out[tier]=rounded(source[tier]);direct=true;}
  if(direct)return out;
  const consumed=action&&action.solve&&action.solve.consumed||action&&action.spend||{};
  for(const [materialId,value] of Object.entries(consumed)){const material=stateUnit(state,materialId),tier=groupTier(material&&first(material,['groupName','tier','rarity','grade']));if(tier)out[tier]=rounded(out[tier]+number(value));}
  return out;
}
function compactRareUse(action){
  const raw=action&&action.solve&&action.solve.rareUse||action&&action.rareUse||{},byId=typeof raw==='object'&&raw?numericMap(raw,{positiveOnly:true,limit:LIMITS.mapItems}):{},total=typeof raw==='number'?number(raw):Object.values(byId).reduce((sum,value)=>sum+number(value),0);
  return{total:rounded(total),byId};
}
function compactWisp(action){
  const breakdown=action&&action.wispBreakdown||{},solve=action&&action.solve||{},out={cost:rounded(first(action,['wispCost'])!=null?first(action,['wispCost']):first(breakdown,['planned','current'])!=null?first(breakdown,['planned','current']):solve.wispCost),gap:rounded(first(action,['wispGap'])!=null?action.wispGap:breakdown.gap)};
  if(finite(first(action,['availableWisp']))!=null)out.available=rounded(action.availableWisp);else if(finite(breakdown.available)!=null)out.available=rounded(breakdown.available);
  if(finite(action&&action.remainingWisp)!=null)out.remaining=rounded(action.remainingWisp);
  return out;
}
function compactCompletion(source){
  source=source||{};
  const recipe=source.recipe||{};
  return{
    originalTmoPercent:rounded(source.originalTmoPercent),
    predictedTmoPercent:rounded(source.predictedTmoPercent),
    rankingPercent:rounded(source.rankingPercent),
    delta:rounded(source.delta),
    projected:bool(source.isProjected),
    method:text(source.method,48),
    virtualSpecialId:id(source.virtualSpecialId),
    virtualApplied:bool(source.virtualApplied),
    alreadyObserved:bool(source.alreadyObserved),
    recipe:{
      totalWispEquivalent:rounded(recipe.totalWispEquivalent),
      beforeWispEquivalent:rounded(recipe.beforeWispEquivalent),
      afterWispEquivalent:rounded(recipe.afterWispEquivalent),
      savedWispEquivalent:rounded(recipe.savedWispEquivalent)
    }
  };
}
function compactAction(action,state,index){
  action=action||{};const ref=unitRef(action),blocked=Array.isArray(action.blocked)?action.blocked:[],wisp=compactWisp(action),progress=first(action,['progress','completion','tmoPercent'])!=null?first(action,['progress','completion','tmoPercent']):first(action.unit||{},['tmoPercent','percent']),reason=first(action,['reason','watchReason'])||action.why&&action.why.headline||blocked[0]||'',completionSource=action.completionProjection||action.completionDetail||null;
  const feasible=action.feasible!=null?bool(action.feasible):(!blocked.length&&wisp.gap<=0&&(!action.prerequisite||action.prerequisite.allowed!==false));
  return{id:ref.id,name:ref.name,order:Math.max(1,Math.round(number(action.order,index+1))),feasible,progress:rounded(progress),completion:completionSource?compactCompletion(completionSource):null,wisp,rareUse:compactRareUse(action),consumed:tierCountsFromConsumed(action,state),reason:text(reason,180)};
}
function compactActions(rows,state,limit){return(rows||[]).slice(0,limit).map((row,index)=>compactAction(row,state,index));}

function compactRequirementRow(row){return{key:id(row&&row.key),label:text(row&&row.label,100),current:rounded(row&&row.current),target:rounded(row&&row.target),gap:rounded(row&&row.gap),required:bool(row&&row.required),weight:rounded(row&&row.weight)};}
function compactDeficits(source){
  source=source||{};const profile=source.profile||{},rows=source.clearRows||source.requirements||source.rows||source.deficits||[],priority=profile.priority||source.priority||source.priorities||[];
  return{complete:source.complete===true,readiness:rounded(source.readiness),priorities:cleanStringList(priority,12,80),rows:(rows||[]).slice(0,LIMITS.deficitRows).map(compactRequirementRow)};
}
function compactFinish(finish){finish=finish||{};return{status:text(finish.status,40),stable:rounded(finish.stable),expected:rounded(finish.expected),maximum:rounded(finish.maximum),largest:rounded(finish.largest),verifiedUnits:rounded(finish.verifiedUnits),maxUnits:rounded(finish.maxUnits),riskTags:cleanStringList(finish.riskTags,8,80)};}
function compactRouteEvaluation(source){
  source=source||{};return{route:text(source.route,40),status:text(source.status,40),label:text(source.label,100),note:text(source.note,180),confirmable:source.confirmable!==false,staticComplete:bool(source.staticComplete),roleOnly:bool(source.roleOnly),combatVerified:bool(source.combatVerified),baseMissing:rounded(source.baseMissing),finish:compactFinish(source.finish)};
}
function compactCheckpoint(source){source=source||{};return{key:text(source.key,24),dueRound:rounded(source.dueRound),status:text(source.status,32),pass:bool(source.pass),craftablePass:bool(source.craftablePass),requiredEquivalent:rounded(first(source,['requiredEquivalent','equivalent'])),blockers:cleanStringList(source.blockers,8,120)};}
function compactStage(source){
  source=source||{};const damage=source.damageCore||{},control=source.controlCore||{};
  return{boardCount:rounded(source.boardCount),legendEquivalent:rounded(source.legendEquivalent),upperCount:rounded(source.upperCount),nonUpperFinalCount:rounded(source.nonUpperFinalCount),mainUpperId:id(source.mainUpperId),damage:{pass:bool(damage.pass),progress:rounded(damage.progress),blockers:cleanStringList(damage.blockers,8,120)},control:{pass:bool(control.pass),blockers:cleanStringList(control.blockers,8,120)}};
}
function compactTimeline(source){
  source=source||{};const craftable=Object.assign(compactStage(source.craftableNow),{addedBoard:rounded(source.craftableNow&&source.craftableNow.addedBoard),addedEquivalent:rounded(source.craftableNow&&source.craftableNow.addedEquivalent),actionIds:cleanStringList(source.craftableNow&&source.craftableNow.actionIds,4,LIMITS.id)}),blueprint=source.blueprint||{},boss=source.boss50||{};
  return{round:rounded(source.round),actual:compactStage(source.actual),craftableNow:craftable,blueprint:{boardCount:rounded(blueprint.boardCount),legendEquivalent:rounded(blueprint.legendEquivalent),futureCount:rounded(blueprint.futureCount),futureDependencyCount:rounded(blueprint.futureDependencyCount)},checkpoints:(source.checkpoints||[]).slice(0,LIMITS.checkpoints).map(compactCheckpoint),currentCheckpoint:compactCheckpoint(source.currentCheckpoint),boss50:{status:text(boss.status,32),structuralPass:bool(boss.structuralPass),damagePass:bool(boss.damagePass),controlPass:bool(boss.controlPass),rarePass:bool(boss.rarePass),verified:bool(boss.verified),evidence:text(boss.evidence,140),blockers:cleanStringList(boss.blockers,10,120),note:text(boss.note,180)}};
}
function compactSafePrefix(source,state){
  source=source||{};const audit=source.audit||{};return{basis:text(source.basis,60),guaranteed:bool(source.guaranteed),mode:text(source.mode,24),route:text(source.route,32),checkpoint:compactCheckpoint(source.checkpoint),checkpointPass:bool(source.checkpointPass),actions:compactActions(source.actions||[],state,2),rareRemaining:rounded(source.rareRemaining),wispUsed:rounded(source.wispUsed),tierUse:Object.fromEntries(TIERS.map(tier=>[tier,rounded(source.tierUse&&source.tierUse[tier])])),audit:{level:text(audit.level,32),recipeVerified:bool(audit.recipeVerified),improvesActiveCheckpoint:bool(audit.improvesActiveCheckpoint),checkpointPassBefore:bool(audit.checkpointPassBefore),checkpointPassAfter:bool(audit.checkpointPassAfter),beforeEquivalent:rounded(audit.beforeEquivalent),afterEquivalent:rounded(audit.afterEquivalent),rareBefore:rounded(audit.rareBefore),rareAfter:rounded(audit.rareAfter),wispUsed:rounded(audit.wispUsed),regressedRequired:cleanStringList(audit.regressedRequired,8,100),evidence:text(audit.evidence,140)},blockers:cleanStringList(source.blockers,8,120),note:text(source.note,180)};
}
function compactWispBudget(source){source=source||{};return{available:rounded(source.available),required:rounded(source.required),used:rounded(source.used),reserved:rounded(source.reserved),futureWorstCase:rounded(source.futureWorstCase),worstCaseRequired:rounded(source.worstCaseRequired),remaining:rounded(source.remaining),shortage:rounded(source.shortage),withinBudget:bool(source.withinBudget),fullPartyFeasible:bool(source.fullPartyFeasible),evidence:text(source.evidence,80)};}
function tierSummary(source){
  source=source||{};const summary=source.summary||source;return{initial:rounded(summary.initial),spent:rounded(first(summary,['spent','used'])),reserved:rounded(summary.reserved),remaining:rounded(summary.remaining),conflict:rounded(summary.conflict),protected:rounded(summary.protected),usedTypes:rounded(summary.usedTypes),clearedTypes:rounded(summary.clearedTypes)};
}
function currentHand(state){
  const totals=Object.fromEntries(TIERS.map(tier=>[tier,{total:0,types:0}])),counts=state&&state.counts||{};
  for(const [unitId,value] of Object.entries(counts)){const count=Math.max(0,number(value)),unit=stateUnit(state,unitId),tier=groupTier(unit&&first(unit,['groupName','tier','rarity','grade']));if(!tier||count<=0)continue;totals[tier].total=rounded(totals[tier].total+count);totals[tier].types++;}
  return totals;
}
function compactHand(source,state){
  source=source||{};const tiers=source.tiers||{},wisp=source.wisp||{};return{current:currentHand(state),planned:Object.fromEntries(TIERS.map(tier=>[tier,tierSummary(tiers[tier])])),wisp:{initial:rounded(wisp.initial!=null?wisp.initial:state&&state.wisp),used:rounded(first(wisp,['used','spent'])),reserved:rounded(wisp.reserved),required:rounded(wisp.required),remaining:rounded(wisp.remaining),conflict:rounded(wisp.conflict),futureWorstCase:rounded(wisp.futureWorstCase)},feasible:source.feasible!==false,hardConflictTotal:rounded(source.hardConflictTotal)};
}
function compactRare(source,fallback){
  const timeline=source||{},fallbackRows=fallback&&fallback.rareAllocation||[],rows=(timeline.rows&&timeline.rows.length?timeline.rows:fallbackRows).slice(0,LIMITS.rareRows).map(raw=>{
    const ref=unitRef(raw),reserved=rounded(first(raw,['hold','reserved'])),remaining=rounded(raw.remaining),reroll=has(raw,'reroll')?rounded(raw.reroll):raw.rerollSuggested?remaining:0;
    return{id:ref.id,name:ref.name,initial:rounded(raw.initial),spent:rounded(raw.spent),hold:reserved,reroll,conflict:rounded(raw.conflict),deadlineRound:rounded(raw.deadlineRound),reason:text(raw.reason,160),destinations:(raw.destinations||raw.usedBy||[]).slice(0,LIMITS.rareDestinations).map(item=>{const target=unitRef(item);return{id:target.id,name:target.name,count:rounded(item.count),disposition:text(first(item,['disposition','status']),24),reason:text(item.reason,120)};})};
  });
  const calculated=rows.reduce((out,row)=>{out.owned+=row.initial;out.spent+=row.spent;out.hold+=row.hold;out.reroll+=row.reroll;out.conflict+=row.conflict;return out;},{owned:0,spent:0,hold:0,reroll:0,conflict:0});
  return{owned:rounded(has(timeline,'owned')?timeline.owned:calculated.owned),spent:rounded(has(timeline,'spentNow')?timeline.spentNow:calculated.spent),hold:rounded(has(timeline,'actionableReserved')?timeline.actionableReserved:calculated.hold),reroll:rounded(has(timeline,'unassigned')?timeline.unassigned:calculated.reroll),conflict:rounded(has(timeline,'conflict')?timeline.conflict:calculated.conflict),pass:timeline.pass===true||calculated.reroll<=0&&calculated.conflict<=0,rows};
}
function compactLineup(source){return(source||[]).slice(0,LIMITS.lineup).map(item=>{const ref=unitRef(item);return{id:ref.id,name:ref.name,status:text(item&&item.status,32),futureDropPending:bool(item&&item.futureDropPending)};});}
function compactSquad(source,state){
  source=source||{};const roles=source.roleCoverage&&source.roleCoverage.planned||{},decision=source.decision||{};
  return{mode:text(source.mode,24),route:text(source.magicRoute,32),complete:bool(source.complete),counts:{target:rounded(source.targetCount),projected:rounded(source.projectedCount),planned:rounded(source.plannedCount),targetBoard:rounded(source.targetBoardCount),projectedBoard:rounded(source.projectedBoardCount),plannedBoard:rounded(source.plannedBoardCount)},lineup:compactLineup(source.finalLineup),roles:compactDeficits(roles),priorityGroups:(decision.priorityGroups||[]).slice(0,6).map(group=>cleanStringList(group,6,60)),routeEvaluation:compactRouteEvaluation(source.routeEvaluation),safePrefix:compactSafePrefix(source.safePrefix,state),timeline:compactTimeline(source.timelineReadiness),wispBudget:compactWispBudget(source.wispBudget),rare:compactRare(source.timelineReadiness&&source.timelineReadiness.rare,source),hand:compactHand(source.handFit,state)};
}

function compactDirectionRow(row){
  row=row||{};const prefix=row.safePrefix||{},ref={id:id(row.upperId),name:text(row.upperName,100)};
  return{rank:rounded(row.rank),upperId:ref.id,upperName:ref.name,completion:rounded(row.completion),status:text(row.status,32),projectedComplete:bool(row.projectedComplete),guaranteedComplete:bool(row.guaranteedComplete),provisionalSelectable:bool(row.provisionalSelectable),readiness:rounded(row.readiness),wispCost:rounded(row.wispCost),wispShortage:rounded(row.wispShortage),rareUsed:rounded(row.rareUsed),rareRemaining:rounded(row.rareRemaining),checkpointPass:bool(prefix.checkpointPass),prefixActions:(prefix.actions||row.prefixActions||[]).slice(0,2).map((action,index)=>{const actionRef=unitRef(action);return{id:actionRef.id,name:actionRef.name,order:Math.max(1,Math.round(number(action.order,index+1))),wispCost:rounded(action.wispCost)};})};
}
function compactDirectionBoard(source){
  source=source||{};const provisional=source.provisionalDirection||{};
  return{loading:bool(source.loading),decision:text(source.decision,40),dominant:text(source.dominant,40),reason:text(source.reason,180),lanes:(source.lanes||[]).slice(0,LIMITS.directionLanes).map(lane=>({key:text(lane&&lane.key,32),mode:text(lane&&lane.mode,24),route:text(lane&&lane.route,32),label:text(lane&&lane.label,100),priority:text(lane&&lane.priority,180),rows:(lane&&lane.rows||[]).slice(0,LIMITS.directionRows).map(compactDirectionRow)})),provisional:{upperId:id(provisional.upperId),upperName:text(provisional.upperName,100),routeKeys:cleanStringList(provisional.routeKeys,3,32),checkpoint:compactCheckpoint(provisional.checkpoint),actions:(provisional.actions||[]).slice(0,2).map((action,index)=>{const ref=unitRef(action);return{id:ref.id,name:ref.name,order:index+1,wispCost:rounded(action.wispCost)};})}};
}
function compactUpper(plan,settings){const candidate=plan&&plan.upper||plan&&plan.mainUpper||(settings&&settings.upperPreviewId?{id:settings.upperPreviewId}:null);return unitRef(candidate);}
function compactV15RouteCandidate(row,index){
  row=row||{};const ref=unitRef(row),projection=row.projectedSupport||{},tiers=row.tiers||{},deadEnds=projection.deadEnds||[];
  // v17.4: 클리어 가치 부분점수를 기록에 남긴다 — 두 번째 55라 보스 사망
  // 로그에서 순위 근거를 사후 감사할 수 없었다.
  const value=row.clearValue||null;
  const clearValue=value?{value:rounded(value.value),story:rounded(value.story),dpsCover:rounded(value.dpsCover),line:rounded(value.line),rareUtil:rounded(value.rareUtil),utility:rounded(value.utility),roundsToGo:rounded(value.roundsToGo),deadlineFactor:rounded(value.deadlineFactor)}:null;
  return{rank:index+1,id:ref.id,name:ref.name,route:text(row.routeKey,32),routeLabel:text(row.routeLabel,100),feasible:bool(row.feasible),locked:bool(row.locked),nearestBuild:row.nearestBuild===true,storyReward:row.storyReward===true,clearValue,completion:rounded(row.completion),wispCost:rounded(row.wispCost),wispAfter:finite(row.wispAfter)==null?null:rounded(row.wispAfter),wispGap:rounded(row.wispGap),tiers:Object.fromEntries(TIERS.map(tier=>[tier,rounded(tiers[tier])])),exactPrefix:projection.exactPrefix===true,prefix:(projection.steps||[]).slice(0,3).map((step,stepIndex)=>({order:stepIndex+1,id:id(step.id),name:text(step.name,100),kind:text(step.kind,24),wispCost:rounded(step.wispCost)})),deadEnds:deadEnds.slice(0,8).map(item=>text(item&&item.label,100)),futureDropsCredited:projection.futureDropsCredited===true,fixedFinalParty:projection.fixedFinalParty===true,reason:text(row.reason,220)};
}
function compactV15(source,state){
  source=source||{};const action=source.action||{},proposed=source.action||source.blockedAction||{},assessment=source.assessment||{},rare=source.rare||{},best=source.bestPath||{},checkpoint=assessment.checkpoint||{},compactProposed=proposed&&proposed.id?Object.assign(compactAction(proposed.row||proposed,state,0),{executable:!!(source.action&&source.action.id),stopCondition:text(proposed.stopCondition,180),wispAfter:finite(proposed.wispAfter)==null?null:rounded(proposed.wispAfter),result:text(proposed.result,40),deltas:(proposed.deltas||[]).slice(0,10).map(compactRequirementRow)}):null;
  return{version:text(source.version,24),authority:source.authority===true,state:text(source.state,32),label:text(source.label,100),reason:text(source.reason,220),action:action&&action.id?Object.assign(compactAction(action.row||action,state,0),{stopCondition:text(action.stopCondition,180),wispAfter:rounded(action.wispAfter),result:text(action.result,40),deltas:(action.deltas||[]).slice(0,10).map(compactRequirementRow)}):null,proposed:compactProposed,routeCandidates:(source.routeCandidates||[]).slice(0,6).map(compactV15RouteCandidate),assessment:{status:text(assessment.status,32),label:text(assessment.label,120),checkpoint:{key:text(checkpoint.key,32),label:text(checkpoint.label,100),dueRound:rounded(checkpoint.dueRound)},structuralPass:bool(assessment.structuralPass),legendEquivalent:rounded(assessment.actual&&assessment.actual.legendEquivalent),upperCount:rounded(assessment.actual&&assessment.actual.upperCount),nonUpperFinalCount:rounded(assessment.actual&&assessment.actual.nonUpperFinalCount),rareRemaining:rounded(assessment.rareRemaining),blockers:cleanStringList(assessment.blockers,12,120),requirements:(assessment.requirements||[]).slice(0,18).map(compactRequirementRow),unknowns:cleanStringList(assessment.unknowns,8,120)},bestPath:{remainingWisp:rounded(best.remainingWisp),deadEnds:(best.deadEnds||[]).slice(0,8).map(row=>({index:rounded(row.index),label:text(row.label,100)})),steps:(best.steps||[]).slice(0,3).map((row,index)=>({id:id(row.id),name:text(row.name,100),order:index+1,wispCost:rounded(row.wispCost)}))},rare:{conflict:bool(rare.conflict),safeReroll:rare.safeReroll?{id:id(rare.safeReroll.id),name:text(rare.safeReroll.name,100)}:null,rows:(rare.rows||[]).slice(0,LIMITS.rareRows).map(row=>({id:id(row.id),name:text(row.name,100),initial:rounded(row.initial),use:rounded(row.use),hold:rounded(row.hold),reroll:rounded(row.reroll),reason:text(row.reason,160),exclusive:row.proof&&row.proof.exclusive===true}))},alternatives:(source.alternatives||[]).slice(0,2).map(row=>({id:id(row.id),name:text(row.name,100),wispCost:rounded(row.wispCost),reason:text(row.reason,180)})),recovery:source.recovery&&Array.isArray(source.recovery.targets)&&source.recovery.targets.length?{note:text(source.recovery.note,160),targets:source.recovery.targets.slice(0,4).map(row=>({id:id(row.id),name:text(row.name,100),roleKey:text(row.roleKey,32),roleLabel:text(row.roleLabel,60),wispCost:rounded(row.wispCost),wispGap:rounded(row.wispGap),feasible:bool(row.feasible),missing:(row.missing||[]).slice(0,3).map(item=>({name:text(item.name,60),count:rounded(item.count)}))}))}:null,unknowns:cleanStringList(source.unknowns,8,120),evidence:{ledger:text(source.evidence&&source.evidence.ledger,60),futureDropsCredited:bool(source.evidence&&source.evidence.futureDropsCredited),clearClaim:bool(source.evidence&&source.evidence.clearClaim)}};
}
function compactDecision(input){
  input=input||{};const plan=input.plan||input,state=input.state||plan.state||{},settings=input.settings||plan.settings||{},squad=plan.squadPlan||input.squadPlan||{},route=first(plan,['resolvedMagicRoute','magicRoute'])||squad.magicRoute||settings.magicRoute||'',deficitSource=plan.deficits||squad.roleCoverage&&squad.roleCoverage.core||squad.deficits||{},body={schema:DECISION_SCHEMA,round:rounded(first(settings,['currentRound'])!=null?settings.currentRound:first(plan,['round','currentRound'])!=null?first(plan,['round','currentRound']):squad.timelineReadiness&&squad.timelineReadiness.round),purpose:text(plan.purpose||settings.purpose,32),mode:text(plan.mode||settings.mode||squad.mode,24),route:text(route,32),upper:compactUpper(plan,settings),v15:compactV15(plan.v15Decision,state),actions:compactActions(plan.actions||[],state,LIMITS.actions),watch:compactActions(plan.watch||[],state,LIMITS.watch),deficits:compactDeficits(deficitSource),routeEvaluation:compactRouteEvaluation(plan.routeEvaluation||squad.routeEvaluation),direction:compactDirectionBoard(plan.directionBoard||input.directionBoard),squad:compactSquad(squad,state)};
  // v16: hollow sections were ~60% of every recorded decision (7.4MB logs).
  // Drop a section entirely when it carries no observation or judgement.
  const direction=body.direction||{},directionHollow=!direction.decision&&!direction.dominant&&!(direction.lanes&&direction.lanes.length)&&!(direction.provisional&&direction.provisional.upperId);
  if(directionHollow)delete body.direction;
  const squadBody=body.squad||{},squadCounts=squadBody.counts||{},squadHollow=!squadBody.mode&&!(squadBody.lineup&&squadBody.lineup.length)&&!rounded(squadCounts.planned)&&!rounded(squadCounts.target)&&!rounded(squadCounts.projected);
  if(squadHollow)delete body.squad;
  const evaluation=body.routeEvaluation||{},evaluationHollow=!evaluation.route&&!evaluation.status&&!evaluation.label&&!evaluation.note;
  if(evaluationHollow)delete body.routeEvaluation;
  if(body.v15&&body.v15.recovery==null)delete body.v15.recovery;
  const encoded=JSON.stringify(body);if(encoded.length>LIMITS.maxDecisionBytes)throw new RangeError(`ORD decision digest exceeded ${LIMITS.maxDecisionBytes} bytes`);
  return Object.assign(body,{digest:stableDigest(body)});
}

// v17.10(사용자 승인 1단계): 판정-결과 자동 대조 리포트.
// 한 판의 이벤트 스트림에서 "엔진 판정과 실제 실행이 어긋난 지점"을
// 자동 집계한다 — 미실행 ACT_NOW 연속 구간, 필수 결손 개방 라운드,
// 선택 대기 비용, 리롤 활용, 종료 시점 스냅샷. 성공·실패를 추정하지
// 않으며(사용자 입력·전멸 감지만 종료 신호로 사용) 계산 근거는 전부
// 기록에 이미 있는 값이다.
function verdictReport(events){
  const list=Array.isArray(events)?events:[];
  const asNum=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;};
  let cut=list.length,wipe=null,outcome=null;
  for(let index=0;index<list.length;index++){
    const event=list[index];
    if(event.type==='user-action'&&event.payload&&event.payload.action==='suspected-terminal-wipe'){wipe={round:asNum(event.payload.round)||asNum(event.round),lastLiveBoard:asNum(event.payload.lastLiveBoard)};cut=index+1;break;}
    if(event.type==='outcome'&&event.payload&&event.payload.kind&&event.payload.kind!=='r50_killed'){outcome={kind:String(event.payload.kind),round:asNum(event.payload.round)||asNum(event.round)};cut=index+1;break;}
  }
  const span=list.slice(0,cut);
  const decisions=[];
  for(let index=0;index<span.length;index++){
    const event=span[index];
    if(event.type!=='decision'||!event.payload||!event.payload.v15)continue;
    const v15=event.payload.v15;
    decisions.push({index,round:asNum(event.payload.round)||asNum(event.round),state:String(v15.state||''),action:v15.action&&v15.action.id?{id:String(v15.action.id),name:String(v15.action.name||v15.action.id)}:null,requirements:(v15.assessment&&v15.assessment.requirements||[]).filter(row=>row&&row.required!==false&&!row.waived)});
  }
  if(!decisions.length)return null;
  // 실행 확인은 두 경로: (a) 앱의 제작 확인(build-confirmed) 이벤트,
  // (b) 앱 확인 없이 게임에서만 제작한 경우 — TMO 스냅샷에서 해당
  // 유닛 수량이 실제로 늘었는지 재구성해 본다(전량 스냅샷 재구성).
  const snapshotCounts=[];{
    let baseline=null;
    for(let index=0;index<span.length;index++){
      const event=span[index];
      if(event.type!=='snapshot'||!event.payload)continue;
      try{baseline=applySnapshotRecord(baseline,event.payload,{digest:false});snapshotCounts.push({index,counts:baseline&&baseline.counts||{}});}catch(_){/* 선두 트림·손상으로 체인이 끊긴 레코드는 건너뜀 */}
    }
  }
  // 선두가 잘린 로그(head-trim)는 첫 full 스냅샷 전 구간에 수량 증거가
  // 없다 — 그 구간의 스트릭은 실행 여부를 단정할 수 없으므로 미실행으로
  // 보고하지 않는다(보수적 억제).
  const evidenceStart=snapshotCounts.length?snapshotCounts[0].index:Infinity;
  const countAtIndex=(id,eventIndex)=>{let value=0;for(const snap of snapshotCounts){if(snap.index>eventIndex)break;value=asNum(snap.counts[id]);}return value;};
  const builtBetween=(id,fromIndex,toIndex)=>{
    if(span.some((event,index)=>index>=fromIndex&&index<=toIndex&&event.type==='user-action'&&event.payload&&event.payload.action==='build-confirmed'&&(event.payload.steps||[]).some(step=>String(step.id||'')===id)))return true;
    // 스냅샷 수량 증가 = 게임 내 실행. 스트릭 종료 직후 3이벤트까지 여유.
    const before=countAtIndex(id,fromIndex),after=(()=>{let value=before;for(const snap of snapshotCounts){if(snap.index<fromIndex)continue;if(snap.index>toIndex+3)break;value=Math.max(value,asNum(snap.counts[id]));}return value;})();
    return after>before;
  };
  // 1) 미실행 ACT_NOW 연속 구간(3라운드 이상 같은 추천이 실행 없이 반복).
  const unexecuted=[];let streak=null;
  const closeStreak=endIndex=>{
    if(!streak)return;
    const roundSpan=streak.toRound-streak.fromRound+1;
    const provable=streak.startIndex>=evidenceStart;
    if(roundSpan>=3&&provable&&!builtBetween(streak.id,streak.startIndex,endIndex))unexecuted.push({id:streak.id,name:streak.name,fromRound:streak.fromRound,toRound:streak.toRound,rounds:roundSpan});
    streak=null;
  };
  for(const decision of decisions){
    if(decision.state==='ACT_NOW'&&decision.action){
      if(streak&&streak.id===decision.action.id){streak.toRound=Math.max(streak.toRound,decision.round);continue;}
      closeStreak(decision.index);
      streak={id:decision.action.id,name:decision.action.name,fromRound:decision.round,toRound:decision.round,startIndex:decision.index};
    }else closeStreak(decision.index);
  }
  closeStreak(span.length-1);
  unexecuted.sort((a,b)=>b.rounds-a.rounds);
  // 2) 필수 결손 개방 구간(라운드별 마지막 판정 기준).
  const lastByRound=new Map();
  for(const decision of decisions)lastByRound.set(decision.round,decision);
  const deficitMap=new Map();
  for(const decision of lastByRound.values())for(const row of decision.requirements){
    if(asNum(row.gap)<=0)continue;
    const key=String(row.key||'');
    const entry=deficitMap.get(key)||{key,label:String(row.label||key),openRounds:0,firstOpen:decision.round,lastOpen:decision.round,maxGap:0};
    entry.openRounds+=1;entry.firstOpen=Math.min(entry.firstOpen,decision.round);entry.lastOpen=Math.max(entry.lastOpen,decision.round);entry.maxGap=Math.max(entry.maxGap,asNum(row.gap));
    deficitMap.set(key,entry);
  }
  const lastDecision=decisions[decisions.length-1];
  const finalDeficits=lastDecision.requirements.filter(row=>asNum(row.gap)>0).map(row=>({key:String(row.key||''),label:String(row.label||row.key||''),gap:Math.round(asNum(row.gap)*100)/100}));
  const finalKeys=new Set(finalDeficits.map(row=>row.key));
  const deficits=[...deficitMap.values()].map(entry=>Object.assign(entry,{maxGap:Math.round(entry.maxGap*100)/100,openAtEnd:finalKeys.has(entry.key)})).sort((a,b)=>Number(b.openAtEnd)-Number(a.openAtEnd)||b.openRounds-a.openRounds).slice(0,6);
  // 3) 대기 비용(라운드별 마지막 판정 상태 기준 라운드 수).
  const waitCost={routeChoice:0,hold:0,syncBlocked:0,rerollSuggested:0};
  for(const decision of lastByRound.values()){
    if(decision.state==='ROUTE_CHOICE')waitCost.routeChoice+=1;
    else if(decision.state==='HOLD')waitCost.hold+=1;
    else if(decision.state==='SYNC_BLOCKED')waitCost.syncBlocked+=1;
    else if(decision.state==='REROLL_ONE')waitCost.rerollSuggested+=1;
  }
  // 4) 리롤 활용.
  const rerollUsed=span.filter(event=>event.type==='user-action'&&event.payload&&event.payload.action==='rare-reroll-confirmed').length;
  const rerollSuggestionRounds=new Set(decisions.filter(decision=>decision.state==='REROLL_ONE').map(decision=>decision.round));
  const rounds={first:decisions[0].round,last:lastDecision.round};
  const endRound=wipe?wipe.round:outcome&&outcome.round?outcome.round:rounds.last;
  const advice=[];
  if(unexecuted[0])advice.push(`${unexecuted[0].name} 제작 추천이 ${unexecuted[0].fromRound}~${unexecuted[0].toRound}라 ${unexecuted[0].rounds}라운드 동안 실행되지 않았습니다.`);
  const worstDeficit=deficits.find(entry=>entry.openAtEnd)||deficits[0];
  if(worstDeficit&&worstDeficit.openRounds>=5)advice.push(`${worstDeficit.label} 결손이 ${worstDeficit.firstOpen}라부터 ${worstDeficit.openAtEnd?'끝까지':`${worstDeficit.lastOpen}라까지`} ${worstDeficit.openRounds}라운드 열려 있었습니다(최대 부족 ${worstDeficit.maxGap}).`);
  if(waitCost.routeChoice>=5)advice.push(`상위 방향 선택 대기가 ${waitCost.routeChoice}라운드였습니다 — 대기 중에는 제작·리롤이 잠깁니다.`);
  if(rerollSuggestionRounds.size>0&&rerollUsed===0)advice.push(`리롤 제안이 ${rerollSuggestionRounds.size}라운드 있었지만 한 번도 쓰지 않았습니다(2회 무료).`);
  if(!advice.length)advice.push('엔진 판정과 실행이 크게 어긋난 구간이 없습니다.');
  return{version:1,endRound,endState:wipe?'wiped':outcome?`result:${outcome.kind}`:'active',rounds,wipe,outcome,unexecuted:unexecuted.slice(0,5),deficits,finalDeficits:finalDeficits.slice(0,6),waitCost,reroll:{used:rerollUsed,suggestedRounds:rerollSuggestionRounds.size},advice:advice.slice(0,4)};
}

return{
  VERSION,SNAPSHOT_SCHEMA,DECISION_SCHEMA,TIERS,LIMITS,
  compactSnapshot,applySnapshotRecord,reconstructSnapshots,compactDecision,compactDirectionBoard,compactV15,
  stableStringify,stableDigest,dedupe,verdictReport,
  _test:{text,numericMap,baselineOf,mapDelta,unitRef,groupTier,tierCountsFromConsumed,compactCompletion,compactAction,compactDeficits,compactTimeline,compactRare,currentHand,compactV15RouteCandidate,verdictReport}
};
});
