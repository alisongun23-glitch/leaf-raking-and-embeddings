import { DEFAULT_CONFIG, mergeConfig, buildInstance } from '../analysis/instance.js';
import { ALGORITHMS, getAlgorithm, defaultParams } from '../algos/registry.js';
import { snapshot } from '../core/metrics.js';
import { articulationPoints } from '../core/safety.js';
import { frogDistance } from '../analysis/emst.js';
import { PILE, EMPTY } from '../core/kinds.js';
import { FIELD_DIALS, GOAL_DIALS, RAKER_DIALS, RULE_DIALS, SCORE_DIALS, TIME_DIALS, DISPLAY_DIALS, DEFAULT_DISPLAY } from './schema.js';
import { buildDials, buildParamDials, setPath, el } from './dials.js';
import { FieldView, fmt, fmtTime } from './render.js';
import { timeParts } from '../core/metrics.js';
import { isDataModel } from '../gen/processes.js';
import { dataset } from '../data/datasets.js';
import { loadPointTable } from '../data/parse.js';
import { renderReadouts, statusChip, reasonLabel } from './panels.js';
import { ManualPlay } from './manual.js';
import { BenchView } from './bench-view.js';
import { SweepView } from './sweep-view.js';

const $ = id => document.getElementById(id);
const STORE = 'rake-leaves-math:v1';
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(`${STORE}:${key}`)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(`${STORE}:${key}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------- share codes: the whole config as URL-safe base64 JSON
function encodeCfg(cfg) {
  const bytes = new TextEncoder().encode(JSON.stringify(cfg));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeCfg(code) {
  let s = code.trim().replace(/^.*#c=/, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
function normalise(cfg) {
  const c = mergeConfig(DEFAULT_CONFIG, cfg || {});
  if (!ALGORITHMS.some(a => a.id === c.algo.id)) c.algo.id = DEFAULT_CONFIG.algo.id;
  c.algo.params = { ...defaultParams(getAlgorithm(c.algo.id)), ...(c.algo.params || {}) };
  if (c.score.travel !== undefined && c.score.walk === undefined) c.score.walk = c.score.travel;
  delete c.score.travel;
  return c;
}
function initialConfig() {
  const hash = location.hash.match(/#c=([\w-]+)/);
  if (hash) { try { return normalise(decodeCfg(hash[1])); } catch { /* fall through */ } }
  return normalise(store.get('config'));
}

// ---------- state
const state = {
  cfg: initialConfig(),
  display: { ...DEFAULT_DISPLAY, ...(store.get('display') || {}) },
  tab: 'watch',
  inst: null,
  game: null,
  feas: null,
  lag: null,
  autoRun: store.get('autoRun') ?? true,
  run: { moves: [], cursor: 0, playing: false, metrics: null, pending: 0, ms: 0, algo: null },
  overlays: { trail: [], lastStroke: null, preview: null, hover: -1, cuts: null, unreachable: null },
  frog: 0,
  error: '',
  editPoints: false,
};

// ---------- workers (runs, bounds, benchmarks), each replaceable when superseded
let reqId = 0;
const makeWorker = onmsg => {
  const w = new Worker(new URL('../worker/runner.js', import.meta.url), { type: 'module' });
  w.onmessage = ({ data }) => onmsg(data);
  w.onerror = e => { state.error = `Worker error: ${e.message}`; refresh(); };
  return w;
};
let runWorker = null, boundWorker = null, benchWorker = null;
const onRunMsg = data => {
  if (data.type === 'run-done' && data.id === state.run.pending) {
    state.run.pending = 0;
    loadReplay(data.moves, data.metrics, data.ms);
  } else if (data.type === 'error' && data.id === state.run.pending) {
    state.run.pending = 0;
    state.error = data.message;
    refresh();
  }
};
const onBoundMsg = data => {
  if (data.type === 'lagrangian-done' && data.id === state.lagId) { state.lag = data.bound; refresh(); }
  else if (data.type === 'error' && data.id === state.lagId) { state.lag = null; refresh(); }
};
const onBenchMsg = data => {
  if (data.type === 'bench-progress') bench.progress(data.done, data.total);
  else if (data.type === 'bench-done') bench.done(data);
  else if (data.type === 'error') bench.failed(data.message);
};

// ---------- view
const canvas = $('field');
const view = new FieldView(canvas);
const scene = () => ({ game: state.game, inst: state.inst, display: state.display, overlays: state.overlays });

const manual = new ManualPlay(view, canvas, $('tooltip'), {
  game: () => state.game,
  overlays: () => state.overlays,
  redraw: () => view.draw(),
  apply: m => {
    // In play mode a mis-click just explains itself; only legal moves reach the engine (an illegal move
    // would end the run as an algorithm error).
    const check = state.game.resolve(m);
    if (!check.legal) { state.error = `Not allowed: ${check.reason}`; refresh(); return; }
    state.error = '';
    state.game.apply(m);
    afterMove(m, true);
    refresh();
    view.draw();
    tick();
  },
  undo: () => { if (state.game.undo()) { afterUndo(); refresh(); } },
});

// ---------- dials
const readouts = {
  'field.grouping': () => (state.inst ? `R = ${fmt(state.inst.clumpiness.R)} (${state.inst.clumpiness.band})` : ''),
  'field.N': () => {
    if (!state.inst) return '';
    const total = state.inst.field.total;
    return total ? `${state.inst.field.xs.length} of ${total} points${state.inst.field.xs.length < total ? ' (seeded sample)' : ''}` : `${state.inst.field.xs.length} points`;
  },
  'goal.t': () => {
    if (!state.inst) return '';
    const s = state.inst.field.xs.length - state.cfg.goal.n * state.cfg.goal.t;
    return s < 0 ? { text: `needs ${-s} more points`, cls: 'bad' } : { text: `spare s = ${s}`, cls: '' };
  },
  'raker.kMul': () => (state.inst ? `k = ${fmt(state.inst.k)} (M = ${fmt(state.inst.M)})` : ''),
  'raker.k': () => (state.inst ? `= ${fmt(state.inst.k / state.inst.M)} × M` : ''),
  'raker.l': () => lReadout(),
  'raker.lMul': () => lReadout(),
};
function lReadout() {
  if (!state.inst) return '';
  const { k, l } = state.inst;
  return l > k / 2 ? { text: `l = ${fmt(l)} > k/2`, cls: 'bad' } : { text: `l = ${fmt(l)} (k = ${fmt(k)})`, cls: '' };
}
const withReadouts = list => list.map(d => (readouts[d.path] ? { ...d, readout: readouts[d.path] } : d));

let algoParamsUI = null;
const dialsRoot = $('dials');
const cfgDials = buildDials(dialsRoot, [
  {
    title: 'Field', dials: withReadouts(FIELD_DIALS), open: true,
    extra: body => {
      state.editBtn = el('button', { class: 'ghost', text: 'Edit points by hand', onclick: () => toggleEdit() });
      body.append(el('div', { class: 'btn-row' }, state.editBtn,
        el('button', { class: 'ghost', text: 'Load a data file…', title: 'CSV, TSV or space-separated: lon/lat, x/y, or the first two numeric columns', onclick: () => loadDataFile() }),
        el('button', { class: 'ghost', text: 'Download points', title: 'The current points as CSV (field units, y pointing up)', onclick: () => downloadPoints() })));
    },
  },
  { title: 'Goal', dials: withReadouts(GOAL_DIALS), open: true },
  { title: 'Raker', dials: withReadouts(RAKER_DIALS), open: true },
  {
    title: 'Algorithm', dials: [], open: true,
    extra: body => {
      const sel = el('select', { 'aria-label': 'Algorithm' });
      for (const a of ALGORITHMS) sel.append(el('option', { value: a.id, text: a.name }));
      sel.value = state.cfg.algo.id;
      const blurb = el('div', { class: 'algo-blurb' });
      const params = el('div', { style: 'display:grid; gap:10px' });
      const auto = el('input', { type: 'checkbox', checked: state.autoRun });
      auto.addEventListener('change', () => { state.autoRun = auto.checked; store.set('autoRun', auto.checked); });
      const runBtn = el('button', { class: 'primary', text: 'Run', onclick: () => { setTab('watch'); runAlgorithm(); } });
      const showAlgo = () => {
        const a = getAlgorithm(state.cfg.algo.id);
        blurb.textContent = a.blurb;
        algoParamsUI = buildParamDials(params, a.params, state.cfg.algo.params, () => { persist(); if (state.tab === 'watch' && state.autoRun) runAlgorithm(); });
      };
      sel.addEventListener('change', () => {
        state.cfg.algo = { id: sel.value, params: defaultParams(getAlgorithm(sel.value)) };
        persist();
        showAlgo();
        if (state.tab === 'watch') runAlgorithm();
      });
      showAlgo();
      state.algoSelect = sel;
      state.showAlgo = showAlgo;
      body.append(sel, blurb, params,
        el('div', { class: 'dial bool' }, el('div', { class: 'ctl' }, el('label', { text: 'Re-run when a dial changes' }), el('span', { class: 'switch' }, auto, el('span')))),
        el('div', { class: 'run-row' }, runBtn));
    },
  },
  { title: 'Rules', dials: RULE_DIALS },
  { title: 'Score weights', dials: SCORE_DIALS },
  { title: 'Time to rake', dials: TIME_DIALS },
], { get: p => p.split('.').reduce((o, k) => o?.[k], state.cfg), set: (p, v) => setCfg(p, v) });

const displayDials = buildDials(dialsRoot, [{ title: 'Display', dials: DISPLAY_DIALS }], {
  get: p => state.display[p],
  set: (p, v) => {
    state.display[p] = v;
    store.set('display', state.display);
    displayDials.update(state.display);
    updateOverlays(true);
    view.draw();
  },
});

function persist() {
  store.set('config', state.cfg);
  history.replaceState(null, '', `#c=${encodeCfg(state.cfg)}`);
}

