// Euclidean minimum spanning tree and the minimum workable reach M.
// M = the longest EMST edge = the smallest k at which the reach graph is connected (Kruskal over all
// edges no longer than k ends with exactly the components of G_k). Prim's algorithm is O(N^2) time and
// O(N) memory: about 25M distance evaluations at N = 5,000, with no triangulation library needed.
export function emst(xs, ys) {
  const N = xs.length;
  const parent = new Int32Array(N).fill(-1), len = new Float64Array(N);
  const best = new Float64Array(N).fill(Infinity), inTree = new Uint8Array(N);
  let M = 0, bu = -1, bv = -1, total = 0;
  if (N === 0) return { parent, len, M, total, bottleneck: null, side: new Uint8Array(0) };
  best[0] = 0;
  for (let it = 0; it < N; it++) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < N; i++) if (!inTree[i] && best[i] < bd) { bd = best[i]; u = i; }
    inTree[u] = 1;
    if (parent[u] >= 0) {
      len[u] = bd;
      total += bd;
      if (bd > M) { M = bd; bu = parent[u]; bv = u; }
    }
    const xu = xs[u], yu = ys[u];
    for (let v = 0; v < N; v++) {
      if (inTree[v]) continue;
      const dx = xs[v] - xu, dy = ys[v] - yu, d2 = dx * dx + dy * dy;
      if (d2 < best[v]) { best[v] = d2; parent[v] = u; }
    }
  }
  // best[] held squared distances; convert the tree edges to lengths.
  M = Math.sqrt(M);
  total = 0;
  for (let v = 0; v < N; v++) if (parent[v] >= 0) { len[v] = Math.sqrt(len[v]); total += len[v]; }
  // Which side of the bottleneck edge each point is on (1 = the side holding bv), for the overlay.
  const side = new Uint8Array(N);
  if (bv >= 0) {
    const kids = Array.from({ length: N }, () => []);
    for (let v = 0; v < N; v++) if (parent[v] >= 0) kids[parent[v]].push(v);
    const stack = [bv];
    side[bv] = 1;
    while (stack.length) for (const c of kids[stack.pop()]) { side[c] = 1; stack.push(c); }
  }
  return { parent, len, M, total, bottleneck: bv >= 0 ? [bu, bv] : null, side };
}

// "Frog distance": the longest step still needed to connect every live original site, by Kruskal over the
// game's presorted reach edges. Its margin below k shows how close the raker is to stranding something.
export function frogDistance(g) {
  const N = g.N, uf = new Int32Array(N);
  let comps = 0;
  for (let i = 0; i < N; i++) { uf[i] = i; if (g.active(i)) comps++; }
  if (comps <= 1) return 0;
  const find = i => { while (uf[i] !== i) { uf[i] = uf[uf[i]]; i = uf[i]; } return i; };
  const { edgeU, edgeV, edgeW, edgeCount } = g.graph;
  for (let e = 0; e < edgeCount; e++) {
    const u = edgeU[e], v = edgeV[e];
    if (!g.active(u) || !g.active(v)) continue;
    const a = find(u), b = find(v);
    if (a === b) continue;
    uf[a] = b;
    if (--comps === 1) return edgeW[e];
  }
  return Infinity;
}
