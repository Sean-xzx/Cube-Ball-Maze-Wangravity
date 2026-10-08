import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const findings = [];
const tracking = spawnSync('git', ['ls-files', '-z'], { cwd: fileURLToPath(root), encoding: 'utf8' });
const tracked = tracking.status === 0 ? new Set(tracking.stdout.split('\0').filter(Boolean)) : null;
if (!tracked) findings.push('Git must be on PATH to inspect the actual tracked release files.');
if (tracked) {
  for (const file of tracked) {
    if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) {
      findings.push(`${file}: tracked environment file; inspect and exclude private configuration.`);
    }
  }
}
for (const name of await readdir(new URL('src/', root))) {
  if (!name.endsWith('.js')) continue;
  const content = await readFile(new URL(`src/${name}`, root), 'utf8');
  if (/https:\/\/[^\s"']+\/manage\/[^\s"']+/.test(content)) {
    findings.push(`src/${name}: embedded remote write capability; revoke/rotate it and remove it from current client code. Existing history still exposes it.`);
  }
}
for (const relative of ['data/player-accounts.json', 'data/elite-leaderboard.json']) {
  if (tracked && !tracked.has(relative)) continue;
  try {
    const content = JSON.parse(await readFile(new URL(relative, root), 'utf8'));
    if ((content.accounts ?? content.records ?? []).length > 0) {
      findings.push(`${relative}: nonempty player data; retain privately, do not publish real records.`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const english = await readFile(new URL('README.md', root), 'utf8');
const chinese = await readFile(new URL('README.zh-CN.md', root), 'utf8');
if (pkg.license !== 'UNLICENSED' || !english.includes('All rights reserved') || !chinese.includes('保留所有权利')) {
  findings.push('Current release must retain the owner-approved all-rights-reserved notice, without an open-source grant.');
}
if (tracked?.has('LICENSE')) {
  findings.push('Current tree still tracks a LICENSE; verify removal of the previous open-source grant before release.');
}
const resources = await readFile(new URL('docs/RESOURCES.md', root), 'utf8');
const bundledUnclearedAssets = ['public/audio/pixel-city-beat.mp3', 'public/images/wristbound-icon.png']
  .some(relative => !tracked || tracked.has(relative));
if (bundledUnclearedAssets && resources.includes('PENDING_OWNER_CONFIRMATION')) {
  findings.push('Bundled asset redistribution rights require owner confirmation.');
}
if (findings.length) {
  console.error('Release blocked (values intentionally withheld):');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log('Release preflight passed. Also review the staged diff and Git history before pushing.');
}
