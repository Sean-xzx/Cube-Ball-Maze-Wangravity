import { CELL, LEVELS } from './LevelData.js';
import { CELL_SIZE } from './Physics.js';

const GRID = 15;
const MAZE = GRID * CELL_SIZE;
const BALL_RADIUS = 12;

function shouldUseLiteRenderer() {
  const quality = new URLSearchParams(window.location.search).get('quality');
  if (quality === 'lite') return true;
  if (quality === 'auto') {
    return window.matchMedia('(max-width: 820px)').matches ||
      window.matchMedia('(pointer: coarse)').matches;
  }
  return false;
}

function rgba(hex, alpha) {
  const value = parseInt(hex.replace('#', ''), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export default class LiteRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
    if (!this.ctx) throw new Error('Canvas 2D is unavailable');

    document.documentElement.classList.add('lite-mode');
    this.liteMode = true;
    this.time = 0;
    this._lastFrameTime = performance.now();
    this._currentLevel = -1;
    this._activeGrid = null;
    this._gridRevision = -1;
    this._goal = null;
    this._lastBallPos = { x: CELL_SIZE * 1.5, y: CELL_SIZE * 1.5 };
    this._drawPos = { x: 0, y: 0, radius: BALL_RADIUS };
    this._ripples = [];
    this._ballAngle = 0;
    this._visualBall = { x: 0, y: 0, radius: BALL_RADIUS, ready: false };
    this._visualMovingTraps = new Map();
    this._ballTrail = [];

    this._boardCanvas = document.createElement('canvas');
    this._boardCanvas.width = MAZE;
    this._boardCanvas.height = MAZE;
    this._boardCtx = this._boardCanvas.getContext('2d', { alpha: false });
    this.resize();
  }

  resize() {
    const wrapper = document.getElementById('canvas-wrapper');
    const availableW = wrapper?.clientWidth > 0 ? wrapper.clientWidth - 28 : window.innerWidth * 0.94;
    const availableH = wrapper?.clientHeight > 0 ? wrapper.clientHeight - 20 : window.innerHeight - 140;
    const maxW = Math.min(window.innerWidth * 0.94, availableW);
    const maxH = Math.min(window.innerHeight - 132, availableH);
    const scale = Math.max(0.25, Math.min(maxW / MAZE, maxH / MAZE));
    const size = Math.max(1, Math.floor(MAZE * scale));

    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = size;
    this.canvas.height = size;
    this._scale = size / MAZE;
  }

  draw(levelIndex, ball, gx, gy, goalUnlocked = true, movingTraps = [], grid = null, gridRevision = 0, portals = [], rotatingGates = []) {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this._lastFrameTime) / 1000));
    this._lastFrameTime = now;
    this.time += dt;

    const level = LEVELS[levelIndex];
    const activeGrid = grid || level.grid;
    if (levelIndex !== this._currentLevel ||
        activeGrid !== this._activeGrid ||
        gridRevision !== this._gridRevision) {
      this._currentLevel = levelIndex;
      this._activeGrid = activeGrid;
      this._gridRevision = gridRevision;
      this._goal = this._findCell(activeGrid, CELL.GOAL);
      this._drawStaticBoard(level, activeGrid);
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.setTransform(this._scale, 0, 0, this._scale, 0, 0);
    ctx.drawImage(this._boardCanvas, 0, 0);

    if (this._goal) this._drawGoal(ctx, this._goal.x, this._goal.y, level.color, goalUnlocked);
    this._drawPortals(ctx, portals);
    this._drawRotatingGates(ctx, rotatingGates);
    this._drawMovingTraps(ctx, movingTraps, dt);
    this._drawRipples(ctx, dt);
    this._drawBall(ctx, ball, level.color, dt);
  }

  addFlash() {
    this._addRipple(this._lastBallPos.x, this._lastBallPos.y, '#ffffff', 1);
  }

  notifyStarCollected(col, row) {
    this._addRipple(
      col * CELL_SIZE + CELL_SIZE / 2,
      row * CELL_SIZE + CELL_SIZE / 2,
      '#ffe35b',
      1
    );
  }

  notifyPortalsActivated(portals = []) {
    portals.forEach(portal => this._addRipple(portal.x, portal.y, '#4dff87', 1));
  }

  notifyPortalJump(fromX, fromY, toX, toY) {
    this._addRipple(fromX, fromY, '#8dffb1', 1);
    this._addRipple(toX, toY, '#4dff87', 0.9);
  }

  notifyTrapSuction(x, y) {
    this._addRipple(x, y, '#6e7dff', 1);
    this._addRipple(x, y, '#54dcff', 0.72);
  }

  resetLevelEffects() {
    this._currentLevel = -1;
    this._activeGrid = null;
    this._gridRevision = -1;
    this._goal = null;
    this._ripples.length = 0;
    this._visualBall.ready = false;
    this._visualMovingTraps.clear();
    this._ballTrail.length = 0;
  }

  _drawStaticBoard(level, grid) {
    const ctx = this._boardCtx;
    ctx.fillStyle = '#07143d';
    ctx.fillRect(0, 0, MAZE, MAZE);
    ctx.fillStyle = rgba(level.color, 0.12);
    ctx.fillRect(0, 0, MAZE, MAZE);

    ctx.beginPath();
    for (let index = 0; index <= GRID; index++) {
      const offset = index * CELL_SIZE;
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset, MAZE);
      ctx.moveTo(0, offset);
      ctx.lineTo(MAZE, offset);
    }
    ctx.strokeStyle = rgba(level.color, 0.13);
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const cell = grid[row][col];
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE;
        if (cell === CELL.WALL) this._drawWall(ctx, x, y, level.color);
        if (cell === CELL.TRAP) this._drawTrap(ctx, x + CELL_SIZE / 2, y + CELL_SIZE / 2, '#ff506b');
        if (cell === CELL.STAR) this._drawStar(ctx, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
      }
    }

    ctx.strokeStyle = rgba(level.color, 0.7);
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, MAZE - 4, MAZE - 4);
  }

  _drawWall(ctx, x, y, color) {
    ctx.fillStyle = rgba(color, 0.88);
    ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(x + 4, y + 4, CELL_SIZE - 8, 3);
  }

  _drawTrap(ctx, x, y, color, pulse = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);

    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 11.5, 0, Math.PI * 2);
    ctx.fillStyle = '#01030a';
    ctx.globalAlpha = 1;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  _drawGoal(ctx, x, y, color) {
    const pulse = 1 + Math.sin(this.time * 3) * 0.035;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);

    ctx.beginPath();
    ctx.arc(3, 4, 23, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 10, 0.28)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    const outer = ctx.createRadialGradient(-6, -7, 2, 0, 0, 22);
    outer.addColorStop(0, rgba(color, 0.35));
    outer.addColorStop(0.56, '#111928');
    outer.addColorStop(1, '#02040b');
    ctx.fillStyle = outer;
    ctx.fill();

    ctx.strokeStyle = rgba(color, 0.95);
    ctx.lineWidth = 4.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-5, -6, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.restore();
  }

  _drawPortals(ctx, portals) {
    for (let index = 0; index < portals.length; index++) {
      const portal = portals[index];
      if (!portal.active) continue;
      const pulse = 1 + Math.sin(this.time * 4 + index * Math.PI) * 0.08;
      ctx.save();
      ctx.translate(portal.x, portal.y);
      ctx.scale(pulse, pulse);

      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(77, 255, 135, 0.16)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#00120b';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 17.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#4dff87';
      ctx.lineWidth = 3.2;
      ctx.stroke();

      for (let ring = 0; ring < 3; ring++) {
        ctx.save();
        ctx.rotate(this.time * (1.8 + ring * 0.5) * (ring % 2 === 0 ? 1 : -1));
        ctx.beginPath();
        ctx.ellipse(0, 0, 5 + ring * 3.8, 9 + ring * 2.4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = ring % 2 === 0
          ? 'rgba(141, 255, 177, 0.72)'
          : 'rgba(77, 255, 135, 0.48)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  _drawRotatingGates(ctx, gates) {
    for (let index = 0; index < gates.length; index++) {
      const gate = gates[index];
      const pulse = 0.72 + Math.max(0, Math.sin(this.time * 7.2 + index)) * 0.28;
      ctx.save();

      for (const cell of gate.activeCells || []) {
        const x = cell.col * CELL_SIZE;
        const y = cell.row * CELL_SIZE;
        ctx.fillStyle = `rgba(255, 216, 61, ${0.18 + pulse * 0.08})`;
        ctx.fillRect(x + 5, y + 5, CELL_SIZE - 10, CELL_SIZE - 10);
        ctx.strokeStyle = `rgba(255, 239, 145, ${0.32 + pulse * 0.14})`;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(x + 5.5, y + 5.5, CELL_SIZE - 11, CELL_SIZE - 11);
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(255, 216, 61, ${0.24 + pulse * 0.22})`;
      ctx.lineWidth = 12;
      for (const bar of gate.activeBars || []) {
        const [from, to] = bar;
        ctx.beginPath();
        ctx.moveTo(from.col * CELL_SIZE + CELL_SIZE / 2, from.row * CELL_SIZE + CELL_SIZE / 2);
        ctx.lineTo(to.col * CELL_SIZE + CELL_SIZE / 2, to.row * CELL_SIZE + CELL_SIZE / 2);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(255, 53, 95, ${0.78 + pulse * 0.2})`;
      ctx.lineWidth = 7;
      for (const bar of gate.activeBars || []) {
        const [from, to] = bar;
        ctx.beginPath();
        ctx.moveTo(from.col * CELL_SIZE + CELL_SIZE / 2, from.row * CELL_SIZE + CELL_SIZE / 2);
        ctx.lineTo(to.col * CELL_SIZE + CELL_SIZE / 2, to.row * CELL_SIZE + CELL_SIZE / 2);
        ctx.stroke();
      }

      if (gate.pivot) {
        ctx.beginPath();
        ctx.arc(gate.pivot.col * CELL_SIZE + CELL_SIZE / 2, gate.pivot.row * CELL_SIZE + CELL_SIZE / 2, 14, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 53, 95, ${0.12 + pulse * 0.08})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(gate.pivot.col * CELL_SIZE + CELL_SIZE / 2, gate.pivot.row * CELL_SIZE + CELL_SIZE / 2, 9, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 53, 95, ${0.68 + pulse * 0.22})`;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(gate.pivot.col * CELL_SIZE + CELL_SIZE / 2, gate.pivot.row * CELL_SIZE + CELL_SIZE / 2, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 240, 166, 0.84)';
        ctx.fill();
      }

      ctx.restore();
    }
  }

  _drawStar(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.ellipse(3, 5, 12.5, 8.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 10, 0.22)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 13.2, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(-4.5, -5.5, 2, 0, 0, 13.2);
    gradient.addColorStop(0, '#fff5a8');
    gradient.addColorStop(0.36, '#ffe15c');
    gradient.addColorStop(0.72, '#f2b42a');
    gradient.addColorStop(1, '#9f5f00');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = '#fff0a6';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(115, 65, 0, 0.58)';
    ctx.lineWidth = 1.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-3.2, -6.2);
    ctx.lineTo(-3.2, 6.2);
    ctx.strokeStyle = 'rgba(255, 255, 214, 0.72)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  _drawMovingTraps(ctx, movingTraps, dt) {
    const activeTrapIds = new Set();
    for (let index = 0; index < movingTraps.length; index++) {
      const trap = movingTraps[index];
      if (!trap.active) continue;
      const id = trap.id || `${trap.kind || 'trap'}-${index}`;
      activeTrapIds.add(id);
      let visual = this._visualMovingTraps.get(id);
      if (!visual) {
        visual = { x: trap.x, y: trap.y };
        this._visualMovingTraps.set(id, visual);
      }
      const dx = trap.x - visual.x;
      const dy = trap.y - visual.y;
      const blend = dx * dx + dy * dy > CELL_SIZE * CELL_SIZE * 4
        ? 1
        : this._motionBlend(dt, 22);
      visual.x += dx * blend;
      visual.y += dy * blend;

      const color = trap.kind === 'chase' ? '#a176ff' : '#ff506b';
      const pulse = 1 + Math.sin(this.time * 7 + visual.x * 0.03) * 0.06;
      this._drawTrap(ctx, visual.x, visual.y, color, pulse);
    }
    for (const id of this._visualMovingTraps.keys()) {
      if (!activeTrapIds.has(id)) this._visualMovingTraps.delete(id);
    }
  }

  _drawRipples(ctx, dt) {
    let writeIndex = 0;
    for (let index = 0; index < this._ripples.length; index++) {
      const ripple = this._ripples[index];
      ripple.life -= dt * 2.8;
      if (ripple.life <= 0) continue;

      const progress = 1 - ripple.life;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, 14 + progress * 46, 0, Math.PI * 2);
      ctx.strokeStyle = ripple.color;
      ctx.globalAlpha = ripple.life * 0.7;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      this._ripples[writeIndex++] = ripple;
    }
    this._ripples.length = writeIndex;
  }

  _drawBall(ctx, ball, levelColor, dt) {
    const pos = ball.getDrawPos(this._drawPos);
    const targetRadius = Math.max(0, pos.radius ?? BALL_RADIUS);
    const visual = this._visualBall;
    const dx = pos.x - visual.x;
    const dy = pos.y - visual.y;
    if (!visual.ready || dx * dx + dy * dy > CELL_SIZE * CELL_SIZE * 4) {
      visual.x = pos.x;
      visual.y = pos.y;
      visual.radius = targetRadius;
      visual.ready = true;
      this._ballTrail.length = 0;
    } else {
      const blend = this._motionBlend(dt, dt > 1 / 38 ? 26 : 20);
      visual.x += dx * blend;
      visual.y += dy * blend;
      visual.radius += (targetRadius - visual.radius) * this._motionBlend(dt, 28);
    }

    this._lastBallPos.x = visual.x;
    this._lastBallPos.y = visual.y;
    const radius = Math.max(0, visual.radius);
    if (radius < 0.3) return;

    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    this._ballAngle += speed * dt * 0.85;
    if (ball.falling) {
      this._ballTrail.length = 0;
    } else {
      this._recordBallTrail(visual.x, visual.y, radius);
      this._drawBallTrail(ctx);
    }

    ctx.save();
    ctx.translate(visual.x, visual.y);

    ctx.beginPath();
    ctx.ellipse(4, 5, radius * 1.08, radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 10, 0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    const metal = ctx.createRadialGradient(
      -radius * 0.38,
      -radius * 0.42,
      radius * 0.08,
      0,
      0,
      radius * 1.18
    );
    metal.addColorStop(0, '#ffffff');
    metal.addColorStop(0.2, '#eef6ff');
    metal.addColorStop(0.45, '#a7b6c2');
    metal.addColorStop(0.72, '#4b5c6d');
    metal.addColorStop(1, '#111a24');
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = 'rgba(241, 249, 255, 0.86)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.72, Math.PI * 1.08, Math.PI * 1.82);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-radius * 0.34, -radius * 0.34, Math.max(1.2, radius * 0.18), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fill();
    ctx.restore();
  }

  _recordBallTrail(x, y, radius) {
    const latest = this._ballTrail[0];
    if (latest) {
      const dx = x - latest.x;
      const dy = y - latest.y;
      if (dx * dx + dy * dy < 0.7) {
        latest.x = x;
        latest.y = y;
        latest.radius = radius;
        return;
      }
    }
    this._ballTrail.unshift({ x, y, radius });
    if (this._ballTrail.length > 7) this._ballTrail.length = 7;
  }

  _drawBallTrail(ctx) {
    const maxAge = Math.max(1, this._ballTrail.length - 1);
    for (let index = this._ballTrail.length - 1; index >= 1; index--) {
      const ghost = this._ballTrail[index];
      const age = index / maxAge;
      const scale = age < 0.38 ? 0.96 : 0.96 - (age - 0.38) * 0.72;
      const alpha = Math.max(0.018, (1 - age) * 0.13);
      ctx.beginPath();
      ctx.arc(ghost.x, ghost.y, ghost.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(218, 230, 238, ${alpha})`;
      ctx.fill();
    }
  }

  _motionBlend(dt, response) {
    return 1 - Math.exp(-Math.max(0.001, dt) * response);
  }

  _findCell(grid, type) {
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        if (grid[row][col] === type) {
          return {
            x: col * CELL_SIZE + CELL_SIZE / 2,
            y: row * CELL_SIZE + CELL_SIZE / 2,
          };
        }
      }
    }
    return null;
  }

  _addRipple(x, y, color, life) {
    if (this._ripples.length >= 5) this._ripples.shift();
    this._ripples.push({ x, y, color, life });
  }
}

export { shouldUseLiteRenderer };
