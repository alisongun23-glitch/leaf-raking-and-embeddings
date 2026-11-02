// Choosing where piles go: Hilbert-curve ordering, discrete medians, and assigning points to sites so
// every site receives at least t points (Bradley, Bennett & Demiriz's minimum-size clustering, solved
// greedily). Work is mass x distance, so sites are medians (not centroids) and costs are plain distances.

// Position along a Hilbert curve of 2^order x 2^order cells covering the W x H box.
export function hilbertIndex(x, y, W, H, order = 16) {
  const n = 1 << order;
  let xi = Math.min(n - 1, Math.max(0, Math.floor((x / W) * n)));
  let yi = Math.min(n - 1, Math.max(0, Math.floor((y / H) * n)));
  let d = 0;
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (xi & s) > 0 ? 1 : 0, ry = (yi & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { xi = n - 1 - xi; yi = n - 1 - yi; }
      const tmp = xi; xi = yi; yi = tmp;
    }
  }
  return d;
}

export function hilbertOrder(xs, ys, W, H, members = null) {
  const ids = members ? Array.from(members) : Array.from({ length: xs.length }, (_, i) => i);
  const key = new Map(ids.map(i => [i, hilbertIndex(xs[i], ys[i], W, H)]));
  return ids.sort((a, b) => key.get(a) - key.get(b));
}

// The member minimising total distance to the others. Exact for groups up to `exactUpTo`; larger groups
// only try the members nearest the centroid.
export function discreteMedian(xs, ys, members, exactUpTo = 1500) {
  const m = members.length;
  if (m === 0) return -1;
  let cands = members;
  if (m > exactUpTo) {
    let cx = 0, cy = 0;
    for (const j of members) { cx += xs[j]; cy += ys[j]; }
    cx /= m; cy /= m;
    cands = [...members].sort((a, b) => Math.hypot(xs[a] - cx, ys[a] - cy) - Math.hypot(xs[b] - cx, ys[b] - cy)).slice(0, 300);
  }
  let best = -1, bestCost = Infinity;
  for (const c of cands) {
    let s = 0;
    const xc = xs[c], yc = ys[c];
    for (const j of members) { s += Math.hypot(xs[j] - xc, ys[j] - yc); if (s >= bestCost) break; }
    if (s < bestCost) { bestCost = s; best = c; }
  }
  return best;
}

// Assigns each point to a site (sites = point indices) so every site gets at least t points: nearest site
// first, then each short site takes the points that are cheapest to divert from sites with points to
// spare. Returns { assign (site slot per point, -1 if unassigned), sizes, cost }.
export function assignMinSize(xs, ys, sites, t, members = null) {
  const pts = members ? Array.from(members) : Array.from({ length: xs.length }, (_, i) => i);
  const n = sites.length, assign = new Int32Array(xs.length).fill(-1), sizes = new Int32Array(n);
  const d = (j, s) => Math.hypot(xs[j] - xs[sites[s]], ys[j] - ys[sites[s]]);
  for (const j of pts) {
    let best = 0, bd = Infinity;
    for (let s = 0; s < n; s++) { const v = d(j, s); if (v < bd) { bd = v; best = s; } }
    assign[j] = best;
    sizes[best]++;
  }
  const siteSlot = new Map(sites.map((p, s) => [p, s]));
  for (let pass = 0; pass < 4; pass++) {
    let short = false;
    for (let s = 0; s < n; s++) {
      if (sizes[s] >= t) continue;
      short = true;
      const cand = [];
      for (const j of pts) {
        const a = assign[j];
        if (a === s || sizes[a] <= t || siteSlot.get(j) === a) continue; // never strip a site of itself
        cand.push([d(j, s) - d(j, a), j]);
      }
      cand.sort((p, q) => p[0] - q[0]);
      for (const [, j] of cand) {
        if (sizes[s] >= t) break;
        const a = assign[j];
        if (sizes[a] <= t) continue;
        assign[j] = s; sizes[a]--; sizes[s]++;
      }
    }
    if (!short) break;
  }
  let cost = 0;
  for (const j of pts) cost += d(j, assign[j]);
  return { assign, sizes, cost };
}

// Heuristic siting: cut the Hilbert order into n blocks (each at least t, since N >= n t), take each
// block's median, then alternate min-size assignment and median re-siting. The result is a feasible
// solution of the siting problem, so its cost is an upper bound used to steer the Lagrangian bound.
export function sitingHeuristic(xs, ys, n, t, W, H, rounds = 4) {
  const N = xs.length, order = hilbertOrder(xs, ys, W, H);
  let sites = [];
  for (let b = 0; b < n; b++) {
    const lo = Math.floor((b * N) / n), hi = Math.floor(((b + 1) * N) / n);
    sites.push(discreteMedian(xs, ys, order.slice(lo, hi)));
  }
  let res = assignMinSize(xs, ys, sites, t);
  for (let r = 0; r < rounds; r++) {
    const groups = Array.from({ length: n }, () => []);
    for (let j = 0; j < N; j++) groups[res.assign[j]].push(j);
    const next = groups.map((gm, s) => (gm.length ? discreteMedian(xs, ys, gm) : sites[s]));
    const cand = assignMinSize(xs, ys, next, t);
    if (cand.cost >= res.cost - 1e-9) break;
    sites = next;
    res = cand;
  }
  return { sites, ...res };
}