let rebuildTimer = 0;
function setCfg(path, value) {
  setPath(state.cfg, path, value);
  if (path === 'field.nested' && value) state.cfg.field.nestN = state.cfg.field.N; // keep the field on screen
  if (path === 'field.model' && isDataModel(value)) {
    // a real data set: use all of its points, and keep the goal possible
    state.cfg.field.N = dataset(value.slice(5))?.count ?? state.cfg.field.N;
    fitGoal(state.cfg.field.N);
  }
  if (path === 'field.N' && isDataModel(state.cfg.field.model)) fitGoal(Math.min(value, dataset(state.cfg.field.model.slice(5))?.count ?? value));
  if (path === 'field.model' && value === 'custom' && !(state.cfg.field.points && state.cfg.field.points.length)) toCustom();
  persist();
  cfgDials.update(state.cfg);
  if (path.startsWith('score.') || path.startsWith('time.')) { refresh(); return; } // re-scored and re-timed, not replayed
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuild(), 140);
}

// A smaller point set may not hold n piles of t: keep n and lower t so 15% of the points are spare.
function fitGoal(N) {
  const g = state.cfg.goal;
  if (g.n * g.t > N) g.t = Math.max(1, Math.floor((0.85 * N) / Math.max(1, g.n)));
}

// Your own points from a file (see src/data/parse.js); they become hand-placed points, so they can be edited.
function loadDataFile() {
  const input = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/plain' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const res = loadPointTable(await file.text(), { max: 5000, seed: state.cfg.seed });
      Object.assign(state.cfg.field, {
        model: 'custom', points: res.points, W: res.W, H: res.H,
        source: { name: file.name, columns: res.columns, kind: res.kind, total: res.total, used: res.points.length, skipped: res.skipped, nudged: res.nudged },
      });
      fitGoal(res.points.length);
      state.error = '';
      persist();
      cfgDials.update(state.cfg);
      rebuild();
    } catch (err) {
      state.error = `Could not read ${file.name}: ${err.message}`;
      refresh();
    }
  });
  input.click();
}

