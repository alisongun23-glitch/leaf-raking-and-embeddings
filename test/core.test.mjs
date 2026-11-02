import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, LOOSE, PILE } from '../src/core/game.js';
import { Rng } from '../src/core/rng.js';
import { checkInvariants } from '../src/core/metrics.js';
import { articulationPoints } from '../src/core/safety.js';
import { uniformField, fieldFrom, bruteNeighbors, bruteCapsule, bruteSafe, stateKey } from './helpers.mjs';

test('seeded streams are reproducible and independent', () => {
  const a = new Rng(7, 'instance'), b = new Rng(7, 'instance'), c = new Rng(7, 'algo');
  const sa = Array.from({ length: 5 }, () => a.float());
  assert.deepEqual(sa, Array.from({ length: 5 }, () => b.float()));
  assert.notDeepEqual(sa, Array.from({ length: 5 }, () => c.float()));
  const r = new Rng(1);
  let sum = 0;
  for (let i = 0; i < 4000; i++) sum += r.poisson(45);
  assert.ok(Math.abs(sum / 4000 - 45) < 0.6, `poisson mean ${sum / 4000}`);
});

test('reach graph and capsule queries match brute force', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const g = new Game(uniformField(seed), { n: 1, t: 1, k: 2 + seed, l: 0.4 * seed });
    for (let i = 0; i < g.N; i++) {
      assert.deepEqual(g.neighbors(i).sort((p, q) => p - q), bruteNeighbors(g, i), `neighbours of ${i}`);
    }
    const rng = new Rng(seed, 'capsules');
    for (let trial = 0; trial < 60; trial++) {
      const a = rng.int(g.N), b = rng.int(g.N);
      const fast = g.capsule(g.x[a], g.y[a], g.x[b], g.y[b], a, b).sort((p, q) => p - q);
      assert.deepEqual(fast, bruteCapsule(g, g.x[a], g.y[a], g.x[b], g.y[b], a, b));
    }
  }
});

test('a chain shows which strokes cut off work', () => {
  const pts = Array.from({ length: 10 }, (_, i) => [1 + i, 5]);
  const g = new Game(fieldFrom(pts), { n: 1, t: 5, k: 1.1, l: 0 });
  g.apply({ type: 'start', at: 5 });
  assert.equal(g.status, 'running');
  const cut = g.preview({ type: 'rake', from: 4 });
  assert.equal(cut.safe, false);
  assert.equal(cut.verdict.reason, 'cut-off');
  g.apply({ type: 'walk', to: 4 });
  g.apply({ type: 'walk', to: 3 });
  g.apply({ type: 'walk', to: 2 });
  g.apply({ type: 'walk', to: 1 });
  assert.equal(g.preview({ type: 'rake', from: 0 }).safe, true, 'the end of the chain is a leaf');
  assert.equal(g.preview({ type: 'rake', from: 2 }).safe, false, 'point 2 holds the chain together');
});

test('a finished pile may be cut off, an unfinished one may not', () => {
  // two clumps of 6 joined by a two-point bridge; n = 2, t = 6, so 2 spare points
  const A = [[5, 5], [5.3, 5], [4.7, 5], [5, 5.3], [5, 4.7], [5.2, 5.2]];
  const B = A.map(([x, y]) => [x + 3, y]);
  const g = new Game(fieldFrom([...A, ...B, [6, 5], [7, 5]]), { n: 2, t: 6, k: 1.1, l: 0 });
  const bridgeA = 12, bridgeB = 13;
  g.apply({ type: 'start', at: 0 });
  for (const j of [1, 2, 3, 4, 5]) g.apply({ type: 'rake', from: j });
  assert.equal(g.mass[0], 6);
  // raking the bridge into A from A's side would strand the raker away from clump B
  assert.equal(g.preview({ type: 'rake', from: bridgeA }).verdict.reason, 'cut-off');
  for (const v of [bridgeA, bridgeB, 6]) g.apply({ type: 'walk', to: v });
  for (const j of [7, 8, 9, 10, 11]) g.apply({ type: 'rake', from: j });
  assert.equal(g.mass[6], 6);
  g.apply({ type: 'walk', to: bridgeB });
  g.apply({ type: 'walk', to: bridgeA });
  const freezeB = g.preview({ type: 'rake', from: bridgeB });
  assert.equal(freezeB.safe, true, 'B is finished, so it may be cut off');
  g.apply({ type: 'rake', from: bridgeB });
  assert.equal(g.c.detPiles, 1, 'pile B was frozen once the bridge went');
  g.apply({ type: 'walk', to: 0 });
  g.apply({ type: 'rake', from: bridgeA }); // merge the bridge pile into A: 8 points, both spares used
  assert.equal(g.status, 'success', g.detail);
  assert.deepEqual(checkInvariants(g), []);

  // same field, but cut the bridge while A is still short of t
  const h = new Game(fieldFrom([...A, ...B, [6, 5], [7, 5]]), { n: 2, t: 6, k: 1.1, l: 0 });
  h.apply({ type: 'start', at: 0 });
  for (const j of [1, 2, 3]) h.apply({ type: 'rake', from: j });
  h.apply({ type: 'walk', to: 4 });
  h.apply({ type: 'walk', to: bridgeA });
  h.apply({ type: 'walk', to: bridgeB });
  const v = h.preview({ type: 'rake', from: bridgeA });
  assert.equal(v.safe, false);
  assert.ok(['cut-off', 'cut-off-pile'].includes(v.verdict.reason));
});

