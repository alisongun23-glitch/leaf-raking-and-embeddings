import { mean, quantile } from './benchstats.js';

// Which function best describes how work responds to one dial, across many seeds.
//
// Every seed's curve is modelled as its own level times one shared shape, W_s(x) ≈ c_s · f(x), fitted on
// log work so errors are relative (a jump that doubles the work counts the same at every level). The
// levels c_s are profiled out, so a family is judged only on its shape. Families are compared by how well
// they predict a seed left out of the fit (leave-one-seed-out cross-validation): `best` has the lowest
// error, `simplest` is the family with the fewest parameters within one standard error of it. Among
// those, the lowest error wins, unless an earlier family in FAMILIES (which runs from plain to
// elaborate) is within a quarter of a standard error of it. Shapes are written in u = x / xref
// (xref = middle of the range) to keep parameters near 1; formula() converts back.

const num = v => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2).replace('e+', 'e');
  return String(+v.toPrecision(3));
};
const signed = v => (v < 0 ? ` − ${num(-v)}` : ` + ${num(v)}`);

export const FAMILIES = [
  {
    id: 'constant', name: 'No effect', k: 0, f: () => 1,
    formula: (th, c) => `${num(c)}`,
  },
  {
    id: 'linear', name: 'Straight line', k: 1, grid: [[-3, 3]], f: (u, [b]) => 1 + b * (u - 1),
    formula: ([b], c, r, x) => `${num(c * (1 - b))}${signed((c * b) / r)}·${x}`,
  },
  {
    id: 'power', name: 'Power law', k: 1, positive: true, grid: [[-4, 4]], f: (u, [b]) => u ** b,
    formula: ([b], c, r, x) => `${num(c * r ** -b)}·${x}^${num(b)}`,
  },
  {
    id: 'exp', name: 'Exponential', k: 1, grid: [[-6, 6]], f: (u, [b]) => Math.exp(b * (u - 1)),
    formula: ([b], c, r, x) => `${num(c * Math.exp(-b))}·e^(${num(b / r)}·${x})`,
  },
  {
    id: 'log', name: 'Logarithmic', k: 1, positive: true, grid: [[-3, 3]], f: (u, [b]) => 1 + b * Math.log(u),
    formula: ([b], c, r, x) => `${num(c * (1 - b * Math.log(r)))}${signed(c * b)}·ln ${x}`,
  },
  {
    id: 'reciprocal', name: 'Reciprocal', k: 1, positive: true, grid: [[-3, 3]], f: (u, [b]) => 1 + b * (1 / u - 1),
    formula: ([b], c, r, x) => `${num(c * (1 - b))}${signed(c * b * r)}/${x}`,
  },
  {
    id: 'quadratic', name: 'Quadratic', k: 2, grid: [[-3, 3], [-3, 3]], f: (u, [b, q]) => 1 + b * (u - 1) + q * (u - 1) ** 2,
    formula: ([b, q], c, r, x) => `${num(c * (1 - b + q))}${signed((c * (b - 2 * q)) / r)}·${x}${signed((c * q) / (r * r))}·${x}²`,
  },
  {
    id: 'power-offset', name: 'Power law + constant', k: 2, positive: true, grid: [[-3, 3], [-4, 4]], f: (u, [b, p]) => 1 + b * (u ** p - 1),
    formula: ([b, p], c, r, x) => `${num(c * (1 - b))}${signed(c * b * r ** -p)}·${x}^${num(p)}`,
  },
  {
    id: 'exp-offset', name: 'Exponential + constant', k: 2, grid: [[-3, 3], [-8, 8]], f: (u, [b, p]) => 1 + b * (Math.exp(p * (u - 1)) - 1),
    formula: ([b, p], c, r, x) => `${num(c * (1 - b))}${signed(c * b * Math.exp(-p))}·e^(${num(p / r)}·${x})`,
  },
];
export const family = id => FAMILIES.find(f => f.id === id);

// The fitted typical curve at x: level × shape.
export const shapeValue = (fit, x) => fit.level * family(fit.id).f(x / fit.xref, fit.theta);

