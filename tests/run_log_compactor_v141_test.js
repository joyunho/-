'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const FILE=path.join(EXT,'ord_run_log_compactor.js');
const L=require(FILE);

function forbiddenKeys(value,pathName,found){
  found=found||[];pathName=pathName||'';
  if(!value||typeof value!=='object')return found;
  for(const key of Object.keys(value)){
    const next=pathName?`${pathName}.${key}`:key;
    if(/(?:^|_)(?:image|url|desc(?:ription)?|command|commands|codes?)(?:$|_)/i.test(key))found.push(next);
    forbiddenKeys(value[key],next,found);
  }
  return found;
}

function unit(id,name,groupName){return{id,name,groupName,image:`https://secret.invalid/${id}.png`,desc:`private-${id}`,commands:[`make-${id}`],codes:[`code-${id}`]};}
const catalog=[unit('r1','희귀 카드','희귀함'),unit('s1','특별 카드','특별함'),unit('u1','안흔 카드','안흔함'),unit('c1','흔함 카드','흔함'),unit('upper','메인 상위','초월 [물딜]'),unit('support','지원 전설','전설 [물딜]')];
const db={byId:new Map(catalog.map(item=>[item.id,item])),units:catalog};
const state={db,units:catalog,counts:{r1:2,s1:3,u1:4,c1:9,upper:0,support:0},wisp:7};

const firstSnapshot={
  seq:1,dataChangedAt:1000,unitCount:6,playableUnitCount:18,wispCount:7,wispCountFound:true,
  collection:{confidence:.97},counts:{r1:2,s1:3,u1:4,c1:9,zero:0},
  currentAbilities:{armor:120,slow:0},
  units:[
    {id:'upper',name:'메인 상위',count:0,tmoPercent:62,image:'https://secret.invalid/upper'},
    {id:'support',name:'지원 전설',count:0,tmoPercent:41,description:'do not log'},
    {id:'r1',count:2,tmoPercent:0,commands:['private']}
  ],
  url:'https://tmo.invalid/private',title:'private title',currentAbilityRows:[{description:'private'}]
};
const secondSnapshot={
  seq:2,dataChangedAt:2000,unitCount:6,playableUnitCount:17,wispCount:6,wispCountFound:true,
  collection:{confidence:.98},counts:{r1:1,u1:4,c1:9,newCard:2},
  currentAbilities:{armor:180,stun:.5},
  units:[{id:'upper',count:0,tmoPercent:81},{id:'new-progress',count:0,tmoPercent:25}]
};

const first=L.compactSnapshot(firstSnapshot);
assert.strictEqual(first.record.kind,'full');
assert.deepStrictEqual(first.record.counts,{c1:9,r1:2,s1:3,u1:4});
assert.deepStrictEqual(first.record.progress,{support:41,upper:62});
assert.deepStrictEqual(first.record.currentAbilities,{armor:120,slow:0});
assert.strictEqual(first.duplicate,false);
assert.doesNotThrow(()=>JSON.stringify(first.record));

const same=L.compactSnapshot(Object.assign({},firstSnapshot,{seq:99,dataChangedAt:9999}),first.baseline);
assert.strictEqual(same.duplicate,true,'observation metadata must not create a gameplay change');
assert.deepStrictEqual(same.record.counts,{});
assert.deepStrictEqual(same.record.progress,{});
assert.deepStrictEqual(same.record.currentAbilities,{});

const second=L.compactSnapshot(secondSnapshot,first.baseline);
assert.strictEqual(second.record.kind,'delta');
assert.deepStrictEqual(second.record.counts,{newCard:2,r1:1,s1:null});
assert.deepStrictEqual(second.record.progress,{'new-progress':25,support:null,upper:81});
assert.deepStrictEqual(second.record.currentAbilities,{armor:180,slow:null,stun:.5});
const rebuilt=L.applySnapshotRecord(first.baseline,second.record);
assert.deepStrictEqual(rebuilt,second.baseline,'delta did not reconstruct the compact baseline');
const replay=L.reconstructSnapshots([first.record,second.record]);
assert.deepStrictEqual(replay[1],second.baseline,'full + delta replay drifted');

