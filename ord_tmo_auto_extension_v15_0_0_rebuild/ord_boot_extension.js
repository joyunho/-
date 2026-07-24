(function () {
  'use strict';

  // v17.10.0 live cockpit bridge; connector protocol stays v13.
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
  const PARSER = 'ord-tmo-parser-v13-adapter';
  const PRIMARY_HELPER_ID = '32172';
  const SUPPORTED_HELPER_IDS = new Set([PRIMARY_HELPER_ID, '34366']);
  const SOURCE_KEY = 'ordPinnedTmoTabId';
  const EPOCH_KEY = 'ordPinnedSourceEpoch';
  let monitorId = 0;
  let renderTimer = 0;
  let pinnedTabId = 0;
  let pinnedEpoch = 0;
  let checking = false;

  function get(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, value => resolve(value || {})); }
      catch (_) { resolve({}); }
    });
  }
  function runtime(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          void chrome.runtime.lastError;
          resolve(response || {});
        });
      } catch (_) { resolve({}); }
    });
  }
  function tabs(query) {
    return new Promise(resolve => {
      try { chrome.tabs.query(query, result => resolve(result || [])); }
      catch (_) { resolve([]); }
    });
  }
  function tabById(tabId) {
    return new Promise(resolve => {
      try {
        if (!chrome.tabs.get) {
          tabs({}).then(all => resolve(all.find(tab => tab.id === tabId) || null));
          return;
        }
        chrome.tabs.get(tabId, tab => {
          const error = chrome.runtime.lastError;
          resolve(error ? null : tab || null);
        });
      } catch (_) { resolve(null); }
    });
  }
  function send(tabId, message) {
    return new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(tabId, message, response => {
          const error = chrome.runtime.lastError;
          resolve(error ? {
            ok: false,
            error: error.message,
            noReceiver: /Receiving end|Could not establish/i.test(error.message || '')
          } : response || {ok: true});
        });
      } catch (error) { resolve({ok: false, error: String(error)}); }
    });
  }
  function inject(tabId) {
    return new Promise(resolve => {
      try {
        chrome.scripting.executeScript({target: {tabId}, files: ['content-tmo.js']}, () => {
          const error = chrome.runtime.lastError;
          resolve(error ? {ok: false, error: error.message} : {ok: true});
        });
      } catch (error) { resolve({ok: false, error: String(error)}); }
    });
  }
  function helperId(url) {
    const match = String(url || '').match(/\/build-helper\/(\d+)/);
    return match ? match[1] : '';
  }
  function supported(id) { return SUPPORTED_HELPER_IDS.has(String(id || '')); }
  function validSnapshot(snapshot) {
    const id = String(snapshot && snapshot.helperId || '');
    const collection = snapshot && snapshot.collection || {};
    const counts = snapshot && snapshot.countDiscovery || {};
    const unitCount = Number(snapshot && snapshot.unitCount) || 0;
    return !!(snapshot && supported(id) && helperId(snapshot.url) === id && snapshot.parser === PARSER &&
      snapshot.sessionId && Number(snapshot.seq) > 0 && snapshot.dataHash && collection.found === true &&
      Number(collection.confidence) >= 0.72 && counts.found === true && unitCount >= 300 && unitCount <= 520 &&
      Number(counts.parsed) === unitCount && Number(counts.missing || 0) === 0 && Number(counts.ambiguous || 0) === 0 &&
      snapshot.wispCountFound === true);
  }
  function sourceMatches(snapshot) {
    return pinnedTabId > 0 && pinnedEpoch > 0 && validSnapshot(snapshot) &&
      Number(snapshot.sourceEpoch) === pinnedEpoch && Number(snapshot.sourceTabId) === pinnedTabId;
  }
  function matchingHeartbeat(snapshot, heartbeat) {
    return !!(snapshot && heartbeat && heartbeat.dataHash === snapshot.dataHash &&
      heartbeat.sessionId === snapshot.sessionId && Number(heartbeat.seq) === Number(snapshot.seq) &&
      Number(heartbeat.sourceEpoch) === Number(snapshot.sourceEpoch) &&
      Number(heartbeat.sourceTabId) === Number(snapshot.sourceTabId));
  }
  function withHeartbeat(snapshot, heartbeat) {
    if (!matchingHeartbeat(snapshot, heartbeat)) return snapshot;
    return Object.assign({}, snapshot, {
      bridgeAt: Number(heartbeat.bridgeAt) || Number(snapshot.bridgeAt) || 0,
      scanAt: Number(heartbeat.scanAt) || Number(snapshot.scanAt) || Number(snapshot.at) || 0
    });
  }
  function touchHeartbeat(app, heartbeat) {
    const current = app && app.state && app.state.snapshot;
    if (!current || !matchingHeartbeat(current, heartbeat)) return false;
    current.bridgeAt = Number(heartbeat.bridgeAt) || current.bridgeAt || 0;
    current.scanAt = Number(heartbeat.scanAt) || current.scanAt || current.at || 0;
    app.state.liveAt = current.bridgeAt;
    // A heartbeat carries no new hand data. Replacing the whole root here
    // used to close an open native select/details every ~3.5 seconds.
    // The app's one-second clock owns any eventual health-state transition.
    app.updateLiveStatusOnly();
    return true;
  }
  function freshHeartbeat(snapshot, heartbeat, maxAge) {
    return matchingHeartbeat(snapshot, heartbeat) &&
      Date.now() - Number(heartbeat.bridgeAt || heartbeat.scanAt || 0) <= maxAge;
  }

  async function selectTab() {
    const [all, source, stored] = await Promise.all([
      tabs({url: PATTERNS}),
      runtime({type: 'ORD_GET_SOURCE'}),
      get(['ordLastTmoUrl'])
    ]);
    const list = all.filter(tab => supported(helperId(tab.url)));
    if (!list.length) return null;
    let selected = list.find(tab => tab.id === Number(source.tabId));
    if (!selected && supported(helperId(stored.ordLastTmoUrl))) selected = list.find(tab => tab.url === stored.ordLastTmoUrl);
    if (!selected) selected = list.find(tab => tab.active && helperId(tab.url) === PRIMARY_HELPER_ID);
    if (!selected) selected = list.find(tab => helperId(tab.url) === PRIMARY_HELPER_ID);
    if (!selected) selected = list.find(tab => tab.active);
    return selected || list[0];
  }
  async function pin(tab) {
    if (!tab || !supported(helperId(tab.url))) return false;
    const result = await runtime({type: 'ORD_PIN_SOURCE', tabId: tab.id, helperId: helperId(tab.url), url: tab.url});
    if (!result.ok) return false;
    pinnedTabId = Number(result.tabId) || tab.id;
    pinnedEpoch = Number(result.sourceEpoch) || pinnedEpoch;
    return true;
  }
  async function unpin() {
    const result = await runtime({type: 'ORD_PIN_SOURCE', tabId: 0, helperId: '', url: ''});
    pinnedTabId = 0;
    pinnedEpoch = Number(result.sourceEpoch) || pinnedEpoch;
    return result;
  }
  async function ensureContent(tab) {
    if (!tab) return {ok: false, error: 'TMO 탭 없음'};
    let result = await send(tab.id, {type: 'ORD_PING'});
    if (!result.noReceiver) return result;
    const injected = await inject(tab.id);
    if (!injected.ok) return injected;
    await new Promise(resolve => setTimeout(resolve, 260));
    return send(tab.id, {type: 'ORD_PING'});
  }
  async function collect(tab) {
    if (!tab) return {ok: false, error: 'TMO 탭 없음'};
    let result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    if (result.noReceiver) {
      const injected = await inject(tab.id);
      if (!injected.ok) return injected;
      await new Promise(resolve => setTimeout(resolve, 260));
      result = await send(tab.id, {type: 'ORD_COLLECT_NOW'});
    }
    return result;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('ord-root');
    let app;
    try { app = window.ORDApp.create(root, window.ORD_TMO_UNITS || [], {source: 'extension', directionWorkerUrl: chrome.runtime.getURL('ord_direction_worker.js')}); }
    catch (error) {
      // v17.7: 오류 문자열이 HTML로 해석되지 않도록 textContent로 넣는다.
      const errorPanel = document.createElement('pre');
      errorPanel.style.cssText = 'padding:24px;color:#fff;background:#080d18;white-space:pre-wrap';
      errorPanel.textContent = String(error && (error.stack || error.message) || error);
      root.replaceChildren(errorPanel);
      return;
    }
    window.ORD_APP = app;

    const clearSource = () => {
      if (!app.state.snapshot) return;
      app.state.snapshot = null;
      app.state.liveAt = 0;
      app.setMessage('TMO 원본 탭이 바뀌어 현재 패를 다시 확인합니다.');
      app.render();
    };
    const apply = snapshot => {
      if (!sourceMatches(snapshot)) return;
      try { app.updateSnapshot(snapshot); }
      catch (error) {
        console.error(error);
        app.toast('스냅샷 적용 오류: ' + error.message);
      }
    };
    const scheduleRender = () => {
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = 0;
        try { app.render(); } catch (error) { console.error(error); }
      }, 120);
    };
    const touch = heartbeat => { touchHeartbeat(app, heartbeat); };

    const source = await runtime({type: 'ORD_GET_SOURCE'});
    pinnedTabId = Number(source.tabId) || 0;
    pinnedEpoch = Number(source.sourceEpoch) || 0;
    const stored = await get(['ordLatestSnapshot', 'ordLatestHeartbeat', 'ordLatestDiagnostic']);
    app.state.connectionDiagnostic = stored.ordLatestDiagnostic || null;
    apply(withHeartbeat(stored.ordLatestSnapshot, stored.ordLatestHeartbeat));
    if (!stored.ordLatestSnapshot && stored.ordLatestDiagnostic && app.state.tab === 'data') scheduleRender();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const nextTabId = changes[SOURCE_KEY] ? Number(changes[SOURCE_KEY].newValue) || 0 : pinnedTabId;
      const nextEpoch = changes[EPOCH_KEY] ? Number(changes[EPOCH_KEY].newValue) || 0 : pinnedEpoch;
      const changedSource = nextTabId !== pinnedTabId || nextEpoch !== pinnedEpoch;
      pinnedTabId = nextTabId;
      pinnedEpoch = nextEpoch;
      if (changedSource) clearSource();
      const nextSnapshot = changes.ordLatestSnapshot && changes.ordLatestSnapshot.newValue;
      const nextHeartbeat = changes.ordLatestHeartbeat && changes.ordLatestHeartbeat.newValue;
      if (changes.ordLatestDiagnostic) {
        app.state.connectionDiagnostic = changes.ordLatestDiagnostic.newValue || null;
        if (app.state.tab === 'data') scheduleRender();
      }
      if (nextSnapshot) apply(withHeartbeat(nextSnapshot, nextHeartbeat));
      else if (nextHeartbeat) touch(nextHeartbeat);
    });

    app.onConnectionTest = async () => {
      const tab = await selectTab();
      if (!tab) {
        app.toast('열려 있는 TMO 32172/34366 조합도우미 탭이 없습니다.');
        return;
      }
      const beforeTab = pinnedTabId;
      const beforeEpoch = pinnedEpoch;
      if (!await pin(tab)) {
        app.toast('TMO 원본 탭을 고정하지 못했습니다.');
        return;
      }
      if (beforeTab !== pinnedTabId || beforeEpoch !== pinnedEpoch) clearSource();
      const result = await collect(tab);
      if (result && result.ok) {
        const latest = await get(['ordLatestSnapshot', 'ordLatestHeartbeat']);
        apply(withHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat));
        const snapshot = result.snapshot || {};
        const counts = snapshot.countDiscovery || {};
        app.toast(`TMO 수신 성공 · ${helperId(tab.url)} · 수량 ${counts.parsed || 0}/${snapshot.unitCount || 0} · 신뢰 ${(Number(snapshot.collection && snapshot.collection.confidence || 0) * 100).toFixed(0)}%`);
      } else {
        app.toast('TMO 수신 거부: ' + ((result && result.error) || '수량 탐색이 불완전합니다. TMO 페이지를 새로고침하세요.'));
      }
    };
    app.onOpenTmo = async () => {
      const storedUrl = await get(['ordLastTmoUrl']);
      const url = supported(helperId(storedUrl.ordLastTmoUrl))
        ? storedUrl.ordLastTmoUrl
        : `https://tmo.gg/ko/build-helper/${PRIMARY_HELPER_ID}`;
      chrome.tabs.create({url});
    };

    const initial = await selectTab();
    if (initial) {
      const beforeTab = pinnedTabId;
      const beforeEpoch = pinnedEpoch;
      if (await pin(initial)) {
        if (beforeTab !== pinnedTabId || beforeEpoch !== pinnedEpoch) clearSource();
        const latest = await get(['ordLatestSnapshot', 'ordLatestHeartbeat']);
        if (sourceMatches(latest.ordLatestSnapshot) && freshHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat, 10000)) {
          apply(withHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat));
        } else {
          await collect(initial);
        }
      }
    } else {
      setTimeout(() => app.toast('TMO 32172 주 도우미를 열고 연결해 주세요. 34366도 호환됩니다.'), 300);
    }

    monitorId = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        let tab = null;
        if (pinnedTabId) {
          tab = await tabById(pinnedTabId);
          if (tab && !supported(helperId(tab.url))) tab = null;
          if (!tab) {
            await unpin();
            clearSource();
          }
        }
        if (!tab) {
          tab = await selectTab();
          if (tab) {
            const beforeEpoch = pinnedEpoch;
            if (await pin(tab) && beforeEpoch !== pinnedEpoch) clearSource();
          }
        }
        if (tab) {
          const latest = await get(['ordLatestSnapshot', 'ordLatestHeartbeat']);
          if (!sourceMatches(latest.ordLatestSnapshot) || !freshHeartbeat(latest.ordLatestSnapshot, latest.ordLatestHeartbeat, 12000)) {
            await ensureContent(tab);
          }
        }
      } finally { checking = false; }
    }, 8000);

    addEventListener('beforeunload', () => {
      clearInterval(monitorId);
      clearTimeout(renderTimer);
    }, {once: true});
  });
})();
