import { Rng } from '../core/rng.js';
import { mean, quantile } from './benchstats.js';

// Curve fitting for sweeps: how a measured quantity (work by default; any `measure: row => number`, such
// as time to rake) grows as one dial changes for a single seed, where the curve jumps and why, the average
// curve over many seeds, and two seeds side by side. Lower bounds only exist for work (`bounds: false`
// otherwise).

const num = v => (!Number.isFinite(v) ? '—' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toPrecision(3)));

// Power law y = a·x^b, by least squares on log y against log x, so every point counts by its relative
// error. R² is on the original scale. ciB is a moving-block bootstrap interval for b: neighbouring
// sweep values usually share a plan, so residuals come in runs and the plain standard error would be
// too optimistic.
export function powerFit(xs, ys, { bootstrap = 400, block = 0, seed = 1 } = {}) {
  const pts = [];
  for (let i = 0; i < xs.length; i++) if (xs[i] > 0 && ys[i] > 0 && Number.isFinite(xs[i]) && Number.isFinite(ys[i])) pts.push([xs[i], ys[i]]);
  pts.sort((p, q) => p[0] - q[0]);
  const n = pts.length;
  if (n < 3 || pts[0][0] === pts[n - 1][0]) return null;
  const u = pts.map(p => Math.log(p[0])), v = pts.map(p => Math.log(p[1]));
  const ols = idx => {
    let su = 0, sv = 0;
    for (const i of idx) { su += u[i]; sv += v[i]; }
    const mu = su / idx.length, mv = sv / idx.length;
    let suu = 0, suv = 0;
    for (const i of idx) { suu += (u[i] - mu) ** 2; suv += (u[i] - mu) * (v[i] - mv); }
    return suu > 0 ? { b: suv / suu, la: mv - (suv / suu) * mu, suu } : null;
  };
  const { b, la, suu } = ols([...Array(n).keys()]);
  const a = Math.exp(la), my = mean(pts.map(p => p[1]));
  let sse = 0, sst = 0, rss = 0;
  for (let i = 0; i < n; i++) {
    sse += (pts[i][1] - a * pts[i][0] ** b) ** 2;
    sst += (pts[i][1] - my) ** 2;
    rss += (v[i] - la - b * u[i]) ** 2;
  }
  let ciB = [NaN, NaN];
  if (bootstrap > 0 && n >= 8) {
    const L = Math.max(2, Math.min(n, block || Math.round(n / 10))), rng = new Rng(seed, 'fit-bootstrap'), bs = [];
    for (let r = 0; r < bootstrap; r++) {
      const idx = [];
      while (idx.length < n) { const s = rng.int(n - L + 1); for (let q = 0; q < L && idx.length < n; q++) idx.push(s + q); }
      const f = ols(idx);
      if (f) bs.push(f.b);
    }
    if (bs.length > 10) ciB = [quantile(bs, 0.025), quantile(bs, 0.975)];
  }
  return { a, b, r2: sst > 0 ? 1 - sse / sst : 1, seB: Math.sqrt(rss / Math.max(1, n - 2) / suu), ciB, n, x0: pts[0][0], x1: pts[n - 1][0] };
}
export const powerAt = (f, x) => f.a * x ** f.b;
export const powerSlope = (f, x) => f.a * f.b * x ** (f.b - 1);
export const powerText = (f, x = 'N') => (f ? `${num(f.a)} · ${x}^${f.b.toFixed(2)}` : '—');

// How two pile layouts differ. Piles are [x, y, mass], matched greedily by distance: dist is the
// largest move of a matched pile, moved the number of leaves that ended in a different pile.
export function pileShift(P, Q) {
  const pairs = [];
  for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) pairs.push([Math.hypot(P[i][0] - Q[j][0], P[i][1] - Q[j][1]), i, j]);
  pairs.sort((p, q) => p[0] - q[0]);
  const ui = new Uint8Array(P.length), uj = new Uint8Array(Q.length);
  let dist = 0, diff = 0;
  for (const [d, i, j] of pairs) {
    if (ui[i] || uj[j]) continue;
    ui[i] = uj[j] = 1;
    dist = Math.max(dist, d);
    diff += Math.abs(P[i][2] - Q[j][2]);
  }
  P.forEach((p, i) => { if (!ui[i]) diff += p[2]; });
  Q.forEach((q, j) => { if (!uj[j]) diff += q[2]; });
  return { dist, moved: Math.max(0, (diff - Math.abs(sumMass(P) - sumMass(Q))) / 2) };
}
const sumMass = P => P.reduce((s, p) => s + p[2], 0);

