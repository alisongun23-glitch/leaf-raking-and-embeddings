import { within2, dist, dist2, segDist2 } from './geometry.js';
import { Grid, buildReachGraph } from './grid.js';
import { EMPTY, LOOSE, PILE } from './kinds.js';
import { strokeVerdict, startVerdict, foundVerdict } from './safety.js';
import { DEFAULT_TIME } from './metrics.js';

export { EMPTY, LOOSE, PILE };

export const DEFAULT_RULES = Object.freeze({
  destination: 'stand', // 'stand': rake into the pile you stand on | 'push' | 'free'
  sweepPiles: false, // do strokes also drag piles they pass over?
  stepBudgetFactor: 20, // the run fails after this many moves per point
});

const OK = Object.freeze({ ok: true, mode: 'none' });

function freshCounters(N) {
  return {
    moves: 0, strokes: 0, pointStrokes: 0, mergeStrokes: 0, foundings: 0, walks: 0,
    walkDist: 0, rakeDist: 0, work: 0, captures: 0,
    nLoose: N, nPiles: 0, nFull: 0, nSmall: 0, excess: 0,
    // piles cut off from the raker for good; allowed only once they hold at least t
    detPiles: 0, detMass: 0, detExcess: 0,
  };
}

function cleanMove(m) {
  const out = { type: m.type };
  for (const key of ['at', 'from', 'to']) {
    if (m[key] !== undefined) out[key] = typeof m[key] === 'object' && m[key] !== null ? { x: m[key].x, y: m[key].y } : m[key];
  }
  return out;
}

// One run of the raking game on a fixed field. Sites are the N original point positions (plus, with
// free pile placement, sites created during play); each holds nothing, a loose point, or a pile.
// The raker always stands on a non-empty site. Moves: start, walk, found, rake (see resolve()).
export class Game {
  constructor(field, cfg) {
    const N = field.xs.length;
    const { n, t, k, l } = cfg;
    if (!(N >= 1)) throw new Error('The field has no points.');
    if (!(Number.isInteger(n) && n >= 1)) throw new Error('n must be a whole number of at least 1.');
    if (!(Number.isInteger(t) && t >= 1)) throw new Error('t must be a whole number of at least 1.');
    if (!(k > 0)) throw new Error('Reach k must be positive.');
    if (!(l >= 0)) throw new Error('Rake half-width l cannot be negative.');
    this.W = field.W;
    this.H = field.H;
    this.N = N;
    this.n = n;
    this.t = t;
    this.k = k;
    this.l = l;
    this.rules = { ...DEFAULT_RULES, ...(cfg.rules || {}) };
    this.timeCfg = { ...DEFAULT_TIME, ...(cfg.time || {}) }; // how long moves take (see metrics.js)
    this.s = N - n * t; // spare points: the overflow budget for "at least t"

    const cap = this.rules.destination === 'free' ? 2 * N + 1 : N + 1;
    this.cap = cap;
    this.size = N;
    this.x = new Float64Array(cap);
    this.y = new Float64Array(cap);
    this.x.set(field.xs);
    this.y.set(field.ys);
    this.kind = new Uint8Array(cap).fill(LOOSE, 0, N);
    this.mass = new Int32Array(cap).fill(1, 0, N);
    this.detached = new Uint8Array(cap);
    this.grid = new Grid(this.x, this.y, N, this.W, this.H, k);
    this.graph = buildReachGraph(this.x, this.y, N, this.grid, k);

    this.raker = -1;
    this.c = freshCounters(N);
    this.history = [];
    this.log = [];
    this.status = 'ready';
    this.reason = '';
    this.detail = '';
    this.stepBudget = Math.max(100, Math.round(this.rules.stepBudgetFactor * N));

    // scratch arrays for searches, reused through a generation stamp
    this.gen = 0;
    this.scratchMark = new Int32Array(cap);
    this.scratchOwner = new Int32Array(cap);
    this.scratchDel = new Int32Array(cap);
  }

  nextGen() {
    if (++this.gen === 0x7fffffff) {
      this.gen = 1;
      this.scratchMark.fill(0);
      this.scratchDel.fill(0);
    }
    return this.gen;
  }

  get done() { return this.status === 'success' || this.status === 'failed'; }
  isSite(i) { return Number.isInteger(i) && i >= 0 && i < this.size; }
  active(j) { return this.kind[j] !== EMPTY && this.detached[j] === 0; }
  d(i, j) { return dist(this.x[i], this.y[i], this.x[j], this.y[j]); }
  inReach(i, j) { return within2(dist2(this.x[i], this.y[i], this.x[j], this.y[j]), this.k); }

