// proto.mjs — throwaway sanity check of the raking rules (NOT the real simulator).
// Usage: node proto.mjs --N=300 --n=4 --t=60 --kMul=1.5 --l=1.5 --runs=20
const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')).map(([a, b]) => [a, Number(b)]));
const P = { N: 300, W: 100, H: 100, clumps: 6, sigma: 6, frac: 0.6, n: 4, t: 60, kMul: 1.5, l: 1.5, seed: 1, runs: 20, ...args };

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Gaussian clumps over a uniform background (Thomas-like), clipped to the box.
function genPoints(r) {
  const C = Array.from({ length: P.clumps }, () => ({ x: r() * P.W, y: r() * P.H }));
  const pts = [];
  while (pts.length < P.N) {
    let x, y;
    if (r() < P.frac) { const c = C[Math.floor(r() * P.clumps)]; x = c.x + P.sigma * gauss(r); y = c.y + P.sigma * gauss(r); }
    else { x = r() * P.W; y = r() * P.H; }
    if (x >= 0 && x <= P.W && y >= 0 && y <= P.H) pts.push({ x, y, mass: 1, pile: false, alive: true });
  }
  return pts;
}

// Smallest k that makes the k-disk graph connected = longest edge of the Euclidean MST (Prim, O(N^2)).
function emstMaxEdge(pts) {
  const n = pts.length, done = new Uint8Array(n), best = new Float64Array(n).fill(Infinity);
  best[0] = 0; let maxE = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || best[i] < best[u])) u = i;
    done[u] = 1; maxE = Math.max(maxE, best[u]);
    for (let v = 0; v < n; v++) if (!done[v]) best[v] = Math.min(best[v], dist(pts[u], pts[v]));
  }
  return maxE;
}

function segDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
  const s = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2)) : 0;
  return Math.hypot(p.x - a.x - s * vx, p.y - a.y - s * vy);
}

class Game {
  constructor(nodes, k, l) { Object.assign(this, { nodes, k, l, agent: 0, strokes: 0, walks: 0, travel: 0, work: 0 }); }
  neighbors(i) {
    const a = this.nodes[i], out = [];
    for (let j = 0; j < this.nodes.length; j++) { const b = this.nodes[j]; if (j !== i && b.alive && dist(a, b) <= this.k) out.push(j); }
    return out;
  }
  // Indices a pull of object o into the node at `to` would consume: loose points inside the capsule, plus o itself if it is a pile.
  sweep(o, to = this.agent) {
    const a = this.nodes[to], src = this.nodes[o], hit = [];
    for (let j = 0; j < this.nodes.length; j++) { const q = this.nodes[j]; if (j !== to && q.alive && !q.pile && segDist(q, src, a) <= this.l) hit.push(j); }
    if (src.pile) hit.push(o);
    return hit;
  }
  pull(o) {
    const a = this.nodes[this.agent], hit = this.sweep(o);
    a.pile = true;
    for (const j of hit) { const q = this.nodes[j]; q.alive = false; a.mass += q.mass; this.work += q.mass * dist(q, a); }
    this.strokes++;
  }
  walk(v) { this.travel += dist(this.nodes[this.agent], this.nodes[v]); this.agent = v; this.walks++; }
  // Safe = after removing `removed`, everything still needing work stays reachable from `at`
  // (by default: every loose point and every pile still below t; `okIfCut` overrides that test).
  safeAfter(removed, at = this.agent, okIfCut = b => b.pile && b.mass >= P.t) {
    const gone = new Set(removed), seen = new Uint8Array(this.nodes.length), stack = [at]; seen[at] = 1;
    while (stack.length) {
      const i = stack.pop();
      for (let j = 0; j < this.nodes.length; j++) {
        if (seen[j] || gone.has(j)) continue;
        const b = this.nodes[j];
        if (b.alive && dist(this.nodes[i], b) <= this.k) { seen[j] = 1; stack.push(j); }
      }
    }
    for (let j = 0; j < this.nodes.length; j++) {
      const b = this.nodes[j];
      if (!b.alive || gone.has(j) || seen[j]) continue;
      if (!okIfCut(b, j)) return false;
    }
    return true;
  }
  path(from, goal) { // BFS over the k-disk graph; goal(i) picks the target node
    const prev = new Int32Array(this.nodes.length).fill(-1); prev[from] = from; const q = [from];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i !== from && goal(i)) { const p = [i]; while (p[p.length - 1] !== from) p.push(prev[p[p.length - 1]]); return p.reverse(); }
      for (const j of this.neighbors(i)) if (prev[j] < 0) { prev[j] = i; q.push(j); }
    }
    return null;
  }
  loose() { let c = 0; for (const b of this.nodes) if (b.alive && !b.pile) c++; return c; }
  piles() { return this.nodes.filter(b => b.alive && b.pile); }
}

