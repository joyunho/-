'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const extension = path.resolve(process.argv[2] || path.join(root, 'ord_tmo_auto_extension_v15_0_0_rebuild'));
const read = name => fs.readFileSync(path.join(extension, name), 'utf8');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed += 1;
    console.log(`PASS ${name}`);
  });
}

function createBackgroundHarness() {
  const storage = {};
  const messageListeners = [];
  const removedListeners = [];
  const dashboardTabs = [];
  const calls = {created: [], updated: []};
  const chrome = {
    runtime: {
      lastError: null,
      getURL: name => `chrome-extension://ord-v13/${name}`,
      onMessage: {addListener: listener => messageListeners.push(listener)}
    },
    storage: {
      local: {
        get(keys, callback) {
          const result = {};
          for (const key of Array.isArray(keys) ? keys : Object.keys(keys || {})) result[key] = storage[key];
          callback(result);
        },
        set(value, callback) {
          Object.assign(storage, value);
          if (callback) callback();
        }
      }
    },
    tabs: {
      query(query, callback) {
        callback(query && Object.keys(query).length === 0 ? dashboardTabs.slice() : []);
      },
      create(value, callback) {
        calls.created.push(value);
        const tab = {id: 900 + calls.created.length, url: value.url};
        dashboardTabs.push(tab);
        if (callback) callback(tab);
      },
      update(tabId, value, callback) {
        calls.updated.push({tabId, value});
        if (callback) callback({id: tabId});
      },
      onRemoved: {addListener: listener => removedListeners.push(listener)}
    }
  };
  const context = vm.createContext({chrome, console, Date, Math, Number, String, Object, Array, Set, Map, Promise, JSON, Error});
  vm.runInContext(read('background.js'), context, {filename: 'background.js'});
  assert.strictEqual(messageListeners.length, 1, 'background message listener');

  function dispatch(message, sender = {}) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) reject(new Error(`message timeout: ${message.type}`));
      }, 1000);
      const reply = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      const keep = messageListeners[0](message, sender, reply);
      if (keep !== true && !done) reply(undefined);
    });
  }
  return {storage, dashboardTabs, calls, dispatch};
}

function snapshot(helperId, overrides = {}) {
  const now = Date.now();
  const units = Array.from({length: 307}, (_, index) => ({
    id: `u${index}`,
    name: `unit-${index}`,
    count: 0,
    countFound: true
  }));
  return Object.assign({
    source: 'tmo',
    parser: 'ord-tmo-parser-v13-adapter',
    adapterId: helperId === '32172' ? 'tmo-32172-main' : 'tmo-34366-compat',
    helperId,
    sessionId: 'session-a',
    seq: 1,
    dataHash: 'hash-a',
    scanAt: now,
    dataChangedAt: now,
    at: now,
    url: `https://tmo.gg/ko/build-helper/${helperId}`,
    unitCount: units.length,
    units,
    counts: Object.fromEntries(units.map(unit => [unit.id, 0])),
    wispCount: 0,
    wispCountFound: true,
    collection: {found: true, confidence: 0.95, errors: []},
    countDiscovery: {found: true, parsed: units.length, missing: 0, ambiguous: 0, confidence: 1, errors: []}
  }, overrides);
}