  // fn(j) for every live, reachable-in-principle site within k of site i.
  forEachNeighbor(i, fn) {
    const kind = this.kind, det = this.detached;
    if (i < this.N) {
      const { off, nbr } = this.graph;
      for (let e = off[i], end = off[i + 1]; e < end; e++) {
        const j = nbr[e];
        if (kind[j] !== EMPTY && det[j] === 0) fn(j);
      }
      if (this.size === this.N) return;
    }
    const xi = this.x[i], yi = this.y[i], k = this.k, N = this.N, orig = i < N;
    this.grid.forEachInRect(xi - k, yi - k, xi + k, yi + k, j => {
      if (j === i || (orig && j < N) || kind[j] === EMPTY || det[j] !== 0) return;
      if (within2(dist2(xi, yi, this.x[j], this.y[j]), k)) fn(j);
    });
  }

  neighbors(i) {
    const out = [];
    this.forEachNeighbor(i, j => out.push(j));
    return out;
  }

  hasNeighbor(i) {
    let any = false;
    this.forEachNeighbor(i, () => { any = true; });
    return any;
  }

  // Live loose points (and piles, if strokes drag piles) within l of segment a-b, except skipA/skipB.
  capsule(ax, ay, bx, by, skipA = -1, skipB = -1) {
    const out = [], l = this.l, sweepPiles = this.rules.sweepPiles, kind = this.kind;
    this.grid.forEachInRect(Math.min(ax, bx) - l, Math.min(ay, by) - l, Math.max(ax, bx) + l, Math.max(ay, by) + l, j => {
      if (j === skipA || j === skipB) return;
      const kd = kind[j];
      if (kd === EMPTY || this.detached[j] !== 0 || (kd === PILE && !sweepPiles)) return;
      if (within2(segDist2(this.x[j], this.y[j], ax, ay, bx, by), l)) out.push(j);
    });
    return out;
  }

  // Validates a move and works out its full effect without changing anything.
  //   { type: 'start', at }        stand on site `at` (first move only)
  //   { type: 'walk', to }         step to a point or pile within k
  //   { type: 'found' }            turn the loose point you stand on into a pile of 1
  //   { type: 'rake', from, to? }  drag `from` (within k) into a pile, sweeping every loose point within l
  //                                of the stroke. `to` defaults to where you stand; push mode lets it be
  //                                any site within k of `from`, free mode also an {x, y} spot.
  resolve(m) {
    const fail = reason => ({ ok: false, legal: false, reason });
    if (this.done) return fail('the run is over');
    if (!m || typeof m !== 'object') return fail('no move');
    const a = this.raker;
    if (m.type === 'start') {
      if (a !== -1) return fail('already started');
      if (!this.isSite(m.at) || !this.active(m.at)) return fail('the start must be a point');
      return { ok: true, legal: true, type: 'start', at: m.at };
    }
    if (a === -1) return fail('choose a start point first');
    if (m.type === 'walk') {
      const v = m.to;
      if (!this.isSite(v) || !this.active(v)) return fail('nothing to step onto there');
      if (v === a) return fail('already standing there');
      if (!this.inReach(a, v)) return fail('that is beyond reach k');
      return { ok: true, legal: true, type: 'walk', to: v, walkLen: this.d(a, v) };
    }
    if (m.type === 'found') {
      if (this.kind[a] !== LOOSE) return fail('you are already on a pile');
      return { ok: true, legal: true, type: 'found', at: a };
    }
    if (m.type === 'rake') return this.resolveRake(m);
    return fail(`unknown move "${m.type}"`);
  }

