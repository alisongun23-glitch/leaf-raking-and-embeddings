import { PILE, LOOSE } from '../core/kinds.js';
import { PathFinder, MinHeap, walkMoves } from './util.js';
import { sitingHeuristic } from '../analysis/siting.js';
import treePeel from './tree-peel.js';

const TREE_PARAMS = Object.freeze({ root: 'center', shortcut: true, childOrder: 'near' });

// Plan, then rake (research report §4, "site piles first, rake along spokes").
//  1. Siting: n pile sites at group medians, every group holding at least t points (min-size assignment).
//  2. Groups must be connected in the reach graph; stray pieces join a neighbouring group.
//  3. Groups form a tree, processed children first. A finished pile sits in the middle of its emptied
//     group, out of reach of everything else, so each group gets an exit trail: the points on the
//     shortest route from its site to its parent group are handed to the parent and raked later. The
//     route keeps more than l from the site, since every stroke into the site sweeps up that disc.
//     No stroke sweeps up a trail point before the trail's group is done. Otherwise the group's own
//     relays become the only way out, can never be raked home, and the tree peel drags them (and every
//     group they link) across the field at the end.
//  4. Each group is raked farthest-first along a shortest-path tree into its site, each point going
//     straight to the farthest tree ancestor within k (relays only where the group is wider than k).
//     The tree only uses steps whose stroke would leave the waiting trails alone. A group still short
//     of t once nothing else is left takes its last points anyway, trails or not.
//  5. Once every group is done, groups with points left get a second pass (whatever linked a group
//     still waiting may be free now). Anything still left over (or any broken plan) is handed to the
//     tree peel, with the finished sites as final piles.
export default {
  id: 'planned-sites',
  name: 'Planned sites + spokes',
  blurb: 'Picks n pile sites at group medians so each group holds at least t, gives every group an exit trail owned by its neighbour, then rakes each group farthest-first along spokes into its site. Hands leftovers to the tree peel.',
  params: {
    rounds: { type: 'int', label: 'Siting refinement rounds', min: 0, max: 10, step: 1, default: 4 },
    shortcut: { type: 'bool', label: 'Rake straight to the farthest spoke point within k', default: true },
  },
  create(g, p, rng) {
    const pf = new PathFinder(g), queue = [], t = g.t;
    const built = buildPlan(g, p), plan = built.failed ? null : built;
    let fallback = plan ? null : treePeel.create(g, TREE_PARAMS, rng);
    let gi = 0, leftover = plan ? -1 : g.N, early = false, handoverWork = null;
    let again = 0, revisiting = false, progress = false; // the second pass over the groups
    const spt = new Map();

    const handOver = (broken = false) => {
      leftover = g.c.nLoose;
      early = broken;
      handoverWork = g.c.work;
      const root = plan.sites[plan.rootGroup];
      const finals = plan.sites.filter((s, G) => G !== plan.rootGroup && g.kind[s] === PILE && g.mass[s] >= t);
      fallback = treePeel.create(g, TREE_PARAMS, rng, { root, finals });
      return fallback.next();
    };

    // A trail point stays guarded until its group is done, since the raker leaves that group along it.
    // Points within l of the site being raked are swept up by every stroke into it, so they cannot be.
    const guarded = (c, B) => plan.trailOf[c] >= 0 && !plan.processed[plan.trailOf[c]] && g.d(c, plan.sites[B]) > g.l;
    const sparesTrails = (from, to, B) => !g.capsule(g.x[from], g.y[from], g.x[to], g.y[to], from, to).some(c => guarded(c, B));

    // relaxed: the group is short of t with nothing else left to do, so its last strokes may sweep trails.
    const buildSpt = (B, relaxed = false) => {
      const s = plan.sites[B];
      const waiting = !relaxed && plan.order.some(G => G !== plan.rootGroup && !plan.processed[G]); // a trail is still guarded
      const { parent, dist } = pf.tree(s, j => plan.owner[j] === B, waiting ? (from, to) => sparesTrails(from, to, B) : null);
      const order = [...dist.keys()].filter(v => v !== s).sort((a, b) => dist.get(b) - dist.get(a));
      const children = new Map();
      for (const [v, par] of parent) {
        if (par < 0) continue;
        let l = children.get(par);
        if (!l) children.set(par, (l = []));
        l.push(v);
      }
      return { parent, order, children, ptr: 0, blocked: new Set(), dirty: false, relaxed };
    };

    // Live tree ancestors of v within k, nearest first (the climb stops at the first one out of reach).
    const ancestorsInReach = (tr, v) => {
      const out = [];
      for (let w = tr.parent.get(v); w !== undefined && w >= 0; w = tr.parent.get(w)) {
        if (!g.active(w)) continue;
        if (!g.inReach(v, w)) break;
        out.push(w);
      }
      return out;
    };

    // A stroke may sweep up points of other groups, but never a site, never a guarded trail point (unless
    // relaxed), and never leave a group that is still waiting its turn with fewer than t points.
    const allowed = (pv, B, relaxed = false) => {
      const take = new Map();
      for (const c of pv.captured) {
        if (plan.siteOf[c] >= 0 || (!relaxed && guarded(c, B))) return false;
        const G = plan.owner[c];
        if (G !== B && !plan.processed[G]) take.set(G, (take.get(G) || 0) + g.mass[c]);
      }
      for (const [G, m] of take) if (plan.potential[G] - m < t) return false;
      return true;
    };

    const commit = (pv, B, tr) => {
      for (const c of pv.captured) {
        const G = plan.owner[c];
        if (G !== B) { plan.potential[G] -= g.mass[c]; plan.potential[B] += g.mass[c]; }
        const kids = tr.children.get(c);
        if (kids && kids.some(x => g.active(x) && x !== pv.from && !pv.captured.includes(x))) tr.dirty = true;
      }
    };

    const stepGroup = B => {
      let tr = spt.get(B);
      if (!tr || tr.dirty) { tr = buildSpt(B, tr?.relaxed); spt.set(B, tr); }
      const s = plan.sites[B];
      while (tr.ptr < tr.order.length && !g.active(tr.order[tr.ptr])) tr.ptr++;
      for (let q = tr.ptr; q < tr.order.length; q++) {
        const v = tr.order[q];
        if (v === s || !g.active(v) || plan.owner[v] !== B || tr.blocked.has(v)) continue;
        const ups = ancestorsInReach(tr, v);
        if (!ups.length) {
          if (!tr.rebuilt) { tr.dirty = true; tr.rebuilt = true; return stepGroup(B); }
          tr.blocked.add(v);
          continue;
        }
        // straight to the farthest ancestor within k (with shortcut), else the nearest one that works
        const m = { type: 'rake', from: v };
        let u = -1, pv = null;
        for (let i = p.shortcut ? ups.length - 1 : 0; i >= 0 && u < 0; i--) {
          const pr = g.previewFrom(ups[i], m);
          if (pr.safe && allowed(pr, B, tr.relaxed)) { u = ups[i]; pv = pr; }
        }
        if (u < 0) { tr.blocked.add(v); continue; }
        const path = pf.path(g.raker, u);
        if (!path) { tr.blocked.add(v); continue; }
        commit(pv, B, tr);
        tr.blocked.clear();
        tr.rebuilt = false;
        queue.push(...walkMoves(path), m);
        return queue.shift();
      }
      // nothing left that spares the trails: a site still short of t takes its last points anyway
      if (!tr.relaxed && g.kind[s] === PILE && g.mass[s] < t) { spt.set(B, buildSpt(B, true)); return stepGroup(B); }
      return null;
    };

    return {
      start() {
        return fallback ? fallback.start() : plan.sites[plan.order[0]];
      },
      next() {
        if (fallback) return fallback.next();
        if (queue.length) return queue.shift();
        while (gi < plan.order.length) {
          const B = plan.order[gi], s = plan.sites[B];
          if (!g.active(s)) return handOver(true);
          if (g.kind[s] === LOOSE) { // found the site first so no stroke can sweep it away
            if (g.raker === s) return { type: 'found' };
            const path = pf.path(g.raker, s);
            if (!path) return handOver(true);
            queue.push(...walkMoves(path), { type: 'found' });
            return queue.shift();
          }
          const mv = stepGroup(B);
          if (mv) return mv;
          plan.processed[B] = 1;
          gi++;
        }
        // the second pass (step 5), round after round while it moves anything
        while (again < plan.order.length * 8) {
          const B = plan.order[again % plan.order.length];
          if (!revisiting) { const tr = spt.get(B); if (tr) tr.dirty = true; revisiting = true; }
          const mv = g.active(plan.sites[B]) ? stepGroup(B) : null;
          if (mv) { progress = true; return mv; }
          revisiting = false;
          again++;
          if (again % plan.order.length === 0) { if (!progress) break; progress = false; }
        }
        return handOver();
      },
      // How the run went: 'no plan' (tree peel from the first move; why says which check failed),
      // 'broken' (handed over before every group was raked) or 'complete'; leftover = loose points the
      // tree peel inherited, handoverWork = the work done before it took over (null if it never did).
      // regime is the coarse label sweeps fit separately.
      stats() {
        const outcome = !plan ? 'no plan' : early ? 'broken' : 'complete';
        return {
          plan: outcome, regime: plan ? 'planned' : 'tree peel', why: built.failed || null, margin: plan ? plan.margin : null,
          groupsRaked: !plan ? 0 : early ? gi : plan.order.length, leftover: Math.max(0, leftover), handoverWork: plan ? handoverWork : 0,
        };
      },
    };
  },
};

