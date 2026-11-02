import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateField } from '../src/gen/processes.js';
import { instanceBounds, lagrangianBound, ownSiteBound } from '../src/analysis/bounds.js';
import { sitingHeuristic, assignMinSize, hilbertIndex } from '../src/analysis/siting.js';

test('min-size assignment gives every site at least t points', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const f = generateField({ model: 'thomas', N: 240, W: 60, H: 60, clumps: 3, grouping: 4, background: 0.1 }, seed);
    const n = 2 + (seed % 4), t = Math.floor(240 / n) - (seed % 7);
    const { sites, assign, sizes } = sitingHeuristic(f.xs, f.ys, n, t, f.W, f.H);
    assert.equal(sites.length, n);
    assert.equal(sizes.reduce((a, b) => a + b, 0), 240);
    assert.ok(Array.from(sizes).every(s => s >= t), `sizes ${Array.from(sizes)} < ${t}`);
    for (let s = 0; s < n; s++) assert.equal(assign[sites[s]], s, 'each site keeps its own point');
  }
});

test('Hilbert index is a bijection on a small grid', () => {
  const seen = new Set();
  for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) seen.add(hilbertIndex(x + 0.5, y + 0.5, 16, 16, 4));
  assert.equal(seen.size, 256);
});

test('Lagrangian bound sits between the nearest-neighbour bound and a feasible siting', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const f = generateField({ model: 'thomas', N: 160, W: 50, H: 50, clumps: 4, grouping: 2, background: 0.2 }, seed);
    const n = 3, t = 40;
    const cheap = instanceBounds(f, { n, t, k: 8, l: 1 });
    const heur = sitingHeuristic(f.xs, f.ys, n, t, f.W, f.H);
    const lag = lagrangianBound(f.xs, f.ys, n, t, f.W, f.H, { iterations: 80 });
    assert.ok(lag.bound >= cheap.workNN - 1e-6, `Lagrangian ${lag.bound} below NN bound ${cheap.workNN}`);
    assert.ok(lag.bound <= heur.cost + 1e-6, `Lagrangian ${lag.bound} above a feasible cost ${heur.cost}`);
    assert.ok(lag.bound > 1.3 * cheap.workNN, `Lagrangian ${lag.bound} barely improves on ${cheap.workNN}`);
  }
});

test('own-site transport bound never exceeds the cost of a real assignment', () => {
  const f = generateField({ model: 'mixture', N: 200, W: 40, H: 40, clumps: 4, grouping: 2 }, 7);
  const sites = [3, 50, 120, 180];
  const { assign, sizes, cost } = assignMinSize(f.xs, f.ys, sites, 30);
  const b = ownSiteBound(f.xs, f.ys, sites.map(s => ({ x: f.xs[s], y: f.ys[s] })), Array.from(sizes));
  assert.ok(b.bound <= cost + 1e-6, `${b.bound} > ${cost}`);
  assert.ok(b.bound >= 0.9 * cost, `bound ${b.bound} is loose against ${cost}`);
  assert.equal(assign.length, 200);
});
