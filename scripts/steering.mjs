/* Steering latency + turn-buffer semantics. */
import { chromium } from 'playwright';
import { BASE, ensureServer } from './server.mjs';

const server = await ensureServer();
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1280,height:720}});
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(1000);
await p.fill('.seed-row input', 'steer-1');   // pin the floor: assertions assume open ground
await p.getByText('开始新的轮回').click();
await p.waitForTimeout(800);

await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  // put the head in a wide-open area so wall logic never confuses the test
  // needs 3 tiles of clearance in every direction, otherwise the walk hits a
  // wall and a correctly-pruned turn looks like a dropped one
  window.__reset = (fx, fy) => {
    let spot = null;
    for (let y = 3; y < g.dungeon.h && !spot; y++) {
      for (let x = 3; x < g.dungeon.w; x++) {
        let open = true;
        for (let dx = -3; dx <= 3 && open; dx++) {
          for (let dy = -3; dy <= 3 && open; dy++) open = g.dungeon.isWalkable(x+dx, y+dy);
        }
        if (open) { spot = {x, y}; break; }
      }
    }
    g.run.length = 5;
    g.body = [];
    // the game keeps body[last] as the head, so trail backwards from `spot`
    for (let i = 4; i >= 0; i--) g.body.push({x: spot.x + fx*i, y: spot.y + fy*i});
    g.facing = {x: fx, y: fy};
    g.setFacing(g.facing);
    g.queue = [];
    g.acc = 0;
    g.invuln = 99;
    g.dashCd = 0;
    return spot;
  };
  window.__path = (steps) => {
    const out = [];
    for (let i = 0; i < steps; i++) { g.acc = 1; g.step(false); out.push(`${g.facing.x},${g.facing.y}`); }
    return out;
  };
});

const K = { Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' };
const run = (startFacing, presses) =>
  p.evaluate(({ s, keys, K }) => {
    const g = window.__ouroboros.game.scene.getScene('game');
    window.__reset(s.x, s.y);
    for (const k of keys) g.turn(...k);
    return { queued: g.queue.map((d) => `${d.x},${d.y}`), path: window.__path(3) };
  }, { s: startFacing, keys: presses, K });

const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  :: ' + extra : ''}`);

let r;
r = await run({x:1,y:0}, [[0,1]]);
ok('single turn is taken', r.path[0] === '0,1', JSON.stringify(r));

r = await run({x:1,y:0}, [[0,1],[0,-1]]);
ok('fast correction overrides the first turn', r.path[0] === '0,-1' && !r.path.includes('0,1'), JSON.stringify(r));

r = await run({x:1,y:0}, [[0,1],[-1,0]]);
ok('corner (down then left) still works', r.path[0] === '0,1' && r.path[1] === '-1,0', JSON.stringify(r));

// down → left → up: `up` is 180° off the *pending* left, so it cancels it
r = await run({x:1,y:0}, [[0,1],[-1,0],[0,-1]]);
ok('a 180° input cancels the pending turn', r.path.slice(0,2).join(' ') === '0,1 0,-1' && !r.path.includes('-1,0'), JSON.stringify(r));

// a deliberate spiral, one turn per tile, must still execute every turn
const spiral = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  window.__reset(1, 0);
  const out = [];
  for (const d of [[0,1],[-1,0],[0,-1],[1,0]]) {
    g.turn(d[0], d[1]);
    g.acc = 1; g.step(false);
    out.push(`${g.facing.x},${g.facing.y}`);
  }
  return out;
});
ok('a paced spiral turns on every tile', spiral.join(' ') === '0,1 -1,0 0,-1 1,0', JSON.stringify(spiral));

r = await run({x:1,y:0}, [[0,1],[-1,0],[0,-1],[1,0]]);
ok('burst of input resolves to the newest intent', r.path[1] === '1,0', JSON.stringify(r));

r = await run({x:1,y:0}, [[-1,0]]);
ok('true 180° with nothing pending is refused', r.path[0] === '1,0', JSON.stringify(r));

// wall hit must not swallow a legal turn
const wall = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  // find a wall directly to the right of an open tile
  let spot = null;
  for (let y = 2; y < g.dungeon.h && !spot; y++) {
    for (let x = 2; x < g.dungeon.w; x++) {
      if (g.dungeon.isWalkable(x,y) && !g.dungeon.isWalkable(x+1,y) && g.dungeon.isWalkable(x,y+1)) { spot = {x,y}; break; }
    }
  }
  g.run.length = 3;
  g.body = [{x:spot.x,y:spot.y},{x:spot.x,y:spot.y},{x:spot.x,y:spot.y}];
  g.facing = {x:1,y:0}; g.setFacing(g.facing); g.queue = []; g.acc = 1; g.invuln = 99;
  g.step(false);                      // slam into the wall
  const hpAfterCrash = g.run.hp;
  g.turn(0, 1);                       // player turns away
  const queued = g.queue.map((d) => `${d.x},${d.y}`);
  g.acc = 1; g.step(false);
  return { queued, after: `${g.facing.x},${g.facing.y}`, hpAfterCrash };
});
ok('turn survives a wall impact', wall.queued.length === 1 && wall.after === '0,1', JSON.stringify(wall));

// latency: a key press must land within one movement tick
const lat = await p.evaluate(() => {
  const g = window.__ouroboros.game.scene.getScene('game');
  const samples = [];
  for (let n = 0; n < 25; n++) {
    window.__reset(1, 0);
    const t0 = g.clock;
    g.turn(0, 1);
    let guard = 0;
    while (`${g.facing.x},${g.facing.y}` === '1,0' && guard++ < 600) g.tick(1/60);
    samples.push(g.clock - t0);
  }
  samples.sort((a,b)=>a-b);
  return { min: +samples[0].toFixed(3), median: +samples[12].toFixed(3), max: +samples[24].toFixed(3) };
});
ok('turn latency stays within one tile', lat.max <= 0.28, JSON.stringify(lat));

// rapid real-key latency through the actual keyboard path
await p.evaluate(() => { window.__reset(1, 0); });
const t0 = Date.now();
await p.keyboard.press('ArrowDown');
let applied = false;
for (let i = 0; i < 40; i++) {
  await p.evaluate(() => { const g = window.__ouroboros.game.scene.getScene('game'); for (let i=0;i<3;i++) g.tick(1/60); });
  if (await p.evaluate(() => { const g = window.__ouroboros.game.scene.getScene('game'); return g.facing.y === 1; })) { applied = true; break; }
}
ok('real keyboard event reaches the snake', applied, `${Date.now() - t0}ms`);

console.log(`\nerrors: ${errs.length ? errs.join('; ') : 'none'}`);
await b.close();
server?.kill();
