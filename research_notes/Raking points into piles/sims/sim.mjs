// Seeded simulations supporting point_processes_and_connectivity.md
// Unit square window W=[0,1]^2. All generators return EXACTLY N points.
const TAU = 2 * Math.PI;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeNormal(rng) { let spare = null; return () => { if (spare !== null) { const s = spare; spare = null; return s; } let u; do { u = rng(); } while (u === 0); const v = rng(); const r = Math.sqrt(-2 * Math.log(u)); spare = r * Math.sin(TAU * v); return r * Math.cos(TAU * v); }; }
function poissonSmall(rng, lam) { const L = Math.exp(-lam); let k = 0, p = rng(); while (p > L) { k++; p *= rng(); } return k; }
function poisson(rng, lam) { let k = 0; while (lam > 30) { k += poissonSmall(rng, 30); lam -= 30; } return k + poissonSmall(rng, lam); }
function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));

function uniformN(rng, N) { const x = new Float64Array(N), y = new Float64Array(N); for (let i = 0; i < N; i++) { x[i] = rng(); y[i] = rng(); } return { x, y, tries: 1 }; }

// Thomas (+ optional uniform background fraction w0), EXACTLY conditioned on N(W)=N via
// rejection on the parent configuration: accept w.p. (Lam/N)^N e^{N-Lam}, Lam = integrated driving intensity on W.
function thomasExactN(rng, nrm, N, kappa, sigma, w0 = 0) {
  const e = 4 * sigma, X0 = -e, S = 1 + 2 * e, areaExt = S * S;
  const lamB = w0 * N, mu = (1 - w0) * N / kappa;
  let tries = 0;
  for (;;) {
    tries++;
    const np = poisson(rng, kappa * areaExt);
    const px = new Float64Array(np), py = new Float64Array(np);
    let mass = 0;
    for (let i = 0; i < np; i++) {
      px[i] = X0 + S * rng(); py[i] = X0 + S * rng();
      mass += (Phi((1 - px[i]) / sigma) - Phi(-px[i] / sigma)) * (Phi((1 - py[i]) / sigma) - Phi(-py[i] / sigma));
    }
    const Lam = lamB + mu * mass;
    const logacc = N * Math.log(Lam / N) + N - Lam;
    if (!(Math.log(rng()) <= logacc)) continue;
    const pB = lamB / Lam;
    const x = new Float64Array(N), y = new Float64Array(N);
    for (let k = 0; k < N;) {
      if (rng() < pB) { x[k] = rng(); y[k] = rng(); k++; continue; }
      for (;;) { const j = (rng() * np) | 0; const xx = px[j] + sigma * nrm(), yy = py[j] + sigma * nrm(); if (xx >= 0 && xx <= 1 && yy >= 0 && yy <= 1) { x[k] = xx; y[k] = yy; k++; break; } }
    }
    return { x, y, tries };
  }
}
// Matérn cluster, N iid draws from the random driving intensity (NO conditioning reweight: approximate).
function maternN(rng, N, kappa, R) {
  const X0 = -R, S = 1 + 2 * R;
  for (;;) {
    const np = poisson(rng, kappa * S * S); if (np === 0) continue;
    const px = new Float64Array(np), py = new Float64Array(np);
    for (let i = 0; i < np; i++) { px[i] = X0 + S * rng(); py[i] = X0 + S * rng(); }
    const x = new Float64Array(N), y = new Float64Array(N);
    for (let k = 0; k < N;) { const j = (rng() * np) | 0; const rr = R * Math.sqrt(rng()), th = TAU * rng(); const xx = px[j] + rr * Math.cos(th), yy = py[j] + rr * Math.sin(th); if (xx >= 0 && xx <= 1 && yy >= 0 && yy <= 1) { x[k] = xx; y[k] = yy; k++; } }
    return { x, y, tries: 1 };
  }
}
// LGCP with Gaussian covariance c(r)=s2*exp(-(r/h)^2), field by random Fourier features (M cosines),
// N iid draws from exp(Z)/int exp(Z) by rejection (approximate: no conditioning reweight).
function lgcpN(rng, nrm, N, s2, h, M = 300) {
  const wx = new Float64Array(M), wy = new Float64Array(M), b = new Float64Array(M), s = Math.SQRT2 / h;
  for (let j = 0; j < M; j++) { wx[j] = s * nrm(); wy[j] = s * nrm(); b[j] = TAU * rng(); }
  const amp = Math.sqrt(2 * s2 / M);
  const Z = (x, y) => { let z = 0; for (let j = 0; j < M; j++) z += Math.cos(wx[j] * x + wy[j] * y + b[j]); return amp * z; };
  let zmax = -Infinity; const G = 60;
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) zmax = Math.max(zmax, Z((i + 0.5) / G, (j + 0.5) / G));
  zmax += 0.3 * Math.sqrt(s2);
  const x = new Float64Array(N), y = new Float64Array(N);
  for (let k = 0; k < N;) { const xx = rng(), yy = rng(); const z = Z(xx, yy); if (z > zmax) zmax = z; if (rng() < Math.exp(z - zmax)) { x[k] = xx; y[k] = yy; k++; } }
  return { x, y, tries: 1 };
}