  resolveRake(m) {
    const fail = reason => ({ ok: false, legal: false, reason });
    const a = this.raker, o = m.from, mode = this.rules.destination;
    if (!this.isSite(o) || !this.active(o)) return fail('nothing to rake there');
    if (o !== a && !this.inReach(a, o)) return fail('that is beyond reach k');
    let D = a, loc = null;
    if (m.to !== undefined && m.to !== null && m.to !== a) {
      if (mode === 'stand') return fail('rakes go into the pile you stand on (push mode is off)');
      if (typeof m.to === 'object') {
        if (mode !== 'free') return fail('free pile placement is off');
        const { x, y } = m.to;
        if (!(x >= 0 && x <= this.W && y >= 0 && y <= this.H)) return fail('that spot is outside the field');
        if (!within2(dist2(this.x[o], this.y[o], x, y), this.k)) return fail('that spot is beyond reach k of what you are raking');
        D = -1;
        loc = { x, y };
      } else {
        D = m.to;
        if (!this.isSite(D) || !this.active(D)) return fail('there is nothing at the destination');
        if (!this.inReach(o, D)) return fail('the destination is beyond reach k of what you are raking');
      }
    }
    if (D === o) return fail('cannot rake something into itself');

    const ox = this.x[o], oy = this.y[o];
    const dx = D >= 0 ? this.x[D] : loc.x, dy = D >= 0 ? this.y[D] : loc.y;
    const captured = this.capsule(ox, oy, dx, dy, o, D);
    const del = [o, ...captured];
    const t = this.t, c = this.c;
    let massMoved = 0, work = 0, looseMoved = 0;
    let nPiles = c.nPiles, nFull = c.nFull, nSmall = c.nSmall, excess = c.excess;
    const dropPile = mm => { nPiles--; if (mm >= t) { nFull--; excess -= mm - t; } else nSmall--; };
    for (const j of del) {
      const mj = this.mass[j];
      massMoved += mj;
      work += mj * dist(this.x[j], this.y[j], dx, dy);
      if (this.kind[j] === LOOSE) looseMoved++;
      else dropPile(mj);
    }
    const wasLooseD = D >= 0 && this.kind[D] === LOOSE;
    const oldMassD = D >= 0 ? this.mass[D] : 0;
    if (D >= 0 && !wasLooseD) dropPile(oldMassD);
    const newMassD = oldMassD + massMoved;
    nPiles++;
    if (newMassD >= t) { nFull++; excess += newMassD - t; } else nSmall++;
    const newRaker = D === a ? a : D >= 0 ? D : -2; // -2: the site this move creates
    return {
      ok: true,
      legal: true,
      type: 'rake',
      from: o,
      D,
      loc,
      captured,
      del,
      merge: this.kind[o] === PILE,
      founds: D < 0 || wasLooseD,
      massMoved,
      oldMassD,
      newMassD,
      work,
      rakeLen: dist(ox, oy, dx, dy),
      walkLen: D !== a && o !== a ? this.d(a, o) : 0,
      newRaker,
      after: { nLoose: c.nLoose - looseMoved - (wasLooseD ? 1 : 0), nPiles, nFull, nSmall, excess },
      spendsBudget: excess > c.excess,
    };
  }

  // resolve() plus the safety verdict, without changing anything. `safe` is false when the move
  // would cut off work, starve a pile, or freeze too many piles.
  preview(m) {
    const r = this.resolve(m);
    if (!r.legal) return r;
    if (r.type === 'rake') r.verdict = strokeVerdict(this, r);
    else if (r.type === 'found') r.verdict = foundVerdict(this);
    else if (r.type === 'start') r.verdict = startVerdict(this, r.at);
    else r.verdict = OK;
    r.safe = r.verdict.ok;
    return r;
  }

  isSafe(m) {
    const r = this.preview(m);
    return r.legal && r.safe;
  }

  // preview() as if the raker were standing on `at`. Walking changes nothing but the raker's position,
  // so this is exactly what the move would do after walking there.
  previewFrom(at, m) {
    const save = this.raker;
    this.raker = at;
    try { return this.preview(m); } finally { this.raker = save; }
  }

  // Plays a move. Illegal moves end the run as an algorithm error; legal but unsafe moves are played
  // and the run ends with the failure they cause (so manual play can show what went wrong, then undo).
  apply(m) {
    const r = this.resolve(m);
    if (!r.legal) {
      this.history.push({ move: m, raker: this.raker, c: { ...this.c }, changes: [], detached: [], created: -1, size: this.size, status: this.status, reason: this.reason, detail: this.detail });
      this.log.push(cleanMove(m));
      this.status = 'failed';
      this.reason = 'illegal';
      this.detail = r.reason;
      return r;
    }
    const frame = { move: m, raker: this.raker, c: { ...this.c }, changes: [], detached: [], created: -1, size: this.size, status: this.status, reason: this.reason, detail: this.detail };
    const c = this.c;
    let verdict = OK;
    switch (r.type) {
      case 'start':
        verdict = startVerdict(this, r.at);
        this.raker = r.at;
        break;
      case 'walk':
        c.walks++;
        c.walkDist += r.walkLen;
        this.raker = r.to;
        break;
      case 'found':
        verdict = foundVerdict(this);
        this.set(frame, r.at, PILE, 1);
        c.nLoose--;
        this.addPile(1);
        c.foundings++;
        break;
      case 'rake':
        verdict = strokeVerdict(this, r);
        this.applyRake(frame, r, verdict);
        break;
    }
    c.moves++;
    this.history.push(frame);
    this.log.push(cleanMove(m));
    this.settle(verdict);
    r.verdict = verdict;
    r.safe = verdict.ok;
    return r;
  }

