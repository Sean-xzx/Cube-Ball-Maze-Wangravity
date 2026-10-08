import { CELL } from './LevelData.js';

const CELL_SIZE = 40;
const GOAL_RADIUS = CELL_SIZE * 0.42;
const STATIC_TRAP_RADIUS = CELL_SIZE * 0.36;

export default class Physics {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = 12;

    this.accelScale = 0.55;
    this.friction = 0.97;
    this.maxSpeed = 8.5;
    this.bounceCoeff = 0.45;

    this.hitWalls = [];
    this._prevWallKeys = new Set();
    this._currentWallKeys = new Set();
    this._hitImpacted = false;
    this.falling = false;
    this.fallProgress = 0;
    this.fallType = null;
    this.goalX = null;
    this.goalY = null;
    this.fallStartX = null;
    this.fallStartY = null;
  }

  reset(col, row) {
    this.x = col * CELL_SIZE + CELL_SIZE / 2;
    this.y = row * CELL_SIZE + CELL_SIZE / 2;
    this.vx = 0;
    this.vy = 0;
    this.hitWalls = [];
    this._prevWallKeys.clear();
    this._currentWallKeys.clear();
    this._hitImpacted = false;
    this.falling = false;
    this.fallProgress = 0;
    this.fallType = null;
    this.goalX = null;
    this.goalY = null;
    this.fallStartX = null;
    this.fallStartY = null;
  }

  update(ax, ay, grid, movingTraps = [], goalUnlocked = true, frameScale = 1) {
    frameScale = Math.max(0, Math.min(3, frameScale));
    if (this.falling) {
      this.fallProgress += 0.055 * frameScale;
      return {
        falling: true,
        complete: this.fallProgress >= 1,
        fallType: this.fallType,
      };
    }

    this.vx += ax * this.accelScale * frameScale;
    this.vy += ay * this.accelScale * frameScale;
    const friction = Math.pow(this.friction, frameScale);
    this.vx *= friction;
    this.vy *= friction;

    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > this.maxSpeed) {
      this.vx = (this.vx / speed) * this.maxSpeed;
      this.vy = (this.vy / speed) * this.maxSpeed;
    }

    if (speed < 0.15 && Math.abs(ax) < 0.02 && Math.abs(ay) < 0.02) {
      this.vx = 0;
      this.vy = 0;
    }

    this.x += this.vx * frameScale;
    this.y += this.vy * frameScale;

    this.hitWalls = [];
    this._currentWallKeys.clear();
    this._hitImpacted = false;
    this.resolveOuterBounds(grid);
    const { impacted } = this.resolveCollisions(grid);
    const staticTrap = this.findStaticTrap(grid);
    const movingTrap = this.findMovingTrap(movingTraps);

    if (staticTrap || movingTrap) {
      const trap = staticTrap || movingTrap;
      this.beginFall('trap', trap.x, trap.y);
      return {
        hit: impacted,
        hitTrap: Boolean(staticTrap),
        hitMovingTrap: Boolean(movingTrap),
        trapPosition: trap,
        speed: this.getSpeed(),
      };
    }

    const collectedStar = this.findStar(grid);
    const goalReached = goalUnlocked ? this.checkGoal(grid) : false;

    return {
      hit: impacted,
      goalReached,
      collectedStar,
      speed: this.getSpeed(),
    };
  }

  resolveCollisions(grid) {
    let touching = this.hitWalls.length > 0;
    let impacted = this._hitImpacted;
    const rows = grid.length;
    const cols = grid[0].length;
    const minCol = Math.max(0, Math.floor((this.x - this.radius) / CELL_SIZE));
    const maxCol = Math.min(cols - 1, Math.floor((this.x + this.radius) / CELL_SIZE));
    const minRow = Math.max(0, Math.floor((this.y - this.radius) / CELL_SIZE));
    const maxRow = Math.min(rows - 1, Math.floor((this.y + this.radius) / CELL_SIZE));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (grid[row][col] !== CELL.WALL) continue;

        const left = col * CELL_SIZE;
        const top = row * CELL_SIZE;
        const right = left + CELL_SIZE;
        const bottom = top + CELL_SIZE;
        const closestX = Math.max(left, Math.min(this.x, right));
        const closestY = Math.max(top, Math.min(this.y, bottom));
        let dx = this.x - closestX;
        let dy = this.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= this.radius) continue;
        touching = true;

        if (dist === 0) {
          let nx = -1;
          let ny = 0;
          let amount = this.x - left + this.radius;
          let speed = Math.max(0, -this.vx);

          const rightAmount = right - this.x + this.radius;
          const rightSpeed = Math.max(0, this.vx);
          if (rightAmount < amount || (rightAmount === amount && rightSpeed > speed)) {
            nx = 1; ny = 0; amount = rightAmount; speed = rightSpeed;
          }

          const topAmount = this.y - top + this.radius;
          const topSpeed = Math.max(0, -this.vy);
          if (topAmount < amount || (topAmount === amount && topSpeed > speed)) {
            nx = 0; ny = -1; amount = topAmount; speed = topSpeed;
          }

          const bottomAmount = bottom - this.y + this.radius;
          const bottomSpeed = Math.max(0, this.vy);
          if (bottomAmount < amount || (bottomAmount === amount && bottomSpeed > speed)) {
            nx = 0; ny = 1; amount = bottomAmount;
          }

          this.x += nx * amount;
          this.y += ny * amount;
          dx = nx;
          dy = ny;
        } else {
          const overlap = this.radius - dist;
          this.x += (dx / dist) * overlap;
          this.y += (dy / dist) * overlap;
        }

        if (Math.abs(dx) > Math.abs(dy)) {
          const intoWall = (dx > 0 && this.vx < 0) || (dx < 0 && this.vx > 0);
          if (intoWall) this.vx = -this.vx * this.bounceCoeff;
          else if (Math.abs(this.vx) < 0.5) this.vx *= 0.1;
        } else {
          const intoWall = (dy > 0 && this.vy < 0) || (dy < 0 && this.vy > 0);
          if (intoWall) this.vy = -this.vy * this.bounceCoeff;
          else if (Math.abs(this.vy) < 0.5) this.vy *= 0.1;
        }

        if (this._recordWallHit(col, row)) impacted = true;
      }
    }

    if (touching) {
      const previous = this._prevWallKeys;
      this._prevWallKeys = this._currentWallKeys;
      this._currentWallKeys = previous;
    } else {
      this._prevWallKeys.clear();
    }

    return { touching, impacted };
  }

  resolveOuterBounds(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const minX = CELL_SIZE + this.radius;
    const maxX = (cols - 1) * CELL_SIZE - this.radius;
    const minY = CELL_SIZE + this.radius;
    const maxY = (rows - 1) * CELL_SIZE - this.radius;

    if (this.x < minX) {
      this.x = minX;
      if (this.vx < 0) this.vx = -this.vx * this.bounceCoeff;
      this._hitImpacted = this._recordWallHit(0, this._toGridIndex(this.y, rows)) || this._hitImpacted;
    } else if (this.x > maxX) {
      this.x = maxX;
      if (this.vx > 0) this.vx = -this.vx * this.bounceCoeff;
      this._hitImpacted = this._recordWallHit(cols - 1, this._toGridIndex(this.y, rows)) || this._hitImpacted;
    }

    if (this.y < minY) {
      this.y = minY;
      if (this.vy < 0) this.vy = -this.vy * this.bounceCoeff;
      this._hitImpacted = this._recordWallHit(this._toGridIndex(this.x, cols), 0) || this._hitImpacted;
    } else if (this.y > maxY) {
      this.y = maxY;
      if (this.vy > 0) this.vy = -this.vy * this.bounceCoeff;
      this._hitImpacted = this._recordWallHit(this._toGridIndex(this.x, cols), rows - 1) || this._hitImpacted;
    }
  }

  checkGoal(grid) {
    const goal = this.findGridCell(grid, CELL.GOAL, this.radius + GOAL_RADIUS);
    if (!goal) return false;
    this.beginFall('goal', goal.x, goal.y);
    return true;
  }

  findStaticTrap(grid) {
    return this.findGridCell(grid, CELL.TRAP, this.radius + STATIC_TRAP_RADIUS);
  }

  findStar(grid) {
    const star = this.findGridCell(grid, CELL.STAR, this.radius * 1.2);
    return star ? { col: star.col, row: star.row } : null;
  }

  findMovingTrap(movingTraps) {
    for (const trap of movingTraps) {
      if (!trap.active) continue;
      const dx = this.x - trap.x;
      const dy = this.y - trap.y;
      const threshold = this.radius + (trap.radius || 13);
      if (dx * dx + dy * dy < threshold * threshold) {
        return { x: trap.x, y: trap.y };
      }
    }
    return null;
  }

  findGridCell(grid, cellType, threshold) {
    const halfCell = CELL_SIZE / 2;
    const minCol = Math.max(0, Math.ceil((this.x - threshold - halfCell) / CELL_SIZE));
    const maxCol = Math.min(grid[0].length - 1, Math.floor((this.x + threshold - halfCell) / CELL_SIZE));
    const minRow = Math.max(0, Math.ceil((this.y - threshold - halfCell) / CELL_SIZE));
    const maxRow = Math.min(grid.length - 1, Math.floor((this.y + threshold - halfCell) / CELL_SIZE));
    const thresholdSquared = threshold * threshold;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (grid[row][col] !== cellType) continue;
        const x = col * CELL_SIZE + CELL_SIZE / 2;
        const y = row * CELL_SIZE + CELL_SIZE / 2;
        const dx = this.x - x;
        const dy = this.y - y;
        if (dx * dx + dy * dy < thresholdSquared) return { col, row, x, y };
      }
    }
    return null;
  }

  _toGridIndex(value, max) {
    return Math.max(0, Math.min(max - 1, Math.floor(value / CELL_SIZE)));
  }

  _recordWallHit(col, row) {
    this.hitWalls.push({ col, row });
    const key = row * 64 + col;
    this._currentWallKeys.add(key);
    return !this._prevWallKeys.has(key);
  }

  beginFall(type, x, y) {
    this.falling = true;
    this.fallProgress = 0;
    this.fallType = type;
    this.fallStartX = this.x;
    this.fallStartY = this.y;
    this.goalX = x;
    this.goalY = y;
    this.vx = 0;
    this.vy = 0;
  }

  teleportTo(x, y, speedScale = 0.72) {
    this.x = x;
    this.y = y;
    this.vx *= speedScale;
    this.vy *= speedScale;
    this.hitWalls = [];
    this._prevWallKeys.clear();
    this._currentWallKeys.clear();
    this._hitImpacted = false;
    this.falling = false;
    this.fallProgress = 0;
    this.fallType = null;
    this.goalX = null;
    this.goalY = null;
    this.fallStartX = null;
    this.fallStartY = null;
  }

  getSpeed() {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
  }

  getDrawPos(target = {}) {
    if (!this.falling) {
      target.x = this.x;
      target.y = this.y;
      target.radius = this.radius;
      return target;
    }
    const progress = Math.min(1, this.fallProgress);
    const suctionProgress = this.fallType === 'trap'
      ? 1 - Math.pow(1 - progress, 3)
      : progress;
    const scale = 1 - progress;
    target.x = (this.fallStartX ?? this.x) + ((this.goalX ?? this.x) - (this.fallStartX ?? this.x)) * suctionProgress;
    target.y = (this.fallStartY ?? this.y) + ((this.goalY ?? this.y) - (this.fallStartY ?? this.y)) * suctionProgress;
    target.radius = this.radius * Math.max(0, scale);
    return target;
  }
}

export { CELL_SIZE };