// EMST bottleneck (longest MST edge) by O(N^2) Prim; also max nearest-neighbour distance and mean NN distance.
function stats(x, y) {
  const n = x.length; const inT = new Uint8Array(n); const d = new Float64Array(n).fill(Infinity); d[0] = 0; let maxE = 0;
  for (let it = 0; it < n; it++) {
    let u = -1, best = Infinity; for (let i = 0; i < n; i++) if (!inT[i] && d[i] < best) { best = d[i]; u = i; }
    inT[u] = 1; if (best > maxE) maxE = best; const ux = x[u], uy = y[u];
    for (let i = 0; i < n; i++) if (!inT[i]) { const dx = x[i] - ux, dy = y[i] - uy, dd = dx * dx + dy * dy; if (dd < d[i]) d[i] = dd; }
  }
  let sum = 0, maxNN = 0;
  for (let i = 0; i < n; i++) { let m = Infinity; const xi = x[i], yi = y[i]; for (let j = 0; j < n; j++) if (j !== i) { const dx = x[j] - xi, dy = y[j] - yi, dd = dx * dx + dy * dy; if (dd < m) m = dd; } m = Math.sqrt(m); sum += m; if (m > maxNN) maxNN = m; }
  const meanNN = sum / n;
  const Rnaive = meanNN / (0.5 * Math.sqrt(1 / n));
  const ED = 0.5 * Math.sqrt(1 / n) + (0.0514 + 0.041 / Math.sqrt(n)) * 4 / n; // Donnelly (1978) as in spatstat (from memory)
  return { M: Math.sqrt(maxE), maxNN, Rnaive, RD: meanNN / ED };
}
const q = (arr, p) => { const a = Float64Array.from(arr).sort(); const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

// ---------- Analytic (uniform, binomial N points in unit square) ----------
function areaDiscSquare(cx, cy, r, nq = 160) { const u0 = Math.max(0, cx - r), u1 = Math.min(1, cx + r), du = (u1 - u0) / nq; let A = 0; for (let i = 0; i < nq; i++) { const u = u0 + (i + 0.5) * du, hh = Math.sqrt(Math.max(0, r * r - (u - cx) * (u - cx))); const lo = Math.max(0, cy - hh), hi = Math.min(1, cy + hh); if (hi > lo) A += (hi - lo) * du; } return A; }
function EisoExact(N, r, G) { let s = 0; const d = 0.5 / G; for (let i = 0; i < G; i++) { const cx = (i + 0.5) * d; for (let j = 0; j < G; j++) { const cy = (j + 0.5) * d; const A = (cx >= r && cy >= r) ? Math.PI * r * r : areaDiscSquare(cx, cy, r); s += Math.pow(1 - A, N - 1); } } return 4 * N * s * d * d; }
const Eiso3 = (N, r) => N * Math.exp(-N * Math.PI * r * r) + (2 / r) * Math.exp(-N * Math.PI * r * r / 2) + (4 / (N * r * r)) * Math.exp(-N * Math.PI * r * r / 4);
const EisoBulk = (N, r) => N * Math.exp(-N * Math.PI * r * r);
function solveR(f, target, lo = 1e-4, hi = 1) { for (let it = 0; it < 45; it++) { const mid = 0.5 * (lo + hi); if (f(mid) > target) lo = mid; else hi = mid; } return 0.5 * (lo + hi); }

const out = [];
const log = s => { out.push(s); console.log(s); };

// ---------- Part A: analytic vs Monte Carlo for uniform ----------
log('## A. Uniform N points in unit square: P(connected at radius r) ~ exp(-E[#isolated])');
for (const N of [100, 200, 500, 1000, 2000]) {
  const G = N <= 200 ? 120 : (N <= 1000 ? 220 : 300);
  const row = [];
  for (const p of [0.05, 0.5, 0.95]) {
    const t = -Math.log(p);
    row.push([p, solveR(r => EisoBulk(N, r), t), solveR(r => Eiso3(N, r), t), solveR(r => EisoExact(N, r, G), t)]);
  }
  log(`N=${N}: ` + row.map(([p, b, a3, ex]) => `p=${p}: bulk r=${b.toFixed(4)}, 3-term r=${a3.toFixed(4)}, exact-int r=${ex.toFixed(4)}`).join(' | '));
}

// ---------- Part B: Monte Carlo bottleneck across processes ----------
const configs = [
  { name: 'Uniform (binomial)', gen: (rng, nrm, N) => uniformN(rng, N), g0: 0 },
  { name: 'Thomas mild k=25 s=0.08', gen: (rng, nrm, N) => thomasExactN(rng, nrm, N, 25, 0.08), g0: 1 / (4 * Math.PI * 25 * 0.08 ** 2) },
  { name: 'Thomas moderate k=25 s=0.04', gen: (rng, nrm, N) => thomasExactN(rng, nrm, N, 25, 0.04), g0: 1 / (4 * Math.PI * 25 * 0.04 ** 2) },
  { name: 'Thomas strong k=10 s=0.025', gen: (rng, nrm, N) => thomasExactN(rng, nrm, N, 10, 0.025), g0: 1 / (4 * Math.PI * 10 * 0.025 ** 2) },
  { name: 'Thomas moderate + 30% bg', gen: (rng, nrm, N) => thomasExactN(rng, nrm, N, 25, 0.04, 0.3), g0: 0.49 / (4 * Math.PI * 25 * 0.04 ** 2) },
  { name: 'Matern mild k=25 R=0.16 (approx N-cond)', gen: (rng, nrm, N) => maternN(rng, N, 25, 0.16), g0: 1 / (25 * Math.PI * 0.16 ** 2) },
  { name: 'LGCP gauss s2=0.5 h=0.1 (approx N-cond)', gen: (rng, nrm, N) => lgcpN(rng, nrm, N, 0.5, 0.1), g0: Math.exp(0.5) - 1 },
  { name: 'LGCP gauss s2=2 h=0.1 (approx N-cond)', gen: (rng, nrm, N) => lgcpN(rng, nrm, N, 2.0, 0.1), g0: Math.exp(2) - 1 },
];
log('\n## B. Monte Carlo (seeded mulberry32), unit square, exactly N points');
log('config | N | reps | g(0)-1 | CE R naive | CE R Donnelly | M median [5%,95%] | M*sqrt(N) median | P(M==maxNN) | median M/maxNN | accept rate');
for (const N of [200, 1000]) {
  const reps = N === 200 ? 400 : 150;
  for (const c of configs) {
    const rng = mulberry32(12345 + N), nrm = makeNormal(rng);
    const Ms = [], Rn = [], Rd = [], eq = [], ratio = []; let tries = 0;
    for (let r = 0; r < reps; r++) { const P = c.gen(rng, nrm, N); tries += P.tries; const s = stats(P.x, P.y); Ms.push(s.M); Rn.push(s.Rnaive); Rd.push(s.RD); eq.push(Math.abs(s.M - s.maxNN) < 1e-12 ? 1 : 0); ratio.push(s.M / s.maxNN); }
    log(`${c.name} | ${N} | ${reps} | ${c.g0.toFixed(2)} | ${mean(Rn).toFixed(3)} | ${mean(Rd).toFixed(3)} | ${q(Ms, .5).toFixed(4)} [${q(Ms, .05).toFixed(4)}, ${q(Ms, .95).toFixed(4)}] | ${(q(Ms, .5) * Math.sqrt(N)).toFixed(2)} | ${mean(eq).toFixed(2)} | ${q(ratio, .5).toFixed(3)} | ${(reps / tries).toFixed(3)}`);
  }
}

// ---------- Part C: removal experiments (30% of points removed) ----------
function removeAndMeasure(P, mode, rng, frac = 0.3) {
  const n = P.x.length, target = Math.round(frac * n); const keep = new Uint8Array(n).fill(1); let removed = 0;
  if (mode === 'random') { const idx = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; } for (let i = 0; i < target; i++) keep[idx[i]] = 0; removed = target; }
  else if (mode === 'disc') { const cx = 0.25 + 0.5 * rng(), cy = 0.25 + 0.5 * rng(); const idx = [...Array(n).keys()].sort((a, b) => ((P.x[a] - cx) ** 2 + (P.y[a] - cy) ** 2) - ((P.x[b] - cx) ** 2 + (P.y[b] - cy) ** 2)); for (let i = 0; i < target; i++) keep[idx[i]] = 0; removed = target; }
  else if (mode === 'capsules') { // many short rake-like capsules: segment length 0.1, half-width l=0.02, starting at a random remaining point
    const L = 0.1, l = 0.02;
    while (removed < target) {
      let s; do { s = (rng() * n) | 0; } while (!keep[s]);
      const th = TAU * rng(); const ax = P.x[s], ay = P.y[s]; const bx = Math.min(1, Math.max(0, ax + L * Math.cos(th))), by = Math.min(1, Math.max(0, ay + L * Math.sin(th)));
      const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1e-18;
      for (let i = 0; i < n; i++) if (keep[i]) { let t = ((P.x[i] - ax) * vx + (P.y[i] - ay) * vy) / vv; t = Math.max(0, Math.min(1, t)); const dx = P.x[i] - (ax + t * vx), dy = P.y[i] - (ay + t * vy); if (dx * dx + dy * dy <= l * l) { keep[i] = 0; removed++; } }
    }
  }
  else if (mode === 'band') { const w = frac / 2, c = 0.5; for (let i = 0; i < n; i++) if (Math.abs(P.y[i] - c) <= w) { keep[i] = 0; removed++; } }
  const xs = [], ys = []; for (let i = 0; i < n; i++) if (keep[i]) { xs.push(P.x[i]); ys.push(P.y[i]); }
  return { M: stats(Float64Array.from(xs), Float64Array.from(ys)).M, left: xs.length };
}
log('\n## C. Remove ~30% of N=1000 points; bottleneck M of the remaining points');
log('base | mode | median M before | median M after [5%,95%] | median ratio after/before | mean points left');
for (const base of [configs[0], configs[2]]) {
  for (const mode of ['random', 'disc', 'capsules', 'band']) {
    const rng = mulberry32(777), nrm = makeNormal(rng); const before = [], after = [], ratio = [], left = [];
    for (let r = 0; r < 120; r++) { const P = base.gen(rng, nrm, 1000); const M0 = stats(P.x, P.y).M; const res = removeAndMeasure(P, mode, rng); before.push(M0); after.push(res.M); ratio.push(res.M / M0); left.push(res.left); }
    log(`${base.name} | ${mode} | ${q(before, .5).toFixed(4)} | ${q(after, .5).toFixed(4)} [${q(after, .05).toFixed(4)}, ${q(after, .95).toFixed(4)}] | ${q(ratio, .5).toFixed(3)} | ${mean(left).toFixed(0)}`);
  }
}
// uniform prediction for 700 points
log(`Uniform prediction (exact-integral, binomial) for N=700: median r = ${solveR(r => EisoExact(700, r, 220), Math.log(2)).toFixed(4)}`);
