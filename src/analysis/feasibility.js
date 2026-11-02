import { EPS } from '../core/geometry.js';

// Feasibility screens (research report §3). They can prove an instance impossible; they can never prove
// it possible. Only a run that finishes does that, so the label is 'infeasible' or 'undetermined'.
//   1. N >= n t                         (otherwise some pile is short of t)
//   2. k >= M when l <= k/2             (no capsule can reach across a gap in the reach graph)
//   3. forced-pile screen when l <= k/2: a piece with fewer than t points hanging off a cut point must
//      join that cut point's pile (pile members form a connected group), and if the forced pile leaves
//      fewer than (n - 1) t points for the other piles, the instance is impossible.
// `g` is a fresh (unstarted) Game for the instance; M is the longest EMST edge.
export function feasibility(g, M) {
  const reasons = [];
  let label = 'undetermined';
  const { N, n, t, k, l } = g;
  const exact = l <= k / 2 && g.rules.destination !== 'free';
  if (N < n * t) {
    label = 'infeasible';
    reasons.push(`Only ${N} points for ${n} piles of at least ${t} (need ${n * t}).`);
  }
  if (k < M * (1 - EPS)) {
    if (exact) {
      label = 'infeasible';
      reasons.push(`Reach k = ${fmt(k)} is below M = ${fmt(M)}: the field splits into groups the raker can never cross between.`);
    } else {
      reasons.push(`Reach k = ${fmt(k)} is below M = ${fmt(M)}; capsules wider than k/2 (or free placement) might still bridge the gap, so this is not a proof.`);
    }
  } else if (exact && label !== 'infeasible') {
    const forced = forcedPileScreen(g);
    if (forced) {
      label = 'infeasible';
      reasons.push(`Point #${forced.site} is the only link to ${forced.pieces} small group${forced.pieces > 1 ? 's' : ''}, so its pile must take at least ${forced.size} points, leaving ${N - forced.size} for the other ${n - 1} piles (need ${(n - 1) * t}).`);
    }
  }
  if (!exact) reasons.push('Rake half-width l is above k/2 (or free placement is on), so these screens are not exact.');
  if (label === 'undetermined' && reasons.length === 0) reasons.push('No obstacle found. A finished run proves it can be done.');
  return { label, reasons, M, kOverM: M > 0 ? k / M : Infinity, exact };
}

const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toPrecision(3));

// Iterative DFS over the static reach graph with subtree sizes: for every cut point v, the pieces of
// G_k - v and how many points the small ones force into v's pile. Returns the first violation, or null.
function forcedPileScreen(g) {
  const { N, n, t } = g, { off, nbr } = g.graph;
  if (n < 2 || t < 2) return null;
  const disc = new Int32Array(N).fill(-1), low = new Int32Array(N), par = new Int32Array(N).fill(-1);
  const size = new Int32Array(N), forced = new Int32Array(N), sep = new Int32Array(N), pieces = new Int32Array(N);
  const ptr = new Int32Array(N);
  let time = 0;
  for (let root = 0; root < N; root++) {
    if (disc[root] >= 0) continue;
    const stack = [root];
    disc[root] = low[root] = time++;
    const members = [root];
    while (stack.length) {
      const v = stack[stack.length - 1];
      if (ptr[v] < off[v + 1] - off[v]) {
        const w = nbr[off[v] + ptr[v]++];
        if (disc[w] < 0) {
          par[w] = v; disc[w] = low[w] = time++;
          stack.push(w); members.push(w);
        } else if (w !== par[v] && disc[w] < low[v]) low[v] = disc[w];
      } else {
        stack.pop();
        size[v] += 1;
        const p = par[v];
        if (p >= 0) {
          size[p] += size[v];
          if (low[v] < low[p]) low[p] = low[v];
          if (low[v] >= disc[p]) { // v's subtree is cut off from the rest by p
            sep[p] += size[v];
            if (size[v] < t) { forced[p] += size[v]; pieces[p]++; }
          }
        }
      }
    }
    const comp = members.length;
    for (const v of members) {
      if (v !== root) {
        const rest = comp - 1 - sep[v]; // the piece on the parent's side
        if (sep[v] > 0 && rest > 0 && rest < t) { forced[v] += rest; pieces[v]++; }
      }
      if (pieces[v] > 0) {
        const pile = 1 + forced[v];
        if (N - pile < (n - 1) * t) return { site: v, size: pile, pieces: pieces[v] };
      }
    }
  }
  return null;
}