// Nelder-Mead simplex minimisation (small dimensions, no derivatives).
function nelderMead(fn, x0, step, iterations = 400) {
  const d = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < d; i++) { const x = x0.slice(); x[i] += step[i]; pts.push(x); }
  let vals = pts.map(fn);
  const lerp = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
  for (let it = 0; it < iterations; it++) {
    const order = [...pts.keys()].sort((a, b) => vals[a] - vals[b]);
    pts = order.map(i => pts[i]);
    vals = order.map(i => vals[i]);
    if (Math.abs(vals[d] - vals[0]) <= 1e-12 * (Math.abs(vals[0]) + 1e-12)) break;
    const c = pts[0].map((_, i) => mean(pts.slice(0, d).map(p => p[i])));
    const worst = pts[d];
    const xr = lerp(c, worst, -1), fr = fn(xr);
    if (fr < vals[0]) {
      const xe = lerp(c, worst, -2), fe = fn(xe);
      [pts[d], vals[d]] = fe < fr ? [xe, fe] : [xr, fr];
    } else if (fr < vals[d - 1]) {
      [pts[d], vals[d]] = [xr, fr];
    } else {
      const xc = fr < vals[d] ? lerp(c, xr, 0.5) : lerp(c, worst, 0.5), fc = fn(xc);
      if (fc < Math.min(fr, vals[d])) [pts[d], vals[d]] = [xc, fc];
      else {
        for (let i = 1; i <= d; i++) { pts[i] = lerp(pts[0], pts[i], 0.5); vals[i] = fn(pts[i]); }
      }
    }
  }
  const best = vals.indexOf(Math.min(...vals));
  return { x: pts[best], v: vals[best] };
}

// Finished runs grouped by seed, as indexes into the sorted values and the log of the measure.
function prepare(rows, measure) {
  const ok = rows.filter(r => r.status === 'success' && measure(r) > 0);
  const xs = [...new Set(ok.map(r => r.value))].sort((a, b) => a - b);
  const jOf = new Map(xs.map((x, j) => [x, j]));
  const by = new Map();
  for (const r of ok) {
    if (!by.has(r.seed)) by.set(r.seed, []);
    by.get(r.seed).push([jOf.get(r.value), Math.log(measure(r))]);
  }
  const seeds = [...by.entries()].filter(([, o]) => o.length >= 3).map(([seed, o]) => {
    o.sort((a, b) => a[0] - b[0]);
    return { seed, j: Int32Array.from(o, p => p[0]), y: Float64Array.from(o, p => p[1]) };
  });
  const xref = (xs[0] + xs[xs.length - 1]) / 2;
  return { xs, xref, u: xs.map(x => x / xref), seeds };
}

// Residual sum of squares of log work for one family's shape, each seed at its own best level.
function lossFor(fam, data, seeds) {
  const lf = new Float64Array(data.u.length);
  return theta => {
    for (let j = 0; j < lf.length; j++) {
      const v = fam.f(data.u[j], theta);
      if (!(v > 0) || !Number.isFinite(v)) return Infinity;
      lf[j] = Math.log(v);
    }
    let total = 0;
    for (const s of seeds) {
      let m = 0;
      for (let q = 0; q < s.j.length; q++) m += s.y[q] - lf[s.j[q]];
      m /= s.j.length;
      for (let q = 0; q < s.j.length; q++) total += (s.y[q] - m - lf[s.j[q]]) ** 2;
    }
    return total;
  };
}

// Best shape parameters: a coarse grid, then Nelder-Mead from the best grid point (or from `start`).
function fitFamily(fam, data, seeds, start = null) {
  const loss = lossFor(fam, data, seeds);
  if (fam.k === 0) return { theta: [], sse: loss([]) };
  let best = start, bestV = start ? loss(start) : Infinity;
  if (!start) {
    const steps = fam.k === 1 ? 121 : 31;
    const axes = fam.grid.map(([lo, hi]) => Array.from({ length: steps }, (_, i) => lo + ((hi - lo) * i) / (steps - 1)));
    const visit = (i, th) => {
      if (i === fam.k) { const v = loss(th); if (v < bestV) { bestV = v; best = th.slice(); } return; }
      for (const a of axes[i]) { th[i] = a; visit(i + 1, th); }
    };
    visit(0, new Array(fam.k));
    if (!best) return null;
  }
  const step = fam.grid.map(([lo, hi]) => (hi - lo) / 30);
  const r = nelderMead(loss, best, step);
  return r.v <= bestV ? { theta: r.x, sse: r.v } : { theta: best, sse: bestV };
}

