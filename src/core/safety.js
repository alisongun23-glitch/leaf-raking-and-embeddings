import { within2, dist2 } from './geometry.js';
import { LOOSE, PILE } from './kinds.js';

// Overflow budget. Final piles each hold at least t and together hold all N points, so their combined
// excess over t is exactly s = N - n*t. Every current pile already at t or more ends inside one final
// pile, so the excess committed so far, plus t for each full pile beyond n (those must merge), can
// never exceed s. Breaking this is "starvation": some pile can no longer reach t.
export function budgetOk(g, excess, nFull) {
  return excess + g.t * Math.max(0, nFull - g.n) <= g.s;
}

const starvation = g => ({
  ok: false,
  reason: 'starvation',
  detail: `this would use more than the ${g.s} spare points, so some pile could no longer reach ${g.t}`,
});

export function startVerdict(g, at) {
  if (g.s < 0) {
    return { ok: false, reason: 'starvation', detail: `only ${g.N} points for ${g.n} piles of ${g.t}` };
  }
  const gen = g.nextGen(), mark = g.scratchMark, q = [at];
  mark[at] = gen;
  let reached = 0;
  for (let h = 0; h < q.length; h++) {
    const v = q[h];
    if (g.kind[v] === LOOSE) reached++;
    g.forEachNeighbor(v, w => {
      if (mark[w] !== gen) { mark[w] = gen; q.push(w); }
    });
  }
  if (reached < g.c.nLoose) {
    return {
      ok: false,
      reason: 'cut-off',
      detail: `${g.c.nLoose - reached} points are out of reach from the start: the field is not connected at this k`,
    };
  }
  return { ok: true };
}

export function foundVerdict(g) {
  // A pile of 1 is only "full" when t = 1; then it counts against the budget like any full pile.
  if (g.t <= 1 && !budgetOk(g, g.c.excess, g.c.nFull + 1)) return starvation(g);
  return { ok: true };
}

// Decides whether a resolved rake keeps the game winnable. Boundary lemma: deleting a set D from a
// connected graph leaves it connected iff every surviving neighbour of D (plus the raker) ends up in one
// component. Search fronts grow round-robin from each of those vertices and merge when they touch, so a
// "safe" answer usually comes after a local search. A front that runs dry has found a separated
// component, which is allowed only if it holds nothing but finished piles (those get frozen).
export function strokeVerdict(g, r) {
  const after = r.after, t = g.t, k = g.k;
  if (!budgetOk(g, after.excess, after.nFull)) return starvation(g);

  const gen = g.nextGen();
  const mark = g.scratchMark, owner = g.scratchOwner, delMark = g.scratchDel;
  for (const j of r.del) delMark[j] = gen;
  const virtual = r.D < 0;
  const V = virtual ? g.size : r.D;
  const vx = virtual ? r.loc.x : g.x[V], vy = virtual ? r.loc.y : g.y[V];
  const R = r.newRaker === -2 ? V : r.newRaker;

  // Neighbours in the graph as it will be after the move.
  const each = (v, fn) => {
    if (virtual && v === V) {
      g.grid.forEachInRect(vx - k, vy - k, vx + k, vy + k, j => {
        if (j !== V && delMark[j] !== gen && g.active(j) && within2(dist2(vx, vy, g.x[j], g.y[j]), k)) fn(j);
      });
      return;
    }
    g.forEachNeighbor(v, j => { if (delMark[j] !== gen) fn(j); });
    if (virtual && within2(dist2(g.x[v], g.y[v], vx, vy), k)) fn(V);
  };
  const massOf = j => (j === V ? r.newMassD : g.mass[j]);
  const isLoose = j => j !== V && g.kind[j] === LOOSE;
  const isPile = j => j === V || g.kind[j] === PILE;

  const src = [R];
  mark[R] = gen;
  for (const j of r.del) {
    g.forEachNeighbor(j, w => {
      if (delMark[w] !== gen && mark[w] !== gen) { mark[w] = gen; src.push(w); }
    });
    if (virtual && mark[V] !== gen && within2(dist2(g.x[j], g.y[j], vx, vy), k)) { mark[V] = gen; src.push(V); }
  }
  const S = src.length;
  if (S === 1) return { ok: true, mode: 'none' };

  const parent = new Int32Array(S), pending = new Int32Array(S);
  const loose = new Int32Array(S), small = new Int32Array(S), full = new Int32Array(S);
  const mass = new Float64Array(S), exc = new Float64Array(S);
  const queues = new Array(S), heads = new Int32Array(S);
  const addTo = (root, j) => {
    const m = massOf(j);
    mass[root] += m;
    if (isLoose(j)) loose[root]++;
    else if (isPile(j)) {
      if (m >= t) { full[root]++; exc[root] += m - t; } else small[root]++;
    }
  };
  const find = i => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (let i = 0; i < S; i++) {
    parent[i] = i; pending[i] = 1; owner[src[i]] = i; queues[i] = [src[i]];
    addTo(i, src[i]);
  }

  let open = S, rakerClosed = false;
  const detachRoots = [];
  search: while (open > 1) {
    let progressed = false;
    for (let i = 0; i < S; i++) {
      const q = queues[i];
      if (heads[i] >= q.length) continue;
      const v = q[heads[i]++];
      progressed = true;
      pending[find(i)]--;
      each(v, w => {
        const ri = find(i);
        if (mark[w] === gen) {
          const rw = find(owner[w]);
          if (rw !== ri) { // two fronts touched: merge them
            parent[rw] = ri;
            pending[ri] += pending[rw]; loose[ri] += loose[rw]; small[ri] += small[rw];
            full[ri] += full[rw]; mass[ri] += mass[rw]; exc[ri] += exc[rw];
            open--;
          }
          return;
        }
        mark[w] = gen; owner[w] = i; q.push(w); pending[ri]++;
        addTo(ri, w);
      });
      if (open <= 1) break search;
      const ri = find(i);
      if (pending[ri] === 0) { // this front ran dry: it is a whole component
        open--;
        if (ri === find(0)) { rakerClosed = true; break search; }
        if (loose[ri] > 0 || small[ri] > 0) return cutOff(loose[ri], small[ri]);
        detachRoots.push(ri);
      }
    }
    if (!progressed) break;
  }

  const rootR = find(0);
  let mode = 'none', outFull = 0, outMass = 0, outExc = 0, list = null;
  if (rakerClosed) {
    const outLoose = after.nLoose - loose[rootR], outSmall = after.nSmall - small[rootR];
    if (outLoose > 0 || outSmall > 0) return cutOff(outLoose, outSmall);
    outFull = after.nFull - g.c.detPiles - full[rootR];
    outMass = g.N - g.c.detMass - mass[rootR];
    outExc = after.excess - g.c.detExcess - exc[rootR];
    if (outMass > 0) mode = 'others';
  } else if (detachRoots.length) {
    const roots = new Set(detachRoots);
    list = [];
    for (let i = 0; i < S; i++) if (roots.has(find(i))) for (const v of queues[i]) list.push(v);
    for (const ri of detachRoots) { outFull += full[ri]; outMass += mass[ri]; outExc += exc[ri]; }
    mode = 'groups';
  }
  const frozen = g.c.detPiles + outFull;
  if (frozen > g.n - 1) {
    return {
      ok: false,
      reason: 'too-many-piles',
      detail: `${frozen} finished piles would be cut off, leaving no room for the pile still being built (n = ${g.n})`,
    };
  }
  return {
    ok: true,
    mode,
    list,
    outside: { full: outFull, mass: outMass, excess: outExc },
    inRakerComponent: j => mark[j] === gen && find(owner[j]) === rootR,
  };
}

