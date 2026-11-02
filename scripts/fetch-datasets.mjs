#!/usr/bin/env node
// Downloads the real-world point sets the simulator ships with, cleans them, and writes one module per set
// to src/data/sets/. Run it again to refresh them: node scripts/fetch-datasets.mjs
//
// Each set keeps its own coordinates (degrees, metres, minutes...). src/data/datasets.js scales them into
// the field when they are used. Exact duplicate points would sit on one site, so each repeat is nudged by
// a tiny seeded amount (`jitter`, in the set's own units, well below its measuring precision); the
// module's `notes` says how many.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'src', 'data', 'sets');
const RD = 'https://vincentarelbundock.github.io/Rdatasets';

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

async function getCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return parseCsv(await res.text());
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

const SETS = [
  {
    id: 'cholera', name: 'Cholera deaths, London 1854', kind: 'map', decimals: 4, jitter: 0.005,
    shape: 'One dense hotspot around the Broad Street pump, thinning out along the streets (deaths at one address are stacked in short lines).',
    units: '100 m, arbitrary origin',
    source: 'John Snow\'s map of the 1854 Broad Street outbreak (Snow, 1855); R package HistData (Snow.deaths), via Rdatasets.',
    url: `${RD}/doc/HistData/Snow.deaths.html`, license: 'The 1854 records are public domain; HistData is GPL.',
    async load() { return (await getCsv(`${RD}/csv/HistData/Snow.deaths.csv`)).map(r => [+r.x, +r.y]); },
  },
  {
    id: 'brambles', name: 'Bramble canes in a 9 m plot', kind: 'map', decimals: 5, jitter: 0.0005,
    shape: 'Many small clumps: canes sprout around their parent plants.',
    units: 'fraction of the 9 m × 9 m plot side',
    source: 'Living bramble canes in a 9 m square plot, from Diggle (1983), Statistical Analysis of Spatial Point Patterns; R package boot (brambles), via Rdatasets.',
    url: `${RD}/doc/boot/brambles.html`, license: 'R package boot (unlimited licence).',
    async load() { return (await getCsv(`${RD}/csv/boot/brambles.csv`)).map(r => [+r.x, +r.y]); },
  },
  {
    id: 'fiji-quakes', name: 'Earthquakes off Fiji since 1964', kind: 'lonlat', decimals: 3, jitter: 0.004,
    shape: 'Two curved bands that follow the ocean trenches, with open sea between them.',
    units: 'degrees (longitude past 180° continues east)',
    source: '1000 seismic events of body-wave magnitude above 4.0 near Fiji since 1964, Harvard PRIM-H project (from J. Woodhouse); R datasets (quakes), via Rdatasets.',
    url: `${RD}/doc/datasets/quakes.html`, license: 'R datasets package (part of R, GPL).',
    async load() { return (await getCsv(`${RD}/csv/datasets/quakes.csv`)).map(r => [+r.long, +r.lat]); },
  },
  {
    id: 'california-quakes', name: 'California earthquakes in 2023', kind: 'lonlat', decimals: 4, jitter: 0.0005,
    shape: 'Strings along fault lines plus a few very dense aftershock clusters; large empty areas.',
    units: 'degrees',
    source: 'U.S. Geological Survey ComCat: every earthquake of magnitude 2.5 or more in 32°–42.1°N, 125°–114°W during 2023.',
    url: 'https://earthquake.usgs.gov/fdsnws/event/1/', license: 'Public domain (U.S. Government work).',
    async load() {
      const q = 'format=csv&starttime=2023-01-01&endtime=2024-01-01&minlatitude=32&maxlatitude=42.1&minlongitude=-125&maxlongitude=-114&minmagnitude=2.5&orderby=time-asc';
      return (await getCsv(`https://earthquake.usgs.gov/fdsnws/event/1/query?${q}`)).filter(r => r.type === 'earthquake').map(r => [+r.longitude, +r.latitude]);
    },
  },
  {
    id: 'uk-airfields', name: 'Airfields in the United Kingdom', kind: 'lonlat', decimals: 4, jitter: 0.0005,
    shape: 'Spread across a coastline-shaped region, denser in the south-east, thin in the Highlands.',
    units: 'degrees',
    source: 'OurAirports: open small, medium and large airports and seaplane bases with country GB (heliports and closed fields left out).',
    url: 'https://ourairports.com/data/', license: 'Public domain (OurAirports).',
    async load() {
      const keep = new Set(['small_airport', 'medium_airport', 'large_airport', 'seaplane_base']);
      return (await getCsv('https://davidmegginson.github.io/ourairports-data/airports.csv'))
        .filter(r => r.iso_country === 'GB' && keep.has(r.type)).map(r => [+r.longitude_deg, +r.latitude_deg]);
    },
  },
  {
    id: 'park-slope-trees', name: 'Street trees in Park Slope, Brooklyn', kind: 'lonlat', decimals: 6, jitter: 0.000005,
    shape: 'Points on straight lines: trees line the sidewalks of a street grid, with empty blocks between.',
    units: 'degrees',
    source: 'NYC Parks 2015 Street Tree Census: live trees in 40.670°–40.678°N, 73.982°–73.972°W.',
    url: 'https://data.cityofnewyork.us/Environment/2015-Street-Tree-Census-Tree-Data/uvpi-gqnh', license: 'NYC Open Data (free to use).',
    async load() {
      const where = encodeURIComponent('latitude between 40.670 and 40.678 and longitude between -73.982 and -73.972');
      const rows = await getCsv(`https://data.cityofnewyork.us/resource/uvpi-gqnh.csv?$select=tree_id,latitude,longitude,status&$where=${where}&$order=tree_id&$limit=20000`);
      return rows.filter(r => r.status === 'Alive').map(r => [+r.longitude, +r.latitude]);
    },
  },
  {
    id: 'caveolae', name: 'Caveolae in a muscle fibre', kind: 'map', decimals: 1, jitter: 0.2,
    shape: 'Evenly spaced: neighbours keep their distance, the opposite of clumping.',
    units: 'grid units (500 units = 2.65 µm)',
    source: 'Caveolae on a freeze-fractured muscle fibre membrane (Appleyard et al., 1985), lower-left quarter of Ripley\'s caveolae data; R package boot (cav), via Rdatasets.',
    url: `${RD}/doc/boot/cav.html`, license: 'R package boot (unlimited licence).',
    async load() { return (await getCsv(`${RD}/csv/boot/cav.csv`)).map(r => [+r.x, +r.y]); },
  },
  {
    id: 'old-faithful', name: 'Old Faithful eruptions', kind: 'scatter', decimals: 3, jitter: [0.002, 0],
    shape: 'Two separate blobs: short eruptions after short waits, long ones after long waits.',
    units: 'x: eruption length (minutes), y: waiting time to the next eruption (minutes)',
    source: 'Härdle (1991), Old Faithful geyser, Yellowstone; R datasets (faithful), via Rdatasets.',
    url: `${RD}/doc/datasets/faithful.html`, license: 'R datasets package (part of R, GPL).',
    async load() { return (await getCsv(`${RD}/csv/datasets/faithful.csv`)).map(r => [+r.eruptions, +r.waiting]); },
  },
  {
    id: 'iris-petals', name: 'Iris petals', kind: 'scatter', decimals: 3, jitter: 0.04,
    shape: 'One tight clump (setosa) far from a long diagonal band (versicolor, then virginica).',
    units: 'x: petal length (cm), y: petal width (cm)',
    source: 'Anderson (1935) and Fisher (1936), 150 iris flowers; R datasets (iris), via Rdatasets.',
    url: `${RD}/doc/datasets/iris.html`, license: 'R datasets package (part of R, GPL).',
    async load() { return (await getCsv(`${RD}/csv/datasets/iris.csv`)).map(r => [+r['Petal.Length'], +r['Petal.Width']]); },
  },
  {
    id: 'mask-site', name: 'Finds at a hunting stand, Alaska', kind: 'map', decimals: 3, jitter: 0.004,
    shape: 'Dense patches where people sat and worked, with a sparse scatter of finds around them.',
    units: 'site grid units',
    source: 'Bone splinters, large bones, spent cartridges, wood shavings and artifacts at the Mask Site, a Nunamiut hunting stand (Binford, 1978); R package archdata (MaskSite), via Rdatasets.',
    url: `${RD}/doc/archdata/MaskSite.html`, license: 'R package archdata (GPL).',
    async load() { return (await getCsv(`${RD}/csv/archdata/MaskSite.csv`)).map(r => [+r.X, +r.Y]); },
  },
];

