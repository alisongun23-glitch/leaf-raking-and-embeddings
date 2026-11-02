// Small form controls built from dial specs (src/ui/schema.js). Each control reads its value with
// get(path) and writes with set(path, value); update() re-syncs every control and its visibility.

export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
export function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ??= {};
  o[parts[parts.length - 1]] = value;
}

let uid = 0;
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
};
export { el };

// Slider position (0..1) <-> value, for linear, log and square scales.
function toSlider(spec, v) {
  const { min, max } = spec;
  if (spec.scale === 'log') return Math.log(Math.max(v, min) / min) / Math.log(max / min);
  if (spec.scale === 'sq') return Math.sqrt(Math.max(0, (v - min) / (max - min)));
  return (v - min) / (max - min);
}
function fromSlider(spec, s) {
  const { min, max, step = 1 } = spec;
  let v;
  if (spec.scale === 'log') v = min * Math.pow(max / min, s);
  else if (spec.scale === 'sq') v = min + (max - min) * s * s;
  else v = min + (max - min) * s;
  return roundStep(v, step);
}
const roundStep = (v, step) => {
  const d = Math.max(0, -Math.floor(Math.log10(step)));
  return +(Math.round(v / step) * step).toFixed(d);
};

function makeDial(spec, ctx) {
  const id = `dial-${++uid}`;
  const row = el('div', { class: `dial ${spec.type === 'bool' ? 'bool' : ''}` });
  const readout = el('span', { class: 'readout' });
  let sync;

  if (spec.type === 'range') {
    const slider = el('input', { type: 'range', min: 0, max: 1, step: 0.0005, id, 'aria-label': spec.label });
    const box = el('input', { type: 'number', min: spec.min, max: spec.max, step: spec.step, 'aria-label': `${spec.label} value` });
    const show = v => (spec.percent ? Math.round(v * 100) : v);
    const read = v => (spec.percent ? v / 100 : v);
    slider.addEventListener('input', () => ctx.set(spec.path, fromSlider(spec, +slider.value)));
    box.addEventListener('change', () => {
      const v = read(+box.value);
      if (Number.isFinite(v)) ctx.set(spec.path, Math.min(spec.max, Math.max(spec.min, v)));
    });
    if (spec.percent) { box.min = 0; box.max = 100; box.step = 1; }
    row.append(el('div', { class: 'top' }, el('label', { for: id, text: spec.label }), readout), el('div', { class: 'ctl' }, slider, box));
    sync = v => {
      if (document.activeElement !== slider) slider.value = toSlider(spec, v);
      if (document.activeElement !== box) box.value = show(v);
    };
  } else if (spec.type === 'select') {
    const sel = el('select', { id });
    // options: [value, label] or [value, label, group]; consecutive options with a group share an optgroup
    let grp = null, box = sel;
    for (const [v, label, group] of spec.options) {
      if (group !== grp) { grp = group; box = group ? sel.appendChild(el('optgroup', { label: group })) : sel; }
      box.append(el('option', { value: v, text: label }));
    }
    sel.addEventListener('change', () => ctx.set(spec.path, sel.value));
    row.append(el('div', { class: 'top' }, el('label', { for: id, text: spec.label }), readout), sel);
    sync = v => { sel.value = v; };
  } else if (spec.type === 'bool') {
    const box = el('input', { type: 'checkbox', id });
    box.addEventListener('change', () => ctx.set(spec.path, box.checked));
    row.append(el('div', { class: 'ctl' }, el('label', { for: id, text: spec.label }), el('span', { class: 'switch' }, box, el('span'))));
    sync = v => { box.checked = !!v; };
  } else if (spec.type === 'segmented') {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': spec.label });
    const btns = spec.options.map(([v, label]) => {
      const b = el('button', { type: 'button', text: label, 'aria-pressed': 'false', onclick: () => ctx.set(spec.path, v) });
      b.dataset.value = v;
      seg.append(b);
      return b;
    });
    row.append(el('div', { class: 'top' }, el('span', { class: 'name', text: spec.label }), readout), seg);
    sync = v => btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
  } else if (spec.type === 'seed') {
    const box = el('input', { type: 'number', id, min: 1, step: 1 });
    box.addEventListener('change', () => { if (Number.isFinite(+box.value)) ctx.set(spec.path, Math.max(1, Math.round(+box.value))); });
    const dice = el('button', { type: 'button', class: 'ghost', text: 'New field', title: 'Draw a fresh random field', onclick: () => ctx.set(spec.path, 1 + Math.floor(Math.random() * 99999)) });
    const prev = el('button', { type: 'button', class: 'ghost', text: '−', 'aria-label': 'Previous seed', onclick: () => ctx.set(spec.path, Math.max(1, ctx.get(spec.path) - 1)) });
    const next = el('button', { type: 'button', class: 'ghost', text: '+', 'aria-label': 'Next seed', onclick: () => ctx.set(spec.path, ctx.get(spec.path) + 1) });
    box.style.width = '86px';
    row.append(el('div', { class: 'top' }, el('label', { for: id, text: spec.label }), readout), el('div', { class: 'ctl' }, prev, box, next, dice));
    sync = v => { if (document.activeElement !== box) box.value = v; };
  }
  if (spec.help) row.append(el('div', { class: 'help', text: spec.help }));
  return {
    row,
    update(cfg) {
      const visible = spec.show ? spec.show(cfg) : true;
      row.hidden = !visible;
      if (!visible) return;
      sync(ctx.get(spec.path));
      const r = spec.readout ? spec.readout(cfg) : null;
      if (r && typeof r === 'object') { readout.textContent = r.text; readout.className = `readout ${r.cls || ''}`; }
      else readout.textContent = r || '';
    },
  };
}

// Builds collapsible groups of dials into `container`. groups: [{ title, dials, open, extra(el) }].
export function buildDials(container, groups, ctx) {
  const controls = [];
  for (const grp of groups) {
    const details = el('details', { class: 'group' });
    if (grp.open) details.open = true;
    details.append(el('summary', { text: grp.title }));
    const body = el('div', { class: 'body' });
    for (const spec of grp.dials) {
      const d = makeDial(spec, ctx);
      controls.push(d);
      body.append(d.row);
    }
    if (grp.extra) grp.extra(body);
    details.append(body);
    container.append(details);
    if (grp.ref) grp.ref(details, body);
  }
  return { update: cfg => controls.forEach(c => c.update(cfg)) };
}

// Dials for an algorithm's own params (its schema), written into `params`.
export function buildParamDials(container, schema, params, onChange) {
  container.replaceChildren();
  const specs = Object.entries(schema || {}).map(([key, s]) => ({
    ...s,
    path: key,
    type: s.type === 'number' || s.type === 'int' ? 'range' : s.type,
    min: s.min ?? 0,
    max: s.max ?? 1,
    step: s.step ?? (s.type === 'int' ? 1 : 0.01),
  }));
  const ctx = { get: p => params[p], set: (p, v) => { params[p] = v; onChange(); ui.update(); } };
  const ui = { controls: specs.map(s => makeDial(s, ctx)), update() { this.controls.forEach(c => c.update({})); } };
  for (const c of ui.controls) container.append(c.row);
  ui.update();
  if (!specs.length) container.append(el('div', { class: 'help', text: 'No settings.' }));
  return ui;
}
