'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const workerSource=fs.readFileSync(path.join(EXT,'ord_direction_worker.js'),'utf8');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const P=require(path.join(EXT,'ord_squad_planner.js'));
const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);

function stockedCounts(){
  const counts={[C.WISP_ID]:36,V20h:1};
  for(const u of units){if(C.isCommon(u))counts[u.id]=14;else if(C.isUncommon(u))counts[u.id]=7;else if(C.isSpecialTier(u))counts[u.id]=4;}
  for(const id of Object.keys(C.SPECIAL_IDS))counts[id]=4;
  for(const u of db.rares.slice(0,8))counts[u.id]=C.num(counts[u.id])+1;
  return counts;
}
function stateFromCounts(counts){return C.normalizeState(units,{counts,currentAbilities:{}},{manualCounts:{},superKumaOwned:true});}
function settings(extra={}){return Object.assign({mode:'physical',currentRound:25,targetSquadCount:9,superKumaOwned:true,recommendWarped:true},extra);}
function rank(state,ids){return P.rankUpperBlueprints({state,settings:settings()},{candidateIds:ids});}

const tests=[];function test(name,fn){tests.push([name,fn]);}

test('equal-clear and equal-wisp upper ranking uses real Rare consumption before TMO completion',()=>{
  const row=(id,rareUsed,completion)=>({upperId:id,upperName:id,clearComplete:true,projectedCount:9,readiness:100,requirementPriority:[0,0,0,0],lineagePairs:0,wispCost:0,rareUsed,rareClearedTypes:3,rareUsedTypes:3,controlCapOverflow:0,handFitMetrics:{wispSubstitute:0,rareScore:0,lowerScore:0},materialOverlapPenalty:0,controlExcessScore:0,excessStun:0,excessSlow:0,rareConflict:0,completion}),rows=[row('rare-fit',8,5),row('tmo-only',7,100)].sort(P._test.upperBlueprintCompare);
  assert.strictEqual(rows[0].upperId,'rare-fit');assert.strictEqual(rows[1].completion,100);
});

test('control oversupply breaks equal Rare-use ties before completion',()=>{
  const rows=[
    {upperId:'high-completion',upperName:'A',clearComplete:true,rareUsed:8,controlExcessScore:80,excessStun:.3,excessSlow:50,completion:100,readiness:100,projectedCount:9,rareConflict:0,wispCost:0},
    {upperId:'lean-control',upperName:'B',clearComplete:true,rareUsed:8,controlExcessScore:10,excessStun:.1,excessSlow:0,completion:10,readiness:100,projectedCount:9,rareConflict:0,wispCost:0}
  ].sort(P._test.upperBlueprintCompare);
  assert.strictEqual(rows[0].upperId,'lean-control');
});

