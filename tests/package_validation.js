'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const requested=process.argv[2];
const ext=path.resolve(requested||path.join(__dirname,'../ord_tmo_auto_extension_v15_0_0_rebuild'));
assert(fs.existsSync(path.join(ext,'manifest.json')),'v15 extension directory not found');

const required=[
  'manifest.json','background.js','content-tmo.js','ord_helper.html','ord_units_data.js',
  'ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_core.js',
  'ord_squad_planner.js','ord_direction_worker.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_run_log_compactor.js','ord_run_log.js','ord_app.js','ord_app.css','ord_cockpit_v15.css','ord_boot_extension.js',
  'popup.html','popup.js','popup.css','README.txt'
];
for(const file of required)assert(fs.existsSync(path.join(ext,file)),`missing ${file}`);
for(const removed of ['ord_ai_advisor.js'])assert(!fs.existsSync(path.join(ext,removed)),`removed OpenAI file remains: ${removed}`);

const read=file=>fs.readFileSync(path.join(ext,file),'utf8');
const manifest=JSON.parse(read('manifest.json'));
assert.strictEqual(manifest.manifest_version,3);
assert.strictEqual(manifest.version,'17.10.0');
assert.deepStrictEqual(manifest.background,{service_worker:'background.js'});
assert.deepStrictEqual(new Set(manifest.permissions),new Set(['storage','tabs','scripting']));
assert(manifest.host_permissions.length>0,'build-helper permissions are missing');
for(const pattern of manifest.host_permissions){
  assert(pattern.includes('/build-helper/'),'host permission is broader than build-helper');
  assert(/build-helper\/(32172|34366)/.test(pattern),`unsupported helper permission: ${pattern}`);
}
assert(!manifest.host_permissions.some(pattern=>/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(pattern)),'local OpenAI bridge permission remains');
for(const pattern of manifest.content_scripts[0].matches){
  assert(pattern.includes('/build-helper/'),'content script match is broader than build-helper');
  assert(/build-helper\/(32172|34366)/.test(pattern),`unsupported content match: ${pattern}`);
}

for(const file of ['background.js','content-tmo.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_core.js','ord_squad_planner.js','ord_direction_worker.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_run_log_compactor.js','ord_run_log.js','ord_app.js','ord_boot_extension.js','popup.js']){
  new vm.Script(read(file),{filename:file});
}
const helper=read('ord_helper.html'),popup=read('popup.html');
assert(!/\son\w+\s*=/.test(helper+popup),'inline event handler violates MV3 CSP');
assert(/<meta name="ord-helper" content="v17\.10\.0-decision-engine">/.test(helper),'v17.10.0 helper marker missing');
assert(helper.indexOf('ord_data_patch.js')<helper.indexOf('ord_story_nonupper_data.js'),'data patch must load before measured story data');
assert(helper.indexOf('ord_story_nonupper_data.js')<helper.indexOf('ord_story_upper_data.js'),'non-upper story data must load before upper story data');
assert(helper.indexOf('ord_story_upper_data.js')<helper.indexOf('ord_core.js'),'measured story data must load before core');
assert(helper.indexOf('ord_core.js')<helper.indexOf('ord_squad_planner.js'),'planner must load after core');
assert(helper.indexOf('ord_squad_planner.js')<helper.indexOf('ord_v15_model.js'),'v15 model must load after legacy knowledge modules');
assert(helper.indexOf('ord_v15_engine.js')<helper.indexOf('ord_run_log_compactor.js'),'run-log compactor must load after v15 engine');
assert(helper.indexOf('ord_run_log_compactor.js')<helper.indexOf('ord_run_log.js'),'run-log storage must load after compactor');
assert(helper.indexOf('ord_run_log.js')<helper.indexOf('ord_app.js'),'run-log modules must load before app');
assert(!/ord_ai_advisor|openai|127\.0\.0\.1:38766/i.test(helper+popup+JSON.stringify(manifest)),'OpenAI UI or bridge surface remains');

