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
vm.runInNewContext(`${core}\nglobalThis.api={META_KEY,META_VERSION,emptyMeta,decodeMeta,readMeta,writeMeta,exportPayload};`, sandbox);
const api = sandbox.api;
const plain = value => JSON.parse(JSON.stringify(value));
const inlineScript = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]?.[1];

function bootGame(storage, { storageGetterThrows = false, reducedMotion = false } = {}) {
  const windowEvents = new Map();
  const documentEvents = new Map();
  const canvasEvents = new Map();
  const mediaEvents = new Map();
  const animationFrames = [];
  const register = (events, type, handler) => events.set(type, handler);
  const makeButtons = (kind, names) => names.map(name => {
    const handlers = new Map();
    return { dataset: { [kind]: name }, disabled: false,
      addEventListener: (type, handler) => handlers.set(type, handler),
      click() { if (!this.disabled) handlers.get('click')?.(); } };
  });
  const accessibleActions = makeButtons('action', ['start','daily','pause','retry','menu','ship','shop','levels','missions','stats','settings','difficulty','export']);
  const accessibleSettings = makeButtons('setting', ['0','1','2','3','4','5','6']);
  const canvasContext = new Proxy({
    measureText: value => ({ width: String(value).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const CanvasRenderingContext2D = function CanvasRenderingContext2D() {};
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
    configurable: true,
    get() { return this._shadowBlur || 0; },
    set(value) { this._shadowBlur = value; },
  });
  const elements = {
    c: { clientWidth: 800, clientHeight: 600, getContext: () => canvasContext,
      addEventListener: (type, handler) => register(canvasEvents, type, handler),
      setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), focus() {} },
    'game-status': { textContent: '' },
  };
  const document = {
    hidden: false,
    getElementById: id => elements[id],
    addEventListener: (type, handler) => register(documentEvents, type, handler),
    querySelectorAll: selector => selector.includes('[data-action]') ? accessibleActions : accessibleSettings,
    fonts: { load: () => Promise.resolve() },
    createElement: () => ({ click() {}, getContext: () => canvasContext }),
  };
  const sandbox = {
    document, devicePixelRatio: 1, windowEvents, documentEvents, canvasEvents, mediaEvents, animationFrames, accessibleActions, accessibleSettings,
    matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') && reducedMotion,
      addEventListener: (type, handler) => mediaEvents.set(type, handler),
      addListener: handler => mediaEvents.set('change', handler) }),
    addEventListener: (type, handler) => register(windowEvents, type, handler), requestAnimationFrame: callback => animationFrames.push(callback),
    CanvasRenderingContext2D,
    performance: { now: () => 1000 },
  };
  Object.defineProperty(sandbox, 'localStorage', { get() { if (storageGetterThrows) throw new Error('storage denied'); return storage; } });
  vm.runInNewContext(`${inlineScript}\nglobalThis.probe=()=>({state:st,meta:M,readOnly:saveReadOnly,reason:saveReason,start,pause,end,hit,sv,advanceSkin,ok,skin:()=>skin,skinName:()=>SK[skin][0],skinColor:()=>SK[skin][1],geometry:()=>({S,W,H,dpr,x:px,ox,PW,canvasWidth:cv.width,canvasHeight:cv.height}),canvas:cv,page:document,reducedMotion:()=>rm,motion,deathSlowdown:()=>dth,drawFrame:(time=16)=>frame(time),scheduledFrames:()=>animationFrames.length,refreshAccessibleControls,keys:()=>[kl,kr,drag],windowEvents,documentEvents,canvasEvents,mediaEvents,accessibleActions,accessibleSettings});`, sandbox);
  return sandbox.probe;
}

test('inline game script parses without syntax errors', () => {
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 1, 'the standalone game should keep one inline script');
  const result = spawnSync(process.execPath, ['--check'], { input: scripts[0], encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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
  game().end();
  render('over');
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
  game().canvasEvents.get('pointercancel')();
  assert.equal(game().keys()[2], null);

  game().windowEvents.get('keydown')({ key: 'ArrowRight', preventDefault() {} });
  game().page.hidden = true;
  game().documentEvents.get('visibilitychange')();
  assert.deepEqual(plain(game().keys().slice(0, 2)), [0, 0]);
  assert.equal(game().keys()[2], null);
  assert.equal(game().state, 'pause');
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
  action('menu').click();
  assert.equal(game().state, 'menu');
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
    shipButtonClick({ preventDefault() {}, pointerId: 1, clientX: S * W / 2, clientY: S * (H / 2 + 86) });
    assert.equal(game().skinName(), name);
    assert.equal(game().skinColor(), color);
  }
  assert.equal(values.get('neon-drift-skin'), '0');

  game().meta.tb = 1;
  game().advanceSkin();
  assert.equal(game().skinName(), 'Ember');
  for (let i = 0; i < 4; i++) game().advanceSkin();
  assert.equal(game().skinName(), 'Rose');
});
