// Floor baseline: rake a random neighbour whenever that is safe, otherwise wander one step.
export default {
  id: 'random-safe',
  name: 'Random safe moves',
  blurb: 'Rakes a random neighbour whenever that is safe, otherwise wanders. A floor to beat, and a check on the safety filter.',
  params: {
    walkChance: { type: 'number', label: 'Chance to wander instead of raking', min: 0, max: 0.9, step: 0.05, default: 0.15 },
  },
  create(g, p, rng) {
    return {
      start: () => rng.int(g.N),
      next() {
        const nb = g.neighbors(g.raker);
        if (!nb.length) return null;
        if (rng.float() >= p.walkChance) {
          for (const j of rng.shuffle(nb.slice()).slice(0, 32)) {
            const m = { type: 'rake', from: j };
            if (g.isSafe(m)) return m;
          }
        }
        return { type: 'walk', to: rng.pick(nb) };
      },
    };
  },
};
