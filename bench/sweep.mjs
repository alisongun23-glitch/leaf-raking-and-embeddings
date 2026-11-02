#!/usr/bin/env node
// Work as a function of one dial, one seed at a time, with a fitted curve per seed.
//   node bench/sweep.mjs [--seeds 1,2 | none] [--path field.N] [--from 250 --to 500 --step 1] [--all 20]
//                        [--measure work|time|compute|strokes|walk] [--algo planned-sites] [--redraw] [--no-bound]
//                        [--threshold 0.05] [--config patch.json]
//                        [--workers 6] [--out dir]
//   node bench/sweep.mjs --reanalyse bench/out/<dir> [--threshold 0.05]   rebuild the report from saved runs
// Sweeping N keeps each seed's field and adds leaves (--redraw draws a new field per N instead).
// --all S (or --average S) also plays seeds 1..S (without bounds): their average curve, and which
// function (power law, exponential, ...) best describes all of them (src/analysis/shape.js). Writes
// points.csv, summary.md and sweep.json to bench/out/<timestamp>-sweep/ and prints the summary.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, mergeConfig } from '../src/analysis/instance.js';
import { sweepPoint, sweepValues, sweepDial, sweepMeasure } from '../src/analysis/sweep.js';
import { analyseCurve, averageAnalysis, compareCurves, powerAt, powerSlope, powerText } from '../src/analysis/fit.js';
import { shapeAnalysis } from '../src/analysis/shape.js';
import { isDataModel } from '../src/gen/processes.js';
import { dataset } from '../src/data/datasets.js';

