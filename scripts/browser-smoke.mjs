import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--lite')) {
  throw new Error('Usage: npm run test:browser -- [--lite]');
}
const port = 4195;
const address = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
let spawnError;
server.on('error', error => { spawnError = error; });
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error(`Preview exited: ${output}`);
    // Wait for this process, not another listener on the requested port.
    if (output.includes(address)) break;
    if (attempt === 99) throw new Error('Preview startup timed out. Run npm run build first.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const mode of [
    { name: 'mobile-lite', viewport: { width: 390, height: 844 }, quality: '?quality=lite', mobile: true },
    { name: 'mobile-3d', viewport: { width: 390, height: 844 }, quality: '', mobile: true },
    { name: 'desktop-3d', viewport: { width: 1280, height: 900 }, quality: '', mobile: false },
  ].filter(mode => process.argv[2] !== '--lite' || mode.quality === '?quality=lite')) {
    const context = await browser.newContext({ viewport: mode.viewport, isMobile: mode.mobile, hasTouch: mode.mobile });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    if (!mode.mobile) {
      // Bound software-GPU work in headless desktop verification; not a performance benchmark.
      await page.addInitScript(() => {
        window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 100);
        window.cancelAnimationFrame = handle => window.clearTimeout(handle);
      });
    }
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === address && !url.pathname.startsWith('/api/')) return route.continue();
      // Test-only unavailable-service fixture: no private service reads or writes.
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.goto(address + '/' + mode.quality);
    console.log(`CHECK ${mode.name}: start/calibration`);
    await page.locator('#btn-start').click();
    await page.locator('#player-name-input').fill('verification-only');
    await page.locator('#btn-confirm-calibration').click();
    await page.waitForFunction(() => window.__cubeMazeGame?.state === 'HINT');
    assert.equal(await page.evaluate(() => Boolean(window.__cubeMazeGame.renderer.liteMode)), mode.quality === '?quality=lite');
    console.log(`CHECK ${mode.name}: input/leaderboard`);
    assert.equal(await page.evaluate(() => window.__cubeMazeGame.faceTimeRemainingMs), 24000);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__cubeMazeGame.faceTimeRemainingMs), 24000);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__cubeMazeGame.state === 'PLAYING');

    const initialX = await page.evaluate(() => window.__cubeMazeGame.physics.x);
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    await page.keyboard.up('d');
    assert.ok(await page.evaluate(x => window.__cubeMazeGame.physics.x > x, initialX));
    await page.locator('#btn-leaderboard').click();
    const paused = await page.evaluate(() => window.__cubeMazeGame.faceTimeRemainingMs);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__cubeMazeGame.faceTimeRemainingMs), paused);
    await page.locator('#btn-leaderboard-close').click();
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(value => window.__cubeMazeGame.faceTimeRemainingMs < value, paused));

    const limits = [24, 36, 48, 72, 144, 216];
    for (let index = 0; index < limits.length; index++) {
      console.log(`CHECK ${mode.name}: map ${index}`);
      await page.locator('#btn-level-menu').click();
      await page.locator(`[data-jump-face="${index}"]`).click();
      assert.equal(await page.evaluate(() => window.__cubeMazeGame.currentFace), index);
      assert.equal(await page.evaluate(() => window.__cubeMazeGame.faceTimeRemainingMs), limits[index] * 1000);
      await page.keyboard.press('Space');
      const colors = await page.evaluate(() => {
        const game = window.__cubeMazeGame;
        game._stopLoop();
        game._renderFrame(0, 0);
        const canvas = document.querySelector('#game-canvas');
        const pixels = new Set();
        if (game.renderer.liteMode) {
          const context = canvas.getContext('2d');
          for (let y = 1; y < 10; y++) for (let x = 1; x < 10; x++) {
            const data = context.getImageData(Math.floor(canvas.width * x / 10), Math.floor(canvas.height * y / 10), 1, 1).data;
            pixels.add([...data].join(','));
          }
        } else {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const data = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
          for (let y = 1; y < 10; y++) for (let x = 1; x < 10; x++) {
            const offset = (Math.floor(height * y / 10) * width + Math.floor(width * x / 10)) * 4;
            pixels.add([...data.subarray(offset, offset + 4)].join(','));
          }
        }
        return pixels.size;
      });
      assert.ok(colors > 3, `${mode.name} level ${index}: blank or uniform canvas`);

      // Controlled state setup exercises the real goal/fall/summary path, not a human maze playthrough.
      await page.evaluate(() => {
        const game = window.__cubeMazeGame;
        for (let row = 0; row < game.grid.length; row++) for (let col = 0; col < game.grid[row].length; col++) {
          if (game.grid[row][col] === 5) game._collectStar({ col, row });
        }
        game.movingTraps = [];
        game.pendingChaseTraps = [];
        game.input.clearKeys();
        for (let row = 0; row < game.grid.length; row++) for (let col = 0; col < game.grid[row].length; col++) {
          if (game.grid[row][col] === 3) game.physics.reset(col, row);
        }
        game._lastFrameMs = performance.now();
        game._startLoop();
      });
      await page.waitForFunction(() => window.__cubeMazeGame.state === 'SUMMARY', null, { timeout: 45000 });
      assert.equal(await page.locator('#summary-stars').textContent(), '★★★');
      if (index === 5) {
        await page.evaluate(() => window.__cubeMazeGame._stopLoop());
        await page.screenshot({ path: fileURLToPath(new URL(`../test-results/${mode.name}.png`, import.meta.url)), animations: 'disabled', timeout: 45000 });
      }
      await page.locator('#btn-summary-continue').click();
      if (index === 5) await page.waitForFunction(() => window.__cubeMazeGame.state === 'COMPLETE');
      else await page.waitForFunction(() => window.__cubeMazeGame.state === 'HINT');
      if (index < 5) await page.keyboard.press('Space');
    }
    assert.deepEqual(pageErrors, [], `${mode.name}: uncaught browser errors`);
    console.log(`PASS ${mode.name}: startup, input, pause, six maps, canvas pixels, summaries, completion`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
  }
}