function action(idValue,name,order){return{
  id:idValue,name,unit:Object.assign({},db.byId.get(idValue),{image:'https://private.invalid/action'}),order,feasible:true,progress:76,
  completionProjection:{originalTmoPercent:36,predictedTmoPercent:76,rankingPercent:76,delta:40,isProjected:true,method:'recipe-wisp-distance',virtualSpecialId:'s1',virtualApplied:true,alreadyObserved:false,recipe:{totalWispEquivalent:10,beforeWispEquivalent:6,afterWispEquivalent:2,savedWispEquivalent:4,materialConsumed:{s1:1}}},
  availableWisp:7,wispGap:0,remainingWisp:5,solve:{wispCost:2,rareUse:{r1:1},consumed:{r1:1,s1:2,u1:3,c1:4},image:'private'},
  reason:'현재 패 순차 제작 검증',commands:['do-not-log'],description:'do-not-log',url:'https://private.invalid'
};}
const rareRows=[{id:'r1',name:'희귀 카드',initial:2,spent:1,hold:1,reroll:0,conflict:0,deadlineRound:45,reason:'검증된 사용처 보호',destinations:[{id:'support',name:'지원 전설',count:1,disposition:'hold',reason:'다음 제작'}]}];
const checkpoint=(key,due,status,pass)=>({key,dueRound:due,status,pass,craftablePass:pass,requiredEquivalent:due===50?8:4,blockers:pass?[]:['실제 전설 환산 부족'],description:'private'});
const safePrefix={basis:'current-tmo-stock-only',guaranteed:true,mode:'physical',route:'physical',checkpoint:checkpoint('r30',30,'passed',true),checkpointPass:true,actions:[action('upper','메인 상위',1),action('support','지원 전설',2)],rareRemaining:0,wispUsed:4,tierUse:{rare:2,special:4,uncommon:6,common:8},blockers:[],note:'현재 패만 사용'};
const squad={
  mode:'physical',magicRoute:'physical',complete:true,targetCount:9,projectedCount:6,plannedCount:9,targetBoardCount:7,projectedBoardCount:4,plannedBoardCount:7,
  finalLineup:Array.from({length:20},(_,index)=>({id:index===0?'upper':`line-${index}`,name:`라인 ${index}`,status:index<4?'owned':'future',unit:{id:`leak-${index}`,image:'private'},futureDropPending:index>8})),
  decision:{priorityGroups:[['armor','stunBase'],['slow','bossFrenzy'],['stunFull']]},
  roleCoverage:{planned:{complete:true,readiness:100,rows:[{key:'armor',label:'상시 방깎',current:180,target:180,gap:0,required:true,weight:100}],description:'private'}},
  routeEvaluation:{route:'physical',status:'role-complete',label:'역할 충족',confirmable:true,staticComplete:true,roleOnly:true,combatVerified:false,baseMissing:0,note:'DPS 실측 전',finish:{status:'na'},description:'private'},
  safePrefix,
  timelineReadiness:{
    round:45,
    actual:{boardCount:6,legendEquivalent:8,upperCount:1,nonUpperFinalCount:5,mainUpperId:'upper',damageCore:{pass:true,progress:100,blockers:[]},controlCore:{pass:true,blockers:[]},unitIds:['private-large-unit-list']},
    craftableNow:{boardCount:7,legendEquivalent:9,upperCount:1,nonUpperFinalCount:6,mainUpperId:'upper',damageCore:{pass:true,progress:100,blockers:[]},controlCore:{pass:true,blockers:[]},addedBoard:1,addedEquivalent:1,actionIds:['support']},
    blueprint:{boardCount:7,legendEquivalent:9,futureCount:1,futureDependencyCount:0},
    rare:{owned:2,spentNow:1,actionableReserved:1,unassigned:0,conflict:0,pass:true,rows:rareRows},
    checkpoints:[checkpoint('r30',30,'passed',true),checkpoint('r40',40,'passed',true),checkpoint('r45',45,'passed',true),checkpoint('r50',50,'pending',false)],
    currentCheckpoint:checkpoint('r45',45,'passed',true),
    boss50:{status:'blocked',structuralPass:true,damagePass:true,controlPass:true,rarePass:true,verified:false,evidence:'50라 보스 DPS 실측표 없음',blockers:['실제 전설 환산 1 부족'],note:'미래 청사진 제외',url:'private'}
  },
  wispBudget:{available:7,required:6,used:4,reserved:2,futureWorstCase:3,worstCaseRequired:7,remaining:1,shortage:0,withinBudget:true,fullPartyFeasible:true,evidence:'current-stock-funded'},
  rareAllocation:rareRows,
  handFit:{feasible:true,hardConflictTotal:0,tiers:{rare:{summary:{initial:2,spent:1,reserved:1,remaining:0}},special:{summary:{initial:3,spent:2,reserved:1,remaining:0}},uncommon:{summary:{initial:4,spent:3,reserved:1,remaining:0}},common:{summary:{initial:9,spent:4,reserved:3,remaining:2,protected:2}}},wisp:{initial:7,used:4,reserved:2,required:6,remaining:1,conflict:0,futureWorstCase:3},description:'private'},
  image:'private',commands:['private'],description:'private'
};
const laneRows=Array.from({length:5},(_,index)=>({rank:index+1,upperId:`upper-${index}`,upperName:`상위 ${index}`,completion:90-index,status:'prefix',projectedComplete:index===0,guaranteedComplete:false,provisionalSelectable:index===0,readiness:80,wispCost:2,wispShortage:1,rareUsed:5,rareRemaining:1,safePrefix,image:'private'}));
const direction={decision:'provisional-upper',dominant:'',reason:'현재 체크포인트 우세',lanes:Array.from({length:5},(_,index)=>({key:`lane-${index}`,mode:index?'magic':'physical',route:index?'dual':'physical',label:`경로 ${index}`,priority:'핵심 역할 우선',rows:laneRows,description:'private'})),provisionalDirection:{upperId:'upper-0',upperName:'상위 0',routeKeys:['physical','dual'],checkpoint:checkpoint('r30',30,'passed',true),actions:[{id:'upper',name:'메인 상위',wispCost:2}],image:'private'},url:'https://private.invalid'};
const v15Decision={
  version:'17.9.0',
  authority:true,
  state:'PREPARE',
  label:'메인 상위 재료 준비',
  reason:'현재 패의 고정 상위를 먼저 보호',
  action:null,
  blockedAction:{
    id:'upper',
    name:'메인 상위',
    unit:db.byId.get('upper'),
    row:action('upper','메인 상위',1),
    wispCost:9,
    wispAfter:0,
    stopCondition:'선위 9개 전에는 제작 금지'
  },
  routeCandidates:[{
    id:'upper',
    name:'메인 상위',
    unit:db.byId.get('upper'),
    routeKey:'physical',
    routeLabel:'물딜 1상위',
    feasible:false,
    completion:82,
    wispCost:9,
    wispAfter:null,
    wispGap:2,
    tiers:{rare:2,special:3,uncommon:4,common:5},
    reason:'현재 패 방향 후보',
    projectedSupport:{
      exactPrefix:false,
      steps:[],
      deadEnds:[{label:'상시 풀방깎'}],
      futureDropsCredited:false,
      fixedFinalParty:false
    }
  }],
  assessment:{
    status:'developing',
    label:'완성 전력 마감 미달',
    checkpoint:{key:'boss50',label:'50라 보스 구조 마감',dueRound:50},
    structuralPass:false,
    actual:{legendEquivalent:8,upperCount:0,nonUpperFinalCount:8},
    rareRemaining:2,
    blockers:['상위 +1'],
    requirements:[],
    unknowns:['보스 DPS']
  },
  rare:{
    conflict:false,
    rows:[{
      id:'r1',
      name:'희귀 카드',
      initial:2,
      use:0,
      hold:2,
      reroll:0,
      reason:'고정 상위 재료 보호',
      proof:{exclusive:true}
    }]
  },
  evidence:{ledger:'exact-current-stock',futureDropsCredited:false,clearClaim:false}
};
const plan={
  round:45,purpose:'spec',mode:'physical',magicRoute:'physical',upper:{id:'upper',name:'메인 상위',image:'private'},
  actions:[action('upper','메인 상위',1),action('support','지원 전설',2),action('support','지원 전설 2',3),action('support','잘려야 함',4)],
  watch:Array.from({length:10},(_,index)=>action('support',`대비 ${index}`,index+1)),
  deficits:{profile:{priority:['armor','stunBase','slow','bossFrenzy','stunFull']},clearRows:[{key:'armor',label:'상시 방깎',current:180,target:180,gap:0,required:true,weight:100},{key:'stunFull',label:'충분한 스턴',current:.5,target:1.5,gap:1,required:false,weight:10}],description:'private'},
  directionBoard:direction,squadPlan:squad,v15Decision,
  image:'private',commands:['private'],description:'private'
};

