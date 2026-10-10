const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'neon-drift.html'), 'utf8');
const core = source.split('/* save-state-core:start */')[1]?.split('/* save-state-core:end */')[0];
assert.ok(core, 'save-state-core markers must remain in the game source');
const sandbox = {};
vm.runInNewContext(`${core}\nglobalThis.api={META_KEY,META_BACKUP_KEY,META_VERSION,emptyCampaign,emptyMeta,validateCampaign,campaignNextSeed,campaignStart,campaignCommitMini,campaignCommitBoss,campaignAcknowledgeSettlement,decodeMeta,readMeta,writeMeta,exportPayload};`, sandbox);
const api = sandbox.api;
const plain = value => JSON.parse(JSON.stringify(value));
const hardcoreRewardComponents = (date, miniCredits = 0, bossCredits = 0) => Array.from({ length: 6 }, (_, node) => ({ node, rewards: {
  credits: node < 5 ? miniCredits : bossCredits, orbs: 0, bosses: node === 5 ? 1 : 0, missionProgress: [0, 0, 0],
  missionComplete: [0, 0, 0], achievements: []
} }));
const inlineScript = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]?.[1];

function bootGame(storage, { storageGetterThrows = false, reducedMotion = false, width = 800, height = 600 } = {}) {
  const windowEvents = new Map();
  const documentEvents = new Map();
  const canvasEvents = new Map();
  const mediaEvents = new Map();
  const animationFrames = [];
  const canvasCalls = [];
  const register = (events, type, handler) => events.set(type, handler);
  const makeButtons = (kind, names) => names.map(name => {
    const handlers = new Map();
    return { dataset: { [kind]: name }, disabled: false, textContent: name, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener: (type, handler) => handlers.set(type, handler),
      click() { if (!this.disabled) handlers.get('click')?.(); } };
  });
  const accessibleActions = makeButtons('action', ['campaign','campaign-map','endless','start','daily','pause','retry-save','retry','menu','ship','shop','levels','missions','stats','settings','difficulty','export','shop-prev','shop-next','level-prev','level-next','continue']);
  const accessibleUpgrades = makeButtons('buyUpgrade', Array.from({ length: 11 }, (_, i) => String(i)));
  const accessibleSkillBuys = makeButtons('buySkill', ['0','1','2','3']);
  const accessibleSkills = makeButtons('skill', ['0','1','2','3']);
  let rngCalls = 0;
  const accessibleSettings = makeButtons('setting', ['0','1','2','3','4','5','6']);
  const canvasContext = new Proxy({
    measureText: value => ({ width: String(value).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get(target, key) { return key in target ? target[key] : (...args) => canvasCalls.push({ name: key, args, fillStyle: target.fillStyle }); } });
  const CanvasRenderingContext2D = function CanvasRenderingContext2D() {};
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
    configurable: true,
    get() { return this._shadowBlur || 0; },
    set(value) { this._shadowBlur = value; },
  });
  const elements = {
    c: { clientWidth: width, clientHeight: height, getContext: () => canvasContext,
      addEventListener: (type, handler) => register(canvasEvents, type, handler),
      setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), focus() {} },
    'game-status': { textContent: '' },
  };
  const clock = { now: 1000 };
  const document = {
    hidden: false,
    getElementById: id => elements[id],
    addEventListener: (type, handler) => register(documentEvents, type, handler),
    querySelectorAll: selector => selector.includes('[data-action]') ? accessibleActions : selector.includes('[data-buy-upgrade]') ? accessibleUpgrades : selector.includes('[data-buy-skill]') ? accessibleSkillBuys : selector.includes('[data-skill]') ? accessibleSkills : accessibleSettings,
    fonts: { load: () => Promise.resolve() },
    createElement: () => ({ click() {}, getContext: () => canvasContext }),
  };
  const sandbox = {
    document, devicePixelRatio: 1, windowEvents, documentEvents, canvasEvents, mediaEvents, animationFrames, canvasCalls, accessibleActions, accessibleSettings, accessibleUpgrades, accessibleSkillBuys, accessibleSkills, clock, gameStatus: elements['game-status'],
    matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') && reducedMotion,
      addEventListener: (type, handler) => mediaEvents.set(type, handler),
      addListener: handler => mediaEvents.set('change', handler) }),
    addEventListener: (type, handler) => register(windowEvents, type, handler), requestAnimationFrame: callback => animationFrames.push(callback),
    CanvasRenderingContext2D,
    performance: { now: () => clock.now },
  };
  Object.defineProperty(sandbox, 'localStorage', { get() { if (storageGetterThrows) throw new Error('storage denied'); return storage; } });
  vm.runInNewContext(`${inlineScript}\nglobalThis.probe=()=>({state:st,meta:M,readOnly:saveReadOnly,reason:saveReason,recoveryRaw:()=>saveRecoveryRaw,start,startCampaign,campaignCommitMiniNode,campaignCommitBossNode,acknowledgeCampaignSettlement,retryCampaignSave,pause,end,hit,sv,advanceSkin,ok,skin:()=>skin,skinName:()=>SK[skin][0],skinColor:()=>SK[skin][1],geometry:()=>({S,W,H,dpr,x:px,ox,PW,canvasWidth:cv.width,canvasHeight:cv.height,py,hh,hw}),skillPosition:i=>({x:sx(i),y:H-32}),setTheme:index=>{t=index*25;lvp=index;th=index;st='play'},themeIndex:()=>th,setGalleryLevel:index=>{th=index;lp=index;st='lv'},levelData:()=>({themes:TH,lore:LORE,obstacles:OB,bosses:BN,hints:LEVEL_HINTS}),isLevelUnlocked:levelUnlocked,drawHazard:index=>{th=index;hzArt({x:100,y:80,w:38,h:30,v:150,theme:index})},drawOrbMark:index=>orbMark(100,80,index),canvasCalls:()=>canvasCalls,clearCanvasCalls:()=>canvasCalls.length=0,prepareSpawnTheme:index=>{t=index*25;lvp=index;th=index;st='play';wv=0;bo=null},setDifficulty:index=>{gm=index},setMissionRotation:index=>{mh=index},runKind:()=>runKind,campaignNode:()=>campaignNode,campaignWorld:()=>campaignWorld,campaignRun:()=>campaignRun,campaignConfiguration:()=>JSON.parse(JSON.stringify(CAMPAIGN_WORLDS)),campaignStageProfile:()=>campaignNodeConfig(campaignWorld,campaignNode),campaignProfile:(world,node)=>campaignNodeConfig(world,node),campaignStageDuration:campaignStageSeconds,validateCampaignWorlds,setCampaignDuration:(world,node,seconds)=>{const stage=CAMPAIGN_WORLDS[world].stages[node];stage.durationSeconds=seconds;if(stage.warningAt)stage.warningAt=Math.min(15,seconds-5)},prepareCampaignProfile:(world,node)=>{runKind='campaign';campaignWorld=world;campaignNode=node;st='play';th=world;objs=[];spd=180},campaignWallCenter, campaignRewards:()=>plainCampaignAttempt(),missionPlan:()=>[0,1,2].map(i=>MP[(mh+i*2)%6]),mp,waveState:()=>({active:wv,elapsed:wt,next:nw}),bossActive:()=>!!bo,bossSummary:()=>({big:bo?.big,label:bn,hp:bo?.hp}),forceCampaignBoss:()=>{bo={x:100};bossDown()},campaignOrbAtShip:()=>{tm=100;objs=[{k:'o',x:px,y:py,r:10,v:0}]},forceFatal:()=>{li=0;dth=1;end()},setRandom:value=>{rngCalls=0;rnd=()=>{rngCalls++;return value}},randomCalls:()=>rngCalls,spawnForLevel,objects:()=>objs,levelDuration:()=>LEVEL_SECONDS,campaignDuration,gameSpeed:()=>spd,stageIndex:currentLevelIndex,stageProgress:()=>({lvp,campaignClear}),stageRecords:()=>M.lv,prepareStage:(seconds,previous)=>{runKind='legacy';st='play';t=seconds;lvp=previous;th=currentLevelIndex();sc=180;rc=17;rk=2;rb=1;s0=80;tm=100;campaignClear=false},advanceGame:upd,canvas:cv,page:document,statusText:()=>gameStatus.textContent,reducedMotion:()=>rm,motion,deathSlowdown:()=>dth,drawFrame:(time=16)=>frame(time),scheduledFrames:()=>animationFrames.length,refreshAccessibleControls,keys:()=>[kl,kr,drag],steeringTarget:()=>tx,shopPage:()=>pg,levelPage:()=>lp,cooldowns:()=>cd,winReady:()=>winContinueReady,elapsed:()=>performance.now()-ot2,prepareWin:()=>{st='win';bc++;ot2=performance.now();refreshAccessibleControls()},continueAfterBoss,setNow:value=>{clock.now=value},windowEvents,documentEvents,canvasEvents,mediaEvents,accessibleActions,accessibleSettings,accessibleUpgrades,accessibleSkillBuys,accessibleSkills});function plainCampaignAttempt(){return campaignAttempt?JSON.parse(JSON.stringify(campaignAttempt)):null}`, sandbox);
  return sandbox.probe;
}

test('inline game script parses without syntax errors', () => {
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 1, 'the standalone game should keep one inline script');
  const result = spawnSync(process.execPath, ['--check'], { input: scripts[0], encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('campaign map shows all twelve worlds and announces saved stage and Boss progress', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const map = game().accessibleActions.find(button => button.dataset.action === 'campaign-map');
  map.click();
  assert.equal(game().state, 'campaignMap');
  game().drawFrame(16);
  assert.match(game().statusText(), /Campaign map\. 0 of 12 worlds cleared/);
  const labels = game().canvasCalls().filter(call => call.name === 'fillText').map(call => String(call.args[0]));
  for (const world of game().campaignConfiguration()) assert.equal(labels.some(label => label.includes(world.name)), true, world.name);
  assert.equal(labels.includes('LOCKED'), true);
  assert.equal(labels.includes('OPEN'), true, 'World 1 remains visible as the starting world');
  game().accessibleActions.find(button => button.dataset.action === 'menu').click();
  assert.equal(game().state, 'menu');
});

test('campaign map opens from the Canvas navigation and returns through its visible back control', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const { S, W, H } = game().geometry();
  const clickCanvas = (x, y, pointerId) => game().canvasEvents.get('pointerdown')({ preventDefault() {}, pointerId, pointerType: 'touch', clientX: x * S, clientY: y * S });
  clickCanvas(W / 2 - 75, H / 2 + 215, 1);
  assert.equal(game().state, 'campaignMap');
  game().canvasEvents.get('pointerup')({ pointerId: 1 });
  clickCanvas(W / 2, H / 2 + 194, 2);
  assert.equal(game().state, 'menu');
});

test('campaign map raises locked-world text contrast when High Contrast is enabled', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().meta.s.hc = 1;
  game().accessibleActions.find(button => button.dataset.action === 'campaign-map').click();
  game().drawFrame(16);
  const lastWorld = game().canvasCalls().find(call => call.name === 'fillText' && String(call.args[0]).startsWith('W12 · '));
  assert.equal(lastWorld.fillStyle, '#b8cbe0');
});

test('campaign map keeps all twelve rows inside a mobile-sized Canvas layout', () => {
  const game = bootGame({ getItem: () => null, setItem() {} }, { width: 390, height: 640 });
  game().accessibleActions.find(button => button.dataset.action === 'campaign-map').click();
  game().drawFrame(16);
  const { H, ox, PW } = game().geometry();
  const rows = game().canvasCalls().filter(call => call.name === 'fillText' && /^W\d{2} · /.test(String(call.args[0])));
  assert.equal(rows.length, 12);
  assert.equal(rows.every(row => row.args[1] >= ox && row.args[1] <= ox + PW && row.args[2] > 0 && row.args[2] < H - 30), true);
});