// What changed between two neighbouring finished sweep points, most telling first:
//   field  the whole field was redrawn (a new random draw, not one more leaf)
//   reach  k changed, because k is set as a multiple of M and the new leaf moved M
//   plan   the algorithm planned differently (planned-sites: no plan / complete / broken)
//   piles  the final piles sit elsewhere, or many leaves ended in a different pile
//   route  same piles, different raking order
export function jumpCauses(r0, r1, { moveTol = 10, shareTol = 0.05 } = {}) {
  const out = [];
  if (r0.head !== r1.head) out.push({ kind: 'field', text: 'the field was redrawn' });
  if (Math.abs(r1.k / r0.k - 1) > 0.002) {
    const mText = Math.abs(r1.M / r0.M - 1) > 0.002 ? ` (M ${num(r0.M)} → ${num(r1.M)})` : '';
    out.push({ kind: 'reach', text: `reach k ${num(r0.k)} → ${num(r1.k)}${mText}` });
  }
  if (r0.plan !== r1.plan) out.push({ kind: 'plan', text: `plan: ${r0.plan} → ${r1.plan}` });
  if (r0.piles?.length && r1.piles?.length) {
    const s = pileShift(r0.piles, r1.piles);
    if (s.dist > moveTol) out.push({ kind: 'piles', text: `a pile moved ${num(s.dist)}`, dist: s.dist, moved: s.moved });
    else if (s.moved > shareTol * Math.max(r0.N, r1.N)) out.push({ kind: 'piles', text: `${Math.round(s.moved)} leaves ended in another pile`, dist: s.dist, moved: s.moved });
  }
  if (!out.length) out.push({ kind: 'route', text: 'same piles, different raking order' });
  return out;
}

// One power law per regime, for algorithms that report one (planned-sites: 'planned' or 'tree peel').
// A regime needs at least minPoints finished runs, spread over at least minSpan of the whole range, to
// get a curve of its own.
export function regimeFits(ok, { bootstrap = 400, seed = 1, minPoints = 8, minSpan = 0, measure = r => r.work, bounds = true } = {}) {
  const by = new Map();
  for (const r of ok) if (r.regime) { if (!by.has(r.regime)) by.set(r.regime, []); by.get(r.regime).push(r); }
  const lo = Math.min(...ok.map(r => r.value)), hi = Math.max(...ok.map(r => r.value));
  const out = [];
  for (const [regime, rs] of by) {
    const range = [Math.min(...rs.map(r => r.value)), Math.max(...rs.map(r => r.value))];
    if (rs.length < minPoints || range[1] - range[0] < minSpan * (hi - lo)) { out.push({ regime, points: rs.length, range, fit: null }); continue; }
    const bounded = bounds ? rs.filter(r => r.bound > 0) : [];
    out.push({
      regime,
      points: rs.length,
      range,
      fit: powerFit(rs.map(r => r.value), rs.map(measure), { bootstrap, seed }),
      gap: bounded.length ? quantile(bounded.map(r => measure(r) / r.bound), 0.5) : null,
    });
  }
  return out.sort((p, q) => q.points - p.points);
}

// Everything reported about one seed's curve. rows: sweep points of one seed (see sweep.js).
//   threshold  a step counts as a jump when work changes by at least this fraction
//   moveTol    pile moves shorter than this are not a new layout (default: a fifth of the pile spacing)
export function analyseCurve(rows, { threshold = 0.05, moveTol, bootstrap = 400, measure = r => r.work, bounds = true } = {}) {
  const sorted = [...rows].sort((p, q) => p.value - q.value);
  const ok = sorted.filter(r => r.status === 'success');
  const seed = sorted[0]?.seed ?? 1;
  const fit = powerFit(ok.map(r => r.value), ok.map(measure), { bootstrap, seed });
  const bounded = bounds ? ok.filter(r => r.bound > 0) : [];
  const boundFit = bounded.length >= 3 ? powerFit(bounded.map(r => r.value), bounded.map(r => r.bound), { bootstrap, seed }) : null;
  const tol = moveTol ?? (sorted[0] ? 0.2 * Math.sqrt((sorted[0].W * sorted[0].H) / Math.max(1, sorted[0].n)) : 10);
  const steps = [], jumps = [], switches = [];
  for (let i = 1; i < sorted.length; i++) {
    const r0 = sorted[i - 1], r1 = sorted[i];
    if (r0.status !== 'success' || r1.status !== 'success') continue;
    if (r0.regime !== r1.regime) switches.push({ at: r1.value, from: r0.regime, to: r1.regime });
    const rel = measure(r1) / measure(r0) - 1;
    steps.push(Math.abs(rel));
    if (Math.abs(rel) >= threshold) jumps.push({ from: r0.value, to: r1.value, w0: measure(r0), w1: measure(r1), rel, causes: jumpCauses(r0, r1, { moveTol: tol }) });
  }
  jumps.sort((p, q) => Math.abs(q.rel) - Math.abs(p.rel));
  const causeCounts = {};
  for (const j of jumps) for (const c of j.causes) causeCounts[c.kind] = (causeCounts[c.kind] || 0) + 1;
  const failures = [];
  sorted.forEach((r, i) => {
    if (r.status === 'success') return;
    const last = failures[failures.length - 1];
    if (last && last.end === i - 1) { last.to = r.value; last.end = i; last.count++; }
    else failures.push({ from: r.value, to: r.value, end: i, count: 1, reason: r.reason });
  });
  const lo = sorted.length ? sorted[0].value : NaN, hi = sorted.length ? sorted[sorted.length - 1].value : NaN;
  const mid = (lo + hi) / 2;
  const dev = fit ? ok.map(r => measure(r) / powerAt(fit, r.value) - 1) : [];
  return {
    seed,
    points: sorted.length,
    finished: ok.length,
    range: [lo, hi],
    mid,
    fit,
    boundFit,
    regimes: regimeFits(ok, { bootstrap, seed, measure, bounds }),
    switches,
    slopeMid: fit ? powerSlope(fit, mid) : NaN,
    boundSlopeMid: boundFit ? powerSlope(boundFit, mid) : NaN,
    typicalStep: steps.length ? quantile(steps, 0.5) : NaN,
    typicalDev: dev.length ? quantile(dev.map(Math.abs), 0.5) : NaN,
    maxDev: dev.length ? Math.max(...dev.map(Math.abs)) : NaN,
    gap: bounded.length ? quantile(bounded.map(r => measure(r) / r.bound), 0.5) : null,
    gapRange: bounded.length ? [Math.min(...bounded.map(r => measure(r) / r.bound)), Math.max(...bounded.map(r => measure(r) / r.bound))] : null,
    jumps,
    causeCounts,
    failures: failures.map(({ end, ...f }) => f),
  };
}