// Builds the plan on the untouched field, or returns { failed: reason } when it cannot (the caller falls
// back). Exit trails and repairs can take a point or two from a group the siting filled to exactly t, so
// a group that falls short is retried with sites that must hold a few points more (a margin), as far as
// the spare points allow. Without this, a single extra leaf could decide between a plan and the tree peel.
function buildPlan(g, p) {
  const N = g.N, n = g.n, t = g.t;
  if (N < n * t || g.raker !== -1) return { failed: 'too few points' };
  const maxMargin = Math.floor((N - n * t) / n);
  let margin = 0, out = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    out = planFor(g, p, t + margin);
    if (!out.failed) { out.margin = margin; return out; }
    if (!(out.short > 0) || margin >= maxMargin) break;
    margin = Math.min(maxMargin, margin + out.short + attempt);
  }
  return out;
}

// One planning attempt with every group sited to hold at least tSite points (tSite >= t).
function planFor(g, p, tSite) {
  const N = g.N, n = g.n, t = g.t;
  const xs = g.x.subarray(0, N), ys = g.y.subarray(0, N);
  const siting = sitingHeuristic(xs, ys, n, tSite, g.W, g.H, p.rounds);
  const owner = Int32Array.from(siting.assign);
  const sites = siting.sites.slice();
  if (!repairGroups(g, owner, sites)) return { failed: 'a group cannot reach its site' };

  const adj = Array.from({ length: n }, () => new Set());
  const { edgeU, edgeV, edgeCount } = g.graph;
  for (let e = 0; e < edgeCount; e++) {
    const a = owner[edgeU[e]], b = owner[edgeV[e]];
    if (a !== b) { adj[a].add(b); adj[b].add(a); }
  }
  let cx = 0, cy = 0;
  for (let j = 0; j < N; j++) { cx += xs[j]; cy += ys[j]; }
  cx /= N; cy /= N;
  let rootGroup = 0;
  for (let G = 1; G < n; G++) {
    if (Math.hypot(xs[sites[G]] - cx, ys[sites[G]] - cy) < Math.hypot(xs[sites[rootGroup]] - cx, ys[sites[rootGroup]] - cy)) rootGroup = G;
  }
  const parentGroup = new Int32Array(n).fill(-2);
  parentGroup[rootGroup] = -1;
  const bfs = [rootGroup];
  for (let h = 0; h < bfs.length; h++) {
    for (const H of adj[bfs[h]]) if (parentGroup[H] === -2) { parentGroup[H] = bfs[h]; bfs.push(H); }
  }
  if (bfs.length < n) return { failed: 'groups do not touch' };
  const kids = Array.from({ length: n }, () => []);
  for (let G = 0; G < n; G++) if (parentGroup[G] >= 0) kids[parentGroup[G]].push(G);
  const order = [];
  const visit = G => { for (const H of kids[G]) visit(H); order.push(G); };
  visit(rootGroup);

  // Exit trails: the interior of the shortest route from each site to its parent group joins the parent.
  // trailOf marks whose trail a point is on (-1: none).
  const trailOf = new Int32Array(N).fill(-1);
  for (const B of order) {
    if (B === rootGroup) continue;
    const A = parentGroup[B];
    const path = groupRoute(g, owner, sites[B], B, A, g.l) || groupRoute(g, owner, sites[B], B, A);
    if (!path) return { failed: 'no exit trail' };
    for (const v of path.slice(1, -1)) { owner[v] = A; trailOf[v] = B; }
  }
  if (!repairGroups(g, owner, sites)) return { failed: 'a group cannot reach its site after the exit trails' };
  const potential = new Float64Array(n);
  for (let j = 0; j < N; j++) potential[owner[j]]++;
  let short = 0;
  for (let G = 0; G < n; G++) short = Math.max(short, t - potential[G]);
  if (short > 0) return { failed: 'a group falls short of t after repairs', short };
  const siteOf = new Int32Array(g.cap).fill(-1);
  sites.forEach((s, G) => { siteOf[s] = G; });
  return { owner, sites, siteOf, order, parentGroup, rootGroup, potential, trailOf, processed: new Uint8Array(n) };
}