test('campaign map distinguishes completed, assisted, current, and locked world progress', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const campaign = game().meta.campaign;
  campaign.worlds[0] = { mini: 31, boss: 1, best: 700, assisted: 1 };
  campaign.worlds[1].mini = 3;
  campaign.checkpoint = { world: 1, node: 2, difficulty: 0, seed: 88,
    resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 300, credits: 0 } };
  game().accessibleActions.find(button => button.dataset.action === 'campaign-map').click();
  game().drawFrame(16);
  assert.match(game().statusText(), /1 of 12 worlds cleared/);
  assert.match(game().statusText(), /World 2, mini 3 of 5/);
  const labels = game().canvasCalls().filter(call => call.name === 'fillText').map(call => String(call.args[0]));
  assert.equal(labels.includes('ASSISTED'), true);
  assert.equal(labels.includes('IN PROGRESS'), true);
  assert.equal(labels.includes('LOCKED'), true);
});

test('campaign configuration validates twelve themed worlds, five distinct stage roles, and Boss profiles', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const config = game().campaignConfiguration();
  assert.equal(config.length, 12);
  for (const [worldIndex, world] of config.entries()) {
    assert.equal(world.world, worldIndex);
    assert.equal(world.stages.length, 5);
    assert.deepEqual(JSON.parse(JSON.stringify(world.stages.map(stage => stage.role))), ['scan','practice','variation','combine','foreshadow']);
    assert.deepEqual(JSON.parse(JSON.stringify(world.stages.map(stage => stage.event))), ['readable-lanes','single-pattern','shifted-pattern','mixed-patterns','boss-preview']);
    assert.equal(world.stages.every(stage => stage.durationSeconds === 20 && stage.clearCondition === 'survive-duration'), true);
    assert.equal(world.stages.every(stage => stage.safeGap >= 80 && stage.safeGap <= 140), true);
    assert.equal(world.boss.attackPattern, worldIndex % 3);
    assert.equal(world.boss.orbDamage, 1);
  }
  assert.equal(game().validateCampaignWorlds(config).length, 12);
  const incomplete = structuredClone(config); incomplete.pop();
  assert.throws(() => game().validateCampaignWorlds(incomplete), /twelve world/);
  const shortDuration = structuredClone(config); shortDuration[0].stages[4].durationSeconds = 15; shortDuration[0].stages[4].warningAt = 10;
  assert.equal(game().validateCampaignWorlds(shortDuration).length, 12);
  const lateWarning = structuredClone(shortDuration); lateWarning[0].stages[4].warningAt = 15;
  assert.throws(() => game().validateCampaignWorlds(lateWarning), /stage configuration/);
  const duration = structuredClone(config); duration[0].stages[0].durationSeconds = 30;
  assert.throws(() => game().validateCampaignWorlds(duration), /stage configuration/);
  const gap = structuredClone(config); gap[0].stages[0].safeGap = 20;
  assert.throws(() => game().validateCampaignWorlds(gap), /stage configuration/);
  const boss = structuredClone(config); boss[0].boss.fireInterval = 0;
  assert.throws(() => game().validateCampaignWorlds(boss), /Boss configuration/);
});

test('campaign mini-stage teaching hint appears on screen and in the live announcement', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().startCampaign();
  game().drawFrame(16);
  const hint = game().campaignProfile(0, 0).hint;
  const labels = game().canvasCalls().filter(call => call.name === 'fillText').map(call => String(call.args[0]));
  assert.equal(labels.includes(hint), true, 'the stage-entry banner displays its configured hint');
  assert.match(game().statusText(), new RegExp(hint));
});

test('Pattern Drill teaches players to center and follow a shifting opening', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().startCampaign();
  game().prepareCampaignProfile(0, 1);
  game().drawFrame(16);
  const hint = game().campaignProfile(0, 1).hint;
  const labels = game().canvasCalls().filter(call => call.name === 'fillText').map(call => String(call.args[0]));
  assert.equal(labels.includes(hint), true, 'the mini 2 banner displays the gap-centering instruction');
  assert.match(hint, /center/i);
  assert.match(hint, /shift/i);
  assert.match(game().statusText(), new RegExp(hint));
});

test('campaign defeat summary names the current mini stage or Big Boss', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().prepareCampaignProfile(0, 2);
  game().end();
  game().drawFrame(16);
  let labels = game().canvasCalls().filter(call => call.name === 'fillText').map(call => String(call.args[0]));
  assert.equal(labels.some(label => label.endsWith('WORLD 1 · MINI 3/5')), true);

  game().clearCanvasCalls();
  game().prepareCampaignProfile(0, 5);
  game().end();
  game().drawFrame(32);
  labels = game().canvasCalls().filter(call => call.name === 'fillText').map(call => String(call.args[0]));
  assert.equal(labels.some(label => label.endsWith('WORLD 1 · BIG BOSS')), true);

  game().clearCanvasCalls();
  game().prepareStage(0, 0);
  game().end();
  game().drawFrame(48);
  labels = game().canvasCalls().filter(call => call.name === 'fillText').map(call => String(call.args[0]));
  assert.equal(labels.some(label => label.endsWith('LV 1/12')), true, 'legacy runs keep their level result label');
});

test('campaign stage event mixes produce power-ups, orbs, tracking hazards, safe-gap walls, and themed blocks', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const profile = game().campaignConfiguration()[0].stages[0];
  game().prepareCampaignProfile(0, 0);
  for (const [roll, expected] of [
    [0, object => object.k === 'p'],
    [profile.powerRate + .01, object => object.k === 'o'],
    [profile.powerRate + profile.orbRate + .01, object => object.k === 'h' && object.hm],
    [profile.powerRate + profile.orbRate + profile.trackingRate + .01, object => object.k === 'h' && object.wl],
    [profile.orbRate + profile.powerRate + profile.trackingRate + profile.wallRate + .01, object => object.k === 'h' && !object.hm && !object.wl],
  ]) {
    game().setRandom(roll);
    game().objects().length = 0;
    game().spawnForLevel();
    assert.equal(game().objects().some(expected), true, `roll ${roll} should produce its configured event`);
  }
  const gapProfile = game().campaignConfiguration()[0].stages[0];
  game().setRandom(gapProfile.powerRate + gapProfile.orbRate + gapProfile.trackingRate + .01);
  game().objects().length = 0;
  game().spawnForLevel();
  const [left, right] = game().objects();
  assert.equal(Math.round(right.x - (left.x + left.w)), gapProfile.safeGap);
});

test('campaign wall scheduler clamps unreachable mini-stage gaps across pending wall windows', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const { ox, PW, py, hh, hw } = game().geometry();
  game().prepareCampaignProfile(0, 3);
  const oldCenter = 360.16699, gap = 96, oldSpeed = 190.81548, newSpeed = 194.80725;
  const oldY = -24 + (8.1975 - 7.4148) * oldSpeed;
  const previous = { wl: 1, y: oldY, h: 20, v: oldSpeed, _campaignGap: gap, _campaignCenter: oldCenter };
  const randomProposal = 53.60976;
  const guarded = game().campaignWallCenter(randomProposal, gap, [previous], newSpeed);
  assert.notEqual(guarded, null);
  assert.notEqual(guarded, randomProposal, 'an unreachable random proposal is moved into the reachable envelope');
  assert.ok(guarded >= ox + gap / 2 && guarded <= ox + PW - gap / 2);

  const oldSafe = [oldCenter - gap / 2 + hw, oldCenter + gap / 2 - hw];
  const nextSafe = [guarded - gap / 2 + hw, guarded + gap / 2 - hw];
  const lag = 420 / 16;
  const oldTarget = [oldSafe[0] + lag, oldSafe[1] - lag];
  const nextTarget = [nextSafe[0] + lag, nextSafe[1] - lag];
  const enterOld = (py - hh - 20 - oldY) / oldSpeed;
  const exitOld = (py + hh - oldY) / oldSpeed;
  const enterNew = (py - hh - 20 + 24) / newSpeed;
  const transition = Math.max(0, enterNew - exitOld - 0.1);
  assert.ok(transition > 0);
  for (const schedule of [[1 / 20], [1 / 60], [1 / 120], [1 / 120, 1 / 60, .05, 1 / 120, .025]]) {
    let px = oldTarget[1], tx = px, elapsed = 0, index = 0;
    while (elapsed < transition - 1e-9) {
      const dt = Math.min(schedule[index++ % schedule.length], transition - elapsed);
      const direction = tx > nextTarget[0] ? -1 : 0;
      tx += direction * 420 * dt;
      px += (tx - px) * Math.min(1, dt * 16);
      elapsed += dt;
    }
    assert.ok(tx >= nextTarget[0] - 1e-6 && tx <= nextTarget[1] + 1e-6, `target reaches the next safe corridor for schedule ${schedule}`);
    assert.ok(px >= nextSafe[0] - 1e-6 && px <= nextSafe[1] + 1e-6, `ship reaches the next safe interval for schedule ${schedule}`);
    assert.ok(oldTarget[1] >= oldSafe[0] && oldTarget[1] <= oldSafe[1]);
  }

  const feasible = 300;
  const overlapping = { wl: 1, y: py - hh - 20, h: 20, v: 200, _campaignGap: gap, _campaignCenter: feasible };
  assert.equal(game().campaignWallCenter(feasible, gap, [overlapping], 200), feasible, 'feasible aligned proposals remain unchanged for overlapping windows');
  const older = { ...previous, y: py - hh - 20 - oldSpeed * .2, _campaignCenter: 320 };
  const clampedByBoth = game().campaignWallCenter(80, gap, [previous, older], newSpeed);
  assert.notEqual(clampedByBoth, null, 'all pending wall constraints retain a legal center');
  assert.ok(clampedByBoth >= ox + gap / 2 && clampedByBoth <= ox + PW - gap / 2);

  game().objects().length = 0;
  game().objects().push(previous);
  const wallRoll = game().campaignConfiguration()[0].stages[3];
  game().setRandom(wallRoll.powerRate + wallRoll.orbRate + wallRoll.trackingRate + .01);
  game().spawnForLevel();
  assert.equal(game().randomCalls(), 2, 'the guard adjusts the existing center draw without consuming extra random values');
  assert.equal(game().objects().filter(object => object.wl).length, 3, 'a new guarded pair is appended alongside the prior wall pair');
});

test('the first menu frame completes and schedules the next animation frame', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  assert.equal(game().scheduledFrames(), 1);
  assert.doesNotThrow(() => game().drawFrame(16));
  assert.equal(game().scheduledFrames(), 2);
});

test('accessible menu, settings, records, pause, and game-over screens draw without runtime errors', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const action = name => game().accessibleActions.find(button => button.dataset.action === name);
  let time = 16;
  const render = expected => {
    game().drawFrame(time += 16);
    assert.equal(game().state, expected);
  };
  for (const name of ['shop','levels','missions','stats','settings']) {
    action(name).click();
    render(name === 'levels' ? 'lv' : name === 'missions' ? 'miss' : name === 'stats' ? 'stats' : name === 'settings' ? 'set' : 'shop');
    action('menu').click();
    render('menu');
  }
  action('start').click();
  render('play');
  action('pause').click();
  render('pause');
  action('pause').click();
  render('play');
  game().end();
  render('over');
  game().setNow(1701);
  game().drawFrame(time += 16);
  action('retry').click();
  render('play');
});

