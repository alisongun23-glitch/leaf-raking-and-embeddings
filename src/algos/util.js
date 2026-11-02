import { LOOSE, PILE } from '../core/kinds.js';

// Shared tools for algorithms: routes over the live reach graph, spanning trees, small heaps.

export class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.keys.length; }
  push(key, val) {
    const k = this.keys, v = this.vals;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.keys, v = this.vals, top = v[0], lastK = k.pop(), lastV = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return top;
  }
}

// Shortest walking routes (sum of step lengths) over live sites, reusing stamped scratch arrays.
export class PathFinder {
  constructor(g) {
    this.g = g;
    this.gen = 0;
    this.seen = new Int32Array(g.cap);
    this.done = new Int32Array(g.cap);
    this.cost = new Float64Array(g.cap);
    this.prev = new Int32Array(g.cap);
  }

  trace(from, to) {
    const p = [to];
    while (p[p.length - 1] !== from) p.push(this.prev[p[p.length - 1]]);
    return p.reverse();
  }

  // A* from `from` to `to` with the straight-line distance as heuristic; null if unreachable.
  path(from, to) {
    const g = this.g;
    if (from === to) return [from];
    const gen = ++this.gen, { seen, done, cost, prev } = this;
    const tx = g.x[to], ty = g.y[to], h = j => Math.hypot(g.x[j] - tx, g.y[j] - ty);
    const heap = new MinHeap();
    seen[from] = gen; cost[from] = 0; heap.push(h(from), from);
    while (heap.size) {
      const v = heap.pop();
      if (done[v] === gen) continue;
      done[v] = gen;
      if (v === to) return this.trace(from, to);
      const cv = cost[v];
      g.forEachNeighbor(v, w => {
        if (done[w] === gen) return;
        const c = cv + g.d(v, w);
        if (seen[w] !== gen || c < cost[w]) { seen[w] = gen; cost[w] = c; prev[w] = v; heap.push(c + h(w), w); }
      });
    }
    return null;
  }

  // Dijkstra from `from` to the closest site (by walking distance) satisfying pred; null if none.
  nearest(from, pred) {
    const g = this.g, gen = ++this.gen, { seen, done, cost, prev } = this, heap = new MinHeap();
    seen[from] = gen; cost[from] = 0; heap.push(0, from);
    while (heap.size) {
      const v = heap.pop();
      if (done[v] === gen) continue;
      done[v] = gen;
      if (v !== from && pred(v)) return this.trace(from, v);
      const cv = cost[v];
      g.forEachNeighbor(v, w => {
        if (done[w] === gen) return;
        const c = cv + g.d(v, w);
        if (seen[w] !== gen || c < cost[w]) { seen[w] = gen; cost[w] = c; prev[w] = v; heap.push(c, w); }
      });
    }
    return null;
  }

  // Shortest-path tree from `source` over sites allowed(j) (source always allowed), using only edges
  // edgeOk(child, parent) accepts when given. Returns maps site -> parent and site -> distance for every
  // reached site.
  tree(source, allowed, edgeOk = null) {
    const g = this.g, parent = new Map([[source, -1]]), dist = new Map([[source, 0]]), heap = new MinHeap(), fixed = new Set();
    heap.push(0, source);
    while (heap.size) {
      const v = heap.pop();
      if (fixed.has(v)) continue;
      fixed.add(v);
      const dv = dist.get(v);
      g.forEachNeighbor(v, w => {
        if (fixed.has(w) || !allowed(w)) return;
        const c = dv + g.d(v, w);
        if ((!dist.has(w) || c < dist.get(w)) && (!edgeOk || edgeOk(w, v))) { dist.set(w, c); parent.set(w, v); heap.push(c, w); }
      });
    }
    return { parent, dist };
  }
}

export const walkMoves = path => path.slice(1).map(v => ({ type: 'walk', to: v }));

// Minimum spanning tree of the live reach graph (original sites only), by Kruskal over the presorted
// static edges, oriented away from `root`. post lists sites children-first (depth-first post-order, so
// one subtree is finished before the next starts); children are visited nearest-first or farthest-first.
export function liveTree(g, root, childOrder = 'near') {
  const N = g.N, uf = new Int32Array(N);
  for (let i = 0; i < N; i++) uf[i] = i;
  const find = i => { while (uf[i] !== i) { uf[i] = uf[uf[i]]; i = uf[i]; } return i; };
  const adj = new Map();
  const link = (a, b) => { let l = adj.get(a); if (!l) adj.set(a, (l = [])); l.push(b); };
  const { edgeU, edgeV, edgeCount } = g.graph;
  for (let e = 0; e < edgeCount; e++) {
    const u = edgeU[e], v = edgeV[e];
    if (!g.active(u) || !g.active(v)) continue;
    const a = find(u), b = find(v);
    if (a === b) continue;
    uf[a] = b;
    link(u, v); link(v, u);
  }
  const parent = new Int32Array(N).fill(-2); // -2: not in the root's tree
  const children = new Map(), post = [];
  parent[root] = -1;
  const rx = g.x[root], ry = g.y[root];
  const stack = [[root, null, 0]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top[1] === null) {
      const kids = (adj.get(top[0]) || []).filter(w => parent[w] === -2);
      for (const w of kids) parent[w] = top[0];
      const far = w => Math.hypot(g.x[w] - rx, g.y[w] - ry);
      kids.sort((a, b) => (childOrder === 'far' ? far(b) - far(a) : far(a) - far(b)));
      children.set(top[0], kids);
      top[1] = kids;
    }
    if (top[2] < top[1].length) stack.push([top[1][top[2]++], null, 0]);
    else { post.push(top[0]); stack.pop(); }
  }
  return { parent, children, post };
}

// The site nearest the centroid of all live points: a cheap central root.
export function centralSite(g) {
  let cx = 0, cy = 0, m = 0;
  for (let j = 0; j < g.size; j++) if (g.active(j)) { cx += g.x[j]; cy += g.y[j]; m++; }
  cx /= m; cy /= m;
  let best = -1, bd = Infinity;
  for (let j = 0; j < g.size; j++) {
    if (!g.active(j)) continue;
    const d = Math.hypot(g.x[j] - cx, g.y[j] - cy);
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

export const isLoose = (g, j) => g.kind[j] === LOOSE && g.detached[j] === 0;
export const isLivePile = (g, j) => g.kind[j] === PILE && g.detached[j] === 0;
