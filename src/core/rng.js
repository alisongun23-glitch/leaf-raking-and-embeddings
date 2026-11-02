// Seeded randomness. Math.random cannot be seeded, so every random draw in the engine, the field
// generators and the algorithms goes through one of these streams. Instances and algorithms use
// separate streams, so changing an algorithm never changes the field it is tested on.

// mulberry32: a small 32-bit generator, plenty for simulation work.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over a string: turns (seed, stream name) into an independent 32-bit seed.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed, stream = 'main') {
    this.next = mulberry32(hashString(`${seed}|${stream}`));
    this.spare = null;
  }

  float() { return this.next(); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); } // 0 .. n-1
  pick(arr) { return arr[this.int(arr.length)]; }

  normal() {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * this.next();
    this.spare = r * Math.sin(th);
    return r * Math.cos(th);
  }

  // Knuth's method in chunks of at most 30: a sum of independent Poissons is Poisson, so this
  // stays exact for large means without underflow.
  poisson(lambda) {
    let total = 0;
    while (lambda > 0) {
      const lam = Math.min(lambda, 30);
      lambda -= lam;
      const L = Math.exp(-lam);
      let k = 0, p = 1;
      do { k++; p *= this.next(); } while (p > L);
      total += k - 1;
    }
    return total;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
