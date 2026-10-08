import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const leaderboardFile = path.join(rootDir, 'data', 'elite-leaderboard.json');
const playerAccountsFile = path.join(rootDir, 'data', 'player-accounts.json');
const avatarColors = new Set(['#f3f5f7', '#ffd93d', '#51cf66', '#339af0', '#cc5de8', '#ff922b']);

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 65536) {
      const error = new Error('request-body-too-large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readRecords() {
  try {
    const raw = await fs.readFile(leaderboardFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Leaderboard read failed:', error);
    return [];
  }
}

async function writeRecords(records) {
  await fs.mkdir(path.dirname(leaderboardFile), { recursive: true });
  await fs.writeFile(leaderboardFile, JSON.stringify({ records }, null, 2), 'utf8');
}

async function readAccounts() {
  try {
    const raw = await fs.readFile(playerAccountsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.accounts) ? parsed.accounts : [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Player account read failed:', error);
    return [];
  }
}

async function writeAccounts(accounts) {
  await fs.mkdir(path.dirname(playerAccountsFile), { recursive: true });
  await fs.writeFile(playerAccountsFile, JSON.stringify({ accounts }, null, 2), 'utf8');
}

function toIsoDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sanitizePlayerName(value, fallback = 'PLAYER', maxLength = 24) {
  return String(value || fallback)
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
    .trim()
    .slice(0, maxLength) || fallback;
}

function playerKey(playerName) {
  return sanitizePlayerName(playerName).toLowerCase();
}

function sanitizeAvatarColor(value) {
  const normalized = String(value || '').toLowerCase();
  return avatarColors.has(normalized) ? normalized : '#f3f5f7';
}

function sanitizeBestTimes(input = {}) {
  const bestTimes = {};
  for (let levelIndex = 0; levelIndex < 6; levelIndex++) {
    const value = Number(input[levelIndex]);
    if (Number.isFinite(value) && value > 0) bestTimes[levelIndex] = Math.round(value);
  }
  return bestTimes;
}

function mergeBestTimes(...sources) {
  const merged = {};
  for (const source of sources) {
    const clean = sanitizeBestTimes(source);
    for (const [levelIndex, timeMs] of Object.entries(clean)) {
      if (!merged[levelIndex] || timeMs < merged[levelIndex]) merged[levelIndex] = timeMs;
    }
  }
  return merged;
}

function sanitizeProfile(input = {}, existing = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const previous = existing && typeof existing === 'object' ? existing : {};
  const lastLevel = Number(source.lastLevel ?? previous.lastLevel ?? 0);
  return {
    ...previous,
    ...source,
    gameName: String(source.gameName || previous.gameName || 'WANGRAVITY').slice(0, 32),
    lastLevel: Number.isInteger(lastLevel) ? Math.max(0, Math.min(5, lastLevel)) : 0,
    savedAt: toIsoDate(source.savedAt || previous.savedAt),
  };
}

function sanitizeRecord(input) {
  const levelIndex = Number(input?.levelIndex);
  const timeMs = Number(input?.timeMs);
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex > 5) return null;
  if (!Number.isFinite(timeMs) || timeMs <= 0) return null;

  const playerName = sanitizePlayerName(input?.playerName);
  const avatarColor = sanitizeAvatarColor(input?.avatarColor);
  const totalStars = Math.max(0, Math.min(99, Number(input?.totalStars) || 0));
  const collectedStars = Math.max(0, Math.min(totalStars, Number(input?.collectedStars) || 0));
  const usedLives = Math.max(1, Math.min(999, Number(input?.usedLives) || 1));

  return {
    id: String(input?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 80),
    playerName,
    avatarColor,
    levelIndex,
    label: levelIndex === 0 ? 'TUTORIAL' : `LEVEL ${String(levelIndex).padStart(2, '0')}`,
    timeMs: Math.round(timeMs),
    usedLives,
    collectedStars,
    totalStars,
    createdAt: toIsoDate(input?.createdAt),
  };
}

function trimRecords(records) {
  const unique = new Map();
  for (const record of records) {
    const clean = sanitizeRecord(record);
    if (!clean) continue;
    const key = `${clean.levelIndex}:${playerKey(clean.playerName)}`;
    clean.id = clean.id || `elite-${key}`;
    const existing = unique.get(key);
    if (!existing || clean.timeMs < existing.timeMs) unique.set(key, clean);
  }

  const result = [];
  for (let levelIndex = 0; levelIndex < 6; levelIndex++) {
    result.push(...Array.from(unique.values())
      .filter(record => record.levelIndex === levelIndex)
      .sort((a, b) => a.timeMs - b.timeMs || a.createdAt.localeCompare(b.createdAt))
      .slice(0, 50));
  }
  return result;
}

function sanitizeAccount(input, existing = null, { touchUpdatedAt = true } = {}) {
  const name = sanitizePlayerName(input?.playerName || existing?.playerName);
  const key = playerKey(name);
  const avatarColor = sanitizeAvatarColor(input?.avatarColor || existing?.avatarColor);
  const eliteRecords = trimRecords([
    ...(Array.isArray(existing?.eliteRecords) ? existing.eliteRecords : []),
    ...(Array.isArray(input?.eliteRecords) ? input.eliteRecords : []),
  ]).filter(record => playerKey(record.playerName) === key);

  const bestTimesFromRecords = {};
  for (const record of eliteRecords) bestTimesFromRecords[record.levelIndex] = record.timeMs;

  return {
    playerName: name,
    playerKey: key,
    avatarColor,
    bestTimes: mergeBestTimes(existing?.bestTimes, input?.bestTimes, bestTimesFromRecords),
    eliteRecords: eliteRecords.map(record => ({ ...record, playerName: name, avatarColor })),
    profile: sanitizeProfile(input?.profile, existing?.profile),
    createdAt: existing?.createdAt || toIsoDate(input?.createdAt),
    updatedAt: touchUpdatedAt ? new Date().toISOString() : (existing?.updatedAt || input?.updatedAt || new Date().toISOString()),
  };
}

function trimAccounts(accounts) {
  const unique = new Map();
  for (const account of accounts) {
    const existing = unique.get(playerKey(account?.playerName));
    const merged = sanitizeAccount(account, existing, { touchUpdatedAt: false });
    unique.set(merged.playerKey, merged);
  }
  return Array.from(unique.values()).sort((a, b) => a.playerName.localeCompare(b.playerName, 'zh-CN'));
}

async function saveAccount(input) {
  const accounts = trimAccounts(await readAccounts());
  const key = playerKey(input?.playerName);
  const existing = accounts.find(account => account.playerKey === key) || null;
  const account = sanitizeAccount(input, existing);
  const nextAccounts = trimAccounts([
    ...accounts.filter(item => item.playerKey !== account.playerKey),
    account,
  ]);
  await writeAccounts(nextAccounts);
  await updateRecordAvatar(account.playerName, account.avatarColor);
  return account;
}

async function loadAccount(name) {
  const key = playerKey(name);
  return trimAccounts(await readAccounts()).find(account => account.playerKey === key) || null;
}

async function updateRecordAvatar(playerName, avatarColor) {
  const key = playerKey(playerName);
  const color = sanitizeAvatarColor(avatarColor);
  const records = trimRecords(await readRecords()).map((record) => (
    playerKey(record.playerName) === key ? { ...record, avatarColor: color } : record
  ));
  await writeRecords(records);
}

async function recordsWithAccountAvatars(records) {
  const accounts = new Map(trimAccounts(await readAccounts()).map(account => [account.playerKey, account]));
  return records.map((record) => {
    const account = accounts.get(playerKey(record.playerName));
    return account ? { ...record, avatarColor: account.avatarColor, playerName: account.playerName } : record;
  });
}

async function saveAccountFromRecord(record) {
  return saveAccount({
    playerName: record.playerName,
    avatarColor: record.avatarColor,
    bestTimes: { [record.levelIndex]: record.timeMs },
    eliteRecords: [record],
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function leaderboardPlugin() {
  return {
    name: 'wangravity-leaderboard-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}`) {
          sendJson(res, 403, { error: 'cross-origin-request-denied' });
          return;
        }
        if (req.method === 'POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
          sendJson(res, 415, { error: 'json-content-type-required' });
          return;
        }
        next();
      });
      server.middlewares.use('/api/leaderboard/records', async (req, res) => {
        if (req.method === 'OPTIONS') {
          sendJson(res, 204, {});
          return;
        }

        if (req.method === 'GET') {
          sendJson(res, 200, { records: await recordsWithAccountAvatars(trimRecords(await readRecords())) });
          return;
        }

        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const record = sanitizeRecord(JSON.parse(body || '{}'));
            if (!record) {
              sendJson(res, 400, { error: 'invalid-record' });
              return;
            }

            const records = trimRecords([...(await readRecords()), record]);
            await writeRecords(records);
            const account = await saveAccountFromRecord(record);
            sendJson(res, 201, {
              ok: true,
              record: { ...record, avatarColor: account.avatarColor, playerName: account.playerName },
              records: await recordsWithAccountAvatars(records),
            });
          } catch (error) {
            console.warn('Leaderboard write failed:', error);
            const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
            sendJson(res, status, { error: status === 413 ? 'request-body-too-large' : 'leaderboard-write-failed' });
          }
          return;
        }

        sendJson(res, 405, { error: 'method-not-allowed' });
      });

      server.middlewares.use('/api/player', async (req, res) => {
        if (req.method === 'OPTIONS') {
          sendJson(res, 204, {});
          return;
        }

        const url = new URL(req.url || '/', 'http://wangravity.local');
        let routeName;
        try {
          routeName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        } catch {
          sendJson(res, 400, { error: 'invalid-player-route' });
          return;
        }

        if (req.method === 'GET') {
          const account = await loadAccount(routeName);
          if (!account) {
            sendJson(res, 404, { error: 'player-not-found' });
            return;
          }
          sendJson(res, 200, { account });
          return;
        }

        if (req.method === 'POST') {
          try {
            const body = await readBody(req);
            const input = JSON.parse(body || '{}');
            const account = await saveAccount({
              ...input,
              playerName: input.playerName || routeName,
            });
            sendJson(res, 200, { ok: true, account });
          } catch (error) {
            console.warn('Player account write failed:', error);
            const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
            sendJson(res, status, { error: status === 413 ? 'request-body-too-large' : 'player-account-write-failed' });
          }
          return;
        }

        sendJson(res, 405, { error: 'method-not-allowed' });
      });
    },
  };
}

export default {
  base: './',
  plugins: [leaderboardPlugin()],
  server: {
    host: '127.0.0.1',
    headers: {
      'Permissions-Policy': 'accelerometer=(self), gyroscope=(self), magnetometer=(self)',
    },
  },
};