// The levels (log c_s) and per-seed residual RMS for given shape parameters.
function levels(fam, theta, data, seeds) {
  const lf = data.u.map(u => Math.log(fam.f(u, theta)));
  return seeds.map(s => {
    let m = 0;
    for (let q = 0; q < s.j.length; q++) m += s.y[q] - lf[s.j[q]];
    m /= s.j.length;
    let e = 0;
    for (let q = 0; q < s.j.length; q++) e += (s.y[q] - m - lf[s.j[q]]) ** 2;
    return { seed: s.seed, logLevel: m, rms: Math.sqrt(e / s.j.length) };
  });
}

// Elasticity d ln f / d ln x and slope dW/dx of a fitted curve at x.
function localRates(fam, theta, xref, level, x) {
  const h = 1e-4, u = x / xref;
  const lo = fam.f(u * (1 - h), theta), hi = fam.f(u * (1 + h), theta), mid = fam.f(u, theta);
  return {
    elasticity: (Math.log(hi) - Math.log(lo)) / (Math.log(1 + h) - Math.log(1 - h)),
    slope: (level * (hi - lo)) / (2 * h * x),
    value: level * mid,
  };
}

// The whole comparison. rows: sweep points of many seeds (see sweep.js); measure picks the quantity
// (work by default). Returns null with fewer than 3 seeds or 4 values. opts.cv = false skips the
// leave-one-seed-out pass (fast preview).
export function shapeAnalysis(rows, { cv = true, symbol = 'x', measure = r => r.work } = {}) {
  const data = prepare(rows, measure), sym = /^\w+$/.test(symbol) ? symbol : `(${symbol})`;
  const S = data.seeds.length;
  if (S < 3 || data.xs.length < 4 || !(data.xref > 0)) return null;
  const n = data.seeds.reduce((s, d) => s + d.j.length, 0);
  let sst = 0;
  for (const s of data.seeds) { const m = mean(Array.from(s.y)); for (const y of s.y) sst += (y - m) ** 2; }
  const families = [];
  for (const fam of FAMILIES) {
    if (fam.positive && data.xs[0] <= 0) { families.push({ id: fam.id, name: fam.name, k: fam.k, applicable: false }); continue; }
    const fit = fitFamily(fam, data, data.seeds);
    if (!fit || !Number.isFinite(fit.sse)) { families.push({ id: fam.id, name: fam.name, k: fam.k, applicable: false }); continue; }
    const p = fam.k + S;
    const aic = n * Math.log(Math.max(fit.sse, 1e-300) / n) + 2 * p + (2 * p * (p + 1)) / Math.max(1, n - p - 1);
    let cvErr = NaN, cvSe = NaN;
    if (cv && S >= 4) {
      const errs = [];
      for (let i = 0; i < S; i++) {
        const rest = data.seeds.filter((_, q) => q !== i);
        const f = fam.k ? fitFamily(fam, data, rest, fit.theta) : fit;
        const held = levels(fam, f.theta, data, [data.seeds[i]])[0];
        if (Number.isFinite(held.rms)) errs.push(held.rms);
      }
      cvErr = mean(errs);
      cvSe = Math.sqrt(errs.reduce((s, e) => s + (e - cvErr) ** 2, 0) / Math.max(1, errs.length - 1)) / Math.sqrt(errs.length);
    }
    const lv = levels(fam, fit.theta, data, data.seeds);
    const level = Math.exp(mean(lv.map(l => l.logLevel)));
    const rates = localRates(fam, fit.theta, data.xref, level, data.xref);
    families.push({
      id: fam.id, name: fam.name, k: fam.k, applicable: true, theta: fit.theta, sse: fit.sse, aic,
      r2: sst > 0 ? 1 - fit.sse / sst : 1, cv: cvErr, cvSe, level, xref: data.xref,
      formula: fam.formula(fit.theta, level, data.xref, sym),
      elasticity: rates.elasticity, slope: rates.slope,
      change: fam.f(data.xs[data.xs.length - 1] / data.xref, fit.theta) / fam.f(data.xs[0] / data.xref, fit.theta) - 1,
    });
  }
  const ok = families.filter(f => f.applicable);
  const minAic = Math.min(...ok.map(f => f.aic));
  for (const f of ok) f.dAic = f.aic - minAic;
  const score = f => (Number.isFinite(f.cv) ? f.cv : f.aic);
  const best = ok.reduce((a, b) => (score(b) < score(a) ? b : a));
  // the simplest family that predicts unseen seeds about as well as the best (one-standard-error rule)
  const cut = Number.isFinite(best.cv) ? best.cv + best.cvSe : best.aic + 2;
  const order = id => FAMILIES.findIndex(f => f.id === id);
  const near = ok.filter(f => score(f) <= cut);
  const kMin = Math.min(...near.map(f => f.k));
  const fewest = near.filter(f => f.k === kMin).sort((a, b) => score(a) - score(b));
  const tie = Number.isFinite(best.cv) ? 0.25 * best.cvSe : 0.5;
  const simplest = fewest.filter(f => score(f) <= score(fewest[0]) + tie).sort((a, b) => order(a.id) - order(b.id))[0];

  // How the best shape varies across seeds
  const fam = family(best.id);
  const lv = levels(fam, best.theta, data, data.seeds);
  const logLevels = lv.map(l => l.logLevel), mLog = mean(logLevels);
  const sdLog = Math.sqrt(logLevels.reduce((s, v) => s + (v - mLog) ** 2, 0) / Math.max(1, S - 1));
  const seedRates = [];
  if (fam.k) {
    for (const s of data.seeds) {
      const f = fitFamily(fam, data, [s], best.theta);
      const r = f && Number.isFinite(f.sse) ? localRates(fam, f.theta, data.xref, 1, data.xref) : null;
      if (r && Number.isFinite(r.elasticity)) seedRates.push({ seed: s.seed, elasticity: r.elasticity });
    }
  }
  // Data-driven change over the range for each seed: mean log work over the first and last tenth of values.
  const J = data.xs.length, edge = Math.max(1, Math.round(J / 10));
  const changes = [];
  for (const s of data.seeds) {
    const lo = [], hi = [];
    for (let q = 0; q < s.j.length; q++) { if (s.j[q] < edge) lo.push(s.y[q]); if (s.j[q] >= J - edge) hi.push(s.y[q]); }
    if (lo.length && hi.length) changes.push({ seed: s.seed, change: Math.exp(mean(hi) - mean(lo)) - 1 });
  }
  const ch = changes.map(c => c.change), el = seedRates.map(r => r.elasticity);
  return {
    seeds: S,
    points: n,
    range: [data.xs[0], data.xs[J - 1]],
    edge: [data.xs[Math.min(J - 1, edge - 1)], data.xs[Math.max(0, J - edge)]],
    xref: data.xref,
    families,
    best: best.id,
    simplest: simplest.id,
    nearBest: near.map(f => f.id),
    seedLevels: lv.map(l => ({ seed: l.seed, level: Math.exp(l.logLevel), rms: l.rms })),
    levelSpread: Math.exp(sdLog) - 1,
    wiggle: quantile(lv.map(l => l.rms), 0.5),
    seedElasticity: el.length ? { median: quantile(el, 0.5), q10: quantile(el, 0.1), q90: quantile(el, 0.9) } : null,
    change: ch.length ? { median: quantile(ch, 0.5), q10: quantile(ch, 0.1), q90: quantile(ch, 0.9), perSeed: changes } : null,
  };
}
