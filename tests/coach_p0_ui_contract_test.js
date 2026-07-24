'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
const memory=new Map();
global.localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value)),
  removeItem:key=>memory.delete(key)
};
global.window=global;
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_app.js'])require(path.join(EXT,file));

const App=global.ORDApp.App;
const C=global.ORDCore;
const source=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS  ${name}`);}

check('live coach exposes exactly the requested seven regions in one screen',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'physical',magicRoute:'auto',virtualSpecialId:'',locks:[]};
  app.upperLock=()=>null;
  app.renderV151NextAction=()=>'<i data-test="next"></i>';
  app.renderV151Preparation=()=>'<i data-test="prep"></i>';
  app.renderV151CurrentSpec=()=>'<i data-test="spec"></i>';
  app.renderV151BuildableLegends=()=>'<i data-test="build"></i>';
  app.renderV151RewardForecast=()=>'<i data-test="reward"></i>';
  app.renderV151Gorosei=()=>'<i data-test="gorosei"></i>';
  app.renderV151UpperInfo=()=>'<i data-test="upper"></i>';
  app.renderV151RunHeader=()=>'<i data-test="run"></i>';
  const plan={v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:false}};
  const html=app.renderCoach({},plan,{}, {},{ready:true,key:'ok'});
  const regions=[...html.matchAll(/data-region="([^"]+)"/g)].map(match=>match[1]);
  assert.deepStrictEqual(regions,['next-action','next-preparation','current-spec','buildable-legends','gorosei','upper-info','game-recording']);
  assert.strictEqual(new Set(regions).size,7);
  for(const key of ['next','prep','spec','build','gorosei','upper','run'])assert.strictEqual((html.match(new RegExp(`data-test="${key}"`,'g'))||[]).length,1,key);
  for(const removed of ['ord-tabs','v15-rare-board','coach-details','v15-outcome-dock'])assert(!html.includes(removed),removed);
  assert(html.includes('class="v151-screen"'));
});

check('route and post-Legend states keep all seven regions visible',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'physical',magicRoute:'auto',virtualSpecialId:'',locks:[]};
  app.upperLock=()=>null;
  for(const name of ['NextAction','Preparation','CurrentSpec','BuildableLegends','RewardForecast','Gorosei','UpperInfo','RunHeader'])app[`renderV151${name}`]=()=>'<i></i>';
  const route=app.renderCoach({}, {v15Decision:{state:'ROUTE_CHOICE'},postLegendDecision:{awaiting:false}}, {}, {}, {ready:true,key:'ok'});
  const postLegend=app.renderCoach({}, {v15Decision:{state:'ACT_NOW'},postLegendDecision:{awaiting:true}}, {}, {}, {ready:true,key:'ok'});
  assert.strictEqual((route.match(/data-region=/g)||[]).length,7);
  assert.strictEqual((postLegend.match(/data-region=/g)||[]).length,7);
});

check('the primary card exposes one action, reason, after-state, stop condition and uncertainty',()=>{
  const app=Object.create(App.prototype);
  const html=app.renderV15Decision({v15Decision:{
    state:'ACT_NOW',
    label:'방깎 마감 보강',
    reason:'50라 전에 상시 방깎을 먼저 닫아야 합니다.',
    unknowns:['보스 DPS 실측 없음','컨트롤 성공 여부 미측정'],
    action:{
      id:'armor-one',name:'방깎 보조',wispCost:13,wispAfter:2,
      stopCondition:'TMO 패가 바뀌면 제작하지 말고 동기화하세요.',
      deltas:[{label:'상시 방깎',before:150,after:180,target:180,delta:30}],
      unit:{id:'armor-one',name:'방깎 보조',image:''}
    }
  }});
  assert.strictEqual((html.match(/data-act="mark-made"/g)||[]).length,1,'live card must expose exactly one resource action');
  for(const phrase of ['이유','이 행동 뒤','멈춤 조건','프로그램이 모르는 것','방깎 마감 보강','보스 DPS 실측 없음'])assert(html.includes(phrase),phrase);
  assert(html.includes('<b>13</b>'),'exact action wisp cost is not shown');
  assert(html.includes('제작 후 2'),'finite post-action wisp balance is not shown');
  assert(html.includes('150 → 180 / 180'),'exact role after-state is not shown');
  assert(!html.includes('클리어 확률'));
  assert(!html.includes('흔함 소비'));

  const prepare=app.renderV15Decision({v15Decision:{
    state:'PREPARE',label:'1순위 재료 보호',reason:'필요 선위가 모일 때까지 보류',
    blockedAction:{id:'next-one',name:'다음 보조',wispCost:8,wispAfter:-3,unit:{id:'next-one'},stopCondition:'선위 8개 전에는 제작 금지'}
  }});
  assert(prepare.includes('<h2>다음 보조</h2>'),'PREPARE hid the exact target');
  assert(prepare.includes('<b>8</b>'),'PREPARE hid the exact required wisp');
  assert(prepare.includes('확보 전 잠금'));
  assert(prepare.includes('disabled>재료 준비 중 · 제작 잠금'));
  assert(!prepare.includes('data-act="mark-made"'),'blocked preparation became executable');
});

check('physical and magic modes are directly selectable and magic exposes its route choice',()=>{
  const app=Object.create(App.prototype);
  app.actualRound=()=>25;
  app.upperLock=()=>null;
  app.state={mode:'physical',magicRoute:'auto',locks:[]};
  const state={wisp:7,db:{byId:new Map()}};
  const plan={v15Decision:{assessment:{route:{label:'물딜 구조'}}}};
  const health={ready:true,label:'연결됨',ageSec:0,key:'ok'};
  let html=app.renderV15Livebar(state,plan,{running:false},health);
  assert(html.includes('data-act="mode" data-value="physical"'));
  assert(html.includes('data-act="mode" data-value="magic"'));
  assert(!html.includes('aria-label="마딜 경로"'));
  app.state.mode='magic';
  app.state.magicRoute='dual';
  html=app.renderV15Livebar(state,plan,{running:false},health);
  assert(html.includes('aria-label="마딜 경로"'));
  assert(html.includes('value="dual" selected'));
  assert(html.includes('value="singleEnd"'));
});

check('152-kill panel uses the v15 projected completion without overwriting original TMO',()=>{
  const app=Object.create(App.prototype),special={id:'special-152',name:'보상 특별',groupName:'특별함',stuffs:[]},rare={id:'rare-target',name:'예상 희귀',groupName:'희귀함',stuffs:[{id:special.id,count:1}]},db={byId:new Map([[special.id,special],[rare.id,rare]]),specials:[special],rares:[rare]};
  app.state={virtualSpecialId:special.id};
  const state={db,rawCounts:{},counts:{[special.id]:1},percent:{[special.id]:50,[rare.id]:41}},plan={v15Decision:{model:{effective:{completionById:{[rare.id]:{originalTmoPercent:41,predictedTmoPercent:67,rankingPercent:67,delta:26,isProjected:true,virtualSpecialId:special.id,reason:'virtual-special-counterfactual'}}}}}};
  const html=app.renderV151RewardForecast(state,plan);
  assert(html.includes('원 TMO 41%'));
  assert(html.includes('예상 67%'));
  assert(html.includes('+26'));
  assert(html.includes('TMO 원본 수치를 덮어쓰지 않습니다'));
});

check('upper choice consumes only v15 route candidates, caps them at six and hides Common totals',()=>{
  const app=Object.create(App.prototype);
  app.state={mode:'physical',magicRoute:'auto',directionKey:'',directionUpperId:''};
  const routeCandidates=Array.from({length:7},(_,index)=>({
    id:`upper-${index+1}`,name:`상위 후보 ${index+1}`,routeKey:'physical',routeLabel:'물딜',
    completion:90-index,feasible:true,wispCost:index+1,wispAfter:20-index,
    tiers:{rare:3-index%2,special:2,uncommon:4,common:99},tierAvailable:{rare:6,special:8,uncommon:12,common:63},
    reason:'현재 패 정확 원장 비교',projectedSupport:{exactPrefix:true,steps:[]}
  }));
  const html=app.renderV15RouteChoice({}, {v15Decision:{state:'ROUTE_CHOICE',reason:'상위는 전설 3기분으로 계산',routeCandidates}});
  assert.strictEqual((html.match(/<article class="v15-route-card/g)||[]).length,6);
  assert(html.includes('상위 후보 1'));
  assert(html.includes('상위 후보 6'));
  assert(!html.includes('상위 후보 7'));
  assert(html.includes('희귀 소비'));
  assert(html.includes('특별·안흔 소비'));
  assert(!html.includes('흔함 소비'));
  assert(!html.includes('99/63'),'Common ledger leaked into the live route cards');

  routeCandidates[0].feasible=false;
  routeCandidates[0].projectedSupport={exactPrefix:false,steps:[]};
  const blocked=app.renderV15RouteChoice({}, {v15Decision:{state:'ROUTE_CHOICE',routeCandidates:[routeCandidates[0]]}});
  assert(blocked.includes('희귀 상위 필요'));
  assert(blocked.includes('특별·안흔 상위 필요'));
  assert(!blocked.includes('희귀 소비'),'미제작 상위를 실제 소비량처럼 표시함');
});

check('v15 source and CSS keep the compact single-screen hierarchy',()=>{
  const coachSource=between('  renderCoach(state,plan,phase,clock,health){','  renderCoachDetails(state,plan,open=false){');
  for(const method of ['renderV151NextAction','renderV151Preparation','renderV151CurrentSpec','renderV151BuildableLegends','renderV151Gorosei','renderV151UpperInfo','renderV151RunHeader'])assert(coachSource.includes(method),method);
  assert(fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8').includes('renderV151RewardForecast(state,plan)'),'152 forecast must stay reachable from the gorosei panel');
  assert(!coachSource.includes('renderActions('));
  assert(!coachSource.includes('renderSquadPlan('));
  assert.strictEqual((coachSource.match(/data-region=/g)||[]).length,7);
  for(const selector of ['.v151-screen{','.v151-grid{','.v151-next{','.v151-build{','.v151-run{'])assert(css.includes(selector),selector);
  assert(css.includes('grid-template-columns:repeat(12,minmax(0,1fr))'));
});

console.log(`\n${checks}/${checks} v15 live-coach UI contract checks passed.`);
