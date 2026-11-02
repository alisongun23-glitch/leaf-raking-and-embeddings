import randomSafe from './random-safe.js';
import greedyNearest from './greedy-nearest.js';
import safeGreedy from './safe-greedy.js';
import treePeel from './tree-peel.js';
import plannedSites from './planned-sites.js';

// Every algorithm exports { id, name, blurb, params, create(game, params, rng, ctx) }, where params is a
// schema the UI turns into dials ({ type: 'bool' | 'number' | 'int' | 'select', label, default, ... }) and
// create() returns { start() -> site index, next() -> move or null to give up }. Add new algorithms here.
export const ALGORITHMS = [plannedSites, treePeel, safeGreedy, greedyNearest, randomSafe];

export function getAlgorithm(id) {
  const a = ALGORITHMS.find(x => x.id === id);
  if (!a) throw new Error(`Unknown algorithm "${id}". Known: ${ALGORITHMS.map(x => x.id).join(', ')}.`);
  return a;
}

export function defaultParams(algo) {
  return Object.fromEntries(Object.entries(algo.params || {}).map(([key, spec]) => [key, spec.default]));
}
