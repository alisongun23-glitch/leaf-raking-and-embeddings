import { PathFinder, walkMoves, isLoose, isLivePile } from './util.js';

// The prototype's greedy: stand on a pile and pull the nearest point that is safe to pull until the pile
// reaches t, then walk to the nearest loose point and start the next pile; once everything is in piles,
// merge the smallest piles into a neighbour within k. It never plans ahead, which is the point: it
// fragments the field into many piles that end up out of each other's reach.
export default {
  id: 'greedy-nearest',
  name: 'Greedy nearest',
  blurb: 'Pulls the nearest safe point into the current pile until it holds t, then starts a pile at the nearest loose point, and merges leftovers at the end. The "what not to do" baseline.',
  params: {},
  create(g, p, rng) {
    const pf = new PathFinder(g), queue = [];
    const stuck = new Set(); // sites where no safe pull was found since the last stroke

    const mergeStep = () => {
      const piles = g.piles().filter(j => isLivePile(g, j)).reverse(); // smallest first
      if (piles.length + g.c.detPiles <= g.n) return null;
      for (const S of piles) {
        const into = piles.filter(j => j !== S && g.inReach(j, S)).sort((i, j) => g.d(S, i) - g.d(S, j));
        for (const b of into) {
          const m = { type: 'rake', from: S };
          if (!g.previewFrom(b, m).safe) continue;
          const path = pf.path(g.raker, b);
          if (!path) continue;
          queue.push(...walkMoves(path), m);
          return queue.shift();
        }
      }
      return null;
    };

    return {
      start: () => rng.int(g.N),
      next() {
        if (queue.length) return queue.shift();
        const a = g.raker;
        if (g.c.nLoose === 0) return mergeStep();
        if (g.mass[a] < g.t) {
          const cands = g.neighbors(a).filter(j => isLoose(g, j)).sort((i, j) => g.d(a, i) - g.d(a, j));
          for (const o of cands) {
            const m = { type: 'rake', from: o };
            if (g.isSafe(m)) { stuck.clear(); return m; }
          }
          stuck.add(a);
        }
        const path = g.c.nLoose ? pf.nearest(a, j => isLoose(g, j) && !stuck.has(j)) : null;
        if (!path) return null;
        queue.push(...walkMoves(path));
        return queue.shift();
      },
    };
  },
};
