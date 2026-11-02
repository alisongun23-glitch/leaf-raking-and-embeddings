import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateField, FIELD_MODELS } from '../src/gen/processes.js';
import { clarkEvans, nearestNeighbourDistances } from '../src/gen/stats.js';
import { emst } from '../src/analysis/emst.js';
import { feasibility } from '../src/analysis/feasibility.js';
import { Game } from '../src/core/game.js';
import { fieldFrom } from './helpers.mjs';

test('every model gives exactly N points inside the box, reproducibly', () => {
  for (const { id } of FIELD_MODELS.filter(m => m.id !== 'custom' && !m.id.startsWith('data:'))) { // real data: data.test.mjs
    const spec = { model: id, N: 257, W: 80, H: 60, clumps: 6, grouping: 1.5, background: 0.2 };
    const a = generateField(spec, 42), b = generateField(spec, 42), c = generateField(spec, 43);
    assert.equal(a.xs.length, 257, id);
    assert.deepEqual(Array.from(a.xs), Array.from(b.xs), `${id} is not reproducible`);
    assert.notDeepEqual(Array.from(a.xs), Array.from(c.xs), `${id} ignores the seed`);
    for (let i = 0; i < 257; i++) {
      assert.ok(a.xs[i] >= 0 && a.xs[i] <= 80 && a.ys[i] >= 0 && a.ys[i] <= 60, `${id} point ${i} outside`);
    }
  }
  const lat = generateField({ model: 'thomas', N: 400, W: 40, H: 40, lattice: true }, 5);
  const cells = new Set(Array.from(lat.xs, (x, i) => `${x},${lat.ys[i]}`));
  assert.equal(cells.size, 400, 'lattice points are distinct');
  assert.ok(Array.from(lat.xs).every(Number.isInteger));
});

test('nested fields keep their leaves when N changes', () => {
  for (const model of ['thomas', 'matern', 'mixture', 'lgcp', 'uniform']) {
    for (const lattice of [false, true]) {
      const spec = { model, W: 80, H: 60, clumps: 6, grouping: 1.5, background: 0.2, lattice, nested: true, nestN: 200 };
      const small = generateField({ ...spec, N: 150 }, 9), big = generateField({ ...spec, N: 260 }, 9);
      for (let i = 0; i < 150; i++) {
        assert.ok(small.xs[i] === big.xs[i] && small.ys[i] === big.ys[i], `${model}${lattice ? ' on a lattice' : ''}: leaf ${i} moved`);
      }
    }
  }
  // anchored on N itself, a nested Thomas field is the ordinary one
  const plain = generateField({ model: 'thomas', N: 230 }, 4), nested = generateField({ model: 'thomas', N: 230, nested: true, nestN: 230 }, 4);
  assert.deepEqual(Array.from(nested.xs), Array.from(plain.xs));
});

test('Clark-Evans tracks the grouping dial', () => {
  const avgR = spec => {
    let s = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const f = generateField(spec, seed);
      s += clarkEvans(f.xs, f.ys, f.W, f.H);
    }
    return s / 30;
  };
  const base = { N: 500, W: 100, H: 100, clumps: 20, background: 0 };
  const uniform = avgR({ ...base, model: 'uniform' });
  const slight = avgR({ ...base, model: 'thomas', grouping: 0.5 });
  const strong = avgR({ ...base, model: 'thomas', grouping: 12 });
  assert.ok(Math.abs(uniform - 1) < 0.03, `uniform R = ${uniform}`);
  assert.ok(slight > 0.82 && slight < 0.97, `slight R = ${slight}`);
  assert.ok(strong < 0.6, `strong R = ${strong}`);
});

test('nearest-neighbour distances match brute force', () => {
  const f = generateField({ model: 'mixture', N: 300, W: 50, H: 30, clumps: 4, grouping: 3 }, 9);
  const nn = nearestNeighbourDistances(f.xs, f.ys, f.W, f.H);
  for (let i = 0; i < 300; i++) {
    let best = Infinity;
    for (let j = 0; j < 300; j++) if (j !== i) best = Math.min(best, Math.hypot(f.xs[j] - f.xs[i], f.ys[j] - f.ys[i]));
    assert.ok(Math.abs(nn[i] - best) < 1e-12, `point ${i}`);
  }
});

test('M is the smallest reach that connects the field', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const f = generateField({ model: 'thomas', N: 150, W: 60, H: 60, clumps: 5, grouping: 3, background: 0.1 }, seed);
    const { M } = emst(f.xs, f.ys);
    const connected = k => {
      const g = new Game(f, { n: 1, t: 1, k, l: 0 });
      const seen = new Uint8Array(g.N), q = [0];
      seen[0] = 1;
      for (let h = 0; h < q.length; h++) for (const w of g.neighbors(q[h])) if (!seen[w]) { seen[w] = 1; q.push(w); }
      return q.length === g.N;
    };
    assert.ok(connected(M), `seed ${seed}: not connected at M`);
    assert.ok(!connected(M * 0.999), `seed ${seed}: already connected below M`);
  }
});

test('feasibility screens', () => {
  const f = generateField({ model: 'bridge', N: 200, W: 100, H: 60 }, 3);
  const { M } = emst(f.xs, f.ys);
  const below = feasibility(new Game(f, { n: 2, t: 50, k: 0.9 * M, l: 0 }), M);
  assert.equal(below.label, 'infeasible');
  const ok = feasibility(new Game(f, { n: 2, t: 50, k: 1.2 * M, l: 0 }), M);
  assert.equal(ok.label, 'undetermined');
  const few = feasibility(new Game(f, { n: 5, t: 50, k: 1.2 * M, l: 0 }), M);
  assert.equal(few.label, 'infeasible');

  // the report's example: a hub with three points at distance 1, 120 degrees apart; n = 2, t = 2
  const star = fieldFrom([[10, 10], ...[0, 1, 2].map(i => [10 + Math.cos((2 * Math.PI * i) / 3), 10 + Math.sin((2 * Math.PI * i) / 3)])]);
  const hub = feasibility(new Game(star, { n: 2, t: 2, k: 1.05, l: 0 }), 1);
  assert.equal(hub.label, 'infeasible', hub.reasons.join(' '));
});