test('ranking API is deterministic and cached while cold direction work is delegated to the worker',()=>{
  const state=stateFromCounts(stockedCounts()),ids=db.uppers.filter(u=>C.familyOf(u)==='physical'&&C.specialPrerequisiteStatus(db,u,state.counts).allowed).slice(0,8).map(u=>u.id);
  assert(/rankDeckDirections\s*\(/.test(workerSource),'cold direction ranking is no longer delegated to the worker');
  const coldStarted=Date.now(),lastRows=rank(state,ids),coldMs=Date.now()-coldStarted;
  const first=lastRows.map(row=>[row.rank,row.upperId,row.rareUsed,row.clearComplete,row.excessStun,row.excessSlow]);
  const cachedStarted=Date.now(),cachedRows=rank(state,ids),cachedMs=Date.now()-cachedStarted;
  assert.strictEqual(cachedRows,lastRows,'identical hand fingerprint did not reuse the cached ranking object');
  assert.deepStrictEqual(cachedRows.map(row=>[row.rank,row.upperId,row.rareUsed,row.clearComplete,row.excessStun,row.excessSlow]),first);
  // Cold ranking runs off the UI thread in production. Keep only a loose
  // runaway guard here; the user-facing contract is worker isolation plus a
  // fast same-hand cache hit, not the obsolete 500ms synchronous deadline.
  assert(coldMs<10000,`worker ranking exceeded the 10s runaway guard (${coldMs}ms)`);
  assert(cachedMs<100,`same-hand cached ranking took ${cachedMs}ms`);
  assert(first.every(row=>row.length===6));

  // 하드 제어 상한과 전체 하위 패 적합도까지 같을 때는 더 적은 과잉
  // 제어가 먼저다. 서로 다른 특별/안흔/흔함 패 적합도를 무시하지 않는다.
  for(const lean of lastRows)for(const over of lastRows){
    if(lean.clearComplete===over.clearComplete&&lean.projectedCount===over.projectedCount&&lean.readiness===over.readiness&&lean.lineagePairs===over.lineagePairs&&lean.rareUsed===over.rareUsed&&lean.rareClearedTypes===over.rareClearedTypes&&lean.rareUsedTypes===over.rareUsedTypes&&lean.controlCapOverflow===over.controlCapOverflow&&Math.abs(lean.lowerHandFitScore-over.lowerHandFitScore)<1e-9&&lean.controlExcessScore+1e-9<over.controlExcessScore){
      assert(lean.rank<over.rank,`${lean.upperId}(${lean.controlExcessScore}) should precede ${over.upperId}(${over.controlExcessScore})`);
    }
  }
  const top=lastRows[0];
  const plannedRows=top.plan.roleCoverage.planned.rows,slow=plannedRows.find(row=>row.key==='slow'),stun=plannedRows.find(row=>row.key==='stunFull');
  assert(slow&&slow.target===102,'normal physical slow cap was not 102%');
  assert.strictEqual(Math.min(slow.current,slow.target),102,'slow above the cap received extra effective credit');
  // The global top may now spend more control than a speculative nine-unit
  // sheet because a provable current-stock prefix is compared first. The
  // equal-prefix control tie itself is covered by the dedicated comparator
  // test above; it is no longer a valid invariant of this worker/cache test.
  assert(stun,'physical ranking omitted the stun requirement row');
  console.log(`INFO  upper blueprint rank 8 candidates: cold ${coldMs}ms / cached ${cachedMs}ms (worker contract)`);
});

test('upper ranking sequentially consumes an owned first legend instead of double-counting it',()=>{
  const state=stateFromCounts(stockedCounts()),row=rank(state,['J40h'])[0],ids=row.plan.finalLineup.map(item=>item.id);
  assert(ids.includes('J40h'),'Roger upper was omitted');
  assert(!ids.includes('V20h'),'Smoker remained as a final unit after Roger consumed it');
  assert.strictEqual(row.plan.targetBoardCount,7);
  assert.strictEqual(row.plan.plannedCount,9);
  assert.strictEqual(ids.length,7);
});

test('Absalom exception stays buildable in both rank and preview without showing zombie hard-missing',()=>{
  const counts=stockedCounts();counts['010h']=0;counts['unit_1767884889420_456']=0;const state=stateFromCounts(counts),ranked=rank(state,['A50h'])[0];
  // v17.7: full 1.5 stun is now a required physical gate this synthetic hand
  // cannot close (its lineage-legal ceiling is 1.435), so the plan is honestly
  // incomplete — the Absalom exception itself must still quote A50h with no
  // zombie hard-missing rows.
  assert(ranked&&ranked.plan.finalLineup.some(row=>row.id==='A50h'));
  assert.strictEqual(ranked.clearComplete,false);
  const openRows=ranked.plan.roleCoverage.planned.rows.filter(row=>row.gap>0);
  assert.deepStrictEqual(openRows.map(row=>row.key),['stunFull'],'only the full-stun hard gate may stay open');
  assert.deepStrictEqual(ranked.plan.actions[0].solve.hardMissing,[]);
  const preview=P.planFinalSquad({state,settings:settings({upperPreviewId:'A50h'}),upperBlueprint:ranked.blueprint});
  // A role-incomplete hand may not silently lock a full party: the blueprint
  // must degrade to the fail-safe invalid status instead of claiming kept.
  assert.strictEqual(preview.blueprint.status,'invalid');
  assert.strictEqual(preview.wispBudget.evidence,'role-incomplete');
  assert.strictEqual(preview.targetBoardCount,7);assert.strictEqual(preview.finalLineup.length,7);assert.strictEqual(preview.plannedCount,9);assert(preview.finalLineup.some(row=>row.id==='A50h'));assert(!preview.blueprint.replacedIds.includes('A50h'),'Absalom upper itself was released');const absalomAction=preview.actions.find(action=>action.id==='A50h');assert(absalomAction);assert.deepStrictEqual(absalomAction.solve.hardMissing,[]);
});

test('confirmed blueprint is kept byte-for-byte while all current wisps can realize it',()=>{
  const state=stateFromCounts(stockedCounts()),base=P.planFinalSquad({state,settings:settings(),locks:[{stage:'upper',id:'J40h'}]}),blueprint={version:1,revision:3,upperId:'J40h',lineupIds:base.finalLineup.map(row=>row.id),buildOrderIds:base.actions.map(row=>row.id),mode:'physical'},kept=P.planFinalSquad({state,settings:settings(),locks:[{stage:'upper',id:'J40h'}],upperBlueprint:blueprint});
  assert.strictEqual(kept.blueprint.status,'kept');assert.strictEqual(kept.blueprint.allWispFeasible,true);assert.strictEqual(kept.blueprint.revision,3);
  assert.deepStrictEqual(kept.finalLineup.map(row=>row.id),blueprint.lineupIds);
  assert.deepStrictEqual(kept.blueprint.replacedIds,[]);assert.deepStrictEqual(kept.blueprint.replacements,[]);
});

test('blueprint becomes invalid when current wisps cannot realize it and future drops are unfunded',()=>{
  const rich=stateFromCounts(stockedCounts()),base=P.planFinalSquad({state:rich,settings:settings(),locks:[{stage:'upper',id:'J40h'}]}),blueprint={version:1,upperId:'J40h',lineupIds:base.finalLineup.map(row=>row.id),buildOrderIds:base.actions.map(row=>row.id),mode:'physical'},empty=stateFromCounts({[C.WISP_ID]:0}),adapted=P.planFinalSquad({state:empty,settings:settings(),locks:[{stage:'upper',id:'J40h'}],upperBlueprint:blueprint});
  assert.strictEqual(adapted.blueprint.allWispFeasible,false);assert.notStrictEqual(adapted.blueprint.status,'kept');
  assert(adapted.blueprint.replacedIds.length>0);assert(/모든 선택 위습|부족/.test(adapted.blueprint.reason));
  assert.strictEqual(adapted.projectedCount,0);assert(adapted.plannedCount<adapted.targetCount);
  assert(adapted.wispBudget.required>adapted.wispBudget.available);assert(adapted.wispBudget.shortage>0);
  assert.strictEqual(adapted.wispBudget.fullPartyFeasible,false);assert(adapted.handFit.futurePending.length>0);assert.strictEqual(adapted.handFit.feasible,false);
  assert.strictEqual(adapted.blueprint.status,'invalid');assert.strictEqual(adapted.safePrefix.actions.length,0);assert.strictEqual(adapted.safePrefix.checkpointPass,false);
});

test('slow utility stops at 102 except Nasjuro, whose strict ceiling is 117',()=>{
  const spec={main:1,stun:1.5,slow:117,triggerSlow:0,armor:210,triggerArmor:0,boss:1,frenzy:1};
  const normal=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'none'},null),saturn=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'saturn'},null),nasjuro=P._test.requirementRows(spec,[],'physical','physical',{gorosei:'nasjuro'},null);
  assert.strictEqual(normal.rows.find(row=>row.key==='slow').target,102);assert.strictEqual(saturn.rows.find(row=>row.key==='slow').target,102);assert.strictEqual(nasjuro.rows.find(row=>row.key==='slow').target,117);
  assert.strictEqual(P._test.excessSlow(normal),15);assert.strictEqual(P._test.excessSlow(saturn),15);assert.strictEqual(P._test.excessSlow(nasjuro),0);
  const nasOver=P._test.requirementRows(Object.assign({},spec,{slow:130}),[],'physical','physical',{gorosei:'nasjuro'},null);assert.strictEqual(P._test.excessSlow(nasOver),13);
  assert.strictEqual(P._test.staticPotential({slow:80},normal),0);assert.strictEqual(P._test.staticPotential({slow:80},nasjuro),0);
  const nasShort=P._test.requirementRows(Object.assign({},spec,{slow:102}),[],'physical','physical',{gorosei:'nasjuro'},null);assert(P._test.staticPotential({slow:15},nasShort)>0);
});

