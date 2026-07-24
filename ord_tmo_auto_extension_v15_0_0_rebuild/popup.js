'use strict';

// v17.10.0 compact popup; parser protocol remains v13-compatible.
const state = document.getElementById('state');
const detail = document.getElementById('detail');
const testButton = document.getElementById('test');
const PARSER = 'ord-tmo-parser-v13-adapter';
const PRIMARY_HELPER_ID = '32172';
const SUPPORTED_HELPER_IDS = new Set([PRIMARY_HELPER_ID, '34366']);
const PATTERNS = [
  'https://tmo.gg/*/build-helper/32172*',
  'https://www.tmo.gg/*/build-helper/32172*',
  'https://tmo.gg/build-helper/32172*',
  'https://www.tmo.gg/build-helper/32172*',
  'https://tmo.gg/*/build-helper/34366*',
  'https://www.tmo.gg/*/build-helper/34366*',
  'https://tmo.gg/build-helper/34366*',
  'https://www.tmo.gg/build-helper/34366*'
];

function helperId(url) {
  const match = String(url || '').match(/\/build-helper\/(\d+)/);
  return match ? match[1] : '';
}
function supported(id) { return SUPPORTED_HELPER_IDS.has(String(id || '')); }
function runtime(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, response => {
    const error = chrome.runtime.lastError;
    resolve(error ? {ok: false, error: error.message} : response || {});
  }));
}
function queryTabs(query) {
  return new Promise(resolve => chrome.tabs.query(query, tabs => resolve(tabs || [])));
}
function send(tabId, message) {
  return new Promise(resolve => chrome.tabs.sendMessage(tabId, message, response => {
    const error = chrome.runtime.lastError;
    resolve(error ? {
      ok: false,
      error: error.message,
      noReceiver: /Receiving end|Could not establish/i.test(error.message || '')
    } : response || {});
  }));
}
function inject(tabId) {
  return new Promise(resolve => chrome.scripting.executeScript({target: {tabId}, files: ['content-tmo.js']}, () => {
    const error = chrome.runtime.lastError;
    resolve(error ? {ok: false, error: error.message} : {ok: true});
  }));
}
function selectPreferred(tabs) {
  const supportedTabs = tabs.filter(tab => supported(helperId(tab.url)));
  return supportedTabs.find(tab => tab.active && helperId(tab.url) === PRIMARY_HELPER_ID) ||
    supportedTabs.find(tab => helperId(tab.url) === PRIMARY_HELPER_ID) ||
    supportedTabs.find(tab => tab.active) || supportedTabs[0] || null;
}
function matchingHeartbeat(snapshot, heartbeat, epoch) {
  return !!(snapshot && heartbeat && heartbeat.dataHash === snapshot.dataHash &&
    heartbeat.sessionId === snapshot.sessionId && Number(heartbeat.seq) === Number(snapshot.seq) &&
    Number(heartbeat.sourceEpoch) === epoch && Number(snapshot.sourceEpoch) === epoch);
}
function renderStored(value) {
  const snapshot = value.ordLatestSnapshot;
  const heartbeat = value.ordLatestHeartbeat;
  const diagnostic = value.ordLatestDiagnostic || {};
  const tabId = Number(value.ordPinnedTmoTabId) || 0;
  const epoch = Number(value.ordPinnedSourceEpoch) || 0;
  const collection = snapshot && snapshot.collection || {};
  const counts = snapshot && snapshot.countDiscovery || {};
  const unitCount = Number(snapshot && snapshot.unitCount) || 0;
  const coverage = unitCount ? (Number(counts.parsed) || 0) / unitCount : 0;
  const valid = !!(snapshot && tabId && supported(snapshot.helperId) && snapshot.parser === PARSER &&
    Number(snapshot.sourceTabId) === tabId && Number(snapshot.sourceEpoch) === epoch &&
    collection.found === true && Number(collection.confidence) >= 0.72 && counts.found === true &&
    unitCount >= 300 && unitCount <= 380 && coverage === 1 && Number(counts.missing || 0) === 0 &&
    Number(counts.ambiguous || 0) === 0 && snapshot.wispCountFound === true);
  if (!valid) {
    const confidence = Number(diagnostic.confidence) || 0;
    state.textContent = diagnostic.reason === 'invalid-snapshot'
      ? `수집 불완전 · 신뢰 ${(confidence * 100).toFixed(0)}% · 수량을 0으로 임의 처리하지 않음`
      : '아직 유효한 TMO 32172/34366 수신 데이터가 없습니다.';
    detail.textContent = (diagnostic.errors || []).slice(0, 3).join(' · ');
    return;
  }
  const bridgeAt = matchingHeartbeat(snapshot, heartbeat, epoch)
    ? Number(heartbeat.bridgeAt) || Number(snapshot.bridgeAt) || 0
    : Number(snapshot.bridgeAt) || 0;
  const scanAt = matchingHeartbeat(snapshot, heartbeat, epoch)
    ? Number(heartbeat.scanAt) || Number(snapshot.scanAt) || 0
    : Number(snapshot.scanAt) || 0;
  const bridgeAge = bridgeAt ? Math.max(0, Math.floor((Date.now() - bridgeAt) / 1000)) : 9999;
  const dataAge = snapshot.dataChangedAt ? Math.max(0, Math.floor((Date.now() - Number(snapshot.dataChangedAt)) / 1000)) : 9999;
  const label = bridgeAge <= 5 ? '실시간' : bridgeAge <= 10 ? '수신 지연' : '오래된 브릿지';
  state.textContent = `${label} · ${bridgeAge}초 전 · ${snapshot.helperId} · 수량 ${counts.parsed || 0}/${snapshot.unitCount || 0} · 신뢰 ${(Number(collection.confidence) * 100).toFixed(0)}%`;
  const warning = (collection.errors || []).slice(0, 2).join(', ');
  detail.textContent = `스캔 ${scanAt ? Math.max(0, Math.floor((Date.now() - scanAt) / 1000)) : '?'}초 전 · 실제 패 변화 ${dataAge < 9999 ? dataAge + '초 전' : '없음'} · 관찰 ${snapshot.sessionId}:${snapshot.seq}${warning ? ' · 경고 ' + warning : ''}`;
}
function refreshStatus() {
  chrome.storage.local.get([
    'ordLatestSnapshot',
    'ordLatestHeartbeat',
    'ordLatestDiagnostic',
    'ordPinnedTmoTabId',
    'ordPinnedSourceEpoch'
  ], renderStored);
}

