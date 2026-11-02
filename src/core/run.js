import { snapshot } from './metrics.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Runs an algorithm on a game until it succeeds or fails, and returns the final snapshot plus decision
// timing, and the policy's own stats() when it has one. `ctx` reaches the algorithm's create()
// (e.g. { budgetMs } for anytime planners); `onMove(move, game)` sees every move as it is played.
export function runToEnd(game, algo, params = {}, rng, ctx = {}, onMove = null) {
  const policy = algo.create(game, params, rng, ctx);
  let decisions = 0, decisionMs = 0, maxDecisionMs = 0;
  const decide = fn => {
    const t0 = now();
    const out = fn();
    const dt = now() - t0;
    decisions++;
    decisionMs += dt;
    if (dt > maxDecisionMs) maxDecisionMs = dt;
    return out;
  };
  if (game.raker === -1 && !game.done) {
    const at = decide(() => policy.start());
    const m = { type: 'start', at };
    game.apply(m);
    if (onMove) onMove(m, game);
  }
  while (!game.done) {
    const m = decide(() => policy.next());
    if (!m) {
      game.giveUp();
      break;
    }
    game.apply(m);
    if (onMove) onMove(m, game);
  }
  const algoStats = typeof policy.stats === 'function' ? policy.stats() : null;
  return { ...snapshot(game), decisions, decisionMs, meanDecisionMs: decisionMs / Math.max(1, decisions), maxDecisionMs, algoStats };
}