// The average curve over many seeds: at each value, the mean and quartiles of work over finished runs,
// how many runs finished, and the share of finished runs in each regime.
export function averageCurve(rows, measure = r => r.work) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.value)) by.set(r.value, []);
    by.get(r.value).push(r);
  }
  const out = [];
  for (const [value, rs] of [...by.entries()].sort((p, q) => p[0] - q[0])) {
    const ok = rs.filter(r => r.status === 'success'), w = ok.map(measure), shares = {};
    for (const r of ok) if (r.regime) shares[r.regime] = (shares[r.regime] || 0) + 1 / ok.length;
    if (ok.length) out.push({ value, mean: mean(w), q1: quantile(w, 0.25), q3: quantile(w, 0.75), n: ok.length, runs: rs.length, shares });
  }
  return out;
}

// The average over many seeds as one function: a power law through the mean curve, plus (when the
// algorithm reports regimes) one power law per regime over all seeds' finished runs pooled.
export function averageAnalysis(rows, { measure = r => r.work } = {}) {
  const curve = averageCurve(rows, measure);
  return {
    seeds: new Set(rows.map(r => r.seed)).size,
    curve,
    fit: powerFit(curve.map(p => p.value), curve.map(p => p.mean), { seed: 0 }),
    regimes: regimeFits(rows.filter(r => r.status === 'success'), { seed: 0, minPoints: 20, minSpan: 0.3, measure, bounds: false }),
  };
}

// Two seeds' curves side by side: their level at the middle of the range, their growth exponents, and
// the pointwise ratio where both finished.
export function compareCurves(A, B, rowsA, rowsB, { measure = r => r.work, bounds = true } = {}) {
  if (!A?.fit || !B?.fit) return null;
  const mid = A.mid;
  const okB = new Map(rowsB.filter(r => r.status === 'success').map(r => [r.value, r]));
  const both = rowsA.filter(r => r.status === 'success' && okB.has(r.value));
  const ratios = both.map(r => measure(r) / measure(okB.get(r.value)));
  const boundRatios = bounds ? both.filter(r => r.bound > 0 && okB.get(r.value).bound > 0).map(r => r.bound / okB.get(r.value).bound) : [];
  const [a0, a1] = A.fit.ciB, [b0, b1] = B.fit.ciB;
  const known = [a0, a1, b0, b1].every(Number.isFinite);
  return {
    mid,
    level: powerAt(A.fit, mid) / powerAt(B.fit, mid),
    boundLevel: A.boundFit && B.boundFit ? powerAt(A.boundFit, mid) / powerAt(B.boundFit, mid) : null,
    bDiff: A.fit.b - B.fit.b,
    exponentsDiffer: known ? a1 < b0 || b1 < a0 : null,
    ratioMedian: ratios.length ? quantile(ratios, 0.5) : NaN,
    boundRatioMedian: boundRatios.length ? quantile(boundRatios, 0.5) : NaN,
    ratioRange: ratios.length ? [Math.min(...ratios), Math.max(...ratios)] : [NaN, NaN],
    shared: ratios.length,
  };
}
