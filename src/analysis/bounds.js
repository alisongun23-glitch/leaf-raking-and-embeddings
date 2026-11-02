import { nearestNeighbourDistances, meanSpacing } from '../gen/stats.js';
import { sitingHeuristic } from './siting.js';

// Certified lower bounds for every cost term (research report §5), so algorithms are scored by their gap
// to a floor rather than only against each other. All bounds assume final piles sit on original point
// sites (stand and push modes); with free pile placement the work bound no longer applies.

// Cheap bounds, computed for every instance from the field and (n, t, k, l).
//   strokes  >= ceil((N - n) / c), c = most other points within k + l of any point: every stroke removes
//               only objects inside the disk of radius k + l around its destination.
//   travel   >= (U - 4 pi r^2) / (4 r), r = k + l, U = area covered by radius-r disks around all points:
//               every point comes within r of some raker position, so the raker path's 2r-neighbourhood
//               (area <= 4 r L + 4 pi r^2, Dumitrescu & Toth) covers U. U is estimated from below.
//   work     >= sum of nearest-neighbour distances minus the n largest: every point that is not itself a
//               final pile site moves at least to its nearest other point.
export function instanceBounds(field, cfg) {
  const { xs, ys, W, H } = field, N = xs.length, { n, k, l } = cfg;
  const r = k + l, free = cfg.rules && cfg.rules.destination === 'free';
  const nn = nearestNeighbourDistances(xs, ys, W, H);
  const sorted = Float64Array.from(nn).sort();
  let workNN = 0;
  for (let i = 0; i < N - Math.min(n, N); i++) workNN += sorted[i];
  const c = maxWithin(xs, ys, W, H, r);
  const U = unionAreaLower(xs, ys, W, H, r);
  return {
    strokes: c > 0 ? Math.ceil(Math.max(0, N - n) / c) : 0,
    travel: Math.max(0, (U - 4 * Math.PI * r * r) / (4 * r)),
    work: free ? 0 : workNN,
    workNN: free ? 0 : workNN,
    spacing: meanSpacing(N, W, H),
    maxPerStroke: c,
    coveredArea: U,
    valid: !free,
  };
}

// Largest number of other points within distance r of a single point (grid with cell r).
function maxWithin(xs, ys, W, H, r) {
  const N = xs.length, cell = Math.max(r, Math.max(W, H) / 1024, 1e-9);
  const nx = Math.floor(W / cell) + 1, buckets = new Map();
  const cellOf = (x, y) => Math.min(Math.floor(y / cell), 1e9) * nx + Math.min(nx - 1, Math.max(0, Math.floor(x / cell)));
  for (let i = 0; i < N; i++) {
    const key = cellOf(xs[i], ys[i]);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(i);
  }
  let best = 0;
  const r2 = r * r * (1 + 1e-9) + 1e-12;
  for (let i = 0; i < N; i++) {
    const c0 = Math.min(nx - 1, Math.max(0, Math.floor(xs[i] / cell))), r0 = Math.floor(ys[i] / cell);
    let count = 0;
    for (let rr = r0 - 1; rr <= r0 + 1; rr++) {
      for (let cc = c0 - 1; cc <= c0 + 1; cc++) {
        if (cc < 0 || cc >= nx || rr < 0) continue;
        const b = buckets.get(rr * nx + cc);
        if (!b) continue;
        for (const j of b) {
          if (j === i) continue;
          const dx = xs[j] - xs[i], dy = ys[j] - ys[i];
          if (dx * dx + dy * dy <= r2) count++;
        }
      }
    }
    if (count > best) best = count;
  }
  return best;
}

// Area of the union of radius-r disks around the points, from below: counts grid cells that lie wholly
// inside at least one disk (all four corners within r of that disk's centre).
function unionAreaLower(xs, ys, W, H, r) {
  const x0 = -r, y0 = -r, spanX = W + 2 * r, spanY = H + 2 * r;
  let h = r / 6;
  while ((spanX / h) * (spanY / h) > 4e6) h *= 1.5;
  const nx = Math.ceil(spanX / h), ny = Math.ceil(spanY / h), cover = new Uint8Array(nx * ny);
  const r2 = r * r;
  for (let i = 0; i < xs.length; i++) {
    const px = xs[i], py = ys[i];
    const cx0 = Math.max(0, Math.floor((px - r - x0) / h)), cx1 = Math.min(nx - 1, Math.floor((px + r - x0) / h));
    const cy0 = Math.max(0, Math.floor((py - r - y0) / h)), cy1 = Math.min(ny - 1, Math.floor((py + r - y0) / h));
    for (let cy = cy0; cy <= cy1; cy++) {
      const ya = y0 + cy * h - py, yb = ya + h, dy2 = Math.max(ya * ya, yb * yb);
      for (let cx = cx0; cx <= cx1; cx++) {
        const idx = cy * nx + cx;
        if (cover[idx]) continue;
        const xa = x0 + cx * h - px, xb = xa + h;
        if (Math.max(xa * xa, xb * xb) + dy2 <= r2) cover[idx] = 1;
      }
    }
  }
  let count = 0;
  for (let i = 0; i < cover.length; i++) count += cover[i];
  return count * h * h;
}

