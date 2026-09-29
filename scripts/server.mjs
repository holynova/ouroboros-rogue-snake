/* Shared helper: make sure a dev server is reachable, starting one if not.
 * Lets the test scripts run standalone (`npm test`) without a separate terminal. */
import { spawn } from 'node:child_process';
import http from 'node:http';

export const PORT = Number(process.env.PORT || 5173);
export const BASE = `http://localhost:${PORT}/`;

export function isUp(timeout = 600) {
  return new Promise((resolve) => {
    const req = http.get(BASE, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

export async function ensureServer() {
  if (await isUp()) return null;
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', detached: false },
  );
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isUp()) return child;
  }
  child.kill();
  throw new Error(`dev server did not come up on ${BASE}`);
}