test('missing save uses fresh defaults', () => {
  const result = plain(api.decodeMeta(null));
  assert.equal(result.migrated, false);
  assert.equal(result.reason, '');
  assert.deepEqual(result.meta.u, Array(11).fill(0));
  assert.deepEqual(result.meta.k, [0, 0, 0, 0]);
});

test('legacy save migrates without losing known progress', () => {
  const legacy = { c: 275, u: [1, 2], g: 14, o: 32, a: ['s200'], k: [1], tb: 3,
    ld: '2026-10-08', s: { m: 1, cb: 1 }, lv: [{ cl: 1, sc: 120, c: 8, k: 2, b: 1, g: 10 }] };
  const result = plain(api.decodeMeta(JSON.stringify(legacy)));
  assert.equal(result.migrated, true);
  assert.equal(result.recoveryRaw, null);
  assert.equal(result.meta.c, 275);
  assert.deepEqual(result.meta.u.slice(0, 3), [1, 2, 0]);
  assert.deepEqual(result.meta.k, [1, 0, 0, 0]);
  assert.equal(result.meta.tb, 3);
  assert.equal(result.meta.lv[0].sc, 120);
  assert.equal(result.meta.s.m, 1);
});

test('current versioned save decodes without triggering another migration', () => {
  const payload = { version: api.META_VERSION, data: { c: 45, u: [2], a: ['b1'] } };
  const result = plain(api.decodeMeta(JSON.stringify(payload)));
  assert.equal(result.migrated, false);
  assert.equal(result.meta.c, 45);
  assert.deepEqual(result.meta.a, ['b1']);
});

test('v1 migration preserves all twelve legacy records and creates an isolated empty campaign', () => {
  const levels = Array.from({ length: 12 }, (_, i) => ({ cl: i % 2, sc: 400 + i, c: i, k: i + 1, b: i % 3, g: 90 + i }));
  const raw = JSON.stringify({ version: 1, data: { c: 81, g: 9, bl: 12, lv: levels } });
  const migrated = plain(api.decodeMeta(raw));
  assert.equal(api.META_VERSION, 2);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.sourceRaw, raw);
  assert.deepEqual(migrated.meta.lv, levels);
  assert.deepEqual(migrated.meta.campaign, plain(api.emptyCampaign()));
  const values = new Map([[api.META_KEY, raw]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(api.writeMeta(storage, migrated.meta, raw), true);
  assert.equal(values.get(api.META_BACKUP_KEY), raw);
  const saved = JSON.parse(values.get(api.META_KEY));
  assert.equal(saved.version, 2);
  assert.deepEqual(plain(api.decodeMeta(values.get(api.META_KEY))).meta.lv, levels);
});

test('campaign schema round-trips a single normal checkpoint and a committed settlement receipt', () => {
  const data = plain(api.emptyMeta());
  data.campaign.worlds[0] = { mini: 31, boss: 1, best: 4200, assisted: 0 };
  data.campaign.checkpoint = { world: 1, node: 0, difficulty: 0, seed: 12345,
    resources: { lives: 3, shield: 1, cooldowns: [0, 2, 0, 4], score: 4200, credits: 37 } };
  data.campaign.claims = ['w0:boss:clear'];
  data.campaign.pendingSettlement = { id: 'world:0:boss', world: 0, score: 4200, credits: 37, final: 0, assisted: 0 };
  const decoded = plain(api.decodeMeta(JSON.stringify({ version: 2, data })));
  assert.equal(decoded.reason, '');
  assert.deepEqual(decoded.meta.campaign, data.campaign);
});

test('campaign schema rejects impossible Boss checkpoints, settlement mismatches, and repeatable claim identities', () => {
  const base = plain(api.emptyMeta());
  base.campaign.checkpoint = { world: 0, node: 5, difficulty: 0, seed: 9,
    resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 0, credits: 0 } };
  assert.match(plain(api.decodeMeta(JSON.stringify({ version: 2, data: base }))).reason, /boss checkpoint/);
  const mismatch = plain(api.emptyMeta());
  mismatch.campaign.worlds[0] = { mini: 31, boss: 1, best: 0 };
  mismatch.campaign.worlds[1] = { mini: 31, boss: 1, best: 0 };
  mismatch.campaign.checkpoint = { world: 1, node: 0, difficulty: 0, seed: 9,
    resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 0, credits: 0 } };
  mismatch.campaign.pendingSettlement = { id: 'world:0:boss', world: 0, score: 0, credits: 0, final: 0 };
  mismatch.campaign.checkpoint.world = 2;
  assert.match(plain(api.decodeMeta(JSON.stringify({ version: 2, data: mismatch }))).reason, /checkpoint mismatch/);
  const duplicateClass = plain(api.emptyMeta());
  duplicateClass.campaign.claims = ['w0:boss:clear:attempt-1'];
  assert.match(plain(api.decodeMeta(JSON.stringify({ version: 2, data: duplicateClass }))).reason, /campaign claims/);
});

test('campaign schema rejects skipped mini masks and later-world history without prior Boss clears', () => {
  const skippedMini = plain(api.emptyMeta());
  skippedMini.campaign.worlds[0].mini = 2;
  const rawMini = JSON.stringify({ version: 2, data: skippedMini });
  const badMini = plain(api.decodeMeta(rawMini));
  assert.match(badMini.reason, /unreachable/);
  assert.equal(badMini.recoveryRaw, rawMini);
  const skippedWorld = plain(api.emptyMeta());
  skippedWorld.campaign.worlds[1].mini = 1;
  const rawWorld = JSON.stringify({ version: 2, data: skippedWorld });
  const badWorld = plain(api.decodeMeta(rawWorld));
  assert.match(badWorld.reason, /skips a Boss/);
  assert.equal(badWorld.recoveryRaw, rawWorld);
});

test('campaign mini clear atomically advances one checkpoint and grants its first-clear delta once', () => {
  const today = new Date().toISOString().slice(0, 10);
  let state = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 0, seed: 71 }));
  const event = { world: 0, node: 0, run: state.campaign.runs, difficulty: 0, seed: 71, score: 120,
    resources: { lives: 3, shield: 1, cooldowns: [0, 0, 0, 0], score: 120, credits: 4 },
    rewards: { credits: 12, orbs: 4, bosses: 0, date: today, missionProgress: [1, 0, 0], missionComplete: [0, 0, 0], achievements: [] } };
  const committed = plain(api.campaignCommitMini(state, event));
  assert.equal(committed.c, 12);
  assert.equal(committed.o, 4);
  assert.deepEqual(committed.ms.p, [1, 0, 0]);
  assert.equal(committed.campaign.worlds[0].mini, 1);
  assert.equal(committed.campaign.checkpoint.node, 1);
  assert.equal(committed.campaign.checkpoint.seed, api.campaignNextSeed(event.seed, 0, 1, 0));
  assert.notEqual(committed.campaign.checkpoint.seed, event.seed);
  assert.equal(committed.campaign.claims.includes('w0:mini0:clear'), true);
  assert.deepEqual(plain(api.campaignCommitMini(committed, event)), committed, 'a duplicate clear callback cannot repay or move progress again');
});

test('campaign achievements can grant once after a mini first-clear claim was already consumed', () => {
  const today = new Date().toISOString().slice(0, 10);
  let state = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 0, seed: 73 }));
  const event = { world: 0, node: 0, run: state.campaign.runs, difficulty: 0, seed: 73, score: 30,
    resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 30, credits: 0 },
    rewards: { credits: 10, orbs: 1, bosses: 0, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] } };
  state = plain(api.campaignCommitMini(state, event));
  assert.equal(state.c, 10);
  state.campaign.runs++;
  state.campaign.checkpoint = { ...state.campaign.checkpoint, node: 0 };
  const replay = plain(api.campaignCommitMini(state, { ...event, run: state.campaign.runs, rewards: { ...event.rewards, achievements: ['late-achievement'] } }));
  assert.equal(replay.c, 35, 'achievement reward remains independent from the consumed mini first-clear claim');
  assert.deepEqual(replay.a, ['late-achievement']);
  assert.equal(replay.campaign.claims.includes('a:late-achievement'), true);
});

test('campaign boss commit stores the next checkpoint and display receipt once; acknowledgment only clears the receipt', () => {
  const today = new Date().toISOString().slice(0, 10);
  let state = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 0, seed: 5 }));
  for (let node = 0; node < 5; node++) {
    const cp = state.campaign.checkpoint;
    state = plain(api.campaignCommitMini(state, { world: 0, node, run: state.campaign.runs, difficulty: 0, seed: cp.seed, score: 100 + node,
      resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 100 + node, credits: 0 },
      rewards: { credits: 1, orbs: 1, bosses: 0, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] } }));
  }
  const event = { world: 0, run: state.campaign.runs, difficulty: 0, seed: 6, score: 900,
    resources: { lives: 2, shield: 0, cooldowns: [1, 2, 3, 4], score: 900, credits: 0 },
    rewards: { credits: 40, orbs: 3, bosses: 1, date: today, missionProgress: [0, 1, 0], missionComplete: [0, 1, 0], achievements: ['boss-1'] } };
  const committed = plain(api.campaignCommitBoss(state, event));
  assert.equal(committed.c, 70);
  assert.equal(committed.tb, 1);
  assert.equal(committed.campaign.worlds[0].boss, 1);
  assert.equal(committed.campaign.checkpoint.world, 1);
  assert.equal(committed.campaign.checkpoint.node, 0);
  assert.deepEqual(committed.campaign.pendingSettlement, { id: 'world:0:boss', world: 0, score: 900, credits: 65, final: 0, assisted: 0 });
  assert.deepEqual(plain(api.campaignCommitBoss(committed, event)), committed, 'duplicate Boss callbacks cannot pay twice or replace the receipt');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(api.writeMeta(storage, committed), true);
  const reloaded = plain(api.decodeMeta(values.get(api.META_KEY))).meta;
  assert.deepEqual(plain(api.campaignCommitBoss(reloaded, event)), committed, 'duplicate callback after reload is idempotent');
  const ack = plain(api.campaignAcknowledgeSettlement(committed, 'world:0:boss'));
  assert.equal(ack.c, committed.c);
  assert.equal(ack.campaign.pendingSettlement, null);
  assert.deepEqual(plain(api.campaignAcknowledgeSettlement(ack, 'wrong-id')), ack);
  assert.deepEqual(plain(api.campaignCommitBoss(ack, event)), ack, 'late Boss callback after acknowledgment cannot reopen the receipt');
});

