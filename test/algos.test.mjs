import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALGORITHMS, defaultParams, getAlgorithm } from '../src/algos/registry.js';
import { buildInstance, DEFAULT_CONFIG, mergeConfig } from '../src/analysis/instance.js';
import { lagrangianBound, ownSiteBound, instanceBounds } from '../src/analysis/bounds.js';
import { runToEnd } from '../src/core/run.js';
import { Rng } from '../src/core/rng.js';
import { checkInvariants } from '../src/core/metrics.js';
import { Game, PILE } from '../src/core/game.js';
import { fieldFrom } from './helpers.mjs';

const small = mergeConfig(DEFAULT_CONFIG, { field: { N: 120, W: 60, H: 60, clumps: 5 }, goal: { n: 3, t: 30 } });
const play = (cfg, id, seed, params = {}) => {
  const inst = buildInstance(cfg, seed), g = inst.newGame(), algo = getAlgorithm(id);
  const res = runToEnd(g, algo, { ...defaultParams(algo), ...params }, new Rng(seed, `algo:${id}`));
  return { inst, g, res };
};

test('every algorithm plays only legal moves, keeps invariants, and is reproducible', () => {
  for (const algo of ALGORITHMS) {
    for (let seed = 1; seed <= 6; seed++) {
      const a = play(small, algo.id, seed), b = play(small, algo.id, seed);
      assert.notEqual(a.res.reason, 'illegal', `${algo.id} seed ${seed}: ${a.res.detail}`);
      assert.deepEqual(checkInvariants(a.g), [], `${algo.id} seed ${seed}`);
      assert.deepEqual(a.g.log, b.g.log, `${algo.id} seed ${seed} is not reproducible`);
      // algorithms only play moves the safety check approves, so they can fail only by giving up
      assert.ok(['success', 'failed'].includes(a.res.status));
      if (a.res.status === 'failed') assert.ok(['gave-up', 'step-budget'].includes(a.res.reason), `${algo.id} seed ${seed}: ${a.res.reason}`);
    }
  }
});

test('the prototype pattern holds: structure beats local greed', () => {
  const rate = id => {
    let ok = 0;
    for (let seed = 1; seed <= 16; seed++) if (play(DEFAULT_CONFIG, id, seed).res.status === 'success') ok++;
    return ok / 16;
  };
  const greedy = rate('greedy-nearest'), tree = rate('tree-peel'), planned = rate('planned-sites');
  assert.ok(greedy <= 0.3, `greedy-nearest succeeded ${greedy}`);
  assert.ok(tree >= 0.85, `tree-peel succeeded ${tree}`);
  assert.ok(planned >= 0.85, `planned-sites succeeded ${planned}`);
});

test('tree peel with plenty of spare points almost always finishes at l = 0', () => {
  const cfg = mergeConfig(small, { goal: { n: 3, t: 20 }, raker: { l: 0 } }); // 60 spare points
  let ok = 0;
  for (let seed = 1; seed <= 40; seed++) if (play(cfg, 'tree-peel', seed).res.status === 'success') ok++;
  assert.ok(ok >= 38, `${ok}/40`);
});

test('every bound sits below every finished run', () => {
  let checked = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const inst = buildInstance(small, seed);
    const { xs, ys, W, H } = inst.field;
    const lag = lagrangianBound(xs, ys, 3, 30, W, H, { iterations: 60 }).bound;
    for (const algo of ALGORITHMS) {
      const { g, res } = play(small, algo.id, seed);
      if (res.status !== 'success') continue;
      checked++;
      const b = inst.bounds;
      assert.ok(res.strokes >= b.strokes, `${algo.id}: strokes ${res.strokes} < ${b.strokes}`);
      assert.ok(res.walkDist >= b.travel - 1e-9, `${algo.id}: walk ${res.walkDist} < ${b.travel}`);
      assert.ok(res.work >= b.work - 1e-9, `${algo.id}: work ${res.work} < NN bound ${b.work}`);
      assert.ok(res.work >= lag - 1e-6, `${algo.id}: work ${res.work} < Lagrangian ${lag}`);
      const piles = g.piles();
      const own = ownSiteBound(xs, ys, piles.map(j => ({ x: g.x[j], y: g.y[j] })), piles.map(j => g.mass[j])).bound;
      assert.ok(res.work >= own - 1e-6, `${algo.id}: work ${res.work} < own-site bound ${own}`);
    }
  }
  assert.ok(checked >= 15, `only ${checked} finished runs to check`);
});

