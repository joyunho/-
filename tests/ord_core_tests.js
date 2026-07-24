'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
const unit=(re,pred=()=>true)=>{const hit=units.find(candidate=>re.test(C.nameOf(candidate))&&pred(candidate));assert(hit,`unit not found: ${re}`);return hit;};
const baseSettings=(extra={})=>Object.assign({
  mode:'physical',magicRoute:'auto',targetSquadCount:9,purpose:'',gorosei:'none',
  superKumaOwned:true,virtualSpecialId:'',wispOverride:'',upperPreviewId:'',
  currentRound:1,manualCounts:{},allowWarped:true,recommendWarped:true,stunConditions:{}
},extra);
function makeState({counts={},progress={},abilities={},settings={}}={}){
  const live=Object.entries(progress).map(([id,value])=>({id,count:counts[id]||0,tmoPercent:value,percent:value}));
  return C.normalizeState(units,{source:'fixture',at:Date.now(),units:live,counts,currentAbilities:abilities},baseSettings(settings));
}
function countsFor(predicate,n=5){const out={[C.WISP_ID]:90};for(const candidate of units)if(predicate(candidate))out[candidate.id]=n;for(const id of Object.keys(C.SPECIAL_IDS))out[id]=Math.max(out[id]||0,2);return out;}
function plan(state,locks,settings){return C.recommendationPlan(state,locks,baseSettings(settings),ORD_UPPER_MEMO,ORD_SYNERGY_MEMO);}

test('v13 catalog and core exports are coherent',()=>{
  assert.strictEqual(C.VERSION,'17.9.0');
  assert(units.length>=300);
  assert.strictEqual(new Set(units.map(candidate=>candidate.id)).size,units.length);
  assert.strictEqual(typeof C.gameFlow,'function');
  assert.strictEqual(typeof C.clearProfileDetails,'function');
});

test('known role corrections include Sunny as frenzy-only with zero stun',()=>{
  const sunny=unit(/^써니호/,C.isShip),red=unit(/^레드포스호/,C.isShip),maxim=unit(/^방주맥심/,C.isShip),bear=unit(/^S-베어/),barges=unit(/^바제스/,C.isWarped);
  assert.deepStrictEqual([C.stunResearch(sunny).displayStun,C.roleProfile(sunny).stun,C.roleProfile(sunny).boss,C.roleProfile(sunny).frenzy],[0,0,false,true]);
  assert.strictEqual(C.roleProfile(red).stun,0);
  assert.deepStrictEqual([C.roleProfile(maxim).magicDef,C.roleProfile(maxim).explosionAmp],[10,10]);
  assert.deepStrictEqual([C.roleProfile(bear).end,C.roleProfile(bear).stun],[0,.25]);
  assert.deepStrictEqual([C.magicFinishProfile(bear).directCredit,C.magicFinishProfile(bear).maxCredit],[0,1]);
  assert.deepStrictEqual([C.familyOf(barges),C.roleProfile(barges).single],['magic',1]);
});

test('representative base stun research remains reproducible and conditional input is ignored',()=>{
  const expected={V10h:[.159,22.53],W20h:[.935,77.78],Z80H:[2.015,96.09],D40h:[1.448,90.28],L30h:[0,0]};
  for(const [id,[display,capture]] of Object.entries(expected)){
    const research=C.stunResearch(db.byId.get(id));
    assert.deepStrictEqual([research.displayStun,research.capture],[display,capture],id);
    assert.strictEqual(C.stunCaptureRate(C.roleProfile(db.byId.get(id)).stun),capture,id);
  }
  const base=C.stunResearch(db.byId.get('B90H'));
  const enabledState=makeState({settings:{stunConditions:{B90H:true}}});
  const enabled=C.stunResearch(enabledState.db.byId.get('B90H'));
  assert.deepStrictEqual([base.active,C.roleProfile(db.byId.get('B90H')).stun],[false,0]);
  assert.deepStrictEqual([enabled.active,enabled.displayStun,enabled.capture,enabled.variant],[false,0,0,null]);
  assert.deepStrictEqual(enabledState.stunConditions,{});
  assert.strictEqual(C.STUN_RESEARCH.B90H.variant,undefined);
  assert.deepStrictEqual(C.skillFacts(enabledState.db.byId.get('B90H')).researchVariants,[]);
  const off=makeState({counts:{B90H:1}}),on=makeState({counts:{B90H:1},settings:{stunConditions:{B90H:true,A40h:true,C50h:true,F50h:true}}});
  assert.strictEqual(C.currentSpec(on,'physical',baseSettings()).stun,C.currentSpec(off,'physical',baseSettings()).stun);
});

