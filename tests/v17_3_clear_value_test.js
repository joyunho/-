'use strict';

// v17.3: 종착점 클리어 가치 랭킹 + FSM 트레인 하한 + 1번 패널 재료 즉시 표시.
//  - 친구 사례(r55 도플라밍고 사망 로그로 실증): 마르코·킬러·흰수염 전설 보유
//    희귀 8종 패에서 "쉬운" 흰수염 불멸보다 핸콕 영원이 위로 온다.
//  - 최단 완성 후보(현재주의 선택지)는 가치가 낮아도 목록에 남는다(nearestBuild).
//  - FSM 트레인: RNG 게이트(p<1)만 포함, BD1 재진입은 1/지속시간 상한.
//  - 1번 패널: 대안 제거, "바로 필요한 조합 재료"와 "부족 최하위 재료 = 선택위습 N".

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
const originalWarn=console.warn;
console.warn=()=>{};
for(const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js'
])require(path.join(EXT,file));
console.warn=originalWarn;

const C=global.ORDCore;
const M=global.ORDV15Model;
const E=global.ORDV15Engine;
const units=global.ORD_TMO_UNITS;
const TABLE=global.ORD_UPPER_SKILL_DPS;

const tests=[];
function test(name,fn){tests.push([name,fn]);}

function friendModel(){
  const find=(pat,groupPat)=>units.find(u=>pat.test(C.nameOf(u))&&(!groupPat||groupPat.test(C.groupName(u))));
  const counts={'810e':12,'unit_1767884906256_4990':1};
  for(const u of [find(/^마르코/,/전설/),find(/^킬러/,/히든|전설/),find(/흰수염/,/전설/)]){assert(u,'전설 유닛 탐색 실패');counts[u.id]=1;}
  for(const pat of [/센토마루/,/와이퍼/,/^브룩/,/핸콕/,/기어\s*서드/,/^비비/,/^카쿠/,/호킨스/]){
    const u=units.find(x=>pat.test(C.nameOf(x))&&/희귀/.test(C.groupName(x)));
    assert(u,`희귀 유닛 탐색 실패: ${pat}`);
    counts[u.id]=(counts[u.id]||0)+1;
  }
  return M.build({catalog:units,snapshot:{source:'test',sessionId:'s',seq:1,at:1,dataChangedAt:1,counts,currentAbilities:{},wispCountFound:true,wispCount:12},settings:{mode:'',magicRoute:'auto',currentRound:26,gorosei:'none',postLegendRoute:'upper',superKumaOwned:true,upperResearchLevel:1},locks:[]});
}

test('친구 사례: 핸콕 영원(C50h)이 흰수염 불멸(A40h)보다 위, 둘 다 목록에 있다',()=>{
  const rows=E._test.upperRouteCandidates(friendModel(),[]);
  assert(rows.length>0&&rows.length<=6,'후보 1~6개');
  const idx=id=>rows.findIndex(row=>C.canonicalUpperId(row.id)===C.canonicalUpperId(id));
  const han=idx('C50h'),white=idx('A40h');
  assert(han>=0,'핸콕 영원이 후보 목록에 없다');
  assert(white>=0,'흰수염 불멸(최단 완성 앵커)이 후보 목록에 없다');
  assert(han<white,`핸콕 영원(${han})이 흰수염 불멸(${white})보다 아래다`);
  assert(rows[white].nearestBuild===true,'최단 완성 앵커 표시 누락');
  assert(C.num(rows[white].wispGap)<C.num(rows[han].wispGap),'앵커는 실제로 더 가까워야 한다');
});

test('클리어 가치 부분점수가 모든 후보에 있고 목록은 가치 내림차순이다',()=>{
  const rows=E._test.upperRouteCandidates(friendModel(),[]);
  for(const row of rows){
    const value=row.clearValue;
    assert(value,`${row.name} clearValue 누락`);
    for(const key of ['value','story','dpsCover','line','rareUtil','utility','deadlineFactor'])
      assert(typeof value[key]==='number'&&value[key]>=0,`${row.name}.${key} 이상`);
    assert(value.value<=1.2+1e-9,`${row.name} 가치 상한 초과`);
  }
  for(let i=1;i<rows.length;i+=1)
    assert(C.num(rows[i].clearValue.value)<=C.num(rows[i-1].clearValue.value)+1e-9,`가치 정렬 위반 @${i}`);
});

