'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_core.js'])require(path.join(EXT,file));
const C=global.ORDCore,units=global.ORD_TMO_UNITS;

const baseSpec={main:1,stun:.5,slow:102,triggerSlow:0,armor:172,triggerArmor:15,boss:1,frenzy:1,attack:0,triggerAttack:0,speed:0};
const unsafe=C.clearProfileDetails(baseSpec,'physical',{gorosei:'none'}),unsafeArmor=unsafe.requirements.find(row=>row.key==='armor');
assert.strictEqual(unsafeArmor.current,172,'발동 방깎이 상시 방깎 현재값에 합산되었습니다.');
assert.strictEqual(unsafeArmor.target-unsafeArmor.current,8,'상시 172는 운영 하한 180에 8 부족이어야 합니다.');
assert.deepStrictEqual([unsafe.armorTarget,unsafe.armorIdeal],[180,211]);
assert.strictEqual(unsafe.armorExpected,181.75);
assert.strictEqual(unsafe.armorMaximum,187);
assert.strictEqual(unsafe.armorConditionalOnly,true,'기대값만 180을 넘는 조합은 발동 의존으로 표시해야 합니다.');

const safe=C.clearProfileDetails(Object.assign({},baseSpec,{armor:180,triggerArmor:0}),'physical',{gorosei:'none'}),safeArmor=safe.requirements.find(row=>row.key==='armor');
assert.strictEqual(safeArmor.target-safeArmor.current,0,'상시 180은 일반 물딜 운영 하한을 충족해야 합니다.');
assert.strictEqual(safe.armorIdeal,211,'211은 필수가 아닌 완성 보강 목표로 남아야 합니다.');

const triggerOnly={name:'테스트 발동깎',groupName:'전설 [물딜]',abilities:{'발동방어력 감소':20}},contribution=C.roleContribution(triggerOnly,'physical');
assert.strictEqual(contribution.armor,0,'발동 방깎 후보가 하드 방깎 기여로 점수화되었습니다.');
assert.strictEqual(contribution.triggerArmor,20);

const readyIds=['190H','830h','B30h','M30h','540h','unit_1752903381904_1445','unit_1779015467592_9245'];
const db=C.buildDb(units);for(const id of readyIds)assert(db.byId.has(id),`stable armor fixture missing: ${id}`);
const counts=Object.fromEntries(readyIds.map(id=>[id,1]));
function state(extra={},base=counts){return C.normalizeState(units,{counts:Object.assign({},base,extra),currentAbilities:{}},{manualCounts:{},superKumaOwned:true});}
const settings={currentRound:55,mode:'physical',targetSquadCount:9,gorosei:'none'};
const ready=C.gameFlow(state(),[],settings);
assert.deepStrictEqual([ready.counts.board,ready.counts.squad,ready.deficits.profile.armorCurrent],[7,9,182]);
assert.strictEqual(ready.clearReady,true,'상시 182와 0.5+ 스턴을 갖춘 환산 9기는 판매·강화 단계로 넘어가야 합니다.');
assert.strictEqual(ready.phase,'upgrade-control');

// 시저 대신 크래커를 쓴 최종 7기는 상시 방깎 177입니다. 현재 TMO에는
// 곧 팔 희귀 사보(상시 깎 10)까지 보여 187이어도 판매 후 177로 판정해야 합니다.
const unsafeIds=['190H','H30h','B30h','M30h','540h','unit_1752903381904_1445','unit_1779015467592_9245'],unsafeCounts=Object.fromEntries(unsafeIds.map(id=>[id,1])),temporaryState=state({'L50h':1},unsafeCounts),temporary=C.gameFlow(temporaryState,[],settings);
assert.strictEqual(C.currentSpec(temporaryState,'physical',settings).armor,187);
assert.deepStrictEqual([temporary.counts.board,temporary.counts.squad,temporary.deficits.profile.armorCurrent],[7,9,177]);
assert.strictEqual(temporary.clearReady,false,'판매할 희귀 방깎으로 최종 클리어를 승인했습니다.');
assert.strictEqual(temporary.phase,'final-patch');

console.log('PASS trigger armor never closes the static armor gate');
console.log('PASS sellable Rare armor cannot unlock the upgrade/control handoff');
console.log('Stable-armor v14.0.0 tests: 2/2 passed');
