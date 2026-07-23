'use strict';

const assert=require('assert');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');

global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_app.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const App=global.ORDApp.App;
const T=global.ORDApp._test;
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

function row(id,name,pass=true){return{upperId:id,upperCanonicalId:id,upperName:name,directionKey:'',projectedComplete:true,safePrefix:{checkpointPass:pass,checkpoint:{key:'r30',dueRound:30},actions:[{id,name,wispCost:1}]}};}
const rawBoard={
  lanes:[
    {key:'physical',mode:'physical',label:'물딜 1상위',rows:[row('p','물딜 상위')]},
    {key:'dual',mode:'magic',label:'마딜 2상위',rows:[row('m','마딜 상위')]},
    {key:'singleEnd',mode:'magic',label:'마딜 1상위',rows:[row('m','마딜 상위')]}
  ],
  dominant:'',provisionalDirection:null,safeReroll:[]
};

check('자동/물딜/마딜 선택이 방향 레인을 실제로 제한한다',()=>{
  assert.deepStrictEqual(T.directionBoardForMode(rawBoard,'').lanes.map(lane=>lane.key),['physical','dual','singleEnd']);
  const physical=T.directionBoardForMode(rawBoard,'physical');
  assert.deepStrictEqual(physical.lanes.map(lane=>lane.key),['physical']);
  assert.strictEqual(physical.modeFilter,'physical');
  assert.deepStrictEqual(physical.provisionalDirection.routeKeys,['physical']);
  const magic=T.directionBoardForMode(rawBoard,'magic');
  assert.deepStrictEqual(magic.lanes.map(lane=>lane.key),['dual','singleEnd']);
  assert.strictEqual(magic.modeFilter,'magic');
  assert.deepStrictEqual(magic.provisionalDirection.routeKeys,['dual','singleEnd']);
});

check('반대 계통 선택은 모순된 확정 상위와 청사진을 해제한다',()=>{
  const app=Object.create(App.prototype),messages=[];
  app.catalog=global.ORD_TMO_UNITS;
  app.state=Object.assign(T.normalizeInitialState({mode:'physical'}),{
    snapshot:{counts:{},currentAbilities:{},at:1},
    locks:[{stage:'upper',id:'190H',source:'manual-route'}],
    upperBlueprint:{upperId:'190H',lineupIds:['190H'],buildOrderIds:['190H'],mode:'physical',magicRoute:'physical',revision:1},
    directionStatus:'selected',directionKey:'physical',directionUpperId:'190H',upperPreviewId:'190H',postLegendRoute:'upper'
  });
  app._squadCacheKey='old';app._upperRankCacheKey='old';app._upperRankCache=[{upperId:'190H'}];app._directionRankCacheKey='old';app._directionDesiredKey='old';
  app.recordAuditAction=payload=>{app.audit=payload;};app.persist=()=>{};app.render=()=>{};app.setMessage=message=>messages.push(message);
  assert.strictEqual(app.selectDamageMode('magic'),true);
  assert.strictEqual(app.state.mode,'magic');
  assert.strictEqual(app.upperLock(),null);
  assert.strictEqual(app.state.upperBlueprint,null);
  assert.deepStrictEqual([app.state.directionStatus,app.state.directionKey,app.state.directionUpperId,app.state.upperPreviewId],['open','','','']);
  assert.strictEqual(app._directionRankCacheKey,'');
  assert.strictEqual(app.audit.conflictingUpperReleased,true);
  assert.match(messages[0],/반대 계통의 확정 상위 경로를 해제/);
});

check('이미 선택된 같은 계통 버튼은 확정 경로를 건드리지 않는다',()=>{
  const app=Object.create(App.prototype);
  app.catalog=global.ORD_TMO_UNITS;app.state=Object.assign(T.normalizeInitialState({mode:'physical',modeExplicit:true,settingsRevision:177}),{snapshot:{counts:{},at:1},locks:[{stage:'upper',id:'190H'}],directionStatus:'selected',directionKey:'physical',directionUpperId:'190H'});
  assert.strictEqual(app.selectDamageMode('physical'),false);
  assert.strictEqual(app.upperLock().id,'190H');
  assert.strictEqual(app.state.directionStatus,'selected');
});

check('방향판에 즉시 보이는 계통 버튼 세 개가 있다',()=>{
  const app=Object.create(App.prototype);app.state={mode:'magic',directionStatus:'open',directionKey:'',directionUpperId:'',currentRound:25,roundStartedAt:0,roundPrepSeconds:10,roundNormalSeconds:35,roundBossSeconds:60};
  const html=app.renderDirectionBoard({}, {directionBoard:Object.assign({},T.directionBoardForMode(rawBoard,'magic'),{lanes:[]})});
  for(const [value,label] of [['','자동 비교'],['physical','물딜'],['magic','마딜']])assert(html.includes(`data-act="mode" data-value="${value}">${label}</button>`));
  assert(html.includes('class="on" data-act="mode" data-value="magic"'));
});

console.log(`\n${checks}/${checks} damage mode selection checks passed.`);