test('the overflow budget catches starvation', () => {
  const pts = [[1, 1], [1.5, 1], [2, 1], [2.5, 1], [3, 1], [3.5, 1]];
  const g = new Game(fieldFrom(pts), { n: 2, t: 3, k: 2.2, l: 0 }); // s = 0: no pile may exceed 3
  g.apply({ type: 'start', at: 0 });
  g.apply({ type: 'rake', from: 1 });
  g.apply({ type: 'rake', from: 2 });
  const over = g.preview({ type: 'rake', from: 3 });
  assert.equal(over.safe, false);
  assert.equal(over.verdict.reason, 'starvation');
});

test('push and free placement move the raker and undo cleanly', () => {
  const pts = [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2]];
  const g = new Game(fieldFrom(pts), { n: 1, t: 5, k: 1.5, l: 0.2, rules: { destination: 'push' } });
  g.apply({ type: 'start', at: 0 });
  g.apply({ type: 'found' });
  const before = stateKey(g);
  const r = g.apply({ type: 'rake', from: 0, to: 1 }); // push the pile you stand on onto the next point
  assert.equal(r.legal, true);
  assert.equal(g.raker, 1);
  assert.equal(g.kind[0], 0);
  assert.equal(g.mass[1], 2);
  g.undo();
  assert.equal(stateKey(g), before);

  const f = new Game(fieldFrom(pts), { n: 1, t: 5, k: 1.5, l: 0.2, rules: { destination: 'free' } });
  f.apply({ type: 'start', at: 0 });
  const key = stateKey(f);
  f.apply({ type: 'rake', from: 0, to: { x: 2.5, y: 2.6 } });
  assert.equal(f.size, 6);
  assert.equal(f.kind[5], PILE);
  assert.equal(f.raker, 5);
  assert.deepEqual(checkInvariants(f), []);
  f.undo();
  assert.equal(stateKey(f), key);
});

test('articulation points match brute-force removal', () => {
  const g = new Game(uniformField(11, 90, 30, 30), { n: 1, t: 1, k: 4.2, l: 0 });
  const cut = articulationPoints(g);
  const components = skip => {
    const seen = new Uint8Array(g.size);
    let count = 0;
    for (let s = 0; s < g.size; s++) {
      if (s === skip || seen[s]) continue;
      count++;
      const q = [s];
      seen[s] = 1;
      for (let h = 0; h < q.length; h++) for (const w of g.neighbors(q[h])) if (w !== skip && !seen[w]) { seen[w] = 1; q.push(w); }
    }
    return count;
  };
  const base = components(-1);
  for (let v = 0; v < g.size; v++) {
    const isolated = g.neighbors(v).length === 0;
    const after = components(v) + (isolated ? 1 : 0);
    assert.equal(cut[v] === 1, after > base, `site ${v}`);
  }
});

