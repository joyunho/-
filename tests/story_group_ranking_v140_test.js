'use strict';

const assert=require('assert');
const crypto=require('crypto');
const path=require('path');
const EXT=path.resolve(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild');
global.window=global;
for(const file of ['ord_units_data.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_core.js'])require(path.join(EXT,file));

const C=global.ORDCore;
const units=global.ORD_TMO_UNITS;
const nonupper=global.ORD_STORY_NONUPPER_V2305;
const upper=global.ORD_STORY_UPPER_V2305;
const byId=new Map(units.map(unit=>[unit.id,unit]));
const tests=[];
function test(name,fn){tests.push([name,fn]);}
function unit(id){const value=byId.get(id);assert(value,`catalog unit missing: ${id}`);return value;}
function leagueGrade(id){const value=C.storyLeagueGrade(unit(id));assert(value,`story league grade missing: ${id}`);return value;}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}

test('league metadata and catalog membership are independent and exhaustive',()=>{
  assert.deepStrictEqual(Object.keys(C.STORY_LEAGUES).sort(),['legend','rare','upper']);
  assert.deepStrictEqual(Array.from(C.STORY_GRADE_TIERS),['SSS','SS','S','A','B','C','D','E','F']);
  assert(Object.isFrozen(C.STORY_GRADE_TIERS));
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(C.STORY_LEAGUES).map(([key,row])=>[key,[row.label,row.size]])),
    {rare:['희귀',42],upper:['상위',80],legend:['전설급',76]}
  );
  assert(Object.isFrozen(C.STORY_LEAGUES));
  assert(Object.isFrozen(C.STORY_RARE_RANKS));

  const expected={rare:[42,42],upper:[89,78],legend:[81,76]},members={};
  for(const key of Object.keys(expected)){
    const rows=C.storyLeagueRows(units,key),ranked=rows.filter(row=>row.grade.leagueRanked);
    assert.deepStrictEqual([rows.length,ranked.length],expected[key],`${key} catalog/ranked count`);
    assert(rows.every(row=>row.league===key&&row.grade.storyGroup===key),`${key} contains a foreign league row`);
    members[key]=new Set(rows.map(row=>row.unit.id));
  }
  assert.strictEqual([...members.rare].filter(id=>members.upper.has(id)||members.legend.has(id)).length,0);
  assert.strictEqual([...members.upper].filter(id=>members.legend.has(id)).length,0);
});

test('rare benchmark has a complete independent 1-42 ranking and nine grade bands',()=>{
  // 갤러리 250029 실측 데미지% 전체 42종 (거프 31.73% 1위 → 와이퍼 7.29% 42위)
  const expectedOrder=['Q10h','Y10h','E20h','X90h','I20h','K20h','X10h','R10h','Z10h','620h','V10h','020h','L50h','F20h','320h','220h','M10h','M20h','H40h','L20h','H20h','P10h','520h','920h','G20h','L10h','J20h','K50h','S10h','120h','T10h','U10h','W10h','D20h','A20h','820h','B20h','720h','N10h','C20h','O10h','420h'];
  assert.strictEqual(expectedOrder.length,42);
  assert.deepStrictEqual(expectedOrder.map(id=>C.STORY_RARE_RANKS[id]),Array.from({length:42},(_,index)=>index+1));
  assert.deepStrictEqual(
    ['Q10h','K20h','X10h','020h','L50h','220h','M10h','H20h','920h','G20h','120h','T10h','820h','B20h','420h'].map(id=>{const grade=leagueGrade(id);return[id,grade.leagueRank,grade.leagueTier];}),
    [['Q10h',1,'SSS'],['K20h',6,'SS'],['X10h',7,'SS'],['020h',12,'S'],['L50h',13,'S'],['220h',16,'A'],['M10h',17,'A'],['H20h',21,'B'],['920h',24,'B'],['G20h',25,'C'],['120h',30,'D'],['T10h',31,'D'],['820h',36,'E'],['B20h',37,'E'],['420h',42,'F']]
  );
  assert.deepStrictEqual(
    Array.from({length:42},(_,index)=>C.storyLeagueTier(index+1,42)),
    ['SSS','SSS','SSS','SSS','SSS','SS','SS','SS','SS','SS','S','S','S','S','A','A','A','A','A','B','B','B','B','B','C','C','C','C','D','D','D','D','D','E','E','E','E','E','F','F','F','F']
  );
  const first=leagueGrade('Q10h'),last=leagueGrade('420h');
  assert.deepStrictEqual([first.leagueScore,last.leagueScore],[100,0]);
  assert(C.STORY_RARE_BENCHMARKS.Q10h>C.STORY_RARE_BENCHMARKS['420h'],'rare raw direction was reversed');
});

