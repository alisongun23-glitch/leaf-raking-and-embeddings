import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerFit, powerAt, powerSlope, pileShift, analyseCurve, averageCurve, compareCurves } from '../src/analysis/fit.js';
import { sweepValues, sweepConfig, sweepPoint } from '../src/analysis/sweep.js';
import { shapeAnalysis, shapeValue } from '../src/analysis/shape.js';
import { DEFAULT_CONFIG, mergeConfig, buildInstance } from '../src/analysis/instance.js';
import { Rng } from '../src/core/rng.js';

test('powerFit recovers a·x^b, and its interval covers b on noisy data', () => {
  const xs = Array.from({ length: 60 }, (_, i) => 100 + 5 * i);
  const exact = powerFit(xs, xs.map(x => 3.5 * x ** 1.3), { bootstrap: 0 });
  assert.ok(Math.abs(exact.a - 3.5) < 1e-6 && Math.abs(exact.b - 1.3) < 1e-9 && exact.r2 > 0.999999);
  assert.ok(Math.abs(powerSlope(exact, 200) - 3.5 * 1.3 * 200 ** 0.3) < 1e-6);
  const rng = new Rng(3, 'noise');
  const noisy = powerFit(xs, xs.map(x => 3.5 * x ** 1.3 * Math.exp(0.05 * rng.normal())), { bootstrap: 300 });
  assert.ok(noisy.ciB[0] < 1.3 && 1.3 < noisy.ciB[1], `interval ${noisy.ciB}`);
  assert.equal(powerFit([1, 2], [1, 2]), null, 'needs three points');
  assert.ok(Math.abs(powerAt(exact, 150) - 3.5 * 150 ** 1.3) < 1e-6);
});

test('pileShift matches piles and counts leaves that changed piles', () => {
  const P = [[0, 0, 60], [50, 50, 70]];
  assert.deepEqual(pileShift(P, P), { dist: 0, moved: 0 });
  const moved = pileShift(P, [[50, 50, 70], [0, 30, 60]]);
  assert.equal(moved.dist, 30);
  assert.equal(moved.moved, 0);
  // one more leaf (in the second pile), and nine leaves moved from the first pile to the second
  assert.equal(pileShift(P, [[0, 0, 51], [50, 50, 80]]).moved, 9);
});

// A synthetic one-seed sweep: work grows like 20·N, with a planted jump where the piles move, a reach
// change, a regime switch and a failure.
function synthetic() {
  const rows = [];
  for (let N = 100; N <= 160; N++) {
    const regime = N >= 140 ? 'planned' : 'tree peel';
    let work = 20 * N * (regime === 'planned' ? 0.6 : 1);
    let piles = [[10, 10, N / 2], [90, 90, N / 2]];
    if (N >= 120 && N < 140) { work *= 1.3; piles = [[10, 60, N / 2], [90, 90, N / 2]]; }
    const k = N >= 130 ? 18 : 20, M = k / 1.5;
    const status = N === 150 ? 'failed' : 'success';
    rows.push({ value: N, seed: 7, N, n: 2, t: 40, W: 100, H: 100, k, M, status, reason: status === 'failed' ? 'gave-up' : null, work, bound: 12 * N, piles, regime, plan: regime === 'planned' ? 'complete' : 'no plan', head: 'h' });
  }
  return rows;
}

