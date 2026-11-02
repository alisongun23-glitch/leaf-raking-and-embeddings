import { score } from '../core/metrics.js';
import { PILE } from '../core/kinds.js';
import { el } from './dials.js';
import { fmt, fmtTime } from './render.js';
import { timeParts } from '../core/metrics.js';
import { dataset } from '../data/datasets.js';

const REASONS = {
  'cut-off': 'Loose points cut off',
  'cut-off-pile': 'Unfinished pile cut off',
  starvation: 'Starvation (spare points used up)',
  'too-many-piles': 'Too many piles frozen',
  stranded: 'Stranded',
  'step-budget': 'Out of moves',
  'gave-up': 'Gave up',
  illegal: 'Illegal move',
};
export const reasonLabel = r => REASONS[r] || r;

export function statusChip(g) {
  const text = g.status === 'ready' ? 'Ready' : g.status === 'running' ? 'Running' : g.status === 'success' ? 'Finished' : reasonLabel(g.reason);
  return el('span', { class: `chip ${g.status}`, text });
}

const kv = rows => {
  const dl = el('dl', { class: 'kv' });
  for (const [k, v, note] of rows) {
    if (v === undefined) continue;
    dl.append(el('dt', { text: k }), el('dd', {}, String(v), note ? el('small', { text: ` ${note}` }) : null));
  }
  return dl;
};
const meter = (label, value, frac, cls = '') =>
  el('div', {}, el('div', { class: 'meter-label' }, el('span', { text: label }), el('b', { text: value })),
    el('div', { class: `bar ${cls}` }, (() => { const i = el('i'); i.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; return i; })()));
const card = (title, ...kids) => el('section', { class: 'card' }, el('h3', { text: title }), ...kids);
const pct = v => `${Math.round(100 * v)}%`;

export function describeMove(g, m, i) {
  const at = j => `#${j}`;
  switch (m.type) {
    case 'start': return `${i}. start on ${at(m.at)}`;
    case 'walk': return `${i}. walk to ${at(m.to)}`;
    case 'found': return `${i}. found a pile`;
    case 'rake': return `${i}. rake ${at(m.from)}${m.to !== undefined ? ` → ${typeof m.to === 'object' ? `(${fmt(m.to.x)}, ${fmt(m.to.y)})` : at(m.to)}` : ''}`;
    case 'give-up': return `${i}. gave up`;
    default: return `${i}. ${m.type}`;
  }
}