function cutOff(nLoose, nSmall) {
  if (nLoose > 0) {
    return { ok: false, reason: 'cut-off', detail: `${nLoose} loose point${nLoose > 1 ? 's' : ''} would be cut off from the raker` };
  }
  return { ok: false, reason: 'cut-off-pile', detail: `${nSmall} unfinished pile${nSmall > 1 ? 's' : ''} would be cut off from the raker` };
}

// Component id of every live site (-1 for empty or frozen sites), for overlays and analysis.
export function componentLabels(g) {
  const lab = new Int32Array(g.size).fill(-1);
  let id = 0;
  for (let s = 0; s < g.size; s++) {
    if (!g.active(s) || lab[s] >= 0) continue;
    const q = [s];
    lab[s] = id;
    for (let h = 0; h < q.length; h++) {
      g.forEachNeighbor(q[h], w => { if (lab[w] < 0) { lab[w] = id; q.push(w); } });
    }
    id++;
  }
  return lab;
}

// Articulation points of the live reach graph (iterative Hopcroft-Tarjan): removing one of these
// splits the graph, so they are the "rake later" points.
export function articulationPoints(g) {
  const n = g.size, disc = new Int32Array(n).fill(-1), low = new Int32Array(n), par = new Int32Array(n).fill(-1);
  const cut = new Uint8Array(n);
  let time = 0;
  for (let root = 0; root < n; root++) {
    if (!g.active(root) || disc[root] >= 0) continue;
    disc[root] = low[root] = time++;
    const stack = [root], nbs = [g.neighbors(root)], idx = [0];
    let rootKids = 0;
    while (stack.length) {
      const top = stack.length - 1, v = stack[top], nb = nbs[top];
      if (idx[top] < nb.length) {
        const w = nb[idx[top]++];
        if (disc[w] < 0) {
          par[w] = v; disc[w] = low[w] = time++;
          if (v === root) rootKids++;
          stack.push(w); nbs.push(g.neighbors(w)); idx.push(0);
        } else if (w !== par[v] && disc[w] < low[v]) {
          low[v] = disc[w];
        }
      } else {
        stack.pop(); nbs.pop(); idx.pop();
        const p = par[v];
        if (p >= 0) {
          if (low[v] < low[p]) low[p] = low[v];
          if (p !== root && low[v] >= disc[p]) cut[p] = 1;
        }
      }
    }
    if (rootKids > 1) cut[root] = 1;
  }
  return cut;
}