const decision=L.compactDecision({state,settings:{currentRound:45,mode:'physical',magicRoute:'physical',purpose:'spec'},plan});
assert.strictEqual(decision.actions.length,3);
assert.strictEqual(decision.watch.length,6);
assert.deepStrictEqual(decision.actions[0].consumed,{rare:1,special:2,uncommon:3,common:4});
assert.strictEqual(decision.actions[0].rareUse.total,1);
assert.strictEqual(decision.direction.lanes.length,3);
assert(decision.direction.lanes.every(lane=>lane.rows.length===2));
assert.strictEqual(decision.squad.lineup.length,12);
assert.strictEqual(decision.squad.timeline.boss50.status,'blocked');
assert.deepStrictEqual(decision.squad.rare.rows[0].spent,1);
assert.deepStrictEqual(decision.squad.rare.rows[0].hold,1);
assert.deepStrictEqual(decision.squad.rare.rows[0].reroll,0);
assert.strictEqual(decision.squad.hand.current.rare.total,2);
assert.strictEqual(decision.squad.hand.planned.common.protected,2);
assert.strictEqual(decision.v15.action,null);
assert.strictEqual(decision.v15.proposed.id,'upper');
assert.strictEqual(decision.v15.proposed.executable,false);
assert.strictEqual(decision.v15.proposed.stopCondition,'선위 9개 전에는 제작 금지');
assert.deepStrictEqual(decision.v15.proposed.completion,{
  originalTmoPercent:36,predictedTmoPercent:76,rankingPercent:76,delta:40,projected:true,
  method:'recipe-wisp-distance',virtualSpecialId:'s1',virtualApplied:true,alreadyObserved:false,
  recipe:{totalWispEquivalent:10,beforeWispEquivalent:6,afterWispEquivalent:2,savedWispEquivalent:4}
});
assert.strictEqual(decision.v15.routeCandidates.length,1);
assert.strictEqual(decision.v15.routeCandidates[0].exactPrefix,false);
assert.deepStrictEqual(decision.v15.routeCandidates[0].prefix,[]);
assert.deepStrictEqual(decision.v15.routeCandidates[0].tiers,{rare:2,special:3,uncommon:4,common:5});
assert.strictEqual(forbiddenKeys(decision).length,0,`forbidden output keys: ${forbiddenKeys(decision).join(', ')}`);
const json=JSON.stringify(decision);
for(const secret of ['secret.invalid','private.invalid','do-not-log','private-large-unit-list'])assert(!json.includes(secret),`private field leaked: ${secret}`);
assert(json.length<L.LIMITS.maxDecisionBytes,`decision was not bounded: ${json.length}`);
assert.doesNotThrow(()=>JSON.parse(json));

