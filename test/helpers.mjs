// Shared test helpers: tiny fields and brute-force reference versions of the engine's fast paths.
import { Rng } from '../src/core/rng.js';
import { within2, dist2, segDist2 } from '../src/core/geometry.js';
import { EMPTY, LOOSE, PILE } from '../src/core/kinds.js';

export function uniformField(seed, N = 120, W = 50, H = 50) {
  const rng = new Rng(seed, 'test-field');
  const xs = new Float64Array(N), ys = new Float64Array(N);
  for (let i = 0; i < N; i++) { xs[i] = rng.range(0, W); ys[i] = rng.range(0, H); }
  return { W, H, xs, ys };
}

export function fieldFrom(points, W = 20, H = 20) {
  return { W, H, xs: Float64Array.from(points.map(p => p[0])), ys: Float64Array.from(points.map(p => p[1])) };
}

const live = (g, j, detBefore) => g.kind[j] !== EMPTY && !(detBefore ? detBefore[j] : g.detached[j]);

export function bruteNeighbors(g, i) {
  const out = [];
  for (let j = 0; j < g.size; j++) {
    if (j !== i && live(g, j) && within2(dist2(g.x[i], g.y[i], g.x[j], g.y[j]), g.k)) out.push(j);
  }
  return out;
}

export function bruteCapsule(g, ax, ay, bx, by, skipA, skipB) {
  const out = [];
  for (let j = 0; j < g.size; j++) {
    if (j === skipA || j === skipB || !live(g, j)) continue;
    if (g.kind[j] === PILE && !g.rules.sweepPiles) continue;
    if (within2(segDist2(g.x[j], g.y[j], ax, ay, bx, by), g.l)) out.push(j);
  }
  return out;
}

// Plays the move, judges the resulting position from scratch (brute-force reach, counts from the site
// arrays), then undoes it. Mirrors the engine's rule: budget holds, every loose point and unfinished pile
// stays reachable, and at most n - 1 finished piles end up cut off.
export function bruteSafe(g, m) {
  const detBefore = g.detached.slice();
  const r = g.resolve(m);
  if (!r.legal) return null;
  g.apply(m);
  let excess = 0, nFull = 0;
  for (let j = 0; j < g.size; j++) {
    if (g.kind[j] === PILE && g.mass[j] >= g.t) { nFull++; excess += g.mass[j] - g.t; }
  }
  let ok = excess + g.t * Math.max(0, nFull - g.n) <= g.s;
  if (ok) {
    const seen = new Uint8Array(g.size), q = [g.raker];
    seen[g.raker] = 1;
    for (let h = 0; h < q.length; h++) {
      const v = q[h];
      for (let w = 0; w < g.size; w++) {
        if (seen[w] || !live(g, w, detBefore)) continue;
        if (within2(dist2(g.x[v], g.y[v], g.x[w], g.y[w]), g.k)) { seen[w] = 1; q.push(w); }
      }
    }
    let frozen = 0;
    for (let j = 0; j < g.size; j++) {
      if (g.kind[j] === PILE && detBefore[j]) frozen++;
      if (!live(g, j, detBefore) || seen[j]) continue;
      if (g.kind[j] === LOOSE || g.mass[j] < g.t) ok = false;
      else frozen++;
    }
    if (frozen > g.n - 1) ok = false;
  }
  g.undo();
  return ok;
}

export function stateKey(g) {
  return JSON.stringify({
    kind: Array.from(g.kind.subarray(0, g.size)),
    mass: Array.from(g.mass.subarray(0, g.size)),
    det: Array.from(g.detached.subarray(0, g.size)),
    raker: g.raker,
    size: g.size,
    c: g.c,
    status: g.status,
  });
}