// Fill the pile you stand on to t with nearest safe pulls; optionally "snowball" it onto the farthest
// loose neighbour r when the only remaining pulls would strand you; otherwise walk to the nearest loose point.
function collect(g, snowball) {
  for (let step = 0; step < 20 * P.N; step++) {
    if (g.loose() === 0) return 'collected';
    const cur = g.nodes[g.agent];
    const looseNb = g.neighbors(g.agent).filter(j => !g.nodes[j].pile).sort((x, y) => dist(g.nodes[x], cur) - dist(g.nodes[y], cur));
    if (cur.mass < P.t) {
      const o = looseNb.find(j => g.safeAfter(g.sweep(j)));
      if (o !== undefined) { g.pull(o); continue; }
      if (snowball && cur.pile) {
        const here = g.agent;
        const r = [...looseNb].reverse().find(j => g.safeAfter(g.sweep(here, j), j));
        if (r !== undefined) { g.walk(r); g.pull(here); continue; }
      }
    }
    const p = g.path(g.agent, i => !g.nodes[i].pile && i !== g.agent);
    if (!p) return 'stranded';
    // Step one hop when stuck below t (avoids ping-ponging), otherwise go all the way to the next loose point.
    if (cur.mass < P.t && looseNb.length) { g.walk(looseNb[(step * 7) % looseNb.length]); continue; }
    for (const v of p.slice(1)) g.walk(v);
  }
  return 'step budget';
}

// Quota policy: the agent always stands on its active pile A. Fill A to t with nearest safe pulls; when no
// pull is safe, drag A onto the farthest safe loose neighbour (the "turn r into the new cluster" move).
// Once A >= t, walk to the nearest loose point and found the next pile; never found more than n piles,
// so the n-th pile snowballs everything that is left.
function collectQuota(g, pickFar = true) {
  let A = g.agent, founded = 1;
  g.nodes[A].pile = true;
  for (let step = 0; step < 20 * P.N; step++) {
    if (g.loose() === 0) return 'collected';
    const cur = g.nodes[A];
    const looseNb = g.neighbors(A).filter(j => !g.nodes[j].pile).sort((x, y) => dist(g.nodes[x], cur) - dist(g.nodes[y], cur));
    if (cur.mass < P.t || founded === P.n) {
      const o = looseNb.find(j => g.safeAfter(g.sweep(j)));
      if (o !== undefined) { g.pull(o); continue; }
      const order = pickFar ? [...looseNb].reverse() : looseNb;
      const r = order.find(j => g.safeAfter(g.sweep(A, j), j));
      if (r !== undefined) { g.walk(r); g.pull(A); A = r; continue; }
      return 'stuck';
    }
    const p = g.path(A, i => !g.nodes[i].pile);
    if (!p) return 'stranded';
    for (const v of p.slice(1)) g.walk(v);
    A = g.agent; g.nodes[A].pile = true; founded++;
  }
  return 'step budget';
}

// Spanning-tree post-order: each step, rebuild the MST of the live k-disk graph rooted at the start node R,
// take the deepest node v whose subtree is finished, and either cut it as a final pile (if >= t and enough
// mass remains for the other piles) or walk to its tree parent and pull v in. Leaf removal never disconnects
// the tree; the capsule can still sweep a bridge, so each pull is also checked with safeAfter.
function mstOverAlive(g, R) {
  const n = g.nodes.length, inT = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
  const alive = []; for (let i = 0; i < n; i++) if (g.nodes[i].alive) alive.push(i);
  const children = new Map(alive.map(i => [i, []])), parent = new Int32Array(n).fill(-1);
  best[R] = 0;
  for (let it = 0; it < alive.length; it++) {
    let u = -1; for (const i of alive) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i;
    if (best[u] === Infinity) break; // disconnected remainder
    inT[u] = 1; parent[u] = from[u]; if (from[u] >= 0) children.get(from[u]).push(u);
    for (const v of alive) if (!inT[v]) { const dd = dist(g.nodes[u], g.nodes[v]); if (dd < best[v]) { best[v] = dd; from[v] = u; } }
  }
  const post = [], st = [R];
  while (st.length) { const v = st.pop(); post.push(v); for (const c of children.get(v)) st.push(c); }
  return { parent, post: post.reverse() };
}

