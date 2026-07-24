#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const extensionDir = path.resolve(__dirname, '..');
const packageDir = path.resolve(extensionDir, '..');
const outputPath = path.join(packageDir, 'ord_2305_nightmare_helper_v17_10_0_manual.html');
const staleOutputs = [
  path.join(packageDir, 'ord_2305_nightmare_helper_v14_2_0_manual.html'),
  path.join(packageDir, 'ord_2305_nightmare_helper_v15_1_0_manual.html')
];
const cssPath = path.join(extensionDir, 'ord_app.css');
const cockpitCssPath = path.join(extensionDir, 'ord_cockpit_v15.css');
const scriptFiles = [
  'ord_units_data.js',
  'ord_upper_memo.js',
  'ord_synergy_memo.js',
  'ord_data_patch.js',
  'ord_story_nonupper_data.js',
  'ord_story_upper_data.js',
  'ord_upper_combat_data.js',
  'ord_upper_skill_digest.js',
  'ord_upper_skill_dps.js',
  'ord_core.js',
  'ord_squad_planner.js',
  'ord_v15_model.js',
  'ord_v15_ledger.js',
  'ord_v15_policy.js',
  'ord_v15_engine.js',
  'ord_run_log_compactor.js',
  'ord_run_log.js',
  'ord_app.js'
];

function read(relativePath) {
  return fs.readFileSync(path.join(extensionDir, relativePath), 'utf8');
}

function safeStyle(source) {
  return source.replace(/<\/style/gi, '<\\/style');
}

function safeScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

const standaloneBoot = `(function () {
  'use strict';
  const root = document.getElementById('ord-root');
  const catalog = window.ORD_TMO_UNITS || [];
  let app;
  try {
    app = window.ORDApp.create(root, catalog, {source: 'standalone-manual'});
  } catch (error) {
    const errorPanel = document.createElement('pre');
    errorPanel.style.cssText = 'padding:24px;color:#fff;background:#080d18;white-space:pre-wrap';
    errorPanel.textContent = String(error && (error.stack || error.message) || error);
    root.replaceChildren(errorPanel);
    return;
  }
  window.ORD_APP = app;

  const startedAt = Date.now();
  const sequence = 1;
  function makeSnapshot(bridgeAt) {
    const now = Number(bridgeAt) || Date.now();
    return {
      source: 'manual',
      parser: 'standalone-manual-v15',
      at: now,
      bridgeAt: now,
      scanAt: now,
      dataChangedAt: startedAt,
      url: location.href,
      helperId: 'offline',
      connected: false,
      sessionId: 'ord-manual-v15',
      seq: sequence,
      dataHash: 'standalone-empty-v15',
      unitCount: catalog.length,
      nonzero: 0,
      percentCount: catalog.length,
      progressFound: catalog.length,
      wispCount: 0,
      wispCountFound: true,
      parseErrors: 0,
      currentAbilities: {},
      currentAbilityRows: [],
      currentAbilitiesFound: false,
      currentAbilitySource: 'manual-unit-fallback',
      abilityCount: 0,
      units: [],
      counts: {},
      collection: {
        found: true,
        confidence: 1,
        adapter: 'standalone-manual-v15',
        errors: []
      },
      countDiscovery: {
        found: true,
        parsed: catalog.length,
        total: catalog.length,
        coverage: 1,
        errors: []
      }
    };
  }

  function refresh(message) {
    app.updateSnapshot(makeSnapshot(Date.now()));
    if (message) app.toast(message);
  }

  refresh('오프라인 수동 모드입니다. 덱·수동 보정에서 현재 패를 입력하세요.');
  app.onConnectionTest = function () {
    refresh('수동 모드 상태를 갱신했습니다. 자동 연동은 확장 프로그램에서 사용할 수 있습니다.');
  };
  app.onOpenTmo = function () {
    window.open('https://tmo.gg/ko/build-helper/32172', '_blank', 'noopener,noreferrer');
  };

  const heartbeat = setInterval(function () {
    app.updateSnapshot(makeSnapshot(Date.now()));
  }, 3000);
  addEventListener('beforeunload', function () {
    clearInterval(heartbeat);
    if (app && typeof app.destroy === 'function') app.destroy();
  }, {once: true});
})();`;

const inlineScripts = scriptFiles.map(file =>
  `<script data-source="${file}">\n${safeScript(read(file))}\n</script>`
).join('\n');

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="ord-helper" content="v17.10.0-decision-engine-manual">
  <meta name="description" content="현재 패의 정확한 순차 원장과 생존 마감으로 다음 한 행동만 결정하는 원랜디 2.305 악몽 수동 도우미">
  <title>원랜디 2.305 악몽 실전 판단 코치 v17.10.0 · 수동 모드</title>
  <style data-source="ord_app.css">
${safeStyle(fs.readFileSync(cssPath, 'utf8'))}
  </style>
  <style data-source="ord_cockpit_v15.css">
${safeStyle(fs.readFileSync(cockpitCssPath, 'utf8'))}
  </style>
</head>
<body>
  <div id="ord-root"></div>
${inlineScripts}
<script data-source="ord_boot_standalone.js">
${safeScript(standaloneBoot)}
</script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html, 'utf8');
for (const stalePath of staleOutputs) {
  if (stalePath !== outputPath && fs.existsSync(stalePath)) fs.rmSync(stalePath);
}
const size = fs.statSync(outputPath).size;
process.stdout.write(`built ${outputPath} (${size} bytes, ${scriptFiles.length + 1} inline scripts)\n`);
