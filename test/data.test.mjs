import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATASETS, placeDataset, placePoints } from '../src/data/datasets.js';
import { parsePointTable, loadPointTable } from '../src/data/parse.js';
import { generateField, FIELD_MODELS } from '../src/gen/processes.js';
import { DEFAULT_CONFIG, mergeConfig, buildInstance } from '../src/analysis/instance.js';
import { ALGORITHMS, defaultParams } from '../src/algos/registry.js';
import { runToEnd } from '../src/core/run.js';
import { Rng } from '../src/core/rng.js';
import { checkInvariants } from '../src/core/metrics.js';

test('every real data set is placed inside its field, with no two points on one site', () => {
  assert.ok(DATASETS.length >= 16);
  for (const meta of DATASETS) {
    const d = placeDataset(meta.id);
    assert.equal(d.xs.length, meta.count, meta.id);
    assert.ok(meta.count >= 100, `${meta.id} has ${meta.count} points`);
    assert.ok(Math.max(d.W, d.H) <= 100.0001 && Math.min(d.W, d.H) > 10, `${meta.id} is ${d.W} × ${d.H}`);
    const seen = new Set();
    for (let i = 0; i < meta.count; i++) {
      assert.ok(d.xs[i] >= 0 && d.xs[i] <= d.W && d.ys[i] >= 0 && d.ys[i] <= d.H, `${meta.id} point ${i} outside`);
      seen.add(`${d.xs[i]},${d.ys[i]}`);
    }
    assert.equal(seen.size, meta.count, `${meta.id} has duplicate points`);
    for (const key of ['name', 'shape', 'source', 'url', 'license', 'units', 'kind']) assert.ok(meta[key], `${meta.id} lacks ${key}`);
    assert.ok(FIELD_MODELS.some(m => m.id === `data:${meta.id}`), `${meta.id} is not offered as a point pattern`);
    assert.ok(!('points' in meta) && !('groups' in meta) && !('groupNames' in meta), `${meta.id} meta carries point data`);
    if (d.groups) { // a group index per point (the market fields: each stock's sector)
      assert.equal(d.groups.length, meta.count, `${meta.id} needs one group per point`);
      assert.ok(Array.isArray(d.groupNames) && d.groupNames.length > 0, `${meta.id} lacks group names`);
      for (const g of d.groups) assert.ok(Number.isInteger(g) && g >= 0 && g < d.groupNames.length, `${meta.id} group ${g} has no name`);
      assert.equal(new Set(d.groups).size, d.groupNames.length, `${meta.id} names a group no point is in`);
    }
  }
});

test('the market fields sit under their own heading and carry each stock\'s sector', () => {
  const market = DATASETS.filter(d => d.id.startsWith('market-'));
  assert.equal(market.length, 6);
  for (const meta of market) {
    assert.equal(meta.group, 'Market fields', meta.id);
    assert.equal(meta.kind, 'map', meta.id);
    assert.equal(FIELD_MODELS.find(m => m.id === `data:${meta.id}`).group, 'Market fields', `${meta.id} in the point-pattern list`);
    const d = placeDataset(meta.id);
    assert.ok(d.groups && d.groupNames.includes('Energy') && d.groupNames.includes('Utilities'), `${meta.id} lacks sectors`);
  }
  for (const meta of DATASETS.filter(d => !d.id.startsWith('market-'))) {
    assert.equal(meta.group, undefined, `${meta.id} should stay under Real data`);
    assert.equal(FIELD_MODELS.find(m => m.id === `data:${meta.id}`).group, 'Real data', meta.id);
  }
  // the dial builder makes one optgroup per run of options with the same group, so each heading must be one run
  const runs = FIELD_MODELS.map(m => m.group).filter((g, i, a) => i === 0 || g !== a[i - 1]);
  assert.equal(new Set(runs).size, runs.length, 'a heading of the point-pattern list is split in two');
});

test('placing points keeps the aspect for maps, flips y so north points up, and stretches scatter axes', () => {
  const map = placePoints([[0, 0], [10, 0], [0, 5]], 'map');
  assert.ok(Math.abs(map.W - 100) < 1e-9 && Math.abs(map.H - (48 + 4)) < 1e-9, `map ${map.W} × ${map.H}`);
  assert.ok(map.ys[2] < map.ys[0], 'the northern point is drawn higher (smaller canvas y)');
  const sc = placePoints([[0, 0], [1, 0], [0, 100]], 'scatter');
  assert.equal(sc.W, 100);
  assert.equal(sc.H, 75);
  const ll = placePoints([[0, 59.5], [2, 59.5], [0, 60.5], [2, 60.5]], 'lonlat');
  assert.ok(Math.abs(ll.W - ll.H) < 1e-6, 'two degrees of longitude at 60°N span one degree of latitude');
});

