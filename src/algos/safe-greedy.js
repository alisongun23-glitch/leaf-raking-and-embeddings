import { PILE, LOOSE } from '../core/kinds.js';
import { PathFinder, walkMoves, centralSite, isLoose, isLivePile } from './util.js';

// Local rules from swarm robotics, made safe (research report §4): grow the largest pile that is still
// below t, merge unfinished piles early while they are within reach of each other, found at most n
// piles, and only pour points into full piles once every pile is full. When an unfinished pile cannot
// pull anything without cutting work off, use the frontier move (step onto a loose neighbour r, make r
// the pile, drag the old pile onto it); if even that fails, dissolve the pile into a neighbouring pile.
// No global plan, so it shows how far local rules get.
export default {
  id: 'safe-greedy',
  name: 'Safe greedy (grow the largest)',
  blurb: 'Grows the largest unfinished pile with the nearest safe pulls, merges unfinished piles early, founds at most n piles, drags a stuck pile onto a frontier point, and dissolves piles that are stuck for good.',
  params: {
    order: {
      type: 'select', label: 'Which point to pull first',
      options: [['nearest', 'Nearest'], ['farthest', 'Farthest (sweeps more on the way)']], default: 'nearest',
    },
    earlyMerge: { type: 'bool', label: 'Merge unfinished piles early', default: true },
  },
  create(g, p, rng) {
    const pf = new PathFinder(g), queue = [], t = g.t;
    const futile = new Set(); // sites where nothing worked since the last stroke

    const plan = moves => { queue.push(...moves); return queue.shift(); };
    const goAndRake = (at, m) => {
      const path = pf.path(g.raker, at);
      return path ? plan([...walkMoves(path), m]) : null;
    };
    const livePiles = () => g.piles().filter(j => isLivePile(g, j));
    const hasLooseNeighbour = j => g.neighbors(j).some(w => isLoose(g, w));
    // Any real progress means earlier dead ends may have opened up, except pours into full piles: those
    // keep the "stuck" marks so the raker goes on pouring instead of bouncing back to the stuck pile.
    const progress = (mv, pour = false) => { if (!pour) futile.clear(); return mv; };
    // Relay mode: every unfinished pile is stuck (its remaining pulls are bridges), or every pile is full and
    // none has loose points within reach. Points may then gather into a temporary relay pile even past n
    // piles; early merges and dissolving fold relays back in.
    const stuckAll = unfinished => {
      if (unfinished.length) return unfinished.every(j => futile.has(j) || !hasLooseNeighbour(j));
      return g.c.nPiles >= g.n && !livePiles().some(j => !futile.has(j) && hasLooseNeighbour(j));
    };

    // A long stroke through a dense clump can sweep up dozens of points at once, and every point past t
    // spends the shared spare-point budget. Take the first safe stroke (in pull order) that does not push
    // the pile past t; failing that, the one that overshoots least.
    const pickPull = a => {
      const cands = g.neighbors(a).filter(j => isLoose(g, j));
      cands.sort((i, j) => (p.order === 'farthest' ? g.d(a, j) - g.d(a, i) : g.d(a, i) - g.d(a, j)));
      const cap = Math.max(t, g.mass[a]);
      let best = null, bestOver = Infinity;
      for (const o of cands) {
        const pv = g.preview({ type: 'rake', from: o });
        if (!pv.safe) continue;
        const over = Math.max(0, pv.newMassD - cap);
        if (over === 0) return { type: 'rake', from: o };
        if (over < bestOver) { bestOver = over; best = o; }
      }
      return best === null ? null : { type: 'rake', from: best };
    };

    // Smaller unfinished pile into a larger unfinished one within reach, only while the result stays at or
    // below t (two piles of 55 would otherwise make one of 110 and burn the spare points).
    const earlyMerge = () => {
      const small = livePiles().filter(j => g.mass[j] < t);
      for (const P of small) {
        for (const Q of small) {
          if (Q === P || g.mass[Q] < g.mass[P] || g.mass[Q] + g.mass[P] > t || !g.inReach(P, Q)) continue;
          const m = { type: 'rake', from: P };
          const pv = g.previewFrom(Q, m);
          if (pv.safe && pv.newMassD <= t) return goAndRake(Q, m);
        }
      }
      return null;
    };

    // Frontier move: drag the pile at `a` onto a loose neighbour r, preferring an r with loose points of
    // its own beyond the pile's reach (so the pile keeps moving toward work), then the farthest, then the
    // least overshoot past t.
    const frontier = a => {
      const cands = g.neighbors(a).filter(j => isLoose(g, j));
      const ahead = r => g.neighbors(r).some(w => w !== a && isLoose(g, w) && !g.inReach(a, w));
      cands.sort((i, j) => (ahead(j) - ahead(i)) || g.d(a, j) - g.d(a, i));
      let best = -1, bestOver = Infinity;
      for (const r of cands) {
        const pv = g.previewFrom(r, { type: 'rake', from: a });
        if (!pv.safe) continue;
        const over = Math.max(0, pv.newMassD - t);
        if (over < bestOver) { bestOver = over; best = r; }
        if (over === 0) break;
      }
      return best < 0 ? null : plan([{ type: 'walk', to: best }, { type: 'rake', from: a }]);
    };

    // Unfinished piles that cannot grow merge into the neighbour where they overshoot t least. Normally only
    // piles with nothing loose left nearby, and only without overshoot; as a last resort (lenient) any
    // pile that has been tried in vain, accepting the smallest overshoot. Bridges that are unsafe to pull
    // now often become safe once the far side is done, so dissolving early would waste spare points.
    const dissolveStuck = lenient => {
      const stuck = livePiles().filter(j => g.mass[j] < t && (!hasLooseNeighbour(j) || (lenient && futile.has(j))));
      for (const P of stuck) {
        let best = -1, bestOver = Infinity;
        for (const Q of livePiles()) {
          if (Q === P || !g.inReach(Q, P)) continue;
          const pv = g.previewFrom(Q, { type: 'rake', from: P });
          if (!pv.safe) continue;
          const over = Math.max(0, pv.newMassD - Math.max(t, g.mass[Q]));
          if (over < bestOver) { bestOver = over; best = Q; }
        }
        if (best >= 0 && (lenient || bestOver === 0)) { const mv = goAndRake(best, { type: 'rake', from: P }); if (mv) return mv; }
      }
      return null;
    };

    // No loose points left: merge surplus piles, smallest into its largest reachable neighbour.
    const endgame = () => {
      const piles = livePiles().reverse();
      if (piles.length + g.c.detPiles <= g.n) return null;
      for (const S of piles) {
        const into = piles.filter(j => j !== S && g.inReach(j, S)).sort((i, j) => g.mass[j] - g.mass[i]);
        for (const b of into) {
          const m = { type: 'rake', from: S };
          if (g.previewFrom(b, m).safe) { const mv = goAndRake(b, m); if (mv) return mv; }
        }
      }
      return null;
    };

    const destination = (a, unfinished, relay) => {
      const growable = unfinished.filter(j => j !== a && !futile.has(j) && hasLooseNeighbour(j)).sort((i, j) => g.mass[j] - g.mass[i]);
      for (const j of growable) { const path = pf.path(a, j); if (path) return path; }
      if (g.c.nPiles < g.n) return pf.nearest(a, j => isLoose(g, j) && !futile.has(j));
      if (!unfinished.length || relay) {
        const pour = pf.nearest(a, j => isLivePile(g, j) && g.mass[j] >= t && !futile.has(j) && hasLooseNeighbour(j));
        if (pour) return pour;
      }
      if (relay) return pf.nearest(a, j => isLoose(g, j) && !futile.has(j));
      return null;
    };

    return {
      start: () => centralSite(g),
      next() {
        if (queue.length) return queue.shift();
        if (p.earlyMerge) {
          const mv = earlyMerge();
          if (mv) return progress(mv);
        }
        if (g.c.nLoose === 0) return endgame();
        const a = g.raker, here = g.kind[a];
        const unfinished = livePiles().filter(j => g.mass[j] < t);
        const relay = stuckAll(unfinished);
        // Full piles take leftovers once nothing unfinished can use them; the engine's spare-point check
        // refuses any pour that would leave an unfinished pile short.
        const pourHere = here === PILE && g.mass[a] >= t && g.c.nPiles >= g.n && (!unfinished.length || relay);
        const growHere = (here === PILE && g.mass[a] < t) || (here === LOOSE && (g.c.nPiles < g.n || relay)) || pourHere;
        if (growHere) {
          // The user's rule: when an unfinished pile is down to its last loose neighbour r, don't rake r in
          // (that strands the pile in emptied ground); step onto r and move the pile there.
          const unfinishedHere = here === PILE && g.mass[a] < t;
          if (unfinishedHere && g.neighbors(a).filter(j => isLoose(g, j)).length <= 1) {
            const fm = frontier(a);
            if (fm) return progress(fm);
          }
          const mv = pickPull(a);
          if (mv) return progress(mv, pourHere);
          if (unfinishedHere) {
            const fm = frontier(a);
            if (fm) return progress(fm);
          }
        }
        futile.add(a);
        const dm = dissolveStuck(false);
        if (dm) return progress(dm);
        const path = destination(a, unfinished, stuckAll(unfinished));
        if (path && path.length >= 2) return plan(walkMoves(path));
        const last = dissolveStuck(true);
        return last ? progress(last) : null;
      },
    };
  },
};