// k-th smallest (0-based) of buf[0..len), rearranging buf so buf[0..k] are the k+1 smallest.
function select(buf, len, k) {
  let lo = 0, hi = len - 1;
  while (lo < hi) {
    const pivot = buf[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (buf[i] < pivot) i++;
      while (buf[j] > pivot) j--;
      if (i <= j) { const tmp = buf[i]; buf[i] = buf[j]; buf[j] = tmp; i++; j--; }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return buf[k];
}

// Lagrangian lower bound on work for "n piles of at least t" (research report §5-6). Relaxing "each point
// is assigned exactly once" with prices lambda gives
//   L(lambda) = sum_j lambda_j + (sum of the n smallest rho_i),
//   rho_i = -lambda_i + (sum of the t-1 smallest d_ij - lambda_j) + (every other negative d_ij - lambda_j),
// valid for any lambda. Prices start at nearest-neighbour distances (so L >= the nearest-neighbour bound)
// and move by projected subgradient steps aimed at the heuristic siting cost. O(N^2) per iteration.
export function lagrangianBound(xs, ys, n, t, W, H, opts = {}) {
  const N = xs.length;
  const iterations = opts.iterations ?? 120, deadline = Date.now() + (opts.timeBudgetMs ?? 20000);
  if (N < 2 || n >= N) return { bound: 0, ub: 0, iterations: 0 };
  const ub = opts.ub ?? sitingHeuristic(xs, ys, n, t, W, H).cost;
  const lam = nearestNeighbourDistances(xs, ys, W, H);
  const buf = new Float64Array(N), rho = new Float64Array(N), count = new Float64Array(N);
  const tm1 = Math.max(0, Math.min(t - 1, N - 1));
  let best = -Infinity, scale = 2, stall = 0, it = 0;
  // A site's relaxed choice: every point with a negative reduced cost d_ij - lambda_j, plus the cheapest
  // non-negative ones until it has t - 1 (the same as "t - 1 smallest, plus any other negatives").
  const evaluate = () => {
    let sumLam = 0;
    for (let j = 0; j < N; j++) sumLam += lam[j];
    for (let i = 0; i < N; i++) {
      const xi = xs[i], yi = ys[i];
      let s = -lam[i], len = 0, neg = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const v = Math.hypot(xs[j] - xi, ys[j] - yi) - lam[j];
        if (v < 0) { s += v; neg++; } else buf[len++] = v;
      }
      const need = Math.min(tm1 - neg, len);
      if (need > 0) {
        if (need < len) select(buf, len, need - 1);
        for (let q = 0; q < need; q++) s += buf[q];
      }
      rho[i] = s;
    }
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => rho[a] - rho[b]).slice(0, n);
    let L = sumLam;
    for (const i of order) L += rho[i];
    return { L, chosen: order };
  };
  for (; it < iterations && Date.now() < deadline; it++) {
    const { L, chosen } = evaluate();
    if (L > best + 1e-9) { best = L; stall = 0; } else if (++stall >= 15) { scale /= 2; stall = 0; }
    // Subgradient: 1 - (times each point is picked by the chosen sites' relaxed choices).
    count.fill(0);
    for (const i of chosen) {
      count[i] += 1;
      const xi = xs[i], yi = ys[i], rest = [];
      let neg = 0;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const v = Math.hypot(xs[j] - xi, ys[j] - yi) - lam[j];
        if (v < 0) { count[j] += 1; neg++; } else rest.push([v, j]);
      }
      const need = tm1 - neg;
      if (need > 0) {
        rest.sort((p, q) => p[0] - q[0]);
        for (let q = 0; q < need && q < rest.length; q++) count[rest[q][1]] += 1;
      }
    }
    let norm = 0;
    for (let j = 0; j < N; j++) { const gj = 1 - count[j]; norm += gj * gj; }
    if (norm === 0 || scale < 1e-4) break;
    const step = (scale * Math.max(ub - L, 1e-9 * Math.abs(ub))) / norm;
    for (let j = 0; j < N; j++) lam[j] = Math.max(0, lam[j] + step * (1 - count[j]));
  }
  return { bound: Math.max(0, best), ub, iterations: it };
}

// Lower bound on the work needed to move every point to the algorithm's own final pile sites with its
// actual final pile sizes (a transportation problem). Dual: D(w) = sum_j min_i (d_ij - w_i) + sum_i cap_i w_i
// is a certified bound for any w; a few hundred subgradient steps get close to the transport optimum.
// work / ownSiteBound then measures relay-and-routing loss, ownSiteBound / Lagrangian measures siting loss.
export function ownSiteBound(xs, ys, sites, caps, opts = {}) {
  const N = xs.length, n = sites.length, w = new Float64Array(n), cnt = new Int32Array(n);
  const iterations = opts.iterations ?? 300;
  if (!n) return { bound: 0 };
  const D = new Float64Array(N * n);
  for (let j = 0; j < N; j++) for (let i = 0; i < n; i++) D[j * n + i] = Math.hypot(xs[j] - sites[i].x, ys[j] - sites[i].y);
  let best = -Infinity, step = 0;
  for (let j = 0; j < N; j++) step += D[j * n];
  step = (step / N) * 0.2;
  for (let it = 0; it < iterations; it++) {
    cnt.fill(0);
    let val = 0;
    for (let i = 0; i < n; i++) val += caps[i] * w[i];
    for (let j = 0; j < N; j++) {
      let bi = 0, bv = Infinity;
      for (let i = 0; i < n; i++) { const v = D[j * n + i] - w[i]; if (v < bv) { bv = v; bi = i; } }
      val += bv;
      cnt[bi]++;
    }
    if (val > best) best = val;
    let norm = 0;
    for (let i = 0; i < n; i++) norm += (caps[i] - cnt[i]) ** 2;
    if (norm === 0) break;
    const s = step / Math.sqrt(1 + it);
    for (let i = 0; i < n; i++) w[i] += (s * (caps[i] - cnt[i])) / Math.sqrt(norm);
  }
  return { bound: Math.max(0, best) };
}
