import { buildInstance } from './instance.js';
import { lagrangianBound, ownSiteBound } from './bounds.js';
import { getAlgorithm, defaultParams } from '../algos/registry.js';
import { runToEnd } from '../core/run.js';
import { score } from '../core/metrics.js';
import { Rng } from '../core/rng.js';

// One benchmark trial: build the instance for (cfg, seed), run each algorithm on its own fresh copy, and
// report costs next to the instance's lower bounds. Shared by the CLI benchmark and the browser worker.
//   algos: [{ id, params?, label? }]
//   opts.lagrangian: compute the Lagrangian work bound (O(N^2) per iteration) when N <= opts.lagrangianMaxN
export function runTrial(cfg, seed, algos, opts = {}) {
  const inst = buildInstance(cfg, seed);
  const { field, bounds } = inst;
  const N = field.xs.length, { n, t } = inst.gameCfg;
  let lagrangian = null;
  if (opts.lagrangian && N <= (opts.lagrangianMaxN ?? 800) && N >= n * t) {
    lagrangian = lagrangianBound(field.xs, field.ys, n, t, field.W, field.H, { iterations: opts.lagrangianIterations ?? 100 }).bound;
  }
  const workBound = Math.max(bounds.work, lagrangian ?? 0);
  const scoreBounds = { travel: bounds.travel, work: workBound, spacing: bounds.spacing };
  const results = [];
  for (const spec of algos) {
    const algo = getAlgorithm(spec.id);
    const params = { ...defaultParams(algo), ...(spec.params || {}) };
    const g = inst.newGame();
    const m = runToEnd(g, algo, params, new Rng(seed, `algo:${spec.id}`), { budgetMs: opts.decisionBudgetMs });
    let ownSite = null;
    if (m.status === 'success' && bounds.valid) {
      const piles = g.piles();
      ownSite = ownSiteBound(field.xs, field.ys, piles.map(j => ({ x: g.x[j], y: g.y[j] })), piles.map(j => g.mass[j]), { iterations: 150 }).bound;
    }
    const { pileSizes, ...rest } = m;
    results.push({
      id: spec.id,
      label: spec.label || algo.name,
      params,
      ...rest,
      pileSizes,
      score: score(m, scoreBounds, cfg.score),
      workGap: m.status === 'success' && workBound > 0 ? m.work / workBound : null,
      routingLoss: ownSite ? m.work / ownSite : null,
      sitingLoss: ownSite && lagrangian ? ownSite / lagrangian : null,
      log: opts.keepLogs ? g.log : undefined,
    });
  }
  return {
    seed,
    instance: {
      N, n, t, k: inst.k, l: inst.l, M: inst.M, kOverM: inst.M > 0 ? inst.k / inst.M : null,
      spare: N - n * t, R: inst.clumpiness.R, band: inst.clumpiness.band,
      bounds: { ...bounds, lagrangian, workBound },
    },
    results,
  };
}
