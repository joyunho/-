#!/usr/bin/env node
'use strict';

// 스토리 파괴 속도 등급표 생성기 (v17.7).
// 코드가 실제로 쓰는 것과 같은 데이터(ord_core의 리그 등급)를 그대로
// 마크다운으로 내보낸다 — 문서와 코드가 다시 어긋나지 않게 하는 단일
// 원천이다.  원본 실측 순위·측정값은 바꾸지 않는다.

const fs = require('fs');
const path = require('path');

const extensionDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(extensionDir, '..');
const outputPath = path.join(repoDir, '스토리_등급표_v17_9.md');

global.window = global;
const originalWarn = console.warn;
console.warn = () => {};
for (const file of [
  'ord_units_data.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js'
]) require(path.join(extensionDir, file));
console.warn = originalWarn;

const C = global.ORDCore;
const units = global.ORD_TMO_UNITS;

function measureText(grade) {
  // sourceNote는 '상위 실측 1위 · 15.87초 파괴'처럼 순위 접두를 포함할 수
  // 있다 — 표에는 순위 열이 따로 있으므로 측정값만 남긴다.
  // 세팅 조건 등 부가 문구는 앱 화면에 그대로 남고, 표에는 측정값 한
  // 조각만 싣는다(업로드된 v17.7 표와 같은 형식).
  const note = String(grade.sourceNote || '').trim();
  const parts = note.split('·').map(part => part.trim()).filter(Boolean);
  const start = parts.length > 1 && /실측\s*\d+위$|리그\s*\d+\/\d+위$/.test(parts[0]) ? 1 : 0;
  return parts[start] || note;
}

const lines = [];
lines.push('# 스토리 파괴 속도 등급표 (v17.7 · 리그별 SSS~F 9단계)');
lines.push('');
lines.push('> 이 파일은 `tools/build_story_grade_table.js`로 생성됩니다. 원본 실측 순위와 측정값은 바꾸지 않고, 희귀·상위·전설급을 서로 섞지 않은 채 각 리그의 원본 순위를 9개 등분위로 재분류합니다.');

for (const league of ['rare', 'upper', 'legend']) {
  const meta = C.STORY_LEAGUES[league];
  const rows = C.storyLeagueRows(units, league);
  const ranked = rows.filter(row => row.grade.leagueRanked).sort((a, b) => a.grade.leagueRank - b.grade.leagueRank || C.nameOf(a.unit).localeCompare(C.nameOf(b.unit), 'ko'));
  const unranked = rows.filter(row => !row.grade.leagueRanked);
  lines.push('');
  lines.push(`## ${meta.label} 리그`);
  lines.push('');
  lines.push(`- 전체 ${rows.length}기 · 원본 순위 반영 ${ranked.length}기 · 등급 산정 기준 ${meta.size}위`);
  for (const tier of C.STORY_GRADE_TIERS) {
    const tierRows = ranked.filter(row => row.grade.leagueTier === tier);
    if (!tierRows.length) continue;
    lines.push('');
    lines.push(`### ${tier}등급`);
    lines.push('');
    for (const row of tierRows) lines.push(`- ${row.grade.leagueRank}위 · ${C.displayNameOf(row.unit)} · ${measureText(row.grade)}`);
  }
  if (unranked.length) {
    lines.push('');
    lines.push('### 순위 외 자료·추정');
    lines.push('');
    for (const row of unranked) lines.push(`- ${C.nameOf(row.unit)} · ${row.grade.basisLabel} · ${String(row.grade.sourceNote || '').trim()}`);
  }
}

lines.push('');
lines.push('## 판정 원칙');
lines.push('');
lines.push('- 동일 원본 순위의 변형 유닛은 같은 등급을 유지합니다.');
lines.push('- 순위 밖 유닛은 SSS~F 실측 등급에 억지로 끼워 넣지 않습니다.');
lines.push('- 이 등급은 스토리 파괴 속도 비교이며, 악몽 50·65라운드 클리어 확률을 뜻하지 않습니다.');
lines.push('');

fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
process.stdout.write(`built ${outputPath} (${fs.statSync(outputPath).size} bytes)\n`);