test('legend-grade ranks are re-banded only inside the 76-row league',()=>{
  const boundaries=[[1,'SSS'],[9,'SSS'],[10,'SS'],[17,'SS'],[18,'S'],[26,'S'],[27,'A'],[34,'A'],[35,'B'],[43,'B'],[44,'C'],[51,'C'],[52,'D'],[60,'D'],[61,'E'],[68,'E'],[69,'F'],[76,'F']];
  const rowByRank=new Map(Object.values(nonupper).map(row=>[row.rank,row]));
  for(const [rank,tier] of boundaries){
    const row=rowByRank.get(rank);assert(row,`legend source rank ${rank} missing`);
    const grade=leagueGrade(row.id);
    assert.deepStrictEqual([grade.storyGroup,grade.leagueRank,grade.leagueSize,grade.leagueTier],['legend',rank,76,tier],`legend rank ${rank}`);
  }
  assert.deepStrictEqual([leagueGrade('J70h').leagueRank,leagueGrade('J70h').leagueScore],[1,100]);
  assert.deepStrictEqual([leagueGrade('Q30h').leagueRank,leagueGrade('Q30h').leagueScore],[76,0]);
});

test('upper source states keep 1-80 ranks while 78 ranked catalog cards stay explicit',()=>{
  const sourceRows=Object.values(upper).flatMap(entry=>entry.variants||[]).sort((a,b)=>a.rank-b.rank);
  assert.strictEqual(sourceRows.length,80);
  assert.deepStrictEqual(sourceRows.map(row=>row.rank),Array.from({length:80},(_,index)=>index+1));

  const boundaries=[[1,'SSS'],[9,'SSS'],[10,'SS'],[18,'SS'],[19,'S'],[27,'S'],[28,'A'],[36,'A'],[37,'B'],[45,'B'],[46,'C'],[54,'C'],[55,'D'],[63,'D'],[64,'E'],[72,'E'],[73,'F'],[80,'F']];
  const sourceByRank=new Map(sourceRows.map(row=>[row.rank,row]));
  for(const [rank,tier] of boundaries){
    const row=sourceByRank.get(rank),grade=leagueGrade(row.id);
    assert.deepStrictEqual([grade.storyGroup,grade.leagueRank,grade.leagueSize,grade.leagueTier],['upper',rank,80,tier],`upper rank ${rank}`);
  }

  const ranked=C.storyLeagueRows(units,'upper').filter(row=>row.grade.leagueRanked),rankCounts={};
  for(const row of ranked)rankCounts[row.grade.leagueRank]=(rankCounts[row.grade.leagueRank]||0)+1;
  assert.strictEqual(ranked.length,78);
  assert.deepStrictEqual(Object.entries(rankCounts).filter(([,count])=>count>1),[['11',2]]);
  assert.deepStrictEqual([5,34,57].filter(rank=>!rankCounts[rank]),[5,34,57]);
  assert.deepStrictEqual([leagueGrade('KB0H').leagueRank,leagueGrade('KB0H_').leagueRank],[11,11]);
  assert.deepStrictEqual(upper['unit_1761123532798_5416'].variants.map(row=>row.rank),[5,80]);
  assert.deepStrictEqual(upper.JC0h.variants.map(row=>row.rank),[34,41]);
  assert.deepStrictEqual(upper['unit_1761060002112_2027'].variants.map(row=>row.rank),[57,72]);
});

