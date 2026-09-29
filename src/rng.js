// Deterministic, seedable PRNG (mulberry32) + helpers.
// Every run is fully reproducible from a single integer seed.
export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.s = this.seed || 1;
  }

  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(a = 1, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return a + this.next() * (b - a);
  }

  int(a, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return Math.floor(this.float(a, b));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted(entries) {
    // entries: [{ w, ...}]
    let total = 0;
    for (const e of entries) total += e.w;
    let r = this.next() * total;
    for (const e of entries) {
      r -= e.w;
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  }
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SEED_WORDS = [
  'void', 'fang', 'ember', 'rune', 'ash', 'nix', 'grit', 'maw', 'coil', 'hex',
  'silt', 'thorn', 'dusk', 'gale', 'onyx', 'rift', 'wisp', 'bone', 'brine', 'jinx',
];

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function seedLabel(seed) {
  const a = SEED_WORDS[seed % SEED_WORDS.length];
  const b = SEED_WORDS[(seed >>> 8) % SEED_WORDS.length];
  return `${a}-${b}-${(seed % 997).toString().padStart(3, '0')}`;
}

export function parseSeed(text) {
  if (!text) return null;
  const t = String(text).trim();
  if (/^\d+$/.test(t)) return Number(t) >>> 0;
  return hashString(t.toLowerCase());
}