function downloadPoints() {
  if (!state.inst) return;
  const { xs, ys, H } = state.inst.field;
  const rows = ['x,y', ...Array.from(xs, (x, i) => `${x.toFixed(4)},${(H - ys[i]).toFixed(4)}`)];
  const m = state.cfg.field.model;
  download(`points-${isDataModel(m) ? m.slice(5) : m}-seed${state.cfg.seed}.csv`, 'text/csv', rows.join('\n'));
}

// Turns the field on screen into hand-placed points, in a box of the same size.
function toCustom() {
  state.cfg.field.points = currentPoints();
  if (state.inst) { state.cfg.field.W = +state.inst.field.W.toFixed(3); state.cfg.field.H = +state.inst.field.H.toFixed(3); }
  delete state.cfg.field.source;
}

const currentPoints = () => {
  if (!state.inst) return [];
  const { xs, ys } = state.inst.field;
  return Array.from(xs, (x, i) => [+x.toFixed(4), +ys[i].toFixed(4)]);
};

// ---------- instance and runs
function rebuild() {
  try {
    state.inst = buildInstance(state.cfg, state.cfg.seed);
    state.game = state.inst.newGame();
    state.feas = state.inst.feasibility();
    state.error = '';
  } catch (err) {
    state.error = err.message;
    state.inst = null;
    state.game = null;
    view.setScene(null);
    view.draw();
    refresh();
    return;
  }
  resetOverlays();
  manual.clear();
  state.run = { moves: [], cursor: 0, playing: false, metrics: null, pending: 0, ms: 0, algo: null };
  view.setScene(scene());
  requestLagrangian();
  cfgDials.update(state.cfg);
  refresh();
  view.draw();
  if (state.tab === 'watch' && state.autoRun && !state.editPoints) runAlgorithm();
}