test('TMO completion percentage preserves an exact 100',()=>{
  const target=unit(/크로커다일/,C.isUpper),state=makeState({progress:{[target.id]:100}});
  assert.strictEqual(C.completionPercent(state,state.db.byId.get(target.id)),100);
});

test('first rare recommendation is forced by TMO completion even when incomplete, reserved, or strategically weaker',()=>{
  const blank=makeState(),ranked=db.rares.map(candidate=>({candidate,wisp:C.recipeSolve(blank.db,candidate.id,blank.counts).wispCost})).sort((a,b)=>b.wisp-a.wisp||a.candidate.id.localeCompare(b.candidate.id)),target=ranked[0].candidate,locked=ranked[ranked.length-1].candidate;
  assert(ranked[0].wisp>0,'fixture must make the target incomplete without wisps');
  const state=makeState({progress:{[target.id]:99,[locked.id]:98}}),result=plan(state,[{stage:'rare',id:locked.id}],{currentRound:7,purpose:'spec',mode:'physical'});
  assert.deepStrictEqual([result.flow.purpose,result.purpose,result.completionForced],['rare','rare',true]);
  assert.strictEqual(result.actions[0].unit.id,target.id);
  assert.strictEqual(result.actions[0].progress,99);
  assert.strictEqual(result.actions[0].feasible,false);
  assert.strictEqual(result.availableWisp,0,'reserved route must not replace the actual hand for early ranking');
});

test('completion ties use actual-hand wisp cost, then Korean name and stable id',()=>{
  const blank=makeState(),byCost=db.rares.map(candidate=>({candidate,wisp:C.recipeSolve(blank.db,candidate.id,blank.counts).wispCost})),groups=new Map;for(const row of byCost)(groups.get(row.wisp)||groups.set(row.wisp,[]).get(row.wisp)).push(row);const expensive=byCost.slice().sort((a,b)=>b.wisp-a.wisp)[0],sameCost=[...groups.entries()].filter(([cost,rows])=>cost<expensive.wisp&&rows.length>=2).sort((a,b)=>a[0]-b[0])[0][1].slice(0,2);
  assert(sameCost.length===2&&sameCost[0].wisp<expensive.wisp,'fixture must cover both tie keys');
  const tied=[expensive,...sameCost],progress=Object.fromEntries(tied.map(row=>[row.candidate.id,88])),expected=tied.slice().sort((a,b)=>a.wisp-b.wisp||C.nameOf(a.candidate).localeCompare(C.nameOf(b.candidate),'ko')||(a.candidate.id<b.candidate.id?-1:1));
  const result=plan(makeState({progress}),[],{currentRound:7});
  assert.deepStrictEqual(result.actions.map(row=>row.unit.id).slice(0,expected.length),expected.slice(0,3).map(row=>row.candidate.id));

  const template=db.rares[0],a=Object.assign({},template,{id:'tie_a',name:'동률 희귀',stuffs:[]}),z=Object.assign({},template,{id:'tie_z',name:'동률 희귀',stuffs:[]}),catalog=units.concat([z,a]),state=C.normalizeState(catalog,{units:[{id:a.id,tmoPercent:100},{id:z.id,tmoPercent:100}],counts:{}},baseSettings()),idPlan=C.recommendationPlan(state,[],baseSettings({currentRound:7}),ORD_UPPER_MEMO,ORD_SYNERGY_MEMO);
  assert.deepStrictEqual(idPlan.actions.slice(0,2).map(row=>row.unit.id),['tie_a','tie_z']);
});