test('campaign commit and settlement acknowledgment failures preserve the correct durable snapshot', () => {
  const today = new Date().toISOString().slice(0, 10);
  let state = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 0, seed: 23 }));
  for (let node = 0; node < 5; node++) {
    const cp = state.campaign.checkpoint;
    state = plain(api.campaignCommitMini(state, { world: 0, node, run: state.campaign.runs, difficulty: 0, seed: cp.seed, score: 10,
      resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 10, credits: 0 },
      rewards: { credits: 1, orbs: 0, bosses: 0, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] } }));
  }
  let failWrites = false;
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) { if (failWrites) throw new Error('simulated storage failure'); values.set(key, value); } };
  assert.equal(api.writeMeta(storage, state), true);
  const lastCheckpoint = values.get(api.META_KEY);
  const boss = plain(api.campaignCommitBoss(state, { world: 0, run: state.campaign.runs, difficulty: 0, seed: 24, score: 500,
    resources: { lives: 2, shield: 0, cooldowns: [0, 0, 0, 0], score: 500, credits: 0 },
    rewards: { credits: 40, orbs: 0, bosses: 1, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] } }));
  failWrites = true;
  assert.equal(api.writeMeta(storage, boss), false, 'failed Boss commit is not reported as saved');
  assert.equal(values.get(api.META_KEY), lastCheckpoint);
  const beforeCommit = plain(api.decodeMeta(values.get(api.META_KEY))).meta;
  assert.equal(beforeCommit.c, 5);
  assert.equal(beforeCommit.campaign.checkpoint.world, 0);
  assert.equal(beforeCommit.campaign.checkpoint.node, 5);
  assert.equal(beforeCommit.campaign.pendingSettlement, null);

  failWrites = false;
  assert.equal(api.writeMeta(storage, boss), true);
  const ack = plain(api.campaignAcknowledgeSettlement(boss, 'world:0:boss'));
  failWrites = true;
  assert.equal(api.writeMeta(storage, ack), false, 'failed acknowledgment leaves the committed receipt intact');
  const afterAckFailure = plain(api.decodeMeta(values.get(api.META_KEY))).meta;
  assert.equal(afterAckFailure.c, 45);
  assert.deepEqual(afterAckFailure.campaign.pendingSettlement, boss.campaign.pendingSettlement);
  assert.equal(afterAckFailure.campaign.checkpoint.world, 1);
});

test('failed Normal mini checkpoint write leaves the previous checkpoint and wallet durable', () => {
  const today = new Date().toISOString().slice(0, 10);
  const initial = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 0, seed: 41 }));
  let failWrites = false;
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) { if (failWrites) throw new Error('simulated storage failure'); values.set(key, value); } };
  assert.equal(api.writeMeta(storage, initial), true);
  const oldRaw = values.get(api.META_KEY);
  const candidate = plain(api.campaignCommitMini(initial, { world: 0, node: 0, run: initial.campaign.runs, difficulty: 0, seed: 41, score: 70,
    resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 70, credits: 0 },
    rewards: { credits: 15, orbs: 2, bosses: 0, date: today, missionProgress: [1, 0, 0], missionComplete: [0, 0, 0], achievements: [] } }));
  failWrites = true;
  assert.equal(api.writeMeta(storage, candidate), false);
  assert.equal(values.get(api.META_KEY), oldRaw);
  const durable = plain(api.decodeMeta(oldRaw)).meta;
  assert.equal(durable.c, 0);
  assert.equal(durable.campaign.checkpoint.node, 0);
  assert.equal(initial.c, 0, 'candidate construction does not mutate the live snapshot');
});

test('campaign Hardcore mini clears stay transient and the final Boss creates no World 13 checkpoint', () => {
  const today = new Date().toISOString().slice(0, 10);
  let state = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 1, seed: 17 }));
  assert.throws(() => api.campaignCommitMini(state, { world: 0, node: 0, run: state.campaign.runs, difficulty: 1, seed: 17, score: 20,
    resources: { lives: 1, shield: 0, cooldowns: [0, 0, 0, 0], score: 20, credits: 0 },
    rewards: { credits: 2, orbs: 0, bosses: 0, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] } }), /checkpoint does not match/);
  state.campaign.worlds = Array.from({ length: 12 }, () => ({ mini: 31, boss: 1, best: 0 }));
  state.campaign.checkpoint = { world: 11, node: 0, difficulty: 1, seed: 17,
    resources: { lives: 1, shield: 0, cooldowns: [0, 0, 0, 0], score: 0, credits: 0 } };
  const final = plain(api.campaignCommitBoss(state, { world: 11, run: state.campaign.runs, difficulty: 1, seed: 18, score: 500,
    resources: { lives: 1, shield: 0, cooldowns: [0, 0, 0, 0], score: 500, credits: 0 },
    rewardComponents: hardcoreRewardComponents(today, 2, 10),
    rewards: { credits: 10, orbs: 0, bosses: 1, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] } }));
  assert.equal(final.campaign.completed, 1);
  assert.equal(final.campaign.checkpoint, null);
  assert.equal(final.campaign.pendingSettlement.final, 1);
  assert.equal(final.campaign.pendingSettlement.credits, 20);
  assert.deepEqual(final.campaign.claims.slice(-6), ['w11:mini0:clear','w11:mini1:clear','w11:mini2:clear','w11:mini3:clear','w11:mini4:clear','w11:boss:clear']);
});

test('Hardcore cannot commit the next world until the previous settlement is acknowledged', () => {
  const today = new Date().toISOString().slice(0, 10);
  const state = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 1, seed: 51 }));
  const boss = { world: 0, run: state.campaign.runs, difficulty: 1, seed: 52, score: 200,
    resources: { lives: 1, shield: 0, cooldowns: [0, 0, 0, 0], score: 200, credits: 0 },
    rewardComponents: hardcoreRewardComponents(today, 0, 20),
    rewards: { credits: 20, orbs: 0, bosses: 1, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] } };
  const committed = plain(api.campaignCommitBoss(state, boss));
  const nextBoss = { ...boss, world: 1, seed: 53, score: 300 };
  assert.throws(() => api.campaignCommitBoss(committed, nextBoss), /acknowledged first/);
  assert.equal(committed.c, 20);
  assert.equal(committed.campaign.checkpoint.world, 1);
  assert.equal(committed.campaign.pendingSettlement.id, 'world:0:boss');
  assert.equal(committed.campaign.worlds[1].boss, 0);
});

test('stale callbacks from a previous campaign run are rejected while a legitimate replay advances without repaying', () => {
  const today = new Date().toISOString().slice(0, 10);
  const finished = plain(api.emptyMeta());
  finished.campaign.worlds = Array.from({ length: 12 }, () => ({ mini: 31, boss: 1, best: 500 }));
  finished.campaign.claims = Array.from({ length: 5 }, (_, node) => 'w0:mini' + node + ':clear').concat('w0:boss:clear');
  finished.campaign.completed = 1;
  finished.campaign.runs = 1;
  const restarted = plain(api.campaignStart(finished, { difficulty: 0, seed: 61 }));
  assert.equal(restarted.campaign.runs, 2);
  const rewards = { credits: 100, orbs: 1, bosses: 0, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: [] };
  const oldEvent = { world: 0, node: 0, run: 1, difficulty: 0, seed: 61, score: 800,
    resources: { lives: 3, shield: 0, cooldowns: [0, 0, 0, 0], score: 800, credits: 0 }, rewards };
  assert.throws(() => api.campaignCommitMini(restarted, oldEvent), /stale campaign run/);
  const currentEvent = { ...oldEvent, run: 2 };
  const replayed = plain(api.campaignCommitMini(restarted, currentEvent));
  assert.equal(replayed.c, restarted.c);
  assert.equal(replayed.campaign.checkpoint.node, 1);
  assert.equal(replayed.campaign.worlds[0].best, 800);
});

test('Zen campaign progress is marked but does not mint permanent challenge rewards', () => {
  const today = new Date().toISOString().slice(0, 10);
  let state = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 2, seed: 31 }));
  for (let node = 0; node < 5; node++) {
    state = plain(api.campaignCommitMini(state, { world: 0, node, run: state.campaign.runs, difficulty: 2, seed: 31, score: 30,
      resources: { lives: 5, shield: 0, cooldowns: [0, 0, 0, 0], score: 30, credits: 0 },
      rewards: { credits: 30, orbs: 2, bosses: 0, date: today, missionProgress: [2, 0, 0], missionComplete: [1, 0, 0], achievements: ['zen-practice'] } }));
  }
  state = plain(api.campaignCommitBoss(state, { world: 0, run: state.campaign.runs, difficulty: 2, seed: 32, score: 500,
    resources: { lives: 5, shield: 0, cooldowns: [0, 0, 0, 0], score: 500, credits: 0 },
    rewards: { credits: 200, orbs: 9, bosses: 1, date: today, missionProgress: [0, 0, 0], missionComplete: [0, 0, 0], achievements: ['zen-boss'] } }));
  assert.equal(state.campaign.worlds[0].boss, 1);
  assert.equal(state.campaign.worlds[0].assisted, 1);
  assert.equal(state.campaign.checkpoint.world, 1);
  assert.equal(state.campaign.pendingSettlement.credits, 0);
  assert.equal(state.campaign.pendingSettlement.assisted, 1);
  assert.equal(state.c, 0);
  assert.equal(state.o || 0, 0);
  assert.equal(state.tb || 0, 0);
  assert.deepEqual(state.a, []);
  assert.equal(state.ms, undefined);
  assert.deepEqual(state.campaign.claims, []);
});

test('campaign checkpoint validation preserves fractional cooldowns and temporary effects across reload', () => {
  const resources = { lives: 3, shield: 1, cooldowns: [0, 1, 2, 3], cooldownsMs: [0, 125, 1500, 2999],
    effects: { inv: 100, slow: 250, multiplier: 0, blaster: 5000, fire: 220 }, combo: 7, coinRemainder: 625, score: 90, credits: 12 };
  const started = plain(api.campaignStart(plain(api.emptyMeta()), { difficulty: 0, seed: 42, resources }));
  const decoded = plain(api.decodeMeta(JSON.stringify({ version: api.META_VERSION, data: started })).meta);
  assert.deepEqual(decoded.campaign.checkpoint.resources, resources);
});

test('Hardcore campaign mission progress and completion rewards accumulate once across mini stages', () => {
  const values = new Map();
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  game().setDifficulty(1);
  game().startCampaign();
  const slot = game().missionPlan().findIndex(mission => ['o', 'n', 'w'].includes(mission[2]));
  assert.notEqual(slot, -1);
  const mission = game().missionPlan()[slot];
  game().meta.ms.p[slot] = mission[1] - 1;
  game().mp(mission[2], 1);
  assert.equal(game().campaignRewards().credits, mission[3]);
  assert.equal(game().campaignRewards().missionComplete[slot], 1);
  game().campaignCommitMiniNode();
  game().mp(mission[2], 1);
  assert.equal(game().campaignRewards().credits, 0, 'a completed transient mission must not pay again on the next node');
  assert.equal(game().campaignRewards().missionProgress[slot], 0);
  for (let node = 1; node < 5; node++) game().campaignCommitMiniNode();
  game().advanceGame(0.016);
  game().forceCampaignBoss();
  game().advanceGame(0);
  assert.equal(game().meta.ms.p[slot], mission[1]);
  assert.ok(game().meta.campaign.pendingSettlement.credits >= mission[3] + 40);
});

test('Campaign Big Boss defeats advance and complete the active Boss mission', () => {
  const values = new Map();
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  game().setMissionRotation(1);
  const slot = game().missionPlan().findIndex(mission => mission[2] === 'b');
  assert.notEqual(slot, -1);
  game().startCampaign();
  for (let node = 0; node < 5; node++) game().advanceGame(20);
  game().advanceGame(0.016);
  game().forceCampaignBoss();
  game().advanceGame(0);
  const mission = game().missionPlan()[slot];
  assert.equal(game().meta.ms.p[slot], mission[1]);
  assert.equal(game().meta.ms.c[slot], 1);
  assert.ok(game().meta.campaign.pendingSettlement.credits >= mission[3] + 40);
});