function requestLagrangian(force = false) {
  if (boundWorker) { boundWorker.terminate(); boundWorker = null; }
  state.lag = null;
  const N = state.inst.field.xs.length, { n, t } = state.inst.gameCfg;
  if (N < n * t || !state.inst.bounds.valid) return;
  if (!force && N > 600) return; // larger fields: on demand (O(N^2) per iteration)
  boundWorker = makeWorker(onBoundMsg);
  state.lagId = ++reqId;
  state.lag = 'running';
  boundWorker.postMessage({ type: 'lagrangian', id: state.lagId, cfg: state.cfg });
}

function runAlgorithm() {
  if (!state.inst) return;
  if (runWorker && state.run.pending) { runWorker.terminate(); runWorker = null; }
  if (!runWorker) runWorker = makeWorker(onRunMsg);
  state.run.pending = ++reqId;
  state.run.playing = false;
  state.run.algo = state.cfg.algo.id;
  runWorker.postMessage({ type: 'run', id: state.run.pending, cfg: state.cfg, algo: state.cfg.algo });
  refresh();
}

function loadReplay(moves, metrics, ms = 0) {
  state.game = state.inst.newGame();
  resetOverlays();
  state.run.moves = moves;
  state.run.cursor = 0;
  state.run.metrics = metrics;
  state.run.ms = ms;
  view.setScene(scene());
  // jump to the end for big runs, otherwise play it
  if (moves.length > 1500) seek(moves.length);
  else state.run.playing = true;
  lastFrame = performance.now();
  refresh();
  view.draw();
  tick();
}

function resetOverlays() {
  state.overlays = { trail: [], lastStroke: null, preview: null, hover: -1, cuts: null, unreachable: null };
  state.frog = 0;
  updateOverlays(true);
}

// ---------- moves and overlays
function afterMove(m, animate) {
  const g = state.game, o = state.overlays, i = g.log.length;
  if (g.raker >= 0) {
    const last = o.trail[o.trail.length - 1];
    if (!last || last.site !== g.raker) o.trail.push({ i, site: g.raker, 0: g.x[g.raker], 1: g.y[g.raker] });
  }
  if (m.type === 'rake' && g.history.length) {
    const dx = m.to && typeof m.to === 'object' ? m.to.x : g.x[g.raker], dy = m.to && typeof m.to === 'object' ? m.to.y : g.y[g.raker];
    o.lastStroke = { ax: g.x[m.from], ay: g.y[m.from], bx: dx, by: dy, l: g.l };
    if (animate) {
      const f = g.history[g.history.length - 1].changes;
      for (let q = 0; q + 2 < f.length - 3; q += 3) {
        const j = f[q];
        view.addTween(g.x[j], g.y[j], dx, dy, f[q + 2], 220);
      }
    }
  }
  updateOverlays(false);
}

