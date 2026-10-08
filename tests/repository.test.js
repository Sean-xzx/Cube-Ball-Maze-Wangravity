import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('project title, npm metadata and repository target agree', async () => {
  const projectName = 'cube-ball-maze-Wangravity';
  const repository = `https://github.com/Sean-xzx/${projectName}`;
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, projectName.toLowerCase());
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.repository.url, `${repository}.git`);
  assert.equal(pkg.bugs.url, `${repository}/issues`);
  for (const file of ['README.md', 'README.zh-CN.md']) {
    const content = await readFile(path.join(root, file), 'utf8');
    assert.ok(content.includes(`# ${projectName}`));
    assert.ok(content.includes(`git clone ${repository}.git`));
    assert.ok(content.includes(`cd ${projectName}`));
  }
});

test('English and Chinese quick-start commands stay synchronized', async () => {
  const english = await readFile(path.join(root, 'README.md'), 'utf8');
  const chinese = await readFile(path.join(root, 'README.zh-CN.md'), 'utf8');
  const commands = text => [...text.replace(/\r\n/g, '\n').matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)].map(match => match[1].trim());
  assert.equal(commands(english).length, 2);
  assert.deepEqual(commands(english), commands(chinese));
  assert.match(english.split('\n')[0], /README\.zh-CN\.md/);
  assert.match(chinese.split('\n')[0], /README\.md/);
});

test('documentation links point to existing local files', async () => {
  for (const relative of ['README.md', 'README.zh-CN.md', 'docs/ARCHITECTURE.md', 'docs/VALIDATION.md', 'docs/RESOURCES.md', 'docs/DELIVERY_HANDOFF.md']) {
    const documentPath = path.join(root, relative);
    const content = await readFile(documentPath, 'utf8');
    for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      await access(path.resolve(path.dirname(documentPath), target.split('#')[0]));
    }
  }
});

test('required runtime resources and locked dependencies are present', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.name, pkg.name);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  for (const relative of ['index.html', 'style.css', 'docs/RESOURCES.md']) {
    await access(path.join(root, relative));
  }
});

test('published client has no legacy cloud defaults and development host is local', async () => {
  const game = await readFile(path.join(root, 'src/Game.js'), 'utf8');
  assert.match(game, /const DEFAULT_CLOUD_DATA_URL = '';/);
  assert.match(game, /const DEFAULT_CLOUD_MANAGE_URL = '';/);
  assert.doesNotMatch(game, /https:\/\/[^\s"']+\/manage\/[^\s"']+/);
  const config = await readFile(path.join(root, 'vite.config.js'), 'utf8');
  assert.match(config, /host: '127\.0\.0\.1'/);
  assert.doesNotMatch(config, /allowedHosts: true/);
});
