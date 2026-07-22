'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const catalog=global.ORD_TMO_UNITS;
const db=C.buildDb(catalog);
const rare=db.rares[0];
const legends=db.legendish.filter(unit=>/^전설|^히든/.test(C.groupName(unit))&&C.familyOf(unit)!=='magic').slice(0,8);
const upper=db.uppers.find(unit=>C.familyOf(unit)==='physical');
assert(rare&&upper&&legends.length===8,'round replay fixtures missing');

const settings=(round,extra={})=>Object.assign({
  currentRound:round,mode:'physical',magicRoute:'auto',targetSquadCount:9,
  manualCounts:{},stunConditions:{}
},extra);
const state=(counts={},abilities={})=>C.normalizeState(catalog,{
  source:'fixture',at:Date.now(),counts,units:[],currentAbilities:abilities
},settings(1));
const replay=(round,counts={},extra={},abilities={})=>C.gameFlow(state(counts,abilities),[],settings(round,extra));

// 7R: no rare means the first-rare milestone remains the only valid next step.
const r7=replay(7);
assert.deepStrictEqual([r7.phase,r7.purpose,r7.deadline,r7.urgent,r7.overdue],['first-rare','rare',7,true,false]);
assert.deepStrictEqual(r7.rewards,[]);

// 15R: the actual TMO rare count advances to first legend. Reward-history
// fields are deliberately ignored.
const oneRare={[rare.id]:1};
const r15=replay(15,oneRare,{firstRareRewardClaimed:true,storyRareCount:2});
assert.deepStrictEqual([r15.phase,r15.purpose,r15.deadline],['first-legend','story',20]);
assert.deepStrictEqual(r15.rewards,[]);

// 20R: still no legend is urgent but not overdue until the next round.
const r20=replay(20,oneRare,{firstRareRewardClaimed:true,moneyGambleDone:true,storyRareCount:5});
assert.deepStrictEqual([r20.phase,r20.purpose,r20.urgent,r20.overdue],['first-legend','story',true,false]);

// 25R: after the first legend, the user explicitly selects upper preparation.
const oneLegend={[legends[0].id]:1};
const waiting=replay(25,oneLegend,{firstRareRewardClaimed:true});
assert.deepStrictEqual([waiting.phase,waiting.purpose,waiting.postLegendDecisionRequired],['post-legend-choice','choice',true]);
const r25=replay(25,oneLegend,{postLegendRoute:'upper',firstRareRewardClaimed:true,moneyGambleDone:true,storyRareCount:5,highGambleDone:true,highGambleRareCount:3});
assert.deepStrictEqual([r25.phase,r25.purpose,r25.deadline],['upper-choice','upper',25]);

// 30R: an upper plus one Legend is two board units and four equivalents.
const lineCounts={[upper.id]:1,[legends[0].id]:1};
const r30=replay(30,lineCounts,{firstRareRewardClaimed:true});
assert.deepStrictEqual([r30.phase,r30.purpose,r30.counts.board,r30.counts.squad],['reinforce','spec',2,4]);
assert.strictEqual(r30.milestones.find(item=>item.key==='lineHold').done,true);

// 50R: one upper plus five Legends is still below the conservative nine-equivalent gate.
const eightCounts={[upper.id]:1};
for(const unit of legends.slice(0,5))eightCounts[unit.id]=1;
const r50=replay(50,eightCounts,{firstRareRewardClaimed:true});
assert.deepStrictEqual([r50.counts.board,r50.counts.squad],[6,8]);
assert.strictEqual(r50.milestones.find(item=>item.key==='nine').done,false);
assert.strictEqual(r50.squadReady,false);

// 55R+: an incomplete nine-slot/spec plan enters the final patch menu.
const r55=replay(55,eightCounts,{firstRareRewardClaimed:true});
assert.deepStrictEqual([r55.phase,r55.purpose,r55.target,r55.stretchTarget],['final-patch','spec',9,11]);
for(const phrase of ['전설·히든 1기','해적선 1기','희귀 2기','변화됨'])assert(r55.note.includes(phrase),`final patch option missing: ${phrase}`);

// One upper plus six final-grade units is seven board units and nine equivalents.
// Armor 182 and stun about .748 meet the operational gates even though the
// optional 210 armor and 1.5 stun comfort targets remain incomplete.
const readyIds=['190H','830h','B30h','M30h','540h','unit_1752903381904_1445','unit_1779015467592_9245'];
for(const id of readyIds)assert(db.byId.has(id),`round replay final fixture missing: ${id}`);
const nineCounts=Object.fromEntries(readyIds.map(id=>[id,1])),r55Ready=replay(55,nineCounts,{firstRareRewardClaimed:true});
assert.deepStrictEqual([r55Ready.counts.board,r55Ready.counts.squad,r55Ready.squadReady,r55Ready.clearReady,r55Ready.phase],[7,9,true,true,'upgrade-control']);
assert.deepStrictEqual([r55Ready.deficits.profile.armorCurrent,r55Ready.deficits.profile.armorTarget,r55Ready.deficits.profile.armorIdeal],[182,180,211]);
const comfort=r55Ready.deficits.requirements.find(row=>row.key==='stunFull');
assert(comfort&&comfort.required===false&&comfort.gap>0);
assert.match(r55Ready.note,/업그레이드와 컨트롤/);

console.log('PASS  round replay 7→15→20→25 preserves TMO-count deadlines without reward history');
console.log('PASS  round replay 30→50 enforces line hold and the nine-equivalent gate');
console.log('PASS  round 55+ uses final patch options, then hands off to upgrades/control');