const context={console};context.window=context;vm.createContext(context);
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js']){
  vm.runInContext(read(file),context,{filename:file});
}
const units=context.ORD_TMO_UNITS,C=context.ORDCore,planner=context.ORDSquadPlanner;
assert.strictEqual(C.VERSION,'17.10.0');
assert.strictEqual(planner.VERSION,'17.10.0');
assert.strictEqual(typeof planner.planFinalSquad,'function');
assert.strictEqual(context.ORDV15Engine.VERSION,'17.10.0');
assert.strictEqual(typeof C.storyLeagueRows,'function','story league API missing');
assert.strictEqual(context.OrdAiAdvisor,undefined,'OpenAI runtime remains globally exposed');
assert(units.length>=300,'catalog unexpectedly incomplete');
assert.strictEqual(new Set(units.map(unit=>unit.id)).size,units.length,'duplicate unit IDs');
const ids=new Set(units.map(unit=>unit.id));
for(const unit of units)for(const material of unit.stuffs||[])assert(ids.has(material.id)||C.SPECIAL_IDS[material.id],`broken recipe ${unit.id} -> ${material.id}`);
for(const unit of units.filter(C.isUpper))assert.notStrictEqual(context.ORD_SYNERGY_MEMO.byUnitId[unit.id],undefined,`missing upper synergy ${unit.id}`);
const storyLeagueCounts=C.storyLeagueRows(units).reduce((out,row)=>{out[row.league]=(out[row.league]||0)+1;return out;},{});
assert.deepStrictEqual(JSON.parse(JSON.stringify(storyLeagueCounts)),{rare:42,upper:89,legend:81},'story league catalog counts changed');

