import { FIELD_MODELS, isDataModel } from '../gen/processes.js';

// Every dial in the left panel. `path` points into the config (see src/analysis/instance.js);
// `show(cfg)` hides dials that do not apply; scale 'log' and 'sq' give fine control near the low end.
const clumpy = cfg => ['thomas', 'matern', 'mixture', 'lgcp'].includes(cfg.field.model);
const data = cfg => isDataModel(cfg.field.model);
const generated = cfg => cfg.field.model !== 'custom' && !data(cfg);

export const FIELD_DIALS = [
  {
    path: 'field.model', label: 'Point pattern', type: 'select',
    options: FIELD_MODELS.map(m => [m.id, m.name, m.group]),
    help: 'How the points are sprinkled. Clump models group points slightly; the shapes stress-test the never-strand rule; real data are measured point sets, scaled into the field.',
  },
  { path: 'field.N', label: 'Points N', type: 'range', min: 10, max: 5000, step: 1, scale: 'log', show: cfg => generated(cfg) || data(cfg) },
  { path: 'field.W', label: 'Field width', type: 'range', min: 10, max: 400, step: 1, show: cfg => !data(cfg) },
  { path: 'field.H', label: 'Field height', type: 'range', min: 10, max: 400, step: 1, show: cfg => !data(cfg) },
  {
    path: 'field.clumps', label: 'Clumps', type: 'range', min: 1, max: 60, step: 1, show: clumpy,
    help: 'Expected number of clump centres (an exact count for "Fixed clumps"; hot-spot scale for LGCP).',
  },
  {
    path: 'field.grouping', label: 'Grouping strength', type: 'range', min: 0, max: 20, step: 0.05, scale: 'sq', show: clumpy,
    help: 'Pair-correlation excess g(0) − 1: about 0.5 is slight, 2 moderate, 10+ strong. Clump spread follows from it.',
  },
  {
    path: 'field.background', label: 'Scattered between clumps', type: 'range', min: 0, max: 1, step: 0.01, percent: true, show: clumpy,
    help: 'Share of points spread uniformly. They act as stepping stones between clumps.',
  },
  { path: 'field.lattice', label: 'Snap to integer grid', type: 'bool', show: generated },
  {
    path: 'field.nested', label: 'Keep the leaves when N changes', type: 'bool',
    show: cfg => cfg.field.model === 'thomas' || (cfg.field.lattice && generated(cfg)),
    help: 'Changing N then adds or removes leaves from this field instead of drawing a new one. (Other clump patterns always keep their leaves.)',
  },
  { path: 'seed', label: 'Seed', type: 'seed', show: cfg => generated(cfg) || data(cfg) },
];

export const GOAL_DIALS = [
  { path: 'goal.n', label: 'Piles n', type: 'range', min: 1, max: 40, step: 1 },
  { path: 'goal.t', label: 'Each pile holds at least t', type: 'range', min: 1, max: 2500, step: 1, scale: 'log' },
];

export const RAKER_DIALS = [
  {
    path: 'raker.kMode', label: 'Reach k is set', type: 'segmented',
    options: [['xM', 'as × M'], ['abs', 'directly']],
    help: 'M is this field\'s minimum workable reach: the longest edge of its minimum spanning tree.',
  },
  { path: 'raker.kMul', label: 'Reach k (× M)', type: 'range', min: 0.5, max: 5, step: 0.01, show: c => c.raker.kMode === 'xM' },
  { path: 'raker.k', label: 'Reach k', type: 'range', min: 0.1, max: 200, step: 0.1, scale: 'log', show: c => c.raker.kMode === 'abs' },
  { path: 'raker.lMode', label: 'Rake half-width l is set', type: 'segmented', options: [['abs', 'directly'], ['xk', 'as × k']] },
  { path: 'raker.l', label: 'Rake half-width l', type: 'range', min: 0, max: 50, step: 0.05, scale: 'sq', show: c => c.raker.lMode === 'abs' },
  { path: 'raker.lMul', label: 'Rake half-width l (× k)', type: 'range', min: 0, max: 1, step: 0.01, show: c => c.raker.lMode === 'xk' },
];

