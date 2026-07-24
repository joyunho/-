'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore,units=global.ORD_TMO_UNITS,db=C.buildDb(units);
const baseSettings=extra=>Object.assign({mode:'',purpose:'',gorosei:'none',magicRoute:'auto',targetSquadCount:9,currentRound:1,manualCounts:{},stunConditions:{},superKumaOwned:true,allowWarped:true,recommendWarped:true},extra||{});
function makeState(counts={},abilities={}){
  return C.normalizeState(units,{at:Date.now(),units:[],counts,currentAbilities:abilities},baseSettings());
}
function first(pred,message){const unit=units.find(pred);assert(unit,message||'fixture unit missing');return unit;}
function physicalSpec(extra={}){return Object.assign({source:'test',mode:'physical',main:1,stun:1.5,slow:102,triggerSlow:0,triggerSlowSources:0,armor:210,triggerArmor:0,boss:1,frenzy:1,attack:0,triggerAttack:0,speed:0,regen:0,mana:0,single:0,end:0,singleEnd:0,singleEndUnits:0,toki:0,magicDef:0,magicAmp:0,explosionAmp:0},extra);}
function magicSpec(extra={}){return Object.assign({source:'test',mode:'magic',main:2,stun:1.5,slow:102,triggerSlow:0,triggerSlowSources:0,armor:0,triggerArmor:0,boss:1,frenzy:1,toki:1,single:0,end:0,singleEnd:0,singleEndUnits:0,singleEndExpected:0,singleEndMax:0,singleEndLargest:0,singleEndStable:0,magicDef:0,magicAmp:0,explosionAmp:0},extra);}

const tests=[];
function test(name,fn){tests.push([name,fn]);}

test('v13 exports state-aware flow and exact clear profiles',()=>{
  assert.strictEqual(C.VERSION,'17.10.0');
  assert.strictEqual(typeof C.gameFlow,'function');
  assert.strictEqual(typeof C.clearProfileDetails,'function');
});

test('Sunny is frenzy-only and contributes zero stun',()=>{
  const sunny=db.byId.get('L30h'),role=C.roleProfile(sunny),research=C.stunResearch(sunny);
  assert(sunny);
  assert.deepStrictEqual([role.stun,role.boss,role.frenzy],[0,false,true]);
  assert.deepStrictEqual([research.displayStun,research.capture,research.exactStun],[0,0,0]);
});

test('first rare deadline advances immediately after a rare is secured',()=>{
  const rare=first(C.isRare),empty=C.gameFlow(makeState(),[],baseSettings({currentRound:7}));
  assert.deepStrictEqual([empty.purpose,empty.phase,empty.deadline],['rare','first-rare',7]);
  const after=C.gameFlow(makeState({[rare.id]:1}),[],baseSettings({currentRound:7}));
  assert.deepStrictEqual([after.purpose,after.phase,after.deadline],['story','first-legend',20]);
  assert.strictEqual(after.rareSecured,true);
});

test('route locks reserve materials but only actually owned upgrades satisfy deadlines',()=>{
  const rare=first(C.isRare),legend=first(u=>/^전설|^히든/.test(C.groupName(u))),upper=first(C.isUpper),empty=makeState();
  assert.strictEqual(C.gameFlow(empty,[{stage:'rare',id:rare.id}],baseSettings({currentRound:4})).purpose,'rare');
  assert.strictEqual(C.gameFlow(makeState({[rare.id]:1}),[{stage:'legend',id:legend.id}],baseSettings({currentRound:8})).purpose,'story');
  const locked=C.gameFlow(empty,[{stage:'upper',id:upper.id}],baseSettings({currentRound:25,mode:C.familyOf(upper)==='magic'?'magic':'physical'}));
  assert.deepStrictEqual([locked.purpose,locked.phase,locked.upperDecided,locked.upperBuilt],['rare','first-rare',true,false]);
  assert.strictEqual(C.gameFlow(empty,[],baseSettings({currentRound:55})).purpose,'rare','late round cannot skip an unfulfilled first-rare milestone');
});

