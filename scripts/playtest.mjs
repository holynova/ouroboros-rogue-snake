/* Scripted playtest: a small in-page bot plays the game so we can verify
 * real gameplay, all UI screens, and capture screenshots. */
import { chromium } from 'playwright';
import { BASE, ensureServer } from './server.mjs';
import fs from 'node:fs';


const OUT = '/tmp/ouro-shots';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const server = await ensureServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-title.png` });

await page.fill('.seed-row input', '20260928');
await page.getByText('开始新的轮回').click();
await page.waitForTimeout(800);

// ---- install the bot -------------------------------------------------------
await page.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  window.__cells = new Set();
  setInterval(() => { const h = g.headTile && g.headTile(); if (h) window.__cells.add(h.x + ',' + h.y); }, 40);

  const bfs = (blockedKeys) => {
    const d = g.dungeon;
    const h = g.headTile();
    const dist = new Map([[`${h.x},${h.y}`, 0]]);
    const q = [[h.x, h.y]];
    for (let qi = 0; qi < q.length && qi < 1200; qi++) {
      const [x, y] = q[qi];
      const dd = dist.get(`${x},${y}`);
      for (const dir of DIRS) {
        const nx = x + dir.x, ny = y + dir.y, nk = `${nx},${ny}`;
        if (dist.has(nk) || !d.inBounds(nx, ny) || !d.isWalkable(nx, ny)) continue;
        if (blockedKeys.has(nk)) continue;
        dist.set(nk, dd + 1);
        q.push([nx, ny]);
      }
    }
    return dist;
  };

  window.__botStep = () => {
    if (!g.alive || g.busy) return;
    const d = g.dungeon;
    const h = g.headTile();
    const L = g.body.length;
    const own = new Set();
    for (let i = 0; i < Math.min(L, 10); i++) own.add(`${g.body[i].x},${g.body[i].y}`);
    own.delete(`${h.x},${h.y}`);
    const hot = new Set();
    for (const e of g.enemies) for (let r = 0; r <= 1; r++) {
      for (const dir of [{x:0,y:0}, ...DIRS]) hot.add(`${e.x + dir.x * r},${e.y + dir.y * r}`);
    }
    for (const p of g.projectiles) hot.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);

    const alive = g.enemies.filter((e) => e.hp > 0);
    const dmg = g.run.bonus.dmg + 1;
    const floorClear = alive.length === 0;
    const goals = [];
    if (floorClear) goals.push(`${d.exit.x},${d.exit.y}`);
    for (const p of g.pickups) if (p.type === 'food' || p.type === 'heart' || p.type === 'shard') goals.push(`${p.x},${p.y}`);
    for (const p of g.pickups) if (p.type === 'chest' || p.type === 'relic') goals.push(`${p.x},${p.y}`);
    for (const e of alive) if (e.hp <= dmg * 1.2) goals.push(`${e.x},${e.y}`);

    const dist = bfs(own);
    let goalKey = null, goalD = 1e9;
    for (const k of goals) {
      const dd = dist.get(k);
      if (dd !== undefined && dd < goalD) { goalD = dd; goalKey = k; }
    }
    const opts = DIRS.filter((dir) => !(dir.x === -g.facing.x && dir.y === -g.facing.y));
    let best = null, bestScore = -1e9;
    for (const dir of opts) {
      const nx = h.x + dir.x, ny = h.y + dir.y, nk = `${nx},${ny}`;
      if (!d.isWalkable(nx, ny)) continue;
      const dd = dist.get(nk);
      let s = dd === undefined ? -5000 : -dd * 3;
      if (own.has(nk)) s -= 200;
      if (hot.has(nk)) s -= 60;
      if (nk === goalKey) s += 500;
      if (s > bestScore) { bestScore = s; best = dir; }
    }
    if (best) g.turn(best.x, best.y);
    if (floorClear) g.interact();
    // blow a path when the floor is nearly clear and we can afford it
    if (alive.length > 0 && alive.length <= 3 && g.run.essence >= 25 * alive.length) {
      if (alive.some((e) => Math.abs(e.x - h.x) + Math.abs(e.y - h.y) <= 3)) g.tryDash();
    }
  };
  // Deterministic pump: advances the real fixed-step simulation without
  // depending on the headless browser's animation frame rate.
  window.__pump = (seconds) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      g.tick(1 / 60);
      if (i % 2 === 0) window.__botStep();
    }
  };
  window.__bot = setInterval(() => window.__botStep(), 120);
});

const snap = () => page.evaluate(() => {
  const s = window.__ouroboros.state;
  const g = window.__ouroboros.game.scene.getScene('game');
  return {
    screen: s.screen, depth: s.run.depth, hp: s.run.hp, maxHp: Math.max(...[1]),
    len: s.run.length, lvl: s.run.level, ess: s.run.essence, kills: s.run.kills,
    enemies: g?.enemies.length ?? 0, alive: g?.alive, relics: s.run.relics.length, steps: s.run.steps,
  };
});

// play a long while, auto-picking level-up offers
for (let i = 0; i < 14; i++) {
  await page.evaluate(() => window.__pump(12));
  await page.waitForTimeout(80);
  const st = await snap();
  if (st.screen === 'levelup') await page.keyboard.press(String(1 + (i % 3)));
  if (st.screen === 'over') break;
  console.log(`t+${(i + 1) * 12}s`, JSON.stringify(st));
}
await page.screenshot({ path: `${OUT}/02-gameplay.png` });
console.log('mid-run:', JSON.stringify(await snap()));

// walk the UI surfaces
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-codex.png` });
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-pause.png` });
await page.getByText('圣所').first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/05-sanctum.png` });
await page.getByText('返回').first().click();
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// force a level-up draft for the screenshot
await page.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.levelUp([2]);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/06-levelup.png` });
await page.keyboard.press('2');
await page.waitForTimeout(400);

// deep floors + boss
for (let d = 0; d < 6; d++) {
  await page.evaluate(() => window.__pump(1.2));
  await page.waitForTimeout(60);
  const st = await snap();
  if (st.screen === 'levelup') await page.keyboard.press('1');
  if (d === 0) await page.screenshot({ path: `${OUT}/07-boss.png` });
  console.log(`after ${d}: depth=${st.depth} enemies=${st.enemies} hp=${st.hp} len=${st.len} relics=${st.relics} lvl=${st.lvl}`);
  if (st.screen === 'over') break;
}
await page.screenshot({ path: `${OUT}/08-deep.png` });

// win screen
await page.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.alive = false;
  g.game.events.emit('run:end', { won: true });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/09-victory.png` });
console.log('victory screen:', (await snap()).screen);

// death screen
await page.keyboard.press('KeyR');
await page.waitForTimeout(900);
await page.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.invuln = 0; g.run.bonus.shield = 0; g.hurt(999, 'test');
  window.__pump(2);
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/10-defeat.png` });
console.log('defeat screen:', (await snap()).screen);

console.log(`\n--- ERRORS (${errors.length}) ---`);
console.log([...new Set(errors)].slice(0, 12).join('\n---\n'));
await browser.close();
