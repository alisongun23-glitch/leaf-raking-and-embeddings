#!/usr/bin/env node
// Benchmark runner.
//   node bench/run.mjs bench/configs/baseline.json [--seeds 30] [--workers 6] [--algos tree-peel,planned-sites] [--out dir]
// Every algorithm runs on the same seeded instances (paired). Writes runs.jsonl, summary.csv and
// summary.md to bench/out/<timestamp>-<name>/ and prints the summary.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, mergeConfig } from '../src/analysis/instance.js';
import { runTrial } from '../src/analysis/trial.js';
import { summarize, toMarkdown, toCsv, expandGrid } from '../src/analysis/benchreport.js';

if (!isMainThread) {
  parentPort.on('message', task => {
    try {
      parentPort.postMessage({ ok: true, task, out: runTrial(task.cfg, task.seed, task.algos, task.opts) });
    } catch (err) {
      parentPort.postMessage({ ok: false, task, error: String(err && err.stack || err) });
    }
  });
} else {
  main().catch(err => { console.error(err.message || err); process.exit(1); });
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      out[k] = v ?? argv[++i];
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = args._[0] || path.join(here, 'configs', 'smoke.json');
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const seeds = Number(args.seeds ?? spec.seeds ?? 10), seedStart = Number(spec.seedStart ?? 1);
  const algos = (args.algos ? args.algos.split(',') : spec.algorithms || []).map(a => (typeof a === 'string' ? { id: a } : a));
  if (!algos.length) throw new Error('No algorithms listed (config "algorithms" or --algos).');
  const base = mergeConfig(DEFAULT_CONFIG, spec.base || {});
  const cells = expandGrid(spec.grid);
  const opts = { lagrangian: spec.lagrangian ?? true, lagrangianMaxN: spec.lagrangianMaxN ?? 800, decisionBudgetMs: spec.decisionBudgetMs };
  const tasks = [];
  for (const cell of cells) {
    const cfg = mergeConfig(base, cell.patch);
    for (let s = seedStart; s < seedStart + seeds; s++) tasks.push({ cell: cell.label, cfg, seed: s, algos, opts });
  }
  const workers = Math.max(1, Math.min(Number(args.workers ?? availableParallelism() - 1), tasks.length));
  console.error(`${spec.name || path.basename(file)}: ${cells.length} cell(s) x ${seeds} seeds x ${algos.length} algorithms on ${workers} worker(s)`);

  const t0 = Date.now(), trials = [];
  let next = 0, done = 0;
  const pool = Array.from({ length: workers }, () => new Worker(fileURLToPath(import.meta.url)));
  try {
    await new Promise((resolve, reject) => {
      const feed = w => { if (next < tasks.length) w.postMessage(tasks[next++]); };
      for (const w of pool) {
        w.on('message', msg => {
          if (!msg.ok) { reject(new Error(`seed ${msg.task.seed} (${msg.task.cell}): ${msg.error}`)); return; }
          trials.push({ cell: msg.task.cell, ...msg.out });
          done++;
          if (process.stderr.isTTY) process.stderr.write(`\r${done}/${tasks.length} instances`);
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

  const order = new Map(cells.map((c, i) => [c.label, i]));
  trials.sort((a, b) => order.get(a.cell) - order.get(b.cell) || a.seed - b.seed);
  const summary = summarize(trials);
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = args.out || path.join(here, 'out', `${stamp}-${spec.name || 'bench'}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'runs.jsonl'), trials.map(t => JSON.stringify(t)).join('\n') + '\n');
  writeFileSync(path.join(outDir, 'summary.csv'), toCsv(trials) + '\n');
  const md = toMarkdown(summary, { name: spec.name, when: new Date().toISOString().slice(0, 16).replace('T', ' '), trials: trials.length, algorithms: algos.length, seconds });
  writeFileSync(path.join(outDir, 'summary.md'), md + '\n');
  console.log(md);
  console.error(`\nWrote ${path.relative(process.cwd(), outDir)}/{runs.jsonl,summary.csv,summary.md} in ${seconds}s`);
}