(async () => {
  await test('manifest limits hosts to the two supported build-helper pages', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert.strictEqual(manifest.version, '17.10.0');
    assert.deepStrictEqual(manifest.permissions.sort(), ['scripting', 'storage', 'tabs']);
    const helperPermissions=manifest.host_permissions.filter(pattern=>pattern.includes('/build-helper/'));
    assert.strictEqual(helperPermissions.length,8);
    assert(helperPermissions.every(pattern => /build-helper\/(32172|34366)/.test(pattern)));
    assert(!manifest.host_permissions.some(pattern=>/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(pattern)));
    assert(manifest.content_scripts[0].matches.every(pattern => pattern.includes('/build-helper/')));
    assert(manifest.content_scripts[0].matches.every(pattern => /build-helper\/(32172|34366)/.test(pattern)));
    assert(!manifest.permissions.includes('webRequest'));
  });

  await test('content parser has primary 32172 and compatibility 34366 adapters', () => {
    const source = read('content-tmo.js');
    assert(source.includes("'32172': Object.freeze"));
    assert(source.includes("id: 'tmo-32172-main'"));
    assert(source.includes("'34366': Object.freeze"));
    assert(source.includes("id: 'tmo-34366-compat'"));
    assert(source.indexOf("'32172': Object.freeze") < source.indexOf("'34366': Object.freeze"));
  });

  await test('count discovery exposes found confidence and errors instead of silent zero', () => {
    const source = read('content-tmo.js');
    assert(source.includes("found: false, confidence: 0, source: 'not-found', errors: ['count-not-found']"));
    assert(source.includes('countFound: count.found'));
    assert(source.includes('countDiscovery: {'));
    assert(source.includes('collection: {'));
    assert(source.includes('missing-counts:'));
    assert(source.includes('countStatus:'));
    assert(source.includes('num(value) * owned'),'numeric ability totals do not multiply duplicate-unit counts');
    assert(source.includes("values[key] = (values[key] || 0) + owned"),'boolean ability totals do not multiply duplicate-unit counts');
    assert(/위\(\?:습\|스프\)/.test(source),'selection-wisp matcher does not accept both 위습 and 위스프');
  });

  await test('connector validity is confidence based rather than fixed 307/hash only', () => {
    const sources = ['background.js', 'ord_boot_extension.js', 'popup.js'].map(read).join('\n');
    assert(!/unitCount\s*={2,3}\s*307/.test(sources));
    assert(!/idSetHash\s*={2,3}\s*['"]16e572cb/.test(sources));
    assert(sources.includes('collection.confidence'));
    assert(sources.includes('counts.parsed'));
    assert(sources.includes('unitCount >= 300')&&sources.includes('unitCount <= 520'));
    assert(sources.includes('parsedCoverage === 1'));
    assert(sources.includes('counts.missing')&&sources.includes('counts.ambiguous'));
    assert(sources.includes('wispCountFound'));
  });

  await test('scan data-change and bridge timestamps are separate', () => {
    const content = read('content-tmo.js');
    const background = read('background.js');
    for (const key of ['scanAt', 'dataChangedAt', 'bridgeAt']) {
      assert(content.includes(key), `content ${key}`);
      assert(background.includes(key), `background ${key}`);
    }
    assert(content.includes('observationKey'));
    assert(background.includes('ordLatestHeartbeat'));
  });

  await test('DOM scanner uses debounced events, shallow probes, and a low-rate full audit', () => {
    const source = read('content-tmo.js');
    assert(source.includes('setInterval(poll, POLL_INTERVAL_MS)'));
    assert(source.includes('const POLL_INTERVAL_MS = 2000'));
    assert(source.includes('const FULL_AUDIT_INTERVAL_MS = 30000'));
    assert(source.includes("type: 'ORD_HEARTBEAT'"));
    assert(source.includes('new MutationObserver'));
  });

  await test('continuous DOM churn cannot starve the scan or the dispatch (v16.6 freeze fix)', () => {
    const source = read('content-tmo.js');
    // The mutation debounce must clamp to an absolute deadline instead of
    // trailing forever, and the 400ms stability confirm must give up and
    // ship the freshest scan once changed data has been blocked past the
    // force window.  A recorded game froze from the transcend craft through
    // the round-60 boss because both layers starved under battle churn.
    assert(source.includes('const UNSTABLE_FORCE_MS = 4000'));
    assert(source.includes('dirtySince + UNSTABLE_FORCE_MS'));
    assert(/const dueAt = force \? now \+ 90 : Math\.min\(now \+ 700, Math\.max\(now, dirtySince \+ UNSTABLE_FORCE_MS\)\)/.test(source));
    assert(source.includes("lastPublishedAt > 0 && Date.now() - lastPublishedAt >= UNSTABLE_FORCE_MS"));
    assert(source.includes("dispatch(snapshot, starved ? 'unstable-forced' : reason || 'data-change')"));
    assert(source.includes('if (changed && !starved && pendingHash !== snapshot.dataHash)'));
  });

  await test('background accepts both helpers and rejects unsupported helper', async () => {
    const harness = createBackgroundHarness();
    const bad = await harness.dispatch({type: 'ORD_PIN_SOURCE', tabId: 1, helperId: '99999', url: 'https://tmo.gg/ko/build-helper/99999'});
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.error, 'unsupported-helper');

    const main = await harness.dispatch({type: 'ORD_PIN_SOURCE', tabId: 11, helperId: '32172', url: 'https://tmo.gg/ko/build-helper/32172'});
    assert.strictEqual(main.ok, true);
    const minimumUnits=Array.from({length:300},(_,index)=>({id:`minimum-${index}`,name:`minimum-${index}`,count:0,countFound:true}));
    const acceptedMain = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: snapshot('32172',{
      unitCount:300,units:minimumUnits,counts:Object.fromEntries(minimumUnits.map(unit=>[unit.id,0])),
      countDiscovery:{found:true,parsed:300,missing:0,ambiguous:0,confidence:1,errors:[]}
    })}, {tab: {id: 11}});
    assert.strictEqual(acceptedMain.changed, true);

    const compat = await harness.dispatch({type: 'ORD_PIN_SOURCE', tabId: 22, helperId: '34366', url: 'https://tmo.gg/ko/build-helper/34366'});
    assert.strictEqual(compat.ok, true);
    const acceptedCompat = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: snapshot('34366')}, {tab: {id: 22}});
    assert.strictEqual(acceptedCompat.changed, true);
  });

  await test('background stores heartbeat without turning it into another data observation', async () => {
    const harness = createBackgroundHarness();
    await harness.dispatch({type: 'ORD_PIN_SOURCE', tabId: 31, helperId: '32172', url: 'https://tmo.gg/ko/build-helper/32172'});
    const first = snapshot('32172');
    const accepted = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: first}, {tab: {id: 31}});
    assert.strictEqual(accepted.changed, true);
    const storedBridgeAt = harness.storage.ordLatestSnapshot.bridgeAt;

    const heartbeat = snapshot('32172', {
      scanAt: first.scanAt + 50,
      at: first.at + 50,
      dataChangedAt: first.dataChangedAt,
      sessionId: first.sessionId,
      seq: first.seq,
      dataHash: first.dataHash
    });
    const heartbeatResult = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: heartbeat}, {tab: {id: 31}});
    assert.strictEqual(heartbeatResult.heartbeat, true);
    assert.strictEqual(harness.storage.ordLatestSnapshot.seq, 1);
    assert.strictEqual(harness.storage.ordLatestSnapshot.dataHash, 'hash-a');
    assert.strictEqual(harness.storage.ordLatestSnapshot.bridgeAt, storedBridgeAt);
    assert.strictEqual(harness.storage.ordLatestHeartbeat.seq, 1);
    assert.strictEqual(harness.storage.ordLatestHeartbeat.dataHash, 'hash-a');

    const falseObservation = snapshot('32172', {
      scanAt: first.scanAt + 60,
      at: first.at + 60,
      dataChangedAt: first.dataChangedAt,
      sessionId: first.sessionId,
      seq: 2,
      dataHash: first.dataHash
    });
    const falseObservationResult = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: falseObservation}, {tab: {id: 31}});
    assert.strictEqual(falseObservationResult.ignored, 'sequence-without-data-change');

    const changed = snapshot('32172', {
      scanAt: first.scanAt + 100,
      at: first.at + 100,
      dataChangedAt: first.dataChangedAt + 100,
      sessionId: first.sessionId,
      seq: 2,
      dataHash: 'hash-b'
    });
    const changedResult = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: changed}, {tab: {id: 31}});
    assert.strictEqual(changedResult.changed, true);
    assert.strictEqual(harness.storage.ordLatestSnapshot.seq, 2);
    assert.strictEqual(harness.storage.ordLatestSnapshot.dataHash, 'hash-b');

    const replay = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: first}, {tab: {id: 31}});
    assert.strictEqual(replay.ignored, 'old-sequence');
  });

  await test('first playable TMO unit starts one round generation and does not retrigger until the hand clears', async () => {
    const harness=createBackgroundHarness();
    await harness.dispatch({type:'ORD_PIN_SOURCE',tabId:41,helperId:'32172',url:'https://tmo.gg/ko/build-helper/32172'});
    const start=Date.now();
    const send=(seq,hash,playableUnitCount,offset)=>harness.dispatch({type:'ORD_SNAPSHOT',snapshot:snapshot('32172',{
      sessionId:'auto-round-session',seq,dataHash:hash,playableUnitCount,playableNonzero:playableUnitCount>0?1:0,
      scanAt:start+offset,at:start+offset,dataChangedAt:start+offset
    })},{tab:{id:41}});

    await send(1,'empty',0,10);
    assert.deepStrictEqual(
      [harness.storage.ordAutoRoundState.generation,harness.storage.ordAutoRoundState.active,harness.storage.ordAutoRoundState.startedAt],
      [0,false,0]
    );

    await send(2,'first-unit',1,20);
    const firstStartedAt=harness.storage.ordAutoRoundState.startedAt;
    assert.deepStrictEqual(
      [harness.storage.ordAutoRoundState.generation,harness.storage.ordAutoRoundState.active,firstStartedAt],
      [1,true,start+20]
    );
    assert.strictEqual(harness.storage.ordLatestSnapshot.autoRound.generation,1);

    await send(3,'second-unit',2,30);
    assert.deepStrictEqual(
      [harness.storage.ordAutoRoundState.generation,harness.storage.ordAutoRoundState.active,harness.storage.ordAutoRoundState.startedAt],
      [1,true,firstStartedAt]
    );

    await send(4,'cleared',0,40);
    assert.deepStrictEqual(
      [harness.storage.ordAutoRoundState.generation,harness.storage.ordAutoRoundState.active,harness.storage.ordAutoRoundState.startedAt],
      [1,false,0]
    );

    await send(5,'new-hand',1,50);
    assert.deepStrictEqual(
      [harness.storage.ordAutoRoundState.generation,harness.storage.ordAutoRoundState.active,harness.storage.ordAutoRoundState.startedAt],
      [2,true,start+50]
    );
  });

  await test('299-row boundary is diagnosed and never replaces a valid snapshot', async () => {
    const harness = createBackgroundHarness();
    await harness.dispatch({type: 'ORD_PIN_SOURCE', tabId: 41, helperId: '32172', url: 'https://tmo.gg/ko/build-helper/32172'});
    const good = snapshot('32172');
    await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: good}, {tab: {id: 41}});
    const partialUnits=Array.from({length:299},(_,index)=>({id:`partial-${index}`,name:`partial-${index}`,count:0,countFound:true}));
    const invalid = snapshot('32172', {
      seq: 2,
      dataHash: 'hash-invalid',
      unitCount:299,
      units:partialUnits,
      counts:Object.fromEntries(partialUnits.map(unit=>[unit.id,0])),
      collection: {found: true, confidence: 0.95, errors: ['below-adapter-minimum']},
      countDiscovery: {found: true, parsed: 299, missing: 0, ambiguous: 0, confidence: 1, errors: ['below-adapter-minimum']},
      wispCountFound:true
    });
    const result = await harness.dispatch({type: 'ORD_SNAPSHOT', snapshot: invalid}, {tab: {id: 41}});
    assert.strictEqual(result.ignored, 'invalid-snapshot');
    assert.strictEqual(harness.storage.ordLatestSnapshot.dataHash, 'hash-a');
    assert.strictEqual(harness.storage.ordLatestDiagnostic.reason, 'invalid-snapshot');
    assert(harness.storage.ordLatestDiagnostic.errors.includes('below-adapter-minimum'));
  });

  await test('dashboard open reuses its singleton tab', async () => {
    const harness = createBackgroundHarness();
    harness.dashboardTabs.push({id: 77, url: 'chrome-extension://ord-v13/ord_helper.html'});
    const result = await harness.dispatch({type: 'ORD_OPEN_DASHBOARD'});
    assert.strictEqual(result.reused, true);
    assert.strictEqual(result.tabId, 77);
    assert.strictEqual(harness.calls.created.length, 0);
    assert.strictEqual(harness.calls.updated[0].tabId, 77);
    assert.strictEqual(harness.calls.updated[0].value.active, true);
  });

  await test('dashboard boot prefers 32172 and never promotes heartbeat to a new observation', () => {
    const source = read('ord_boot_extension.js');
    assert(source.includes("const PRIMARY_HELPER_ID = '32172'"));
    assert(source.includes("new Set([PRIMARY_HELPER_ID, '34366'])"));
    assert(source.includes('current.bridgeAt ='));
    assert(!source.includes("Object.assign({}, current, {at:"));
    assert(!source.includes('app.updateSnapshot(Object.assign({}, current'));
    assert(source.includes('await ensureContent(tab)'));
    assert(!source.includes('if (tab) await collect(tab);\n      } finally'));
  });

  console.log(`connector v13 tests: ${passed}/${passed} passed`);
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
