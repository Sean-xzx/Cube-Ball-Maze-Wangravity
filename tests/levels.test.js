import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL, LEVELS, getStartPosition, getGoalPosition, getStarPositions,
  getMovingTrapPaths, getPortalPair, getRotatingGates,
} from '../src/LevelData.js';

test('six valid, bounded maps have one start and one goal', () => {
  assert.equal(LEVELS.length, 6);
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(level.grid.length, 15);
    assert.ok(level.grid.every(row => row.length === 15));
    assert.ok(level.grid.flat().every(cell => Object.values(CELL).includes(cell)));
    for (const type of [CELL.START, CELL.GOAL]) {
      assert.equal(level.grid.flat().filter(cell => cell === type).length, 1);
    }
    const start = getStartPosition(index);
    const goal = getGoalPosition(index);
    assert.equal(level.grid[start.row][start.col], CELL.START);
    assert.equal(level.grid[goal.row][goal.col], CELL.GOAL);
    for (let i = 0; i < 15; i++) {
      assert.equal(level.grid[0][i], CELL.WALL);
      assert.equal(level.grid[14][i], CELL.WALL);
      assert.equal(level.grid[i][0], CELL.WALL);
      assert.equal(level.grid[i][14], CELL.WALL);
    }
  }
});

test('coin totals and restored level-five corridor retain their contract', () => {
  assert.deepEqual(LEVELS.map((_, index) => getStarPositions(index).length), [0, 0, 2, 2, 2, 3]);
  assert.equal(LEVELS[5].grid[6][3], CELL.EMPTY);
  assert.equal(LEVELS[5].chaseStars, true);
  assert.ok(LEVELS.every((_, index) => getRotatingGates(index).length === 0));
});

test('every exit and coin is reachable through non-wall cells', () => {
  for (const [index, level] of LEVELS.entries()) {
    const start = getStartPosition(index);
    const queue = [start];
    const visited = new Set([`${start.col},${start.row}`]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const { col, row } = queue[cursor];
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextCol = col + dc;
        const nextRow = row + dr;
        const key = `${nextCol},${nextRow}`;
        if (level.grid[nextRow]?.[nextCol] === undefined ||
            level.grid[nextRow][nextCol] === CELL.WALL || visited.has(key)) continue;
        visited.add(key);
        queue.push({ col: nextCol, row: nextRow });
      }
    }
    for (const point of [getGoalPosition(index), ...getStarPositions(index)]) {
      assert.ok(visited.has(`${point.col},${point.row}`), `level ${index}: disconnected target`);
    }
  }
});

test('portals occupy traversable cells and returned portal metadata is isolated', () => {
  for (const [index, expected] of [[4, [[12, 1], [9, 13]]], [5, [[1, 3], [1, 10]]]]) {
    const pair = getPortalPair(index);
    assert.deepEqual(pair.map(p => [p.col, p.row]), expected);
    assert.ok(pair.every(p => LEVELS[index].grid[p.row][p.col] !== CELL.WALL));
    assert.ok(pair.every(p => Boolean(p.activeOnStart) === (index === 5)));
    pair[0].col = -1;
    assert.equal(getPortalPair(index)[0].col, expected[0][0]);
  }
  assert.ok([0, 1, 2, 3].every(index => getPortalPair(index).length === 0));
});

test('patrol paths are continuous, non-wall routes with positive speed', () => {
  for (const [index, level] of LEVELS.entries()) {
    const paths = getMovingTrapPaths(index);
    assert.equal(paths.length, index >= 3 ? 3 : 0);
    for (const path of paths) {
      assert.ok(path.speed > 0);
      for (const [pointIndex, point] of path.waypoints.entries()) {
        assert.notEqual(level.grid[point.row][point.col], CELL.WALL);
        const next = path.waypoints[(pointIndex + 1) % path.waypoints.length];
        assert.equal(Math.abs(point.col - next.col) + Math.abs(point.row - next.row), 1);
      }
    }
  }
});
