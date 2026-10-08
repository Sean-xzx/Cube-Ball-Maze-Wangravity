// Grid cells: 0 empty, 1 wall, 2 start, 3 goal, 4 trap hole, 5 star.
const CELL = {
  EMPTY: 0,
  WALL: 1,
  START: 2,
  GOAL: 3,
  TRAP: 4,
  STAR: 5,
};

const FACE_COLORS = [
  { name: '教学面 · 初次滚动', color: '#FFD93D', wall: '#FFCA28', bg: '#FFFDE7' },
  { name: '第 1 关 · 回廊', color: '#FF6B6B', wall: '#EF5350', bg: '#FFF0F0' },
  { name: '第 2 关 · 暗坑', color: '#51CF66', wall: '#43A047', bg: '#F0FFF0' },
  { name: '第 3 关 · 交错', color: '#339AF0', wall: '#1E88E5', bg: '#F0F8FF' },
  { name: '第 4 关 · 巡游', color: '#FF922B', wall: '#FB8C00', bg: '#FFF8F0' },
  { name: '第 5 关 · 追迹', color: '#CC5DE8', wall: '#AB47BC', bg: '#FFF0FF' },
];

const LEVELS = [
  createLevel(0, [
    '###############',
    '#.S.#.....#.E.#',
    '#...#.....#...#',
    '#...#..#..#...#',
    '#...#..#..#...#',
    '#...#..#..#...#',
    '#...#..#..#...#',
    '#...#..#..#...#',
    '#...#..#..#...#',
    '#...#..#..#...#',
    '#...#..#..#...#',
    '#......#......#',
    '#......#......#',
    '#......#......#',
    '###############',
  ], { difficulty: 0, tutorial: true }),
  createLevel(1, [
    '###############',
    '#S#...#...#...#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#.#',
    '#...#...#...#E#',
    '###############',
  ], { difficulty: 1 }),
  createLevel(2, [
    '###############',
    '#S...#.....#*.#',
    '####.#.###.##.#',
    '#......#......#',
    '#.######.####.#',
    '#...........#.#',
    '###.#######.#.#',
    '#.....#......T#',
    '#.###.#.#####.#',
    '#...#..T..#...#',
    '###.#####.#.###',
    '#.....#...#...#',
    '#.###.#.#####.#',
    '#..*#........E#',
    '###############',
  ], { difficulty: 2 }),
  createLevel(3, [
    '###############',
    '#S..#...#.....#',
    '###.#.#.#.###.#',
    '#.....#.....#.#',
    '#.###.#####.#.#',
    '#.#......*....#',
    '#.#.#####.###.#',
    '#...#...#.T.#.#',
    '###.#.#.###.#.#',
    '#.....#...#..*#',
    '#T###.###.#####',
    '#.#...........#',
    '#.#.#.#######.#',
    '#...#......T.E#',
    '###############',
  ], { difficulty: 4 }),
  createLevel(4, [
    '###############',
    '#S.#...#...#*.#',
    '##.#.#.#.#.##.#',
    '#....#...#....#',
    '#T###########.#',
    '#.#.........#.#',
    '#.#.###.###.#.#',
    '#...#..T..#...#',
    '###.#.###.###.#',
    '#.....#.....#.#',
    '#.#####.###.#.#',
    '#.#.....#...#.#',
    '#.#.#####.###.#',
    '#...#*....#E..#',
    '###############',
  ], { difficulty: 3 }),
  createLevel(5, [
    '###############',
    '#S...#...#....#',
    '####.#.#.#.##.#',
    '#......#...#..#',
    '#.########.#.##',
    '#.#......#.#.*#',
    '#.#.####.#.####',
    '#...#.....*...#',
    '###.#.#######.#',
    '#...........#.#',
    '#.#####.###.#.#',
    '#.......#*#.#.#',
    '#.#######.#.###',
    '#.........#..E#',
    '###############',
  ], { difficulty: 5, chaseStars: true }),
];

const MOVING_TRAP_PATHS = {
  3: [
    patrol('patrol-upper', 3, 5, 12, 5, 72),
    patrol('patrol-right', 13, 1, 13, 9, 64),
    patrol('patrol-lower', 3, 11, 13, 11, 68),
  ],
  4: [
    patrol('patrol-upper', 3, 5, 11, 5, 68),
    patrol('patrol-right', 13, 1, 13, 13, 62),
    patrol('patrol-lower', 7, 9, 11, 9, 66),
  ],
  5: [
    patrol('patrol-vertical', 10, 1, 10, 7, 64),
    patrol('patrol-middle', 5, 7, 13, 7, 70),
    patrol('patrol-lower', 1, 9, 11, 9, 68),
  ],
};

