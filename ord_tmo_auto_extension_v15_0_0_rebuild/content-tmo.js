(function () {
  'use strict';

  const previous = window.__ORD_TMO_V13_CONNECTOR;
  let previousAlive = false;
  try {
    previousAlive = !!(previous && previous.alive && previous.alive());
  } catch (_) {}
  if (previousAlive) {
    try { previous.publish(true, 'reinjected'); } catch (_) {}
    return;
  }

  const VERSION = '17.9.0';
  const PARSER = 'ord-tmo-parser-v13-adapter';
  const SESSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const HELPER_ADAPTERS = Object.freeze({
    '32172': Object.freeze({
      id: 'tmo-32172-main',
      label: 'TMO 32172 주 도우미',
      priority: 0,
      expectedUnitRange: [300, 380],
      knownFingerprints: []
    }),
    '34366': Object.freeze({
      id: 'tmo-34366-compat',
      label: 'TMO 34366 호환 도우미',
      priority: 1,
      expectedUnitRange: [300, 380],
      knownFingerprints: ['16e572cb']
    })
  });

  const SPECIAL_ROWS = [
    {id: 'unit_1746119237460_7641', name: '풀이감 : 102(신/악몽)', groupName: '흔함', re: /^풀이감\s*:\s*102\s*\(신\s*\/\s*악몽\)$/},
    {id: 'RANDOM', name: '풀방깍 : 신(201) / 악몽(211)', groupName: '흔함', re: /^풀방깍\s*:\s*신\s*\(201\)\s*\/\s*악몽\s*\(211\)$/},
    {id: '810e', name: '위습', groupName: '흔함', re: /^(?:선택\s*)?위(?:습|스프)$/},
    {id: 'unit_1767884840242_5227', name: '랜덤유닛', groupName: '기타', re: /^랜덤유닛$/},
    {id: 'unit_1767884871133_6843', name: '토큰', groupName: '기타', re: /^토큰$/},
    {id: 'unit_1767884889420_456', name: '좀비', groupName: '기타', re: /^좀비$/},
    {id: 'unit_1767884906256_4990', name: '레일리(히든)', groupName: '기타', re: /^레일리\s*\(?히든\)?$/},
    {id: 'unit_1767884925665_1037', name: '해적선', groupName: '기타', re: /^해적선$/},
    {id: 'unit_1767884940750_9880', name: '초월쿠마', groupName: '기타', re: /^초월\s*쿠마$|^초월쿠마$/},
    {id: 'unit_1767884970331_9084', name: '고대의 배', groupName: '기타', re: /^고대의\s*배$/},
    {id: 'unit_1779016778159_2512', name: '그린블러드', groupName: '기타', re: /^그린\s*블러드$|^그린블러드$/},
    {id: 'unit_1767884989406_3833', name: '미니 스트로맨🚁', groupName: '기타', re: /^미니\s*스트로맨/},
    {id: 'unit_1767885034730_2200', name: '미니 라분', groupName: '기타', re: /^미니\s*라분/},
    {id: 'unit_1761061085749_3333', name: '메구민 (전퍼스킬)', groupName: '랜덤유닛', re: /^메구민\s*\(전퍼스킬\)$/},
    {id: 'unit_1761061102389_3', name: '센토 이스즈 (바제스)', groupName: '랜덤유닛', re: /^센토\s*이스즈\s*\(바제스\)$/},
    {id: 'unit_1761061295036_310', name: '옌', groupName: '랜덤유닛', re: /^옌$/},
    {id: 'unit_1761061550524_6203', name: '카미조 토우마(단일스턴/코비용기의외침)', groupName: '랜덤유닛', re: /^카미조\s*토우마\s*\(단일스턴\s*\/\s*코비용기의외침\)$/},
    {id: 'unit_1767884457709_1523', name: '모건 (탐색)', groupName: '특수함', re: /^모건.*탐색/},
    {id: 'unit_1767884591387_9300', name: '아이스버그 (배2개제작)', groupName: '특수함', re: /^아이스버그.*배\s*2개\s*제작/},
    {id: 'unit_1767884614234_8036', name: '오타마 (희귀함이하구매)', groupName: '특수함', re: /^오타마.*희귀함\s*이하\s*구매/}
  ];
  const SPECIAL_ROW_IDS = new Set(SPECIAL_ROWS.map(row => row.id));

  const ABILITY_LABELS = [
    '이동속도 감소', '발동이동속도 감소', '단일이동속도 감소', '스턴', '방어력 감소', '발동방어력 감소',
    '단일방어력 감소', '중첩방어력 감소', '보스 잡기', '보스잡기', '광폭화', '단일', '끝딜', '범위 끝딜', '마법 방어력 감소',
    '마법 대미지 증가', '단일마법 대미지 증가', '모든피해증가', '모든대미지증가', '폭발형 대미지 증폭', '아머브레이크', '보조딜',
    '방어력 무시 대미지', '범위 전체 체력 퍼센트 대미지', '범위 현재 체력 퍼센트 대미지', '범위 잃은 체력 퍼센트 대미지',
    '공격력 증가', '발동공격력 증가', '공격속도 증가', '마나 재생', '체력 재생', '바제스', '공중이동', '순간이동', '유닛삭제'
  ];
  const ALIASES = {
    '보스잡기': '보스 잡기', '모든대미지증가': '모든피해증가', '이동 속도 감소': '이동속도 감소',
    '발동 이동속도 감소': '발동이동속도 감소', '발동 이속도 감소': '발동이동속도 감소', '단일 이동속도 감소': '단일이동속도 감소',
    '단일이속도 감소': '단일이동속도 감소', '방어력감소': '방어력 감소', '발동방어력감소': '발동방어력 감소',
    '마법방어력 감소': '마법 방어력 감소', '마법데미지 증가': '마법 대미지 증가', '폭발형 데미지 증폭': '폭발형 대미지 증폭', '범위끝딜': '범위 끝딜'
  };

  function canonical(value) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return ALIASES[normalized] || normalized;
  }

  const LABEL_SET = new Set(ABILITY_LABELS.map(canonical));
  // Keep the fallback below ten seconds, but make it a cheap DOM probe.  The
  // old connector rebuilt and serialized all 300+ unit rows every four
  // seconds even when the hand had not changed, which was visible as a small
  // hitch while Warcraft was running on the same machine.
  const POLL_INTERVAL_MS = 2000;
  const HEARTBEAT_INTERVAL_MS = 7000;
  const FULL_AUDIT_INTERVAL_MS = 30000;
  // Ceiling on how long continuous page churn may block both the mutation
  // debounce and the 400ms stability confirm.  Past this window the freshest
  // scan ships as 'unstable-forced' — see publish()/schedule().
  const UNSTABLE_FORCE_MS = 4000;
  let disposed = false;
  let lastHash = '';
  let pendingHash = '';
  let dataSeq = 0;
  let lastDataChangedAt = 0;
  let lastPublishedAt = 0;
  let timer = null;
  let confirmTimer = null;
  let intervalId = null;
  let observer = null;
  let lastSnapshot = null;
  let probeBindings = [];
  let lastProbeHash = '';
  let dirty = true;
  let dirtySince = 0;
  let pendingSnapshot = null;
  let pendingProbeHash = '';
  let lastFullScanAt = 0;
  const persistentRowScopeCache = new WeakMap();

  function adapterFor(id) { return HELPER_ADAPTERS[String(id || '')] || null; }
  function helperId() {
    const match = location.pathname.match(/\/build-helper\/(\d+)/);
    return match ? match[1] : '';
  }
  function num(value) {
    const parsed = parseNumber(value);
    return parsed.found ? parsed.value : 0;
  }
  function parseNumber(value) {
    if (value === null || value === undefined) return {found: false, value: null};
    const normalized = String(value).replace(/,/g, '').trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return {found: false, value: null};
    const number = Number(normalized);
    return Number.isFinite(number) ? {found: true, value: number} : {found: false, value: null};
  }
  function text(element) { return String(element && element.textContent || '').replace(/\s+/g, ' ').trim(); }
  function decode(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value || '');
    return textarea.value;
  }
  function safeJson(raw) {
    if (!raw) return null;
    let value = String(raw).trim();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try { return JSON.parse(value); } catch (_) { value = decode(value); }
    }
    return null;
  }
  function numericInput(element) {
    if (!element || element.tagName !== 'INPUT') return false;
    const type = String(element.type || 'text').toLowerCase();
    if (!['text', 'number', ''].includes(type)) return false;
    return parseNumber(element.value !== undefined ? element.value : element.getAttribute('value')).found;
  }
  function countInput(element) {
    if (!numericInput(element)) return false;
    if (/^ability-|exclude-/i.test(element.id || '')) return false;
    return !element.closest('#ord-tmo-sync-badge');
  }
  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : {width: 0, height: 0};
    return element.offsetParent !== null || rect.width > 0 || rect.height > 0;
  }

  function exactLabelNodes(root, labelSet) {
    return Array.from((root || document).querySelectorAll('div,span,label,b,strong,p'))
      .filter(element => labelSet.has(canonical(text(element))));
  }
  function findAbilityHeading() {
    return Array.from(document.querySelectorAll('div,span,h1,h2,h3,h4,b,strong'))
      .find(element => text(element) === '현재 능력치' && !element.closest('#ord-tmo-sync-badge')) || null;
  }
  function abilityRegion() {
    const heading = findAbilityHeading();
    if (!heading) return null;
    let best = null;
    for (let element = heading.parentElement, depth = 0; element && depth < 10; element = element.parentElement, depth += 1) {
      const labels = exactLabelNodes(element, LABEL_SET).length;
      const inputs = Array.from(element.querySelectorAll('input')).filter(numericInput).length;
      const cards = element.querySelectorAll('[data-tooltip-content]').length;
      const headings = Array.from(element.querySelectorAll('div,span,h1,h2,h3,h4,b,strong'))
        .filter(candidate => text(candidate) === '현재 능력치').length;
      if (headings !== 1 || labels < 1 || inputs < 1) continue;
      const score = labels * 40 + inputs * 10 - cards * 25 - depth * 2;
      if (!best || score > best.score) best = {element, score};
      if (labels >= 3 && inputs >= 3 && cards === 0) break;
    }
    if (best) return best.element;
    return null;
  }
  function rowForAbilityLabel(labelElement, region) {
    let best = null;
    for (let element = labelElement.parentElement, depth = 0; element && region.contains(element) && depth < 7; element = element.parentElement, depth += 1) {
      const labels = exactLabelNodes(element, LABEL_SET);
      const inputs = Array.from(element.querySelectorAll('input')).filter(numericInput);
      if (labels.length === 1 && inputs.length === 1) {
        const score = depth * 100 + text(element).length;
        if (!best || score < best.score) best = {input: inputs[0], score};
      }
      if (element === region) break;
    }
    return best;
  }
  // v16: a TMO re-render leaves ability inputs momentarily empty, so a single
  // scan can silently drop a key that was observed one second earlier.  In the
  // 2026-07-20 log this turned a live 이감 40 into 0 for whole rounds.  Keep the
  // last successful reading per key and only accept a disappearance after two
  // consecutive confirmed misses.
  const abilityMemory = Object.create(null);
  const ABILITY_MISS_LIMIT = 2;
  function collectDomAbilities() {
    const region = abilityRegion();
    if (!region) return {values: {}, rows: [], bindings: [], found: false, confidence: 0, source: 'not-found', errors: ['ability-region-not-found']};
    const values = {};
    const debug = [];
    const bindings = [];
    for (const labelElement of exactLabelNodes(region, LABEL_SET)) {
      const label = canonical(text(labelElement));
      const match = rowForAbilityLabel(labelElement, region);
      if (!match) continue;
      const value = num(match.input.value);
      if (values[label] === undefined || Math.abs(value) > Math.abs(values[label])) values[label] = value;
      debug.push({label, value});
      bindings.push({kind: 'ability', id: label, node: match.input, read: 'value'});
    }
    const carriedKeys = [];
    if (Object.keys(values).length) {
      for (const key of Object.keys(values)) abilityMemory[key] = {value: values[key], misses: 0};
      for (const key of Object.keys(abilityMemory)) {
        if (values[key] !== undefined) continue;
        const memory = abilityMemory[key];
        memory.misses += 1;
        if (memory.misses <= ABILITY_MISS_LIMIT) {
          values[key] = memory.value;
          carriedKeys.push(key);
        } else {
          delete abilityMemory[key];
        }
      }
    }
    const rows = Object.entries(values).map(([name, value]) => ({name, value}));
    return {
      values,
      rows,
      found: rows.length > 0,
      confidence: Math.min(1, rows.length / 3),
      source: rows.length ? 'tmo-current-ability-input-values-v13' : 'not-found',
      errors: rows.length ? [] : ['ability-values-not-found'],
      carriedKeys,
      debug,
      bindings
    };
  }

  function cleanText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('input,button,svg,style,script,ins,iframe').forEach(node => node.remove());
    return text(clone);
  }
  function rowScope(card, cache) {
    if (cache && cache.has(card)) {
      const cached = cache.get(card);
      if (cached && cached.isConnected !== false && cached.contains(card)) return cached;
      cache.delete(card);
    }
    let best = null;
    for (let element = card, depth = 0; element && depth < 9; element = element.parentElement, depth += 1) {
      if (!element.querySelector) continue;
      const cards = element.matches('[data-tooltip-content]') ? 1 : element.querySelectorAll('[data-tooltip-content]').length;
      const inputs = Array.from(element.querySelectorAll('input')).filter(countInput);
      if (!inputs.length || !element.querySelector('img')) continue;
      const score = (cards === 1 ? 0 : cards * 1000) + inputs.length * 100 + depth * 10 + Math.min(500, text(element).length);
      if (!best || score < best.score) best = {element, score};
      if (cards === 1 && inputs.length === 1) break;
    }
    const scope = best ? best.element : card;
    if (cache) cache.set(card, scope);
    return scope;
  }
  function countFromCard(card, scope) {
    const inputs = Array.from(scope.querySelectorAll('input')).filter(countInput);
    if (inputs.length === 1) {
      return {value: num(inputs[0].value), found: true, confidence: isVisible(inputs[0]) ? 1 : 0.86, source: 'single-row-input', errors: [], binding: {node: inputs[0], read: 'value'}};
    }
    if (inputs.length > 1) {
      const cardRect = card.getBoundingClientRect ? card.getBoundingClientRect() : {top: 0, left: 0};
      let best = null;
      for (const input of inputs) {
        const rect = input.getBoundingClientRect ? input.getBoundingClientRect() : {top: 0, left: 0};
        const distance = Math.abs(rect.top - cardRect.top) + Math.abs(rect.left - cardRect.left) + (isVisible(input) ? 0 : 5000);
        if (!best || distance < best.distance) best = {input, distance};
      }
      return {
        value: num(best.input.value),
        found: true,
        confidence: 0.62,
        source: 'nearest-of-multiple-inputs',
        errors: [`ambiguous-count-inputs:${inputs.length}`],
        binding: {node: best.input, read: 'value'}
      };
    }
    for (const attribute of ['data-owned-count', 'data-count']) {
      const holder = card.closest(`[${attribute}]`) || scope.querySelector(`[${attribute}]`);
      const parsed = holder && parseNumber(holder.getAttribute(attribute));
      if (parsed && parsed.found) {
        return {value: parsed.value, found: true, confidence: 0.8, source: attribute, errors: [], binding: {node: holder, read: 'attribute', attribute}};
      }
    }
    return {value: 0, found: false, confidence: 0, source: 'not-found', errors: ['count-not-found'], binding: null};
  }
  function leadingPercent(value) {
    const match = String(value || '').trim().match(/^(100|[1-9]?\d)\s*%/);
    return match ? Number(match[1]) : null;
  }
  function visiblePercent(card, scope) {
    const aria = scope.querySelector('[aria-valuenow]');
    if (aria) {
      const parsed = parseNumber(aria.getAttribute('aria-valuenow'));
      if (parsed.found && parsed.value >= 0 && parsed.value <= 100) return {value: Math.floor(parsed.value), source: 'aria-valuenow', binding: {node: aria, read: 'attribute', attribute: 'aria-valuenow'}};
    }
    const nodes = Array.from(scope.querySelectorAll('div,span,b,strong')).filter(node => !node.closest('#ord-tmo-sync-badge')).slice(0, 120);
    for (const node of nodes) {
      // textContent is enough for a leading percentage and avoids cloning the
      // complete row (including SVG/buttons) hundreds of times per scan.
      const value = text(node);
      if (value.length > 30) continue;
      const percent = leadingPercent(value);
      if (percent !== null) return {value: percent, source: 'visible-text', binding: {node, read: 'percent-text'}};
    }
    const percent = leadingPercent(cleanText(scope));
    return percent !== null
      ? {value: percent, source: 'visible-row', binding: {node: scope, read: 'percent-text'}}
      : {value: null, source: 'not-found', binding: null};
  }
  function clampPercent(value) { return Math.max(0, Math.min(100, value)); }
  function progressData(data, progress) {
    const raw = parseNumber(data && data.percent);
    const rawValue = raw.found ? clampPercent(raw.value) : null;
    const display = progress.value !== null ? Math.floor(progress.value) : rawValue !== null ? Math.floor(rawValue) : 0;
    return {
      display,
      raw: rawValue,
      source: progress.value !== null ? progress.source : rawValue !== null ? 'tooltip' : 'not-found',
      found: progress.value !== null || rawValue !== null
    };
  }
  function normalizeRowLabel(value) {
    return String(value || '').replace(/^\s*(100|[1-9]?\d)\s*%\s*/, '').replace(/\s+-?\d+(?:\.\d+)?\s*$/, '').replace(/\s+/g, ' ').trim();
  }
  function specialRow(match, labels) {
    let best = null;
    for (const label of labels) {
      for (let element = label, depth = 0; element && depth < 8; element = element.parentElement, depth += 1) {
        if (element.closest('[data-tooltip-content]')) break;
        const inputs = Array.from(element.querySelectorAll ? element.querySelectorAll('input') : []).filter(countInput);
        if (inputs.length !== 1 || !element.querySelector('img')) continue;
        const score = depth * 100 + text(element).length + (isVisible(inputs[0]) ? 0 : 1000);
        if (!best || score < best.score) {
          best = {value: num(inputs[0].value), found: true, confidence: isVisible(inputs[0]) ? 0.95 : 0.8, source: 'special-row-input', errors: [], score, binding: {node: inputs[0], read: 'value'}};
        }
        break;
      }
    }
    return best;
  }

  function collectUnits() {
    const byId = new Map();
    const probeById = new Map();
    let tooltipErrors = 0;
    let tooltipCards = 0;
    let duplicateCards = 0;
    for (const card of document.querySelectorAll('[data-tooltip-content]')) {
      const raw = card.getAttribute('data-tooltip-content');
      const data = safeJson(raw);
      if (!data || !data.id || !data.name) {
        if (raw && /^\s*[{[]/.test(raw)) tooltipErrors += 1;
        continue;
      }
      tooltipCards += 1;
      // count and progress live in the same row.  Resolve that row once per
      // card instead of walking up the DOM twice.
      const scope = rowScope(card, persistentRowScopeCache);
      const count = countFromCard(card, scope);
      const visible = visiblePercent(card, scope);
      const progress = progressData(data, visible);
      const row = {
        id: String(data.id),
        name: data.name,
        groupName: data.groupName || '',
        count: count.found ? count.value : 0,
        countFound: count.found,
        countConfidence: count.confidence,
        countSource: count.source,
        countErrors: count.errors,
        percent: progress.display,
        tmoPercent: progress.display,
        rawPercent: progress.raw,
        progressSource: progress.source,
        hasTmoPercent: progress.found,
        abilities: Object.assign({}, data.abilities || {}),
        visible: isVisible(card)
      };
      const prior = byId.get(row.id);
      if (prior) {
        duplicateCards += 1;
        const priorScore = prior.countConfidence + (prior.visible ? 0.2 : 0);
        const nextScore = row.countConfidence + (row.visible ? 0.2 : 0);
        if (nextScore > priorScore) {
          byId.set(row.id, row);
          probeById.set(row.id, {
            kind: 'unit', id: row.id, card,
            count: count.binding,
            percent: visible.binding
          });
        }
      } else {
        byId.set(row.id, row);
        probeById.set(row.id, {
          kind: 'unit', id: row.id, card,
          count: count.binding,
          percent: visible.binding
        });
      }
    }

    // SPECIAL_ROWS used to perform one whole-document query per special row
    // (currently 20 queries).  Build the label candidate list once.
    const specialLabelCandidates = Array.from(document.querySelectorAll('div,span,label,b,strong'))
      .map(element => ({element, label: normalizeRowLabel(text(element))}));
    for (const special of SPECIAL_ROWS) {
      const labels = specialLabelCandidates.filter(candidate => special.re.test(candidate.label)).map(candidate => candidate.element);
      const found = specialRow(special, labels);
      if (!found) continue;
      const existing = byId.get(special.id);
      if (existing) {
        if (!existing.countFound || found.confidence > existing.countConfidence) {
          existing.count = found.value;
          existing.countFound = true;
          existing.countConfidence = found.confidence;
          existing.countSource = found.source;
          existing.countErrors = [];
          const priorProbe = probeById.get(special.id) || {kind: 'unit', id: special.id, card: null, percent: null};
          priorProbe.count = found.binding;
          probeById.set(special.id, priorProbe);
        }
        continue;
      }
      byId.set(special.id, {
        id: special.id,
        name: special.name,
        groupName: special.groupName || '특수재료',
        count: found.value,
        countFound: true,
        countConfidence: found.confidence,
        countSource: found.source,
        countErrors: [],
        percent: 0,
        tmoPercent: 0,
        rawPercent: null,
        progressSource: 'synthetic',
        hasTmoPercent: false,
        abilities: {},
        visible: true
      });
      probeById.set(special.id, {kind: 'special', id: special.id, card: null, count: found.binding, percent: null});
    }

    const rows = Array.from(byId.values());
    const parsedCounts = rows.filter(row => row.countFound);
    const ambiguousCounts = rows.filter(row => row.countErrors && row.countErrors.length);
    const missingCounts = rows.filter(row => !row.countFound);
    const progressRows = rows.filter(row => row.hasTmoPercent);
    const averageConfidence = parsedCounts.length ? parsedCounts.reduce((sum, row) => sum + row.countConfidence, 0) / parsedCounts.length : 0;
    const countCoverage = rows.length ? parsedCounts.length / rows.length : 0;
    const countConfidence = countCoverage * averageConfidence;
    const errors = [];
    if (!rows.length) errors.push('no-unit-rows');
    if (tooltipErrors) errors.push(`tooltip-json-errors:${tooltipErrors}`);
    if (missingCounts.length) errors.push(`missing-counts:${missingCounts.length}`);
    if (ambiguousCounts.length) errors.push(`ambiguous-counts:${ambiguousCounts.length}`);
    if (duplicateCards) errors.push(`duplicate-cards:${duplicateCards}`);
    errors.push(...missingCounts.slice(0, 12).map(row => `count-not-found:${row.id}:${row.name}`));
    return {
      rows,
      probeBindings: Array.from(probeById.values()),
      tooltipCards,
      tooltipErrors,
      duplicateCards,
      progressRows,
      countDiscovery: {
        found: rows.length > 0 && missingCounts.length === 0 && ambiguousCounts.length === 0,
        parsed: parsedCounts.length,
        missing: missingCounts.length,
        ambiguous: ambiguousCounts.length,
        coverage: countCoverage,
        confidence: countConfidence,
        errors: errors.filter(error => /count|ambiguous/.test(error)).slice(0, 30)
      },
      errors: errors.slice(0, 30)
    };
  }

  function deriveAbilities(rows) {
    const values = {};
    for (const row of rows) {
      if (!row.countFound || num(row.count) <= 0) continue;
      const owned = num(row.count);
      for (const [rawKey, value] of Object.entries(row.abilities || {})) {
        const key = canonical(rawKey);
        const parsed = parseNumber(value);
        if (typeof value === 'number' || parsed.found) values[key] = (values[key] || 0) + num(value) * owned;
        else if (value !== false && String(value).toLowerCase() !== 'false' && value !== '') values[key] = (values[key] || 0) + owned;
      }
    }
    return values;
  }
  function connected() {
    if (document.querySelector('[data-tooltip-content*="프로그램이 정상적으로 연동"]')) return true;
    return !!Array.from(document.querySelectorAll('button,div,span')).find(element => /프로그램\s*연동됨/.test(text(element)));
  }
  function fnv1a(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  function idSetHash(rows) { return fnv1a(rows.map(row => String(row.id)).sort().join('|')); }
  function hashSnapshot(snapshot) {
    const units = snapshot.units.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(row => `${row.id}:${row.countFound ? row.count : '?'}:${row.tmoPercent}`).join('|');
    const abilities = Object.entries(snapshot.currentAbilities || {}).sort().map(entry => entry.join(':')).join('|');
    return fnv1a(`${units}|${abilities}|${snapshot.helperId}|${snapshot.adapterId}`);
  }

  function bindingValue(binding) {
    if (!binding || !binding.node || binding.node.isConnected === false) return null;
    if (binding.read === 'value') return String(binding.node.value === undefined ? '' : binding.node.value);
    if (binding.read === 'attribute') return String(binding.node.getAttribute(binding.attribute) || '');
    if (binding.read === 'percent-text') {
      const percent = leadingPercent(text(binding.node));
      return percent === null ? '?' : String(percent);
    }
    return null;
  }

  function probeFingerprint() {
    if (!lastSnapshot || !probeBindings.length) return null;
    const values = [];
    for (const binding of probeBindings) {
      if (binding.card && binding.card.isConnected === false) return null;
      const count = bindingValue(binding.count);
      const percent = binding.percent ? bindingValue(binding.percent) : '';
      if (binding.count && count === null) return null;
      if (binding.percent && percent === null) return null;
      values.push(`${binding.kind}:${binding.id}:${count === null ? '' : count}:${percent === null ? '' : percent}`);
    }
    return fnv1a(values.join('|'));
  }

  function installProbeBindings(snapshot, units, domAbilities) {
    lastSnapshot = snapshot;
    probeBindings = units.probeBindings.concat(domAbilities.bindings || []);
    lastProbeHash = probeFingerprint() || '';
  }

  function collect() {
    const id = helperId();
    const adapter = adapterFor(id);
    const units = collectUnits();
    const domAbilities = collectDomAbilities();
    const derivedAbilities = deriveAbilities(units.rows);
    const currentAbilities = Object.keys(domAbilities.values).length ? Object.assign({}, domAbilities.values) : derivedAbilities;
    const scanAt = Date.now();
    const unitCount = units.rows.length;
    const unitConfidence = adapter && unitCount >= adapter.expectedUnitRange[0] && unitCount <= adapter.expectedUnitRange[1] ? 1 : 0;
    const progressConfidence = unitCount ? Math.min(1, units.progressRows.length / Math.max(1, unitCount * 0.75)) : 0;
    const overallConfidence = adapter
      ? Math.max(0, Math.min(1, unitConfidence * 0.25 + units.countDiscovery.confidence * 0.65 + progressConfidence * 0.1))
      : 0;
    const errors = units.errors.slice();
    if (!adapter) errors.unshift(`unsupported-helper:${id || 'missing'}`);
    if (adapter && unitCount < adapter.expectedUnitRange[0]) errors.unshift(`too-few-unit-rows:${unitCount}`);
    if (adapter && unitCount > adapter.expectedUnitRange[1]) errors.unshift(`too-many-unit-rows:${unitCount}`);
    const snapshot = {
      source: 'tmo',
      parser: PARSER,
      adapterId: adapter && adapter.id || 'unsupported',
      adapterLabel: adapter && adapter.label || '지원하지 않는 도우미',
      adapterPriority: adapter && adapter.priority,
      sessionId: SESSION,
      seq: dataSeq,
      scanAt,
      dataChangedAt: lastDataChangedAt || scanAt,
      bridgeAt: 0,
      at: scanAt,
      collectedAt: scanAt,
      url: location.href,
      title: document.title,
      helperId: id,
      connected: connected(),
      collection: {
        found: !!(adapter && unitConfidence === 1 && units.countDiscovery.found),
        confidence: overallConfidence,
        errors: errors.slice(0, 30)
      },
      countDiscovery: units.countDiscovery,
      unitDiscovery: {
        found: unitCount > 0,
        count: unitCount,
        tooltipCards: units.tooltipCards,
        duplicateCards: units.duplicateCards,
        confidence: unitConfidence,
        errors: units.tooltipErrors ? [`tooltip-json-errors:${units.tooltipErrors}`] : []
      },
      progressDiscovery: {
        found: units.progressRows.length > 0,
        parsed: units.progressRows.length,
        confidence: progressConfidence,
        errors: units.progressRows.length ? [] : ['progress-not-found']
      },
      abilityDiscovery: {
        found: domAbilities.found,
        parsed: domAbilities.rows.length,
        confidence: domAbilities.confidence,
        source: domAbilities.source,
        errors: domAbilities.errors
      },
      unitCount,
      idSetHash: idSetHash(units.rows),
      nonzero: units.rows.filter(row => row.countFound && row.count > 0).length,
      playableNonzero: units.rows.filter(row => row.countFound && row.count > 0 && !SPECIAL_ROW_IDS.has(row.id)).length,
      playableUnitCount: units.rows.filter(row => row.countFound && !SPECIAL_ROW_IDS.has(row.id)).reduce((total, row) => total + Math.max(0, Number(row.count) || 0), 0),
      percentCount: units.progressRows.length,
      visiblePercentCount: units.progressRows.filter(row => row.progressSource !== 'tooltip').length,
      tooltipPercentCount: units.progressRows.filter(row => row.rawPercent !== null).length,
      progressFound: units.progressRows.length,
      wispCount: (units.rows.find(row => row.id === '810e' && row.countFound) || {}).count || 0,
      wispCountFound: !!units.rows.find(row => row.id === '810e' && row.countFound),
      parseErrors: units.tooltipErrors,
      currentAbilities,
      currentAbilityRows: domAbilities.rows,
      currentAbilitiesFound: Object.keys(currentAbilities).length > 0,
      currentAbilitySource: domAbilities.found ? domAbilities.source : 'owned-unit-role-fallback',
      abilityCount: Object.keys(currentAbilities).length,
      domAbilityCount: domAbilities.rows.length,
      derivedAbilityCount: Object.keys(derivedAbilities).length,
      progressSample: units.progressRows.slice().sort((a, b) => b.tmoPercent - a.tmoPercent).slice(0, 12)
        .map(row => ({id: row.id, name: row.name, percent: row.tmoPercent, rawPercent: row.rawPercent, source: row.progressSource})),
      units: units.rows,
      counts: Object.fromEntries(units.rows.filter(row => row.countFound).map(row => [row.id, row.count])),
      countStatus: Object.fromEntries(units.rows.map(row => [row.id, {
        found: row.countFound,
        confidence: row.countConfidence,
        source: row.countSource,
        errors: row.countErrors
      }])),
      missingSpecialIds: SPECIAL_ROWS.filter(row => !units.rows.some(unit => unit.id === row.id && unit.countFound)).map(row => row.id)
    };
    snapshot.dataHash = hashSnapshot(snapshot);
    snapshot.observationKey = `${SESSION}:${snapshot.seq}:${snapshot.dataHash}`;
    installProbeBindings(snapshot, units, domAbilities);
    lastFullScanAt = Date.now();
    return snapshot;
  }

  function contextError(error) { return /Extension context invalidated|context invalidated/i.test(String(error && error.message || error || '')); }
  function cleanup(error) {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    clearTimeout(confirmTimer);
    if (intervalId) clearInterval(intervalId);
    if (observer) observer.disconnect();
    try {
      const shadow = document.getElementById('ord-tmo-sync-badge')?.shadowRoot;
      if (shadow) {
        shadow.querySelector('.title').textContent = 'ORD 코치 업데이트 적용 대기';
        shadow.querySelector('.meta').textContent = '확장 프로그램을 다시 불러왔습니다. TMO 페이지를 한 번 새로고침하세요.';
        shadow.querySelector('.dot').classList.remove('ok');
      }
    } catch (_) {}
    console.debug('[ORD]', error);
  }
  function canChrome() {
    try { return !disposed && chrome && chrome.runtime; } catch (error) { cleanup(error); return false; }
  }
  function send(message, callback) {
    if (!canChrome()) return;
    try {
      chrome.runtime.sendMessage(message, response => {
        const error = chrome.runtime.lastError;
        if (error && contextError(error)) cleanup(error);
        if (callback) callback(response);
      });
    } catch (error) {
      if (contextError(error)) cleanup(error);
    }
  }
  function stampForPublish(snapshot, changed) {
    if (changed) {
      dataSeq += 1;
      lastDataChangedAt = snapshot.scanAt;
      lastHash = snapshot.dataHash;
    } else if (!dataSeq) {
      dataSeq = 1;
      lastDataChangedAt = snapshot.scanAt;
      lastHash = snapshot.dataHash;
    }
    snapshot.seq = dataSeq;
    snapshot.dataChangedAt = lastDataChangedAt;
    snapshot.observationKey = `${SESSION}:${dataSeq}:${snapshot.dataHash}`;
    return snapshot;
  }
  function dispatch(snapshot, reason, callback) {
    const changed = snapshot.dataHash !== lastHash;
    stampForPublish(snapshot, changed);
    lastPublishedAt = Date.now();
    snapshot.reason = reason || (changed ? 'data-change' : 'heartbeat');
    send({type: 'ORD_SNAPSHOT', snapshot}, callback);
    updateBadge(snapshot);
  }
  function dispatchHeartbeat(reason) {
    if (!lastSnapshot || !dataSeq || !lastHash) return false;
    const scanAt = Date.now();
    lastPublishedAt = scanAt;
    // Heartbeats carry identity/timestamps only.  Sending the former complete
    // 300+ row snapshot here forced structured-clone work in both processes
    // and a large storage comparison although no game data had changed.
    send({
      type: 'ORD_HEARTBEAT',
      heartbeat: {
        parser: PARSER,
        helperId: lastSnapshot.helperId,
        adapterId: lastSnapshot.adapterId,
        sessionId: SESSION,
        seq: dataSeq,
        dataHash: lastHash,
        scanAt,
        dataChangedAt: lastDataChangedAt,
        url: location.href,
        reason: reason || 'heartbeat'
      }
    });
    updateBadge(Object.assign({}, lastSnapshot, {scanAt}));
    return true;
  }
  function confirmPending() {
    confirmTimer = null;
    if (!pendingSnapshot) return;
    const currentProbe = probeFingerprint();
    if (dirty || !currentProbe || currentProbe !== pendingProbeHash) {
      pendingHash = '';
      pendingSnapshot = null;
      pendingProbeHash = '';
      schedule(false, 'stable-recheck');
      return;
    }
    const snapshot = pendingSnapshot;
    pendingHash = '';
    pendingSnapshot = null;
    pendingProbeHash = '';
    dispatch(snapshot, 'stable-confirm');
  }
  function publish(force, reason) {
    if (disposed || !adapterFor(helperId())) return;
    let snapshot;
    try { snapshot = collect(); } catch (error) { console.warn('[ORD] collect failed', error); return; }
    dirty = false;
    dirtySince = 0;
    const changed = snapshot.dataHash !== lastHash;
    // v16.6: the 400ms stability confirm has no exit under continuous DOM
    // churn — every rescan produced a fresh hash, the pending snapshot was
    // discarded each time, and a recorded game got zero snapshots (and zero
    // heartbeats, because those need an unchanged hash) from the transcend
    // craft through the round-60 boss fight.  When changed data has been
    // blocked past this window, ship the freshest scan even if the page is
    // still moving: a possibly-torn snapshot self-corrects on the next
    // stable pass, a frozen coach does not.
    const starved = changed && lastPublishedAt > 0 && Date.now() - lastPublishedAt >= UNSTABLE_FORCE_MS;
    if (changed && !starved && pendingHash !== snapshot.dataHash) {
      pendingHash = snapshot.dataHash;
      pendingSnapshot = snapshot;
      pendingProbeHash = lastProbeHash;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(confirmPending, 400);
      updateBadge(snapshot);
      return;
    }
    pendingHash = '';
    pendingSnapshot = null;
    pendingProbeHash = '';
    const heartbeatDue = Date.now() - lastPublishedAt >= HEARTBEAT_INTERVAL_MS;
    if (!force && !changed && !heartbeatDue) {
      updateBadge(snapshot);
      return;
    }
    if (changed) dispatch(snapshot, starved ? 'unstable-forced' : reason || 'data-change');
    else dispatchHeartbeat(reason || 'heartbeat');
  }
  function schedule(force, reason) {
    dirty = true;
    const now = Date.now();
    if (!dirtySince) dirtySince = now;
    clearTimeout(timer);
    // v16.1: combat waves mutate the TMO DOM continuously; a 420ms debounce
    // meant a full 300-card scan roughly twice a second on the game machine.
    // v16.6: but a pure trailing debounce never fires while mutations keep
    // arriving faster than the delay — the scan itself starves (a recorded
    // game got zero scans from the transcend craft through the round-60
    // boss).  The deadline may therefore trail mutations only up to an
    // absolute cap: once now+700ms would pass dirtySince+UNSTABLE_FORCE_MS,
    // every reset re-arms toward that same fixed due time, so the scan fires
    // no matter how fast the page keeps changing.
    const dueAt = force ? now + 90 : Math.min(now + 700, Math.max(now, dirtySince + UNSTABLE_FORCE_MS));
    const overdue = !force && dueAt - now < 700;
    timer = setTimeout(() => {
      timer = null;
      publish(!!force, reason || (force ? 'forced' : overdue ? 'overdue-mutation' : 'mutation'));
    }, Math.max(0, dueAt - now));
  }

  function poll() {
    if (disposed || !adapterFor(helperId())) return;
    if (dirty || !lastSnapshot) {
      schedule(false, 'fallback-dirty');
      return;
    }
    const currentProbe = probeFingerprint();
    if (!currentProbe || currentProbe !== lastProbeHash) {
      schedule(false, 'fallback-change');
      return;
    }
    if (Date.now() - lastFullScanAt >= FULL_AUDIT_INTERVAL_MS) {
      schedule(false, 'periodic-full-audit');
      return;
    }
    if (Date.now() - lastPublishedAt >= HEARTBEAT_INTERVAL_MS) dispatchHeartbeat('fallback-heartbeat');
  }

  function ensureBadge() {
    let host = document.getElementById('ord-tmo-sync-badge');
    if (host && host.dataset.version !== VERSION) {
      host.remove();
      host = null;
    }
    if (host) return host;
    host = document.createElement('div');
    host.id = 'ord-tmo-sync-badge';
    host.dataset.version = VERSION;
    const shadow = host.attachShadow({mode: 'open'});
    const style = document.createElement('style');
    style.textContent = ':host{all:initial;position:fixed;right:14px;bottom:14px;z-index:2147483647;font-family:system-ui,sans-serif}.card{width:310px;padding:11px;border:1px solid #33476a;border-radius:15px;background:rgba(5,10,23,.94);color:#eaf3ff;box-shadow:0 18px 55px rgba(0,0,0,.45)}.top{display:flex;justify-content:space-between;align-items:center}.title{font-size:13px;font-weight:900}.dot{width:9px;height:9px;border-radius:50%;background:#f3b84b}.dot.ok{background:#27d17f;box-shadow:0 0 12px #27d17f}.meta{margin-top:5px;color:#8fa2bd;font-size:10px;line-height:1.45}.btn{margin-top:8px;width:100%;border:0;border-radius:10px;padding:8px;background:linear-gradient(135deg,#7b5fff,#25bfe6);color:white;font-weight:900;cursor:pointer}';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="top"><span class="title">ORD 실전 판단 코치 v17.9.0</span><span class="dot"></span></div><div class="meta">수집 대기 중 · TMO.GG 데스크톱 프로그램을 먼저 실행하세요</div><button class="btn">실전 코치 열기</button>';
    card.querySelector('.btn').onclick = () => send({type: 'ORD_OPEN_DASHBOARD'});
    shadow.append(style, card);
    document.documentElement.appendChild(host);
    return host;
  }
  function updateBadge(snapshot) {
    const shadow = ensureBadge().shadowRoot;
    const adapter = adapterFor(snapshot.helperId);
    const complete = !!(adapter && snapshot.collection && snapshot.collection.found && snapshot.collection.confidence >= 0.72);
    const good = complete && snapshot.connected;
    shadow.querySelector('.dot').classList.toggle('ok', good);
    const countInfo = snapshot.countDiscovery || {};
    const label = !adapter ? '지원하지 않는 도우미' : !complete ? '부분 수집 — 0으로 임의 처리하지 않음' : good ? '실시간 수집 정상' : '패 수집 정상 · 데스크톱 미연동';
    shadow.querySelector('.meta').textContent = `${label} · ${snapshot.helperId || '?'} · 유닛 ${snapshot.unitCount} · 수량 ${countInfo.parsed || 0}/${snapshot.unitCount} · 신뢰 ${(Number(snapshot.collection && snapshot.collection.confidence || 0) * 100).toFixed(0)}% · 선위 ${snapshot.wispCountFound ? snapshot.wispCount : '?'} · ${new Date(snapshot.scanAt).toLocaleTimeString()}`;
  }

  window.__ORD_TMO_V13_CONNECTOR = {
    collect,
    collectCurrentAbilities: collectDomAbilities,
    publish,
    sessionId: SESSION,
    adapters: HELPER_ADAPTERS,
    alive: () => !disposed
  };

  try {
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (message && message.type === 'ORD_PING') {
        reply({ok: true, parser: PARSER, sessionId: SESSION, helperId: helperId(), adapterId: adapterFor(helperId())?.id || ''});
        return true;
      }
      if (message && message.type === 'ORD_COLLECT_NOW') {
        if (!adapterFor(helperId())) {
          reply({ok: false, error: 'unsupported-helper'});
          return true;
        }
        const first = collect();
        setTimeout(() => {
          const snapshot = collect();
          if (first.dataHash !== snapshot.dataHash) {
            schedule(true, 'manual-unstable');
            reply({ok: false, error: 'unstable-snapshot'});
            return;
          }
          pendingHash = '';
          dispatch(snapshot, 'manual-confirmed', accepted => reply({
            ok: !!(accepted && accepted.accepted),
            snapshot: accepted && accepted.accepted ? snapshot : null,
            accepted: accepted || null,
            error: accepted && accepted.ignored || ''
          }));
        }, 220);
        return true;
      }
      return false;
    });
  } catch (error) {
    if (contextError(error)) cleanup(error);
  }

  if (adapterFor(helperId())) ensureBadge();
  schedule(true, 'startup');
  document.addEventListener('input', event => {
    if (event.target && event.target.closest && !event.target.closest('#ord-tmo-sync-badge') && numericInput(event.target)) schedule(false, 'input');
  }, true);
  document.addEventListener('change', event => {
    if (event.target && event.target.closest && !event.target.closest('#ord-tmo-sync-badge') && numericInput(event.target)) schedule(false, 'change');
  }, true);
  const root = document.querySelector('.data-nosnippet,[data-nosnippet]') || document.body;
  function mutationNodeRelevant(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.closest && node.closest('#ord-tmo-sync-badge')) return false;
    if (node.matches && node.matches('input,[data-tooltip-content],[aria-valuenow]')) return true;
    return !!(node.querySelector && node.querySelector('input,[data-tooltip-content],[aria-valuenow]'));
  }
  observer = new MutationObserver(records => {
    // Ignore unrelated text/animation churn. Counts changed through DOM
    // properties are caught by the cached two-second probe below.
    const relevant = records.some(record => {
      const target = record.target && record.target.nodeType === 1 ? record.target : record.target && record.target.parentElement;
      if (!target || (target.closest && target.closest('#ord-tmo-sync-badge'))) return false;
      if (record.type === 'attributes') return ['data-tooltip-content', 'value', 'aria-valuenow'].includes(record.attributeName);
      if (target.closest && target.closest('[data-tooltip-content]')) return true;
      return Array.from(record.addedNodes || []).some(mutationNodeRelevant) || Array.from(record.removedNodes || []).some(mutationNodeRelevant);
    });
    if (relevant) schedule(false, 'dom');
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-tooltip-content', 'value', 'aria-valuenow']
  });
  intervalId = setInterval(poll, POLL_INTERVAL_MS);
})();
