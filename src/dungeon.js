import { MAP_W, MAP_H, T_VOID, T_FLOOR, T_FLOOR_ALT, T_WALL, T_WALL_TOP, T_RUBBLE, T_PIT, T_STAIR } from './config.js';
import { RNG } from './rng.js';

export const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export class Dungeon {
  constructor(width = MAP_W, height = MAP_H) {
    this.w = width;
    this.h = height;
    this.tiles = new Uint8Array(width * height).fill(T_VOID);
    this.rooms = [];
    this.spawn = { x: 1, y: 1 };
    this.exit = { x: 1, y: 1 };
    this.chests = [];
    this.props = [];
    this.bossPos = null;
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x, y) {
    if (!this.inBounds(x, y)) return T_VOID;
    return this.tiles[this.idx(x, y)];
  }

  isWalkable(x, y) {
    const t = this.at(x, y);
    return t === T_FLOOR || t === T_FLOOR_ALT || t === T_RUBBLE || t === T_STAIR;
  }

  set(x, y, t) {
    if (this.inBounds(x, y)) this.tiles[this.idx(x, y)] = t;
  }

  generate(depth, rng) {
    const r = rng || new RNG(depth * 7919 + 13);
    const maxRooms = Math.min(16, 6 + Math.floor(depth * 0.8));
    const attempts = 220;

    for (let a = 0; a < attempts && this.rooms.length < maxRooms; a++) {
      const first = this.rooms.length === 0;
      const w = first ? r.int(11, 15) : r.int(7, 13);
      const h = first ? r.int(8, 11) : r.int(6, 10);
      const x = r.int(2, Math.max(3, this.w - w - 3));
      const y = r.int(2, Math.max(3, this.h - h - 3));
      const room = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
      let overlaps = false;
      for (const o of this.rooms) {
        if (x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          this.set(xx, yy, r.chance(0.14) ? T_FLOOR_ALT : T_FLOOR);
        }
      }
      this.rooms.push(room);
    }

    // connect rooms in sequence
    for (let i = 1; i < this.rooms.length; i++) {
      this.corridor(this.rooms[i - 1], this.rooms[i], r);
    }
    // a couple of loop edges so the floor is not a pure chain
    const extras = Math.min(3, Math.floor(this.rooms.length / 3));
    for (let i = 0; i < extras; i++) {
      const a = r.pick(this.rooms);
      const b = r.pick(this.rooms);
      if (a !== b) this.corridor(a, b, r, true);
    }

    // wall capping: any void adjacent to a floor becomes wall
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.at(x, y) !== T_VOID) continue;
        let near = false;
        for (const d of DIRS) {
          if (this.isWalkable(x + d.x, y + d.y)) {
            near = true;
            break;
          }
        }
        if (near) this.set(x, y, T_WALL);
      }
    }
    // decorate: wall tops (wall with walkable neighbour to the north)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.at(x, y) === T_WALL && this.isWalkable(x, y - 1)) this.set(x, y, T_WALL_TOP);
      }
    }

    const first = this.rooms[0];
    this.spawn = { x: first.cx, y: first.cy };
    const lastRoom = this.rooms[this.rooms.length - 1];
    this.exit = { x: lastRoom.cx, y: lastRoom.cy };
    this.set(this.exit.x, this.exit.y, T_STAIR);

    // boss room = the farthest room from spawn
    if (depth % 5 === 0) {
      let best = null, bestD = -1;
      for (const room of this.rooms) {
        const d = Math.abs(room.cx - first.cx) + Math.abs(room.cy - first.cy) + r.int(0, 6);
        if (d > bestD && room !== first) { bestD = d; best = room; }
      }
      if (best) {
        this.bossRoom = best;
        this.bossPos = { x: best.cx, y: best.cy };
        if (this.exit.x === this.bossPos.x && this.exit.y === this.bossPos.y) {
          const alt = this.rooms.find((rm) => rm !== best && rm !== first) || first;
          this.exit = { x: alt.cx, y: alt.cy };
          this.set(this.exit.x, this.exit.y, T_STAIR);
        }
      }
    }

    // pits in larger floors (hazard tiles, impassable)
    const pitCount = depth >= 3 ? r.int(0, 2 + Math.floor(depth / 3)) : 0;
    for (let i = 0; i < pitCount; i++) {
      const room = r.pick(this.rooms.slice(1));
      const x = r.int(room.x + 1, room.x + room.w - 2);
      const y = r.int(room.y + 1, room.y + room.h - 2);
      if (this.at(x, y) === T_STAIR) continue;
      this.set(x, y, T_PIT);
    }

    // rubble scatter
    for (let i = 0; i < this.rooms.length * 3; i++) {
      const room = r.pick(this.rooms);
      const x = r.int(room.x, room.x + room.w - 1);
      const y = r.int(room.y, room.y + room.h - 1);
      if (this.at(x, y) === T_FLOOR) this.set(x, y, T_RUBBLE);
    }

    this.floodFrom(this.spawn);
    return this;
  }

  // Corridors are carved two tiles wide: a long serpent needs room to coil.
  corridor(a, b, r, thin = false) {
    const horizFirst = r.chance(0.5);
    const put = (x, y) => {
      if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (this.at(tx, ty) === T_VOID) this.set(tx, ty, r.chance(0.18) ? T_FLOOR_ALT : T_FLOOR);
        }
      }
    };
    let x = a.cx, y = a.cy;
    const stepX = () => {
      while (x !== b.cx) { x += Math.sign(b.cx - x); put(x, y); }
    };
    const stepY = () => {
      while (y !== b.cy) { y += Math.sign(b.cy - y); put(x, y); }
    };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    if (thin) {
      // widen a couple of spots into alcoves for cover
      for (let i = 0; i < 2; i++) {
        const rx = r.int(Math.min(x, b.cx), Math.max(x, b.cx));
        const ry = r.int(Math.min(y, b.cy), Math.max(y, b.cy));
        put(rx + r.int(-1, 1), ry + r.int(-1, 1));
        put(rx, ry + r.int(-1, 1));
      }
    }
  }

  // BFS distances from a point across walkable tiles (for AI + placement)
  floodFrom(start) {
    const dist = new Int32Array(this.w * this.h).fill(-1);
    const q = [start];
    dist[this.idx(start.x, start.y)] = 0;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const d = dist[this.idx(cur.x, cur.y)];
      for (const dd of DIRS) {
        const nx = cur.x + dd.x, ny = cur.y + dd.y;
        if (!this.inBounds(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (dist[i] !== -1) continue;
        if (!this.isWalkable(nx, ny)) continue;
        dist[i] = d + 1;
        q.push({ x: nx, y: ny });
      }
    }
    this.distanceField = dist;
    return dist;
  }

  distanceTo(x, y) {
    if (!this.inBounds(x, y) || !this.distanceField) return -1;
    return this.distanceField[this.idx(x, y)];
  }

  randomFloor(rng, avoid = [], minDistFrom = null, minDist = 0) {
    const candidates = [];
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        if (!this.isWalkable(x, y)) continue;
        let ok = true;
        for (const av of avoid) {
          if (Math.abs(av.x - x) + Math.abs(av.y - y) < 6) { ok = false; break; }
        }
        if (ok && minDistFrom && this.distanceTo(x, y) >= minDistFrom) ok = true;
        if (ok && minDistFrom && this.distanceTo(x, y) < minDist) ok = false;
        if (ok) candidates.push({ x, y });
      }
    }
    if (!candidates.length) return { x: this.spawn.x, y: this.spawn.y };
    return rng.pick(candidates);
  }
}