test('source-table membership includes special Morgan and mystic Ryougi but excludes common material',()=>{
  const morgan=unit('unit_1767884457709_1523'),ryougi=unit('unit_1761065051171_5253'),common=unit('300h');
  assert.strictEqual(C.storyLeagueKey(morgan),'legend');
  assert.strictEqual(leagueGrade(morgan.id).storyGroupLabel,'전설급');
  assert.strictEqual(C.storyLeagueKey(ryougi),'upper');
  assert.strictEqual(leagueGrade(ryougi.id).storyGroupLabel,'상위');
  assert.strictEqual(C.storyLeagueKey(common),'');
  assert.strictEqual(C.storyLeagueGrade(common),null);
  assert(!C.storyLeagueRows(units).some(row=>row.unit.id===common.id));
});

test('unranked estimates never consume measured ranks and sort after them',()=>{
  const rankedCounts={rare:42,upper:78,legend:76};
  for(const key of Object.keys(rankedCounts)){
    const rows=C.storyLeagueRows(units,key),firstUnranked=rows.findIndex(row=>!row.grade.leagueRanked),split=firstUnranked<0?rows.length:firstUnranked;
    assert.strictEqual(split,rankedCounts[key],`${key} measured/unranked split`);
    for(const row of rows.slice(split)){
      assert.strictEqual(row.grade.leagueRank,null,`${key}:${row.unit.id} invented rank`);
      assert.strictEqual(row.grade.leagueRanked,false);
      assert.strictEqual(row.grade.leagueBasis,'unranked-estimate');
    }
  }
});

test('league derivation leaves raw storyGrade results and measured source data unchanged',()=>{
  const before=Object.fromEntries(units.map(candidate=>[candidate.id,JSON.stringify(C.storyGrade(candidate))]));
  for(const key of ['rare','upper','legend'])C.storyLeagueRows(units,key);
  for(const candidate of units)assert.strictEqual(JSON.stringify(C.storyGrade(candidate)),before[candidate.id],`storyGrade mutated: ${candidate.id}`);

  const rareSource=C.storyGrade(unit('V10h')),rareLeague=leagueGrade('V10h');
  assert.deepStrictEqual([rareSource.tier,rareSource.score,rareSource.storyRank],[ 'B',58,undefined]);
  assert.deepStrictEqual([rareLeague.sourceTier,rareLeague.sourceScore,rareLeague.leagueTier,rareLeague.leagueRank],['B',58,'S',11]);
  const legendSource=C.storyGrade(unit('S30h')),legendLeague=leagueGrade('S30h');
  assert.deepStrictEqual([legendSource.scope,legendSource.storyRank,legendSource.tier],['nonupper',16,'A']);
  assert.deepStrictEqual([legendLeague.sourceTier,legendLeague.leagueTier],['A','SS']);
  const upperSource=C.storyGrade(unit('G50h')),upperLeague=leagueGrade('G50h');
  assert.deepStrictEqual([upperSource.scope,upperSource.storyRank,upperSource.tier],['upper',16,'A']);
  assert.deepStrictEqual([upperLeague.sourceTier,upperLeague.leagueTier],['A','SS']);

  const rareTuples=Object.entries(C.STORY_RARE_BENCHMARKS).sort((a,b)=>a[0].localeCompare(b[0])).map(([id,value])=>[id,value]);
  const legendTuples=Object.values(nonupper).sort((a,b)=>a.rank-b.rank).map(row=>[row.id,row.rank,row.tableTier,row.imageTier,row.displayName,row.metricType,row.value,row.approximate,row.note]);
  const upperTuples=Object.values(upper).flatMap(entry=>entry.variants||[]).sort((a,b)=>a.rank-b.rank).map(row=>[row.id,row.rank,row.tableTier,row.imageTier,row.displayName,row.metricType,row.value,row.approximate,row.note,row.stateKey]);
  assert.strictEqual(digest(rareTuples),'6a76d30268abde295d45539144a5aaa03cedf58a361b514e9da4277e44ac58c9');
  assert.strictEqual(digest(legendTuples),'1569a679b0c96cb6ea3948205b282c5c860d30f738859a9935b6b7375cc20d15');
  assert.strictEqual(digest(upperTuples),'abdbd8f714d385fa4305bc3c15f9ee19a3c137e51ebcb0214e1fbae49ca8a358');
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log(`PASS  ${name}`);}catch(error){failed++;console.error(`FAIL  ${name}\n${error.stack}`);}
}
if(failed)process.exit(1);
console.log(`\n${tests.length}/${tests.length} story-league ranking checks passed.`);
