import { LOOSE, PILE } from '../core/kinds.js';
import { fmt } from './render.js';
import { reasonLabel } from './panels.js';

// Play mode: you are the raker. Hover a point or pile within reach to preview the stroke (green = safe,
// amber = spends spare points, red = would cut something off or starve a pile); click to rake it into
// the pile you stand on, shift-click to walk there, F to found a pile where you stand, U to undo. In
// push and free modes, drag from what you rake to where it should go. Unsafe moves are allowed, so you
// can see what goes wrong, then undo.
export class ManualPlay {
  constructor(view, canvas, tooltip, hooks) {
    this.view = view;
    this.canvas = canvas;
    this.tip = tooltip;
    this.hooks = hooks;
    this.on = false;
    this.drag = null;
    this.shift = false;
    this.last = null;
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointerleave', () => this.clear());
    window.addEventListener('keydown', e => this.key(e));
    window.addEventListener('keyup', e => { if (e.key === 'Shift') { this.shift = false; if (this.last) this.move(this.last); } });
  }

  enable(on) {
    this.on = on;
    this.clear();
  }

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  clear() {
    this.tip.hidden = true;
    const o = this.hooks.overlays();
    o.preview = null;
    o.hover = -1;
    this.hooks.redraw();
  }

  showTip(px, py, html) {
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const wrap = this.canvas.parentElement.getBoundingClientRect(), tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let x = px + 16, y = py + 16;
    if (x + tw > wrap.width - 6) x = px - tw - 16;
    if (y + th > wrap.height - 6) y = py - th - 16;
    this.tip.style.left = `${Math.max(6, x)}px`;
    this.tip.style.top = `${Math.max(6, y)}px`;
  }

  // Preview of raking `from` (into `to`, or into the pile you stand on), as an overlay + tooltip text.
  previewRake(from, to) {
    const g = this.hooks.game(), m = { type: 'rake', from };
    if (to !== undefined && to !== g.raker) m.to = to;
    const r = g.preview(m);
    if (!r.legal) return { move: m, html: `<span class="t-bad">Not allowed:</span> ${r.reason}`, overlay: null };
    const tone = !r.safe ? 'bad' : r.spendsBudget ? 'spend' : 'safe';
    const dest = r.D >= 0 ? { x: g.x[r.D], y: g.y[r.D] } : r.loc;
    const overlay = { ax: g.x[from], ay: g.y[from], bx: dest.x, by: dest.y, l: g.l, captured: r.captured, tone };
    const what = g.kind[from] === PILE ? `merge a pile of ${g.mass[from]}` : 'rake this point';
    const verdict = !r.safe
      ? `<span class="t-bad">✗ ${reasonLabel(r.verdict.reason)}</span><br>${r.verdict.detail || ''}`
      : r.spendsBudget
        ? `<span class="t-warn">⚠ Safe, but uses spare points</span> (pile goes past ${g.t})`
        : '<span class="t-safe">✓ Safe</span>';
    const html = `<b>${what[0].toUpperCase()}${what.slice(1)}</b>: +${r.massMoved} point${r.massMoved > 1 ? 's' : ''}` +
      `${r.captured.length ? ` (${r.captured.length} swept up)` : ''}, pile → ${r.newMassD}<br>work +${fmt(r.work)}, stroke ${fmt(r.rakeLen)}<br>${verdict}`;
    return { move: m, html, overlay };
  }