test('first legend remains mandatory through round 20, then waits for an explicit next-route choice',()=>{
  const rare=first(C.isRare),legend=first(u=>/^전설|^히든/.test(C.groupName(u))),warped=first(C.isWarped);
  const overdue=C.gameFlow(makeState({[rare.id]:1}),[],baseSettings({currentRound:21}));
  assert.deepStrictEqual([overdue.purpose,overdue.phase,overdue.overdue],['story','first-legend',true]);
  const afterWarped=C.gameFlow(makeState({[warped.id]:1}),[],baseSettings({currentRound:15}));
  assert.deepStrictEqual([afterWarped.rareSecured,afterWarped.legendSecured,afterWarped.purpose],[true,false,'story']);
  const choice=C.gameFlow(makeState({[legend.id]:1}),[],baseSettings({currentRound:25}));
  assert.deepStrictEqual([choice.purpose,choice.phase,choice.deadline,choice.postLegendDecisionRequired],['choice','post-legend-choice',25,true]);
  const upperChoice=C.gameFlow(makeState({[legend.id]:1}),[],baseSettings({currentRound:25,postLegendRoute:'upper'}));
  assert.deepStrictEqual([upperChoice.purpose,upperChoice.phase,upperChoice.postLegendRoute],['upper','upper-choice','upper']);
});

test('additional legend route persists after round 30 and upper state always takes precedence',()=>{
  const legend=first(u=>/^전설|^히든/.test(C.groupName(u))),upper=first(C.isUpper),counts={[legend.id]:1};
  const additional=C.gameFlow(makeState(counts),[],baseSettings({currentRound:35,postLegendRoute:'legend'}));
  assert.deepStrictEqual([additional.purpose,additional.phase,additional.deadline,additional.postLegendRoute],['story','additional-legend',null,'legend']);
  const preview=C.gameFlow(makeState(counts),[],baseSettings({currentRound:35,postLegendRoute:'legend',upperPreviewId:upper.id}));
  assert.deepStrictEqual([preview.upperDecided,preview.purpose,preview.phase],[true,'spec','upper-build']);
  const locked=C.gameFlow(makeState(counts),[{stage:'upper',id:upper.id}],baseSettings({currentRound:35,postLegendRoute:'legend'}));
  assert.deepStrictEqual([locked.upperDecided,locked.purpose,locked.phase],[true,'spec','upper-build']);
  const built=C.gameFlow(makeState(Object.assign({},counts,{[upper.id]:1})),[],baseSettings({currentRound:35,postLegendRoute:'legend'}));
  assert.strictEqual(built.upperBuilt,true);
  assert.notStrictEqual(built.phase,'additional-legend');
});

test('round 30, round 50 and final 9-11 squad phases are explicit',()=>{
  const upper=first(u=>C.isUpper(u)&&C.familyOf(u)==='physical'),legends=units.filter(u=>C.isLegendish(u)&&C.familyOf(u)!=='magic').slice(0,10),counts={[upper.id]:1};
  counts[legends[0].id]=1;
  const r30=C.gameFlow(makeState(counts),[],baseSettings({currentRound:30,mode:'physical'}));
  assert.strictEqual(r30.milestones.find(x=>x.key==='lineHold').done,true);
  const r45=C.gameFlow(makeState(counts),[],baseSettings({currentRound:45,mode:'physical'}));
  assert.deepStrictEqual([r45.phase,r45.by50Target],['reinforce',9]);
  const r51=C.gameFlow(makeState(counts),[],baseSettings({currentRound:51,mode:'physical',targetSquadCount:9}));
  assert.deepStrictEqual([r51.phase,r51.target,r51.stretchTarget],['final-patch',9,11]);
  const capped=C.gameFlow(makeState(counts),[],baseSettings({currentRound:51,mode:'physical',targetSquadCount:99}));
  assert.strictEqual(capped.target,11);
});

