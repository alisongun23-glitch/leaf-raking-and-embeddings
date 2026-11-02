import { iqm, bootstrapCI, wilsonCI, wilcoxon, mcnemar, friedman, holm, performanceProfile } from './benchstats.js';

// Turns benchmark trials into per-cell summaries. trials: [{ cell, seed, instance, results: [...] }],
// every algorithm runs on the same instances (paired).

const METRICS = [
  ['score', 'Score'],
  ['strokes', 'Strokes'],
  ['walkDist', 'Walk'],
  ['rakeDist', 'Rake dist'],
  ['work', 'Work'],
  ['workGap', 'Work / bound'],
  ['time', 'Time (s)'],
  ['decisionMs', 'Compute (ms)'],
];

export const PROFILE_TAUS = [1, 1.05, 1.1, 1.2, 1.35, 1.5, 1.75, 2, 2.5, 3, 4];

export function summarize(trials) {
  const byCell = new Map();
  for (const tr of trials) {
    if (!byCell.has(tr.cell)) byCell.set(tr.cell, []);
    byCell.get(tr.cell).push(tr);
  }
  const cells = [];
  for (const [cell, list] of byCell) {
    list.sort((a, b) => a.seed - b.seed);
    const ids = list[0].results.map(r => r.id + (r.label ? '' : ''));
    const labels = list[0].results.map(r => r.label);
    const algos = ids.map((id, a) => {
      const runs = list.map(tr => tr.results[a]);
      const ok = runs.filter(r => r.status === 'success');
      const reasons = {};
      for (const r of runs) if (r.status !== 'success') reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      const stats = {};
      for (const [key] of METRICS) {
        const xs = ok.map(r => r[key]).filter(v => Number.isFinite(v));
        stats[key] = { iqm: iqm(xs), ci: bootstrapCI(xs, iqm, { B: 600 }) };
      }
      return { id, label: labels[a], runs: runs.length, success: ok.length, successCI: wilsonCI(ok.length, runs.length), reasons, stats };
    });
    // paired comparisons on score (failed runs count as Infinity)
    const rows = list.map(tr => tr.results.map(r => r.score));
    const fr = friedman(rows);
    const best = fr.meanRanks.length ? fr.meanRanks.indexOf(Math.min(...fr.meanRanks)) : 0;
    const raw = algos.map((_, a) => (a === best ? NaN : wilcoxon(rows.map(r => r[a]), rows.map(r => r[best])).p));
    const adj = holm(raw);
    algos.forEach((al, a) => {
      al.meanRank = fr.meanRanks[a];
      al.vsBest = a === best ? null : { p: adj[a] };
      let b = 0, c = 0;
      for (const tr of list) {
        const s1 = tr.results[a].status === 'success', s2 = tr.results[best].status === 'success';
        if (s1 && !s2) b++;
        if (!s1 && s2) c++;
      }
      al.successVsBest = a === best ? null : { p: mcnemar(b, c) };
    });
    const inst = list[0].instance;
    cells.push({
      cell,
      instances: list.length,
      instance: { N: inst.N, n: inst.n, t: inst.t, spare: inst.spare, kOverM: mean(list.map(tr => tr.instance.kOverM)), l: inst.l, band: inst.band },
      friedmanP: fr.p,
      best: algos[best]?.id,
      algos,
    });
  }
  // performance profile on score, pooled over every instance
  const ids = trials[0]?.results.map(r => r.id) || [];
  const costs = Object.fromEntries(ids.map((id, a) => [id, trials.map(tr => tr.results[a].score)]));
  return { cells, profile: ids.length ? performanceProfile(costs, PROFILE_TAUS) : {}, taus: PROFILE_TAUS };
}

const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f = (v, d = 1) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(d)) : '—');
const pct = v => (Number.isFinite(v) ? `${Math.round(100 * v)}%` : '—');
const pv = p => (p == null ? 'best' : Number.isFinite(p.p) ? (p.p < 0.001 ? '<0.001' : p.p.toFixed(3)) : 'n/a');

