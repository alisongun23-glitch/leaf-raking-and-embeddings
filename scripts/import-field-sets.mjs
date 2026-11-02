#!/usr/bin/env node
// Turns the stock-geometry fields exported by experiments/asset-clusters/fields_export.py into built-in point
// sets, one module per field in src/data/sets/market-*.js. No network: it reads the CSV + JSON pair of each
// field from experiments/asset-clusters/fields/. Run it again after re-exporting the fields:
//   node scripts/import-field-sets.mjs
//
// Each point is an S&P 500 stock, placed by classical MDS of the correlation distance between return series,
// so both axes share one unit. The modules follow the scripts/fetch-datasets.mjs format (meta, then flat
// `points`) plus `groups` (the sector index of each point) and `groupNames` (the sectors), kept for a later
// overlay; the simulator ignores them. Exact duplicate points would sit on one site, so each repeat is nudged
// by a tiny seeded amount (`jitter`, in the set's own units); the module's `notes` says how many.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const inDir = path.join(here, '..', 'experiments', 'asset-clusters', 'fields');
const outDir = path.join(here, '..', 'src', 'data', 'sets');

// Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, commas and newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// mulberry32, as in src/core/rng.js, so the nudges are the same on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ym = date => date.slice(0, 7); // '2021-11-08' -> '2021-11'

// One entry per field: `field` names the input pair, `name` is built from the window in the .json, `shape`
// is read off fields.png. The coordinates are rounded to `decimals` (the fields span about 1.3 units, so
// 1e-5 is far below anything the simulator can tell apart).
const SETS = [
  {
    id: 'market-daily-5y', field: 'daily5y', period: 'daily returns',
    name: j => `S&P 500 stocks, five years of daily returns (${ym(j.window[0])} → ${ym(j.window[1])})`,
    shape: 'A broad cloud with the sectors as overlapping lobes: energy is a separate tuft above it, utilities trail off to the left, tech sits on the right and staples on the left.',
  },
  {
    id: 'market-calm-2019', field: 'calm2019', period: 'daily returns',
    name: j => `S&P 500 stocks, the calm year before Covid (${ym(j.window[0])} → ${ym(j.window[1])})`,
    shape: 'A dense core on the right, with utilities and real estate stretched into a long sparse tail to the upper left and a few financials hanging below.',
  },
  {
    id: 'market-crash-2020', field: 'crash2020', period: 'daily returns',
    name: j => `S&P 500 stocks, the Covid crash year (${j.window[0].slice(0, 4)})`,
    shape: 'A dense core with the sectors as short overlapping lobes; energy and the rate-sensitive names (utilities, real estate) sit on the rim.',
  },
  {
    id: 'market-rotation-2022', field: 'rotation2022', period: 'daily returns',
    name: j => `S&P 500 stocks, the 2022 rate rotation (${ym(j.window[0])} → ${ym(j.window[1])})`,
    shape: 'An elongated cloud with tech at the left end and utilities and staples at the right, energy split off as its own small clump below.',
  },
  {
    id: 'market-covid-63d', field: 'covid63d', period: 'daily returns',
    name: j => `S&P 500 stocks, the Covid quarter (${j.T} days to ${j.window[1]})`,
    shape: 'One tight core with every sector piled together and a thin halo around it; a few names hang below.',
  },
  {
    id: 'market-intraday-5m', field: 'intraday5m', period: '5-minute returns (intraday only)',
    name: j => `S&P 500 stocks from 5-minute bars (${ym(j.window[0])} → ${ym(j.window[1])})`,
    shape: 'A main cloud with a long arm of tech and industrial names curving out to the left, energy below it and utilities as a separate island at the bottom.',
  },
];
const DECIMALS = 5, JITTER = 0.0001;

const COMMON = {
  kind: 'map', group: 'Market fields',
  source: 'Yahoo Finance adjusted closes via yfinance, GICS sectors from Wikipedia\'s S&P 500 list; computed by experiments/asset-clusters/fields_export.py',
  url: 'https://github.com/ranaroussi/yfinance',
  license: 'Derived coordinates (no price data) for personal, educational use; yfinance is an unofficial client of Yahoo\'s public endpoints.',
};

const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);

function main() {
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  for (const set of SETS) {
    const base = path.join(inDir, `field_${set.field}`);
    const info = JSON.parse(readFileSync(`${base}.json`, 'utf8'));
    const rows = parseCsv(readFileSync(`${base}.csv`, 'utf8')).filter(r => Number.isFinite(+r.x) && Number.isFinite(+r.y));
    const groupNames = [...new Set(rows.map(r => r.sector))].sort();
    const groups = rows.map(r => groupNames.indexOf(r.sector));

    const r = rng(hash(set.id)), seen = new Set(), round = v => +v.toFixed(DECIMALS);
    const [jx, jy] = [JITTER, JITTER];
    let nudged = 0;
    const flat = [];
    for (let { x, y } of rows) {
      x = round(+x); y = round(+y);
      for (let tries = 0; seen.has(`${x},${y}`) && tries < 100; tries++) {
        x = round(x + (2 * r() - 1) * jx);
        y = round(y + (2 * r() - 1) * jy);
        if (tries === 0) nudged++;
      }
      seen.add(`${x},${y}`);
      flat.push(x, y);
    }
    const n = flat.length / 2;
    if (n !== info.N) console.warn(`${set.id}: ${n} points in the CSV, N = ${info.N} in the JSON`);

    const [w0, w1] = info.window;
    const pct = Math.round(info.mds_2d_variance_fraction * 100);
    const units = `correlation distance of log returns, √(2(1−ρ)), flattened to two dimensions by classical MDS (${pct} % of the distance variance kept); both axes in the same units`;
    const notes = `Window ${w0} → ${w1}: T = ${info.T} ${set.period} of N = ${n} stocks, mean pairwise correlation ${info.mean_corr.toFixed(2)}. `
      + `In the full correlation distance the spanning tree's longest edge is M = ${info.mst_full_longest_edge_M.toFixed(2)} and its mean edge ${info.mst_full_mean_edge.toFixed(2)}.`
      + (nudged ? ` ${nudged} exact duplicate${nudged === 1 ? '' : 's'} nudged by at most ${[jx, jy].filter(Boolean).join(' / ')} (in the set's units).` : '');
    const meta = { id: set.id, name: set.name(info), kind: COMMON.kind, group: COMMON.group, shape: set.shape, units, source: COMMON.source, url: COMMON.url, license: COMMON.license };
    const body = `// ${meta.name}: ${n} points. Generated by scripts/import-field-sets.mjs on ${stamp} from experiments/asset-clusters/fields/field_${set.field}.{csv,json}; do not edit by hand.\n`
      + `export default ${JSON.stringify({ ...meta, fetched: stamp, notes }, null, 2).replace(/\n}$/, ',')}\n`
      + `  points: [${flat.join(',')}],\n`
      + `  groups: [${groups.join(',')}],\n`
      + `  groupNames: ${JSON.stringify(groupNames)},\n`
      + `};\n`;
    writeFileSync(path.join(outDir, `${set.id}.js`), body);
    console.log(`${set.id.padEnd(22)} ${String(n).padStart(5)} points, ${groupNames.length} sectors${nudged ? `, ${nudged} nudged` : ''}`);
  }
}

try { main(); } catch (err) { console.error(err.message || err); process.exit(1); }