test('an eight-board physical squad counts as ten equivalents and clears the 1.5-stun hard gate (v17.7)',()=>{
  // v17.7: 물딜 1.5스턴이 필수 하드 게이트가 되면서, 0.5스턴 완료 픽스처를
  // 실제 1.5스턴을 채운 패(바르톨로메오 전설 추가)로 교체했다.
  const ids=['190H','830h','B30h','M30h','540h','unit_1752903381904_1445','unit_1779015467592_9245','Z20h'];
  for(const id of ids)assert(db.byId.has(id),`weighted final fixture missing: ${id}`);
  const counts=Object.fromEntries(ids.map(id=>[id,1])),flow=C.gameFlow(makeState(counts),[],baseSettings({currentRound:55,mode:'physical',targetSquadCount:9}));
  assert.deepStrictEqual([flow.counts.board,flow.counts.squad,flow.squadReady,flow.clearReady,flow.phase],[8,10,true,true,'upgrade-control']);
  assert.deepStrictEqual([flow.deficits.profile.armorCurrent,flow.deficits.profile.armorTarget,flow.deficits.profile.armorIdeal],[194,180,211]);
  const stunGate=flow.deficits.requirements.find(row=>row.key==='stunFull');
  assert(stunGate&&stunGate.required===true&&stunGate.gap<=0,'1.5 stun hard gate must be required and closed in this fixture');
  assert.match(flow.note,/업그레이드와 컨트롤/);
});

test('manual rare-reward history cannot advance or alter the TMO-driven flow',()=>{
  const forged=baseSettings({currentRound:15,firstRareRewardClaimed:true,firstRareBy7:true,moneyGambleDone:true,moneyRareReward:true,storyRareCount:5,storyRareRewards:5,highGambleDone:true,highGambleRareCount:8}),empty=C.gameFlow(makeState(),[],forged),rare=first(C.isRare),actual=C.gameFlow(makeState({[rare.id]:1}),[],forged);
  assert.deepStrictEqual([empty.purpose,empty.phase,empty.rareSecured],['rare','first-rare',false]);
  assert.deepStrictEqual([actual.purpose,actual.phase,actual.rareSecured],['story','first-legend',true]);
  assert.deepStrictEqual(empty.rewards,[]);
  assert.strictEqual(empty.expectedRareIncome,0);
});

test('physical clear hard-gates armor at 180 and requires 1.5 stun as the last-priority gate (v17.7)',()=>{
  const at179=C.deficits(physicalSpec({armor:179,stun:.5}),'physical',baseSettings({mode:'physical'})),at180=C.deficits(physicalSpec({armor:180,stun:.5}),'physical',baseSettings({mode:'physical'})),full=C.deficits(physicalSpec({armor:180,stun:1.5}),'physical',baseSettings({mode:'physical'}));
  assert(at179.clearRows.some(x=>x.key==='armor'&&x.target===180&&x.gap===1));
  // v17.7: 물딜 1.5스턴은 이제 마지막 우선순위의 필수 하드 게이트다.
  assert(at180.clearRows.every(x=>x.key==='stunFull'),'armor 180 closed but non-stun rows remain');
  assert.deepStrictEqual(full.clearRows,[]);
  assert.deepStrictEqual([at180.profile.armorTarget,at180.profile.armorIdeal],[180,211]);
  const comfort=at180.requirements.find(row=>row.key==='stunFull');
  assert.deepStrictEqual([comfort.required,comfort.target,comfort.gap],[true,1.5,1]);
  assert.deepStrictEqual(at180.profile.priority,['armor','stunBase','slow','bossFrenzy','stunFull']);
});