  move(e) {
    if (!this.on) return;
    this.last = e;
    this.shift = e.shiftKey;
    const g = this.hooks.game(), { px, py } = this.pos(e), o = this.hooks.overlays();
    const j = this.view.pick(px, py);
    o.hover = j;
    o.preview = null;
    if (g.done) {
      this.showTip(px, py, `The run is over (${g.status === 'success' ? 'finished' : reasonLabel(g.reason)}). Press <b>U</b> to undo.`);
      this.hooks.redraw();
      return;
    }
    if (this.drag) {
      const dest = this.dropTarget(px, py);
      const pv = dest === null ? null : this.previewRake(this.drag.from, dest);
      if (pv) { o.preview = pv.overlay; this.showTip(px, py, pv.html); } else this.showTip(px, py, 'Drop onto a point or pile within reach of what you are pushing.');
      this.hooks.redraw();
      return;
    }
    if (g.raker < 0) {
      if (j >= 0) this.showTip(px, py, '<b>Start here</b> (click)');
      else this.tip.hidden = true;
    } else if (j < 0) {
      this.tip.hidden = true;
    } else if (j === g.raker) {
      this.showTip(px, py, g.kind[j] === PILE ? `You stand on a pile of <b>${g.mass[j]}</b>.` : 'You stand on a loose point. <b>F</b> makes it a pile; raking into it does too.');
    } else if (!g.inReach(g.raker, j)) {
      this.showTip(px, py, `Out of reach (more than k = ${fmt(g.k)} away).`);
    } else if (this.shift) {
      this.showTip(px, py, '<b>Walk here</b> (shift-click). Nothing moves.');
    } else {
      const pv = this.previewRake(j);
      o.preview = pv.overlay;
      this.showTip(px, py, pv.html + (g.rules.destination !== 'stand' ? '<br><span class="muted">Drag instead to push it somewhere else.</span>' : ''));
    }
    this.hooks.redraw();
  }

  // Where a push drag would land: a site within k of the dragged object, or a free spot in free mode.
  dropTarget(px, py) {
    const g = this.hooks.game(), j = this.view.pick(px, py, 18), from = this.drag.from;
    if (j >= 0 && j !== from && g.inReach(from, j)) return j;
    if (g.rules.destination === 'free') {
      const p = this.view.toWorld(px, py);
      if (Math.hypot(p.x - g.x[from], p.y - g.y[from]) <= g.k && p.x >= 0 && p.y >= 0 && p.x <= g.W && p.y <= g.H) return { x: p.x, y: p.y };
    }
    return null;
  }

  down(e) {
    if (!this.on || e.button !== 0) return;
    const g = this.hooks.game(), { px, py } = this.pos(e), j = this.view.pick(px, py);
    if (g.done || j < 0) return;
    if (g.raker < 0) { this.hooks.apply({ type: 'start', at: j }); return; }
    if (e.shiftKey) {
      if (j !== g.raker && g.inReach(g.raker, j)) this.hooks.apply({ type: 'walk', to: j });
      return;
    }
    if (g.rules.destination !== 'stand' && (j === g.raker || g.inReach(g.raker, j))) {
      this.drag = { from: j, px, py, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (j !== g.raker && g.inReach(g.raker, j)) this.hooks.apply({ type: 'rake', from: j });
  }

  up(e) {
    if (!this.on || !this.drag) return;
    const g = this.hooks.game(), { px, py } = this.pos(e), d = this.drag;
    this.drag = null;
    const far = Math.hypot(px - d.px, py - d.py) > 6;
    if (!far) { if (d.from !== g.raker) this.hooks.apply({ type: 'rake', from: d.from }); return; }
    const dest = this.dropTarget(px, py);
    if (dest !== null) this.hooks.apply(dest === g.raker ? { type: 'rake', from: d.from } : { type: 'rake', from: d.from, to: dest });
    else this.clear();
  }

  key(e) {
    if (!this.on || e.target.closest('input, select, textarea')) return;
    if (e.key === 'Shift') { this.shift = true; if (this.last) this.move(this.last); return; }
    const g = this.hooks.game();
    if (e.key === 'f' || e.key === 'F') {
      if (!g.done && g.raker >= 0 && g.kind[g.raker] === LOOSE) this.hooks.apply({ type: 'found' });
    } else if (e.key === 'u' || e.key === 'U' || ((e.metaKey || e.ctrlKey) && e.key === 'z')) {
      e.preventDefault();
      this.hooks.undo();
    } else if (e.key === 'Escape') {
      this.drag = null;
      this.clear();
    }
  }
}