test('World 1 campaign advances through five timed mini stages into its separate Big Boss', () => {
  const values = new Map();
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  game().accessibleActions.find(button => button.dataset.action === 'campaign').click();
  assert.equal(game().state, 'play');
  assert.equal(game().runKind(), 'campaign');
  assert.match(game().statusText(), /mini 1 of 5/i);
  for (let node = 0; node < 5; node++) {
    assert.equal(game().campaignNode(), node);
    game().advanceGame(19.99);
    assert.equal(game().campaignNode(), node, 'a node must not clear before its 20-second boundary');
    game().advanceGame(0.01);
    assert.equal(game().state, 'play');
    assert.equal(game().campaignNode(), node + 1);
    if (node < 4) assert.equal(game().meta.campaign.checkpoint.node, node + 1);
  }
  assert.equal(game().meta.campaign.worlds[0].mini, 31);
  assert.equal(game().meta.campaign.checkpoint.node, 5);
  game().advanceGame(0.016);
  assert.equal(game().bossActive(), true);
  assert.equal(game().bossSummary().big, 1);
  assert.match(game().bossSummary().label, /BIG BOSS/);
});

test('campaign stage runtime follows centrally configured 15- and 25-second durations', () => {
  for (const duration of [15, 25]) {
    const values = new Map();
    const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
    game().setCampaignDuration(0, 0, duration);
    game().setCampaignDuration(0, 4, duration);
    assert.equal(game().campaignProfile(0, 4).warningAt, Math.min(15, duration - 5));
    game().startCampaign();
    game().advanceGame(duration - 0.01);
    assert.equal(game().campaignNode(), 0, `stage must hold at ${duration - 0.01}s`);
    game().advanceGame(0.01);
    assert.equal(game().campaignNode(), 1, `stage must clear at ${duration}s`);
  }
});

test('T2 duration candidates route all five mini roles across twelve worlds into each Big Boss gate', () => {
  for (const duration of [15, 20, 25]) {
    const values = new Map();
    const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
    for (let world = 0; world < 12; world++) {
      for (let node = 0; node < 5; node++) game().setCampaignDuration(world, node, duration);
    }
    game().startCampaign();
    for (let world = 0; world < 12; world++) {
      assert.equal(game().campaignWorld(), world, `candidate ${duration}s starts World ${world + 1} in order`);
      for (let node = 0; node < 5; node++) {
        assert.equal(game().campaignNode(), node, `candidate ${duration}s begins World ${world + 1}, mini ${node + 1}`);
        game().advanceGame(duration - 0.01);
        assert.equal(game().campaignNode(), node, `candidate ${duration}s must not clear World ${world + 1}, mini ${node + 1} early`);
        game().advanceGame(0.01);
        assert.equal(game().campaignNode(), node + 1, `candidate ${duration}s clears World ${world + 1}, mini ${node + 1} on its boundary`);
      }
      assert.equal(game().campaignNode(), 5, `candidate ${duration}s reaches the World ${world + 1} Boss only after five minis`);
      game().advanceGame(0.016);
      assert.equal(game().bossActive(), true, `candidate ${duration}s enters World ${world + 1}'s Big Boss after mini 5`);
      game().forceCampaignBoss();
      game().advanceGame(0);
      assert.equal(game().state, 'campaignSettlement');
      assert.equal(game().meta.campaign.pendingSettlement.world, world);
      if (world < 11) {
        assert.equal(game().acknowledgeCampaignSettlement(), true);
        assert.equal(game().campaignWorld(), world + 1);
        assert.equal(game().campaignNode(), 0);
      }
    }
    assert.equal(game().meta.campaign.worlds.every(world => world.mini === 31 && world.boss === 1), true);
    assert.equal(game().meta.campaign.completed, 1);
    assert.equal(game().acknowledgeCampaignSettlement(), true);
    assert.equal(game().state, 'campaignComplete');
  }
});

test('Campaign runtime routes all 72 nodes through twelve Boss settlements and the final clear', () => {
  const values = new Map();
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  game().startCampaign();
  for (let world = 0; world < 12; world++) {
    assert.equal(game().campaignWorld(), world);
    for (let node = 0; node < 5; node++) {
      assert.equal(game().campaignNode(), node);
      const duration = game().campaignStageDuration(world, node);
      game().advanceGame(duration - 0.01);
      assert.equal(game().campaignNode(), node, `world ${world + 1}, mini ${node + 1} must hold before ${duration} seconds`);
      game().advanceGame(0.01);
      assert.equal(game().campaignNode(), node + 1);
    }
    game().advanceGame(0.016);
    assert.equal(game().bossActive(), true, `world ${world + 1} must start its own Boss`);
    assert.equal(game().bossSummary().big, 1);
    game().forceCampaignBoss();
    game().advanceGame(0);
    assert.equal(game().state, 'campaignSettlement', `world ${world + 1} must show its committed Boss receipt`);
    assert.equal(game().meta.campaign.pendingSettlement.world, world);
    assert.equal(game().meta.campaign.pendingSettlement.final, +(world === 11));
    if (world < 11) {
      assert.equal(game().acknowledgeCampaignSettlement(), true);
      assert.equal(game().campaignWorld(), world + 1);
      assert.equal(game().campaignNode(), 0);
      assert.equal(game().state, 'play');
    }
  }
  assert.equal(game().acknowledgeCampaignSettlement(), true);
  assert.equal(game().state, 'campaignComplete');
  assert.equal(game().meta.campaign.completed, 1);
  assert.equal(game().meta.campaign.checkpoint, null, 'final clear must not create a World 13 checkpoint');
  assert.equal(game().meta.campaign.worlds.every(world => world.mini === 31 && world.boss === 1), true);
});

test('Normal World 1 Big Boss is beatable with collected orbs and no purchased upgrades', () => {
  const values = new Map();
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  game().startCampaign();
  for (let node = 0; node < 5; node++) game().advanceGame(20);
  game().advanceGame(0.016);
  assert.equal(game().bossActive(), true);
  assert.equal(game().meta.u.every(level => level === 0), true);
  assert.equal(game().bossSummary().hp, 12);
  assert.match(game().statusText(), /Starting health 12 of 12/);
  game().drawFrame(16);
  assert.equal(game().canvasCalls().some(call => call.name === 'fillText' && call.args[0] === 'BOSS HP 12 / 12'), true);
  for (let orb = 0; orb < 11; orb++) {
    game().campaignOrbAtShip();
    game().advanceGame(0.016);
    assert.equal(game().bossSummary().hp, 11 - orb);
    if (orb === 0) {
      game().drawFrame(32);
      assert.equal(game().canvasCalls().some(call => call.name === 'fillText' && call.args[0] === 'BOSS HP 11 / 12'), true);
    }
    const thresholdAnnouncements = { 2: 'at or below 75 percent', 5: 'at or below 50 percent', 8: 'at or below 25 percent' };
    if (thresholdAnnouncements[orb]) assert.match(game().statusText(), new RegExp(thresholdAnnouncements[orb]));
    if (orb === 3) assert.match(game().statusText(), /at or below 75 percent/, 'the same quarter does not announce again');
  }
  game().campaignOrbAtShip();
  game().advanceGame(0.016);
  assert.equal(game().state, 'campaignSettlement');
  assert.equal(game().meta.campaign.worlds[0].boss, 1);
  assert.equal(game().meta.u.every(level => level === 0), true, 'the clear must not depend on upgrades');
});

test('campaign completion preserves legacy level records and run counters', () => {
  const levels = Array.from({ length: 12 }, (_, i) => ({ cl: i % 2, sc: 900 + i, c: 20 + i, k: i + 1, b: i % 3, g: 500 + i }));
  const initial = { version: api.META_VERSION, data: { lv: levels, g: 7, bl: 8 } };
  const values = new Map([[api.META_KEY, JSON.stringify(initial)]]);
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  game().startCampaign();
  for (let node = 0; node < 5; node++) game().advanceGame(20);
  game().advanceGame(0.016);
  game().forceCampaignBoss();
  game().advanceGame(0);
  assert.equal(game().meta.lv.length, 12);
  assert.deepEqual(plain(game().meta.lv), levels);
  assert.equal(game().meta.g, 7);
  assert.equal(game().meta.bl, 8);
});

test('Reduced Motion preserves the final mini-stage Boss warning cue', () => {
  const values = new Map();
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }, { reducedMotion: true });
  game().startCampaign();
  for (let node = 0; node < 4; node++) game().advanceGame(20);
  assert.equal(game().campaignNode(), 4);
  game().advanceGame(14.99);
  assert.doesNotMatch(game().statusText(), /Boss signal detected/);
  game().advanceGame(0.01);
  assert.match(game().statusText(), /Boss signal detected/);
});

test('Campaign mini stages do not inherit the legacy seven-second global wave clock', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().startCampaign();
  game().advanceGame(12);
  assert.equal(game().campaignNode(), 0);
  assert.equal(game().waveState().active, 0, 'the legacy wave trigger at 12 seconds must stay outside Campaign');
});

test('campaign Boss victory is saved as a receipt; reload and acknowledgment gate World 2', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const game = bootGame(storage);
  game().startCampaign();
  for (let node = 0; node < 5; node++) game().advanceGame(20);
  game().advanceGame(0.016);
  game().forceCampaignBoss();
  game().advanceGame(0);
  assert.equal(game().state, 'campaignSettlement');
  assert.equal(game().meta.campaign.pendingSettlement.id, 'world:0:boss');
  assert.equal(game().meta.campaign.checkpoint.world, 1);
  assert.equal(game().meta.campaign.completed, 0);
  const reloaded = bootGame(storage);
  assert.equal(reloaded().state, 'campaignSettlement');
  reloaded().setNow(1700);
  reloaded().drawFrame(1700);
  reloaded().accessibleActions.find(button => button.dataset.action === 'continue').click();
  assert.equal(reloaded().state, 'play');
  assert.equal(reloaded().runKind(), 'campaign');
  assert.equal(reloaded().campaignWorld(), 1);
  assert.equal(reloaded().meta.campaign.pendingSettlement, null);
  assert.equal(reloaded().meta.campaign.checkpoint.world, 1);
  assert.equal(reloaded().meta.campaign.runs, 1);
});

test('fatal outcome in the Boss defeat frame prevents campaign victory settlement', () => {
  const values = new Map();
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  game().startCampaign();
  for (let node = 0; node < 5; node++) game().advanceGame(20);
  game().advanceGame(0.016);
  game().forceCampaignBoss();
  game().forceFatal();
  game().advanceGame(0);
  assert.equal(game().state, 'over');
  assert.equal(game().meta.campaign.worlds[0].boss, 0);
  assert.equal(game().meta.campaign.pendingSettlement, null);
  assert.equal(game().meta.campaign.checkpoint.node, 5);
});

test('failed Boss settlement write freezes victory until Retry Save commits the receipt', () => {
  const values = new Map();
  let failMainWrite = false;
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (key === api.META_KEY && failMainWrite) throw new Error('temporary storage failure');
    values.set(key, String(value));
  } };
  const game = bootGame(storage);
  game().startCampaign();
  for (let node = 0; node < 5; node++) game().advanceGame(20);
  game().advanceGame(0.016);
  const durableBeforeBoss = plain(api.decodeMeta(values.get(api.META_KEY)).meta);
  failMainWrite = true;
  game().forceCampaignBoss();
  game().advanceGame(0);
  assert.equal(game().state, 'campaignSaveError');
  assert.equal(game().meta.campaign.worlds[0].boss, 0);
  assert.equal(plain(api.decodeMeta(values.get(api.META_KEY)).meta).campaign.pendingSettlement, null);
  assert.equal(game().meta.campaign.checkpoint.node, durableBeforeBoss.campaign.checkpoint.node);
  assert.equal(game().sv(), false);
  assert.equal(game().readOnly, true, 'an unrelated save attempt can place the game into read-only recovery');
  failMainWrite = false;
  game().accessibleActions.find(button => button.dataset.action === 'retry-save').click();
  assert.equal(game().state, 'campaignSettlement');
  assert.equal(game().readOnly, false, 'a successful retry restores writes for the committed settlement');
  assert.equal(game().meta.campaign.worlds[0].boss, 1);
  assert.equal(game().meta.campaign.pendingSettlement.id, 'world:0:boss');
  assert.equal(game().acknowledgeCampaignSettlement(), true);
  assert.equal(game().state, 'play');
  assert.equal(game().campaignWorld(), 1);
});