export function toMarkdown(summary, meta = {}) {
  const lines = [];
  lines.push(`# Benchmark: ${meta.name || 'run'}`, '');
  if (meta.when) lines.push(`Run ${meta.when}; ${meta.trials} instances x ${meta.algorithms} algorithms; ${meta.seconds}s.`, '');
  lines.push('Costs are interquartile means over finished runs, with 95% bootstrap intervals. "vs best" is a Holm-corrected Wilcoxon p-value on score (paired; failures count as worst).', '');
  for (const c of summary.cells) {
    const i = c.instance;
    lines.push(`## ${c.cell || 'all'}`, '');
    lines.push(`N = ${i.N}, n = ${i.n}, t = ${i.t}, spare = ${i.spare}, k/M = ${f(i.kOverM, 2)}, l = ${f(i.l, 2)}, grouping: ${i.band}. ${c.instances} instances; Friedman p = ${Number.isFinite(c.friedmanP) ? c.friedmanP.toExponential(1) : 'n/a'}.`, '');
    lines.push('| Algorithm | Finished | Score | Strokes | Walk | Work | Work / bound | Time (min) | Mean rank | vs best | Failures |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const a of c.algos) {
      const s = a.stats, ci = x => (Number.isFinite(x.ci[0]) ? ` [${f(x.ci[0])}–${f(x.ci[1])}]` : '');
      const fails = Object.entries(a.reasons).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
      lines.push(`| ${a.label} | ${a.success}/${a.runs} (${pct(a.successCI[0])}–${pct(a.successCI[1])}) | ${f(s.score.iqm, 2)}${ci(s.score)} | ${f(s.strokes.iqm, 0)} | ${f(s.walkDist.iqm, 0)} | ${f(s.work.iqm, 0)} | ${f(s.workGap.iqm, 2)} | ${f(s.time.iqm / 60, 1)} | ${f(a.meanRank, 2)} | ${pv(a.vsBest)} | ${fails} |`);
    }
    lines.push('');
  }
  lines.push('## Performance profile (score, all instances)', '');
  lines.push(`| Algorithm | ${summary.taus.map(t => `≤${t}×`).join(' | ')} |`);
  lines.push(`|---|${summary.taus.map(() => '---').join('|')}|`);
  for (const [id, row] of Object.entries(summary.profile)) lines.push(`| ${id} | ${row.map(pct).join(' | ')} |`);
  lines.push('', 'Share of instances where each algorithm is within τ× of the best score (failures never count).');
  return lines.join('\n');
}

export function toCsv(trials) {
  const head = ['cell', 'seed', 'algorithm', 'status', 'reason', 'N', 'n', 't', 'k', 'l', 'M', 'kOverM', 'spare', 'R', 'strokes', 'pointStrokes', 'mergeStrokes', 'foundings', 'walks', 'walkDist', 'rakeDist', 'work', 'time', 'captures', 'score', 'workBound', 'workGap', 'routingLoss', 'sitingLoss', 'travelBound', 'strokeBound', 'decisionMs', 'meanDecisionMs'];
  const rows = [head.join(',')];
  const esc = v => (v == null ? '' : typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  for (const tr of trials) {
    const i = tr.instance;
    for (const r of tr.results) {
      rows.push([tr.cell, tr.seed, r.id, r.status, r.reason, i.N, i.n, i.t, i.k, i.l, i.M, i.kOverM, i.spare, i.R, r.strokes, r.pointStrokes, r.mergeStrokes, r.foundings, r.walks, r.walkDist, r.rakeDist, r.work, r.time, r.captures, Number.isFinite(r.score) ? r.score : '', i.bounds.workBound, r.workGap, r.routingLoss, r.sitingLoss, i.bounds.travel, i.bounds.strokes, r.decisionMs, r.meanDecisionMs].map(esc).join(','));
    }
  }
  return rows.join('\n');
}

// Expands { "raker.kMul": [1, 2], "goal.t": [50, 60] } into labelled config patches (cartesian product).
export function expandGrid(grid = {}) {
  const keys = Object.keys(grid);
  let cells = [{ label: '', patch: {} }];
  for (const key of keys) {
    const next = [];
    for (const cell of cells) {
      for (const v of grid[key]) {
        const patch = structuredClone(cell.patch);
        const parts = key.split('.');
        let o = patch;
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ??= {};
        o[parts[parts.length - 1]] = v;
        if (key === 'raker.k') (patch.raker ??= {}).kMode = 'abs';
        if (key === 'raker.lMul') (patch.raker ??= {}).lMode = 'xk';
        next.push({ label: [cell.label, `${key}=${v}`].filter(Boolean).join(', '), patch });
      }
    }
    cells = next;
  }
  return cells;
}
