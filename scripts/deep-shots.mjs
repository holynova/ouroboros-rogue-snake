import { chromium } from 'playwright';
import { BASE, ensureServer } from './server.mjs';

const server = await ensureServer();
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1280,height:720}});
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.goto(BASE, {waitUntil:'networkidle'});
await p.waitForTimeout(1000);
await p.screenshot({path:'/tmp/ouro-shots/01-title.png'});
await p.fill('.seed-row input', '777');
await p.getByText('开始新的轮回').click();
await p.waitForTimeout(700);
for (const d of [3, 5, 8, 11]) {
  await p.evaluate((depth) => {
    const g = window.__ouroboros.game.scene.getScene('game');
    g.run.hp = 60; g.run.bonus.hp = 54; g.run.relics = ['emberheart','fangsage','shieldcore'];
    g.enterFloor(depth);
  }, d);
  await p.waitForTimeout(600);
  // reveal the floor and let enemies approach
  await p.evaluate(() => { const g = window.__ouroboros.game.scene.getScene('game'); for (let i=0;i<60*4;i++) g.tick(1/60); });
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => {
    const g = window.__ouroboros.game.scene.getScene('game');
    return { depth: g.run.depth, enemies: g.enemies.length, boss: g.enemies.filter(e=>e.def.boss).map(e=>e.def.en) };
  });
  console.log(JSON.stringify(st));
  await p.screenshot({path:`/tmp/ouro-shots/depth-${d}.png`});
}
await b.close();
server?.kill();