test('failed mini clear write freezes the node and Retry Save commits before simulation resumes', () => {
  const values = new Map();
  let failMainWrite = false;
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (key === api.META_KEY && failMainWrite) throw new Error('temporary storage failure');
    values.set(key, String(value));
  } };
  const game = bootGame(storage);
  game().startCampaign();
  failMainWrite = true;
  game().advanceGame(20);
  assert.equal(game().state, 'campaignSaveError');
  assert.equal(game().meta.campaign.checkpoint.node, 0);
  assert.equal(game().meta.campaign.worlds[0].mini, 0);
  failMainWrite = false;
  game().accessibleActions.find(button => button.dataset.action === 'retry-save').click();
  assert.equal(game().state, 'play');
  assert.equal(game().meta.campaign.checkpoint.node, 1);
  assert.equal(game().meta.campaign.worlds[0].mini, 1);
});

test('v1 backup failure leaves the original save bytes untouched', () => {
  const raw = JSON.stringify({ version: 1, data: { c: 19 } });
  const values = new Map([[api.META_KEY, raw]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (key === api.META_BACKUP_KEY) throw new Error('backup denied');
    values.set(key, value);
  } };
  const state = plain(api.decodeMeta(raw));
  assert.equal(api.writeMeta(storage, state.meta, raw), false);
  assert.equal(values.get(api.META_KEY), raw);
});

test('v1 migration refuses to overwrite a different existing backup and preserves both original values', () => {
  const raw = JSON.stringify({ version: 1, data: { c: 19 } });
  const priorBackup = 'unrelated-backup-bytes';
  const values = new Map([[api.META_KEY, raw], [api.META_BACKUP_KEY, priorBackup]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const state = plain(api.decodeMeta(raw));
  assert.equal(api.writeMeta(storage, state.meta, raw), false);
  assert.equal(values.get(api.META_KEY), raw);
  assert.equal(values.get(api.META_BACKUP_KEY), priorBackup);
});

test('v1 migration keeps exact source and backup when the main v2 write fails', () => {
  const raw = JSON.stringify({ version: 1, data: { c: 29, lv: [{ cl: 1, sc: 77 }] } });
  const values = new Map([[api.META_KEY, raw]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (key === api.META_KEY) throw new Error('main write denied');
    values.set(key, value);
  } };
  const state = plain(api.decodeMeta(raw));
  assert.equal(api.writeMeta(storage, state.meta, raw), false);
  assert.equal(values.get(api.META_KEY), raw);
  assert.equal(values.get(api.META_BACKUP_KEY), raw);
});

test('game startup backs up a valid v1 save before writing the v2 envelope', () => {
  const today = new Date().toISOString().slice(0, 10);
  const levels = Array.from({ length: 12 }, (_, i) => ({ cl: i % 2, sc: 200 + i, c: i, k: 1, b: 0, g: 40 + i }));
  const raw = JSON.stringify({ version: 1, data: { c: 99, ld: today, ms: { d: today, p: [1, 2, 3], c: [0, 1, 0] }, lv: levels } });
  const values = new Map([[api.META_KEY, raw]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const game = bootGame(storage);
  assert.equal(game().readOnly, false);
  assert.equal(values.get(api.META_BACKUP_KEY), raw);
  const saved = JSON.parse(values.get(api.META_KEY));
  assert.equal(saved.version, 2);
  assert.equal(saved.data.c, 99);
  assert.deepEqual(plain(saved.data.lv), levels);
  assert.equal(plain(api.decodeMeta(values.get(api.META_KEY))).meta.campaign.worlds.length, 12);
});

test('failed v1 backup leaves the source read-only and keeps exact bytes exportable', () => {
  const today = new Date().toISOString().slice(0, 10);
  const raw = JSON.stringify({ version: 1, data: { c: 99, ld: today, ms: { d: today, p: [0, 0, 0], c: [0, 0, 0] } } });
  const values = new Map([[api.META_KEY, raw]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (key === api.META_BACKUP_KEY) throw new Error('backup denied');
    values.set(key, value);
  } };
  const game = bootGame(storage);
  assert.equal(game().readOnly, true);
  assert.match(game().reason, /backup failed/);
  assert.equal(values.get(api.META_KEY), raw);
  assert.equal(api.exportPayload(game().recoveryRaw(), game().meta), raw);
});

test('six-record saves remain unchanged while version 1 accepts twelve level records', () => {
  const oldLevels = Array.from({ length: 6 }, (_, i) => ({ cl: i < 3 ? 1 : 0, sc: 1000 + i, c: i, k: i + 2, b: i % 2, g: 80 + i }));
  const old = plain(api.decodeMeta(JSON.stringify({ version: api.META_VERSION, data: { lv: oldLevels } })));
  assert.equal(old.reason, '');
  assert.deepEqual(old.meta.lv, oldLevels);
  const expandedLevels = [...oldLevels, ...Array.from({ length: 6 }, (_, i) => ({ cl: 0, sc: i * 10, c: 0, k: 0, b: 0, g: 0 }))];
  const expanded = plain(api.decodeMeta(JSON.stringify({ version: api.META_VERSION, data: { lv: expandedLevels } })));
  assert.equal(expanded.reason, '');
  assert.deepEqual(expanded.meta.lv, expandedLevels);
  const unsupported = plain(api.decodeMeta(JSON.stringify({ version: api.META_VERSION, data: { lv: [...expandedLevels, expandedLevels[0]] } })));
  assert.match(unsupported.reason, /level records/);
});

test('malformed JSON and invalid fields remain available for recovery', () => {
  for (const raw of ['{bad json', JSON.stringify({ c: -1 }), JSON.stringify({ u: 'broken' }), JSON.stringify({ ms: { d: '2026-02-31', p: [0, 0, 0], c: [0, 0, 0] } })]) {
    const result = plain(api.decodeMeta(raw));
    assert.notEqual(result.reason, '');
    assert.equal(result.recoveryRaw, raw);
    assert.equal(result.meta.c, 0);
  }
});

test('future save versions are preserved rather than overwritten', () => {
  const raw = JSON.stringify({ version: api.META_VERSION + 1, data: { c: 900 } });
  const result = plain(api.decodeMeta(raw));
  assert.match(result.reason, /version/);
  assert.equal(result.recoveryRaw, raw);
});

test('export preserves invalid raw data and emits versioned JSON for a valid in-memory save', () => {
  const raw = '{preserve exactly';
  assert.equal(api.exportPayload(raw, plain(api.emptyMeta())), raw);
  const current = JSON.parse(api.exportPayload(null, { c: 8 }));
  assert.equal(current.version, api.META_VERSION);
  assert.equal(current.data.c, 8);
});

test('storage read and write failures fall back without throwing', () => {
  const unreadable = { getItem() { throw new Error('denied'); } };
  const read = plain(api.readMeta(unreadable));
  assert.equal(read.reason, 'Storage unavailable');
  assert.equal(read.meta.c, 0);

  const unwritable = { setItem() { throw new Error('quota'); } };
  assert.equal(api.writeMeta(unwritable, plain(api.emptyMeta())), false);
});

test('legacy save writes back with the current explicit schema version', () => {
  let storedKey;
  let storedValue;
  const storage = { setItem(key, value) { storedKey = key; storedValue = value; } };
  const state = plain(api.decodeMeta(JSON.stringify({ c: 19 })).meta);
  assert.equal(api.writeMeta(storage, state), true);
  assert.equal(storedKey, api.META_KEY);
  const saved = JSON.parse(storedValue);
  assert.equal(saved.version, api.META_VERSION);
  assert.equal(saved.data.c, 19);
});

test('corrupt save keeps the game playable and blocks overwriting the original bytes', () => {
  const original = '{not valid save';
  const values = new Map([[api.META_KEY, original]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const game = bootGame(storage);
  assert.equal(game().readOnly, true);
  assert.equal(game().state, 'menu');
  game().sv();
  game().start(0);
  assert.equal(game().state, 'play');
  assert.equal(values.get(api.META_KEY), original);
});

test('storage exceptions do not prevent the game from reaching its menu', () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const game = bootGame(storage);
  assert.equal(game().state, 'menu');
  assert.equal(game().readOnly, true);
  game().start(0);
  assert.equal(game().state, 'play');
  assert.doesNotThrow(() => game().sv());
});

test('a blocked localStorage property keeps the game playable without writing or replacing saves', () => {
  const game = bootGame(null, { storageGetterThrows: true });
  assert.equal(game().state, 'menu');
  assert.equal(game().readOnly, true);
  assert.match(game().reason, /Storage unavailable/);
  assert.doesNotThrow(() => game().start(0));
  assert.equal(game().state, 'play');
  assert.equal(game().sv(), false);
  assert.doesNotThrow(() => game().advanceSkin());
});

test('reduced motion removes decorative movement and skips the death slow-motion delay', () => {
  const storage = { getItem: () => null, setItem() {} };
  const reduced = bootGame(storage, { reducedMotion: true });
  assert.equal(reduced().reducedMotion(), true);
  assert.equal(reduced().motion(16), 0);
  reduced().start(0);
  reduced().hit(); reduced().hit(); reduced().hit();
  assert.equal(reduced().state, 'over');
  assert.equal(reduced().deathSlowdown(), 0);

  const standard = bootGame(storage);
  assert.equal(standard().reducedMotion(), false);
  assert.equal(standard().motion(16), 16);
  standard().start(0);
  standard().hit(); standard().hit(); standard().hit();
  assert.equal(standard().state, 'play');
  assert.equal(standard().deathSlowdown(), 1.1);
});

test('reduced motion preference changes take effect while the page remains open', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().start(0);
  game().hit(); game().hit(); game().hit();
  assert.equal(game().deathSlowdown(), 1.1);
  game().mediaEvents.get('change')({ matches: true });
  assert.equal(game().reducedMotion(), true);
  assert.equal(game().deathSlowdown(), 0);
  assert.equal(game().state, 'over');
});

test('canvas has a visible keyboard focus indicator using the established gold focus color', () => {
  assert.match(source, /canvas:focus-visible\{outline:2px solid #ffd23f/);
});

test('normal and daily runs start, pause, resume, end, and retry', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const game = bootGame(storage);
  game().start(0);
  assert.equal(game().state, 'play');
  game().pause();
  assert.equal(game().state, 'pause');
  game().pause();
  assert.equal(game().state, 'play');
  game().end();
  assert.equal(game().state, 'over');
  game().start(0);
  assert.equal(game().state, 'play');
  game().start(1);
  assert.equal(game().state, 'play');
});

test('blur clears held keyboard movement and pauses active play', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().start(0);
  game().windowEvents.get('keydown')({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(game().keys()[0], 1);
  game().windowEvents.get('blur')();
  assert.deepEqual(plain(game().keys().slice(0, 2)), [0, 0]);
  assert.equal(game().keys()[2], null);
  assert.equal(game().state, 'pause');
});

test('pointer cancellation and hidden-page transitions release movement and drag state', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().start(0);
  const down = game().canvasEvents.get('pointerdown');
  down({ preventDefault() {}, pointerId: 1, clientX: 100, clientY: 200 });
  assert.notEqual(game().keys()[2], null);
  game().canvasEvents.get('pointercancel')({ pointerId: 1 });
  assert.equal(game().keys()[2], null);

  game().windowEvents.get('keydown')({ key: 'ArrowRight', preventDefault() {} });
  game().page.hidden = true;
  game().documentEvents.get('visibilitychange')();
  assert.deepEqual(plain(game().keys().slice(0, 2)), [0, 0]);
  assert.equal(game().keys()[2], null);
  assert.equal(game().state, 'pause');
});

test('touch drag is owned by one pointer and unrelated pointer endings cannot release it', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().start(0);
  const down = game().canvasEvents.get('pointerdown');
  game().meta.k[0] = 1;
  const event = (pointerId, clientX, clientY = 200) => ({ preventDefault() {}, pointerId, pointerType: 'touch', clientX, clientY });
  down(event(11, 100));
  const { S } = game().geometry();
  const owner = game().keys()[2];
  assert.equal(owner.id, 11);
  const skill = game().skillPosition(0);
  down(event(22, S * skill.x, S * skill.y));
  assert.ok(game().cooldowns()[0] > 0, 'a second finger can activate a skill while steering');
  assert.equal(game().keys()[2].id, 11, 'a second finger cannot steal the active drag');
  game().canvasEvents.get('pointermove')(event(22, 210));
  assert.equal(game().steeringTarget(), owner.p, 'a non-owning finger cannot change the active steering target');
  game().canvasEvents.get('pointermove')(event(11, 150));
  assert.ok(Math.abs(game().steeringTarget() - (owner.p + 50 / S)) < 1e-9, 'the owning finger keeps steering by its drag offset in logical Canvas units');
  game().canvasEvents.get('pointerup')({ pointerId: 22 });
  game().canvasEvents.get('pointercancel')({ pointerId: 22 });
  game().canvasEvents.get('lostpointercapture')({ pointerId: 22 });
  assert.equal(game().keys()[2].id, 11, 'ending a non-owner pointer leaves steering active');
  game().canvasEvents.get('pointercancel')({ pointerId: 11 });
  assert.equal(game().keys()[2], null, 'the owner cancel releases its drag');
});

test('native DOM button keys do not also trigger game shortcuts and repeated toggles are ignored', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const startButton = game().accessibleActions.find(button => button.dataset.action === 'start');
  const keydown = game().windowEvents.get('keydown');
  keydown({ key: 'Enter', target: { tagName: 'BUTTON' }, preventDefault() {} });
  keydown({ key: ' ', target: { tagName: 'BUTTON' }, preventDefault() {} });
  assert.equal(game().state, 'menu', 'button activation keys must not reach the global game listener');
  startButton.click();
  assert.equal(game().state, 'play');
  keydown({ key: 'p', target: game().canvas, preventDefault() {}, repeat: false });
  assert.equal(game().state, 'pause');
  keydown({ key: 'p', target: game().canvas, preventDefault() {}, repeat: true });
  assert.equal(game().state, 'pause', 'holding a state-toggle key cannot immediately undo the first press');
});

test('resize recalculates finite canvas geometry and keeps the ship inside the play lane', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const canvas = game().canvas;
  canvas.clientWidth = 320;
  canvas.clientHeight = 480;
  game().windowEvents.get('resize')();
  const g = game().geometry();
  assert.ok(Number.isFinite(g.S) && g.S > 0);
  assert.ok(Number.isFinite(g.W) && Number.isFinite(g.H));
  assert.ok(g.dpr <= 2);
  assert.equal(g.canvasWidth, 320 * g.dpr);
  assert.equal(g.canvasHeight, 480 * g.dpr);
  assert.ok(g.x >= g.ox + 14 && g.x <= g.ox + g.PW - 14);
});

test('accessible DOM controls can start a run, reach settings, and change preferences', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const action = name => game().accessibleActions.find(button => button.dataset.action === name);
  const setting = name => game().accessibleSettings.find(button => button.dataset.setting === name);
  action('start').click();
  assert.equal(game().state, 'play');
  game().refreshAccessibleControls();
  assert.equal(action('settings').disabled, true);
  action('pause').click();
  assert.equal(game().state, 'pause');
  game().refreshAccessibleControls();
  action('settings').click();
  assert.equal(game().state, 'set');
  game().refreshAccessibleControls();
  assert.equal(setting('5').disabled, false);
  setting('5').click();
  assert.equal(game().meta.s.cb, 1);
  assert.equal(setting('5').attributes['aria-pressed'], 'true');
  assert.match(setting('5').textContent, /Colorblind colors on/);
  assert.match(game().statusText(), /Colorblind colors on/);
  action('menu').click();
  assert.equal(game().state, 'menu');
});

test('accessible controls complete shop purchases, skill activation, and level navigation', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const game = bootGame(storage);
  const action = name => game().accessibleActions.find(button => button.dataset.action === name);
  game().meta.c = 5000;
  game().sv();
  action('shop').click();
  game().drawFrame(16);
  assert.equal(game().state, 'shop');
  for (let i = 0; i < 3; i++) action('shop-next').click();
  assert.equal(game().shopPage(), 3);
  const pulse = game().accessibleSkillBuys[0];
  assert.equal(pulse.disabled, false);
  pulse.click();
  assert.equal(game().meta.k[0], 1);
  assert.equal(game().meta.c, 2750);
  assert.equal(pulse.disabled, true, 'an owned skill cannot be purchased twice');
  const saved = JSON.parse(values.get('neon-drift-meta'));
  assert.equal(saved.version, api.META_VERSION);
  assert.equal(saved.data.k[0], 1);
  const reloaded = bootGame(storage);
  assert.equal(reloaded().meta.k[0], 1);
  assert.equal(reloaded().meta.c, 2750);

  action('shop-prev').click(); action('shop-prev').click(); action('shop-prev').click();
  assert.equal(game().shopPage(), 0);
  const magnet = game().accessibleUpgrades[0];
  assert.equal(magnet.disabled, false);
  magnet.click();
  assert.equal(game().meta.u[0], 1);
  assert.equal(game().meta.c, 2630);
  game().meta.c = 0;
  game().refreshAccessibleControls();
  assert.equal(magnet.disabled, true, 'insufficient credits disable the purchase');
  magnet.click();
  assert.equal(game().meta.u[0], 1);
  assert.equal(game().meta.c, 0);

  action('menu').click();
  game().drawFrame(32);
  action('start').click();
  game().drawFrame(48);
  assert.equal(game().state, 'play');
  const usePulse = game().accessibleSkills[0];
  assert.equal(usePulse.disabled, false);
  usePulse.click();
  assert.ok(game().cooldowns()[0] > 0);
  assert.equal(usePulse.disabled, true, 'a skill enters cooldown after one activation');

  action('menu').click();
  game().drawFrame(64);
  action('levels').click();
  game().drawFrame(80);
  assert.equal(game().state, 'lv');
  action('level-next').click();
  assert.equal(game().levelPage(), 1);
  action('level-prev').click();
  assert.equal(game().levelPage(), 0);
  for (let i = 0; i < 12; i++) action('level-next').click();
  assert.equal(game().levelPage(), 0, 'level navigation wraps after twelve entries');
  assert.match(action('level-prev').textContent, /1 of 12/);
  action('level-prev').click();
  assert.equal(game().levelPage(), 11);
  assert.match(game().statusText(), /Level 12 of 12/);
});

