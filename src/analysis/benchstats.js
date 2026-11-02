import { Rng } from '../core/rng.js';

// Statistics for comparing algorithms on paired random instances (research notes,
// safe_traversal_and_planning.md §6): interquartile means with bootstrap intervals, Wilson intervals for
// success rates, Wilcoxon signed-rank and McNemar for two algorithms, Friedman with Holm correction for
// several, and Dolan-More performance profiles.

export const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// Interquartile mean: the mean of the middle 50%, robust to the odd extreme run.
export function iqm(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), n = s.length, lo = Math.floor(n / 4), hi = Math.ceil((3 * n) / 4);
  return mean(s.slice(lo, Math.max(hi, lo + 1)));
}

export function bootstrapCI(xs, stat = iqm, { B = 1000, alpha = 0.05, seed = 1 } = {}) {
  if (xs.length < 2) return [NaN, NaN];
  const rng = new Rng(seed, 'bootstrap'), vals = new Float64Array(B), sample = new Array(xs.length);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < xs.length; i++) sample[i] = xs[rng.int(xs.length)];
    vals[b] = stat(sample);
  }
  vals.sort();
  return [vals[Math.floor((alpha / 2) * B)], vals[Math.min(B - 1, Math.ceil((1 - alpha / 2) * B) - 1)]];
}

export function wilsonCI(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}

export function normalCdf(z) {
  // Abramowitz & Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

// Ranks with ties sharing their average rank (1-based).
function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let q = i; q <= j; q++) r[idx[q][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

// Two-sided Wilcoxon signed-rank test on paired samples (normal approximation with tie correction).
export function wilcoxon(a, b) {
  const d = [];
  for (let i = 0; i < a.length; i++) {
    const v = a[i] - b[i];
    if (Number.isFinite(v) && v !== 0) d.push(v);
  }
  const n = d.length;
  if (n < 5) return { n, p: NaN, medianDiff: NaN };
  const r = ranks(d.map(Math.abs));
  let Wp = 0;
  for (let i = 0; i < n; i++) if (d[i] > 0) Wp += r[i];
  const mu = (n * (n + 1)) / 4;
  const counts = new Map();
  for (const x of r) counts.set(x, (counts.get(x) || 0) + 1);
  let tie = 0;
  for (const c of counts.values()) tie += c * c * c - c;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tie / 48);
  const z = sigma > 0 ? (Wp - mu - Math.sign(Wp - mu) * 0.5) / sigma : 0;
  return { n, z, p: 2 * (1 - normalCdf(Math.abs(z))), medianDiff: quantile(d, 0.5) };
}

// Exact two-sided McNemar test: b = runs only A finished, c = runs only B finished.
export function mcnemar(b, c) {
  const n = b + c;
  if (!n) return 1;
  let tail = 0, coef = 1;
  const k = Math.min(b, c);
  for (let i = 0; i <= k; i++) {
    tail += coef;
    coef = (coef * (n - i)) / (i + 1);
  }
  return Math.min(1, (2 * tail) / 2 ** n);
}

// Regularised upper incomplete gamma Q(a, x), for chi-square p-values.
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const lnG = lgamma(a);
  if (x < a + 1) {
    let sum = 1 / a, term = sum;
    for (let n = 1; n < 500; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-14) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnG);
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnG) * h;
}

function lgamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Friedman test over instances (rows) x algorithms (columns); lower is better, failures as Infinity.
export function friedman(rows) {
  const N = rows.length, k = rows[0]?.length || 0;
  if (N < 2 || k < 2) return { p: NaN, meanRanks: [] };
  const sum = new Array(k).fill(0);
  for (const row of rows) ranks(row.map(v => (Number.isFinite(v) ? v : Number.MAX_VALUE))).forEach((r, j) => (sum[j] += r));
  const meanRanks = sum.map(s => s / N);
  const chi2 = ((12 * N) / (k * (k + 1))) * meanRanks.reduce((acc, r) => acc + (r - (k + 1) / 2) ** 2, 0);
  return { chi2, df: k - 1, p: gammaQ((k - 1) / 2, chi2 / 2), meanRanks };
}

export function holm(pvals) {
  const order = pvals.map((p, i) => [p, i]).filter(([p]) => Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const out = pvals.map(p => (Number.isFinite(p) ? 1 : NaN));
  let running = 0;
  order.forEach(([p, i], r) => {
    running = Math.max(running, Math.min(1, (order.length - r) * p));
    out[i] = running;
  });
  return out;
}

// Dolan-More performance profile: for each algorithm, the share of instances it solves within a factor
// tau of the best algorithm on that instance. costs[a][i] = cost of algorithm a on instance i (Infinity =
// failed). Gould & Scott's caveat applies: compare profiles of the full set, then re-check without the best.
export function performanceProfile(costs, taus) {
  const algos = Object.keys(costs), n = costs[algos[0]]?.length || 0;
  const ratios = Object.fromEntries(algos.map(a => [a, []]));
  for (let i = 0; i < n; i++) {
    const best = Math.min(...algos.map(a => costs[a][i]));
    for (const a of algos) ratios[a].push(Number.isFinite(best) && best > 0 ? costs[a][i] / best : costs[a][i] === best ? 1 : Infinity);
  }
  return Object.fromEntries(algos.map(a => [a, taus.map(tau => ratios[a].filter(r => r <= tau).length / Math.max(1, n))]));
}