test('first legend recommendation compares every exact legend and hidden by completion across damage families',()=>{
  const rare=db.rares[0],exact=db.legendish.filter(candidate=>/^전설|^히든/.test(C.groupName(candidate))),target=exact.find(candidate=>C.familyOf(candidate)==='magic'),physical=exact.find(candidate=>C.familyOf(candidate)==='physical'),warped=db.legendish.find(C.isWarped);
  assert(target&&physical&&warped);
  const counts={[rare.id]:1,'unit_1767884906256_4990':1},progress={[target.id]:97,[physical.id]:96,[warped.id]:100},state=makeState({counts,progress}),result=plan(state,[{stage:'legend',id:physical.id}],{currentRound:15,purpose:'spec',mode:'physical'});
  assert.deepStrictEqual([result.flow.purpose,result.purpose,result.completionForced],['story','story',true]);
  assert.strictEqual(result.actions[0].unit.id,target.id,'mode, route reservation, and strategy score changed the closest exact legend/hidden');
  assert(result.actions.every(row=>/^전설|^히든/.test(C.groupName(row.unit))));
  assert(!result.rows.some(row=>row.unit.id===warped.id));
});

test('recommendation purpose advances only when each inventory milestone is fulfilled',()=>{
  const low=countsFor(candidate=>C.isCommon(candidate)||C.isUncommon(candidate)||C.isSpecialTier(candidate));
  const rareState=makeState({counts:low}),rarePlan=plan(rareState,[],{currentRound:7});
  assert.strictEqual(rarePlan.purpose,'rare');
  assert(rarePlan.actions.every(row=>C.isRare(row.unit)));

  const rare=db.rares[0],withRare=Object.assign({},low,{[rare.id]:1}),storyPlan=plan(makeState({counts:withRare}),[],{currentRound:15});
  assert.strictEqual(storyPlan.purpose,'story');
  assert(storyPlan.actions.every(row=>/^전설|^히든/.test(C.groupName(row.unit))));

  const legend=db.legendish.find(candidate=>!C.isUpper(candidate)),withLegend=Object.assign({},low,{[legend.id]:1}),upperPlan=plan(makeState({counts:withLegend}),[],{currentRound:25,mode:'physical',postLegendRoute:'upper'});
  assert.strictEqual(upperPlan.purpose,'upper');
  assert(upperPlan.actions.every(row=>C.isUpper(row.unit)&&row.progress>=80));
});

test('upper actions require 80 percent while watch candidates start at 60',()=>{
  const counts=countsFor(candidate=>!C.isUpper(candidate));
  const physical=db.uppers.filter(candidate=>C.familyOf(candidate)==='physical').slice(0,3);
  const p=plan(makeState({counts,progress:{[physical[0].id]:79,[physical[1].id]:80,[physical[2].id]:100}}),[],{currentRound:25,mode:'physical',postLegendRoute:'upper'});
  assert(p.actions.every(row=>row.progress>=80));
  assert(!p.actions.some(row=>row.unit.id===physical[0].id));
  assert(p.watch.some(row=>row.unit.id===physical[0].id));
  assert(p.watch.every(row=>row.progress>=60));
});

test('locked routes reserve materials and selection wisps exactly once',()=>{
  const upper=unit(/크로커다일/,C.isUpper),rare=unit(/와이퍼/,C.isRare),legend=unit(/센고쿠/,candidate=>/^전설|^히든/.test(C.groupName(candidate))),state=makeState({counts:{[C.WISP_ID]:100,[legend.id]:1}});
  const p=plan(state,[{stage:'rare',id:rare.id},{stage:'upper',id:upper.id}],{currentRound:40,mode:'physical'});
  assert.strictEqual(p.reserved.reservations.length,2);
  assert(p.reserved.reservedWispCost>0);
  assert.strictEqual(p.availableWisp,100-p.reserved.reservedWispCost);
  const upperOnly=C.reserveTargets(state.db,state.counts,[upper.id]);
  const nested=C.reserveTargets(state.db,state.counts,[rare.id,upper.id]);
  assert(nested.reservedWispCost>=upperOnly.reservedWispCost);
});

