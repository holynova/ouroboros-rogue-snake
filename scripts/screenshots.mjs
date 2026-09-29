/* Captures the README screenshots from a *running* game.
 * Waits for real rendered content (fonts, textures, a few live steps) before
 * capturing, so the images never show a blank or half-loaded frame. */
import { chromium } from 'playwright';
import { BASE, ensureServer } from './server.mjs';
import fs from 'node:fs';

const OUT = 'media';
fs.mkdirSync(OUT, { recursive: true });

const server = await ensureServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

/** Wait until the canvas has actually drawn something non-uniform. */
async function waitForRealRender() {
  await page.waitForFunction(() => {
    const c = document.querySelector('#app canvas');
    if (!c || !c.width) return false;
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 36;
    const ctx = probe.getContext('2d');
    ctx.drawImage(c, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let sum = 0;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return sum > 2000 && max - min > 40;   // a drawn frame, not a black screen
  }, { timeout: 20000 });
}

async function settle(ms = 700) {
  await page.waitForTimeout(ms);
}

/* The live rAF loop keeps playing between page.evaluate calls, which is enough
 * to kill the run before the shot is taken. So: freeze the scene first, pose it
 * by pumping `tick()` manually, drop the intro banner, then capture. */
async function freeze() {
  await page.evaluate(() => {
    const g = window.__ouroboros.game.scene.getScene('game');
    if (g && g.scene.isActive()) g.scene.pause();
    document.getElementById('banner')?.classList.remove('show');
  });
  await page.waitForTimeout(200);
}

async function thaw() {
  await page.evaluate(() => {
    const g = window.__ouroboros.game.scene.getScene('game');
    if (g && g.scene.isPaused()) g.scene.resume();
  });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 15000 });
await page.fill('.seed-row input', 'readme');
await page.waitForSelector('h1.logo');
await waitForRealRender();
await settle(900);
await page.screenshot({ path: `${OUT}/title.png` });
console.log('captured title.png');

await page.getByText('开始新的轮回').click();
await page.waitForSelector('.depth-name', { timeout: 10000 });
await waitForRealRender();
await freeze();
// Drive the snake with a tiny bot so the shot shows genuine mid-run play:
// it paths to the nearest pickup, dodges creatures, and stays off the walls.
await page.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const realHurt = g.hurt.bind(g);
  g.hurt = () => {};                       // no taking damage while posing

  const bfs = (blocked) => {
    const d = g.dungeon;
    const h = g.headTile();
    const dist = new Map([[`${h.x},${h.y}`, 0]]);
    const q = [[h.x, h.y]];
    for (let qi = 0; qi < q.length && qi < 1200; qi++) {
      const [x, y] = q[qi];
      const dd = dist.get(`${x},${y}`);
      for (const dir of DIRS) {
        const nx = x + dir.x, ny = y + dir.y, nk = `${nx},${ny}`;
        if (dist.has(nk) || !d.isWalkable(nx, ny) || blocked.has(nk)) continue;
        dist.set(nk, dd + 1);
        q.push([nx, ny]);
      }
    }
    return dist;
  };

  g.run.bonus.hp = 8;
  g.run.relics = ['emberheart', 'fangsage', 'shieldcore', 'voidgullet'];
  g.run.essence = 46;
  g.run.kills = 9;
  g.run.level = 4;
  g.run.length = 12;

  for (let i = 0; i < 60 * 9; i++) {
    g.run.length = Math.max(11, g.run.length - 0.004);   // steady, believable size
    const h = g.headTile();
    const own = new Set();
    for (let k = 0; k < Math.min(g.body.length, 8); k++) own.add(`${g.body[k].x},${g.body[k].y}`);
    own.delete(`${h.x},${h.y}`);
    const hot = new Set();
    for (const e of g.enemies) for (const dd of [{x:0,y:0}, ...DIRS]) hot.add(`${e.x + dd.x},${e.y + dd.y}`);
    const dist = bfs(own);
    const goals = g.pickups.map((p) => `${p.x},${p.y}`).concat([`${g.dungeon.exit.x},${g.dungeon.exit.y}`]);
    let goalKey = null, goalD = 1e9;
    for (const k of goals) { const dd = dist.get(k); if (dd !== undefined && dd < goalD) { goalD = dd; goalKey = k; } }
    let best = null, bestScore = -1e9;
    for (const dir of DIRS) {
      if (dir.x === -g.facing.x && dir.y === -g.facing.y) continue;
      const nx = h.x + dir.x, ny = h.y + dir.y, nk = `${nx},${ny}`;
      if (!g.dungeon.isWalkable(nx, ny)) continue;
      const dd = dist.get(nk);
      let sc = dd === undefined ? -5000 : -dd * 3;
      if (own.has(nk)) sc -= 200;
      if (hot.has(nk)) sc -= 90;
      if (nk === goalKey) sc += 500;
      if (sc > bestScore) { bestScore = sc; best = dir; }
    }
    if (best) g.turn(best.x, best.y);
    g.tick(1 / 60);
  }

  g.hurt = realHurt;
  g.run.length = 12;
  g.trimBody();
  g.run.hp = 14;
  g.acc = 0;
  g.invuln = 0;
  for (let i = 0; i < 3; i++) g.tick(1 / 60);
  g.fxLayer.removeAll(true);                       // no leftover damage numbers
  g.cameras.main.resetFX();
  document.getElementById('banner')?.classList.remove('show');
});
await page.screenshot({ path: `${OUT}/gameplay.png` });
await thaw();
console.log('captured gameplay.png');

await freeze();
await page.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const realHurt = g.hurt.bind(g);
  g.hurt = () => {};
  g.run.bonus.hp = 30;
  g.run.length = 14;
  g.enterFloor(5);
  g.trimBody();
  for (let i = 0; i < 60 * 3; i++) { g.run.length = 14; g.tick(1 / 60); }
  g.hurt = realHurt;
  g.run.length = 14; g.trimBody(); g.run.hp = 26;
  g.cameras.main.resetFX();
  document.getElementById('banner')?.classList.remove('show');
});
await page.screenshot({ path: `${OUT}/depth-5.png` });
await thaw();
console.log('captured depth-5.png');

await page.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.levelUp([1]);
  document.getElementById('banner')?.classList.remove('show');
});
await page.waitForSelector('.card', { timeout: 5000 });
await settle(500);
await page.screenshot({ path: `${OUT}/levelup.png` });
console.log('captured levelup.png');

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
server?.kill();