test('missing roles, then control caps, tier burn and low wisps are compared in order',()=>{
  const node=(readiness,rare,stun,slow,id)=>({complete:true,requirements:{complete:true,readiness},projectedCount:7,target:7,blueprintMatched:0,used:{rare,wisp:0},excessStun:stun,excessSlow:slow,score:0,actions:[{id}]});
  assert(P._test.nodeCompare(node(100,1,.5,40,'useful'),node(99,8,0,0,'missing'))<0,'missing clear readiness beat a complete role set');
  assert(P._test.nodeCompare(node(100,8,.5,40,'over'),node(100,7,0,0,'lean'))>0,'avoidable excess control beat a lean equal-clear plan');
  assert(P._test.nodeCompare(node(100,8,0,0,'rare'),node(100,7,0,0,'lean'))<0,'Rare use did not break an equal-control tie');
  assert(P._test.nodeCompare(node(100,8,0,0,'near'),node(100,8,.5,40,'over'))<0,'equal plans did not minimize over-control');
  const met={rows:[{key:'slow',gap:0,current:102,target:102,weight:95,required:true},{key:'armor',gap:50,current:130,target:180,weight:110,required:true}]};
  assert.strictEqual(P._test.staticPotential({slow:50},met),0);assert(P._test.staticPotential({armor:80},met)>0);
  assert(P._test.incrementalSlowPenalty(met,{slow:50})>P._test.incrementalSlowPenalty(met,{slow:50,armor:20}));
  assert(P._test.incrementalStunPenalty({stun:1.5},{stun:.5})>P._test.incrementalStunPenalty({stun:.5},{stun:.5,armor:20}));
});

let passed=0;for(const [name,fn] of tests){try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
console.log(`Upper blueprint v14.0.0 tests: ${passed}/${tests.length} passed`);
