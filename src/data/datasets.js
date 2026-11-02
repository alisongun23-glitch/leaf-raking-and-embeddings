import cholera from './sets/cholera.js';
import brambles from './sets/brambles.js';
import fijiQuakes from './sets/fiji-quakes.js';
import californiaQuakes from './sets/california-quakes.js';
import ukAirfields from './sets/uk-airfields.js';
import parkSlopeTrees from './sets/park-slope-trees.js';
import caveolae from './sets/caveolae.js';
import oldFaithful from './sets/old-faithful.js';
import irisPetals from './sets/iris-petals.js';
import maskSite from './sets/mask-site.js';
import marketDaily5y from './sets/market-daily-5y.js';
import marketCalm2019 from './sets/market-calm-2019.js';
import marketCrash2020 from './sets/market-crash-2020.js';
import marketRotation2022 from './sets/market-rotation-2022.js';
import marketCovid63d from './sets/market-covid-63d.js';
import marketIntraday5m from './sets/market-intraday-5m.js';

// Real-world point sets, fetched by scripts/fetch-datasets.mjs, then the market fields written by
// scripts/import-field-sets.mjs (S&P 500 stocks placed by the correlation of their returns; their `group` puts
// them under their own heading in the point-pattern list). Each keeps its own units; placing one in the
// field (placePoints) scales it to the default 100-unit field and turns y so north, or larger values,
// point up on screen (the canvas draws y downwards).
const SETS = [
  cholera, brambles, fijiQuakes, californiaQuakes, ukAirfields, parkSlopeTrees, caveolae, oldFaithful, irisPetals, maskSite,
  marketDaily5y, marketCalm2019, marketCrash2020, marketRotation2022, marketCovid63d, marketIntraday5m,
];

// The sets' meta without their point data: `groups` (a group index per point, e.g. a stock's sector) and
// `groupNames` stay with the set and come back from placeDataset.
export const DATASETS = SETS.map(({ points, groups, groupNames, ...meta }) => ({ ...meta, count: points.length / 2 }));
export const dataset = id => DATASETS.find(d => d.id === id) || null;

// Places [x, y] pairs in a field:
//   map      same units on both axes: the longer side becomes `long` units, the aspect ratio is kept
//   lonlat   degrees: longitude is shrunk by cos(mean latitude) (equirectangular), then as map
//   scatter  different units per axis: each axis is stretched on its own to long × long·aspect
// A margin keeps points off the border. Returns { W, H, xs, ys, scale } (scale: field units per input unit,
// per axis).
export function placePoints(pairs, kind = 'map', { long = 100, aspect = 0.75, margin = 2 } = {}) {
  const n = pairs.length;
  let px = pairs.map(p => p[0]);
  const py = pairs.map(p => p[1]);
  let cos = 1;
  if (kind === 'lonlat') {
    cos = Math.cos((py.reduce((s, v) => s + v, 0) / Math.max(1, n)) * (Math.PI / 180));
    px = px.map(v => v * cos);
  }
  const x0 = Math.min(...px), x1 = Math.max(...px), y0 = Math.min(...py), y1 = Math.max(...py);
  const sx = Math.max(x1 - x0, 1e-12), sy = Math.max(y1 - y0, 1e-12), inner = long - 2 * margin;
  let kx, ky, W, H;
  if (kind === 'scatter') {
    W = long; H = long * aspect;
    kx = inner / sx; ky = (H - 2 * margin) / sy;
  } else {
    kx = ky = inner / Math.max(sx, sy);
    W = sx * kx + 2 * margin; H = sy * ky + 2 * margin;
  }
  const xs = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = margin + (px[i] - x0) * kx;
    ys[i] = H - margin - (py[i] - y0) * ky;
  }
  return { W, H, xs, ys, scale: [kx * cos, ky] };
}

const placed = new Map();
// A data set placed in the field (cached): { W, H, xs, ys, scale, meta }, plus { groups, groupNames } when the
// set has them (groups[i] is the group index of point i; nothing in the simulator uses them yet).
export function placeDataset(id) {
  if (placed.has(id)) return placed.get(id);
  const set = SETS.find(s => s.id === id);
  if (!set) return null;
  const pairs = [];
  for (let i = 0; i < set.points.length; i += 2) pairs.push([set.points[i], set.points[i + 1]]);
  const out = { ...placePoints(pairs, set.kind), meta: dataset(id) };
  if (set.groups) { out.groups = set.groups; out.groupNames = set.groupNames; }
  placed.set(id, out);
  return out;
}