// Every group must be connected (in the reach graph) to its own site. Points that are not get handed to
// the neighbouring group with the nearest site, repeatedly, until every group is connected.
function repairGroups(g, owner, sites) {
  const N = g.N, { off, nbr } = g.graph;
  for (let pass = 0; pass < 200; pass++) {
    const reached = new Uint8Array(N);
    sites.forEach((s, G) => {
      owner[s] = G;
      const q = [s];
      reached[s] = 1;
      for (let h = 0; h < q.length; h++) {
        const v = q[h];
        for (let e = off[v]; e < off[v + 1]; e++) {
          const w = nbr[e];
          if (!reached[w] && owner[w] === G) { reached[w] = 1; q.push(w); }
        }
      }
    });
    let stray = 0, moved = 0;
    for (let j = 0; j < N; j++) {
      if (reached[j]) continue;
      stray++;
      let best = -1, bd = Infinity;
      for (let e = off[j]; e < off[j + 1]; e++) {
        const w = nbr[e];
        if (!reached[w]) continue;
        const G = owner[w], s = sites[G], d = Math.hypot(g.x[j] - g.x[s], g.y[j] - g.y[s]);
        if (d < bd) { bd = d; best = G; }
      }
      if (best >= 0) { owner[j] = best; moved++; }
    }
    if (stray === 0) return true;
    if (moved === 0) return false;
  }
  return false;
}

// Shortest route (Dijkstra over the static graph) from `from` through members of groups B and A to the
// first member of A, kept more than `clear` from `from` (every stroke into `from` sweeps up that disc).
function groupRoute(g, owner, from, B, A, clear = 0) {
  const { off, nbr } = g.graph, dist = new Map([[from, 0]]), prev = new Map(), heap = new MinHeap(), fixed = new Set();
  heap.push(0, from);
  while (heap.size) {
    const v = heap.pop();
    if (fixed.has(v)) continue;
    fixed.add(v);
    if (owner[v] === A) {
      const path = [v];
      while (path[path.length - 1] !== from) path.push(prev.get(path[path.length - 1]));
      return path.reverse();
    }
    for (let e = off[v]; e < off[v + 1]; e++) {
      const w = nbr[e];
      if (fixed.has(w) || (owner[w] !== A && owner[w] !== B) || (clear > 0 && g.d(from, w) <= clear)) continue;
      const c = dist.get(v) + g.d(v, w);
      if (!dist.has(w) || c < dist.get(w)) { dist.set(w, c); prev.set(w, v); heap.push(c, w); }
    }
  }
  return null;
}
