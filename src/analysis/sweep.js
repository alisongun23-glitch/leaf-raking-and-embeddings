import { buildInstance, mergeConfig } from './instance.js';
import { lagrangianBound } from './bounds.js';
import { getAlgorithm, defaultParams } from '../algos/registry.js';
import { runToEnd } from '../core/run.js';
import { Rng, hashString } from '../core/rng.js';

// Sweeps: one dial stepped through a range for one seed at a time, every value played to the end by
// one algorithm. Shared by the Sweep tab (in workers) and bench/sweep.mjs; src/analysis/fit.js turns
// the rows into fitted curves and jump lists.
//
// Sweeping the leaf count keeps the field by default (field.nested): the field for N + 1 is the field
// for N plus one leaf, so a jump in work comes from the game, not from a new random draw.

export const SWEEP_DIALS = [
  { path: 'field.N', label: 'Leaves N', symbol: 'N', int: true },
  { path: 'goal.n', label: 'Piles n', symbol: 'n', int: true },
  { path: 'goal.t', label: 'Pile size t', symbol: 't', int: true },
  { path: 'raker.kMul', label: 'Reach k (× M)', symbol: 'k/M' },
  { path: 'raker.k', label: 'Reach k', symbol: 'k' },
  { path: 'raker.l', label: 'Rake half-width l', symbol: 'l' },
  { path: 'field.grouping', label: 'Grouping strength', symbol: 'g' },
  { path: 'field.background', label: 'Scattered share', symbol: 'w' },
  { path: 'field.clumps', label: 'Clumps', symbol: 'c', int: true },
];
export const sweepDial = path => SWEEP_DIALS.find(d => d.path === path) || { path, label: path, symbol: 'x', int: false };

// What a sweep can measure. get(row) is the value; work alone has a lower bound.
export const SWEEP_MEASURES = [
  { id: 'work', label: 'Work', noun: 'work', unit: 'leaf·m', get: r => r.work, bound: true },
  { id: 'time', label: 'Time to rake', noun: 'time', unit: 'min', get: r => r.time / 60 },
  { id: 'compute', label: 'Compute time', noun: 'compute time', unit: 'ms', get: r => r.computeMs, help: 'How long the algorithm took to decide its moves on this machine: noisy when the computer is busy.' },
  { id: 'strokes', label: 'Strokes', noun: 'strokes', unit: '', get: r => r.strokes },
  { id: 'walk', label: 'Walking distance', noun: 'walking', unit: 'm', get: r => r.walkDist },
];
export const sweepMeasure = id => SWEEP_MEASURES.find(m => m.id === id) || SWEEP_MEASURES[0];

// from..to inclusive in steps (rounded for whole-number dials, at most `max` values).
export function sweepValues(path, from, to, step, max = 2000) {
  const int = sweepDial(path).int;
  if (!(Number.isFinite(from) && Number.isFinite(to))) return [];
  if (from > to) [from, to] = [to, from];
  step = Math.abs(step) || 1;
  if (int) step = Math.max(1, Math.round(step));
  const out = [];
  for (let i = 0; out.length < max; i++) {
    const v = from + i * step;
    if (v > to + 1e-9) break;
    out.push(int ? Math.round(v) : +v.toFixed(6));
  }
  return [...new Set(out)];
}

// The config for one point. Leaf-count sweeps stay nested on base.field.N unless opts.nested is false.
export function sweepConfig(base, path, value, opts = {}) {
  const parts = path.split('.'), patch = {};
  let o = patch;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = {};
  o[parts[parts.length - 1]] = value;
  if (path === 'raker.k') patch.raker.kMode = 'abs';
  if (path === 'raker.kMul') patch.raker.kMode = 'xM';
  if (path === 'raker.l') patch.raker.lMode = 'abs';
  if (path === 'field.N' && opts.nested !== false) {
    patch.field.nested = true;
    patch.field.nestN = base.field.nested ? base.field.nestN : base.field.N;
  }
  return mergeConfig(base, patch);
}

// A short fingerprint of a field's first leaves: equal heads on neighbouring points mean "same field".
function fieldHead(field) {
  let s = '';
  for (let i = 0; i < Math.min(24, field.xs.length); i++) s += `${field.xs[i].toFixed(5)},${field.ys[i].toFixed(5)};`;
  return hashString(s).toString(36);
}

// Plays one sweep point and describes it. opts:
//   algo      { id, params } (default: the config's algorithm)
//   nested    keep the leaves when sweeping N (default true)
//   bound     also compute the Lagrangian work bound (O(N^2) per iteration; skipped above boundMaxN)
export function sweepPoint(base, path, value, seed, opts = {}) {
  const cfg = sweepConfig(base, path, value, opts);
  const inst = buildInstance(cfg, seed);
  const { field } = inst, N = field.xs.length, { n, t } = inst.gameCfg;
  const spec = opts.algo || cfg.algo, algo = getAlgorithm(spec.id);
  const g = inst.newGame();
  const m = runToEnd(g, algo, { ...defaultParams(algo), ...(spec.params || {}) }, new Rng(seed, `algo:${algo.id}`));
  let bound = null;
  if (opts.bound && N >= n * t && N <= (opts.boundMaxN ?? 1000) && inst.bounds.valid) {
    // 120 subgradient steps: at 60 some fields stop 25% short, which shows up as false dips in the bound
    bound = lagrangianBound(field.xs, field.ys, n, t, field.W, field.H, { iterations: opts.boundIterations ?? 120 }).bound;
    bound = Math.max(bound, inst.bounds.work);
  }
  const piles = m.status === 'success' ? g.piles().map(j => [+g.x[j].toFixed(3), +g.y[j].toFixed(3), g.mass[j]]) : [];
  return {
    value,
    seed,
    N, n, t, W: field.W, H: field.H,
    k: inst.k, l: inst.l, M: inst.M, spare: N - n * t,
    status: m.status,
    reason: m.reason,
    work: m.work,
    time: m.time,
    computeMs: m.decisionMs,
    strokes: m.strokes,
    walkDist: m.walkDist,
    rakeDist: m.rakeDist,
    captures: m.captures,
    plan: m.algoStats?.plan ?? null,
    regime: m.algoStats?.regime ?? null,
    leftover: m.algoStats?.leftover ?? null,
    piles,
    bound,
    head: fieldHead(field),
  };
}
