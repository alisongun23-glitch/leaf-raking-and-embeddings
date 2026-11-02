import { ALGORITHMS } from '../algos/registry.js';
import { toCsv } from '../analysis/benchreport.js';
import { SWEEPABLE } from './schema.js';
import { el } from './dials.js';
import { fmt, fmtTime } from './render.js';
import { reasonLabel } from './panels.js';

// The Benchmark tab: run every chosen algorithm on the same seeded instances (taken from the current
// dials, optionally sweeping one or two of them), then show paired results, a performance profile and
// work-vs-strokes small multiples. Colour follows the algorithm (fixed slot per algorithm).

const slot = id => ALGORITHMS.findIndex(a => a.id === id) + 1;
const seriesVar = id => `var(--series-${slot(id)})`;
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const kid of kids) if (kid) e.append(kid);
  return e;
};
const pct = v => (Number.isFinite(v) ? `${Math.round(100 * v)}%` : '—');

export class BenchView {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks; // { baseConfig(), post(msg), replay(trial, algoId) }
    this.running = false;
    this.result = null;
    this.build();
  }

  build() {
    const form = el('div', { class: 'card' });
    form.append(el('h3', { text: 'Benchmark setup' }),
      el('p', { class: 'help', text: 'Every algorithm plays the same seeded fields, built from the current dials. Sweep up to two dials to compare settings.' }));
    const checks = el('div', { class: 'algo-checks' });
    this.algoBoxes = ALGORITHMS.map(a => {
      const box = el('input', { type: 'checkbox', checked: true });
      const sw = el('span', { class: 'swatch' });
      sw.style.background = seriesVar(a.id);
      checks.append(el('label', {}, box, sw, a.name));
      return { id: a.id, box };
    });
    const sweepSel = () => {
      const sel = el('select');
      sel.append(el('option', { value: '', text: '(none)' }));
      for (const [path, label] of SWEEPABLE) sel.append(el('option', { value: path, text: label }));
      return sel;
    };
    this.seeds = el('input', { type: 'number', min: 1, max: 500, value: 12 });
    this.s1 = sweepSel();
    this.v1 = el('input', { type: 'text', placeholder: 'values, comma separated' });
    this.s2 = sweepSel();
    this.v2 = el('input', { type: 'text', placeholder: 'values, comma separated' });
    this.lag = el('input', { type: 'checkbox', checked: true });
    for (const [sel, box] of [[this.s1, this.v1], [this.s2, this.v2]]) {
      sel.addEventListener('change', () => { const hit = SWEEPABLE.find(s => s[0] === sel.value); box.value = hit ? hit[2] : ''; });
    }
    this.s1.value = 'raker.kMul';
    this.v1.value = '1, 1.5, 3';
    this.runBtn = el('button', { class: 'primary', text: 'Run benchmark', onclick: () => (this.running ? this.stop() : this.start()) });
    this.bar = el('i');
    this.status = el('span', { class: 'muted', text: '' });
    form.append(
      el('div', { class: 'bench-form' },
        el('div', { class: 'field', style: 'grid-column: 1 / -1' }, el('span', { text: 'Algorithms' }), checks),
        el('label', { class: 'field' }, el('span', { text: 'Seeds per setting' }), this.seeds),
        el('label', { class: 'field' }, el('span', { text: 'Sweep' }), this.s1),
        el('label', { class: 'field' }, el('span', { text: 'Values' }), this.v1),
        el('label', { class: 'field' }, el('span', { text: 'Second sweep' }), this.s2),
        el('label', { class: 'field' }, el('span', { text: 'Values' }), this.v2),
        el('label', { class: 'field' }, el('span', { text: 'Lagrangian work bound (N ≤ 600)' }), el('span', { class: 'switch' }, this.lag, el('span'))),
      ),
      el('div', { class: 'btn-row', style: 'align-items:center; margin-top:12px' }, this.runBtn, this.status),
      el('div', { class: 'progress', style: 'margin-top:8px' }, this.bar),
    );
    this.out = el('div', { style: 'display:grid; gap:12px; grid-template-columns:minmax(0, 1fr)' });
    this.root.replaceChildren(form, this.out);
    this.out.append(el('div', { class: 'card' }, el('p', { class: 'help', text: 'Results appear here. The same benchmark runs from the command line: node bench/run.mjs bench/configs/baseline.json' })));
  }

  parseValues(text) {
    return text.split(/[,\s]+/).map(Number).filter(Number.isFinite);
  }

  start() {
    const algos = this.algoBoxes.filter(a => a.box.checked).map(a => ({ id: a.id }));
    if (!algos.length) { this.status.textContent = 'Pick at least one algorithm.'; return; }
    const grid = {};
    for (const [sel, box] of [[this.s1, this.v1], [this.s2, this.v2]]) {
      if (!sel.value) continue;
      const vals = this.parseValues(box.value);
      if (vals.length) grid[sel.value] = vals;
    }
    const base = this.hooks.baseConfig();
    const seeds = Math.max(1, Math.min(500, Math.round(+this.seeds.value || 1)));
    this.running = true;
    this.runBtn.textContent = 'Stop';
    this.status.textContent = 'Starting…';
    this.bar.style.width = '0%';
    this.hooks.post({ type: 'bench', base, grid, seeds, seedStart: base.seed, algos, lagrangian: this.lag.checked });
  }

  stop() {
    this.hooks.post({ type: 'cancel' });
    this.running = false;
    this.runBtn.textContent = 'Run benchmark';
    this.status.textContent = 'Stopped.';
  }

  progress(done, total) {
    this.bar.style.width = `${(100 * done) / total}%`;
    this.status.textContent = `${done} / ${total} fields`;
  }

  failed(message) {
    this.running = false;
    this.runBtn.textContent = 'Run benchmark';
    this.status.textContent = `Error: ${message}`;
  }

  done(msg) {
    this.running = false;
    this.runBtn.textContent = 'Run benchmark';
    this.status.textContent = `${msg.trials.length} fields in ${msg.seconds.toFixed(1)} s`;
    this.result = msg;
    this.renderResults();
  }

  renderResults() {
    const { trials, summary } = this.result;
    this.out.replaceChildren();
    const dl = (name, type, text) => {
      const a = el('a', { download: name, href: URL.createObjectURL(new Blob([text], { type })) });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    this.out.append(el('div', { class: 'card' },
      el('h3', { text: 'Results' }),
      el('p', { class: 'help', text: 'Costs are interquartile means over finished runs, with 95% bootstrap intervals in brackets. "vs best" is a Holm-corrected Wilcoxon p-value on score (paired seeds; failed runs count as worst).' }),
      el('div', { class: 'btn-row' },
        el('button', { class: 'ghost', text: 'Download CSV', onclick: () => dl('rake-benchmark.csv', 'text/csv', toCsv(trials)) }),
        el('button', { class: 'ghost', text: 'Download JSON', onclick: () => dl('rake-benchmark.json', 'application/json', JSON.stringify(trials)) }),
      ),
    ));

    for (const c of summary.cells) {
      const i = c.instance;
      const tbl = el('table', { class: 'results' });
      tbl.append(el('thead', {}, el('tr', {}, ...['Algorithm', 'Finished', 'Score', 'Strokes', 'Walk', 'Work', 'Work / bound', 'Time', 'Mean rank', 'vs best', 'Failures', ''].map(h => el('th', { text: h })))));
      const body = el('tbody');
      for (const a of c.algos) {
        const s = a.stats, ci = x => (Number.isFinite(x.ci[0]) ? el('span', { class: 'ci', text: ` [${fmt(x.ci[0])}–${fmt(x.ci[1])}]` }) : null);
        const sw = el('span', { class: 'swatch' });
        sw.style.background = seriesVar(a.id);
        const fails = Object.entries(a.reasons).map(([k, v]) => `${reasonLabel(k)} ${v}`).join(', ');
        const firstTrial = trials.find(tr => tr.cell === c.cell);
        body.append(el('tr', { class: c.best === a.id ? 'best' : '' },
          el('td', {}, sw, ' ', a.label),
          el('td', { text: `${a.success}/${a.runs} (${pct(a.successCI[0])}–${pct(a.successCI[1])})` }),
          el('td', {}, fmt(s.score.iqm), ci(s.score)),
          el('td', { text: fmt(s.strokes.iqm) }),
          el('td', { text: fmt(s.walkDist.iqm) }),
          el('td', { text: fmt(s.work.iqm) }),
          el('td', { text: fmt(s.workGap.iqm) }),
          el('td', { text: fmtTime(s.time.iqm) }),
          el('td', { text: fmt(a.meanRank) }),
          el('td', { text: a.vsBest == null ? 'best' : Number.isFinite(a.vsBest.p) ? (a.vsBest.p < 0.001 ? '<0.001' : a.vsBest.p.toFixed(3)) : 'n/a' }),
          el('td', { class: fails ? '' : 'fail', text: fails || '—' }),
          el('td', {}, el('button', { class: 'ghost', text: 'Watch', title: 'Replay this algorithm on the first seed of this setting', onclick: () => this.hooks.replay(firstTrial, a.id) })),
        ));
      }
      tbl.append(body);
      this.out.append(el('div', { class: 'card' },
        el('div', { class: 'cell-title', text: c.cell || 'Current dials' }),
        el('div', { class: 'cell-sub', text: `N = ${i.N}, n = ${i.n}, t = ${i.t}, spare = ${i.spare}, k/M ≈ ${fmt(i.kOverM)}, l = ${fmt(i.l)}, grouping ${i.band}; ${c.instances} fields; Friedman p = ${Number.isFinite(c.friedmanP) ? c.friedmanP.toExponential(1) : 'n/a'}` }),
        el('div', { style: 'overflow:auto' }, tbl),
      ));
    }

    const charts = el('div', { class: 'charts' });
    charts.append(this.profileChart(summary), this.multiples(trials));
    this.out.append(charts);
  }

  legend(ids) {
    const lg = el('div', { class: 'legend' });
    for (const id of ids) {
      const sw = el('span', { class: 'swatch' });
      sw.style.background = seriesVar(id);
      lg.append(el('span', {}, sw, ALGORITHMS.find(a => a.id === id).name));
    }
    return lg;
  }

  // Dolan-More performance profile: share of fields within tau x of the best score.
  profileChart(summary) {
    const ids = Object.keys(summary.profile), taus = summary.taus;
    const W = 520, H = 280, L = 44, R = 132, T = 12, B = 34;
    const x = tau => L + ((Math.log(tau) - Math.log(taus[0])) / (Math.log(taus[taus.length - 1]) - Math.log(taus[0]))) * (W - L - R);
    const y = v => T + (1 - v) * (H - T - B);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Performance profile' });
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      root.append(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'gridline' }));
      root.append(svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, document.createTextNode(`${v * 100}%`)));
    }
    for (const tau of [1, 1.5, 2, 3, 4]) root.append(svg('text', { x: x(tau), y: H - B + 16, 'text-anchor': 'middle' }, document.createTextNode(`${tau}×`)));
    root.append(svg('text', { x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, document.createTextNode('within this factor of the best score')));
    const ends = [];
    for (const id of ids) {
      const row = summary.profile[id];
      let d = `M ${x(taus[0])} ${y(row[0])}`;
      for (let i = 1; i < taus.length; i++) d += ` H ${x(taus[i])} V ${y(row[i])}`;
      root.append(svg('path', { d, fill: 'none', stroke: seriesVar(id), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      ends.push({ id, yv: y(row[row.length - 1]) });
    }
    // direct labels at the right end, nudged apart
    ends.sort((a, b) => a.yv - b.yv);
    for (let i = 1; i < ends.length; i++) if (ends[i].yv - ends[i - 1].yv < 13) ends[i].yv = ends[i - 1].yv + 13;
    for (const e of ends) root.append(svg('text', { x: W - R + 6, y: e.yv + 4, class: 'label' }, document.createTextNode(ALGORITHMS.find(a => a.id === e.id).name.replace(/ \(.*\)/, ''))));
    // hover: crosshair at the nearest tau and a readout
    const cross = svg('line', { y1: T, y2: H - B, class: 'axis', visibility: 'hidden' });
    const hit = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' });
    root.append(cross, hit);
    const tip = el('div', { class: 'tooltip', hidden: true });
    hit.addEventListener('pointermove', e => {
      const box = root.getBoundingClientRect(), px = ((e.clientX - box.left) / box.width) * W;
      let best = 0;
      taus.forEach((tau, i) => { if (Math.abs(x(tau) - px) < Math.abs(x(taus[best]) - px)) best = i; });
      cross.setAttribute('x1', x(taus[best]));
      cross.setAttribute('x2', x(taus[best]));
      cross.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>within ${taus[best]}× of best</b><br>` + ids.map(id => `${ALGORITHMS.find(a => a.id === id).name}: ${pct(summary.profile[id][best])}`).join('<br>');
      tip.hidden = false;
      tip.style.left = `${Math.min(e.clientX - box.left + 12, box.width - 220)}px`;
      tip.style.top = `${e.clientY - box.top + 12}px`;
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
    const wrap = el('div', { class: 'chart', style: 'position:relative' }, root, tip);
    return el('div', { class: 'card' }, el('h3', { text: 'Performance profile (score)' }), this.legend(ids), wrap,
      el('p', { class: 'help', text: 'Higher and further left is better. A line that never reaches 100% failed on some fields.' }));
  }

  // One small work-vs-strokes chart per algorithm, shared axes, finished runs only.
  multiples(trials) {
    const ids = trials[0]?.results.map(r => r.id) || [];
    const pts = ids.map((_, a) => trials.map(tr => ({ r: tr.results[a], seed: tr.seed, cell: tr.cell })).filter(p => p.r.status === 'success'));
    const all = pts.flat();
    const sx = all.map(p => p.r.strokes), sy = all.map(p => p.r.work);
    const x0 = Math.min(...sx, Infinity), x1 = Math.max(...sx, -Infinity), y0 = Math.min(...sy, Infinity), y1 = Math.max(...sy, -Infinity);
    const grid = el('div', { class: 'multiples' });
    const W = 220, H = 160, L = 40, B = 26, T = 8, R = 8;
    const fx = v => L + ((v - x0) / Math.max(1e-9, x1 - x0)) * (W - L - R);
    const fy = v => T + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * (H - T - B);
    ids.forEach((id, a) => {
      const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${id}: work against strokes` });
      root.append(svg('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'axis' }), svg('line', { x1: L, x2: L, y1: T, y2: H - B, class: 'axis' }));
      if (Number.isFinite(x0)) {
        root.append(svg('text', { x: L, y: H - 8, 'text-anchor': 'start' }, document.createTextNode(fmt(x0))), svg('text', { x: W - R, y: H - 8, 'text-anchor': 'end' }, document.createTextNode(`${fmt(x1)} strokes`)));
        root.append(svg('text', { x: L - 4, y: H - B, 'text-anchor': 'end' }, document.createTextNode(fmt(y0))), svg('text', { x: L - 4, y: T + 8, 'text-anchor': 'end' }, document.createTextNode(fmt(y1))));
      }
      for (const p of pts[a]) {
        const c = svg('circle', { cx: fx(p.r.strokes), cy: fy(p.r.work), r: 4, fill: seriesVar(id), stroke: 'var(--surface)', 'stroke-width': 2 });
        c.append(svg('title', {}, document.createTextNode(`seed ${p.seed}${p.cell ? ` (${p.cell})` : ''}: ${p.r.strokes} strokes, work ${fmt(p.r.work)}`)));
        root.append(c);
      }
      const sw = el('span', { class: 'swatch' });
      sw.style.background = seriesVar(id);
      grid.append(el('div', { class: 'mini chart' }, el('h4', {}, sw, `${ALGORITHMS.find(x => x.id === id).name} (${pts[a].length} finished)`), root));
    });
    return el('div', { class: 'card' }, el('h3', { text: 'Work against strokes (finished runs)' }), grid,
      el('p', { class: 'help', text: 'Same axes in every panel; lower-left is better. Hover a dot for its seed.' }));
  }
}