// Re-renders the right-hand panel. m: { inst, game, feas, lag, weights, frog, handlers }
export function renderReadouts(root, m) {
  const { inst, game: g, feas, weights } = m;
  const c = g.c, N = g.N, k = g.k, l = g.l;
  root.replaceChildren();

  // the instance
  const lWarn = l > k / 2 ? ' — above k/2: capsules can reach across gaps' : '';
  const facts = card('Instance',
    kv([
      ['Points → piles', `${N} → ${g.n} × ≥${g.t}`],
      ['Spare points s', `${g.s}`, g.s < 0 ? '(too few points)' : `(${pct(Math.max(0, g.s) / N)} of N)`],
      ['Reach k', fmt(k), `= ${fmt(inst.M > 0 ? k / inst.M : NaN)} × M`],
      ['Minimum reach M', fmt(inst.M)],
      ['Rake half-width l', fmt(l), `= ${fmt(k > 0 ? l / k : 0)} × k${lWarn}`],
      ['Grouping (Clark–Evans R)', fmt(inst.clumpiness.R), inst.clumpiness.band],
    ]),
  );
  if (feas) {
    const label = feas.label === 'infeasible' ? 'Impossible' : g.status === 'success' ? 'Possible (a run finished)' : 'No obstacle found';
    facts.append(el('div', { class: 'meter-label' }, el('span', { text: 'Feasibility' }), el('b', { class: feas.label === 'infeasible' ? 'label-infeasible' : g.status === 'success' ? 'label-feasible' : '', text: label })));
    const ul = el('ul', { class: 'reasons' });
    for (const r of feas.reasons) ul.append(el('li', { text: r }));
    facts.append(ul);
  }
  root.append(facts);

  // where the points came from: a real data set, or a file you loaded
  const spec = inst.field.spec || {};
  const meta = typeof spec.model === 'string' && spec.model.startsWith('data:') ? dataset(spec.model.slice(5)) : null;
  if (meta) {
    root.append(card('Data set',
      el('div', { class: 'data-name', text: meta.name }),
      el('p', { class: 'data-shape', text: meta.shape }),
      kv([
        ['Points used', `${N} of ${meta.count}`, N < meta.count ? '(a seeded sample)' : '(all)'],
        ['Units', meta.units],
      ]),
      el('p', { class: 'data-source' }, `${meta.source} `, el('a', { href: meta.url, target: '_blank', rel: 'noopener', text: 'Source' }), `. ${meta.license}${meta.notes ? ` ${meta.notes}` : ''}`),
    ));
  } else if (spec.model === 'custom' && spec.source) {
    const s = spec.source;
    root.append(card('Loaded data',
      el('div', { class: 'data-name', text: s.name }),
      kv([
        ['Columns', s.columns.join(' and ')],
        ['Placed as', s.kind === 'lonlat' ? 'longitude / latitude' : s.kind === 'scatter' ? 'a scatter plot (each axis scaled)' : 'a map (aspect kept)'],
        ['Points', s.used < s.total ? `${s.used} of ${s.total}` : `${s.used}`, s.used < s.total ? '(a seeded sample)' : ''],
        ['Rows skipped', s.skipped || undefined],
        ['Duplicates nudged', s.nudged || undefined],
      ]),
    ));
  }

  // progress
  const spareFrac = g.s > 0 ? c.excess / g.s : c.excess > 0 ? 1 : 0;
  const frogFrac = Number.isFinite(m.frog) && k > 0 ? m.frog / k : 0;
  root.append(card('Progress',
    meter('Points piled', `${N - c.nLoose} / ${N}`, (N - c.nLoose) / N),
    meter('Piles', `${c.nPiles} (${c.nFull} full${c.detPiles ? `, ${c.detPiles} frozen` : ''}) of ${g.n}`, Math.min(1, c.nFull / g.n)),
    meter('Spare points used', `${c.excess} / ${Math.max(0, g.s)}`, spareFrac, spareFrac >= 1 ? 'bad' : spareFrac > 0.75 ? 'warn' : ''),
    meter('Longest step still needed', Number.isFinite(m.frog) ? `${fmt(m.frog)} of k = ${fmt(k)}` : '—', frogFrac, frogFrac > 0.98 ? 'bad' : frogFrac > 0.85 ? 'warn' : ''),
  ));

  // costs
  root.append(card('Costs',
    kv([
      ['Strokes', c.strokes, `(${c.pointStrokes} points, ${c.mergeStrokes} pile merges)`],
      ['Piles founded', c.foundings],
      ['Walks', c.walks],
      ['Walking distance', fmt(c.walkDist)],
      ['Stroke length', fmt(c.rakeDist)],
      ['Work (point × distance)', fmt(c.work)],
      ['Swept up along strokes', c.captures, `(${pct(c.captures / Math.max(1, N - g.n))} of N − n)`],
    ]),
  ));

  // time to rake (see the Time dials; field units count as metres)
  const tp = timeParts(c, m.time);
  const share = v => (tp.total > 0 ? ` (${pct(v / tp.total)})` : '');
  root.append(card('Time to rake',
    el('div', { class: 'score-big', text: fmtTime(tp.total) }),
    kv([
      ['Drawing the rake', fmtTime(tp.rake), share(tp.rake)],
      ['Walking', fmtTime(tp.walk), share(tp.walk)],
      ['Dragging the load', fmtTime(tp.load), share(tp.load)],
      ['Setting up strokes', fmtTime(tp.strokes), share(tp.strokes)],
      ['Starting piles', fmtTime(tp.found), share(tp.found)],
    ]),
  ));

  // bounds and score
  const b = inst.bounds;
  const workBound = Math.max(b.work, Number.isFinite(m.lag) ? m.lag : 0);
  const sc = score({ ...c, status: g.status, N, n: g.n, strokes: c.strokes, walkDist: c.walkDist, work: c.work }, { travel: b.travel, work: workBound, spacing: b.spacing }, weights);
  const lagRow = m.lag === 'running' ? 'computing…' : Number.isFinite(m.lag) ? fmt(m.lag) : null;
  const bounds = card('Lower bounds and gaps',
    el('div', {}, el('div', { class: 'score-big', text: Number.isFinite(sc) ? sc.toFixed(2) : '—' }),
      el('div', { class: 'score-sub', text: Number.isFinite(sc) ? `score (weights ${weights.strokes} / ${weights.walk ?? 0.2} / ${weights.work}); lower is better` : 'score: defined once the run finishes' })),
    kv([
      ['Strokes ≥', b.strokes, `→ now ${fmt(c.strokes / Math.max(1, N - g.n))} × (N − n)`],
      ['Walking ≥', fmt(b.travel), c.walkDist > 0 && b.travel > 0 ? `→ now ${fmt(c.walkDist / b.travel)} ×` : ''],
      ['Work ≥ (nearest neighbour)', fmt(b.work), c.work > 0 && b.work > 0 ? `→ now ${fmt(c.work / b.work)} ×` : ''],
      ['Work ≥ (Lagrangian)', lagRow ?? '—', Number.isFinite(m.lag) && c.work > 0 ? `→ now ${fmt(c.work / m.lag)} ×` : ''],
    ]),
  );
  if (!b.valid) bounds.append(el('div', { class: 'help', text: 'Free pile placement is on: the work bounds assume piles sit on original points, so they are not shown as valid.' }));
  if (m.lag === null && m.handlers.lagrangian) {
    bounds.append(el('div', { class: 'btn-row' }, el('button', { class: 'ghost', text: 'Compute Lagrangian bound', title: 'O(N²) per iteration; runs in the background', onclick: m.handlers.lagrangian })));
  }
  root.append(bounds);

  // piles
  const piles = g.piles();
  const list = el('div', { class: 'piles' });
  for (const j of piles.slice(0, 14)) {
    const mass = g.mass[j], full = mass >= g.t, frozen = !!g.detached[j];
    const bar = el('div', { class: `bar ${full ? '' : 'warn'}` }, (() => { const i = el('i'); i.style.width = `${Math.min(1, mass / g.t) * 100}%`; return i; })());
    list.append(el('div', { class: 'pile-row', title: `pile at point #${j}${frozen ? ' (frozen)' : ''}` },
      el('span', { class: 'num', text: `${mass}` }), bar, el('span', { class: `tick ${frozen ? 'frozen' : ''}`, text: full ? (frozen ? '❄' : '✓') : '' })));
  }
  if (piles.length > 14) list.append(el('div', { class: 'help', text: `+ ${piles.length - 14} smaller piles` }));
  if (!piles.length) list.append(el('div', { class: 'help', text: 'No piles yet.' }));
  root.append(card(`Piles (${piles.length})`, list));

  // moves
  const log = el('ol', { class: 'log' });
  const L = g.log, from = Math.max(0, L.length - 14);
  for (let i = from; i < L.length; i++) log.append(el('li', { class: i === L.length - 1 ? 'cur' : '', text: describeMove(g, L[i], i + 1) }));
  if (!L.length) log.append(el('li', { text: 'No moves yet.' }));
  const h = m.handlers;
  root.append(card(`Moves (${L.length})`, log, el('div', { class: 'btn-row' },
    el('button', { class: 'ghost', text: 'Export replay', onclick: h.exportReplay }),
    el('button', { class: 'ghost', text: 'Export metrics CSV', onclick: h.exportCsv }),
    el('button', { class: 'ghost', text: 'Load replay…', onclick: h.importReplay }),
  )));
}

export const pileCount = g => { let p = 0; for (let j = 0; j < g.size; j++) if (g.kind[j] === PILE) p++; return p; };