const content=read('content-tmo.js'),background=read('background.js'),boot=read('ord_boot_extension.js');
assert(content.indexOf("'32172': Object.freeze")<content.indexOf("'34366': Object.freeze"),'32172 is not the primary adapter');
for(const source of [background,content,boot]){
  assert(source.includes("'32172'"),'32172 primary helper missing');
  assert(source.includes("'34366'"),'34366 compatibility helper missing');
}
assert(!/unitCount\s*={2,3}\s*307/.test(background+boot),'connector still hard-codes a 307-row validity gate');
assert(!/idSetHash\s*={2,3}\s*['\"]16e572cb/.test(background+boot),'connector still hard-codes an old fingerprint gate');
for(const key of ['collection.confidence','countDiscovery','scanAt','dataChangedAt','bridgeAt'])assert((background+content+boot).includes(key),`connector contract missing ${key}`);
assert(background.includes('unitCount >= 300')&&background.includes('unitCount <= 380'),'adapter row range guard missing');
assert(background.includes('parsedCoverage === 1')&&background.includes('counts.missing')&&background.includes('counts.ambiguous'),'full-count guard missing');
assert(background.includes('wispCountFound === true'),'selection-wisp guard missing');
assert(content.includes('setInterval(poll, POLL_INTERVAL_MS)')&&content.includes('const POLL_INTERVAL_MS = 2000'),'shallow fallback probe missing');
assert(content.includes('const FULL_AUDIT_INTERVAL_MS = 30000'),'periodic full audit missing');
assert(content.includes("type: 'ORD_HEARTBEAT'")&&background.includes("message.type === 'ORD_HEARTBEAT'"),'compact heartbeat channel missing');
assert(background.includes('ordLatestHeartbeat')&&boot.includes('ordLatestHeartbeat'),'heartbeat bridge missing');
assert(content.includes('playableUnitCount')&&content.includes('SPECIAL_ROW_IDS'),'playable-unit auto-round signal missing');
assert(background.includes('nextAutoRound')&&background.includes('ordAutoRoundState'),'background auto-round generation missing');

const now=Date.now(),healthSnapshot={
  source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'32172',at:now,scanAt:now,bridgeAt:now,dataChangedAt:now,
  unitCount:300,collection:{found:true,confidence:.95},countDiscovery:{found:true,parsed:300,missing:0,ambiguous:0},
  wispCountFound:true,abilityCount:5,connected:true
};
assert.strictEqual(C.snapshotHealth(healthSnapshot,now).ready,true,'valid confidence-based v13 snapshot is blocked');
assert.strictEqual(C.snapshotHealth(Object.assign({},healthSnapshot,{helperId:'99999'}),now).ready,false,'unsupported helper is accepted');

const rows=units.map(unit=>({id:unit.id,name:unit.name,count:0,countFound:true,tmoPercent:0}));
const compactSnapshot={
  source:'tmo',parser:'ord-tmo-parser-v13-adapter',helperId:'32172',sessionId:'size-test',seq:1,
  scanAt:now,dataChangedAt:now,at:now,url:'https://tmo.gg/ko/build-helper/32172',unitCount:rows.length,
  collection:{found:true,confidence:.95,errors:[]},countDiscovery:{found:true,parsed:rows.length,missing:0,ambiguous:0,errors:[]},
  wispCountFound:true,units:rows,counts:Object.fromEntries(rows.map(row=>[row.id,0])),dataHash:'size-test'
};
const payloadBytes=Buffer.byteLength(JSON.stringify(compactSnapshot));
assert(payloadBytes<160000,`snapshot payload too large: ${payloadBytes}`);

const manualPath=path.resolve(ext,'../ord_2305_nightmare_helper_v17_10_0_manual.html');
assert(fs.existsSync(manualPath),'standalone v15 manual bundle missing');
assert(!fs.existsSync(path.resolve(ext,'../ord_2305_nightmare_helper_v14_2_0_manual.html')),'stale v14 manual remains in the v15 package');
const manual=fs.readFileSync(manualPath,'utf8');
assert(/<meta name="ord-helper" content="v17\.10\.0-decision-engine-manual">/.test(manual),'manual build marker missing');
assert(/source:\s*['\"]standalone-manual['\"]/.test(manual),'standalone manual boot missing');
assert(!/openai|ord_ai_advisor|127\.0\.0\.1:38766/i.test(manual),'OpenAI surface remains in manual');
let manualScripts=0;const embeddedScripts=new Map();
for(const match of manual.matchAll(/<script data-source="([^"]+)">([\s\S]*?)<\/script>/g)){
  new vm.Script(match[2],{filename:`manual:${match[1]}`});
  embeddedScripts.set(match[1],match[2].trim());
  manualScripts++;
}
assert.strictEqual(manualScripts,19,'manual inline script count changed');
for(const file of ['ord_units_data.js','ord_upper_memo.js','ord_synergy_memo.js','ord_data_patch.js','ord_story_nonupper_data.js','ord_story_upper_data.js','ord_upper_combat_data.js','ord_upper_skill_digest.js','ord_upper_skill_dps.js','ord_core.js','ord_squad_planner.js','ord_v15_model.js','ord_v15_ledger.js','ord_v15_policy.js','ord_v15_engine.js','ord_run_log_compactor.js','ord_run_log.js','ord_app.js']){
  assert.strictEqual(embeddedScripts.get(file),read(file).trim(),`manual bundle contains a stale ${file}`);
}
const embeddedCss=manual.match(/<style data-source="ord_app\.css">([\s\S]*?)<\/style>/);
assert(embeddedCss,'manual CSS bundle missing');
assert.strictEqual(embeddedCss[1].trim(),read('ord_app.css').trim(),'manual bundle contains stale CSS');
const embeddedCockpitCss=manual.match(/<style data-source="ord_cockpit_v15\.css">([\s\S]*?)<\/style>/);
assert(embeddedCockpitCss,'manual cockpit CSS bundle missing');
assert.strictEqual(embeddedCockpitCss[1].trim(),read('ord_cockpit_v15.css').trim(),'manual bundle contains stale cockpit CSS');

assert(!fs.existsSync(path.resolve(ext,'..','openai_bridge')),'removed OpenAI bridge directory remains');
assert(!fs.existsSync(path.resolve(ext,'..','START_OPENAI.bat')),'removed OpenAI launcher remains');

console.log(`PASS  manifest and MV3 CSP (${manifest.version})`);
console.log(`PASS  no OpenAI/localhost runtime surface`);
console.log(`PASS  data/recipe integrity (${units.length} units, ${units.filter(C.isUpper).length} upper variants)`);
console.log('PASS  primary 32172 + compatibility 34366 confidence connector');
console.log(`PASS  compact snapshot payload (${payloadBytes} bytes)`);
console.log(`PASS  standalone manual bundle (${manualScripts} inline scripts)`);