export const RULE_DIALS = [
  {
    path: 'rules.destination', label: 'Rake destination', type: 'select',
    options: [['stand', 'Into the pile you stand on'], ['push', 'Push mode: into any pile within k of it'], ['free', 'Free placement: anywhere within k']],
    help: 'Push and free modes end the stroke on the destination. Free placement can build bridges, so the safety screens become heuristic.',
  },
  { path: 'rules.sweepPiles', label: 'Strokes also drag piles they cross', type: 'bool' },
  { path: 'rules.stepBudgetFactor', label: 'Move budget (× N)', type: 'range', min: 2, max: 100, step: 1 },
];

export const SCORE_DIALS = [
  { path: 'score.strokes', label: 'Weight: strokes', type: 'range', min: 0, max: 5, step: 0.05, help: 'Divided by N − n, the stroke count when nothing is swept up.' },
  { path: 'score.walk', label: 'Weight: walking', type: 'range', min: 0, max: 5, step: 0.05, help: 'Divided by the walking lower bound. That bound is loose, so this weight starts at 0.2.' },
  { path: 'score.work', label: 'Weight: work', type: 'range', min: 0, max: 5, step: 0.05, help: 'Work = distance every point is dragged; divided by its lower bound.' },
];

// How long moves take; field units count as metres. Changing these re-times runs without replaying them.
export const TIME_DIALS = [
  { path: 'time.walkSpeed', label: 'Walking speed (m/s)', type: 'range', min: 0.2, max: 5, step: 0.05 },
  { path: 'time.rakeSpeed', label: 'Raking speed (m/s)', type: 'range', min: 0.05, max: 5, step: 0.05, help: 'How fast the rake is drawn along a stroke.' },
  { path: 'time.perLoad', label: 'Extra seconds per leaf·metre dragged', type: 'range', min: 0, max: 1, step: 0.005, scale: 'sq', help: 'Dragging a big pile is slower than one leaf: this adds time in proportion to work.' },
  { path: 'time.perStroke', label: 'Seconds to set up a stroke', type: 'range', min: 0, max: 20, step: 0.1 },
  { path: 'time.perFound', label: 'Seconds to start a pile', type: 'range', min: 0, max: 60, step: 0.5 },
];

export const DISPLAY_DIALS = [
  { path: 'reach', label: 'Reach circle', type: 'bool' },
  { path: 'capsule', label: 'Last stroke / capsule preview', type: 'bool' },
  { path: 'links', label: 'Reach links (who can step to whom)', type: 'bool' },
  { path: 'cuts', label: '"Rake later" points (articulation points)', type: 'bool' },
  { path: 'components', label: 'Colour separated groups', type: 'bool' },
  { path: 'bottleneck', label: 'Bottleneck gap (where M is)', type: 'bool' },
  { path: 'trail', label: 'Raker trail', type: 'bool' },
  { path: 'clumps', label: 'Mark clump members', type: 'bool' },
  { path: 'labels', label: 'Pile sizes', type: 'bool' },
];

export const DEFAULT_DISPLAY = {
  reach: true, capsule: true, links: false, cuts: false, components: true, bottleneck: false, trail: true, clumps: false, labels: true,
};

// Numeric dials the benchmark can sweep.
export const SWEEPABLE = [
  ['raker.kMul', 'Reach k (× M)', '1, 1.5, 2, 3'],
  ['raker.l', 'Rake half-width l', '0, 1.5, 4'],
  ['raker.lMul', 'Rake half-width (× k)', '0, 0.1, 0.25, 0.5'],
  ['goal.t', 'Pile size t', '45, 55, 60, 70, 75'],
  ['goal.n', 'Piles n', '2, 4, 6, 8'],
  ['field.N', 'Points N', '150, 300, 600'],
  ['field.grouping', 'Grouping strength', '0, 0.6, 2, 8'],
  ['field.background', 'Scattered share', '0, 0.25, 0.5'],
  ['field.clumps', 'Clumps', '3, 8, 20'],
];