function afterUndo() {
  const g = state.game, o = state.overlays, i = g.log.length;
  while (o.trail.length && o.trail[o.trail.length - 1].i > i) o.trail.pop();
  o.lastStroke = null;
  for (let q = g.log.length - 1; q >= 0; q--) {
    const m = g.log[q];
    if (m.type !== 'rake') continue;
    // the destination of an earlier stroke is wherever that pile sat; approximate with the move's target
    const D = m.to !== undefined && typeof m.to !== 'object' ? m.to : null;
    if (D !== null) o.lastStroke = { ax: g.x[m.from], ay: g.y[m.from], bx: g.x[D], by: g.y[D], l: g.l };
    break;
  }
  updateOverlays(true);
}

let lastHeavy = 0;
function updateOverlays(force) {
  const g = state.game, o = state.overlays;
  if (!g) return;
  const now = performance.now();
  if (!force && now - lastHeavy < 120) return;
  lastHeavy = now;
  o.cuts = state.display.cuts ? articulationPoints(g) : null;
  state.frog = frogDistance(g);
  o.unreachable = null;
  if (g.status === 'failed' && g.raker >= 0 && state.display.components) {
    const seen = new Uint8Array(g.size), q = [g.raker];
    seen[g.raker] = 1;
    for (let h = 0; h < q.length; h++) g.forEachNeighbor(q[h], w => { if (!seen[w]) { seen[w] = 1; q.push(w); } });
    const un = new Uint8Array(g.size);
    let any = false;
    for (let j = 0; j < g.size; j++) if (g.kind[j] !== EMPTY && !g.detached[j] && !seen[j]) { un[j] = 1; any = true; }
    o.unreachable = any ? un : null;
  }
}

// ---------- playback
const rate = () => Math.round(Math.pow(10, 3 * +$('pb-speed').value)); // 1 .. 1000 moves per second
function stepForward(animate) {
  const r = state.run;
  if (r.cursor >= r.moves.length) return false;
  const m = r.moves[r.cursor++];
  if (m.type === 'give-up') state.game.giveUp(r.metrics?.detail);
  else state.game.apply(m);
  afterMove(m, animate);
  return true;
}
function stepBack() {
  const r = state.run;
  if (r.cursor <= 0) return;
  state.game.undo();
  r.cursor--;
  afterUndo();
}
function seek(p) {
  const r = state.run;
  p = Math.max(0, Math.min(r.moves.length, p));
  while (r.cursor < p) stepForward(false);
  while (r.cursor > p) stepBack();
  updateOverlays(true);
}

let lastFrame = 0, acc = 0, lastPanel = 0;
function tick() {
  const now = performance.now(), dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  const r = state.run;
  let changed = false;
  if (r.playing && state.tab === 'watch') {
    acc += dt * rate();
    const animate = rate() <= 40;
    while (acc >= 1 && r.cursor < r.moves.length) { stepForward(animate); acc -= 1; changed = true; }
    if (r.cursor >= r.moves.length) { r.playing = false; acc = 0; updateOverlays(true); changed = true; }
  }
  if (changed || view.animating) view.draw();
  if (changed && now - lastPanel > 110) { lastPanel = now; refresh(); }
  else if (changed && !r.playing) refresh();
  if (r.playing || view.animating) requestAnimationFrame(tick);
}