test('boss continue is state guarded and becomes available after its presentation delay', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const action = name => game().accessibleActions.find(button => button.dataset.action === name);
  game().prepareWin();
  assert.equal(action('continue').disabled, true);
  game().setNow(1701);
  game().drawFrame(1717);
  assert.equal(action('continue').disabled, false, `ready=${game().winReady()} elapsed=${game().elapsed()}`);
  assert.match(game().statusText(), /Boss 1 down.*300 score and 40 credits/);
  action('continue').click();
  assert.equal(game().state, 'play');
  assert.equal(action('continue').disabled, true);
});

test('first-run guidance matches live controls and results announce an accurate one-time summary', () => {
  assert.match(source, /Collect cyan orbs and dodge pink hazards/);
  assert.match(source, /1–4 skills · P or Esc pauses/);
  assert.match(source, /Skills: 1–4 in play/);
  assert.match(source, /Cyan = collect · Pink = dodge/);
  assert.match(source, /\.accessible-controls button\{min-height:34px/);
  assert.match(source, /border-radius:10px;text-align:left/);
  assert.match(source, /safe-area-inset-left/);
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().start(0);
  game().end();
  const runs = game().meta.g;
  const coins = game().meta.c;
  game().end();
  assert.equal(game().meta.g, runs, 'ending an already completed run cannot count it twice');
  assert.equal(game().meta.c, coins);
  game().drawFrame(16);
  assert.match(game().statusText(), /Run complete\. Score 0\..*Earned 0 credits\. Time 0:00\. Level 1/);
});

test('every gameplay hazard visibly marks its full rectangular collision bounds', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  for (let theme = 0; theme < 12; theme++) {
    game().clearCanvasCalls();
    game().drawHazard(theme);
    const bounds = game().canvasCalls().filter(call => call.name === 'strokeRect').map(call => call.args);
    assert.ok(bounds.some(rect => JSON.stringify(rect) === JSON.stringify([100, 80, 38, 30])),
      `theme ${theme + 1} draws a visible danger edge at the actual x/y/w/h collision bounds`);
    assert.ok(game().canvasCalls().some(call => call.name === 'fillRect' && JSON.stringify(call.args) === JSON.stringify([100, 80, 38, 30])),
      `theme ${theme + 1} shades the full danger area beneath its motif`);
  }
});

test('all twelve visual themes and level cards render and the standard death slow-motion path ends once and retries', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  let time = 16;
  const data = game().levelData();
  assert.equal(data.themes.length, 12);
  assert.deepEqual(plain(data.themes.slice(0, 6).map(theme => theme[0])), ['NEON GRID','DEEP SPACE','SOLAR STORM','CRYSTAL CAVES','VOID RIFT','AURORA']);
  assert.equal(new Set(data.themes.map(theme => theme[0])).size, 12);
  assert.equal(data.lore.length, 12);
  assert.equal(new Set(data.lore).size, 12);
  assert.equal(data.obstacles.length, 12);
  assert.equal(data.bosses.length, 12);
  assert.equal(data.hints.length, 12);
  assert.equal(new Set(data.hints).size, 12);
  assert.ok(data.obstacles.every(level => level.length === 3));
  assert.ok(data.bosses.every(level => level.length === 2));
  assert.ok(data.themes.every(theme => /^#[0-1]/.test(theme[1]) && /^#[0-3]/.test(theme[3])));
  for (let theme = 0; theme < 12; theme++) {
    game().start(0);
    game().setTheme(theme);
    assert.doesNotThrow(() => game().drawFrame(time += 16), `theme ${theme} first frame`);
    assert.equal(game().themeIndex(), theme, `gameplay frame uses theme ${theme}`);
    assert.doesNotThrow(() => game().drawFrame(time += 16), `theme ${theme} second frame`);
    game().setGalleryLevel(theme);
    assert.doesNotThrow(() => game().drawFrame(time += 16), `level card ${theme + 1}`);
    assert.doesNotThrow(() => game().drawHazard(theme), `hazard silhouette ${theme + 1}`);
    assert.doesNotThrow(() => game().drawOrbMark(theme), `pickup motif ${theme + 1}`);
    assert.equal(game().levelPage(), theme);
    assert.equal(game().state, 'lv');
  }
  game().start(0);
  game().hit(); game().hit(); game().hit();
  assert.equal(game().deathSlowdown(), 1.1);
  for (let i = 0; i < 30 && game().state === 'play'; i++) game().drawFrame(time += 50);
  assert.equal(game().state, 'over');
  assert.equal(game().meta.g, 1);
  const retry = game().accessibleActions.find(button => button.dataset.action === 'retry');
  assert.equal(retry.disabled, true);
  game().setNow(1701);
  game().drawFrame(time += 16);
  assert.equal(retry.disabled, false);
  retry.click();
  assert.equal(game().state, 'play');
});

test('25-second boundaries switch levels at the exact time and preserve the twelve-stage campaign limit', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  assert.equal(game().levelDuration(), 25);
  assert.equal(game().campaignDuration(), 300);
  game().start(0);
  game().prepareStage(24.99, 0);
  game().advanceGame(0);
  assert.equal(game().stageIndex(), 0);
  assert.equal(game().stageRecords()[0]?.cl || 0, 0);
  game().advanceGame(0.02);
  assert.equal(game().stageIndex(), 1);
  assert.equal(game().stageRecords()[0].cl, 1);
  game().prepareStage(25, 1);
  game().advanceGame(0);
  assert.equal(game().stageIndex(), 1, '25.00 seconds belongs to stage 2');

  game().prepareStage(49.99, 1);
  game().advanceGame(0);
  assert.equal(game().stageIndex(), 1);
  game().advanceGame(0.02);
  assert.equal(game().stageIndex(), 2);
  assert.equal(game().stageRecords()[1].cl, 1);
  game().prepareStage(50, 2);
  game().advanceGame(0);
  assert.equal(game().stageIndex(), 2, '50.00 seconds belongs to stage 3');
});

