import { buildInstance, mergeConfig } from '../analysis/instance.js';
import { getAlgorithm, defaultParams } from '../algos/registry.js';
import { runToEnd } from '../core/run.js';
import { Rng } from '../core/rng.js';
import { lagrangianBound } from '../analysis/bounds.js';
import { runTrial } from '../analysis/trial.js';
import { summarize, expandGrid } from '../analysis/benchreport.js';
import { sweepPoint } from '../analysis/sweep.js';

// Background work for the browser app, so the page stays responsive:
//   run         play one algorithm to the end on (cfg, seed); returns the move list for replay
//   lagrangian  compute the Lagrangian work bound for the current instance
//   bench       run a benchmark grid in-browser, reporting progress; 'cancel' stops it
//   sweep-point play one point of a sweep (the Sweep tab keeps a pool of these workers busy)
let benchToken = 0;

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'run') {
      const inst = buildInstance(msg.cfg, msg.cfg.seed);
      const g = inst.newGame(), algo = getAlgorithm(msg.algo.id);
      const params = { ...defaultParams(algo), ...(msg.algo.params || {}) };
      const t0 = performance.now();
      const metrics = runToEnd(g, algo, params, new Rng(msg.cfg.seed, `algo:${algo.id}`));
      self.postMessage({ type: 'run-done', id: msg.id, moves: g.log, metrics, ms: performance.now() - t0 });
    } else if (msg.type === 'lagrangian') {
      const inst = buildInstance(msg.cfg, msg.cfg.seed);
      const { xs, ys, W, H } = inst.field;
      const r = lagrangianBound(xs, ys, inst.gameCfg.n, inst.gameCfg.t, W, H, { iterations: 120, timeBudgetMs: 30000 });
      self.postMessage({ type: 'lagrangian-done', id: msg.id, bound: r.bound, iterations: r.iterations });
    } else if (msg.type === 'bench') {
      const token = ++benchToken;
      const cells = expandGrid(msg.grid);
      const tasks = [];
      for (const cell of cells) {
        const cfg = mergeConfig(msg.base, cell.patch);
        for (let s = msg.seedStart; s < msg.seedStart + msg.seeds; s++) tasks.push({ cell: cell.label, patch: cell.patch, cfg, seed: s });
      }
      const trials = [], t0 = performance.now();
      for (let i = 0; i < tasks.length; i++) {
        if (token !== benchToken) return;
        const t = tasks[i];
        const out = runTrial(t.cfg, t.seed, msg.algos, { lagrangian: msg.lagrangian, lagrangianMaxN: 600, lagrangianIterations: 80 });
        trials.push({ cell: t.cell, patch: t.patch, ...out });
        self.postMessage({ type: 'bench-progress', id: msg.id, done: i + 1, total: tasks.length });
        await new Promise(r => setTimeout(r, 0)); // let a cancel message in
      }
      self.postMessage({ type: 'bench-done', id: msg.id, trials, summary: summarize(trials), seconds: (performance.now() - t0) / 1000 });
    } else if (msg.type === 'sweep-point') {
      self.postMessage({ type: 'sweep-row', id: msg.id, row: sweepPoint(msg.base, msg.path, msg.value, msg.seed, msg.opts) });
    } else if (msg.type === 'cancel') {
      benchToken++;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, kind: msg.type, message: String((err && err.message) || err) });
  }
};