test('physical priority pairs armor with 0.5 stun, then slow with boss/frenzy, before optional stun',()=>{
  const d=C.deficits(physicalSpec({armor:0,stun:0,slow:0}),'physical',baseSettings({mode:'physical'})),weight=Object.fromEntries(d.requirements.map(x=>[x.key,x.weight]));
  assert.strictEqual(weight.armor,weight.stunBase);
  assert.strictEqual(weight.slow,weight.bossFrenzy);
  assert(weight.stunBase>weight.slow&&weight.slow>weight.stunFull);
  // v17.7: 필수지만 마지막 우선순위(가중치 최하)로 남는다.
  assert.strictEqual(d.requirements.find(row=>row.key==='stunFull').required,true);
});

test('Nika Eternal and Garp Immortal use the 120 armor exception only with enough buffs',()=>{
  for(const id of ['KB0H','C40h']){
    const upper=db.byId.get(id);assert(upper);
    const noBuff=C.clearProfileDetails(physicalSpec({armor:120,attack:0,speed:0}),'physical',baseSettings({_upperUnit:upper}));
    const buffed=C.clearProfileDetails(physicalSpec({armor:120,attack:30,speed:25}),'physical',baseSettings({_upperUnit:upper}));
    assert.deepStrictEqual([noBuff.armorTarget,noBuff.armorIdeal],[180,211],`${id} must not get a free exception`);
    assert.deepStrictEqual([buffed.armorExceptionActive,buffed.armorTarget],[true,120]);
    assert.deepStrictEqual(C.deficits(physicalSpec({armor:120,attack:30,speed:25}),'physical',baseSettings({_upperUnit:upper})).clearRows,[]);
  }
});

test('magic dual route requires two uppers, Toki, 1.5 stun, 102 slow and boss/frenzy',()=>{
  const settings=baseSettings({mode:'magic',magicRoute:'dual'}),missing=C.deficits(magicSpec({toki:0}),'magic',settings),ready=C.deficits(magicSpec(),'magic',settings);
  assert.strictEqual(missing.route,'dual');
  assert.deepStrictEqual(missing.clearRows.map(x=>x.key),['toki']);
  assert.deepStrictEqual(ready.clearRows,[]);
  assert.deepStrictEqual(ready.profile.priority,['main','stunBase','slow','stunFull','bossFrenzy','toki']);
});

test('magic single/end route requires three verified support credits and keeps the one-unit-drop floor optional',()=>{
  // v17.6(감사 P0-3): 단일·끝딜이 독립 필수 축이 됐다 — 합산 3만으로는
  // 통과하지 못하고 single>=2, end>=1을 함께 채워야 한다.
  const settings=baseSettings({mode:'magic',magicRoute:'singleEnd'}),two=C.deficits(magicSpec({main:1,toki:0,singleEndUnits:2,singleEnd:4,singleEndExpected:2,singleEndMax:2,singleEndLargest:1,singleEndStable:1}),'magic',settings),three=C.deficits(magicSpec({main:1,toki:0,single:2,end:1,singleEndUnits:3,singleEnd:3,singleEndExpected:3,singleEndMax:3,singleEndLargest:1,singleEndStable:2}),'magic',settings);
  assert.strictEqual(two.route,'singleEnd');
  assert(two.clearRows.some(x=>x.key==='singleEndExpected'&&x.target===3));
  assert.deepStrictEqual(three.clearRows,[]);
  const singleOnly=C.deficits(magicSpec({main:1,toki:0,single:3,end:0,singleEndUnits:3,singleEnd:3,singleEndExpected:3,singleEndMax:3,singleEndLargest:1,singleEndStable:2}),'magic',settings);
  assert(singleOnly.clearRows.some(x=>x.key==='end'),'단일 전용 3기가 끝딜 하드 컷을 통과하면 안 된다');
  assert(three.buildRows.some(x=>x.key==='singleEndStable'&&x.target===3&&x.recommended));
  assert.deepStrictEqual(three.profile.priority,['bossFrenzy','stunBase','slow','stunFull','singleEndExpected']);
});

