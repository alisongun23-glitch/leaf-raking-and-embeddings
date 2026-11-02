// How clumpy is a field? Clark-Evans ratio R = mean nearest-neighbour distance / its expectation for
// uniform points, with Donnelly's edge correction for rectangles (research notes, §2):
//   E[mean NN distance] = 0.5 sqrt(A/N) + (0.0514 + 0.041/sqrt(N)) P/N,  P = perimeter.
// R near 1 = no grouping; below 1 = grouped. Bands follow the research report.

export const meanSpacing = (N, W, H) => Math.sqrt((W * H) / Math.max(1, N));

// Nearest-neighbour distance of every point, using a grid and expanding rings of cells.
export function nearestNeighbourDistances(xs, ys, W, H) {
  const N = xs.length, out = new Float64Array(N);
  if (N < 2) return out.fill(NaN);
  const cell = Math.max(2 * meanSpacing(N, W, H), 1e-9);
  const nx = Math.floor(W / cell) + 1, ny = Math.floor(H / cell) + 1;
  const buckets = new Map();
  const key = (c, r) => r * nx + c;
  const colOf = x => Math.min(nx - 1, Math.max(0, Math.floor(x / cell)));
  const rowOf = y => Math.min(ny - 1, Math.max(0, Math.floor(y / cell)));
  for (let i = 0; i < N; i++) {
    const k = key(colOf(xs[i]), rowOf(ys[i]));
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    b.push(i);
  }
  for (let i = 0; i < N; i++) {
    const c0 = colOf(xs[i]), r0 = rowOf(ys[i]);
    let best = Infinity;
    for (let rad = 0; rad <= Math.max(nx, ny); rad++) {
      for (let r = r0 - rad; r <= r0 + rad; r++) {
        for (let c = c0 - rad; c <= c0 + rad; c++) {
          if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== rad || r < 0 || c < 0 || r >= ny || c >= nx) continue;
          const b = buckets.get(key(c, r));
          if (!b) continue;
          for (const j of b) {
            if (j === i) continue;
            const d = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
            if (d < best) best = d;
          }
        }
      }
      if (best <= rad * cell) break; // anything in farther rings is at least rad * cell away
    }
    out[i] = best;
  }
  return out;
}

export function clarkEvans(xs, ys, W, H) {
  const N = xs.length;
  if (N < 3) return NaN;
  const nn = nearestNeighbourDistances(xs, ys, W, H);
  let sum = 0;
  for (let i = 0; i < N; i++) sum += nn[i];
  const expected = 0.5 * Math.sqrt((W * H) / N) + ((0.0514 + 0.041 / Math.sqrt(N)) * 2 * (W + H)) / N;
  return sum / N / expected;
}

export function clumpBand(R) {
  if (!Number.isFinite(R)) return 'unknown';
  if (R >= 1.05) return 'spread out';
  if (R >= 0.95) return 'none';
  if (R >= 0.85) return 'slight';
  if (R >= 0.65) return 'moderate';
  return 'strong';
}