// ---------- page chrome
const stageHead = $('stage-head');
function refresh() {
  const g = state.game;
  // stage head
  stageHead.replaceChildren();
  if (state.error && !g) {
    stageHead.append(el('span', { class: 'chip failed', text: 'Error' }), el('span', { class: 'detail', text: state.error }));
  } else if (g) {
    stageHead.append(statusChip(g));
    const facts = el('span', { class: 'facts' });
    const c = g.c;
    const algo = state.tab === 'watch' ? (state.run.pending ? `${getAlgorithm(state.cfg.algo.id).name}: thinking…` : state.run.algo ? getAlgorithm(state.run.algo).name : 'No run yet') : state.tab === 'play' ? 'You are raking' : '';
    facts.innerHTML = `${algo ? `<b>${algo}</b> · ` : ''}${state.tab === 'watch' && state.run.moves.length ? `move ${state.run.cursor} / ${state.run.moves.length} · ` : ''}strokes <b>${c.strokes}</b> · walk <b>${fmt(c.walkDist)}</b> · work <b>${fmt(c.work)}</b> · time <b>${fmtTime(timeParts(c, state.cfg.time).total)}</b> · piles <b>${c.nPiles}</b>/${g.n}`;
    stageHead.append(facts);
    if (g.status === 'failed' && g.detail) stageHead.append(el('span', { class: 'detail', text: g.detail }));
    else if (state.error) stageHead.append(el('span', { class: 'detail', text: state.error }));
  }
  // readouts
  if (g && state.inst) {
    renderReadouts($('readouts'), {
      inst: state.inst, game: g, feas: state.feas, lag: state.lag, weights: state.cfg.score, time: state.cfg.time, frog: state.frog,
      handlers: {
        lagrangian: () => { requestLagrangian(true); refresh(); },
        exportReplay, exportCsv, importReplay,
      },
    });
  }
  // playback bar
  const r = state.run, bar = $('playbar');
  bar.hidden = state.tab !== 'watch';
  $('pb-scrub').max = r.moves.length;
  $('pb-scrub').value = r.cursor;
  $('pb-pos').textContent = `${r.cursor} / ${r.moves.length}`;
  $('pb-play').textContent = r.playing ? '❚❚' : '▶';
  $('pb-play').setAttribute('aria-label', r.playing ? 'Pause' : 'Play');
  $('pb-rate').textContent = `${rate()}/s`;
  // hint
  const hint = $('hint');
  if (state.editPoints) hint.innerHTML = '<b>Editing points:</b> click to add a point · <kbd>Shift</kbd>-click to remove the nearest · press the button again to finish';
  else if (state.tab === 'play') {
    hint.innerHTML = state.game && state.game.raker < 0
      ? 'Click any point to start there.'
      : `Click a point or pile within reach to rake it into your pile · <kbd>Shift</kbd>-click to walk · <kbd>F</kbd> found a pile here · <kbd>U</kbd> undo${state.cfg.rules.destination !== 'stand' ? ' · drag to push into another pile' : ''}`;
  } else if (state.tab === 'watch') hint.innerHTML = '<kbd>Space</kbd> play / pause · <kbd>←</kbd> <kbd>→</kbd> step · the run restarts when you change a dial (toggle under Algorithm)';
  else hint.textContent = '';
  if (state.editBtn) state.editBtn.textContent = state.editPoints ? 'Done editing points' : 'Edit points by hand';
}

function setTab(tab) {
  if (state.editPoints && tab !== state.tab) toggleEdit(false);
  state.tab = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  const layout = $('layout');
  layout.classList.toggle('bench-mode', tab === 'bench' || tab === 'sweep');
  $('bench').hidden = tab !== 'bench';
  $('sweep').hidden = tab !== 'sweep';
  if (tab === 'sweep') sweep.show();
  manual.enable(tab === 'play');
  if (!state.inst) { refresh(); return; }
  if (tab === 'play') {
    state.run.playing = false;
    state.game = state.inst.newGame();
    resetOverlays();
    view.setScene(scene());
  } else if (tab === 'watch') {
    state.game = state.inst.newGame();
    resetOverlays();
    view.setScene(scene());
    if (state.run.moves.length) { const p = state.run.moves.length; state.run.cursor = 0; seek(p); }
    else runAlgorithm();
  }
  requestAnimationFrame(() => { view.resize(); });
  refresh();
}

