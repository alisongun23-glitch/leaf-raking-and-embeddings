import { within2, dist2 } from './geometry.js';

// Upper limit on stored neighbour links; past this the reach is so large that the graph would not
// fit comfortably in memory, and the caller gets a readable error instead.
const MAX_DIRECTED_LINKS = 4_000_000;

// Uniform grid over the field. Sites are bucketed by cell so neighbourhood and capsule queries only
// look at nearby cells. Original sites use a static CSR layout; sites created later (free pile
// placement) go into a small per-cell map.
export class Grid {
  constructor(xs, ys, count, W, H, cell) {
    this.cell = Math.max(cell, Math.max(W, H) / 1024, 1e-9);
    this.nx = Math.floor(W / this.cell) + 1;
    this.ny = Math.floor(H / this.cell) + 1;
    const nc = this.nx * this.ny;
    const start = new Int32Array(nc + 1), cellOf = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const c = this.cellIndex(xs[i], ys[i]);
      cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < nc; c++) start[c + 1] += start[c];
    const fill = start.slice(0, nc), items = new Int32Array(count);
    for (let i = 0; i < count; i++) items[fill[cellOf[i]]++] = i;
    this.start = start;
    this.items = items;
    this.extra = null;
  }

  col(x) { const c = Math.floor(x / this.cell); return c < 0 ? 0 : c >= this.nx ? this.nx - 1 : c; }
  row(y) { const r = Math.floor(y / this.cell); return r < 0 ? 0 : r >= this.ny ? this.ny - 1 : r; }
  cellIndex(x, y) { return this.row(y) * this.nx + this.col(x); }

  add(i, x, y) {
    if (!this.extra) this.extra = new Map();
    const c = this.cellIndex(x, y);
    let a = this.extra.get(c);
    if (!a) this.extra.set(c, (a = []));
    a.push(i);
  }

  remove(i, x, y) {
    const a = this.extra && this.extra.get(this.cellIndex(x, y));
    if (!a) return;
    const p = a.lastIndexOf(i);
    if (p >= 0) a.splice(p, 1);
  }

  // Calls fn(i) for every site in a cell that overlaps the rectangle; callers do the exact test.
  forEachInRect(x0, y0, x1, y1, fn) {
    const c0 = this.col(x0), c1 = this.col(x1), r0 = this.row(y0), r1 = this.row(y1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ci = r * this.nx + c;
        for (let p = this.start[ci], e = this.start[ci + 1]; p < e; p++) fn(this.items[p]);
        if (this.extra) {
          const a = this.extra.get(ci);
          if (a) for (const i of a) fn(i);
        }
      }
    }
  }
}

function grow(arr, Ctor) {
  const next = new Ctor(arr.length * 2);
  next.set(arr);
  return next;
}

// The static reach graph G_k over the original sites: CSR neighbour lists (off, nbr) and every
// undirected edge sorted by length (edgeU, edgeV, edgeW) for Kruskal-style spanning trees. Play only
// ever deletes sites, so this is built once per (field, k).
export function buildReachGraph(xs, ys, N, grid, k) {
  let eu = new Int32Array(1024), ev = new Int32Array(1024), ew = new Float64Array(1024), E = 0;
  const deg = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const xi = xs[i], yi = ys[i];
    grid.forEachInRect(xi - k, yi - k, xi + k, yi + k, j => {
      if (j <= i || j >= N) return;
      const d2 = dist2(xi, yi, xs[j], ys[j]);
      if (!within2(d2, k)) return;
      if (E === eu.length) {
        eu = grow(eu, Int32Array);
        ev = grow(ev, Int32Array);
        ew = grow(ew, Float64Array);
      }
      eu[E] = i; ev[E] = j; ew[E] = Math.sqrt(d2); E++;
      deg[i]++; deg[j]++;
    });
    if (2 * E > MAX_DIRECTED_LINKS) {
      throw new Error(`Reach k = ${+k.toFixed(3)} links too many pairs for ${N} points. Lower k or N.`);
    }
  }
  const off = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) off[i + 1] = off[i] + deg[i];
  const nbr = new Int32Array(off[N]), fill = off.slice(0, N);
  for (let e = 0; e < E; e++) {
    nbr[fill[eu[e]]++] = ev[e];
    nbr[fill[ev[e]]++] = eu[e];
  }
  const order = new Uint32Array(E);
  for (let e = 0; e < E; e++) order[e] = e;
  order.sort((a, b) => ew[a] - ew[b]);
  const edgeU = new Int32Array(E), edgeV = new Int32Array(E), edgeW = new Float64Array(E);
  for (let e = 0; e < E; e++) {
    const o = order[e];
    edgeU[e] = eu[o]; edgeV[e] = ev[o]; edgeW[e] = ew[o];
  }
  return { off, nbr, edgeU, edgeV, edgeW, edgeCount: E };
}