test('N picks a seeded, nested sample of a data set and never more than it holds', () => {
  const spec = { model: 'data:brambles' };
  const all = generateField({ ...spec, N: 5000 }, 1);
  assert.equal(all.xs.length, 823);
  assert.deepEqual(Array.from(generateField({ ...spec, N: 823 }, 2).xs), Array.from(all.xs), 'the whole set ignores the seed');
  const a = generateField({ ...spec, N: 300 }, 7), b = generateField({ ...spec, N: 400 }, 7), c = generateField({ ...spec, N: 300 }, 8);
  assert.equal(a.xs.length, 300);
  for (let i = 0; i < 300; i++) assert.ok(a.xs[i] === b.xs[i] && a.ys[i] === b.ys[i], `sample point ${i} differs`);
  assert.notDeepEqual(Array.from(a.xs), Array.from(c.xs), 'another seed draws another sample');
  const pool = new Set(Array.from(all.xs, (x, i) => `${x},${all.ys[i]}`));
  for (let i = 0; i < 300; i++) assert.ok(pool.has(`${a.xs[i]},${a.ys[i]}`), 'samples are points of the set');
});

test('the table reader finds the coordinate columns', () => {
  const lonlat = parsePointTable('name,latitude,longitude\n"Paris, FR",48.85,2.35\nLyon,45.76,4.84\nNice,43.70,7.27\n');
  assert.equal(lonlat.kind, 'lonlat');
  assert.deepEqual(lonlat.columns, ['longitude', 'latitude']);
  assert.deepEqual(lonlat.pairs[0], [2.35, 48.85]);
  const xy = parsePointTable('id;y;x\n1;5;2\n2;6;3\n3;7;1\n');
  assert.deepEqual(xy.pairs[0], [2, 5]);
  const bare = parsePointTable('1.5 2.5 9\n3.5 4.5 9\n# a comment\n5 6 9\n');
  assert.deepEqual(bare.columns, ['column 1', 'column 2']);
  assert.equal(bare.pairs.length, 3);
  const tsv = parsePointTable('eruptions\twaiting\n3.6\t79\n1.8\t54\n3.333\t74\nn/a\t62\n');
  assert.equal(tsv.kind, 'scatter', 'ranges 1.8 apart against 25 apart');
  assert.equal(tsv.skipped, 1);
  assert.throws(() => parsePointTable('just one line'), /two rows/);
  assert.throws(() => parsePointTable('a,b\nx,y\nz,w\n'), /numeric/);
});

test('loading a table places, samples and separates its points', () => {
  const rows = ['x,y'];
  for (let i = 0; i < 60; i++) rows.push(`${i % 6},${Math.floor(i / 6)}`, `${i % 6},${Math.floor(i / 6)}`); // every point twice
  const res = loadPointTable(rows.join('\n'), { max: 100, seed: 3 });
  assert.equal(res.total, 120);
  assert.equal(res.points.length, 100);
  assert.equal(new Set(res.points.map(p => p.join())).size, 100, 'duplicates were nudged apart');
  assert.ok(res.nudged > 0);
  for (const [x, y] of res.points) assert.ok(x >= 0 && x <= res.W && y >= 0 && y <= res.H);
});

test('every algorithm plays legally on real data', () => {
  for (const [model, N, n, t] of [['data:caveolae', 138, 3, 40], ['data:iris-petals', 150, 4, 30], ['data:fiji-quakes', 200, 4, 40], ['data:market-crash-2020', 467, 11, 15]]) {
    const cfg = mergeConfig(DEFAULT_CONFIG, { field: { model, N }, goal: { n, t } });
    const inst = buildInstance(cfg, 5);
    for (const algo of ALGORITHMS) {
      const g = inst.newGame();
      const res = runToEnd(g, algo, defaultParams(algo), new Rng(5, `algo:${algo.id}`));
      assert.notEqual(res.reason, 'illegal', `${algo.id} on ${model}: ${res.detail}`);
      assert.deepEqual(checkInvariants(g), [], `${algo.id} on ${model}`);
    }
    // the structured planners finish these
    for (const id of ['planned-sites', 'tree-peel']) {
      const res = runToEnd(inst.newGame(), ALGORITHMS.find(a => a.id === id), defaultParams(ALGORITHMS.find(a => a.id === id)), new Rng(5, `algo:${id}`));
      assert.equal(res.status, 'success', `${id} on ${model}: ${res.detail}`);
    }
  }
});