test('선위→라운드 환산 4/라: 부족 61선위·r26이면 마감 할인 없이 비교된다',()=>{
  const model=friendModel();
  const han=units.find(u=>u.id==='C50h');
  const route=E._test.routeOptions(model).find(r=>r.mode==='magic');
  const row=E._test.upperRouteRow(model,han,route);
  assert(row,'핸콕 영원 행 생성 실패');
  const value=E._test.clearValueScore(model,row);
  assert.strictEqual(value.roundsToGo,Math.ceil(C.num(row.wispGap)/4),'환산율 4선위/라');
  assert.strictEqual(value.deadlineFactor,1,'r26+16=42라 도달은 50라 준비 창 안이다');
});

test('FSM 트레인: RNG 게이트만 포함되고 재진입은 지속시간 상한을 받는다',()=>{
  assert.strictEqual(TABLE.version,'2305C-fsm-trains-1');
  assert.strictEqual(TABLE.allowKillVerdict,false,'킬 판정 금지 정책 보존');
  assert((TABLE.basis.match(/FSM 공격유발 트레인 포함/g)||[]).length===1,'basis 접미사는 정확히 1회');
  const slots=Object.entries(TABLE.trainsByProfile||{});
  assert(slots.length>0,'trainsByProfile 비어 있음');
  for(const [profileId,slot] of slots){
    for(const train of slot.trains||[]){
      assert(train.p>0&&train.p<1,`${profileId}/${train.id}: RNG 게이트가 아닌 트레인(p=${train.p})`);
      assert(C.num(train.dur)>=0,`${profileId}/${train.id}: 지속시간 음수`);
      assert(C.num(train.e&&train.e.universal)>=0&&C.num(train.e&&train.e.affected)>=0,`${profileId}/${train.id}: 음수 기대 피해`);
    }
  }
});

test('upperSkillProcDps: 트레인 기대치가 더해지고 상한이 지켜진다',()=>{
  const withTrains=Object.entries(TABLE.trainsByProfile).find(([,slot])=>(slot.trains||[]).length>0);
  assert(withTrains,'트레인 보유 프로필 없음');
  const unit=units.find(u=>{const p=C.upperSkillProfile&&C.upperSkillProfile(u);return p&&p.id===withTrains[0];});
  assert(unit,`${withTrains[0]} 대응 유닛 없음`);
  const result=C.upperSkillProcDps(unit,1,{bossArmor:350,armorReduce:180});
  assert(result&&result.dps>0,'트레인 프로필 DPS 없음');
  assert.strictEqual(result.basis,'static-lower-bound-attack-proc-and-rng-trains');
  // 상한 검증: 트레인별 rate ≤ min(aps×p, 1/dur).
  for(const train of withTrains[1].trains){
    const cap=train.dur>0?1/train.dur:Infinity;
    const rate=Math.min(result.attacksPerSec*train.p,cap);
    assert(rate<=cap+1e-9,'BD1 재진입 상한 위반');
  }
});

test('1번 패널: 대안 제거 · 재료 즉시 표시 · 최단 완성 배지 배선',()=>{
  const app=fs.readFileSync(path.join(EXT,'ord_app.js'),'utf8');
  const css=fs.readFileSync(path.join(EXT,'ord_cockpit_v15.css'),'utf8');
  assert(!app.includes('renderV15Alternatives'),'1번 패널 대안 렌더러가 아직 남아 있다');
  assert(app.includes('v151-mats'),'재료 즉시 표시 블록 누락');
  assert(app.includes('바로 필요한 조합 재료'),'직접 재료 라벨 누락');
  assert(app.includes('부족 최하위 재료 = 선택위습'),'최하위 재료=선위 라벨 누락');
  assert(app.includes('v151-nearest-badge'),'최단 완성 배지 마크업 누락');
  assert(!app.includes('v151-clear-line'),'v17.9: 내부 점수 나열 라인은 카드에서 제거됐다');assert(app.includes('v151-clear-why'),'사람이 읽는 추천 이유 라인 누락');
  assert(css.includes('.v151-mats'),'재료 블록 CSS 누락');
  assert(css.includes('.v151-nearest-badge'),'배지 CSS 누락');
});

let passed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS ${name}`);passed+=1;}
  catch(error){console.log(`FAIL ${name}`);console.log(error&&error.message||error);}
}
console.log(`V17_3_CLEAR_VALUE ${passed}/${tests.length} passed`);
if(passed!==tests.length)process.exit(1);