// Long random playouts across rule variants: the fast safety verdict must agree with brute force on
// every probed move, counters must match the site arrays after every move, and undo must be exact.
test('random playouts: safety verdict, invariants and undo', () => {
  const variants = [
    { l: 0, rules: {} },
    { l: 1.1, rules: {} },
    { l: 1.4, rules: { sweepPiles: true } },
    { l: 0.8, rules: { destination: 'push' } },
    { l: 0.8, rules: { destination: 'free' } },
  ];
  let probes = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const v = variants[seed % variants.length];
    const rng = new Rng(seed, 'playout');
    const N = 60 + rng.int(60);
    const field = uniformField(seed + 100, N, 30, 30);
    const k = 2.4 * 30 / Math.sqrt(N) * (1 + rng.float());
    const n = 1 + rng.int(4), t = Math.max(1, Math.floor((N / n) * (0.5 + 0.5 * rng.float())));
    const g = new Game(field, { n, t, k, l: v.l, rules: v.rules });
    g.apply({ type: 'start', at: rng.int(N) });
    if (g.done) continue;
    for (let step = 0; step < 220 && !g.done; step++) {
      const nb = g.neighbors(g.raker);
      const rakes = [];
      for (const j of nb) {
        if (v.rules.destination === 'push' && rng.float() < 0.5) {
          const dests = g.neighbors(j).filter(d => d !== j);
          if (dests.length) { rakes.push({ type: 'rake', from: j, to: rng.pick(dests) }); continue; }
        }
        if (v.rules.destination === 'free' && rng.float() < 0.3) {
          const ang = rng.range(0, 2 * Math.PI), rad = rng.range(0, g.k);
          const x = g.x[j] + rad * Math.cos(ang), y = g.y[j] + rad * Math.sin(ang);
          if (x >= 0 && x <= g.W && y >= 0 && y <= g.H) { rakes.push({ type: 'rake', from: j, to: { x, y } }); continue; }
        }
        rakes.push({ type: 'rake', from: j });
      }
      const safe = [];
      for (const m of rng.shuffle(rakes).slice(0, 6)) {
        const p = g.preview(m);
        if (!p.legal) continue;
        assert.equal(p.safe, bruteSafe(g, m), `seed ${seed} step ${step}: ${JSON.stringify(m)} (${p.verdict.reason || 'safe'})`);
        probes++;
        if (p.safe) safe.push(m);
      }
      let move;
      if (g.kind[g.raker] === LOOSE && rng.float() < 0.15) move = { type: 'found' };
      else if (safe.length && rng.float() < 0.75) move = rng.pick(safe);
      else if (nb.length) move = { type: 'walk', to: rng.pick(nb) };
      else break;
      if (rng.float() < 0.1) {
        const key = stateKey(g);
        g.apply(move);
        g.undo();
        assert.equal(stateKey(g), key, 'undo restores the exact state');
      }
      g.apply(move);
      assert.deepEqual(checkInvariants(g), [], `seed ${seed} step ${step}`);
    }
  }
  assert.ok(probes > 1000, `only ${probes} probes`);
});

test('time to rake adds up walking, raking, load, stroke and pile times, and follows the time dials', async () => {
  const { timeParts, DEFAULT_TIME, snapshot } = await import('../src/core/metrics.js');
  const tp = timeParts({ walkDist: 14, rakeDist: 10, work: 20, strokes: 3, foundings: 1 }, { walkSpeed: 1.4, rakeSpeed: 1, perLoad: 0.05, perStroke: 2, perFound: 5 });
  assert.deepEqual(Object.fromEntries(Object.entries(tp).map(([k, v]) => [k, +v.toFixed(9)])), { walk: 10, rake: 10, load: 1, strokes: 6, found: 5, total: 32 });
  assert.equal(DEFAULT_TIME.walkSpeed, 1.4);
  const field = fieldFrom([[0, 0], [3, 0], [6, 0], [9, 0]], 10, 2);
  const slow = new Game(field, { n: 1, t: 4, k: 4, l: 0, time: { rakeSpeed: 0.5 } });
  slow.apply({ type: 'start', at: 0 });
  slow.apply({ type: 'rake', from: 1 });
  const snap = snapshot(slow), parts = timeParts(slow.c, slow.timeCfg);
  assert.ok(Math.abs(snap.time - parts.total) < 1e-9);
  assert.ok(Math.abs(parts.rake - 6) < 1e-9, 'a 3 m stroke at 0.5 m/s takes 6 s');
  assert.ok(Math.abs(parts.strokes - DEFAULT_TIME.perStroke) < 1e-9, 'unset dials keep their defaults');
});
