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

function bootGame(storage) {
  const windowEvents = new Map();
  const documentEvents = new Map();
  const canvasEvents = new Map();
  const register = (events, type, handler) => events.set(type, handler);
  const makeButtons = (kind, names) => names.map(name => {
    const handlers = new Map();
    return { dataset: { [kind]: name }, disabled: false,
      addEventListener: (type, handler) => handlers.set(type, handler),
      click() { if (!this.disabled) handlers.get('click')?.(); } };
  });
  const accessibleActions = makeButtons('action', ['start','daily','pause','retry','menu','ship','shop','levels','missions','stats','settings','difficulty','export']);
  const accessibleSettings = makeButtons('setting', ['0','1','2','3','4','5','6']);
  const canvasContext = {};
  const elements = {
    c: { clientWidth: 800, clientHeight: 600, getContext: () => canvasContext,
      addEventListener: (type, handler) => register(canvasEvents, type, handler),
      setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), focus() {} },
    'game-status': { textContent: '' },
  };
  const document = {
    getElementById: id => elements[id],
    addEventListener: (type, handler) => register(documentEvents, type, handler),
    querySelectorAll: selector => selector.includes('[data-action]') ? accessibleActions : accessibleSettings,
    fonts: { load: () => Promise.resolve() },
    createElement: () => ({ click() {} }),
  };
  const sandbox = {
    document, localStorage: storage, devicePixelRatio: 1, windowEvents, documentEvents, canvasEvents, accessibleActions, accessibleSettings,
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, handler) => register(windowEvents, type, handler), requestAnimationFrame() {},
    CanvasRenderingContext2D: function CanvasRenderingContext2D() {},
    performance: { now: () => 1000 },
  };
  vm.runInNewContext(`${inlineScript}\nglobalThis.probe=()=>({state:st,meta:M,readOnly:saveReadOnly,reason:saveReason,start,pause,end,sv,advanceSkin,ok,skin:()=>skin,skinName:()=>SK[skin][0],skinColor:()=>SK[skin][1],geometry:()=>({S,W,H}),refreshAccessibleControls,keys:()=>[kl,kr,drag],windowEvents,documentEvents,canvasEvents,accessibleActions,accessibleSettings});`, sandbox);
  return sandbox.probe;
}

test('inline game script parses without syntax errors', () => {
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 1, 'the standalone game should keep one inline script');
  const result = spawnSync(process.execPath, ['--check'], { input: scripts[0], encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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