  applyRake(frame, r, verdict) {
    const c = this.c;
    let D = r.D;
    if (D < 0) {
      D = this.size++;
      this.x[D] = r.loc.x;
      this.y[D] = r.loc.y;
      this.grid.add(D, r.loc.x, r.loc.y);
      frame.created = D;
    }
    for (const j of r.del) {
      if (this.kind[j] === PILE) this.dropPile(this.mass[j]);
      else c.nLoose--;
      this.set(frame, j, EMPTY, 0);
    }
    if (this.kind[D] === PILE) this.dropPile(this.mass[D]);
    else {
      if (this.kind[D] === LOOSE) c.nLoose--;
      c.foundings++;
    }
    this.set(frame, D, PILE, r.newMassD);
    this.addPile(r.newMassD);
    c.strokes++;
    if (r.merge) c.mergeStrokes++;
    else c.pointStrokes++;
    c.captures += r.captured.length;
    c.rakeDist += r.rakeLen;
    c.walkDist += r.walkLen;
    c.work += r.work;
    this.raker = r.newRaker === -2 ? D : r.newRaker;
    if (verdict.ok && verdict.mode !== 'none') this.freeze(frame, verdict);
  }

  // Marks the components a stroke cut loose (finished piles only) as frozen.
  freeze(frame, verdict) {
    const c = this.c;
    if (verdict.mode === 'groups') {
      for (const j of verdict.list) {
        if (this.kind[j] !== EMPTY && !this.detached[j]) { this.detached[j] = 1; frame.detached.push(j); }
      }
    } else if (verdict.mode === 'others') {
      for (let j = 0; j < this.size; j++) {
        if (this.kind[j] !== EMPTY && !this.detached[j] && !verdict.inRakerComponent(j)) { this.detached[j] = 1; frame.detached.push(j); }
      }
    }
    c.detPiles += verdict.outside.full;
    c.detMass += verdict.outside.mass;
    c.detExcess += verdict.outside.excess;
  }

  set(frame, j, kind, mass) {
    frame.changes.push(j, this.kind[j], this.mass[j]);
    this.kind[j] = kind;
    this.mass[j] = mass;
  }

  addPile(m) {
    const c = this.c;
    c.nPiles++;
    if (m >= this.t) { c.nFull++; c.excess += m - this.t; } else c.nSmall++;
  }

  dropPile(m) {
    const c = this.c;
    c.nPiles--;
    if (m >= this.t) { c.nFull--; c.excess -= m - this.t; } else c.nSmall--;
  }

  settle(verdict) {
    const c = this.c;
    if (!verdict.ok) {
      this.status = 'failed';
      this.reason = verdict.reason;
      this.detail = verdict.detail || '';
      return;
    }
    if (c.nLoose === 0 && c.nPiles === this.n && c.nFull === this.n) {
      this.status = 'success';
      this.reason = '';
      this.detail = '';
      return;
    }
    if (c.moves >= this.stepBudget) {
      this.status = 'failed';
      this.reason = 'step-budget';
      this.detail = `no finish within ${this.stepBudget} moves`;
      return;
    }
    if (this.raker >= 0 && !this.hasNeighbor(this.raker)) {
      this.status = 'failed';
      this.reason = 'stranded';
      this.detail = 'nothing is within reach k and the job is not finished';
      return;
    }
    this.status = 'running';
  }

  // Ends the run because the algorithm has no move to offer.
  giveUp(detail = 'the algorithm found no move it was willing to make') {
    if (this.done) return;
    this.history.push({ move: { type: 'give-up' }, raker: this.raker, c: { ...this.c }, changes: [], detached: [], created: -1, size: this.size, status: this.status, reason: this.reason, detail: this.detail });
    this.log.push({ type: 'give-up' });
    this.status = 'failed';
    this.reason = 'gave-up';
    this.detail = detail;
  }

  undo() {
    const f = this.history.pop();
    if (!f) return false;
    const ch = f.changes;
    for (let i = ch.length - 3; i >= 0; i -= 3) {
      this.kind[ch[i]] = ch[i + 1];
      this.mass[ch[i]] = ch[i + 2];
    }
    for (const j of f.detached) this.detached[j] = 0;
    if (f.created >= 0) this.grid.remove(f.created, this.x[f.created], this.y[f.created]);
    this.size = f.size;
    this.raker = f.raker;
    this.c = f.c;
    this.status = f.status;
    this.reason = f.reason;
    this.detail = f.detail;
    this.log.pop();
    return true;
  }

  // Indices of current piles (largest first).
  piles() {
    const out = [];
    for (let j = 0; j < this.size; j++) if (this.kind[j] === PILE) out.push(j);
    return out.sort((p, q) => this.mass[q] - this.mass[p]);
  }
}