const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);

async function main() {
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  for (const set of SETS) {
    const raw = (await set.load()).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    const r = rng(hash(set.id)), seen = new Set(), round = v => +v.toFixed(set.decimals);
    const [jx, jy] = Array.isArray(set.jitter) ? set.jitter : [set.jitter, set.jitter];
    let nudged = 0;
    const flat = [];
    for (let [x, y] of raw) {
      x = round(x); y = round(y);
      for (let tries = 0; seen.has(`${x},${y}`) && tries < 100; tries++) {
        x = round(x + (2 * r() - 1) * jx);
        y = round(y + (2 * r() - 1) * jy);
        if (tries === 0) nudged++;
      }
      seen.add(`${x},${y}`);
      flat.push(x, y);
    }
    const n = flat.length / 2;
    const notes = nudged ? `${nudged} exact duplicate${nudged === 1 ? '' : 's'} nudged by at most ${[jx, jy].filter(Boolean).join(' / ')} (in the set's units).` : '';
    const { load, jitter, decimals, ...meta } = set;
    const body = `// ${set.name}: ${n} points. Generated by scripts/fetch-datasets.mjs on ${stamp}; do not edit by hand.\n`
      + `export default ${JSON.stringify({ ...meta, fetched: stamp, notes }, null, 2).replace(/\n}$/, ',')}\n`
      + `  points: [${flat.join(',')}],\n};\n`;
    writeFileSync(path.join(outDir, `${set.id}.js`), body);
    console.log(`${set.id.padEnd(18)} ${String(n).padStart(5)} points${nudged ? `, ${nudged} nudged` : ''}`);
  }
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