test('warped wood and recommendation routes stay usable regardless of stale switches',()=>{
  const warped=db.legendish.find(C.isWarped),state=makeState({counts:{[C.WISP_ID]:100}}),mode=C.familyOf(warped)==='magic'?'magic':'physical',off=baseSettings({mode,currentRound:50,allowWarped:false,recommendWarped:false}),on=baseSettings({mode,currentRound:50,allowWarped:false,recommendWarped:true}),rowFor=settings=>C.candidateRow(state,warped,{mode,spec:C.currentSpec(state,mode,settings),deficits:C.deficits(C.currentSpec(state,mode,settings),mode,settings),settings,round:50,purpose:'spec',stock:state.counts,availableWisp:100});
  assert(!rowFor(off).blocked.some(reason=>/왜곡|목재/.test(reason)),rowFor(off).blocked.join(' · '));
  assert(!rowFor(on).blocked.some(reason=>/왜곡|목재/.test(reason)),rowFor(on).blocked.join(' · '));
});

test('spec actions form a material-compatible sequential queue',()=>{
  const upper=unit(/크로커다일/,C.isUpper),counts=countsFor(candidate=>C.isCommon(candidate)||C.isUncommon(candidate)||C.isSpecialTier(candidate)||C.isRare(candidate));
  counts[upper.id]=1;
  const state=makeState({counts}),p=plan(state,[],{currentRound:45,mode:'physical'});
  assert.strictEqual(p.selectionMode,'queue');
  let stock=Object.assign({},p.reserved.stock),wisp=p.availableWisp;
  for(const row of p.actions){
    assert.strictEqual(row.availableWisp,wisp);
    const solve=C.recipeSolve(state.db,row.unit.id,stock);
    assert.strictEqual(row.solve.wispCost,solve.wispCost);
    assert.deepStrictEqual(row.solve.consumed,solve.consumed);
    stock=solve.stockAfter;wisp-=solve.wispCost;stock[C.WISP_ID]=wisp;stock[row.unit.id]=(stock[row.unit.id]||0)+1;
  }
  assert(wisp>=0);
});

test('lowest missing common count equals selection-wisp cost',()=>{
  const target=unit(/와이퍼/,C.isRare),state=makeState({counts:{[C.WISP_ID]:50}}),solve=C.recipeSolve(state.db,target.id,state.counts);
  assert.strictEqual(Object.values(solve.lowestMissing).reduce((sum,value)=>sum+value,0),solve.wispCost);
});

