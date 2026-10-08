import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('isolated development API persists best-only records and latest avatar', { timeout: 20000 }, async () => {
  const temporaryRoot = path.resolve(tmpdir());
  const fixture = await mkdtemp(path.join(temporaryRoot, 'wangravity-api-test-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = path.join(fixture, 'vite.config.mjs');
  await copyFile(path.join(root, 'vite.config.js'), config);
  const address = 'http://127.0.0.1:4196';
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), fixture, '--config', config, '--host', '127.0.0.1', '--port', '4196', '--strictPort'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  let spawnError;
  server.on('error', error => { spawnError = error; });
  const request = async (route, body) => fetch(address + route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null) throw new Error(`Fixture server exited: ${output}`);
      if (output.replace(/\u001b\[[0-9;]*m/g, '').includes(address)) break;
      if (attempt === 99) throw new Error(`Fixture server startup timed out: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal((await request('/api/player/missing')).status, 404);
    assert.equal((await request('/api/player/%E0%A4%A')).status, 400);
    const rejectedOrigin = await fetch(address + '/api/player/fixture-player', {
      method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(rejectedOrigin.status, 403);
    const rejectedForm = await fetch(address + '/api/player/fixture-player', {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}',
    });
    assert.equal(rejectedForm.status, 415);
    const invalidJson = await fetch(address + '/api/player/fixture-player', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(invalidJson.status, 400);
    const oversized = await request('/api/player/fixture-player', { padding: 'x'.repeat(65536) });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await (await request('/api/leaderboard/records')).json(), { records: [] });
    assert.equal((await request('/api/leaderboard/records', { levelIndex: 9, timeMs: 1 })).status, 400);
    for (const timeMs of [3000, 4000, 2000]) {
      const response = await request('/api/leaderboard/records', {
        playerName: 'fixture-player', levelIndex: 2, timeMs, usedLives: 1,
        totalStars: 2, collectedStars: 2, avatarColor: '#339af0',
      });
      assert.equal(response.status, 201);
    }
    const records = (await (await request('/api/leaderboard/records')).json()).records;
    assert.equal(records.length, 1);
    assert.equal(records[0].timeMs, 2000);
    assert.equal((await request('/api/player/FIXTURE-PLAYER')).status, 200);
    const saved = await request('/api/player/fixture-player', {
      playerName: 'fixture-player', avatarColor: '#51cf66', bestTimes: { 2: 5000, 3: 6000 },
    });
    assert.equal(saved.status, 200);
    const account = (await saved.json()).account;
    assert.equal(account.bestTimes[2], 2000);
    assert.equal(account.bestTimes[3], 6000);
    assert.equal(account.avatarColor, '#51cf66');
    assert.equal((await (await request('/api/leaderboard/records')).json()).records[0].avatarColor, '#51cf66');
    const disk = JSON.parse(await readFile(path.join(fixture, 'data/player-accounts.json'), 'utf8'));
    assert.equal(disk.accounts.length, 1);
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await new Promise(resolve => server.once('exit', resolve));
    }
    const relative = path.relative(temporaryRoot, path.resolve(fixture));
    if (!relative.startsWith('wangravity-api-test-') || relative.includes(path.sep)) {
      throw new Error('Unsafe fixture cleanup path');
    }
    await rm(fixture, { recursive: true, force: true });
  }
});