test('analyseCurve fits each regime, finds the planted jumps and names their causes', () => {
  const c = analyseCurve(synthetic(), { threshold: 0.05, bootstrap: 0 });
  assert.equal(c.points, 61);
  assert.equal(c.finished, 60);
  const planned = c.regimes.find(g => g.regime === 'planned'), peel = c.regimes.find(g => g.regime === 'tree peel');
  assert.ok(Math.abs(planned.fit.b - 1) < 1e-9, `planned b = ${planned.fit.b}`);
  assert.ok(Math.abs(planned.gap - 1) < 1e-9);
  assert.ok(peel.fit.r2 < 1, 'the tree-peel regime holds the 30% bump');
  const at = v => c.jumps.find(j => j.to === v);
  assert.ok(at(120).causes.some(k => k.kind === 'piles'), 'piles moved at 120');
  assert.ok(at(140).causes.some(k => k.kind === 'plan'), 'plan switch at 140');
  assert.equal(at(130), undefined, 'a reach change alone does not move work in this toy');
  assert.deepEqual(c.switches.map(w => w.at), [140]);
  assert.deepEqual(c.failures, [{ from: 150, to: 150, count: 1, reason: 'gave-up' }]);
  assert.ok(!c.jumps.some(j => j.from === 149 || j.to === 151), 'no jump is measured across a failed run');
  assert.ok(Math.abs(c.typicalStep - 1 / 140) < 0.01);
});

test('averageCurve and compareCurves summarise several seeds', () => {
  const a = synthetic(), b = synthetic().map(r => ({ ...r, seed: 8, work: r.work * 2, bound: r.bound * 1.5 }));
  const avg = averageCurve([...a, ...b]);
  const p = avg.find(q => q.value === 145);
  assert.equal(p.n, 2);
  assert.equal(p.mean, 1.5 * a.find(r => r.value === 145).work);
  assert.deepEqual(p.shares, { planned: 1 });
  assert.equal(avg.find(q => q.value === 150), undefined, 'no finished run at 150');
  const A = analyseCurve(a, { bootstrap: 0 }), B = analyseCurve(b, { bootstrap: 0 });
  const C = compareCurves(A, B, a, b);
  assert.ok(Math.abs(C.ratioMedian - 0.5) < 1e-12 && Math.abs(C.boundRatioMedian - 1 / 1.5) < 1e-12);
  assert.ok(Math.abs(C.level - 0.5) < 1e-9);
});

test('sweepValues rounds whole-number dials and keeps the range', () => {
  assert.deepEqual(sweepValues('field.N', 10, 14, 1), [10, 11, 12, 13, 14]);
  assert.deepEqual(sweepValues('field.N', 14, 10, 1.6), [10, 12, 14]);
  assert.deepEqual(sweepValues('raker.kMul', 1, 1.3, 0.1), [1, 1.1, 1.2, 1.3]);
  assert.equal(sweepValues('field.N', 1, 10000, 1, 50).length, 50);
});

test('a leaf-count sweep adds one leaf at a time to the same field', () => {
  const base = mergeConfig(DEFAULT_CONFIG, { field: { N: 120, W: 60, H: 60, clumps: 5 }, goal: { n: 2, t: 40 } });
  const f = N => buildInstance(sweepConfig(base, 'field.N', N), 3).field;
  const a = f(110), b = f(111), c = f(150);
  for (let i = 0; i < 110; i++) assert.ok(a.xs[i] === b.xs[i] && a.ys[i] === c.ys[i], `leaf ${i} moved`);
  assert.equal(f(120).xs[0], buildInstance(base, 3).field.xs[0], 'anchored on the dials\' own field');
  const r0 = sweepPoint(base, 'field.N', 110, 3, { bound: true }), r1 = sweepPoint(base, 'field.N', 111, 3);
  assert.equal(r0.head, r1.head);
  assert.equal(r0.N, 110);
  assert.ok(r0.bound > 0 && r1.bound === null);
  assert.ok(['planned', 'tree peel'].includes(r0.regime), `regime ${r0.regime}`);
  if (r0.status === 'success') {
    assert.equal(r0.piles.length, 2);
    assert.equal(r0.piles.reduce((s, p) => s + p[2], 0), 110);
    assert.ok(r0.work >= r0.bound - 1e-6, 'work never beats the lower bound');
  }
  const k = sweepConfig(base, 'raker.k', 12);
  assert.equal(k.raker.kMode, 'abs');
});