const LEVEL_PORTALS = {
  4: [
    { col: 12, row: 1 },
    { col: 9, row: 13 },
  ],
  5: [
    { col: 1, row: 3, activeOnStart: true },
    { col: 1, row: 10, activeOnStart: true },
  ],
};

const LEVEL_ROTATING_GATES = {};

function createLevel(faceIndex, rows, options = {}) {
  return {
    name: FACE_COLORS[faceIndex].name,
    color: FACE_COLORS[faceIndex].color,
    colorDark: FACE_COLORS[faceIndex].wall,
    bg: `linear-gradient(135deg, ${FACE_COLORS[faceIndex].bg}, #FFFFFF)`,
    ...options,
    grid: parseGrid(rows),
  };
}

function parseGrid(rows) {
  if (rows.length !== 15 || rows.some(row => row.length !== 15)) {
    throw new Error('Each Cube Maze level must use a 15x15 grid.');
  }
  const symbols = {
    '.': CELL.EMPTY,
    '#': CELL.WALL,
    S: CELL.START,
    E: CELL.GOAL,
    T: CELL.TRAP,
    '*': CELL.STAR,
  };
  return rows.map(row => [...row].map(symbol => symbols[symbol]));
}

function patrol(id, startCol, startRow, endCol, endRow, speed) {
  return {
    id,
    startCol,
    startRow,
    waypoints: linePath(startCol, startRow, endCol, endRow),
    speed,
  };
}

function linePath(startCol, startRow, endCol, endRow) {
  const points = [];
  const colStep = Math.sign(endCol - startCol);
  const rowStep = Math.sign(endRow - startRow);
  let col = startCol;
  let row = startRow;
  points.push({ col, row });
  while (col !== endCol || row !== endRow) {
    col += colStep;
    row += rowStep;
    points.push({ col, row });
  }
  for (let index = points.length - 2; index > 0; index--) {
    points.push({ ...points[index] });
  }
  return points;
}

function getStartPosition(levelIndex) {
  return findCell(levelIndex, CELL.START, { col: 1, row: 1 });
}

function getGoalPosition(levelIndex) {
  return findCell(levelIndex, CELL.GOAL, { col: 13, row: 13 });
}

function getStarPositions(levelIndex) {
  return findCells(levelIndex, CELL.STAR);
}

function getMovingTrapPaths(levelIndex) {
  return MOVING_TRAP_PATHS[levelIndex] || [];
}

function getPortalPair(levelIndex) {
  return (LEVEL_PORTALS[levelIndex] || []).map(portal => ({ ...portal }));
}

function getRotatingGates(levelIndex) {
  return (LEVEL_ROTATING_GATES[levelIndex] || []).map(gate => ({
    ...gate,
    pivot: { ...gate.pivot },
    states: gate.states.map(state => ({
      cells: state.cells.map(cell => ({ ...cell })),
      bars: state.bars.map(bar => bar.map(point => ({ ...point }))),
    })),
  }));
}

function rotatingGate(id, pivot, states, phaseOffsetMs = 0) {
  return {
    id,
    pivot,
    phaseOffsetMs,
    periodMs: 1000,
    states: states.map(state => ({
      cells: state.cells.map(([col, row]) => ({ col, row })),
      bars: state.bars.map(bar => bar.map(([col, row]) => ({ col, row }))),
    })),
  };
}

function findCell(levelIndex, cellType, fallback) {
  return findCells(levelIndex, cellType)[0] || fallback;
}

function findCells(levelIndex, cellType) {
  const positions = [];
  const grid = LEVELS[levelIndex].grid;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col] === cellType) positions.push({ col, row });
    }
  }
  return positions;
}

export {
  CELL,
  LEVELS,
  FACE_COLORS,
  MOVING_TRAP_PATHS,
  LEVEL_PORTALS,
  LEVEL_ROTATING_GATES,
  getStartPosition,
  getGoalPosition,
  getStarPositions,
  getMovingTrapPaths,
  getPortalPair,
  getRotatingGates,
};