const hugeCounts={},hugeUnits=[],hugeAbilities={};
for(let index=0;index<1800;index++){const key=`unit-${String(index).padStart(5,'0')}-${'x'.repeat(100)}`;hugeCounts[key]=index+1;hugeUnits.push({id:key,tmoPercent:(index%99)+1,image:'https://private.invalid'});}
for(let index=0;index<300;index++)hugeAbilities[`ability-${index}-${'y'.repeat(100)}`]=index;
const huge=L.compactSnapshot({counts:hugeCounts,units:hugeUnits,currentAbilities:hugeAbilities});
const hugeBytes=JSON.stringify(huge.record).length;
assert(hugeBytes<L.LIMITS.maxSnapshotBytes,`snapshot was not bounded: ${hugeBytes}`);
assert(Object.keys(huge.record.counts).length<=L.LIMITS.counts);
assert(Object.keys(huge.record.progress).length<=L.LIMITS.progress);
assert(Object.keys(huge.record.currentAbilities).length<=L.LIMITS.abilities);

assert.strictEqual(L.stableDigest({b:2,a:1}),L.stableDigest({a:1,b:2}));
const duplicate=L.dedupe(decision.digest,Object.assign({},decision));
assert.strictEqual(duplicate.duplicate,false,'a digest field must be part of an explicitly supplied value');
const body=Object.assign({},decision);delete body.digest;
assert.strictEqual(L.dedupe(decision.digest,body).duplicate,true);

const context={window:{},globalThis:{},console};
vm.runInNewContext(fs.readFileSync(FILE,'utf8'),context,{filename:'ord_run_log_compactor.js'});
assert(context.window.ORDRunLogCompactor,'browser UMD export is missing');
assert.strictEqual(context.window.ORDRunLogCompactor.VERSION,L.VERSION);

console.log('PASS run-log compactor uses full+delta snapshots and reconstructs them');
console.log('PASS decision digest is explicit, bounded, replay-friendly and private-field free');
console.log('Run-log compactor v14.1 tests: 2/2 passed');
