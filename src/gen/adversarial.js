// Hand-shaped fields that stress the safety logic: long chains of cut points, single-point bridges,
// narrow necks, rings and long-armed stars. Shapes scale with the box; jitter keeps them from being
// perfectly regular.

export const ADVERSARIAL = [
  { id: 'chain', name: 'Shape: winding chain' },
  { id: 'bridge', name: 'Shape: two clumps + bridge' },
  { id: 'dumbbell', name: 'Shape: dumbbell' },
  { id: 'ring', name: 'Shape: ring' },
  { id: 'star', name: 'Shape: long-armed star' },
];

export function adversarialField(model, N, W, H, rng) {
  const xs = new Float64Array(N), ys = new Float64Array(N), labels = new Int32Array(N).fill(-1);
  const S = Math.min(W, H), cx = W / 2, cy = H / 2;
  let i = 0;
  const put = (x, y, label = -1) => {
    if (i >= N) return;
    xs[i] = Math.min(W, Math.max(0, x));
    ys[i] = Math.min(H, Math.max(0, y));
    labels[i++] = label;
  };
  const disc = (count, x0, y0, r, label) => {
    for (let j = 0; j < count; j++) {
      const rr = r * Math.sqrt(rng.float()), th = 2 * Math.PI * rng.float();
      put(x0 + rr * Math.cos(th), y0 + rr * Math.sin(th), label);
    }
  };
  // `count` points evenly along the polyline, with a little sideways jitter.
  const along = (count, path, jitter, label) => {
    const seg = [];
    let total = 0;
    for (let j = 1; j < path.length; j++) {
      const L = Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1]);
      seg.push(L);
      total += L;
    }
    for (let j = 0; j < count; j++) {
      let d = ((j + 0.5) / count) * total, s = 0;
      while (s < seg.length - 1 && d > seg[s]) { d -= seg[s]; s++; }
      const f = seg[s] > 0 ? d / seg[s] : 0, [ax, ay] = path[s], [bx, by] = path[s + 1];
      put(ax + f * (bx - ax) + jitter * rng.normal(), ay + f * (by - ay) + jitter * rng.normal(), label);
    }
  };

  if (model === 'chain') {
    const turns = 5, path = [];
    for (let j = 0; j <= turns; j++) {
      const y = 0.1 * H + (0.8 * H * j) / turns;
      path.push(j % 2 ? [0.9 * W, y] : [0.1 * W, y]);
    }
    along(N, path, 0.004 * S, 0);
  } else if (model === 'bridge') {
    const side = Math.floor(N * 0.45);
    disc(side, 0.22 * W, cy, 0.16 * S, 0);
    disc(side, 0.78 * W, cy, 0.16 * S, 1);
    along(N - 2 * side, [[0.38 * W, cy], [0.62 * W, cy]], 0.002 * S, -1);
  } else if (model === 'dumbbell') {
    const side = Math.floor(N * 0.4);
    disc(side, 0.22 * W, cy, 0.17 * S, 0);
    disc(side, 0.78 * W, cy, 0.17 * S, 1);
    const neck = N - 2 * side;
    for (let j = 0; j < neck; j++) put(rng.range(0.36 * W, 0.64 * W), cy + rng.range(-0.035, 0.035) * S, -1);
  } else if (model === 'ring') {
    for (let j = 0; j < N; j++) {
      const th = (2 * Math.PI * (j + rng.float())) / N, r = 0.38 * S * (1 + 0.04 * rng.normal());
      put(cx + r * Math.cos(th), cy + r * Math.sin(th), 0);
    }
  } else if (model === 'star') {
    const hub = Math.floor(N * 0.3), arms = 5;
    disc(hub, cx, cy, 0.1 * S, 0);
    const per = Math.floor((N - hub) / arms);
    for (let a = 0; a < arms; a++) {
      const th = (2 * Math.PI * a) / arms + 0.3;
      const count = a === arms - 1 ? N - hub - per * (arms - 1) : per;
      along(count, [[cx + 0.1 * S * Math.cos(th), cy + 0.1 * S * Math.sin(th)], [cx + 0.47 * S * Math.cos(th), cy + 0.47 * S * Math.sin(th)]], 0.003 * S, a + 1);
    }
  } else {
    throw new Error(`Unknown shape "${model}".`);
  }
  while (i < N) put(rng.range(0, W), rng.range(0, H)); // rounding leftovers
  return { xs, ys, labels };
}
