import Phaser from 'phaser';
import { TILE, COLORS, VIEW_W, VIEW_H } from '../config.js';
import { buildAllTextures } from '../art.js';
import { RNG } from '../rng.js';

/* Animated title backdrop: drifting serpents over a glowing lattice. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    buildAllTextures(this);
    const rng = new RNG(0xc0ffee);
    this.rng = rng;

    const g = this.add.graphics();
    g.fillGradientStyle(0x0a1220, 0x0a1220, 0x05060a, 0x05060a, 1);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.setDepth(0);
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0x7cffb2, 0.1 + rng.float(0, 0.1));
      g.fillCircle(rng.float(0, VIEW_W), rng.float(0, VIEW_H), rng.float(1, 3.4));
    }

    // lattice
    this.lattice = this.add.graphics().setDepth(0.5);
    this.lattice.lineStyle(1, 0x7cffb2, 0.07);
    for (let x = 0; x < VIEW_W; x += TILE * 2) this.lattice.lineBetween(x, 0, x, VIEW_H);
    for (let y = 0; y < VIEW_H; y += TILE * 2) this.lattice.lineBetween(0, y, VIEW_W, y);

    this.snakes = [];
    for (let i = 0; i < 5; i++) this.addSerpent(i);

    this.orb = this.add.image(VIEW_W * 0.5, VIEW_H * 0.72, 'glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0x2f8f64)
      .setScale(9)
      .setAlpha(0.62)
      .setDepth(1);

    this.t = 0;
    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  addSerpent(i) {
    const cols = 26 + i * 6;
    const segs = [];
    const hue = [152, 186, 168, 162, 176][i % 5];
    let x = Math.floor(this.rng.float(2, cols - 10));
    let y = Math.floor(this.rng.float(3, 20));
    let dir = { x: 1, y: 0 };
    for (let s = 0; s < 26; s++) {
      segs.push({ x, y });
      if (this.rng.chance(0.18)) {
        const options = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
          .filter((d) => !(d.x === -dir.x && d.y === -dir.y));
        dir = options[this.rng.int(0, options.length)];
      }
      x = (x + dir.x + cols) % cols;
      y = Math.max(1, Math.min(21, y + dir.y));
    }
    const sprites = segs.map((_, k) => {
      const img = this.add.image(0, 0, k === 0 ? 'snake_head' : 'snake_body').setDepth(2).setAlpha(0.5);
      img.setTint(Phaser.Display.Color.HSVToRGB((hue + k) / 360, 0.66, 0.66).color);
      return img;
    });
    this.snakes.push({ segs, sprites, dir, cols, hue, speed: 2.2 + i * 0.6, acc: 0 });
  }

  update(_, dtms) {
    const dt = dtms / 1000;
    this.t += dt;
    for (const s of this.snakes) {
      s.acc += dt * s.speed;
      while (s.acc >= 1) {
        s.acc -= 1;
        if (this.rng.chance(0.14)) {
          const options = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
            .filter((d) => !(d.x === -s.dir.x && d.y === -s.dir.y));
          s.dir = options[this.rng.int(0, options.length)];
        }
        const head = s.segs[0];
        s.segs.pop();
        s.segs.unshift({ x: (head.x + s.dir.x + s.cols) % s.cols, y: Math.max(1, Math.min(21, head.y + s.dir.y)) });
      }
      s.sprites.forEach((img, k) => {
        const seg = s.segs[k];
        img.setPosition(seg.x * TILE * 2, seg.y * TILE * 2);
        img.setAlpha(0.24 + (1 - k / s.segs.length) * 0.6);
        img.setScale(1.5 - (k / s.segs.length) * 0.7);
        if (k === 0) img.rotation = Math.atan2(s.dir.y, s.dir.x);
      });
    }
    this.orb.setAlpha(0.42 + Math.sin(this.t * 0.8) * 0.1);
    this.orb.setScale(9 + Math.sin(this.t * 0.6) * 0.6);
  }
}
