import test from 'node:test';
import assert from 'node:assert/strict';
import Physics, { CELL_SIZE } from '../src/Physics.js';
import { CELL } from '../src/LevelData.js';

function emptyMap() {
  return Array.from({ length: 15 }, (_, row) => Array.from({ length: 15 }, (_, col) => (
    row === 0 || col === 0 || row === 14 || col === 14 ? CELL.WALL : CELL.EMPTY
  )));
}

test('reset and zero input leave the ball centered and stationary', () => {
  const physics = new Physics();
  physics.reset(2, 3);
  assert.equal(physics.x, 2.5 * CELL_SIZE);
  assert.equal(physics.y, 3.5 * CELL_SIZE);
  physics.update(0, 0, emptyMap());
  assert.equal(physics.getSpeed(), 0);
  assert.equal(physics.falling, false);
});

test('tilt moves the ball but velocity remains bounded', () => {
  const physics = new Physics();
  physics.reset(2, 3);
  const initialX = physics.x;
  for (let frame = 0; frame < 30; frame++) physics.update(1, 0, emptyMap());
  assert.ok(physics.x > initialX);
  assert.ok(physics.getSpeed() <= physics.maxSpeed + 1e-10);
});

test('walls prevent penetration and signal an impact', () => {
  const physics = new Physics();
  const grid = emptyMap();
  grid[3][3] = CELL.WALL;
  physics.reset(2, 3);
  let hit = false;
  for (let frame = 0; frame < 90; frame++) {
    hit = physics.update(1, 0, grid).hit || hit;
    assert.ok(physics.x <= 3 * CELL_SIZE - physics.radius + 1e-8);
  }
  assert.equal(hit, true);
});

test('coin, goal and trap events are distinct', () => {
  for (const [cell, event] of [[CELL.STAR, 'collectedStar'], [CELL.GOAL, 'goalReached'], [CELL.TRAP, 'hitTrap']]) {
    const physics = new Physics();
    const grid = emptyMap();
    grid[3][2] = cell;
    physics.reset(2, 3);
    const result = physics.update(0, 0, grid);
    assert.ok(result[event]);
    assert.equal(physics.falling, cell !== CELL.STAR);
  }
});

test('an inactive moving trap does not collide, an active one does', () => {
  const physics = new Physics();
  physics.reset(2, 3);
  const trap = { x: physics.x, y: physics.y, radius: 13, active: false };
  assert.equal(physics.update(0, 0, emptyMap(), [trap]).hitMovingTrap, undefined);
  trap.active = true;
  assert.equal(physics.update(0, 0, emptyMap(), [trap]).hitMovingTrap, true);
  assert.equal(physics.fallType, 'trap');
});

test('fall animation completes and teleport resets fall state', () => {
  const physics = new Physics();
  physics.reset(2, 3);
  physics.beginFall('goal', 120, 140);
  let result;
  for (let frame = 0; frame < 20; frame++) result = physics.update(0, 0, emptyMap());
  assert.equal(result.complete, true);
  assert.equal(physics.getDrawPos().radius, 0);
  physics.vx = 5;
  physics.teleportTo(200, 220);
  assert.equal(physics.x, 200);
  assert.equal(physics.y, 220);
  assert.ok(Math.abs(physics.vx - 3.6) < 1e-10);
  assert.equal(physics.falling, false);
  assert.equal(physics.fallType, null);
});