// ---------- editing points by hand
function toggleEdit(on = !state.editPoints) {
  state.editPoints = on;
  if (on) {
    if (state.tab === 'bench' || state.tab === 'sweep') setTab('play');
    manual.enable(false);
    if (state.cfg.field.model !== 'custom') {
      toCustom();
      state.cfg.field.model = 'custom';
      persist();
      cfgDials.update(state.cfg);
      rebuild();
    }
  } else {
    manual.enable(state.tab === 'play');
    if (state.tab === 'watch' && state.autoRun) runAlgorithm();
  }
  refresh();
}
canvas.addEventListener('pointerdown', e => {
  if (!state.editPoints || !state.inst) return;
  const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  const pts = state.cfg.field.points || [];
  if (e.shiftKey) {
    const j = view.pick(px, py, 20);
    if (j >= 0 && j < pts.length) pts.splice(j, 1);
  } else {
    const p = view.toWorld(px, py);
    if (p.x < 0 || p.y < 0 || p.x > state.cfg.field.W || p.y > state.cfg.field.H) return;
    pts.push([+p.x.toFixed(4), +p.y.toFixed(4)]);
  }
  state.cfg.field.points = pts;
  persist();
  rebuild();
});

// ---------- replays and exports
function download(name, type, text) {
  const a = el('a', { download: name, href: URL.createObjectURL(new Blob([text], { type })) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportReplay() {
  const g = state.game;
  const moves = state.tab === 'watch' && state.run.moves.length ? state.run.moves : g.log;
  download(`rake-replay-seed${state.cfg.seed}.json`, 'application/json', JSON.stringify({
    app: 'rake-leaves-math', version: 1, config: state.cfg, algorithm: state.tab === 'watch' ? state.run.algo : 'manual', moves, result: snapshot(g),
  }, null, 1));
}
function exportCsv() {
  const moves = state.tab === 'watch' && state.run.moves.length ? state.run.moves : state.game.log;
  const g = state.inst.newGame(), rows = ['move,type,at,from,to,status,strokes,walks,walk_distance,stroke_length,work,loose,piles,full_piles,spare_used'];
  moves.forEach((m, i) => {
    if (m.type === 'give-up') g.giveUp(); else g.apply(m);
    const c = g.c, to = m.to === undefined ? '' : typeof m.to === 'object' ? `${m.to.x};${m.to.y}` : m.to;
    rows.push([i + 1, m.type, m.at ?? '', m.from ?? '', to, g.status, c.strokes, c.walks, c.walkDist.toFixed(4), c.rakeDist.toFixed(4), c.work.toFixed(4), c.nLoose, c.nPiles, c.nFull, c.excess].join(','));
  });
  download(`rake-moves-seed${state.cfg.seed}.csv`, 'text/csv', rows.join('\n'));
}
function importReplay() {
  const input = el('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.moves) || !data.config) throw new Error('not a replay file');
      state.cfg = normalise(data.config);
      persist();
      cfgDials.update(state.cfg);
      state.algoSelect.value = state.cfg.algo.id;
      state.showAlgo();
      const auto = state.autoRun;
      state.autoRun = false;
      setTab('watch');
      rebuild();
      state.autoRun = auto;
      state.run.algo = data.algorithm && data.algorithm !== 'manual' ? data.algorithm : null;
      loadReplay(data.moves, data.result || null);
    } catch (err) {
      state.error = `Could not load that replay: ${err.message}`;
      refresh();
    }
  });
  input.click();
}

// ---------- benchmark tab
const bench = new BenchView($('bench'), {
  baseConfig: () => structuredClone(state.cfg),
  post: msg => {
    if (msg.type === 'bench') { if (benchWorker) benchWorker.terminate(); benchWorker = makeWorker(onBenchMsg); }
    if (benchWorker) benchWorker.postMessage({ ...msg, id: ++reqId });
  },
  replay: (trial, algoId) => {
    if (!trial) return;
    const patched = mergeConfig(state.cfg, trial.patch || {});
    patched.seed = trial.seed;
    patched.algo = { id: algoId, params: defaultParams(getAlgorithm(algoId)) };
    state.cfg = normalise(patched);
    persist();
    cfgDials.update(state.cfg);
    state.algoSelect.value = algoId;
    state.showAlgo();
    state.tab = 'watch';
    setTab('watch');
    rebuild();
    runAlgorithm();
  },
});

// ---------- sweep tab: a pool of workers plays every (seed, value); a click on a run opens it in Watch
const sweep = new SweepView($('sweep'), {
  baseConfig: () => structuredClone(state.cfg),
  makeWorker: onmsg => makeWorker(onmsg),
  watch: cfg => {
    state.cfg = normalise(cfg);
    persist();
    cfgDials.update(state.cfg);
    state.algoSelect.value = state.cfg.algo.id;
    state.showAlgo();
    state.tab = 'watch';
    setTab('watch');
    rebuild();
    runAlgorithm();
  },
});

// ---------- controls
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => setTab(b.dataset.tab));
$('pb-play').addEventListener('click', () => togglePlay());
$('pb-fwd').addEventListener('click', () => { state.run.playing = false; stepForward(true); updateOverlays(true); refresh(); view.draw(); tick(); });
$('pb-back').addEventListener('click', () => { state.run.playing = false; stepBack(); refresh(); view.draw(); });
$('pb-first').addEventListener('click', () => { state.run.playing = false; seek(0); refresh(); view.draw(); });
$('pb-last').addEventListener('click', () => { state.run.playing = false; seek(state.run.moves.length); refresh(); view.draw(); });
$('pb-scrub').addEventListener('input', e => { state.run.playing = false; seek(+e.target.value); refresh(); view.draw(); });
$('pb-speed').addEventListener('input', () => { store.set('speed', +$('pb-speed').value); refresh(); });
const savedSpeed = store.get('speed');
if (Number.isFinite(savedSpeed)) $('pb-speed').value = savedSpeed;
function togglePlay() {
  const r = state.run;
  if (!r.moves.length) return;
  if (r.cursor >= r.moves.length) seek(0);
  r.playing = !r.playing;
  lastFrame = performance.now();
  refresh();
  tick();
}
window.addEventListener('keydown', e => {
  if (state.tab !== 'watch' || e.target.closest('input, select, textarea, button, dialog')) return;
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') { state.run.playing = false; stepForward(true); updateOverlays(true); refresh(); view.draw(); tick(); }
  else if (e.key === 'ArrowLeft') { state.run.playing = false; stepBack(); refresh(); view.draw(); }
  else if (e.key === 'Home') { state.run.playing = false; seek(0); refresh(); view.draw(); }
  else if (e.key === 'End') { state.run.playing = false; seek(state.run.moves.length); refresh(); view.draw(); }
});

