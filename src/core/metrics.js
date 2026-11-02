import { EMPTY, LOOSE, PILE } from './kinds.js';

// Walking's lower bound is loose (walk / bound typically runs 5-15x where strokes and work sit near 1), so
// its weight starts at 0.2 to keep the three terms comparable. All three are dials.
export const DEFAULT_WEIGHTS = Object.freeze({ strokes: 1, walk: 0.2, work: 1 });

// Time to rake, in seconds, reading field units as metres: walking at walkSpeed, drawing the rake along
// every stroke at rakeSpeed, perLoad extra seconds per unit of work (dragging a big pile is slower than one
// leaf), and fixed seconds per stroke and per new pile. Every term is a dial (config.time).
export const DEFAULT_TIME = Object.freeze({ walkSpeed: 1.4, rakeSpeed: 1, perLoad: 0.05, perStroke: 2, perFound: 5 });

// The time split into its parts, from a game's counters (or a snapshot, which carries the same fields).
export function timeParts(c, tm = DEFAULT_TIME) {
  const t = { ...DEFAULT_TIME, ...tm };
  const walk = c.walkDist / Math.max(1e-9, t.walkSpeed), rake = c.rakeDist / Math.max(1e-9, t.rakeSpeed);
  const load = c.work * t.perLoad, strokes = c.strokes * t.perStroke, found = c.foundings * t.perFound;
  return { walk, rake, load, strokes, found, total: walk + rake + load + strokes + found };
}

// Everything a run reports, as plain data.
export function snapshot(g) {
  const c = g.c, sizes = [], time = timeParts(c, g.timeCfg);
  for (let j = 0; j < g.size; j++) if (g.kind[j] === PILE) sizes.push(g.mass[j]);
  sizes.sort((a, b) => b - a);
  return {
    status: g.status,
    reason: g.reason,
    detail: g.detail,
    N: g.N, n: g.n, t: g.t, k: g.k, l: g.l, spare: g.s,
    moves: c.moves,
    strokes: c.strokes,
    pointStrokes: c.pointStrokes,
    mergeStrokes: c.mergeStrokes,
    foundings: c.foundings,
    walks: c.walks,
    walkDist: c.walkDist,
    rakeDist: c.rakeDist,
    travel: c.walkDist + c.rakeDist,
    work: c.work,
    time: time.total,
    timeParts: time,
    captures: c.captures,
    sweepEfficiency: c.captures / Math.max(1, g.N - g.n),
    loose: c.nLoose,
    piles: c.nPiles,
    fullPiles: c.nFull,
    frozenPiles: c.detPiles,
    budgetUsed: c.excess,
    pileSizes: sizes,
  };
}

// Weighted score (lower is better). Each cost is divided by a normaliser for this instance so the
// weights are unit-free: strokes by N - n (the count when nothing is ever swept up), walking and work by
// their certified lower bounds, floored at one mean point spacing so a tiny bound can't blow up the ratio.
// (Stroke length is reported but not scored separately: work already charges every dragged point.)
// Failed runs score Infinity and rank after every success.
export function score(m, bounds, w = DEFAULT_WEIGHTS) {
  if (m.status !== 'success') return Infinity;
  const floor = bounds.spacing || 1e-9;
  const strokeNorm = Math.max(1, m.N - m.n);
  const walkNorm = Math.max(bounds.travel || 0, floor);
  const workNorm = Math.max(bounds.work || 0, floor);
  const ws = w.strokes ?? 1, ww = w.walk ?? w.travel ?? 0.2, wk = w.work ?? 1;
  return (ws * m.strokes) / strokeNorm + (ww * m.walkDist) / walkNorm + (wk * m.work) / workNorm;
}

// Cross-checks the live counters against the site arrays. Returns a list of problems (empty = fine).
export function checkInvariants(g) {
  const problems = [];
  let mass = 0, loose = 0, piles = 0, full = 0, small = 0, excess = 0, det = 0, detMass = 0, detExcess = 0;
  for (let j = 0; j < g.size; j++) {
    const kd = g.kind[j], m = g.mass[j];
    if (kd === EMPTY) {
      if (m !== 0) problems.push(`empty site ${j} has mass ${m}`);
      if (g.detached[j]) problems.push(`empty site ${j} is marked frozen`);
      continue;
    }
    mass += m;
    if (kd === LOOSE) {
      loose++;
      if (m !== 1) problems.push(`loose point ${j} has mass ${m}`);
      if (g.detached[j]) problems.push(`loose point ${j} is frozen`);
    } else {
      piles++;
      if (m >= g.t) { full++; excess += m - g.t; } else if (!g.detached[j]) small++;
      if (g.detached[j]) {
        det++; detMass += m; detExcess += m - g.t;
        if (m < g.t) problems.push(`frozen pile ${j} has only ${m} points`);
      }
    }
  }
  const c = g.c;
  const expect = (name, got, want) => { if (got !== want) problems.push(`${name}: counter ${got}, actual ${want}`); };
  expect('total mass', mass, g.N);
  expect('loose', c.nLoose, loose);
  expect('piles', c.nPiles, piles);
  expect('full piles', c.nFull, full);
  expect('small piles', c.nSmall, small);
  expect('excess', c.excess, excess);
  expect('frozen piles', c.detPiles, det);
  expect('frozen mass', c.detMass, detMass);
  expect('frozen excess', c.detExcess, detExcess);
  if (g.raker >= 0 && !g.active(g.raker)) problems.push(`raker stands on site ${g.raker}, which is not live`);
  return problems;
}