function collectTree(g) {
  const R = g.agent, final = new Uint8Array(g.nodes.length);
  g.nodes[R].pile = true; // found the root pile up front so no capsule can sweep it away
  let finals = 0, finalMass = 0;
  const okIfCut = (b, j) => final[j] === 1;
  for (let step = 0; step < 6 * P.N; step++) {
    const { parent, post } = mstOverAlive(g, R);
    const open = new Int32Array(g.nodes.length);
    for (const v of post) if (v !== R && !final[v]) open[parent[v]]++;
    let acted = false, pending = false;
    for (const v of post) {
      if (v === R || final[v] || open[v] > 0) continue;
      pending = true;
      const b = g.nodes[v];
      if (b.mass >= P.t && finals < P.n - 1 && P.N - finalMass - b.mass >= (P.n - 1 - finals) * P.t) {
        final[v] = 1; b.pile = true; finals++; finalMass += b.mass; acted = true; break;
      }
      const p = parent[v];
      if (!g.safeAfter(g.sweep(v, p), p, okIfCut)) continue;
      if (g.agent !== p) { const path = g.path(g.agent, i => i === p); if (!path) return 'stranded'; for (const x of path.slice(1)) g.walk(x); }
      g.pull(v); acted = true; break;
    }
    if (!pending) return 'collected';
    if (!acted) return 'stuck';
  }
  return 'step budget';
}

// Merge smallest piles into a neighbouring pile (within k) until n remain.
function mergeDown(g) {
  for (let guard = 0; guard < 1000; guard++) {
    const piles = g.nodes.map((b, i) => [b, i]).filter(([b]) => b.alive && b.pile).sort((x, y) => x[0].mass - y[0].mass);
    if (piles.length <= P.n) return;
    let merged = false;
    for (const [S, si] of piles) {
      const B = piles.filter(([b, bi]) => bi !== si && dist(b, S) <= g.k).sort((x, y) => dist(x[0], S) - dist(y[0], S))[0];
      if (!B) continue;
      const p = B[1] === g.agent ? [g.agent] : g.path(g.agent, i => i === B[1]);
      if (!p) continue;
      for (const v of p.slice(1)) g.walk(v);
      g.pull(si); merged = true; break;
    }
    if (!merged) return;
  }
}

function runOnce(seed, policy) {
  const r = mulberry32(seed);
  const nodes = genPoints(r);
  const kmin = emstMaxEdge(nodes);
  const g = new Game(nodes, P.kMul * kmin, P.l);
  g.agent = Math.floor(r() * nodes.length);
  const status = policy === 'tree' ? collectTree(g) : policy === 'quota-far' ? collectQuota(g, true) : policy === 'quota-near' ? collectQuota(g, false) : collect(g, policy === 'snowball');
  mergeDown(g);
  const piles = g.piles().map(b => b.mass).sort((a, b) => b - a);
  const ok = g.loose() === 0 && piles.length === P.n && piles.every(m => m >= P.t);
  const why = ok ? 'ok' : status !== 'collected' ? status : piles.length !== P.n ? `ended with ${piles.length} piles` : 'pile below t';
  return { kmin, ok, why, piles, strokes: g.strokes, walks: g.walks, travel: g.travel, work: g.work };
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log(`N=${P.N} box=${P.W}x${P.H} clumps=${P.clumps} sigma=${P.sigma} frac=${P.frac} | n=${P.n} t=${P.t} k=${P.kMul}*kmin l=${P.l} runs=${P.runs}`);
for (const policy of (process.env.POLICIES || 'greedy,snowball,quota-far,tree').split(',')) {
  const res = Array.from({ length: P.runs }, (_, i) => runOnce(P.seed + i, policy));
  const why = {}; for (const x of res) why[x.why] = (why[x.why] || 0) + 1;
  const ok = res.filter(x => x.ok);
  const f = (key, xs) => (xs.length ? mean(xs.map(x => x[key])).toFixed(1) : '-');
  console.log(`${policy.padEnd(11)} success ${ok.length}/${P.runs}  kmin~${f('kmin', res)}  strokes ${f('strokes', ok)}  walks ${f('walks', ok)}  travel ${f('travel', ok)}  work ${f('work', ok)}  outcomes ${JSON.stringify(why)}`);
  console.log(`   example piles: ${JSON.stringify(res[0].piles.slice(0, 12))}${res[0].piles.length > 12 ? '…' : ''} (${res[0].why})`);
}
