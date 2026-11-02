import { ALGORITHMS, getAlgorithm } from '../algos/registry.js';
import { SWEEP_DIALS, SWEEP_MEASURES, sweepDial, sweepMeasure, sweepValues, sweepConfig } from '../analysis/sweep.js';
import { analyseCurve, averageAnalysis, compareCurves, powerAt, powerSlope, powerText } from '../analysis/fit.js';
import { shapeAnalysis, shapeValue } from '../analysis/shape.js';
import { quantile } from '../analysis/benchstats.js';
import { isDataModel } from '../gen/processes.js';
import { dataset } from '../data/datasets.js';

// Real data sets: how many points the set has (null for generated fields).
const dataTotal = cfg => (isDataModel(cfg.field.model) ? dataset(cfg.field.model.slice(5))?.count ?? null : null);
import { el } from './dials.js';
import { fmt } from './render.js';
import { reasonLabel } from './panels.js';

// The Sweep tab: step one dial (by default the leaf count N) through a range, play every value to the
// end, and find the function that describes how work, time to rake, or another measure responds.
//   All seeds 1..S   every seed's curve, and which function (power law, exponential, ...) fits them all
//                    best, with each seed at its own level (src/analysis/shape.js)
//   Single seeds     a closer look at a few seeds: a fitted curve each, the lower bound, and the jumps
// Leaf-count sweeps keep each seed's field and add leaves, so neighbouring values differ by one leaf.
// Single seeds are coloured by their slot in the list; a hollow marker means the algorithm fell back
// (planned-sites: no plan, tree peel). All-seeds lines stay neutral; the hovered seed lights up.

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const kid of kids) if (kid) e.append(kid);
  return e;
};
const text = (attrs, s) => svg('text', attrs, document.createTextNode(s));
const seedVar = i => `var(--series-${(i % 5) + 1})`;
const pct = v => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(100 * v) >= 10 ? Math.round(Math.abs(100 * v)) : Math.abs(100 * v).toFixed(1)}%` : '—');
const exp = f => (f ? f.b.toFixed(2) : '—');
const tick = v => String(+v.toPrecision(6));
const ci = f => (f && f.ciB.every(Number.isFinite) ? ` [${f.ciB[0].toFixed(2)}, ${f.ciB[1].toFixed(2)}]` : '');

// Starting ranges per dial, from the current config (leaves: from a little below the current N, never
// below n·t, where the goal becomes impossible).
const DEFAULT_RANGES = {
  'field.N': c => {
    const total = dataTotal(c);
    if (total) { const lo = Math.max(2, c.goal.n * c.goal.t, Math.ceil(total / 2)); return [lo, total, Math.max(1, Math.round((total - lo) / 200))]; }
    const lo = Math.max(10, c.goal.n * c.goal.t, c.field.N - 50);
    return [lo, lo + 200, 1];
  },
  'goal.n': c => [1, Math.max(2, Math.min(40, Math.floor(c.field.N / Math.max(1, c.goal.t)))), 1],
  'goal.t': c => [Math.max(1, Math.round(c.goal.t / 2)), Math.max(2, Math.floor(c.field.N / Math.max(1, c.goal.n))), 1],
  'raker.kMul': () => [1, 3, 0.02],
  'raker.k': () => [10, 40, 0.25],
  'raker.l': () => [0, 5, 0.05],
  'field.grouping': () => [0, 4, 0.05],
  'field.background': () => [0, 0.6, 0.01],
  'field.clumps': () => [2, 40, 1],
};

const niceStep = (span, n) => {
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
};
function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const step = niceStep(hi - lo, n), out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
// A y range on tick boundaries that holds lo..hi; it starts at 0 unless the data sit far above it.
function niceDomain(lo, hi, n = 5) {
  if (!(hi > 0)) return [0, 1];
  let a = lo > 0.35 * hi ? lo : 0;
  const step = niceStep(hi - a, n);
  a = Math.floor(a / step) * step;
  return [a, Math.ceil(hi / step) * step];
}

export class SweepView {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks; // { baseConfig(), makeWorker(onmsg), watch(cfg) }
    this.pool = [];
    this.job = null;
    this.build();
  }

  build() {
    const form = el('div', { class: 'card' });
    form.append(el('h3', { text: 'Sweep setup' }),
      el('p', { class: 'help', text: 'Steps one dial through a range and plays every value to the end, keeping the other dials as they are. "All seeds" shows how the measure responds across many fields and finds the function that describes it; single seeds get a closer look.' }));
    this.dial = el('select');
    for (const d of SWEEP_DIALS) this.dial.append(el('option', { value: d.path, text: d.label }));
    this.measure = el('select');
    for (const m of SWEEP_MEASURES) this.measure.append(el('option', { value: m.id, text: m.unit ? `${m.label} (${m.unit})` : m.label }));
    this.measureHelp = el('span', { class: 'muted', style: 'font-size:12px' });
    this.measure.addEventListener('change', () => {
      const m = sweepMeasure(this.measure.value);
      this.measureHelp.textContent = m.help || '';
      this.boundField.hidden = !m.bound;
    });
    this.from = el('input', { type: 'number', step: 'any' });
    this.to = el('input', { type: 'number', step: 'any' });
    this.step = el('input', { type: 'number', step: 'any', min: 0 });
    this.seeds = el('input', { type: 'text', value: '', placeholder: 'e.g. 1, 2 (optional)' });
    this.avg = el('input', { type: 'number', min: 0, max: 50, step: 1, value: 20 });
    this.algo = el('select');
    for (const a of ALGORITHMS) this.algo.append(el('option', { value: a.id, text: a.name }));
    this.nested = el('input', { type: 'checkbox', checked: true });
    this.bound = el('input', { type: 'checkbox', checked: true });
    this.thr = el('input', { type: 'number', min: 1, max: 100, step: 1, value: 5 });
    this.nestedField = el('label', { class: 'field' }, el('span', { text: 'Keep each field, add leaves' }), el('span', { class: 'switch' }, this.nested, el('span')));
    this.dial.addEventListener('change', () => this.defaults());
    this.runBtn = el('button', { class: 'primary', text: 'Run sweep', onclick: () => (this.job?.running ? this.stop() : this.start()) });
    this.bar = el('i');
    this.status = el('span', { class: 'muted', text: '' });
    form.append(
      el('div', { class: 'bench-form' },
        el('label', { class: 'field' }, el('span', { text: 'Dial to sweep' }), this.dial),
        el('label', { class: 'field' }, el('span', { text: 'Measure' }), this.measure, this.measureHelp),
        el('label', { class: 'field' }, el('span', { text: 'From' }), this.from),
        el('label', { class: 'field' }, el('span', { text: 'To' }), this.to),
        el('label', { class: 'field' }, el('span', { text: 'Step' }), this.step),
        el('label', { class: 'field' }, el('span', { text: 'All seeds: 1 to … (0 = off)' }), this.avg),
        el('label', { class: 'field' }, el('span', { text: 'Single seeds for a closer look (up to 5)' }), this.seeds),
        el('label', { class: 'field' }, el('span', { text: 'Algorithm' }), this.algo),
        el('label', { class: 'field' }, el('span', { text: 'Count a jump at (% change in one step)' }), this.thr),
        this.nestedField,
        (this.boundField = el('label', { class: 'field' }, el('span', { text: 'Lower bound for the single seeds (slower)' }), el('span', { class: 'switch' }, this.bound, el('span')))),
      ),
      el('div', { class: 'btn-row', style: 'align-items:center; margin-top:12px' }, this.runBtn, this.status),
      el('div', { class: 'progress', style: 'margin-top:8px' }, this.bar),
    );
    this.out = el('div', { style: 'display:grid; gap:12px; grid-template-columns:minmax(0, 1fr)' });
    this.root.replaceChildren(form, this.out);
    this.out.append(el('div', { class: 'card' }, el('p', { class: 'help', text: 'Results appear here as they come in. The same sweep runs from the command line: node bench/sweep.mjs --all 20 --seeds 1,2 --from 250 --to 500' })));
  }

  // Called when the tab opens: until a sweep has run, follow the current dials (range, seed, algorithm).
  show() {
    if (this.job) return;
    const cfg = this.hooks.baseConfig();
    this.defaults();
    this.seeds.placeholder = `e.g. ${cfg.seed}, ${cfg.seed + 1} (optional)`;
    this.algo.value = cfg.algo.id;
  }

  defaults() {
    const cfg = this.hooks.baseConfig(), [a, b, s] = (DEFAULT_RANGES[this.dial.value] || (() => [0, 1, 0.1]))(cfg);
    this.from.value = a;
    this.to.value = b;
    this.step.value = s;
    this.nestedField.hidden = this.dial.value !== 'field.N';
  }

  start() {
    const base = this.hooks.baseConfig(), path = this.dial.value;
    if (path === 'field.N' && base.field.model === 'custom') { this.status.textContent = 'Hand-placed and loaded points have a fixed N; pick a generated pattern or a real data set first.'; return; }
    const total = dataTotal(base);
    let values = sweepValues(path, +this.from.value, +this.to.value, +this.step.value, 1000);
    if (path === 'field.N' && total) values = [...new Set(values.map(v => Math.min(v, total)))]; // a data set has no more points
    let seeds = [...new Set(this.seeds.value.split(/[,\s]+/).map(Number).filter(v => Number.isInteger(v) && v >= 1))].slice(0, 5);
    if (values.length < 3) { this.status.textContent = 'The range needs at least 3 values.'; return; }
    let avg = Math.max(0, Math.min(50, Math.round(+this.avg.value || 0)));
    // Hand-placed points, or a data set used whole, are the same field for every seed: comparing seeds
    // would only repeat one run, so the sweep looks at that one field closely instead.
    const fixed = base.field.model === 'custom' || (total && base.field.N >= total && path !== 'field.N');
    if (fixed) { avg = 0; if (!seeds.length) seeds = [base.seed]; }
    if (!seeds.length && avg < 3) { this.status.textContent = 'Choose at least 3 seeds under "All seeds", or list single seeds.'; return; }
    const algoId = this.algo.value;
    const algo = { id: algoId, params: algoId === base.algo.id ? base.algo.params : {} };
    const metric = sweepMeasure(this.measure.value);
    const nested = this.nested.checked, bound = this.bound.checked && !!metric.bound; // bounds exist for work only
    const tasks = [];
    for (const value of values) for (const seed of seeds) tasks.push({ seed, value, opts: { algo, nested, bound } });
    for (let s = 1; s <= avg; s++) if (!seeds.includes(s)) for (const value of values) tasks.push({ seed: s, value, opts: { algo, nested, bound: false } });
    this.stopPool();
    this.job = {
      base, path, values, seeds, avg, algo, nested, bound, metric, rows: new Map(), queue: tasks, total: tasks.length, done: 0,
      running: true, t0: performance.now(), threshold: Math.max(0.001, (+this.thr.value || 5) / 100), dial: sweepDial(path),
    };
    const size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1, tasks.length));
    for (let i = 0; i < size; i++) {
      const job = this.job;
      const w = this.hooks.makeWorker(data => this.onMessage(job, w, data));
      this.pool.push(w);
      this.feed(job, w);
    }
    this.runBtn.textContent = 'Stop';
    this.status.textContent = `${this.job.total} runs on ${size} workers…${fixed ? ' Every seed gives the same field here, so this is one field up close; lower N below the data set\'s size to compare random samples of it.' : ''}`;
    this.job.fixed = fixed;
    this.bar.style.width = '0%';
    this.out.replaceChildren(el('div', { class: 'card' }, el('p', { class: 'help', text: 'Working… single seeds come first, then seeds 1 to S one by one.' })));
  }

  feed(job, w) {
    const t = job.queue.shift();
    if (t) w.postMessage({ type: 'sweep-point', id: 0, base: job.base, path: job.path, ...t });
  }

  onMessage(job, w, data) {
    if (job !== this.job || !job.running) return;
    if (data.type === 'error') {
      this.stop(`Error: ${data.message}`);
      return;
    }
    if (data.type !== 'sweep-row') return;
    data.row.y = job.metric.get(data.row);
    job.rows.set(`${data.row.seed}|${data.row.value}`, data.row);
    job.done++;
    this.bar.style.width = `${(100 * job.done) / job.total}%`;
    this.status.textContent = `${job.done} / ${job.total} runs`;
    if (job.done === job.total) {
      job.running = false;
      this.stopPool();
      this.runBtn.textContent = 'Run sweep';
      this.status.textContent = `${job.total} runs in ${((performance.now() - job.t0) / 1000).toFixed(1)} s${job.fixed ? ' (one fixed field: every seed would give the same points)' : ''}`;
      this.render(true);
      return;
    }
    this.feed(job, w);
    if (!this.renderTimer) this.renderTimer = setTimeout(() => { this.renderTimer = 0; if (this.job === job && job.running) this.render(false); }, 700);
  }

  stopPool() {
    for (const w of this.pool) w.terminate();
    this.pool = [];
  }

  stop(message = 'Stopped.') {
    if (this.job) this.job.running = false;
    this.stopPool();
    this.runBtn.textContent = 'Run sweep';
    this.status.textContent = message;
    if (this.job?.rows.size) this.render(true);
  }

  // ---------- results
  analyse(final) {
    const job = this.job, rows = [...job.rows.values()];
    const bySeed = s => rows.filter(r => r.seed === s);
    const bootstrap = final ? 400 : 0;
    const measure = r => r.y, bounds = !!job.metric.bound;
    const curves = job.seeds.map(s => analyseCurve(bySeed(s), { threshold: job.threshold, bootstrap, measure, bounds })).filter(c => c.points);
    const avgRows = job.avg ? rows.filter(r => r.seed <= job.avg) : [];
    const average = avgRows.length ? averageAnalysis(avgRows, { measure }) : null;
    const comparison = curves.length >= 2 ? compareCurves(curves[0], curves[1], bySeed(curves[0].seed), bySeed(curves[1].seed), { measure, bounds }) : null;
    const regimes = [...new Set(rows.map(r => r.regime).filter(Boolean))].sort();
    // the function search refits every family once per left-out seed, so previews skip that pass
    const shape = job.avg >= 3 ? shapeAnalysis(avgRows, { cv: final, symbol: job.dial.symbol, measure }) : null;
    return { rows, bySeed, curves, average, comparison, regimes, allRows: avgRows, shape };
  }

  render(final) {
    const job = this.job, A = this.analyse(final);
    this.out.replaceChildren();
    if (job.avg >= 3) this.out.append(this.allSeedsCard(A, final));
    if (!A.curves.length) {
      if (job.avg < 3) this.out.append(el('div', { class: 'card' }, el('p', { class: 'help', text: 'No results yet.' })));
      return;
    }
    this.out.append(this.summaryCard(A, final));
    const M = job.metric, title = job.path === 'field.N' ? `${M.label} as leaves are added` : `${M.label} against ${job.dial.label}`;
    this.out.append(el('div', { class: 'card' }, el('h3', { text: title }), this.legend(A), this.workChart(A),
      el('p', { class: 'help', text: `Dots are runs, lines the fitted functions${A.regimes.length > 1 ? ' (one per regime)' : ''}${M.bound ? ', dashes the lower bound (the least work any raker could do on that field)' : ''}. Ticks under the axis are runs that failed. Hover for values; click a dot to watch that run.` })));
    const charts = el('div', { class: 'charts' });
    if (A.rows.some(r => r.bound > 0)) charts.append(this.gapChart(A));
    if (this.kVaries(A)) charts.append(this.reachChart(A));
    if (charts.childElementCount) this.out.append(charts);
    this.out.append(this.jumpsCard(A));
  }

  legend(A) {
    const job = this.job, lg = el('div', { class: 'legend' });
    A.curves.forEach((c, i) => {
      const sw = el('span', { class: 'swatch' });
      sw.style.background = seedVar(job.seeds.indexOf(c.seed));
      lg.append(el('span', {}, sw, `Seed ${c.seed}`));
    });
    if (A.average) lg.append(el('span', {}, el('span', { class: 'swatch band' }), `Middle half of seeds 1–${job.avg}, line = mean`));
    if (A.regimes.length > 1) {
      lg.append(el('span', {}, el('span', { class: 'mark filled' }), A.regimes[0]), el('span', {}, el('span', { class: 'mark hollow' }), A.regimes[1]));
    }
    return lg;
  }

  summaryCard(A, final) {
    const job = this.job, x = job.dial.symbol, mid = A.curves[0].mid;
    const midText = job.dial.int ? Math.round(mid) : fmt(mid);
    const M = job.metric, unitSuffix = M.unit ? ` (${M.unit})` : '';
    const slopeHead = job.path === 'field.N' ? `Extra ${M.noun} per added leaf at N = ${midText}` : `Slope at ${x} = ${midText}`;
    const tbl = el('table', { class: 'results fits' });
    tbl.append(el('thead', {}, el('tr', {}, ...['Seed', 'Curve', `${x} range`, 'Runs', `${M.label}${unitSuffix} ≈`, 'Exponent b [95%]', 'R²', slopeHead, M.bound ? 'Work ÷ bound' : null].filter(Boolean).map(h => el('th', { text: h })))));
    const body = el('tbody');
    const row = (seedCell, curve, range, points, f, gap, cls = '') => body.append(el('tr', { class: cls },
      el('td', {}, seedCell), el('td', { text: curve }), el('td', { text: range ? `${fmtV(job, range[0])}–${fmtV(job, range[1])}` : '—' }), el('td', { text: String(points) }),
      el('td', { class: 'mono', text: powerText(f, x) }), el('td', { text: f ? `${exp(f)}${ci(f)}` : '—' }), el('td', { text: f ? f.r2.toFixed(2) : '—' }),
      el('td', { text: f ? fmt(powerSlope(f, mid)) : '—' }), M.bound ? el('td', { text: gap ? gap.toFixed(2) : '—' }) : null));
    for (const c of A.curves) {
      const sw = el('span', { class: 'swatch' });
      sw.style.background = seedVar(job.seeds.indexOf(c.seed));
      const seedCell = el('span', {}, sw, ` ${c.seed}`);
      if (c.boundFit) row(seedCell.cloneNode(true), 'lower bound', c.range, c.finished, c.boundFit, 1, 'sub');
      for (const g of c.regimes) if (g.fit) row(seedCell.cloneNode(true), `${M.noun}: ${g.regime}`, g.range, g.points, g.fit, g.gap);
      row(seedCell, c.regimes.filter(g => g.fit).length > 1 ? `${M.noun}: all runs (one curve)` : M.noun, c.range, c.finished, c.fit, c.gap, c.regimes.filter(g => g.fit).length > 1 ? 'sub' : '');
    }
    tbl.append(body);
    const notes = el('ul', { class: 'notes' });
    for (const c of A.curves) {
      const big = c.jumps[0];
      const parts = [`Seed ${c.seed}: a step of ${fmtV(job, job.values[1] - job.values[0])} usually changes ${M.noun} by ${pct(c.typicalStep).replace('+', '')}`];
      parts.push(c.jumps.length ? `but ${c.jumps.length} step${c.jumps.length === 1 ? '' : 's'} changed it by ${Math.round(job.threshold * 100)}% or more (largest ${pct(big.rel)} at ${x} ${fmtV(job, big.from)} → ${fmtV(job, big.to)}: ${big.causes.map(k => k.text).join('; ')})` : `and no step changed it by ${Math.round(job.threshold * 100)}% or more`);
      let s = parts.join(', ') + '.';
      if (c.switches.length) s += ` Regime switches at ${x} = ${c.switches.slice(0, 8).map(w => fmtV(job, w.at)).join(', ')}${c.switches.length > 8 ? ', …' : ''}.`;
      if (c.failures.length) s += ` ${c.points - c.finished} run${c.points - c.finished === 1 ? '' : 's'} failed (${c.failures.slice(0, 4).map(f => (f.from === f.to ? fmtV(job, f.from) : `${fmtV(job, f.from)}–${fmtV(job, f.to)}`)).join(', ')}${c.failures.length > 4 ? ', …' : ''}).`;
      notes.append(el('li', { text: s }));
    }
    const C = A.comparison;
    if (C) {
      const [a, b] = A.curves;
      let s = `Seed ${a.seed} against seed ${b.seed}: point by point, seed ${a.seed}'s ${M.noun} is ${C.ratioMedian.toFixed(2)}× seed ${b.seed}'s (median over ${C.shared} values; range ${C.ratioRange[0].toFixed(2)}–${C.ratioRange[1].toFixed(2)}).`;
      if (Number.isFinite(C.boundRatioMedian)) {
        const field = C.boundRatioMedian, play = C.ratioMedian / field;
        s += ` Their lower bounds stand at ${field.toFixed(2)}× (exponents ${exp(a.boundFit)} and ${exp(b.boundFit)}), so `;
        s += Math.abs(play - 1) < 0.05
          ? 'the difference in work is the difference between the fields; the algorithm plays both about equally well.'
          : `the field accounts for ${field.toFixed(2)}× and the algorithm's play for the remaining ${play.toFixed(2)}×.`;
      }
      const shared = a.regimes.filter(g => g.fit && b.regimes.some(h => h.fit && h.regime === g.regime));
      for (const g of shared) {
        const h = b.regimes.find(q => q.regime === g.regime);
        const differ = [g.fit.ciB, h.fit.ciB].flat().every(Number.isFinite) ? (g.fit.ciB[1] < h.fit.ciB[0] || h.fit.ciB[1] < g.fit.ciB[0] ? 'different growth' : 'growth not distinguishable') : '';
        s += ` In the ${g.regime} regime the exponents are ${exp(g.fit)} and ${exp(h.fit)}${differ ? ` (${differ})` : ''}.`;
      }
      notes.append(el('li', { text: s }));
    }
    const help = `Each function is a power law, ${M.noun} ≈ a·${x}^b, fitted to finished runs by least squares on log ${M.noun}. With b = 1 every step adds the same amount; b > 1 means each step costs more than the last. The interval for b allows for runs of neighbouring values that share a plan.${final ? '' : ' (Intervals appear when the sweep finishes.)'}`;
    const dl = () => {
      const head = ['seed', 'value', 'N', 'n', 't', 'spare', 'M', 'k', 'l', 'status', 'reason', 'work', 'bound', 'time', 'computeMs', 'strokes', 'walkDist', 'rakeDist', 'captures', 'regime', 'plan'];
      const csv = [head.join(','), ...A.rows.sort((p, q) => p.seed - q.seed || p.value - q.value).map(r => head.map(h => r[h] ?? '').join(','))].join('\n');
      const a = el('a', { download: `rake-sweep-${job.path}.csv`, href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })) });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    return el('div', { class: 'card' },
      el('h3', { text: `Single seeds: fitted functions for ${M.noun}` }),
      el('p', { class: 'help', text: help }),
      el('div', { style: 'overflow:auto' }, tbl),
      notes,
      el('div', { class: 'btn-row' }, el('button', { class: 'ghost', text: 'Download CSV', onclick: dl })),
    );
  }

  // ---------- charts
  frame(W, H, M, xDom, yDom, yLabel) {
    const [L, R, T, B] = M, job = this.job;
    const x = v => L + ((v - xDom[0]) / Math.max(1e-12, xDom[1] - xDom[0])) * (W - L - R);
    const y = v => T + (1 - (v - yDom[0]) / Math.max(1e-12, yDom[1] - yDom[0])) * (H - T - B);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${yLabel} against ${job.dial.label}` });
    for (const v of niceTicks(yDom[0], yDom[1], 5)) {
      root.append(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === yDom[0] ? 'axis' : 'gridline' }));
      root.append(text({ x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, tick(v)));
    }
    for (const v of niceTicks(xDom[0], xDom[1], 6)) root.append(text({ x: x(v), y: H - B + 16, 'text-anchor': 'middle' }, tick(v)));
    root.append(svg('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'axis' }));
    root.append(text({ x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, job.dial.label));
    root.append(text({ x: L, y: T - 4, 'text-anchor': 'start' }, yLabel));
    return { root, x, y, L, R, T, B, W, H };
  }

  // Dots for one seed's finished runs; a hollow dot marks the second regime.
  dots(fr, rows, color, A, val) {
    const g = svg('g'), rad = this.job.values.length > 150 ? 2.6 : 3.2;
    for (const r of rows) {
      const v = val(r);
      if (!(r.status === 'success' && Number.isFinite(v))) continue;
      const hollow = A.regimes.length > 1 && r.regime === A.regimes[1];
      g.append(svg('circle', { cx: fr.x(r.value), cy: fr.y(v), r: rad, fill: hollow ? 'var(--surface)' : color, stroke: hollow ? color : 'var(--surface)', 'stroke-width': hollow ? 1.6 : 1 }));
    }
    return g;
  }

  curvePath(fr, f, lo, hi) {
    let d = '';
    for (let i = 0; i <= 64; i++) {
      const v = lo + ((hi - lo) * i) / 64;
      d += `${i ? 'L' : 'M'} ${fr.x(v).toFixed(1)} ${fr.y(powerAt(f, v)).toFixed(1)} `;
    }
    return d;
  }

  workChart(A) {
    const job = this.job, xDom = [job.values[0], job.values[job.values.length - 1]];
    let top = 0, low = Infinity;
    for (const c of A.curves) {
      for (const r of A.bySeed(c.seed)) {
        if (r.status !== 'success') continue;
        top = Math.max(top, r.y, r.bound || 0);
        low = Math.min(low, r.y, r.bound > 0 ? r.bound : Infinity);
      }
    }
    if (A.average) for (const p of A.average.curve) { top = Math.max(top, p.q3); low = Math.min(low, p.q1); }
    const M = job.metric, fr = this.frame(760, 380, [62, 76, 22, 40], xDom, niceDomain(low, top), M.unit ? `${M.noun} (${M.unit})` : M.noun);
    const { root, x, y } = fr;
    if (A.average) {
      const pts = A.average.curve;
      let band = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p.value).toFixed(1)} ${y(p.q3).toFixed(1)}`).join(' ');
      band += ' ' + [...pts].reverse().map(p => `L ${x(p.value).toFixed(1)} ${y(p.q1).toFixed(1)}`).join(' ') + ' Z';
      root.append(svg('path', { d: band, class: 'band' }));
      root.append(svg('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p.value).toFixed(1)} ${y(p.mean).toFixed(1)}`).join(' '), fill: 'none', stroke: 'var(--muted)', 'stroke-width': 1.5 }));
    }
    const ends = [];
    for (const c of A.curves) {
      const color = seedVar(job.seeds.indexOf(c.seed)), rows = A.bySeed(c.seed).sort((p, q) => p.value - q.value);
      const bounded = rows.filter(r => r.bound > 0);
      if (bounded.length > 1) root.append(svg('path', { d: bounded.map((r, i) => `${i ? 'L' : 'M'} ${x(r.value).toFixed(1)} ${y(r.bound).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4', opacity: 0.8 }));
      root.append(this.dots(fr, rows, color, A, r => r.y));
      const byRegime = c.regimes.filter(g => g.fit).length > 1;
      const fits = byRegime ? c.regimes.filter(g => g.fit).map(g => [g.fit, g.range, g.regime]) : c.fit ? [[c.fit, c.range, null]] : [];
      for (const [f, rg] of fits) root.append(svg('path', { d: this.curvePath(fr, f, rg[0], rg[1]), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      for (const r of rows) if (r.status !== 'success') root.append(svg('line', { x1: x(r.value), x2: x(r.value), y1: fr.H - fr.B + 2, y2: fr.H - fr.B + 7, stroke: color, 'stroke-width': 1.5 }));
      // label the seed at its last finished run, on the curve that run belongs to
      const last = [...rows].reverse().find(r => r.status === 'success');
      const own = last && fits.find(([, , regime]) => !byRegime || regime === last.regime);
      if (last) ends.push({ seed: c.seed, yv: y(own ? powerAt(own[0], last.value) : last.y), xv: x(last.value) });
    }
    ends.sort((p, q) => p.yv - q.yv);
    for (let i = 1; i < ends.length; i++) if (ends[i].yv - ends[i - 1].yv < 14) ends[i].yv = ends[i - 1].yv + 14;
    for (const e of ends) root.append(text({ x: e.xv + 8, y: e.yv + 4, class: 'label' }, `Seed ${e.seed}`));
    return this.interactive(fr, A, r => r.y, M.noun);
  }

  gapChart(A) {
    const job = this.job, xDom = [job.values[0], job.values[job.values.length - 1]];
    let top = 1;
    for (const c of A.curves) for (const r of A.bySeed(c.seed)) if (r.status === 'success' && r.bound > 0) top = Math.max(top, r.work / r.bound);
    const fr = this.frame(520, 280, [44, 16, 28, 40], xDom, [0.9, niceDomain(1, top, 4)[1]], 'work ÷ lower bound (dotted line: 1, the bound itself)');
    fr.root.append(svg('line', { x1: fr.L, x2: fr.W - fr.R, y1: fr.y(1), y2: fr.y(1), stroke: 'var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
    for (const c of A.curves) fr.root.append(this.dots(fr, A.bySeed(c.seed), seedVar(job.seeds.indexOf(c.seed)), A, r => (r.bound > 0 ? r.work / r.bound : NaN)));
    return el('div', { class: 'card' }, el('h3', { text: 'Work ÷ lower bound' }), this.interactive(fr, A, r => (r.bound > 0 ? r.work / r.bound : NaN), 'work ÷ bound'),
      el('p', { class: 'help', text: 'How far each run is from the least work possible on its field. Flat stretches are one plan; a jump between levels is the algorithm changing its plan.' }));
  }

  kVaries(A) {
    return A.curves.some(c => { const ks = A.bySeed(c.seed).map(r => r.k); return Math.max(...ks) > Math.min(...ks) * 1.01; });
  }

  reachChart(A) {
    const job = this.job, xDom = [job.values[0], job.values[job.values.length - 1]];
    let top = 0;
    for (const c of A.curves) for (const r of A.bySeed(c.seed)) top = Math.max(top, r.k);
    const fr = this.frame(520, 280, [44, 16, 28, 40], xDom, niceDomain(0, top * 1.05, 4), 'reach k');
    for (const c of A.curves) {
      const rows = A.bySeed(c.seed).sort((p, q) => p.value - q.value);
      let d = '';
      rows.forEach((r, i) => { d += i ? ` H ${fr.x(r.value).toFixed(1)} V ${fr.y(r.k).toFixed(1)}` : `M ${fr.x(r.value).toFixed(1)} ${fr.y(r.k).toFixed(1)}`; });
      fr.root.append(svg('path', { d, fill: 'none', stroke: seedVar(job.seeds.indexOf(c.seed)), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    }
    return el('div', { class: 'card' }, el('h3', { text: 'Reach k' }), this.interactive(fr, A, r => r.k, 'k'),
      el('p', { class: 'help', text: 'k is set as a multiple of M, the field\'s widest unavoidable gap. A new leaf that bridges or opens a gap moves M, and with it the reach.' }));
  }

  shareChart(A) {
    const job = this.job, xDom = [job.values[0], job.values[job.values.length - 1]], name = A.regimes[0];
    const fr = this.frame(520, 280, [44, 16, 28, 40], xDom, [0, 100], `% of finished runs: ${name}`);
    const pts = A.average.curve;
    fr.root.append(svg('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'} ${fr.x(p.value).toFixed(1)} ${fr.y(100 * (p.shares[name] || 0)).toFixed(1)}`).join(' '), fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 1.5 }));
    return el('div', { class: 'card' }, el('h3', { text: `Share of runs that are ${name}, seeds 1–${job.avg}` }), this.interactive(fr, A, null, null),
      el('p', { class: 'help', text: `Why the average curve can be flatter than any single regime: as ${job.path === 'field.N' ? 'the leaf count' : job.dial.label} grows, the mix of seeds in each regime shifts.` }));
  }

  // Crosshair, tooltip with every seed's value at the nearest sweep value, and click-to-watch.
  interactive(fr, A, val, label) {
    const job = this.job, { root, x } = fr, showK = this.kVaries(A);
    const cross = svg('line', { y1: fr.T, y2: fr.H - fr.B, class: 'axis', visibility: 'hidden' });
    const hit = svg('rect', { x: fr.L, y: fr.T, width: fr.W - fr.L - fr.R, height: fr.H - fr.T - fr.B, fill: 'transparent', style: 'cursor:crosshair' });
    root.append(cross, hit);
    const tip = el('div', { class: 'tooltip', hidden: true });
    const wrap = el('div', { class: 'chart', style: 'position:relative' }, root, tip);
    const nearest = px => {
      let best = job.values[0];
      for (const v of job.values) if (Math.abs(x(v) - px) < Math.abs(x(best) - px)) best = v;
      return best;
    };
    const toLocal = e => {
      const box = root.getBoundingClientRect();
      return { box, px: ((e.clientX - box.left) / box.width) * fr.W, py: ((e.clientY - box.top) / box.height) * fr.H };
    };
    hit.addEventListener('pointermove', e => {
      const { box, px } = toLocal(e), v = nearest(px);
      cross.setAttribute('x1', x(v));
      cross.setAttribute('x2', x(v));
      cross.setAttribute('visibility', 'visible');
      let html = `<b>${job.dial.label} = ${fmtV(job, v)}</b>`;
      for (const c of A.curves) {
        const r = job.rows.get(`${c.seed}|${v}`);
        if (!r) continue;
        const sw = `<span class="swatch" style="background:${seedVar(job.seeds.indexOf(c.seed))}"></span>`;
        if (r.status !== 'success') html += `<br>${sw} Seed ${c.seed}: failed (${reasonLabel(r.reason)})`;
        else html += `<br>${sw} Seed ${c.seed}: ${job.metric.noun} ${fmt(r.y)}${r.bound ? ` (${(r.work / r.bound).toFixed(2)}× bound)` : ''}${r.regime ? `, ${r.regime}` : ''}${label === 'k' || !showK ? '' : `, k ${fmt(r.k)}`}${label === 'k' ? `, k ${fmt(r.k)} (M ${fmt(r.M)})` : ''}`;
      }
      const p = A.average?.curve.find(q => q.value === v);
      if (p) html += `<br>Seeds 1–${job.avg}: mean ${fmt(p.mean)}, middle half ${fmt(p.q1)}–${fmt(p.q3)}${A.regimes.length > 1 ? `, ${Math.round(100 * (p.shares[A.regimes[0]] || 0))}% ${A.regimes[0]}` : ''}`;
      tip.innerHTML = html;
      tip.hidden = false;
      tip.style.left = `${Math.min(e.clientX - box.left + 14, box.width - 270)}px`;
      tip.style.top = `${e.clientY - box.top + 14}px`;
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
    if (val) {
      hit.addEventListener('click', e => {
        const { px, py } = toLocal(e);
        let best = null, bd = 22;
        for (const c of A.curves) {
          for (const r of A.bySeed(c.seed)) {
            const v = val(r);
            if (!Number.isFinite(v) || r.status !== 'success') continue;
            const d = Math.hypot(x(r.value) - px, fr.y(v) - py);
            if (d < bd) { bd = d; best = r; }
          }
        }
        if (best) this.watch(best);
      });
    }
    return wrap;
  }

  watch(r) {
    const job = this.job, cfg = sweepConfig(job.base, job.path, r.value, { nested: job.nested });
    cfg.seed = r.seed;
    cfg.algo = structuredClone(job.algo);
    this.hooks.watch(cfg);
  }

  // ---------- all seeds
  allSeedsCard(A, final) {
    const job = this.job, S = A.shape, sym = job.dial.symbol;
    const done = new Set(A.allRows.map(r => r.seed)).size;
    const M = job.metric, card = el('div', { class: 'card' }, el('h3', { text: `All seeds 1–${job.avg}: how ${M.noun} responds to ${job.dial.label}` }));
    if (!S) {
      card.append(el('p', { class: 'help', text: `The fit starts once 3 seeds have 4 finished values (${done} seed${done === 1 ? '' : 's'} so far).` }));
      return card;
    }
    const best = S.families.find(f => f.id === S.best), simple = S.families.find(f => f.id === S.simplest);
    const at = job.dial.int ? Math.round(S.xref) : fmt(S.xref);
    const notes = el('ul', { class: 'notes' });
    const errOf = f => (Number.isFinite(f.cv) ? `${(100 * (Math.exp(f.cv) - 1)).toFixed(1)}%` : null);
    const err = errOf(best) ? ` and is typically within ${errOf(best)} of a seed left out of the fit` : '';
    const unit = M.unit ? ` ${M.unit}` : '';
    notes.append(el('li', {}, el('b', { text: `Best fit: ${best.name.toLowerCase()}, ${M.noun} ≈ ${best.formula}${unit}` }), ` for a typical seed. Fitted with each seed at its own level, it explains ${(100 * best.r2).toFixed(0)}% of how ${M.noun} changes within a seed${err}.`));
    if (simple.id !== best.id) {
      notes.append(el('li', {}, el('b', { text: `Simplest that is about as good: ${simple.name.toLowerCase()}, ${M.noun} ≈ ${simple.formula}${unit}` }),
        `${errOf(simple) ? ` (typically within ${errOf(simple)})` : ''}. It predicts ${pct(simple.change)} over the range, against ${pct(best.change)} for the best fit${Math.abs(simple.change - best.change) > 0.05 ? ', so the extra parameters matter here' : ''}.`));
    }
    if (S.change) notes.append(el('li', { text: `Over ${sym} ≈ ${fmtV(job, S.range[0])} to ${fmtV(job, S.range[1])}, ${M.noun} changes by ${pct(S.change.median)} for the median seed (10–90% of seeds: ${pct(S.change.q10)} to ${pct(S.change.q90)}).` }));
    const per = job.path === 'field.N' ? 'added leaf' : `unit of ${sym}`;
    const e = best.elasticity, se = S.seedElasticity;
    notes.append(el('li', { text: `At ${sym} = ${at}: a 1% larger ${sym} means ${Math.abs(e).toFixed(2)}% ${e >= 0 ? 'more' : 'less'} ${M.noun}${se ? ` (fitted seed by seed, elasticity ${se.q10.toFixed(2)} to ${se.q90.toFixed(2)})` : ''}, about ${fmt(Math.abs(best.slope))}${unit} ${best.slope >= 0 ? 'more' : 'less'} per ${per}.` }));
    notes.append(el('li', { text: `Seeds differ in overall level by ±${Math.round(100 * S.levelSpread)}%; around its own curve a typical seed wiggles ±${(100 * (Math.exp(S.wiggle) - 1)).toFixed(1)}%.${final ? '' : ' (Preview: the cross-validated comparison runs when the sweep finishes.)'}` }));
    this.allMode ??= 'actual';
    const box = el('div');
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Chart scale', style: 'max-width:420px; margin:6px 0 4px' });
    const modes = [['actual', `Actual ${M.noun}`], ['lined', 'Seeds scaled to one level']];
    const draw = () => {
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.mode === this.allMode));
      box.replaceChildren(this.allSeedsChart(A, this.allMode));
    };
    for (const [m, label] of modes) {
      const b = el('button', { type: 'button', text: label, onclick: () => { this.allMode = m; draw(); } });
      b.dataset.mode = m;
      seg.append(b);
    }
    draw();
    const legend = el('div', { class: 'legend' },
      el('span', {}, el('span', { class: 'line-key seed' }), `one line per seed (${S.seeds})`),
      el('span', {}, el('span', { class: 'swatch band' }), '10–90% of seeds'),
      el('span', {}, el('span', { class: 'line-key fit' }), `best fit: ${best.name.toLowerCase()}`),
      simple.id !== best.id ? el('span', {}, el('span', { class: 'line-key simple' }), `simplest: ${simple.name.toLowerCase()}`) : null);
    card.append(notes, seg, legend, box,
      el('p', { class: 'help', text: 'Scaling each seed to the typical level removes the differences between fields and leaves the shared shape plus each seed\'s own wiggles. Hover a line to pick out its seed; click to watch that run.' }));
    const grid = el('div', { class: 'charts' });
    const strip = this.changeStrip(A);
    if (strip) grid.append(strip);
    if (A.average && A.regimes.length > 1) grid.append(this.shareChart(A));
    if (grid.childElementCount) card.append(grid);
    card.append(this.modelTable(A, final));
    return card;
  }

  // Every seed's curve as a thin line, the 10–90% band across seeds, the best fit in bold and the
  // simplest adequate fit (when it differs) dotted.
  allSeedsChart(A, mode) {
    const job = this.job, S = A.shape, fam = S.families.find(f => f.id === S.best), simple = S.families.find(f => f.id === S.simplest);
    const levelOf = new Map(S.seedLevels.map(l => [l.seed, l.level]));
    const yOf = r => (mode === 'lined' && levelOf.has(r.seed) ? (r.y / levelOf.get(r.seed)) * fam.level : r.y);
    const bySeed = new Map(), byValue = new Map();
    for (const r of A.allRows) {
      if (!bySeed.has(r.seed)) bySeed.set(r.seed, []);
      bySeed.get(r.seed).push(r);
      if (r.status !== 'success') continue;
      if (!byValue.has(r.value)) byValue.set(r.value, []);
      byValue.get(r.value).push(yOf(r));
    }
    let lo = Infinity, hi = 0;
    for (const ys of byValue.values()) for (const v of ys) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const xDom = [job.values[0], job.values[job.values.length - 1]];
    const M = job.metric, yl = M.unit ? `${M.noun} (${M.unit})` : M.noun;
    const fr = this.frame(760, 380, [62, 24, 22, 40], xDom, niceDomain(lo, hi), mode === 'lined' ? `${yl}, each seed scaled to the typical level` : yl);
    const { root, x, y } = fr;
    const band = [...byValue.entries()].filter(([, ys]) => ys.length >= 3).sort((p, q) => p[0] - q[0])
      .map(([v, ys]) => ({ v, lo: quantile(ys, 0.1), hi: quantile(ys, 0.9) }));
    if (band.length > 1) {
      const d = band.map((p, i) => `${i ? 'L' : 'M'} ${x(p.v).toFixed(1)} ${y(p.hi).toFixed(1)}`).join(' ')
        + ' ' + [...band].reverse().map(p => `L ${x(p.v).toFixed(1)} ${y(p.lo).toFixed(1)}`).join(' ') + ' Z';
      root.append(svg('path', { d, class: 'band' }));
    }
    const lines = new Map(), layer = svg('g');
    for (const [seed, rs] of bySeed) {
      rs.sort((p, q) => p.value - q.value);
      let d = '', pen = false;
      for (const r of rs) {
        if (r.status !== 'success') { pen = false; continue; }
        d += `${pen ? 'L' : 'M'} ${x(r.value).toFixed(1)} ${y(yOf(r)).toFixed(1)} `;
        pen = true;
      }
      const p = svg('path', { d, class: 'seed-line' });
      layer.append(p);
      lines.set(seed, p);
    }
    root.append(layer);
    const curve = f => {
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const v = xDom[0] + ((xDom[1] - xDom[0]) * i) / 120;
        d += `${i ? 'L' : 'M'} ${x(v).toFixed(1)} ${y(shapeValue(f, v)).toFixed(1)} `;
      }
      return d;
    };
    if (simple.id !== fam.id) root.append(svg('path', { d: curve(simple), class: 'fit-line simple' }));
    root.append(svg('path', { d: curve(fam), class: 'fit-line' }));
    // hover: the seed whose line passes closest to the pointer at the nearest value
    const hit = svg('rect', { x: fr.L, y: fr.T, width: fr.W - fr.L - fr.R, height: fr.H - fr.T - fr.B, fill: 'transparent', style: 'cursor:pointer' });
    root.append(hit);
    const tip = el('div', { class: 'tooltip', hidden: true });
    const wrap = el('div', { class: 'chart', style: 'position:relative' }, root, tip);
    let on = null;
    const pick = e => {
      const box = root.getBoundingClientRect(), px = ((e.clientX - box.left) / box.width) * fr.W, py = ((e.clientY - box.top) / box.height) * fr.H;
      let v = job.values[0];
      for (const q of job.values) if (Math.abs(x(q) - px) < Math.abs(x(v) - px)) v = q;
      let best = null, bd = Infinity;
      for (const seed of bySeed.keys()) {
        const r = job.rows.get(`${seed}|${v}`);
        if (!r || r.status !== 'success') continue;
        const dist = Math.abs(y(yOf(r)) - py);
        if (dist < bd) { bd = dist; best = r; }
      }
      return { box, best, v };
    };
    hit.addEventListener('pointermove', e => {
      const { box, best, v } = pick(e);
      if (on && (!best || on !== lines.get(best.seed))) on.classList.remove('on');
      if (!best) { tip.hidden = true; return; }
      on = lines.get(best.seed);
      on.classList.add('on');
      layer.append(on); // draw the highlighted seed on top
      const fitted = mode === 'lined' ? shapeValue(fam, v) : shapeValue(fam, v) * (levelOf.get(best.seed) || fam.level) / fam.level;
      tip.innerHTML = `<b>Seed ${best.seed}</b>, ${job.dial.label} = ${fmtV(job, v)}<br>${M.noun} ${fmt(best.y)}${mode === 'lined' ? ` (scaled ${fmt(yOf(best))})` : ''}<br>fitted ${fmt(fitted)}${levelOf.has(best.seed) ? ` · this seed's level ${(levelOf.get(best.seed) / fam.level).toFixed(2)}× typical` : ''}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(e.clientX - box.left + 14, box.width - 270)}px`;
      tip.style.top = `${e.clientY - box.top + 14}px`;
    });
    hit.addEventListener('pointerleave', () => { if (on) on.classList.remove('on'); on = null; tip.hidden = true; });
    hit.addEventListener('click', e => { const { best } = pick(e); if (best) this.watch(best); });
    return wrap;
  }

  // One dot per seed: how much its measure changed from the start to the end of the range.
  changeStrip(A) {
    const ch = A.shape.change, job = this.job;
    if (!ch) return null;
    const vals = ch.perSeed.map(p => 100 * p.change);
    const W = 520, H = 150, L = 20, R = 20, T = 20, B = 40;
    // always show 0 (no change) for reference
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), st = niceStep(Math.max(1e-9, hi - lo), 5);
    const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
    const x = v => L + ((v - a) / Math.max(1e-9, b - a)) * (W - L - R);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Change in ${job.metric.noun} over the range, one dot per seed` });
    for (const v of niceTicks(a, b, 6)) {
      root.append(svg('line', { x1: x(v), x2: x(v), y1: T, y2: H - B, class: v === 0 ? 'axis' : 'gridline' }));
      root.append(text({ x: x(v), y: H - B + 16, 'text-anchor': 'middle' }, `${v > 0 ? '+' : ''}${tick(v)}%`));
    }
    root.append(text({ x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, `change in ${job.metric.noun} from ${job.dial.symbol} ≈ ${fmtV(job, A.shape.range[0])} to ${fmtV(job, A.shape.range[1])}`));
    const mid = (T + H - B) / 2;
    root.append(svg('line', { x1: x(100 * ch.q10), x2: x(100 * ch.q90), y1: mid, y2: mid, stroke: 'var(--ink-2)', 'stroke-width': 1.5 }));
    root.append(svg('line', { x1: x(100 * ch.median), x2: x(100 * ch.median), y1: T + 4, y2: H - B - 4, stroke: 'var(--ink)', 'stroke-width': 2 }));
    ch.perSeed.forEach((p, i) => {
      const c = svg('circle', { cx: x(100 * p.change), cy: mid + ((i % 7) - 3) * 6, r: 4, fill: 'var(--ink-2)', 'fill-opacity': 0.75, stroke: 'var(--surface)', 'stroke-width': 1 });
      c.append(svg('title', {}, document.createTextNode(`Seed ${p.seed}: ${pct(p.change)}`)));
      root.append(c);
    });
    return el('div', { class: 'card' }, el('h3', { text: 'How much each seed changes' }), el('div', { class: 'chart' }, root),
      el('p', { class: 'help', text: `One dot per seed, comparing its ${job.metric.noun} over the first and last tenth of the range. The bar is the median, the line spans 10–90% of seeds.` }));
  }

  // Every candidate function, best first.
  modelTable(A, final) {
    const S = A.shape, sym = this.job.dial.symbol;
    const tbl = el('table', { class: 'results fits' });
    const M = this.job.metric;
    tbl.append(el('thead', {}, el('tr', {}, ...['Function', `Typical seed: ${M.noun}${M.unit ? ` (${M.unit})` : ''} ≈`, 'Parameters', 'Explains', 'Error on a new seed', 'ΔAIC', 'Change over range', 'Elasticity'].map(h => el('th', { text: h })))));
    const body = el('tbody');
    const score = f => (Number.isFinite(f.cv) ? f.cv : f.dAic);
    for (const f of S.families.filter(q => q.applicable).sort((p, q) => score(p) - score(q))) {
      const tag = [f.id === S.best ? 'best fit' : '', f.id === S.simplest ? 'simplest about as good' : ''].filter(Boolean).join(', ');
      body.append(el('tr', { class: f.id === S.best || f.id === S.simplest ? 'best' : '' },
        el('td', { text: tag ? `${f.name} · ${tag}` : f.name }),
        el('td', { class: 'mono', text: f.formula }),
        el('td', { text: String(f.k) }),
        el('td', { text: `${(100 * f.r2).toFixed(1)}%` }),
        el('td', { text: Number.isFinite(f.cv) ? `${(100 * (Math.exp(f.cv) - 1)).toFixed(2)}% ± ${(100 * f.cvSe).toFixed(2)}` : '—' }),
        el('td', { text: f.dAic.toFixed(1) }),
        el('td', { text: pct(f.change) }),
        el('td', { text: f.elasticity.toFixed(2) }),
      ));
    }
    tbl.append(body);
    const skipped = S.families.filter(f => !f.applicable).map(f => f.name.toLowerCase());
    return el('div', {},
      el('h3', { text: 'Which function fits best', style: 'margin-top:14px' }),
      el('p', { class: 'help', text: `Each candidate is fitted to every seed at once, with each seed at its own level, on log ${M.noun} (so errors are relative). "Explains" is the share of each seed's own variation the shape accounts for. "Error on a new seed" leaves one seed out, fits the shape to the rest, then fits only that seed's level, averaged over all seeds (± one standard error). The best fit has the lowest error; the simplest function within one standard error of it is listed too. Elasticity is the % change in ${M.noun} for a 1% larger ${sym}, at ${sym} = ${this.job.dial.int ? Math.round(S.xref) : fmt(S.xref)}.${final ? '' : ' Errors appear when the sweep finishes.'}${skipped.length ? ` Not tried here, because the range includes 0: ${skipped.join(', ')}.` : ''}` }),
      el('div', { style: 'overflow:auto' }, tbl));
  }

  jumpsCard(A) {
    const job = this.job, card = el('div', { class: 'card' }, el('h3', { text: `Biggest one-step jumps (${Math.round(job.threshold * 100)}% or more)` }));
    card.append(el('p', { class: 'help', text: 'What changed between the two runs: the plan (planned-sites built one or fell back to the tree peel), where the piles ended up, the reach (when k follows M), or a redrawn field.' }));
    const grid = el('div', { class: 'jump-grid' });
    for (const c of A.curves) {
      const sw = el('span', { class: 'swatch' });
      sw.style.background = seedVar(job.seeds.indexOf(c.seed));
      const tbl = el('table', { class: 'results' });
      tbl.append(el('thead', {}, el('tr', {}, ...['Step', 'Work', 'Change', 'What changed', ''].map(h => el('th', { text: h })))));
      const body = el('tbody');
      for (const j of c.jumps.slice(0, 10)) {
        const rFrom = job.rows.get(`${c.seed}|${j.from}`), rTo = job.rows.get(`${c.seed}|${j.to}`);
        body.append(el('tr', {},
          el('td', { text: `${fmtV(job, j.from)} → ${fmtV(job, j.to)}` }),
          el('td', { text: `${fmt(j.w0)} → ${fmt(j.w1)}` }),
          el('td', { text: pct(j.rel) }),
          el('td', { class: 'wrap', text: j.causes.map(k => k.text).join('; ') }),
          el('td', {}, el('button', { class: 'ghost', text: 'Before', onclick: () => this.watch(rFrom) }), ' ', el('button', { class: 'ghost', text: 'After', onclick: () => this.watch(rTo) })),
        ));
      }
      if (!c.jumps.length) body.append(el('tr', {}, el('td', { colspan: 5, class: 'fail', text: 'No jumps this large.' })));
      tbl.append(body);
      const counts = Object.entries(c.causeCounts).map(([k, v]) => `${k} ${v}`).join(' · ');
      grid.append(el('div', {}, el('div', { class: 'cell-title' }, sw, ` Seed ${c.seed}`), el('div', { class: 'cell-sub', text: `${c.jumps.length} jumps${counts ? `; causes: ${counts}` : ''}` }), el('div', { style: 'overflow:auto' }, tbl)));
    }
    card.append(grid);
    return card;
  }
}

const fmtV = (job, v) => (job.dial.int ? String(Math.round(v)) : fmt(v));