test('auto magic route cannot declare the old incomplete profile fully ready',()=>{
  const old=magicSpec({toki:0,single:1,end:0,singleEnd:1,singleEndUnits:1}),d=C.deficits(old,'magic',baseSettings({mode:'magic',magicRoute:'auto'}));
  assert(d.readiness<100);
  assert(d.clearRows.length>0);
  assert(['dual','singleEnd'].includes(d.route));
});

test('changed units unlock on round 50 and honor historical usage counters',()=>{
  const changed=first(C.isChanged),state=makeState({[C.WISP_ID]:500}),spec=physicalSpec(),rowAt=(round,extra={})=>{const settings=baseSettings(Object.assign({mode:'physical',currentRound:round},extra)),def=C.deficits(spec,'physical',settings);return C.candidateRow(state,changed,{mode:'physical',spec,deficits:def,settings,round,purpose:'spec',stock:state.counts,availableWisp:500});};
  assert(rowAt(49).blocked.includes('변화됨은 50라부터'));
  assert(!rowAt(50).blocked.includes('변화됨은 50라부터'));
  assert(rowAt(50,{changedUsed:2}).blocked.includes('변화됨은 게임당 2회'));
});

test('recommendationPlan follows gameFlow rather than a round-only purpose switch',()=>{
  const rare=first(C.isRare),legend=first(u=>/^전설|^히든/.test(C.groupName(u))),late=C.recommendationPlan(makeState(),[],baseSettings({currentRound:55,mode:'physical'}),ORD_UPPER_MEMO,ORD_SYNERGY_MEMO),afterRare=C.recommendationPlan(makeState({[rare.id]:1}),[],baseSettings({currentRound:7,mode:'physical'}),ORD_UPPER_MEMO,ORD_SYNERGY_MEMO),afterLegend=C.recommendationPlan(makeState({[legend.id]:1}),[],baseSettings({currentRound:7,purpose:'upper'}),ORD_UPPER_MEMO,ORD_SYNERGY_MEMO);
  assert.deepStrictEqual([late.purpose,afterRare.purpose,afterLegend.purpose],['rare','story','choice']);
  assert.deepStrictEqual([afterLegend.actions,afterLegend.watch,afterLegend.prep,afterLegend.rows],[[],[],[],[]]);
  assert.deepStrictEqual([afterLegend.actionCap,afterLegend.selectionMode],[0,'decision']);
  assert.strictEqual(late.flow.purpose,late.purpose);
});

test('additional legend plan keeps exact legend and hidden candidates in TMO completion order until switched',()=>{
  const owned=first(u=>/^전설|^히든/.test(C.groupName(u))),candidates=units.filter(u=>/^전설|^히든/.test(C.groupName(u))&&u.id!==owned.id).slice(0,3),progress={[candidates[0].id]:41,[candidates[1].id]:99,[candidates[2].id]:73},state=C.normalizeState(units,{at:Date.now(),counts:{[owned.id]:1},units:Object.entries(progress).map(([id,tmoPercent])=>({id,tmoPercent}))},baseSettings());
  const more=C.recommendationPlan(state,[],baseSettings({currentRound:40,postLegendRoute:'legend'}),ORD_UPPER_MEMO,ORD_SYNERGY_MEMO);
  assert.deepStrictEqual([more.purpose,more.flow.phase,more.completionForced],['story','additional-legend',true]);
  assert(more.actions.length>0);
  assert(more.rows.every(row=>/^전설|^히든/.test(C.groupName(row.unit))));
  assert(more.rows.every((row,index)=>index===0||more.rows[index-1].progress>=row.progress));
  const upper=C.recommendationPlan(state,[],baseSettings({currentRound:40,postLegendRoute:'upper'}),ORD_UPPER_MEMO,ORD_SYNERGY_MEMO);
  assert.deepStrictEqual([upper.purpose,upper.flow.phase],['upper','upper-choice']);
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
console.log(`\n${tests.length-failed}/${tests.length} tests passed`);
if(failed)process.exit(1);
