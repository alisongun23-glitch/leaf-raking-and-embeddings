import { Rng } from '../core/rng.js';
import { ADVERSARIAL, adversarialField } from './adversarial.js';
import { DATASETS, placeDataset } from '../data/datasets.js';

// Field generators: point patterns that are "randomly sprinkled with slight grouping".
// Every model draws exactly N points inside the W x H box. Points that land outside are rejected,
// never clipped (clipping would stack points along the border).
//
// Dials (spec):
//   model       'thomas' | 'matern' | 'mixture' | 'lgcp' | 'uniform' | one of ADVERSARIAL | 'custom' (spec.points)
//               | 'data:<id>' for a real-world set from src/data (N then picks a seeded subset of its points)
//   N, W, H     point count and box size
//   clumps      expected number of clump centres (thomas, matern), exact count (mixture),
//               or hot-spot scale (lgcp: correlation length = 0.5 * sqrt(A / clumps))
//   grouping    pair-correlation excess g(0) - 1: 0 = no grouping; about 0.5 is "slight", 2 "moderate",
//               10+ "strong". The clump spread is derived from it (Thomas: g(0) - 1 = (1-w)^2 / (4 pi kappa sigma^2)).
//   background  fraction w of points scattered uniformly between clumps (stepping stones)
//   lattice     snap points to distinct integer grid cells
//   nested      keep the leaves when N changes: the field for N is the first N points of one fixed sequence,
//               so adding a leaf never moves the others. Thomas clump centres are then conditioned on nestN
//               points instead of N, and lattice snapping goes in point order. (Matérn, fixed clumps, LGCP
//               and uniform already draw their points one after another; the shapes depend on N as a whole.)

export const FIELD_MODELS = [
  { id: 'thomas', name: 'Thomas clumps (exact N)', group: 'Random' },
  { id: 'matern', name: 'Matérn clumps', group: 'Random' },
  { id: 'mixture', name: 'Fixed clumps + background', group: 'Random' },
  { id: 'lgcp', name: 'Smooth hot spots (LGCP)', group: 'Random' },
  { id: 'uniform', name: 'Uniform', group: 'Random' },
  ...ADVERSARIAL.map(a => ({ ...a, group: 'Stress-test shapes' })),
  ...DATASETS.map(d => ({ id: `data:${d.id}`, name: `${d.name} (${d.count})`, group: d.group || 'Real data' })),
  { id: 'custom', name: 'Hand-placed or loaded points', group: 'Your points' },
];
export const isDataModel = model => typeof model === 'string' && model.startsWith('data:');

export const DEFAULT_FIELD = Object.freeze({
  model: 'thomas', N: 300, W: 100, H: 100, clumps: 8, grouping: 1, background: 0.25, lattice: false, nested: false, nestN: 300,
});

// Standard normal CDF via Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7).
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));

const clamp01 = v => Math.min(1, Math.max(0, v));

// Clump spread for a target grouping, per model (null = no grouping: fall back to uniform).
export function clumpSpread(spec) {
  const A = spec.W * spec.H, kappa = Math.max(spec.clumps, 1e-9) / A, w = clamp01(spec.background);
  const g = spec.grouping;
  if (!(g > 0) || w >= 1) return null;
  if (spec.model === 'matern') return (1 - w) / Math.sqrt(Math.PI * kappa * g); // disc radius R
  return (1 - w) / Math.sqrt(4 * Math.PI * kappa * g); // Gaussian sigma (thomas, mixture)
}

export function generateField(spec, seed) {
  const s = { ...DEFAULT_FIELD, ...spec };
  if (s.model === 'custom') return customField(s, seed);
  if (isDataModel(s.model)) return dataField(s, seed);
  const N = Math.max(1, Math.round(s.N));
  const rng = new Rng(seed, `field:${s.model}`);
  let pts;
  if (ADVERSARIAL.some(a => a.id === s.model)) pts = adversarialField(s.model, N, s.W, s.H, rng);
  else {
    const spread = clumpSpread(s);
    if (s.model === 'uniform' || (spread === null && s.model !== 'lgcp')) pts = uniform(N, s.W, s.H, rng);
    else if (s.model === 'thomas') pts = thomasExactN(N, s, spread, rng);
    else if (s.model === 'matern') pts = matern(N, s, spread, rng);
    else if (s.model === 'mixture') pts = mixture(N, s, spread, rng);
    else if (s.model === 'lgcp') pts = lgcp(N, s, rng);
    else throw new Error(`Unknown field model "${s.model}".`);
  }
  if (s.lattice) pts = snapToLattice(pts, s.W, s.H, rng, s.nested);
  return { W: s.W, H: s.H, xs: pts.xs, ys: pts.ys, labels: pts.labels, spec: s, seed };
}