test('25-second stage and 300-second campaign boundaries apply to every difficulty and daily mode', () => {
  for (const difficulty of [0, 1, 2]) for (const mode of [0, 1]) {
    const game = bootGame({ getItem: () => null, setItem() {} });
    game().setDifficulty(difficulty);
    game().start(mode);
    game().prepareStage(24.99, 0);
    game().advanceGame(0);
    assert.equal(game().stageIndex(), 0, `difficulty ${difficulty}, mode ${mode}: stage 1 holds before 25s`);
    game().advanceGame(0.02);
    assert.equal(game().stageIndex(), 1, `difficulty ${difficulty}, mode ${mode}: stage 2 starts after 25s`);
    game().prepareStage(299.99, 11);
    game().advanceGame(0);
    assert.equal(game().stageProgress().campaignClear, false);
    game().advanceGame(0.02);
    assert.equal(game().stageProgress().campaignClear, true, `difficulty ${difficulty}, mode ${mode}: campaign clears at 300s`);
    assert.equal(game().stageRecords().length, 12, `difficulty ${difficulty}, mode ${mode}: no extra level record`);
    game().prepareStage(300, 11);
    game().advanceGame(0);
    assert.equal(game().stageProgress().campaignClear, true, `difficulty ${difficulty}, mode ${mode}: exact 300s boundary clears`);
  }
});

test('stage cues announce once on first start and on each 25-second transition', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  game().start(0);
  game().drawFrame(16);
  assert.match(game().statusText(), /Game started at level 1 of 12\. NEON GRID\. Follow the grid/);

  game().prepareStage(25, 0);
  game().advanceGame(0);
  assert.match(game().statusText(), /Level 2 of 12\. DEEP SPACE\. Cross the starfield/);
  const message = game().statusText();
  game().advanceGame(0);
  assert.equal(game().statusText(), message, 'a stationary stage update does not reannounce its cue');
});

test('theme motifs remain presentation-only and ordinary objects retain their creation theme', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  for (let theme = 0; theme < 12; theme++) {
    game().prepareSpawnTheme(theme);
    game().setRandom(0.55);
    const baseSpeed = game().gameSpeed();
    game().spawnForLevel();
    const object = game().objects().at(-1);
    assert.equal(object.k, 'h', `theme ${theme + 1} keeps the same deterministic obstacle category`);
    assert.equal(object.theme, theme, `theme ${theme + 1} tags its spawned object for stable drawing`);
    assert.equal(game().randomCalls(), [4,6,10].includes(theme) ? 5 : 4, `theme ${theme + 1} decoration adds no random calls`);
    const { ox, PW } = game().geometry();
    const width = 22 + 0.55 * 34;
    const expected = { k: 'h', x: ox + 0.55 * (PW - width), y: -40, w: width, h: width * 0.8,
      v: baseSpeed * (0.85 + 0.55 * 0.4) * ([2,8].includes(theme) ? 1.12 : 1),
      vx: [4,6,10].includes(theme) ? (0.55 - 0.5) * 70 : 0, theme };
    assert.deepEqual(plain(object), plain(expected), `theme ${theme + 1} preserves deterministic spawn geometry and speed`);
    game().drawHazard(theme);
    game().drawOrbMark(theme);
    assert.equal(object.theme, theme);

    game().setRandom(0.1);
    game().spawnForLevel();
    const pickup = game().objects().at(-1);
    assert.deepEqual(plain(pickup), plain({ k: 'o', x: ox + 20 + 0.1 * (PW - 40), y: -20, r: 10, v: baseSpeed * 0.9, theme }),
      `theme ${theme + 1} keeps the deterministic pickup and reward object unchanged`);
    assert.equal(game().randomCalls(), 2, `theme ${theme + 1} pickup detail adds no random calls`);

    game().setTheme((theme + 1) % 12);
    game().drawFrame(100 + theme * 16);
    assert.equal(object.theme, theme, `theme ${theme + 1} obstacle retains its source motif after a stage change`);
    assert.equal(pickup.theme, theme, `theme ${theme + 1} pickup retains its source motif after a stage change`);
  }
});

test('added theme backgrounds stay drawable with reduced motion and the existing high-contrast setting', () => {
  const reduced = bootGame({ getItem: () => null, setItem() {} }, { reducedMotion: true });
  assert.equal(reduced().motion(20), 0);
  reduced().accessibleActions.find(button => button.dataset.action === 'settings').click();
  reduced().drawFrame(16);
  reduced().accessibleSettings[6].click();
  assert.equal(reduced().meta.s.hc, 1);
  reduced().accessibleActions.find(button => button.dataset.action === 'menu').click();
  reduced().start(0);
  for (let theme = 0; theme < 12; theme++) {
    reduced().setTheme(theme);
    assert.doesNotThrow(() => reduced().drawFrame(32 + theme * 16), `reduced-motion theme ${theme}`);
    assert.doesNotThrow(() => reduced().drawHazard(theme), `high-contrast hazard motif ${theme + 1}`);
    assert.doesNotThrow(() => reduced().drawOrbMark(theme), `high-contrast pickup motif ${theme + 1}`);
    reduced().setGalleryLevel(theme);
    assert.doesNotThrow(() => reduced().drawFrame(48 + theme * 16), `high-contrast card ${theme}`);
  }
});

test('twelve-stage campaign unlocks sequentially, keeps old records, and caps its endless tail', () => {
  const oldLevels = Array.from({ length: 6 }, (_, i) => ({ cl: 1, sc: 1000 + i, c: 20 + i, k: 2, b: 1, g: 500 + i }));
  let raw = JSON.stringify({ version: api.META_VERSION, data: { lv: oldLevels, bl: 6 } });
  const storage = { getItem: key => key === api.META_KEY ? raw : null, setItem(key, value) { if (key === api.META_KEY) raw = value; } };
  const game = bootGame(storage);
  game().start(0);
  assert.equal(game().isLevelUnlocked(0), true);
  assert.equal(game().isLevelUnlocked(6), true, 'the previous save already cleared level 6');
  for (let completedIndex = 0; completedIndex < 11; completedIndex++) {
    game().prepareStage((completedIndex + 1) * 25 - 0.01, completedIndex);
    game().advanceGame(0.02);
    assert.equal(game().stageIndex(), completedIndex + 1);
    assert.equal(game().stageRecords()[completedIndex].cl, 1);
    if (completedIndex >= 6 && completedIndex < 10) {
      assert.equal(game().isLevelUnlocked(completedIndex + 1), true);
      assert.equal(game().isLevelUnlocked(completedIndex + 2), false);
    }
    if (completedIndex === 6) {
      const persisted = plain(api.decodeMeta(raw));
      assert.equal(persisted.reason, '');
      assert.equal(persisted.meta.lv[6].cl, 1, 'new level progress is saved at the boundary, before the run ends');
    }
  }
  assert.equal(game().meta.bl, 12);
  assert.equal(game().stageRecords().length, 11);
  assert.deepEqual(plain(game().stageRecords().slice(0, 6).map(level => level.sc)), oldLevels.map(level => level.sc));
  game().prepareStage(299.99, 11);
  game().advanceGame(0);
  assert.equal(game().stageProgress().campaignClear, false);
  game().advanceGame(0.02);
  assert.equal(game().stageProgress().campaignClear, true);
  assert.equal(game().stageRecords()[11].cl, 1);
  game().advanceGame(0.05);
  assert.equal(game().stageIndex(), 11);
  assert.equal(game().stageRecords().length, 12);
  game().end();
  const saved = plain(api.decodeMeta(raw));
  assert.equal(saved.reason, '');
  assert.equal(saved.meta.lv.length, 12);
  assert.deepEqual(saved.meta.lv.slice(0, 6).map(level => level.sc), oldLevels.map(level => level.sc));
});

test('the first level is open by default and each next level opens only after its predecessor is cleared', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  assert.equal(game().isLevelUnlocked(0), true);
  assert.equal(game().isLevelUnlocked(1), false);
  game().start(0);
  game().prepareStage(24.99, 0);
  game().advanceGame(0.02);
  assert.equal(game().isLevelUnlocked(1), true);
  assert.equal(game().isLevelUnlocked(2), false);
});

test('unlocked and cleared later-level gallery cards render from saved progress', () => {
  const game = bootGame({ getItem: () => null, setItem() {} });
  const records = game().meta.lv;
  records[5] = { cl: 1, sc: 700, c: 12, k: 2, b: 1, g: 300 };
  assert.equal(game().isLevelUnlocked(6), true);
  game().setGalleryLevel(6);
  assert.doesNotThrow(() => game().drawFrame(16), 'level 7 unlocked card');

  records[6] = { cl: 1, sc: 900, c: 15, k: 3, b: 1, g: 420 };
  assert.equal(game().isLevelUnlocked(6), true);
  game().setGalleryLevel(6);
  assert.doesNotThrow(() => game().drawFrame(32), 'level 7 cleared card');
});

test('ship color button cycles the five core style-guide colorways without score gates', () => {
  const values = new Map([['neon-drift-best', '0']]);
  const game = bootGame({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) });
  const expected = [
    ['Ember', '#ff9f43'], ['Mint', '#5dffb0'], ['Violet', '#b46bff'], ['Gold', '#ffd23f'], ['Classic', '#e8f0ff'],
  ];
  const { S, W, H } = game().geometry();
  const shipButtonClick = game().canvasEvents.get('pointerdown');
  for (const [name, color] of expected) {
    shipButtonClick({ preventDefault() {}, pointerId: 1, clientX: S * W / 2, clientY: S * (H / 2 + 110) });
    assert.equal(game().skinName(), name);
    assert.equal(game().skinColor(), color);
    assert.match(game().accessibleActions.find(button => button.dataset.action === 'ship').textContent, new RegExp(name));
  }
  assert.equal(values.get('neon-drift-skin'), '0');

  game().meta.tb = 1;
  game().advanceSkin();
  assert.equal(game().skinName(), 'Ember');
  for (let i = 0; i < 4; i++) game().advanceSkin();
  assert.equal(game().skinName(), 'Rose');
});
