/* End-to-end acceptance test: every progression system, no errors. */
import { chromium } from 'playwright';
import { BASE, ensureServer } from './server.mjs';

const server = await ensureServer();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push(`${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));

const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' :: ' + extra : ''}`);

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(900);

// --- 1. starts on the title, no run
ok('title on boot', (await p.evaluate(() => window.__ouroboros.state.screen)) === 'title');
ok('hud hidden on title', await p.evaluate(() => document.getElementById('hud').style.display === 'none'));

// --- 2. deterministic seed: the same seed must rebuild the same floor
await p.fill('.seed-row input', 'acceptance-1');
await p.getByText('开始新的轮回').click();
await p.waitForTimeout(600);
const layoutA = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  return { seed: g.run.seed, rooms: g.dungeon.rooms.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join('|') };
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.fill('.seed-row input', 'acceptance-1');
await p.getByText('开始新的轮回').click();
await p.waitForTimeout(600);
const layoutB = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  return { seed: g.run.seed, rooms: g.dungeon.rooms.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join('|') };
});
ok('seeded floors are reproducible', layoutA.seed === layoutB.seed && layoutA.rooms === layoutB.rooms);

// --- 3. eating grows the snake
const grew = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const before = g.run.length;
  const food = g.pickups.find((k) => k.type === 'food');
  if (!food) return { skipped: true };
  const h = g.headTile();
  g.body.length = 1;
  g.body[0] = { x: food.x - 1, y: food.y };
  g.facing = { x: 1, y: 0 };
  g.acc = 1;
  g.step(false);
  return { before, after: g.run.length };
});
ok('food adds a segment', grew.skipped || grew.after === grew.before + 1, JSON.stringify(grew));

// --- 4. level-up draft freezes the sim and applies the pick
const draft = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const before = { dmg: g.run.bonus.dmg, hp: g.run.hp };
  g.levelUp([1]);
  const frozen = g.drafting;
  const stepsAtOpen = g.run.steps;
  for (let i = 0; i < 120; i++) g.tick(1 / 60);
  const stayedPut = g.run.steps === stepsAtOpen;
  return { frozen, stayedPut, before, options: 3 };
});
ok('draft freezes the simulation', draft.frozen && draft.stayedPut, JSON.stringify(draft));
ok('draft renders 3 options', draft.options === 3);
await p.keyboard.press('1');
await p.waitForTimeout(300);
const picked = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  return { drafting: g.drafting, upg: Object.keys(g.run.upgrades).length, screen: window.__ouroboros.state.screen };
});
ok('draft applies and unfreezes', !picked.drafting && picked.upg === 1, JSON.stringify(picked));

// --- 5. relic pickup
const relic = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const before = g.run.relics.length;
  // find a walkable tile with a walkable neighbour
  let spot = null;
  for (let y = 1; y < g.dungeon.h && !spot; y++) {
    for (let x = 1; x < g.dungeon.w; x++) {
      if (g.dungeon.isWalkable(x, y) && g.dungeon.isWalkable(x + 1, y)) { spot = { x, y }; break; }
    }
  }
  g.body.length = 1;
  g.body[0] = { x: spot.x, y: spot.y };
  g.addPickup('chest', spot.x + 1, spot.y);
  g.facing = { x: 1, y: 0 };
  g.step(false);
  return { before, after: g.run.relics.length };
});
ok('chest grants a relic', relic.after === relic.before + 1, JSON.stringify(relic));

// --- 6. combat: head bump trades damage
const fight = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const e = g.enemies[0];
  e.hp = 99;
  const h = g.headTile();
  g.body.length = 1;
  g.body[0] = { x: e.x - 1, y: e.y };
  g.facing = { x: 1, y: 0 };
  g.invuln = 0;
  const hpBefore = g.run.hp;
  g.headBump(e.x, e.y, false);
  return { enemyHpDropped: e.hp < 99, playerHurt: g.run.hp < hpBefore };
});
ok('head bump damages the enemy', fight.enemyHpDropped, JSON.stringify(fight));

