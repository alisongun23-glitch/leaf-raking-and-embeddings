// Geometry helpers. Every "within r" test goes through within2 with one shared tolerance, so a reach
// set to exactly the bottleneck distance M still includes that edge, and boundary cases are decided
// the same way everywhere.

export const EPS = 1e-9;

export function within2(d2, r) {
  return d2 <= r * r * (1 + EPS) + 1e-12;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

// Squared distance from point p to segment a-b.
export function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
  let s = 0;
  if (L2 > 0) {
    s = ((px - ax) * vx + (py - ay) * vy) / L2;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
  }
  const dx = px - ax - s * vx, dy = py - ay - s * vy;
  return dx * dx + dy * dy;
}
