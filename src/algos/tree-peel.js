import { PILE, LOOSE } from '../core/kinds.js';
import { PathFinder, walkMoves, liveTree, centralSite } from './util.js';

// Spanning-tree peel (research report §4, "rake from the parent"). Take a spanning tree of the live reach
// graph rooted at the last pile, and repeatedly rake a node whose subtree is finished into its parent:
// removing a tree leaf never disconnects the tree, so with l = 0 this can never cut work off, and the
// user's frontier move is exactly the moment a pile becomes a leaf. A finished subtree becomes a final
// pile once it holds t points and the remaining points can still fill the other piles.
//
// It also accepts a half-finished game (ctx.root, ctx.finals), which is how planned-sites hands over.
export default {
  id: 'tree-peel',
  name: 'Spanning-tree peel',
  blurb: 'Rakes spanning-tree leaves into their parents, so it never cuts anything off. A subtree becomes a finished pile once it holds t and the rest can still fill the other piles.',
  params: {
    root: { type: 'select', label: 'Last pile (tree root)', options: [['center', 'Most central point'], ['random', 'Random point']], default: 'center' },
    shortcut: { type: 'bool', label: 'Rake straight to the farthest ancestor within k', default: true },
    childOrder: { type: 'select', label: 'Branch order', options: [['near', 'Near branches first'], ['far', 'Far branches first']], default: 'near' },
  },
  create(g, p, rng, ctx = {}) {
    const pf = new PathFinder(g), queue = [], t = g.t;
    const final = new Uint8Array(g.cap);
    let finals = 0, finalMass = 0;
    for (const j of ctx.finals || []) {
      if (g.kind[j] === PILE && !final[j]) { final[j] = 1; finals++; finalMass += g.mass[j]; }
    }
    let root = ctx.root ?? -1, tree = null, pending = null, planned = null, idx = 0, dirty = true;
    const blocked = new Set();

    // After each rebuild, plan the cuts bottom-up (greedy tree partition): a node whose subtree, minus
    // subtrees already planned as piles, reaches t becomes a planned pile. Shortcut strokes may jump up
    // to a planned pile but never past one, so piles still form low in the tree with little overshoot.
    const rebuild = () => {
      tree = liveTree(g, root, p.childOrder);
      pending = new Int32Array(g.N);
      planned = new Uint8Array(g.N);
      const acc = new Float64Array(g.N);
      let nPlanned = finals, plannedMass = finalMass;
      for (const v of tree.post) {
        const par = tree.parent[v];
        if (v !== root && !final[v]) pending[par]++;
        if (final[v]) continue;
        acc[v] += g.mass[v];
        if (v !== root && acc[v] >= t && nPlanned < g.n - 1 && g.N - plannedMass - acc[v] >= (g.n - 1 - nPlanned) * t) {
          planned[v] = 1;
          nPlanned++;
          plannedMass += acc[v];
        } else if (par >= 0) acc[par] += acc[v];
      }
      idx = 0;
      dirty = false;
      blocked.clear();
    };
    const parentOf = v => (v < g.N ? tree.parent[v] : -2);
    const done = v => { const par = parentOf(v); if (par >= 0) pending[par]--; };
    // Records the effect of a planned stroke on the tree (the moves are applied right after).
    const account = (v, target, pv) => {
      done(v);
      if (final[target]) finalMass += pv.massMoved;
      for (const c of pv.captured) {
        if (c === root) { root = target; dirty = true; continue; } // only when strokes drag piles
        if (final[c]) { final[c] = 0; finals--; finalMass -= g.mass[c]; dirty = true; continue; }
        if (c >= g.N || parentOf(c) === -2 || pending[c] > 0) { dirty = true; continue; }
        done(c);
      }
    };
    // Only planned piles are cut, so the partition stays the one that was planned; a planned pile that
    // came up short (captures moved its points elsewhere) triggers a replan instead.
    const canCut = v => {
      if (!planned[v]) return false;
      const ok = g.kind[v] === PILE && g.mass[v] >= t && finals < g.n - 1 && g.N - finalMass - g.mass[v] >= (g.n - 1 - finals) * t;
      if (!ok) dirty = true;
      return ok;
    };
    // When the stroke into the tree parent is refused (say it would starve a pile still short of t), the
    // nearest pile short of t within reach may take the point instead. After a handover from planned-sites
    // the root can already be full while a neighbouring pile waits for its last point.
    const shortPileNear = (v, not) => {
      let best = -1, bd = Infinity;
      g.forEachNeighbor(v, w => {
        if (w === not || g.kind[w] !== PILE || final[w] || g.mass[w] >= t) return;
        const d = g.d(v, w);
        if (d < bd) { bd = d; best = w; }
      });
      return best;
    };
    const targetFor = v => {
      const u = parentOf(v);
      if (u < 0) return -1;
      if (!g.active(u)) { dirty = true; return -1; }
      if (!p.shortcut || final[u] || planned[u]) return u;
      let best = u;
      for (let w = parentOf(u); w >= 0; w = parentOf(w)) {
        if (!g.active(w) || final[w] || !g.inReach(v, w)) break;
        best = w;
        if (planned[w]) break; // collect into a planned pile, never past it
      }
      return best;
    };

    return {
      start() {
        if (root < 0) root = p.root === 'random' ? rng.int(g.N) : centralSite(g);
        return root;
      },
      next() {
        if (queue.length) return queue.shift();
        if (root < 0) root = g.raker;
        // Found the root first so no stroke elsewhere can sweep it away.
        if (g.kind[root] === LOOSE) {
          if (g.raker === root) return { type: 'found' };
          const path = pf.path(g.raker, root);
          if (!path) return null;
          queue.push(...walkMoves(path), { type: 'found' });
          return queue.shift();
        }
        for (let pass = 0; pass < 2; pass++) {
          if (dirty || !tree) rebuild();
          while (idx < tree.post.length && (!g.active(tree.post[idx]) || final[tree.post[idx]])) idx++;
          for (let q = idx; q < tree.post.length; q++) {
            const v = tree.post[q];
            if (v === root || final[v] || pending[v] > 0 || blocked.has(v) || !g.active(v)) continue;
            if (canCut(v)) {
              final[v] = 1; finals++; finalMass += g.mass[v];
              done(v);
              continue;
            }
            if (dirty) break;
            let target = targetFor(v);
            if (dirty) break;
            if (target < 0) continue;
            const m = { type: 'rake', from: v };
            let pv = g.previewFrom(target, m);
            if (!pv.safe) {
              const alt = shortPileNear(v, target);
              const pa = alt >= 0 ? g.previewFrom(alt, m) : null;
              if (!pa || !pa.safe) { blocked.add(v); continue; }
              target = alt; pv = pa;
              dirty = true; // the point left the tree by another route
            }
            const path = pf.path(g.raker, target);
            if (!path) { blocked.add(v); continue; }
            account(v, target, pv);
            blocked.clear(); // the field changed, so earlier refusals may no longer apply
            queue.push(...walkMoves(path), m);
            return queue.shift();
          }
          dirty = true; // nothing doable on this tree: rebuild once from the current position, then give up
        }
        return null;
      },
    };
  },
};