// Synthetic all-seeds sweeps: every seed is its own level times a known shape, plus 3% noise.
function ensemble(fn, { seeds = 12, from = 200, to = 400, step = 5, seed = 11 } = {}) {
  const rng = new Rng(seed, 'ensemble'), rows = [];
  for (let s = 1; s <= seeds; s++) {
    const level = Math.exp(0.15 * rng.normal());
    for (let x = from; x <= to; x += step) rows.push({ seed: s, value: x, status: 'success', work: level * fn(x) * Math.exp(0.03 * rng.normal()) });
  }
  return rows;
}

test('shapeAnalysis picks the shape that generated the seeds, and its parameters', () => {
  // a twentyfold range, so a power law and a straight line are told apart
  const pw = shapeAnalysis(ensemble(x => 20 * x ** 0.9, { from: 20, to: 400, step: 10 }), { symbol: 'N' });
  assert.equal(pw.simplest, 'power');
  const f = pw.families.find(q => q.id === 'power');
  assert.ok(Math.abs(f.theta[0] - 0.9) < 0.03, `exponent ${f.theta[0]}`);
  assert.ok(Math.abs(f.elasticity - 0.9) < 0.03);
  assert.ok(f.r2 > 0.95 && f.cv < 0.04, `r2 ${f.r2}, cv ${f.cv}`);
  assert.ok(Math.abs(shapeValue(f, 300) / (20 * 300 ** 0.9) - 1) < 0.15, 'typical level near the generating one');
  assert.ok(Math.abs(pw.levelSpread - 0.16) < 0.1, `level spread ${pw.levelSpread}`);
  // the change compares the first and last tenth of the range: 20..50 against 370..400 (geometric means)
  const gm = xs => Math.exp(xs.reduce((t, v) => t + Math.log(v), 0) / xs.length);
  const expected = (gm([370, 380, 390, 400]) / gm([20, 30, 40, 50])) ** 0.9 - 1;
  assert.ok(Math.abs(pw.change.median / expected - 1) < 0.1, `change ${pw.change.median}, expected ${expected}`);
  assert.equal(shapeAnalysis(ensemble(x => 300 * Math.exp(x / 100), { from: 0, to: 400, step: 10 }), { symbol: 'N' }).simplest, 'exp');
  assert.equal(shapeAnalysis(ensemble(() => 3000), { symbol: 'N' }).simplest, 'constant');
});

test('shapeAnalysis skips shapes that need positive values, and needs three seeds', () => {
  const a = shapeAnalysis(ensemble(x => 100 + 40 * x, { from: 0, to: 5, step: 0.25 }), { symbol: 'l', cv: false });
  for (const id of ['power', 'log', 'reciprocal', 'power-offset']) assert.equal(a.families.find(f => f.id === id).applicable, false, id);
  assert.equal(a.simplest, 'linear');
  assert.equal(shapeAnalysis(ensemble(x => x, { seeds: 2 })), null);
});

test('sweep analyses follow the chosen measure', () => {
  const rows = synthetic().map(r => ({ ...r, time: 120 * r.value + 600 }));
  const byTime = analyseCurve(rows, { measure: r => r.time / 60, bounds: false, bootstrap: 0 });
  assert.equal(byTime.gap, null, 'no lower bound for time');
  assert.equal(byTime.jumps.length, 0, 'time has no planted jumps');
  assert.ok(byTime.fit.r2 > 0.999);
  const ens = [1, 2, 3, 4].flatMap(s => rows.map(r => ({ ...r, seed: s, time: r.time * (1 + s / 10) })));
  const shape = shapeAnalysis(ens, { measure: r => r.time, cv: false, symbol: 'N' });
  assert.ok(['linear', 'power-offset', 'quadratic', 'exp-offset'].includes(shape.best), shape.best);
  assert.ok(shape.families.find(f => f.id === 'linear').r2 > 0.999);
});