document.getElementById('open').onclick = () => runtime({type: 'ORD_OPEN_DASHBOARD'});
document.getElementById('tmo').onclick = () => chrome.tabs.create({url: `https://tmo.gg/ko/build-helper/${PRIMARY_HELPER_ID}`});
testButton.onclick = async () => {
  testButton.disabled = true;
  state.textContent = 'TMO 탭 확인 중...';
  detail.textContent = '';
  try {
    const all = await queryTabs({url: PATTERNS});
    const tab = selectPreferred(all);
    if (!tab) {
      state.textContent = 'TMO 32172/34366 조합도우미 탭이 없습니다. 먼저 열어주세요.';
      return;
    }
    const id = helperId(tab.url);
    const pinned = await runtime({type: 'ORD_PIN_SOURCE', tabId: tab.id, helperId: id, url: tab.url});
    if (!pinned.ok) {
      state.textContent = 'TMO 탭 고정 실패: ' + (pinned.error || '알 수 없음');
      return;
    }
    let result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    if (result.noReceiver) {
      const injected = await inject(tab.id);
      if (!injected.ok) {
        state.textContent = 'TMO 주입 실패: ' + injected.error;
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 260));
      result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    }
    if (result.ok && result.snapshot) {
      const snapshot = result.snapshot;
      const counts = snapshot.countDiscovery || {};
      state.textContent = `수신 성공 · ${snapshot.helperId} · 수량 ${counts.parsed || 0}/${snapshot.unitCount || 0} · 신뢰 ${(Number(snapshot.collection && snapshot.collection.confidence || 0) * 100).toFixed(0)}%`;
      detail.textContent = `관찰 ${snapshot.sessionId}:${snapshot.seq}:${snapshot.dataHash}`;
    } else {
      state.textContent = '수신 거부 · ' + (result.error || 'TMO 화면을 새로고침하세요.');
      detail.textContent = '수량 탐색 실패를 0개로 간주하지 않습니다.';
    }
  } finally {
    testButton.disabled = false;
    setTimeout(refreshStatus, 350);
  }
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.ordLatestSnapshot || changes.ordLatestHeartbeat || changes.ordLatestDiagnostic)) refreshStatus();
});
refreshStatus();
