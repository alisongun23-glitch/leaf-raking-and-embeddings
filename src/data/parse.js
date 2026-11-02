import { placePoints } from './datasets.js';
import { Rng } from '../core/rng.js';

// Loading your own points: a CSV, TSV, semicolon- or space-separated table, with or without a header row.
// The coordinate columns are lon/lat (or longitude/latitude: placed as degrees), x/y (or east/north),
// or else the first two numeric columns. Two columns whose ranges differ more than tenfold are taken as a
// scatter plot (each axis scaled on its own); anything else keeps its aspect ratio, like a map.

const DELIMS = [',', '\t', ';', ' '];

function splitLine(line, delim) {
  if (delim === ' ') return line.trim().split(/\s+/);
  const out = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cell.trim()); cell = ''; }
    else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

const isNum = s => s !== '' && Number.isFinite(Number(s));
const norm = s => s.toLowerCase().replace(/["'\s_.-]/g, '');
const LON = /^(lon|lng|long|longitude)(deg|degrees)?$/, LAT = /^(lat|latitude)(deg|degrees)?$/;
const X = /^(x|east|easting)$/, Y = /^(y|north|northing)$/;

// Parses the table and picks the two coordinate columns. Returns { pairs, kind, columns, skipped }.
export function parsePointTable(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !/^\s*#/.test(l));
  if (lines.length < 2) throw new Error('The file needs at least two rows of points.');
  // the delimiter that splits the first rows into the most consistent number of columns (2 or more)
  let best = null;
  for (const d of DELIMS) {
    const counts = lines.slice(0, 50).map(l => splitLine(l, d).length);
    const mode = counts.sort((a, b) => counts.filter(c => c === b).length - counts.filter(c => c === a).length)[0];
    const share = counts.filter(c => c === mode).length / counts.length;
    if (mode >= 2 && (!best || share > best.share + 1e-9)) best = { d, share };
  }
  if (!best) throw new Error('Could not find two columns. Use commas, tabs, semicolons or spaces between values.');
  const rows = lines.map(l => splitLine(l, best.d));
  const header = rows[0].some(c => c !== '' && !isNum(c)) ? rows.shift().map(norm) : null;
  const width = Math.max(...rows.map(r => r.length));
  const numericShare = c => rows.filter(r => isNum(r[c] ?? '')).length / rows.length;
  let cx = -1, cy = -1, kind = null;
  if (header) {
    const find = re => header.findIndex(h => re.test(h));
    if (find(LON) >= 0 && find(LAT) >= 0) { cx = find(LON); cy = find(LAT); kind = 'lonlat'; }
    else if (find(X) >= 0 && find(Y) >= 0) { cx = find(X); cy = find(Y); }
  }
  if (cx < 0) {
    const numeric = Array.from({ length: width }, (_, c) => c).filter(c => numericShare(c) >= 0.5); // a few bad rows are skipped
    if (numeric.length < 2) throw new Error('Could not find two numeric columns.');
    [cx, cy] = numeric;
  }
  const pairs = [];
  let skipped = 0;
  for (const r of rows) {
    if (isNum(r[cx] ?? '') && isNum(r[cy] ?? '')) pairs.push([Number(r[cx]), Number(r[cy])]);
    else skipped++;
  }
  if (pairs.length < 2) throw new Error('Fewer than two rows have numbers in both coordinate columns.');
  if (!kind) {
    const span = c => Math.max(...pairs.map(p => p[c])) - Math.min(...pairs.map(p => p[c]));
    const a = span(0), b = span(1);
    kind = a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) > 10 ? 'scatter' : 'map';
  }
  const name = c => (header ? header[c] : `column ${c + 1}`);
  return { pairs, kind, columns: [name(cx), name(cy)], skipped };
}

// The whole path from file text to field points: parse, place in the field, keep at most `max` points (a
// seeded sample when there are more), round to 0.001 and nudge exact duplicates apart by up to 0.01.
// Returns { W, H, points: [[x, y], ...], kind, columns, total, skipped, nudged }.
export function loadPointTable(text, { max = 5000, seed = 1 } = {}) {
  const table = parsePointTable(text);
  let pairs = table.pairs;
  const total = pairs.length;
  if (total > max) {
    const keep = new Rng(seed, 'load-sample').shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, max).sort((a, b) => a - b);
    pairs = keep.map(i => pairs[i]);
  }
  const { W, H, xs, ys } = placePoints(pairs, table.kind);
  const rng = new Rng(seed, 'load-nudge'), seen = new Set(), points = [];
  const round = v => +v.toFixed(3);
  let nudged = 0;
  for (let i = 0; i < xs.length; i++) {
    let x = round(xs[i]), y = round(ys[i]);
    for (let t = 0; seen.has(`${x},${y}`) && t < 100; t++) {
      if (t === 0) nudged++;
      x = round(Math.min(W, Math.max(0, x + rng.range(-0.01, 0.01))));
      y = round(Math.min(H, Math.max(0, y + rng.range(-0.01, 0.01))));
    }
    seen.add(`${x},${y}`);
    points.push([x, y]);
  }
  return { W: round(W), H: round(H), points, kind: table.kind, columns: table.columns, total, skipped: table.skipped, nudged };
}
