import { EMPTY, LOOSE, PILE } from '../core/kinds.js';

// Canvas view of the field. The app hands it a scene (game, instance, display toggles, overlays) and
// asks it to draw; it also maps between screen pixels and field coordinates and picks sites under the
// pointer. Colours come from the CSS tokens, so the view follows the light/dark theme.

const cssVar = (style, name) => style.getPropertyValue(name).trim();
function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export class FieldView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = null;
    this.view = { sc: 1, ox: 0, oy: 0, w: 1, h: 1 };
    this.tweens = [];
    this.colors = null;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.colors = null; this.draw(); });
    this.resize();
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.view.w = Math.max(1, r.width);
    this.view.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.view.w * dpr);
    this.canvas.height = Math.round(this.view.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fit();
    this.draw();
  }

  fit() {
    const s = this.scene;
    if (!s) return;
    const { W, H } = s.inst.field, pad = 22, { w, h } = this.view;
    const sc = Math.max(1e-6, Math.min((w - 2 * pad) / W, (h - 2 * pad) / H));
    this.view.sc = sc;
    this.view.ox = (w - W * sc) / 2;
    this.view.oy = (h - H * sc) / 2;
  }

  setScene(scene) {
    this.scene = scene;
    this.fit();
  }

  refreshColors() { this.colors = null; }

  sx(x) { return this.view.ox + x * this.view.sc; }
  sy(y) { return this.view.oy + y * this.view.sc; }
  toWorld(px, py) { return { x: (px - this.view.ox) / this.view.sc, y: (py - this.view.oy) / this.view.sc }; }

  // The live site nearest the pointer, within maxPx pixels (or -1).
  pick(px, py, maxPx = 14) {
    const s = this.scene;
    if (!s) return -1;
    const g = s.game, p = this.toWorld(px, py), r = maxPx / this.view.sc;
    let best = -1, bd = r * r;
    g.grid.forEachInRect(p.x - r, p.y - r, p.x + r, p.y + r, j => {
      if (!g.active(j)) return;
      const dx = g.x[j] - p.x, dy = g.y[j] - p.y, d2 = dx * dx + dy * dy;
      if (d2 <= bd) { bd = d2; best = j; }
    });
    return best;
  }

  pointRadius() {
    const s = this.scene;
    return Math.min(4.5, Math.max(1.6, 0.2 * this.view.sc * s.inst.bounds.spacing));
  }
  pileRadius(m) {
    return Math.min(42, this.pointRadius() * (1.15 + 0.8 * Math.sqrt(m)));
  }

  addTween(x0, y0, x1, y1, mass, dur) {
    this.tweens.push({ x0, y0, x1, y1, mass, t0: performance.now(), dur });
  }
  get animating() {
    const now = performance.now();
    return this.tweens.some(tw => now - tw.t0 < tw.dur) || this.tweens.length > 0;
  }

  palette() {
    if (this.colors) return this.colors;
    const st = getComputedStyle(document.documentElement), c = name => cssVar(st, name);
    this.colors = {
      surface: c('--surface'), surface2: c('--surface-2'), line: c('--line'), line2: c('--line-2'), ink: c('--ink'), ink2: c('--ink-2'), muted: c('--muted'),
      leaf: c('--leaf'), leafFaint: c('--leaf-faint'), open: c('--pile-open'), done: c('--pile-done'), reach: c('--reach'),
      good: c('--good'), warn: c('--warn'), critical: c('--critical'), accent: c('--accent'),
    };
    return this.colors;
  }

  draw() {
    const ctx = this.ctx, s = this.scene, { w, h, sc } = this.view;
    const C = this.palette();
    ctx.clearRect(0, 0, w, h);
    if (!s) return;
    const g = s.game, f = s.inst.field, d = s.display, o = s.overlays || {};
    const pr = this.pointRadius();

    // field
    ctx.fillStyle = C.surface2;
    ctx.strokeStyle = C.line2;
    ctx.lineWidth = 1;
    roundRect(ctx, this.sx(0) - 6, this.sy(0) - 6, f.W * sc + 12, f.H * sc + 12, 8);
    ctx.fill();
    ctx.stroke();

    // reach links among live sites
    if (d.links) {
      const { edgeU, edgeV, edgeCount } = g.graph;
      ctx.strokeStyle = rgba(C.reach, 0.18);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let e = 0; e < edgeCount; e++) {
        const u = edgeU[e], v = edgeV[e];
        if (!g.active(u) || !g.active(v)) continue;
        ctx.moveTo(this.sx(g.x[u]), this.sy(g.y[u]));
        ctx.lineTo(this.sx(g.x[v]), this.sy(g.y[v]));
      }
      ctx.stroke();
    }

    // bottleneck: the longest spanning-tree edge, the gap that sets M
    const bn = s.inst.tree.bottleneck;
    if (bn && (d.bottleneck || s.inst.k < s.inst.M * (1 - 1e-9))) {
      const [u, v] = bn;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = C.critical;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.sx(f.xs[u]), this.sy(f.ys[u]));
      ctx.lineTo(this.sx(f.xs[v]), this.sy(f.ys[v]));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.critical;
      ctx.font = '600 11.5px system-ui, sans-serif';
      ctx.fillText(`gap M = ${fmt(s.inst.M)}`, (this.sx(f.xs[u]) + this.sx(f.xs[v])) / 2 + 6, (this.sy(f.ys[u]) + this.sy(f.ys[v])) / 2 - 6);
    }

    // raker trail
    if (d.trail && o.trail && o.trail.length > 1) {
      const pts = o.trail, start = Math.max(0, pts.length - 400);
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      for (let i = start + 1; i < pts.length; i++) {
        const a = 0.08 + 0.42 * ((i - start) / (pts.length - start));
        ctx.strokeStyle = rgba(C.ink2, a);
        ctx.beginPath();
        ctx.moveTo(this.sx(pts[i - 1][0]), this.sy(pts[i - 1][1]));
        ctx.lineTo(this.sx(pts[i][0]), this.sy(pts[i][1]));
        ctx.stroke();
      }
    }

    // last stroke (faint) and hover preview (coloured by its safety verdict)
    if (d.capsule && o.lastStroke) this.capsule(o.lastStroke, rgba(C.accent, 0.13), rgba(C.accent, 0.35));
    if (o.preview) {
      const col = o.preview.tone === 'bad' ? C.critical : o.preview.tone === 'spend' ? C.warn : C.good;
      this.capsule(o.preview, rgba(col, 0.2), rgba(col, 0.75));
    }

    // loose points
    const unreachable = o.unreachable;
    const groups = [[], [], []]; // normal, faint (background), cut off
    for (let j = 0; j < g.size; j++) {
      if (g.kind[j] !== LOOSE) continue;
      if (unreachable && unreachable[j]) groups[2].push(j);
      else if (d.clumps && j < g.N && f.labels && f.labels[j] < 0) groups[1].push(j);
      else groups[0].push(j);
    }
    const dots = (list, color, r) => {
      if (!list.length) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const j of list) {
        const x = this.sx(g.x[j]), y = this.sy(g.y[j]);
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      }
      ctx.fill();
    };
    dots(groups[1], C.leafFaint, pr);
    dots(groups[0], C.leaf, pr);
    dots(groups[2], C.critical, pr * 1.25);

    // highlighted capture set of the preview
    if (o.preview && o.preview.captured) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const j of o.preview.captured) {
        const x = this.sx(g.x[j]), y = this.sy(g.y[j]);
        ctx.moveTo(x + pr + 1.5, y);
        ctx.arc(x, y, pr + 1.5, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }

    // "rake later" points: removing one of these splits the field
    if (d.cuts && o.cuts) {
      ctx.strokeStyle = C.warn;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let j = 0; j < g.size; j++) {
        if (!o.cuts[j] || g.kind[j] === EMPTY) continue;
        const x = this.sx(g.x[j]), y = this.sy(g.y[j]), r = g.kind[j] === PILE ? this.pileRadius(g.mass[j]) + 2.5 : pr + 3;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }

    // piles: amber below t, green at t or more; frozen piles (cut off for good) get a ring
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let j = 0; j < g.size; j++) {
      if (g.kind[j] !== PILE) continue;
      const m = g.mass[j], x = this.sx(g.x[j]), y = this.sy(g.y[j]), r = this.pileRadius(m), full = m >= g.t;
      ctx.fillStyle = full ? C.done : C.open;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.surface;
      ctx.stroke();
      if (g.detached[j]) {
        ctx.strokeStyle = C.ink2;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (d.labels && r >= 8.5) {
        ctx.fillStyle = full ? '#ffffff' : '#0b0b0b';
        ctx.font = `600 ${Math.min(13, Math.max(10, r * 0.62))}px system-ui, sans-serif`;
        ctx.fillText(String(m), x, y + 0.5);
      }
    }

    // moving points while a stroke animates (finished ones are dropped first, so none is left behind)
    const now = performance.now();
    this.tweens = this.tweens.filter(tw => now - tw.t0 < tw.dur);
    if (this.tweens.length) {
      ctx.fillStyle = C.leaf;
      ctx.beginPath();
      for (const tw of this.tweens) {
        const p = Math.min(1, (now - tw.t0) / tw.dur), e = 1 - (1 - p) * (1 - p);
        const x = this.sx(tw.x0 + (tw.x1 - tw.x0) * e), y = this.sy(tw.y0 + (tw.y1 - tw.y0) * e);
        const r = tw.mass > 1 ? this.pileRadius(tw.mass) * 0.8 : pr;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      }
      ctx.fill();
    }

    // hover ring
    if (o.hover >= 0 && g.kind[o.hover] !== EMPTY) {
      const j = o.hover, r = g.kind[j] === PILE ? this.pileRadius(g.mass[j]) + 4 : pr + 5;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.sx(g.x[j]), this.sy(g.y[j]), r, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // raker and its reach circle
    if (g.raker >= 0) {
      const x = this.sx(g.x[g.raker]), y = this.sy(g.y[g.raker]);
      if (d.reach) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = rgba(C.reach, 0.7);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(x, y, g.k * sc, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const base = g.kind[g.raker] === PILE ? this.pileRadius(g.mass[g.raker]) : pr;
      ctx.strokeStyle = C.reach;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, base + 5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = C.reach;
      ctx.beginPath();
      ctx.moveTo(x, y - base - 12);
      ctx.lineTo(x - 5, y - base - 20);
      ctx.lineTo(x + 5, y - base - 20);
      ctx.closePath();
      ctx.fill();
    }
  }

  capsule(c, fill, edge) {
    const ctx = this.ctx, sc = this.view.sc, width = Math.max(3, 2 * c.l * sc);
    const ax = this.sx(c.ax), ay = this.sy(c.ay), bx = this.sx(c.bx), by = this.sy(c.by);
    ctx.lineCap = 'round';
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // arrow head at the destination
    const ang = Math.atan2(by - ay, bx - ax), s = 7;
    if (Math.hypot(bx - ax, by - ay) > 2 * s) {
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - s * Math.cos(ang - 0.45), by - s * Math.sin(ang - 0.45));
      ctx.lineTo(bx - s * Math.cos(ang + 0.45), by - s * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const fmt = v => (!Number.isFinite(v) ? '—' : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
// Seconds as "38 s", "12 min 05 s" or "1 h 04 min".
export const fmtTime = s => {
  if (!Number.isFinite(s)) return '—';
  const r = Math.round(s);
  if (r < 60) return `${r} s`;
  if (r < 3600) return `${Math.floor(r / 60)} min ${String(r % 60).padStart(2, '0')} s`;
  return `${Math.floor(r / 3600)} h ${String(Math.round((r % 3600) / 60)).padStart(2, '0')} min`;
};