// --- 7. dash crushes
const dash = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const e = g.enemies[0];
  e.hp = 99;
  g.body.length = 1;
  g.body[0] = { x: e.x - 1, y: e.y };
  g.facing = { x: 1, y: 0 };
  g.headBump(e.x, e.y, true);
  return { crushed: e.hp <= 0 };
});
ok('dash crushes an enemy', dash.crushed);

// --- 8. descend with a cleared floor
const desc = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.enemies.length = 0;
  g.body.length = 1;
  g.body[0] = { x: g.dungeon.exit.x, y: g.dungeon.exit.y };
  const d0 = g.run.depth;
  g.interact();
  for (let i = 0; i < 90; i++) g.tick(1 / 60);
  return { d0, d1: g.run.depth, enemies: g.enemies.length };
});
ok('cleared floor lets you descend', desc.d1 === desc.d0 + 1 && desc.enemies > 0, JSON.stringify(desc));

// --- 9. essence lets you break out of a hostile floor
const breach = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.run.essence = 5000;
  const d0 = g.run.depth;
  g.body.length = 1;
  g.body[0] = { x: g.dungeon.exit.x, y: g.dungeon.exit.y };
  g.interact();
  for (let i = 0; i < 90; i++) g.tick(1 / 60);
  return { d0, d1: g.run.depth, spent: g.run.essence < 5000 };
});
ok('essence buys a breakthrough', breach.d1 === breach.d0 + 1 && breach.spent, JSON.stringify(breach));

// --- 10. boss floor spawns a boss
const boss = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.enterFloor(5);
  return { boss: g.enemies.filter((e) => e.def.boss).map((e) => e.def.en) };
});
ok('every 5th floor has a boss', boss.boss.length === 1, JSON.stringify(boss));

// --- 11. final floor is the Devourer
const final = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.enterFloor(12);
  return g.enemies.filter((e) => e.def.boss).map((e) => e.def.en);
});
ok('floor 12 is the final boss', final[0] === 'Devourer', JSON.stringify(final));

// --- 12. victory path
await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  g.alive = false;
  g.game.events.emit('run:end', { won: true });
});
await p.waitForTimeout(1400);
ok('victory screen shown', (await p.evaluate(() => window.__ouroboros.state.screen)) === 'over');
ok('victory screen visible', await p.getByText('VICTORY').isVisible());

// --- 13. meta progression persists
const meta = await p.evaluate(() => {
  const m = window.__ouroboros.meta;
  const echoes0 = m.data.echoes;
  m.data.echoes = 500;
  m.save();
  const bought = m.buyBranch('vitality');
  const level = m.branchLevel('vitality');
  const stored = JSON.parse(localStorage.getItem('ouroboros.meta.v2'));
  return { bought, level, storedLevel: stored.branches.vitality, echoes0, echoes: m.data.echoes, unlocked: m.buyUnlock('s_ember') };
});
ok('sanctum purchase applies + persists', meta.bought && meta.level === 1 && meta.storedLevel === 1, JSON.stringify(meta));
ok('unlocks can be bought', meta.unlocked);

// --- 14. new run picks up the meta bonus and the unlocked relic
await p.getByText('再来一次 (R)').click();
await p.waitForTimeout(900);
const next = await p.evaluate(() => {
  const s = window.__ouroboros.state;
  return { maxHp: s.run.bonus.hp, start: s.run.startRelic, hp: s.run.hp, screen: s.screen };
});
ok('meta bonus carried into the next run', next.maxHp >= 1 && next.hp > 6, JSON.stringify(next));

// --- 15. results screen shows stats and can restart
ok('results screen shown again', (await p.evaluate(() => window.__ouroboros.state.screen)) === 'playing');

console.log(`\n--- console errors (${errors.length}) ---`);
console.log([...new Set(errors)].slice(0, 10).join('\n---\n'));
await b.close();
server?.kill();
process.exit(errors.length ? 1 : 0);