// A real-world set placed in the field. With N below its size, the seed picks which points: a seeded
// order of all of them, cut after N, so a smaller N keeps a subset of a larger one (nested, like spec.nested).
function dataField(s, seed) {
  const id = s.model.slice(5), d = placeDataset(id);
  if (!d) throw new Error(`Unknown data set "${id}".`);
  const total = d.xs.length, N = Math.max(1, Math.min(total, Math.round(s.N) || total));
  const idx = N < total ? new Rng(seed, s.model).shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, N) : null;
  const xs = idx ? Float64Array.from(idx, i => d.xs[i]) : d.xs.slice(), ys = idx ? Float64Array.from(idx, i => d.ys[i]) : d.ys.slice();
  return { W: d.W, H: d.H, xs, ys, labels: new Int32Array(N).fill(-1), spec: { ...s, N, W: d.W, H: d.H }, seed, total };
}

// Points placed by hand (spec.points = [[x, y], ...]), clamped into the box.
function customField(s, seed) {
  const P = Array.isArray(s.points) ? s.points : [];
  const xs = Float64Array.from(P, p => Math.min(s.W, Math.max(0, +p[0] || 0)));
  const ys = Float64Array.from(P, p => Math.min(s.H, Math.max(0, +p[1] || 0)));
  return { W: s.W, H: s.H, xs, ys, labels: new Int32Array(P.length).fill(-1), spec: { ...s, N: P.length }, seed };
}

function uniform(N, W, H, rng) {
  const xs = new Float64Array(N), ys = new Float64Array(N), labels = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) { xs[i] = rng.range(0, W); ys[i] = rng.range(0, H); }
  return { xs, ys, labels };
}

// Thomas process conditioned on exactly N points (research notes, point_processes_and_connectivity.md §1).
// Given the parents, the pattern is Poisson with intensity Lambda(x) = background + mu * sum of Gaussians,
// so accepting a prior parent draw with probability (Lambda(W)/N)^N e^(N - Lambda(W)) and then drawing N
// i.i.d. points from Lambda is exact. Parents live in a window expanded by 4 sigma to avoid edge effects.
function thomasExactN(N, s, sigma, rng) {
  const { W, H } = s, A = W * H, w0 = clamp01(s.background), kappa = s.clumps / A;
  const e = 4 * sigma, We = W + 2 * e, He = H + 2 * e;
  // Nested fields condition the parents on a fixed count, so the same parents serve every N.
  const Nc = s.nested ? Math.max(1, Math.round(s.nestN || N)) : N;
  const lamB = w0 * Nc, mu = ((1 - w0) * Nc) / (kappa * A);
  for (let tries = 0; tries < 20000; tries++) {
    const np = rng.poisson(kappa * We * He);
    const px = new Float64Array(np), py = new Float64Array(np);
    let massIn = 0;
    for (let i = 0; i < np; i++) {
      px[i] = -e + We * rng.float();
      py[i] = -e + He * rng.float();
      massIn += (Phi((W - px[i]) / sigma) - Phi(-px[i] / sigma)) * (Phi((H - py[i]) / sigma) - Phi(-py[i] / sigma));
    }
    const Lam = lamB + mu * massIn;
    if (!(Lam > 0) || Math.log(rng.float()) > Nc * Math.log(Lam / Nc) + Nc - Lam) continue;
    return drawFromParents(N, W, H, np === 0 ? 1 : lamB / Lam, np, rng, j => [px[j] + sigma * rng.normal(), py[j] + sigma * rng.normal()]);
  }
  return mixture(N, s, sigma, rng); // practically unreachable; keeps the generator total
}

// Matérn cluster process: offspring uniform in a disc of radius R around each parent. The parent draw is
// not reweighted (approximately conditioned on N), which is fine for a game.
function matern(N, s, R, rng) {
  const { W, H } = s, kappa = s.clumps / (W * H), w0 = clamp01(s.background);
  const We = W + 2 * R, He = H + 2 * R;
  let np = rng.poisson(kappa * We * He);
  if (np === 0 && w0 < 1) np = 1;
  const px = new Float64Array(np), py = new Float64Array(np);
  for (let i = 0; i < np; i++) { px[i] = -R + We * rng.float(); py[i] = -R + He * rng.float(); }
  return drawFromParents(N, W, H, w0, np, rng, j => {
    const r = R * Math.sqrt(rng.float()), th = 2 * Math.PI * rng.float();
    return [px[j] + r * Math.cos(th), py[j] + r * Math.sin(th)];
  });
}