test('build projection consumes the old unit and adds the completed unit',()=>{
  const kuma=unit(/^쿠마(?:\s|\()/,candidate=>C.isLegendish(candidate)),bear=unit(/^S-베어/);
  const counts={[C.WISP_ID]:100,[kuma.id]:1,'unit_1779016778159_2512':1},state=makeState({counts});
  const base=C.currentSpec(state,'magic',baseSettings({mode:'magic'}));
  const step=C.applyBuildStep(state,base,state.counts,bear,'magic',100);
  assert.strictEqual(step.solve.consumed[kuma.id],1);
  assert.strictEqual(step.stock[kuma.id],0);
  assert.strictEqual(step.stock[bear.id],1);
  assert.strictEqual(step.spec.stun,.25);
});

test('duplicate rare branches are counted in protected routes',()=>{
  const robin=unit(/로빈/,C.isTranscend),kaku=unit(/^카쿠$/,C.isRare),state=makeState({counts:{[kaku.id]:2}});
  const rows=C.rareResolution(state,{actions:[],prep:[]},[{stage:'upper',id:robin.id}]);
  const row=rows.find(item=>item.unit.id===kaku.id);
  assert(row&&row.use>=2,`expected Kaku x2, got ${row&&row.use}`);
});

test('rare pressure keeps protected cards out of expendable stock',()=>{
  const [a,b,c]=db.rares.slice(0,3),counts={[C.WISP_ID]:20,[a.id]:3,[b.id]:4,[c.id]:2},state=makeState({counts});
  const spendable=Object.assign({},counts,{[a.id]:2,[b.id]:4,[c.id]:1});
  const inv=C.rareInventoryFor(state,spendable,{[a.id]:1,[c.id]:1}),pressure=C.rarePressureForInventory(inv,55);
  assert.deepStrictEqual([inv.total,inv.types,inv.protected,inv.expendable],[9,3,2,7]);
  assert.deepStrictEqual([pressure.targetTotal,pressure.excessTotal,pressure.shouldSpend],[2,7,true]);
  assert.match(pressure.note,/총 9장 · 보호 2장 · 소진 가능 7장 · 목표 2장/);
});

test('special material ids and upper synergy coverage are stable',()=>{
  assert.strictEqual(C.SPECIAL_IDS['unit_1767884840242_5227'],'랜덤유닛');
  assert.strictEqual(C.SPECIAL_IDS['unit_1767884871133_6843'],'토큰');
  assert.strictEqual(C.SPECIAL_IDS['unit_1767884970331_9084'],'고대의 배');
  for(const upper of units.filter(C.isUpper))assert.notStrictEqual(ORD_SYNERGY_MEMO.byUnitId[upper.id],undefined,upper.id);
});

test('upper variants collapse to one route and prefer the active upgrade',()=>{
  const base=db.byId.get('F90H'),upgrade=db.byId.get('unit_1767356628978_5789');
  const state=makeState({counts:{[base.id]:1,[upgrade.id]:1}});
  assert.strictEqual(C.canonicalUpperId(upgrade.id),base.id);
  assert.strictEqual(C.activeUpperVariant(state,base).id,upgrade.id);
  assert.strictEqual(C.mainUpper(state,[],baseSettings()).id,upgrade.id);
  assert.deepStrictEqual(C.ownedDisplayUnits(state,C.isUpper).filter(item=>C.canonicalUpperId(item.id)===base.id).map(item=>item.id),[upgrade.id]);
});

test('every catalog unit has an evidence-labelled story grade',()=>{
  const allowedBasis=new Set(['measured','research','estimated','na']),allowedTier=new Set(['S','A','B','C','D','—']),counts={};
  for(const candidate of db.units){
    const grade=C.storyGrade(candidate);
    assert(grade&&Number.isFinite(grade.score),candidate.id);
    assert(allowedBasis.has(grade.basis),`${candidate.id}:${grade.basis}`);
    assert(allowedTier.has(grade.tier),`${candidate.id}:${grade.tier}`);
    assert(grade.note&&grade.basisLabel,candidate.id);
    counts[grade.basis]=(counts[grade.basis]||0)+1;
  }
  assert(counts.measured>0&&counts.research>0&&counts.estimated>0&&counts.na>0);
});

test('v13 snapshot health uses freshness and confidence, not old row/hash constants',()=>{
  const now=Date.now(),valid={
    source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'32172',at:now,scanAt:now,bridgeAt:now,dataChangedAt:now,
    unitCount:300,collection:{found:true,confidence:.95},countDiscovery:{found:true,parsed:300,missing:0,ambiguous:0},
    wispCountFound:true,abilityCount:5,connected:true
  };
  assert.strictEqual(C.snapshotHealth(valid,now).ready,true);
  const unchangedHand=C.snapshotHealth(Object.assign({},valid,{dataChangedAt:now-600000}),now);
  assert.strictEqual(unchangedHand.ready,true,'an unchanged hand was confused with a dead bridge');
  assert.strictEqual(unchangedHand.dataAgeSec,600);
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{bridgeAt:now-13000}),now).ready,false,'stale bridge was accepted');
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{scanAt:now-13000}),now).ready,false,'stale DOM scan was accepted');
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{collection:{found:true,confidence:.4}}),now).ready,false);
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{unitCount:299,countDiscovery:{found:true,parsed:299,missing:0,ambiguous:0}}),now).ready,false,'299 rows crossed the adapter minimum');
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{unitCount:381,countDiscovery:{found:true,parsed:381,missing:0,ambiguous:0}}),now).ready,false,'381 rows crossed the adapter maximum');
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{countDiscovery:{found:true,parsed:299,missing:1,ambiguous:0}}),now).ready,false);
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{countDiscovery:{found:true,parsed:300,missing:0,ambiguous:1}}),now).ready,false);
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{wispCountFound:false}),now).ready,false);
  assert.strictEqual(C.snapshotHealth(Object.assign({},valid,{parser:'ord-tmo-parser-v10-live-delta'}),now).ready,false);
  assert.strictEqual(C.snapshotHealth({source:'manual',at:now,unitCount:units.length},now).ready,true);
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
console.log(`\n${tests.length-failed}/${tests.length} tests passed`);
if(failed)process.exit(1);
