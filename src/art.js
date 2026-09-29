import { TILE, T_VOID, T_FLOOR, T_FLOOR_ALT, T_WALL, T_WALL_TOP, T_RUBBLE, T_PIT, T_STAIR } from './config.js';

/* ------------------------------------------------------------------ *
 * Procedural art pipeline.
 * Every texture in the game is drawn at runtime with Canvas2D, so the
 * build ships zero third-party art: no licensing, no download, and the
 * palette stays coherent. Textures are authored in greyscale where the
 * runtime needs to tint them (snake segments, pickups, projectiles).
 * ------------------------------------------------------------------ */

function makeCanvas(scene, key, w, h) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  return { tex, ctx };
}

function grain(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    if (alpha !== undefined) d[i + 3] = d[i + 3] * alpha;
  }
  ctx.putImageData(img, 0, 0);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------------------- tiles ---------------------------- */

function buildTiles(scene) {
  const S = TILE;
  const N = 8;
  const { tex, ctx } = makeCanvas(scene, 'tiles', S * N, S);

  // 0: void
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, S, S);

  const tile = (i) => S * i;

  // 1: floor
  ctx.fillStyle = '#252d42';
  ctx.fillRect(tile(1), 0, S, S);
  for (let n = 0; n < 26; n++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(tile(1) + Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.strokeRect(tile(1) + 0.5, 0.5, S - 1, S - 1);

  // 2: floor alt (cracked slab)
  ctx.fillStyle = '#222a3c';
  ctx.fillRect(tile(2), 0, S, S);
  for (let n = 0; n < 12; n++) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(tile(2) + Math.random() * S, Math.random() * S, 2, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  let cx = tile(2) + Math.random() * S;
  let cy = 0;
  ctx.moveTo(cx, cy);
  while (cy < S) {
    cx += (Math.random() - 0.5) * 9;
    cy += 4 + Math.random() * 5;
    ctx.lineTo(Math.max(tile(2) + 2, Math.min(tile(2) + S - 2, cx)), cy);
  }
  ctx.stroke();

  // 3: wall body
  const wg = ctx.createLinearGradient(0, 0, 0, S);
  wg.addColorStop(0, '#66748f');
  wg.addColorStop(1, '#49556f');
  ctx.fillStyle = wg;
  ctx.fillRect(tile(3), 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < S; y += 16) ctx.fillRect(tile(3), y, S, 1);
  for (let y = 0; y < S; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 16; x < S; x += 16) ctx.fillRect(tile(3) + x, y, 1, 16);
  }
  grain(ctx, S * N, S, 16);

  // 4: wall top (lit cap)
  const tg = ctx.createLinearGradient(0, 0, 0, S);
  tg.addColorStop(0, '#8c9fc2');
  tg.addColorStop(0.4, '#657291');
  tg.addColorStop(1, '#49556f');
  ctx.fillStyle = tg;
  ctx.fillRect(tile(4), 0, S, S);
  ctx.fillStyle = 'rgba(180,205,250,0.3)';
  ctx.fillRect(tile(4), 0, S, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = 10; y < S; y += 16) ctx.fillRect(tile(4), y, S, 1);

  // 5: rubble floor
  ctx.fillStyle = '#2b3348';
  ctx.fillRect(tile(5), 0, S, S);
  for (let n = 0; n < 7; n++) {
    const x = Math.random() * (S - 8) + 2;
    const y = Math.random() * (S - 8) + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(ctx, tile(5) + x + 1, y + 2, 7, 5, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rr(ctx, tile(5) + x, y, 7, 5, 2);
    ctx.fill();
  }

  // 6: pit (bottomless-looking abyss)
  const pg = ctx.createRadialGradient(tile(6) + S / 2, S / 2, 2, tile(6) + S / 2, S / 2, S / 2);
  pg.addColorStop(0, '#000000');
  pg.addColorStop(0.72, '#05070c');
  pg.addColorStop(1, '#161d2e');
  ctx.fillStyle = pg;
  ctx.fillRect(tile(6), 0, S, S);

  // 7: stairs
  ctx.fillStyle = '#4c5872';
  ctx.fillRect(tile(7), 0, S, S);
  for (let s = 0; s < 4; s++) {
    const inset = 3 + s * 2;
    ctx.fillStyle = `rgba(0,0,0,${0.12 + s * 0.13})`;
    ctx.fillRect(tile(7) + inset, 4 + s * 6, S - inset * 2, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(tile(7) + inset, 4 + s * 6, S - inset * 2, 1);
  }

  tex.refresh();
  return {
    [T_VOID]: 0, [T_FLOOR]: 1, [T_FLOOR_ALT]: 2, [T_WALL]: 3,
    [T_WALL_TOP]: 4, [T_RUBBLE]: 5, [T_PIT]: 6, [T_STAIR]: 7,
  };
}

/* ---------------------------- snake ---------------------------- */

function buildSnake(scene) {
  // Body segment (greyscale → runtime tint)
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'snake_body', S, S);
    const g = ctx.createRadialGradient(S * 0.38, S * 0.34, 2, S / 2, S / 2, S * 0.56);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#d6dde8');
    g.addColorStop(1, '#7e8a9c');
    ctx.fillStyle = g;
    rr(ctx, 1.5, 1.5, S - 3, S - 3, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,28,40,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // scale chevrons
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#3b465a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(S * 0.3, S * 0.68);
    ctx.lineTo(S * 0.5, S * 0.44);
    ctx.lineTo(S * 0.7, S * 0.68);
    ctx.stroke();
    ctx.globalAlpha = 1;
    tex.refresh();
  }

  // Head — drawn facing RIGHT (rotation applied at runtime)
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'snake_head', S, S);
    const g = ctx.createRadialGradient(S * 0.4, S * 0.32, 2, S / 2, S / 2, S * 0.6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#e2e9f4');
    g.addColorStop(1, '#8794a8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(S * 0.12, S * 0.5);
    ctx.quadraticCurveTo(S * 0.16, S * 0.1, S * 0.62, S * 0.16);
    ctx.quadraticCurveTo(S * 0.98, S * 0.28, S * 0.95, S * 0.5);
    ctx.quadraticCurveTo(S * 0.98, S * 0.72, S * 0.62, S * 0.84);
    ctx.quadraticCurveTo(S * 0.16, S * 0.9, S * 0.12, S * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,26,38,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // eyes
    ctx.fillStyle = '#0d1220';
    ctx.beginPath();
    ctx.ellipse(S * 0.72, S * 0.33, 3.4, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(S * 0.72, S * 0.67, 3.4, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(S * 0.735, S * 0.32, 1.3, 0, Math.PI * 2);
    ctx.arc(S * 0.735, S * 0.66, 1.3, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }

  // Tail taper
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'snake_tail', S, S);
    const g = ctx.createRadialGradient(S * 0.35, S * 0.4, 1, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#ccd5e2');
    g.addColorStop(1, '#6d7889');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(S * 0.98, S * 0.5);
    ctx.quadraticCurveTo(S * 0.4, S * 0.14, S * 0.06, S * 0.34);
    ctx.quadraticCurveTo(S * 0.02, S * 0.5, S * 0.06, S * 0.66);
    ctx.quadraticCurveTo(S * 0.4, S * 0.86, S * 0.98, S * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,26,38,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    tex.refresh();
  }

  // Glow blob used for additive lights
  {
    const S = 64;
    const { tex, ctx } = makeCanvas(scene, 'glow', S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    tex.refresh();
  }

  // Small hard spark for particles
  {
    const S = 8;
    const { tex, ctx } = makeCanvas(scene, 'spark', S, S);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(S / 2 - 1, 0, 2, S);
    ctx.fillRect(0, S / 2 - 1, S, 2);
    tex.refresh();
  }
}

/* ---------------------------- pickups ---------------------------- */

function buildPickups(scene) {
  // food: bioluminescent fruit
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'food', S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(S * 0.5, S * 0.76, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(S * 0.4, S * 0.36, 1, S / 2, S * 0.52, S * 0.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#d8d8d8');
    g.addColorStop(1, '#7a7a7a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(S * 0.5, S * 0.54, 8.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.46);
    ctx.quadraticCurveTo(S * 0.62, S * 0.24, S * 0.56, S * 0.14);
    ctx.stroke();
    tex.refresh();
  }

  // xp shard
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'shard', S, S);
    const g = ctx.createLinearGradient(S * 0.3, 0, S * 0.7, S);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#9fb4cc');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.14);
    ctx.lineTo(S * 0.72, S * 0.5);
    ctx.lineTo(S * 0.5, S * 0.88);
    ctx.lineTo(S * 0.28, S * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,16,26,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    tex.refresh();
  }

  // heart / medkit
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'heart', S, S);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(S * 0.5, S * 0.86);
    ctx.bezierCurveTo(S * 0.06, S * 0.56, S * 0.16, S * 0.18, S * 0.5, S * 0.36);
    ctx.bezierCurveTo(S * 0.84, S * 0.18, S * 0.94, S * 0.56, S * 0.5, S * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,20,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    tex.refresh();
  }

  // relic pedestal
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'pedestal', S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, 5, S - 12, S - 10, 8, 3);
    ctx.fill();
    ctx.fillStyle = '#c3cfe2';
    rr(ctx, 7, 12, S - 14, S - 22, 4);
    ctx.fill();
    ctx.fillStyle = '#8a97ad';
    rr(ctx, 7, 12, S - 14, 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(9, 20, 2, S - 34);
    tex.refresh();
  }

  // chest
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'chest', S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(S / 2, S * 0.84, 11, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8c2d4';
    rr(ctx, 4, 14, S - 8, 14, 3);
    ctx.fill();
    ctx.fillStyle = '#8b97ab';
    ctx.beginPath();
    ctx.moveTo(4, 15);
    ctx.quadraticCurveTo(S / 2, 4, S - 4, 15);
    ctx.lineTo(S - 4, 16);
    ctx.lineTo(4, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e9f0fb';
    ctx.fillRect(S / 2 - 2, 14, 4, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(4, 20, S - 8, 2);
    tex.refresh();
  }

  // stairs glyph (drawn additive, tinted by state)
  {
    const S = TILE;
    const { tex, ctx } = makeCanvas(scene, 'portal', S * 1.5, S * 1.5);
    const c = S * 0.75;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.85 - k * 0.26})`;
      ctx.lineWidth = 4 - k;
      ctx.beginPath();
      ctx.arc(c, c, 10 + k * 7, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, 10 + k * 7, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
    }
    tex.refresh();
  }
}

/* ---------------------------- creatures ---------------------------- */

function buildCreatures(scene) {
  const draw = (key, size, body, accent, opts = {}) => {
    const { tex, ctx } = makeCanvas(scene, key, size, size);
    const S = size;
    const c = S / 2;
    const r = opts.r || S * 0.34;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(c, S * 0.82, r * 0.95, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // spikes / horns
    if (opts.spikes) {
      ctx.fillStyle = accent;
      for (let i = 0; i < opts.spikes; i++) {
        const a = Math.PI + (i / (opts.spikes - 1)) * Math.PI;
        const bx = c + Math.cos(a) * r * 0.92;
        const by = c + Math.sin(a) * r * 0.92;
        ctx.beginPath();
        ctx.moveTo(bx - 4, by);
        ctx.lineTo(bx + 4, by);
        ctx.lineTo(bx + Math.cos(a) * 9, by + Math.sin(a) * 9);
        ctx.closePath();
        ctx.fill();
      }
    }

    // body
    const g = ctx.createRadialGradient(c - r * 0.4, c - r * 0.5, 1, c, c, r * 1.25);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.18, body);
    g.addColorStop(1, shade(body, -0.55));
    ctx.fillStyle = g;
    ctx.beginPath();
    if (opts.shape === 'blob') {
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const wob = 1 + Math.sin(a * 3 + 1.2) * 0.09;
        const x = c + Math.cos(a) * r * wob;
        const y = c + Math.sin(a) * r * wob;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
    } else if (opts.shape === 'diamond') {
      ctx.moveTo(c, c - r * 1.12);
      ctx.lineTo(c + r * 1.05, c);
      ctx.lineTo(c, c + r * 1.12);
      ctx.lineTo(c - r * 1.05, c);
    } else if (opts.shape === 'rect') {
      rr(ctx, c - r, c - r * 0.9, r * 2, r * 1.8, r * 0.28);
    } else {
      ctx.arc(c, c, r, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // inner detail
    if (opts.detail === 'segments') {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(c + i * r * 0.42, c, r * 0.22, r * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (opts.detail === 'crack') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.5, c - r * 0.5);
      ctx.lineTo(c - r * 0.1, c);
      ctx.lineTo(c - r * 0.35, c + r * 0.2);
      ctx.lineTo(c + r * 0.1, c + r * 0.6);
      ctx.stroke();
    }
    if (opts.detail === 'plates') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let i = 0; i < 3; i++) ctx.fillRect(c - r * 0.8, c - r * 0.7 + i * r * 0.6, r * 1.6, 3);
    }

    // eyes
    const eyes = opts.eyes === 1
      ? [[c, c - r * 0.18, r * 0.3]]
      : [[c - r * 0.4, c, r * 0.24], [c + r * 0.4, c, r * 0.24]];
    for (const [ex, eyy, er] of eyes) {
      ctx.fillStyle = '#0b0f18';
      ctx.beginPath();
      ctx.arc(ex, eyy, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      if (opts.eyes === 1) {
        ctx.beginPath();
        ctx.arc(ex, eyy, er * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(ex - er * 0.28, eyy - er * 0.3, er * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // mouth
    if (opts.teeth) {
      ctx.fillStyle = '#0b0f18';
      ctx.beginPath();
      ctx.moveTo(c - r * 0.5, c + r * 0.55);
      ctx.quadraticCurveTo(c, c + r * 0.95, c + r * 0.5, c + r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(c + i * r * 0.24 - 2, c + r * 0.6);
        ctx.lineTo(c + i * r * 0.24 + 2, c + r * 0.6);
        ctx.lineTo(c + i * r * 0.24, c + r * 0.78);
        ctx.closePath();
        ctx.fill();
      }
    }
    tex.refresh();
  };

  draw('e_crawler', TILE, '#ff8a4c', '#ffd166', { r: 12, shape: 'blob', eyes: 2, teeth: true, detail: 'crack' });
  draw('e_spitter', TILE, '#b98bff', '#7fd8ff', { r: 11, shape: 'diamond', eyes: 1, spikes: 3 });
  draw('e_bloater', TILE, '#ffd166', '#ff8a4c', { r: 12.5, shape: 'blob', eyes: 1, detail: 'segments' });
  draw('e_wraith', TILE, '#7fd8ff', '#e8f6ff', { r: 11, shape: 'blob', eyes: 2 });
  draw('e_husk', TILE * 1.4, '#ff4d6d', '#ffd166', { r: 16, shape: 'rect', eyes: 2, teeth: true, detail: 'plates' });
  draw('e_warden', TILE * 1.7, '#ff2e63', '#ffe08a', { r: 22, shape: 'rect', eyes: 1, teeth: true, spikes: 5, detail: 'plates' });
  draw('e_devourer', TILE * 2.2, '#b14bff', '#7cffb2', { r: 28, shape: 'blob', eyes: 2, teeth: true, spikes: 7, detail: 'crack' });

  // projectile
  {
    const S = 16;
    const { tex, ctx } = makeCanvas(scene, 'bolt', S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#e2e8f2');
    g.addColorStop(1, 'rgba(200,210,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    tex.refresh();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) {
    r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
  } else {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  }
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/* ---------------------------- floor decals ---------------------------- */

function buildDecals(scene) {
  const S = TILE;
  const { tex, ctx } = makeCanvas(scene, 'rubble_deco', S, S);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * (S - 9) + 3;
    const y = Math.random() * (S - 9) + 3;
    const w = 3 + Math.random() * 5;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    rr(ctx, x, y, w, w * 0.7, 1.5);
    ctx.fill();
  }
  tex.refresh();

  // thin crack lines for wall faces
  const { tex: t2, ctx: c2 } = makeCanvas(scene, 'crack_deco', S, S);
  c2.clearRect(0, 0, S, S);
  c2.strokeStyle = 'rgba(255,255,255,0.8)';
  c2.lineWidth = 1.6;
  c2.beginPath();
  let x = S * 0.2, y = 0;
  c2.moveTo(x, y);
  while (y < S) {
    x += (Math.random() - 0.5) * 8;
    y += 4 + Math.random() * 6;
    c2.lineTo(x, y);
  }
  c2.stroke();
  t2.refresh();
}

export function buildAllTextures(scene) {
  const tiles = buildTiles(scene);
  buildSnake(scene);
  buildPickups(scene);
  buildCreatures(scene);
  buildDecals(scene);
  return tiles;
}