// Exhaustive search (Dijkstra over game states, cost = work) on tiny fields: the work bounds must never
// exceed the true optimum.
function exactMinWork(field, cfg) {
  const g = new Game(field, cfg);
  const save = () => ({ kind: g.kind.slice(), mass: g.mass.slice(), det: g.detached.slice(), raker: g.raker, c: { ...g.c }, status: g.status, size: g.size });
  const load = s => { g.kind.set(s.kind); g.mass.set(s.mass); g.detached.set(s.det); g.raker = s.raker; g.c = { ...s.c }; g.status = s.status; g.size = s.size; };
  const key = s => `${s.raker}|${Array.from(s.kind).join('')}|${Array.from(s.mass).join(',')}`;
  const frontier = [], best = new Map();
  for (let at = 0; at < g.N; at++) {
    load(save());
    const fresh = new Game(field, cfg);
    fresh.apply({ type: 'start', at });
    if (fresh.done) continue;
    const s = { kind: fresh.kind.slice(), mass: fresh.mass.slice(), det: fresh.detached.slice(), raker: fresh.raker, c: { ...fresh.c }, status: fresh.status, size: fresh.size };
    frontier.push([0, s]);
  }
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0]);
    const [w, s] = frontier.shift();
    const k = key(s);
    if (best.has(k) && best.get(k) <= w) continue;
    best.set(k, w);
    if (s.status === 'success') return w;
    load(s);
    const moves = [];
    for (const j of g.neighbors(g.raker)) { moves.push({ type: 'walk', to: j }, { type: 'rake', from: j }); }
    if (g.kind[g.raker] !== PILE) moves.push({ type: 'found' });
    for (const m of moves) {
      load(s);
      const r = g.apply(m);
      if (!r.legal || (g.status === 'failed')) continue;
      frontier.push([g.c.work, save()]);
    }
  }
  return Infinity;
}

test('work bounds never exceed the exact optimum on tiny fields', () => {
  const rng = new Rng(3, 'tiny');
  let solved = 0;
  for (let trial = 0; trial < 24 && solved < 8; trial++) {
    const pts = Array.from({ length: 6 }, () => [rng.range(0, 6), rng.range(0, 6)]);
    const field = fieldFrom(pts, 6, 6);
    const cfg = { n: 2, t: 2, k: 3.5, l: trial % 2 ? 0.6 : 0 };
    const opt = exactMinWork(field, cfg);
    if (!Number.isFinite(opt)) continue;
    solved++;
    const xs = field.xs, ys = field.ys;
    const nn = instanceBounds(field, cfg).work;
    const lag = lagrangianBound(xs, ys, 2, 2, 6, 6, { iterations: 80 }).bound;
    assert.ok(nn <= opt + 1e-9, `NN bound ${nn} > optimum ${opt}`);
    assert.ok(lag <= opt + 1e-6, `Lagrangian ${lag} > optimum ${opt}`);
  }
  assert.ok(solved >= 6, `only ${solved} tiny fields were solvable`);
});

test('planned-sites keeps its plan when the siting fills a group to exactly t', () => {
  // Default dials, seed 1: below N = 429 the smallest group used to be sited at exactly t, its exit trail
  // took a leaf or two, and the run fell back to the tree peel at about twice the work.
  for (const N of [300, 350, 428]) {
    const cfg = mergeConfig(DEFAULT_CONFIG, { field: { N, nested: true, nestN: 300 } });
    const { res } = play(cfg, 'planned-sites', 1);
    assert.equal(res.algoStats.regime, 'planned', `N = ${N}: ${res.algoStats.why}`);
    assert.ok(res.algoStats.margin >= 1, `N = ${N} needed a margin`);
    assert.equal(res.status, 'success');
  }
});

test('planned-sites leaves no relays behind for the tree peel to drag', () => {
  // Default dials, seeds 10 and 15: strokes used to sweep up exit-trail points, so a group's own relays
  // became its only way out and had to stay. The tree peel then dragged them to its root, a quarter of
  // the run's work. Trail points are now off limits until their group is done.
  for (const seed of [10, 15]) {
    const { res } = play(DEFAULT_CONFIG, 'planned-sites', seed);
    assert.equal(res.status, 'success');
    assert.equal(res.algoStats.plan, 'complete');
    assert.equal(res.algoStats.groupsRaked, 4);
    const after = res.algoStats.handoverWork == null ? 0 : res.work - res.algoStats.handoverWork;
    assert.ok(after < 0.05 * res.work, `seed ${seed}: ${Math.round(after)} of ${Math.round(res.work)} work after the hand-over`);
  }
});