if (!isMainThread) {
  parentPort.on('message', task => {
    try {
      parentPort.postMessage({ ok: true, row: sweepPoint(task.base, task.path, task.value, task.seed, task.opts), task });
    } catch (err) {
      parentPort.postMessage({ ok: false, task, error: String(err && err.stack || err) });
    }
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) out[k] = v;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

const num = v => (!Number.isFinite(v) ? '—' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toPrecision(3)));
const pct = v => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}%` : '—');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.reanalyse) {
    // the runs saved by an earlier sweep, analysed again with the current code
    const saved = JSON.parse(readFileSync(path.join(args.reanalyse, 'sweep.json'), 'utf8'));
    const avg = saved.avg ?? Math.max(0, ...saved.rows.map(r => r.seed).filter(s => s <= 50 && !saved.seeds.includes(s)));
    report({ ...saved, dialPath: saved.path, avg, threshold: Number(args.threshold ?? saved.threshold ?? 0.05), measureId: args.measure || saved.measureId || 'work', seconds: saved.seconds ?? '?', outDir: args.reanalyse });
    return;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const base = mergeConfig(DEFAULT_CONFIG, args.config ? JSON.parse(readFileSync(args.config, 'utf8')) : {});
  const dialPath = args.path || 'field.N', dial = sweepDial(dialPath);
  const n0 = base.goal.n * base.goal.t;
  const from = Number(args.from ?? (dialPath === 'field.N' ? n0 + 10 : NaN)), to = Number(args.to ?? (dialPath === 'field.N' ? n0 + 260 : NaN));
  let values = sweepValues(dialPath, from, to, Number(args.step ?? 1));
  if (!values.length) throw new Error('Give a range: --from A --to B [--step S].');
  const total = isDataModel(base.field.model) ? dataset(base.field.model.slice(5))?.count : null;
  if (total && dialPath === 'field.N') values = [...new Set(values.map(v => Math.min(v, total)))];
  if (base.field.model === 'custom' || (total && base.field.N >= total && dialPath !== 'field.N')) {
    console.error('Note: this field is the same for every seed (hand-placed points, or a data set used whole), so seeds only repeat one run. Set field.N below the data set\'s size to compare random samples.');
  }
  const seeds = args.seeds === 'none' ? [] : String(args.seeds ?? '1,2').split(',').map(Number).filter(Number.isFinite);
  const avg = Number(args.all ?? args.average ?? 0);
  const algo = { id: args.algo || base.algo.id, params: args.algo ? {} : base.algo.params };
  const measureId = sweepMeasure(args.measure).id;
  const nested = !args.redraw, bound = !args['no-bound'] && measureId === 'work', threshold = Number(args.threshold ?? 0.05);
  const opts = { algo, nested, bound, boundIterations: Number(args.iterations ?? 120) };

  const tasks = [];
  const runSeeds = [...new Set([...seeds, ...Array.from({ length: avg }, (_, i) => i + 1)])];
  for (const seed of runSeeds) {
    for (const value of values) tasks.push({ base, path: dialPath, value, seed, opts: { ...opts, bound: bound && seeds.includes(seed) } });
  }
  const workers = Math.max(1, Math.min(Number(args.workers ?? availableParallelism() - 1), tasks.length));
  console.error(`sweep ${dialPath} ${values[0]}..${values[values.length - 1]} (${values.length} values) x ${runSeeds.length} seed(s), ${algo.id}, ${nested ? 'same field' : 'new field per value'}, ${workers} worker(s)`);

  const t0 = Date.now(), rows = [];
  let next = 0, done = 0;
  const pool = Array.from({ length: workers }, () => new Worker(fileURLToPath(import.meta.url)));
  try {
    await new Promise((resolve, reject) => {
      const feed = w => { if (next < tasks.length) w.postMessage(tasks[next++]); };
      for (const w of pool) {
        w.on('message', msg => {
          if (!msg.ok) { reject(new Error(`seed ${msg.task.seed}, ${dialPath} = ${msg.task.value}: ${msg.error}`)); return; }
          rows.push(msg.row);
          done++;
          if (process.stderr.isTTY) process.stderr.write(`\r${done}/${tasks.length} points`);
          if (done === tasks.length) resolve();
          else feed(w);
        });
        w.on('error', reject);
        feed(w);
      }
    });
  } finally {
    await Promise.all(pool.map(w => w.terminate()));
  }
  if (process.stderr.isTTY) process.stderr.write('\n');
  rows.sort((a, b) => a.seed - b.seed || a.value - b.value);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = args.out || path.join(here, 'out', `${stamp}-sweep`);
  report({ base, dialPath, values, seeds, avg, algo, nested, threshold, measureId, rows, seconds: ((Date.now() - t0) / 1000).toFixed(1), outDir });
}

// Analyses the runs and writes points.csv, summary.md and sweep.json to outDir.
function report({ base, dialPath, values, seeds, avg, algo, nested, threshold, measureId = 'work', rows, seconds, outDir }) {
  const dial = sweepDial(dialPath), M = sweepMeasure(measureId), measure = M.get, bounds = !!M.bound;
  const curves = seeds.map(s => analyseCurve(rows.filter(r => r.seed === s), { threshold, measure, bounds }));
  const average = avg ? averageAnalysis(rows.filter(r => r.seed <= avg), { measure }) : null; // seeds 1..avg
  const perSeed = avg ? Array.from({ length: avg }, (_, i) => analyseCurve(rows.filter(r => r.seed === i + 1), { threshold, bootstrap: 0, measure, bounds })) : [];
  const comparison = curves.length >= 2 ? compareCurves(curves[0], curves[1], rows.filter(r => r.seed === seeds[0]), rows.filter(r => r.seed === seeds[1]), { measure, bounds }) : null;
  const shape = avg >= 3 ? shapeAnalysis(rows.filter(r => r.seed <= avg), { symbol: dial.symbol, measure }) : null;

  const x = dial.symbol;
  const md = [];
  md.push(`# Sweep: ${M.noun}${M.unit ? ` (${M.unit})` : ''} against ${dial.label}`, '');
  md.push(`${algo.id}; ${dialPath} from ${values[0]} to ${values[values.length - 1]} (${values.length} values); ${nested && dialPath === 'field.N' ? 'each seed keeps its field and gains leaves' : 'fields as generated'}; n = ${base.goal.n}, t = ${base.goal.t}, k = ${base.raker.kMode === 'xM' ? `${base.raker.kMul} × M` : base.raker.k}, l = ${base.raker.lMode === 'abs' ? base.raker.l : `${base.raker.lMul} × k`}. ${seconds} s.`, '');
  const mid = curves[0]?.mid ?? (values[0] + values[values.length - 1]) / 2;
  const fitCell = f => (f ? `${powerText(f, x)} | ${f.b.toFixed(2)} [${f.ciB.map(v => (Number.isFinite(v) ? v.toFixed(2) : '?')).join(', ')}] | ${f.r2.toFixed(2)} | ${num(powerSlope(f, mid))}` : '— | — | — | —');
  md.push('## Fitted functions (finished runs)', '');
  md.push(`| Seed | Curve | Points | ${x} range | ${M.label}${M.unit ? ` (${M.unit})` : ''} ≈ | b, 95% interval | R² | Extra ${M.noun} per unit of ${x} at ${x} = ${num(mid)} | Work ÷ bound (median) |`);
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const c of curves) {
    md.push(`| ${c.seed} | lower bound | ${c.finished} | ${c.range.join('–')} | ${fitCell(c.boundFit)} | 1 |`);
    md.push(`| ${c.seed} | all finished runs | ${c.finished} | ${c.range.join('–')} | ${fitCell(c.fit)} | ${c.gap ? c.gap.toFixed(2) : '—'} |`);
    for (const g of c.regimes) if (g.fit) md.push(`| ${c.seed} | ${g.regime} | ${g.points} | ${g.range.join('–')} | ${fitCell(g.fit)} | ${g.gap ? g.gap.toFixed(2) : '—'} |`);
  }
  if (average) {
    md.push(`| mean of seeds 1–${avg} | mean curve | ${average.curve.length} | ${values[0]}–${values[values.length - 1]} | ${fitCell(average.fit)} | |`);
    for (const g of average.regimes) if (g.fit) md.push(`| seeds 1–${avg} pooled | ${g.regime} | ${g.points} | ${g.range.join('–')} | ${fitCell(g.fit)} | ${g.gap ? g.gap.toFixed(2) : '—'} |`);
  }
  md.push('');
  for (const c of curves) {
    md.push(`- Seed ${c.seed}: typical one-leaf change ${pct(c.typicalStep)}, typical distance from the all-runs curve ${pct(c.typicalDev)}, ${c.jumps.length} jumps of ${Math.round(threshold * 100)}% or more, ${c.finished}/${c.points} finished.${c.switches.length ? ` Regime switches at ${x} = ${c.switches.map(w => w.at).join(', ')}.` : ''}`);
  }
  if (average) {
    const exps = perSeed.filter(c => c.fit).map(c => c.fit.b).sort((a, b) => a - b);
    md.push(`- Exponent b of the all-runs curve across the ${exps.length} seeds: min ${exps[0]?.toFixed(2)}, median ${exps[Math.floor(exps.length / 2)]?.toFixed(2)}, max ${exps[exps.length - 1]?.toFixed(2)}.`);
    const names = [...new Set(average.curve.flatMap(p => Object.keys(p.shares)))];
    if (names.length) {
      const bins = 5, lo = values[0], hi = values[values.length - 1], w = (hi - lo + 1) / bins, parts = [];
      for (let b = 0; b < bins; b++) {
        const pts = average.curve.filter(p => p.value >= lo + b * w && p.value < lo + (b + 1) * w);
        const share = pts.length ? pts.reduce((s, p) => s + (p.shares[names[0]] || 0) * p.n, 0) / pts.reduce((s, p) => s + p.n, 0) : NaN;
        parts.push(`${Math.round(lo + b * w)}–${Math.round(lo + (b + 1) * w - 1)}: ${Math.round(100 * share)}%`);
      }
      md.push(`- Share of finished runs in regime "${names[0]}" by ${x}: ${parts.join(', ')}.`);
    }
  }
  md.push('');
  if (shape) {
    const ePct = v => `${(100 * (Math.exp(v) - 1)).toFixed(1)}%`;
    md.push(`## All seeds 1–${avg}: which function describes it best`, '');
    md.push(`Each seed's ${M.noun} is modelled as its own level times one shared shape, fitted on log ${M.noun} over ${shape.points} finished runs. "Error on an unseen seed" is leave-one-seed-out cross-validation: fit the shape without that seed, then fit only its level. The best fit has the lowest error; "simplest" is the function with the fewest parameters within one standard error of it.`, '');
    md.push(`| Function | Typical seed: ${M.noun}${M.unit ? ` (${M.unit})` : ''} ≈ | Shape parameters | Explains (within a seed) | Error on an unseen seed | ΔAIC | Change over the range | Elasticity at ${x} = ${num(shape.xref)} |`);
    md.push('|---|---|---|---|---|---|---|---|');
    const order = shape.families.filter(f => f.applicable).sort((a, b) => a.cv - b.cv);
    for (const f of order) {
      const tag = [f.id === shape.best ? 'best fit' : '', f.id === shape.simplest ? 'simplest' : ''].filter(Boolean).join(', ');
      md.push(`| ${f.id === shape.best || f.id === shape.simplest ? `**${f.name}**` : f.name}${tag ? ` (${tag})` : ''} | ${f.formula} | ${f.k} | ${(100 * f.r2).toFixed(1)}% | ${ePct(f.cv)} ± ${(100 * f.cvSe).toFixed(1)}% | ${f.dAic.toFixed(1)} | ${pct(f.change)} | ${f.elasticity.toFixed(2)} |`);
    }
    const skipped = shape.families.filter(f => !f.applicable).map(f => f.name);
    if (skipped.length) md.push('', `Not fitted (need values above 0): ${skipped.join(', ')}.`);
    const c = shape.families.find(f => f.id === shape.best);
    md.push('');
    if (shape.change) md.push(`- Change from ${x} ≈ ${num(shape.range[0])} to ${num(shape.range[1])} (first and last tenth of the range): median seed ${pct(shape.change.median)}, 10–90% of seeds ${pct(shape.change.q10)} to ${pct(shape.change.q90)}.`);
    md.push(`- Seeds differ in overall level by ±${(100 * shape.levelSpread).toFixed(0)}% (1 s.d.); a typical seed wiggles ±${ePct(shape.wiggle)} around its own fitted curve.`);
    md.push(`- At ${x} = ${num(shape.xref)} the best fit has elasticity ${c.elasticity.toFixed(2)} (a 1% larger ${x} means ${Math.abs(c.elasticity).toFixed(2)}% ${c.elasticity >= 0 ? 'more' : 'less'} ${M.noun}) and slope ${num(c.slope)}${M.unit ? ` ${M.unit}` : ''} per unit of ${x}.${shape.seedElasticity ? ` Fitted seed by seed, the elasticity ranges ${shape.seedElasticity.q10.toFixed(2)}–${shape.seedElasticity.q90.toFixed(2)} (10–90%), median ${shape.seedElasticity.median.toFixed(2)}.` : ''}`, '');
  }
  if (comparison) {
    const [A, B] = curves;
    md.push('## Seed against seed', '');
    md.push(`- At ${x} = ${num(comparison.mid)}, seed ${A.seed}'s fitted curve is ${pct(comparison.level - 1)} relative to seed ${B.seed}'s (${num(powerAt(A.fit, comparison.mid))} against ${num(powerAt(B.fit, comparison.mid))}).`);
    if (Number.isFinite(comparison.boundRatioMedian)) {
      const field = comparison.boundRatioMedian, play = comparison.ratioMedian / field;
      md.push(`- Lower bounds, point by point: seed ${A.seed} ÷ seed ${B.seed} has median ${field.toFixed(2)} (fitted exponents ${A.boundFit.b.toFixed(2)} against ${B.boundFit.b.toFixed(2)}). The field accounts for ${field.toFixed(2)}× of the work ratio and the algorithm's play for the remaining ${play.toFixed(2)}×.`);
    }
    md.push(`- Exponents: ${A.fit.b.toFixed(2)} against ${B.fit.b.toFixed(2)}; ${comparison.exponentsDiffer === null ? 'no interval' : comparison.exponentsDiffer ? 'the intervals do not overlap, so the growth rates differ' : 'the intervals overlap, so the growth rates are not distinguishable'}.`);
    md.push(`- Point by point (${comparison.shared} values where both finished), seed ${A.seed} ÷ seed ${B.seed} has median ${comparison.ratioMedian.toFixed(2)}, range ${comparison.ratioRange.map(v => v.toFixed(2)).join('–')}.`, '');
  }
  for (const c of curves) {
    md.push(`## Seed ${c.seed}: biggest one-step jumps`, '');
    md.push('| Step | Work | Change | What changed |', '|---|---|---|---|');
    for (const j of c.jumps.slice(0, 15)) md.push(`| ${j.from} → ${j.to} | ${num(j.w0)} → ${num(j.w1)} | ${pct(j.rel)} | ${j.causes.map(k => k.text).join('; ')} |`);
    const counts = Object.entries(c.causeCounts).map(([k, v]) => `${k} ${v}`).join(', ');
    md.push('', `Causes over all ${c.jumps.length} jumps: ${counts || 'none'}.${c.failures.length ? ` Failed: ${c.failures.map(f => (f.from === f.to ? `${f.from}` : `${f.from}–${f.to}`) + ` (${f.reason})`).join(', ')}.` : ''}`, '');
  }

  mkdirSync(outDir, { recursive: true });
  const head = ['seed', 'value', 'N', 'n', 't', 'spare', 'M', 'k', 'l', 'status', 'reason', 'work', 'bound', 'time', 'computeMs', 'strokes', 'walkDist', 'rakeDist', 'captures', 'regime', 'plan', 'leftover', 'piles'];
  const csv = [head.join(','), ...rows.map(r => head.map(h => (h === 'piles' ? `"${r.piles.map(p => p.join(' ')).join('; ')}"` : r[h] ?? '')).join(','))];
  writeFileSync(path.join(outDir, 'points.csv'), csv.join('\n') + '\n');
  writeFileSync(path.join(outDir, 'sweep.json'), JSON.stringify({ base, path: dialPath, values, seeds, avg, algo, nested, threshold, measureId, seconds, curves, average, shape, comparison, rows }) + '\n');
  writeFileSync(path.join(outDir, 'summary.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
  console.error(`\nWrote ${path.relative(process.cwd(), outDir)}/{points.csv,summary.md,sweep.json}`);
}

// started last, so the helpers above are initialised even when main() finishes without awaiting
if (isMainThread) main().catch(err => { console.error(err.message || err); process.exit(1); });
