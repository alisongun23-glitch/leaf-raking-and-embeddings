import { generateField, DEFAULT_FIELD } from '../gen/processes.js';
import { clarkEvans, clumpBand } from '../gen/stats.js';
import { Game, DEFAULT_RULES } from '../core/game.js';
import { DEFAULT_WEIGHTS, DEFAULT_TIME } from '../core/metrics.js';
import { emst } from './emst.js';
import { instanceBounds } from './bounds.js';
import { feasibility } from './feasibility.js';

// One configuration object drives the browser app, the worker and the benchmark CLI.
export const DEFAULT_CONFIG = Object.freeze({
  field: { ...DEFAULT_FIELD },
  goal: { n: 4, t: 60 },
  // k is either absolute or a multiple of M (the field's minimum workable reach); same for l and k.
  raker: { kMode: 'xM', kMul: 1.5, k: 20, lMode: 'abs', l: 1.5, lMul: 0.1 },
  rules: { ...DEFAULT_RULES },
  score: { ...DEFAULT_WEIGHTS },
  time: { ...DEFAULT_TIME },
  algo: { id: 'planned-sites', params: {} },
  seed: 1,
});

export function mergeConfig(base, patch = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(patch)])) {
    const b = base[key], p = patch[key];
    if (p === undefined) out[key] = structuredClone(b);
    else if (b && typeof b === 'object' && !Array.isArray(b) && p && typeof p === 'object' && !Array.isArray(p)) out[key] = mergeConfig(b, p);
    else out[key] = structuredClone(p);
  }
  return out;
}

// Turns (config, seed) into a concrete instance: the field, its spanning tree and M, the resolved k and l,
// cheap lower bounds, a feasibility verdict, and a factory for fresh games.
export function buildInstance(cfg, seed = cfg.seed) {
  const field = generateField(cfg.field, seed);
  const tree = emst(field.xs, field.ys);
  const M = tree.M;
  const r = cfg.raker;
  const k = Math.max(1e-6, r.kMode === 'xM' ? r.kMul * (M || 1) : r.k);
  const l = Math.max(0, r.lMode === 'xk' ? r.lMul * k : r.l);
  const gameCfg = { n: cfg.goal.n, t: cfg.goal.t, k, l, rules: cfg.rules, time: cfg.time };
  const newGame = () => new Game(field, gameCfg);
  const bounds = instanceBounds(field, gameCfg);
  const R = clarkEvans(field.xs, field.ys, field.W, field.H);
  return {
    seed,
    field,
    tree,
    M,
    k,
    l,
    gameCfg,
    bounds,
    clumpiness: { R, band: clumpBand(R) },
    newGame,
    feasibility: () => feasibility(newGame(), M),
  };
}