// A fixed number of Gaussian clumps placed inside the box, plus uniform background "clutter".
function mixture(N, s, sigma, rng) {
  const { W, H } = s, m = Math.max(1, Math.round(s.clumps)), w0 = clamp01(s.background);
  const cx = new Float64Array(m), cy = new Float64Array(m);
  for (let i = 0; i < m; i++) { cx[i] = rng.range(0, W); cy[i] = rng.range(0, H); }
  return drawFromParents(N, W, H, w0, m, rng, j => [cx[j] + sigma * rng.normal(), cy[j] + sigma * rng.normal()]);
}

// Each point: uniform background with probability pB, otherwise offspring of a uniformly chosen parent
// (redrawn until it lands inside the box). labels[i] = parent index, or -1 for background points.
function drawFromParents(N, W, H, pB, np, rng, offspring) {
  const xs = new Float64Array(N), ys = new Float64Array(N), labels = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; ) {
    if (np === 0 || rng.float() < pB) {
      xs[i] = rng.range(0, W); ys[i] = rng.range(0, H); i++;
      continue;
    }
    for (let guard = 0; guard < 1000; guard++) {
      const j = rng.int(np), [x, y] = offspring(j);
      if (x >= 0 && x <= W && y >= 0 && y <= H) { xs[i] = x; ys[i] = y; labels[i] = j; i++; break; }
      if (guard === 999) { xs[i] = rng.range(0, W); ys[i] = rng.range(0, H); i++; }
    }
  }
  return { xs, ys, labels };
}

// Log-Gaussian Cox process approximated with random Fourier features (covariance sigma^2 exp(-r^2/h^2)),
// points drawn i.i.d. with density proportional to exp(Z) by rejection. g(0) - 1 = e^(sigma^2) - 1.
function lgcp(N, s, rng) {
  const { W, H } = s, A = W * H, w0 = clamp01(s.background);
  const gEx = Math.max(s.grouping, 0) / Math.max((1 - w0) ** 2, 1e-6);
  const sig2 = Math.log(1 + gEx), h = 0.5 * Math.sqrt(A / Math.max(s.clumps, 1));
  const M = 200, amp = Math.sqrt((2 * sig2) / M);
  const wx = new Float64Array(M), wy = new Float64Array(M), b = new Float64Array(M);
  const sd = Math.sqrt(2) / h;
  for (let j = 0; j < M; j++) { wx[j] = sd * rng.normal(); wy[j] = sd * rng.normal(); b[j] = 2 * Math.PI * rng.float(); }
  const Z = (x, y) => {
    let z = 0;
    for (let j = 0; j < M; j++) z += Math.cos(wx[j] * x + wy[j] * y + b[j]);
    return amp * z;
  };
  let zmax = -Infinity;
  const G = 64;
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) zmax = Math.max(zmax, Z((i / G) * W, (j / G) * H));
  zmax += 0.25 * Math.sqrt(sig2) + 1e-9;
  const xs = new Float64Array(N), ys = new Float64Array(N), labels = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; ) {
    const x = rng.range(0, W), y = rng.range(0, H);
    if (rng.float() < w0 || Math.log(rng.float()) <= Z(x, y) - zmax) { xs[i] = x; ys[i] = y; i++; }
  }
  return { xs, ys, labels };
}

// Moves every point to a distinct integer cell, spiralling out from its rounded position when taken.
// Points claim cells in random order, or in point order for nested fields (earlier leaves keep their cells).
function snapToLattice(pts, W, H, rng, inOrder = false) {
  const cols = Math.floor(W) + 1, rows = Math.floor(H) + 1, N = pts.xs.length;
  if (cols * rows < N) throw new Error(`A ${cols} x ${rows} lattice cannot hold ${N} distinct points. Enlarge the field or lower N.`);
  const taken = new Uint8Array(cols * rows), xs = new Float64Array(N), ys = new Float64Array(N);
  const order = Array.from({ length: N }, (_, i) => i);
  if (!inOrder) rng.shuffle(order);
  for (const i of order) {
    const c0 = Math.min(cols - 1, Math.max(0, Math.round(pts.xs[i]))), r0 = Math.min(rows - 1, Math.max(0, Math.round(pts.ys[i])));
    let placed = false;
    for (let rad = 0; !placed; rad++) {
      for (let dr = -rad; dr <= rad && !placed; dr++) {
        for (let dc = -rad; dc <= rad && !placed; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || c < 0 || r >= rows || c >= cols || taken[r * cols + c]) continue;
          taken[r * cols + c] = 1; xs[i] = c; ys[i] = r; placed = true;
        }
      }
    }
  }
  return { xs, ys, labels: pts.labels };
}