$('btn-rules').addEventListener('click', () => $('rules-dialog').showModal());
$('btn-share').addEventListener('click', () => {
  $('share-text').value = encodeCfg(state.cfg);
  $('share-msg').textContent = '';
  $('share-dialog').showModal();
});
$('share-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('share-text').value); $('share-msg').textContent = 'Copied.'; }
  catch { $('share-text').select(); $('share-msg').textContent = 'Select the text and copy it.'; }
});
$('share-load').addEventListener('click', () => {
  try {
    state.cfg = normalise(decodeCfg($('share-text').value));
    persist();
    cfgDials.update(state.cfg);
    state.algoSelect.value = state.cfg.algo.id;
    state.showAlgo();
    $('share-msg').textContent = 'Loaded.';
    rebuild();
  } catch (err) {
    $('share-msg').textContent = `That code did not decode: ${err.message}`;
  }
});
const themes = ['system', 'dark', 'light'];
function applyTheme(t) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $('btn-theme').textContent = `Theme: ${t}`;
  view.refreshColors();
  view.draw();
}
let theme = store.get('theme') || 'system';
applyTheme(theme);
$('btn-theme').addEventListener('click', () => {
  theme = themes[(themes.indexOf(theme) + 1) % themes.length];
  store.set('theme', theme);
  applyTheme(theme);
});

// ---------- go
cfgDials.update(state.cfg);
displayDials.update(state.display);
rebuild();
