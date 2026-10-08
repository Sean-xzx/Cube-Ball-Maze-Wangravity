import { CELL, LEVELS, FACE_COLORS, getStartPosition, getMovingTrapPaths, getPortalPair, getRotatingGates } from './LevelData.js';
import { CELL_SIZE } from './Physics.js';
import Physics from './Physics.js';
import LiteRenderer, { shouldUseLiteRenderer } from './LiteRenderer.js';
import InputManager from './InputManager.js';
import AudioManager from './AudioManager.js';
import Transition from './Transition.js';

const State = {
  START: 'START',
  HINT: 'HINT',
  SUMMARY: 'SUMMARY',
  PLAYING: 'PLAYING',
  FALLING: 'FALLING',
  DEAD: 'DEAD',
  LEADERBOARD: 'LEADERBOARD',
  TRANSITION: 'TRANSITION',
  COMPLETE: 'COMPLETE',
};

const CHASE_SPAWN_DISTANCE = CELL_SIZE * 2;
const CHASE_SPEED = 58;
const PORTAL_RADIUS = CELL_SIZE * 0.42;
const PORTAL_COOLDOWN_MS = 280;
const PORTAL_EXIT_SPEED_SCALE = 0.72;
const FRAME_DURATION_MS = 1000 / 60;
const FACE_TIME_LIMITS_SECONDS = [24, 36, 48, 72, 144, 216];
const FACE_LIFE_LIMITS = [2, 3, 4, 5, 15, 30];
const BEST_TIMES_STORAGE_KEY = 'wristbound-best-times-v1';
const ELITE_BOARD_STORAGE_KEY = 'wristbound-elite-board-v1';
const PLAYER_NAME_STORAGE_KEY = 'wristbound-player-name';
const PLAYER_AVATAR_STORAGE_KEY = 'wristbound-player-avatar';
const AVATAR_COLORS = ['#f3f5f7', '#ffd93d', '#51cf66', '#339af0', '#cc5de8', '#ff922b'];
// Legacy mock-cloud defaults are disabled; private write capabilities cannot ship in a client.
const DEFAULT_CLOUD_DATA_URL = '';
const DEFAULT_CLOUD_MANAGE_URL = '';
const CLOUD_MOCK_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};
const CLOUD_MOCK_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH'];
const GAMEPLAY_TIPS = {
  0: {
    kicker: 'TUTORIAL',
    title: '教学关',
    text: '可碰墙；进入黑洞通关。',
  },
  1: {
    kicker: 'LEVEL 01',
    title: '基础回廊',
    text: '沿回廊前进；进入黑洞通关。',
  },
  2: {
    kicker: 'LEVEL 02',
    title: '红色陷阱',
    text: '红洞是陷阱；金币全收可冲三星。',
  },
  3: {
    kicker: 'LEVEL 03',
    title: '移动陷阱',
    text: '红色陷阱会巡游；看准节奏通过。',
  },
  4: {
    kicker: 'LEVEL 04',
    title: '巡游迷宫',
    text: '红色陷阱巡游；金币全收后开启绿色传送门，两端互传。',
  },
  5: {
    kicker: 'LEVEL 05',
    title: '追踪陷阱',
    text: '传送门开局可用；收集金币会唤醒紫色追踪陷阱。',
  },
};

export default class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.physics = new Physics();
    this.renderer = null;
    this._rendererPromise = this._createRenderer();
    this.input = new InputManager();
    this.audio = new AudioManager();
    this.transition = new Transition();

    this.state = State.START;
    this.currentFace = 0;
    this.startTime = 0;
    this.elapsedTime = 0;
    this.faceTimes = [];
    this.faceStartTime = Date.now();
    this.faceDeaths = 0;
    this.grid = LEVELS[0].grid.map(row => [...row]);
    this.movingTraps = [];
    this.pendingChaseTraps = [];
    this.portals = [];
    this.rotatingGates = [];
    this.collectedStars = 0;
    this.totalStars = 0;
    this.goalUnlocked = true;
    this.deathTimer = 0;
    this._nextTrapId = 1;
    this._lastFrameMs = performance.now();
    this._animFrame = null;
    this._boundLoop = this._loop.bind(this);
    this._toastToken = 0;
    this._goalToastToken = 0;
    this._gridRevision = 0;
    this._lastTimerText = '';
    this._lastCountdownText = '';
    this._lastCountdownSecond = null;
    this._countdownAlertActive = null;
    this.faceTimeRemainingMs = 0;
    this.deathReason = null;
    this._calibrationBusy = false;
    this._tipPauseStart = 0;
    this._summaryPauseStart = 0;
    this._summaryResolver = null;
    this._portalCooldownMs = 0;
    this._portalRequiresExit = false;
    this._rotatingGateTimeMs = 0;
    this.bestTimes = this._loadStoredJSON(BEST_TIMES_STORAGE_KEY, {});
    this.eliteBoard = this._loadStoredJSON(ELITE_BOARD_STORAGE_KEY, []);
    this.remoteLeaderboardEndpoint = window.WANGRAVITY_LEADERBOARD_ENDPOINT || window.WRISTBOUND_LEADERBOARD_ENDPOINT || '/api/leaderboard';
    this.remotePlayerEndpoint = window.WANGRAVITY_PLAYER_ENDPOINT || window.WRISTBOUND_PLAYER_ENDPOINT || '/api/player';
    this.cloudDataUrl = window.WANGRAVITY_CLOUD_DATA_URL || DEFAULT_CLOUD_DATA_URL;
    this.cloudManageUrl = window.WANGRAVITY_CLOUD_MANAGE_URL || DEFAULT_CLOUD_MANAGE_URL;
    this.playerName = this._sanitizePlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || 'PLAYER');
    this.playerAvatar = this._sanitizeAvatarColor(localStorage.getItem(PLAYER_AVATAR_STORAGE_KEY) || AVATAR_COLORS[0]);
    this.selectedLeaderboardFace = 0;
    this._leaderboardPauseStart = 0;
    this._leaderboardPreviousState = null;
    this._avatarChangedByUser = false;
    this._accountLoadTimer = 0;
    this._accountLoadToken = 0;

    this.startScreen = document.getElementById('start-screen');
    this.calibrationScreen = document.getElementById('calibration-screen');
    this.gameScreen = document.getElementById('game-screen');
    this.completeScreen = document.getElementById('complete-screen');
    this.calibrationStatusEl = document.getElementById('calibration-status');
    this.confirmCalibrationButton = document.getElementById('btn-confirm-calibration');
    this.playerNameInput = document.getElementById('player-name-input');
    this.avatarButtons = document.querySelectorAll('[data-avatar-color]');
    this.timerEl = document.getElementById('timer');
    this.countdownBar = document.getElementById('countdown-bar');
    this.countdownEl = document.getElementById('countdown');
    this.totalTimeEl = document.getElementById('total-time');
    this.faceToast = document.getElementById('face-toast');
    this.faceToastText = document.getElementById('face-toast-text');
    this.faceToastKicker = document.querySelector('.toast-kicker');
    this.goalToast = document.getElementById('goal-toast');
    this.levelLabel = document.getElementById('level-label');
    this.faceNameEl = document.getElementById('face-name');
    this.starCounterEl = document.getElementById('star-counter');
    this.coinCounterTextEl = document.getElementById('coin-counter-text');
    this.mechanicHintEl = document.getElementById('mechanic-hint');
    this.sensorStatusEl = document.getElementById('sensor-status');
    this.sensorCalibrateButton = document.getElementById('btn-sensor-calibrate');
    this.gameplayTip = document.getElementById('gameplay-tip');
    this.gameplayTipKicker = document.getElementById('gameplay-tip-kicker');
    this.gameplayTipTitle = document.getElementById('gameplay-tip-title');
    this.gameplayTipText = document.getElementById('gameplay-tip-text');
    this.summaryModal = document.getElementById('level-summary');
    this.summaryKicker = document.getElementById('summary-kicker');
    this.summaryTitle = document.getElementById('summary-title');
    this.summaryStars = document.getElementById('summary-stars');
    this.summaryTime = document.getElementById('summary-time');
    this.summaryBest = document.getElementById('summary-best');
    this.summaryGoal = document.getElementById('summary-goal');
    this.summaryCollect = document.getElementById('summary-collect');
    this.summaryLives = document.getElementById('summary-lives');
    this.summaryElite = document.getElementById('summary-elite');
    this.summaryRetryButton = document.getElementById('btn-summary-retry');
    this.summaryContinueButton = document.getElementById('btn-summary-continue');
    this.bgmToggleButton = document.getElementById('btn-bgm-toggle');
    this.leaderboardButton = document.getElementById('btn-leaderboard');
    this.leaderboardModal = document.getElementById('leaderboard-modal');
    this.leaderboardCloseButton = document.getElementById('btn-leaderboard-close');
    this.leaderboardList = document.getElementById('leaderboard-list');
    this.leaderboardTabs = document.querySelectorAll('[data-board-face]');
    this.leaderboardSelf = document.getElementById('leaderboard-self');
    this.progressDots = document.querySelectorAll('#progress-dots .dot');
    this.levelMenuButton = document.getElementById('btn-level-menu');
    this.levelMenuPanel = document.getElementById('level-menu-panel');
    this.levelMenuButtons = document.querySelectorAll('[data-jump-face]');

    this.levelMenuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this._toggleLevelMenu();
    });
    this.levelMenuPanel.addEventListener('click', event => event.stopPropagation());
    this.levelMenuButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.jumpToFace(Number(button.dataset.jumpFace));
      });
    });
    this.confirmCalibrationButton.addEventListener('click', () => this._confirmCalibration());
    this.playerNameInput.addEventListener('input', () => {
      const name = this._sanitizePlayerName(this.playerNameInput.value);
      if (name) this._queueRemotePlayerAccountLoad(name, { applyAvatar: !this._avatarChangedByUser });
    });
    this.avatarButtons.forEach((button) => {
      button.style.setProperty('--avatar-color', button.dataset.avatarColor);
      button.addEventListener('click', () => this._selectAvatar(button.dataset.avatarColor, true));
    });
    this.gameplayTip.addEventListener('pointerdown', () => this._dismissGameplayTip());
    this.summaryContinueButton.addEventListener('click', () => this._resolveLevelSummary('continue'));
    this.summaryRetryButton.addEventListener('click', () => this._resolveLevelSummary('retry'));
    this.bgmToggleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleBackgroundMusic();
    });
    this.leaderboardButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this._openLeaderboard();
    });
    this.leaderboardCloseButton.addEventListener('click', () => this._closeLeaderboard());
    this.leaderboardModal.addEventListener('pointerdown', (event) => {
      if (event.target === this.leaderboardModal) this._closeLeaderboard();
    });
    this.leaderboardTabs.forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedLeaderboardFace = Number(button.dataset.boardFace);
        this._renderLeaderboard();
      });
    });
    this.sensorCalibrateButton.addEventListener('click', () => this.resetSensorCalibration());
    document.addEventListener('keydown', (event) => {
      if (this.state !== State.HINT) return;
      event.preventDefault();
      this._dismissGameplayTip();
    });
    document.addEventListener('click', () => this._closeLevelMenu());
    this.input.attachTouchControls(this.canvas);
    this.input.onStatusChange(status => this._updateInputStatus(status));
    this._syncBgmButton();
  }

  start() {
    this._showScreen('start');
  }

  openCalibration() {
    this._stopLoop();
    this._closeLevelMenu();
    this._hideGameplayTip();
    this._hideLevelSummary();
    this._closeLeaderboard();
    this.audio.stopBackgroundMusic();
    this.audio.stopRolling();
    this._syncBgmButton();
    this.state = State.START;
    this.playerNameInput.value = this.playerName;
    this._avatarChangedByUser = false;
    this._selectAvatar(this.playerAvatar);
    this._queueRemotePlayerAccountLoad(this.playerName, { applyAvatar: true, delay: 0 });
    this._setCalibrationStatus('准备好后点击“完成校准”。手机端将启用陀螺仪控制钢球。');
    this.confirmCalibrationButton.disabled = false;
    this.confirmCalibrationButton.classList.remove('is-loading');
    this._showScreen('calibration');
  }

  async _confirmCalibration() {
    if (this._calibrationBusy) return;
    const playerName = this._sanitizePlayerName(this.playerNameInput.value);
    if (!playerName) {
      this._setCalibrationStatus('请先输入玩家用户名，用于记录排行榜成绩。');
      this.playerNameInput.focus();
      return;
    }
    this._calibrationBusy = true;
    this.confirmCalibrationButton.disabled = true;
    this.confirmCalibrationButton.classList.add('is-loading');
    this.playerName = playerName;

    this._setCalibrationStatus('正在请求体感权限…请在手机弹窗中允许。');
    const audioUnlockPromise = this.audio.unlock();
    this._unlockVibrationPermission();
    const gyroAllowed = await this.input.requestGyroPermission();
    audioUnlockPromise.then((unlocked) => {
      if (unlocked) this.audio.playReady();
    });

    this._setCalibrationStatus('正在同步玩家档案…');
    await this._loadRemotePlayerAccount(playerName, {
      applyAvatar: !this._avatarChangedByUser,
      resetOnMissing: true,
    });
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, this.playerName);
    localStorage.setItem(PLAYER_AVATAR_STORAGE_KEY, this.playerAvatar);
    this._saveRemotePlayerAccount();

    if (gyroAllowed) {
      this._setCalibrationStatus('正在读取当前水平姿态…');
      const hasSample = await this.input.waitForGyroSample(3200);
      if (hasSample) {
        this.input.calibrate();
        this._setCalibrationStatus('水平校准完成，准备进入迷宫。');
      } else {
        this._setCalibrationStatus('已获得权限，但暂未收到体感数据；可先触控拖动进入游戏。');
      }
    } else {
      this._setCalibrationStatus('体感未启用；请确认用 HTTPS 手机链接打开，并允许动作与方向权限。');
    }

    await this._sleep(360);
    this._calibrationBusy = false;
    this.confirmCalibrationButton.disabled = false;
    this.confirmCalibrationButton.classList.remove('is-loading');
    this.startGame();
  }

  async startGame() {
    this.audio.playBackgroundMusic();
    this._syncBgmButton();
    await this._rendererPromise;
    this.currentFace = 0;
    this.faceTimes = [];
    this.faceDeaths = 0;
    this.faceStartTime = Date.now();
    this.startTime = Date.now();
    this.elapsedTime = 0;
    this._lastTimerText = '';
    this._showScreen('game');
    this.renderer.resize();
    this._loadFace(0, { resetStats: true });
    this.state = State.PLAYING;
    this._renderFrame(0, 0);
    this._showGameplayTip(0);
    this._lastFrameMs = performance.now();
    this._startLoop();
  }

  _loadFace(index, { resetStats = true } = {}) {
    const level = LEVELS[index];
    const start = getStartPosition(index);
    this.currentFace = index;
    if (resetStats) {
      this.faceStartTime = Date.now();
      this.faceDeaths = 0;
    }
    this.grid = level.grid.map(row => [...row]);
    this._gridRevision++;
    this.physics.reset(start.col, start.row);
    this.movingTraps = this._createPatrolTraps(getMovingTrapPaths(index));
    this.pendingChaseTraps = [];
    this.portals = this._createPortals(index);
    this.rotatingGates = this._createRotatingGates(index);
    this._rotatingGateTimeMs = 0;
    this._portalCooldownMs = 0;
    this._portalRequiresExit = false;
    this.totalStars = this._countStars();
    this.collectedStars = 0;
    this.goalUnlocked = true;
    if (this.totalStars === 0) this._activatePortals(false);
    this.deathTimer = 0;
    this.deathReason = null;
    this.faceTimeRemainingMs = FACE_TIME_LIMITS_SECONDS[index] * 1000;
    this._lastCountdownText = '';
    this._lastCountdownSecond = Math.ceil(this.faceTimeRemainingMs / 1000);
    this._setCountdownAlert(false);
    this._hideGoalToast();
    this._updateCountdownHUD();

    this.levelLabel.textContent = index === 0 ? 'TUTORIAL' : `LEVEL ${String(index).padStart(2, '0')}`;
    this.faceNameEl.textContent = level.name;
    this._setFaceTheme(level);
    this._updateProgressDots(index);
    this._updateStarHUD();
    this._updateMechanicHint();
    this._updateLevelMenuButtons();
    this.renderer.resetLevelEffects();
  }

  _loop(now = performance.now()) {
    if (this.state === State.START || this.state === State.COMPLETE) return;

    const frameDt = Math.max(0, now - this._lastFrameMs);
    const dt = Math.min(50, frameDt);
    this._lastFrameMs = now;
    this.input.update();
    const frameScale = dt / FRAME_DURATION_MS;

    if (this.state === State.HINT) {
      this.audio.stopRolling();
      const { x: gx, y: gy } = this.input.getGravity();
      this._renderFrame(gx, gy);
      this._animFrame = requestAnimationFrame(this._boundLoop);
      return;
    }

    if (this.state === State.SUMMARY) {
      this.audio.stopRolling();
      this._renderFrame(0, 0);
      this._animFrame = requestAnimationFrame(this._boundLoop);
      return;
    }

    if (this.state === State.LEADERBOARD) {
      this.audio.stopRolling();
      this._animFrame = requestAnimationFrame(this._boundLoop);
      return;
    }

    if (this.state === State.DEAD) {
      this.physics.update(0, 0, this.grid, [], false, frameScale);
      this.audio.stopRolling();
      this.deathTimer -= dt;
      this._renderFrame();
      if (this.deathTimer <= 0) {
        const wasTimeout = this.deathReason === 'timeout';
        const resetFace = this.currentFace;
        const resetText = resetFace === 0 ? '留在教学关' : `留在第 ${resetFace} 关`;
        this._loadFace(resetFace, { resetStats: false });
        this._showFaceToast(
          `${wasTimeout ? '时间耗尽' : '陷阱吞噬'} · ${resetText}`,
          wasTimeout ? 'TIME UP' : 'TRY AGAIN',
          'danger'
        );
        this.state = State.PLAYING;
      }
      this._animFrame = requestAnimationFrame(this._boundLoop);
      return;
    }

    if (this.state === State.PLAYING || this.state === State.FALLING) {
      const { x: gx, y: gy } = this.input.getGravity();
      if (this.state === State.PLAYING) {
        if (!this._updateCountdown(frameDt)) {
          this.audio.stopRolling();
          this._renderFrame(gx, gy);
          this._animFrame = requestAnimationFrame(this._boundLoop);
          return;
        }
        this._updatePatrolTraps(dt);
        this._spawnReadyChaseTraps();
        this._updateRotatingGates(dt);
        this._updateChaseTraps(dt);
        this._portalCooldownMs = Math.max(0, this._portalCooldownMs - dt);
      }

      const result = this.physics.update(gx, gy, this.grid, this.movingTraps, this.goalUnlocked, frameScale);
      if (this.state === State.PLAYING) this._handlePlayingResult(result);
      if (this.state === State.PLAYING) this._handlePortalTransfer();
      this.audio.updateRolling(result.speed ?? this.physics.getSpeed(), this.physics.maxSpeed, this.state === State.PLAYING);
      if (this.state === State.FALLING && result.complete) this._onFaceComplete();
      this._renderFrame(gx, gy);
    }

    this._animFrame = requestAnimationFrame(this._boundLoop);
  }

  _handlePlayingResult(result) {
    if (result.hit) {
      this.audio.playHit(result.speed);
      this._vibrateHit(result.speed);
      this._shakeScreen();
      for (let index = 0; index < this.physics.hitWalls.length; index++) {
        const { col, row } = this.physics.hitWalls[index];
        this.renderer.addFlash(col, row);
      }
    }

    if (result.hitTrap || result.hitMovingTrap) {
      this._onTrapDeath(result.trapPosition);
      return;
    }

    if (result.collectedStar) this._collectStar(result.collectedStar);
    if (result.goalReached && this.goalUnlocked) {
      this.state = State.FALLING;
      this.audio.playGoalEnter();
    }
  }

  _collectStar({ col, row }) {
    if (this.grid[row][col] !== CELL.STAR) return;
    this.grid[row][col] = CELL.EMPTY;
    this._gridRevision++;
    this.collectedStars++;
    this.audio.playCoinCollect();
    this.renderer.notifyStarCollected(col, row);

    if (LEVELS[this.currentFace].chaseStars) {
      this.pendingChaseTraps.push({ col, row, x: this._cellCenter(col), y: this._cellCenter(row) });
    }

    if (this.collectedStars >= this.totalStars) {
      this.goalUnlocked = true;
      this.audio.playGoalUnlock();
      this._activatePortals();
      this._showGoalToast();
    }

    this._updateStarHUD();
  }

  _createPortals(index) {
    const pair = getPortalPair(index);
    return pair.map((portal, portalIndex) => ({
      id: `portal-${index}-${portalIndex}`,
      col: portal.col,
      row: portal.row,
      x: this._cellCenter(portal.col),
      y: this._cellCenter(portal.row),
      targetIndex: portalIndex === 0 ? 1 : 0,
      active: Boolean(portal.activeOnStart),
      phase: portalIndex * Math.PI,
    }));
  }

  _createRotatingGates(index) {
    return getRotatingGates(index).map((gate) => ({
      ...gate,
      stateIndex: 0,
      activeCells: gate.states[0]?.cells || [],
      activeBars: gate.states[0]?.bars || [],
    }));
  }

  _updateRotatingGates(dt) {
    if (this.rotatingGates.length === 0) return;
    this._rotatingGateTimeMs += dt;
    for (const gate of this.rotatingGates) {
      const halfPeriod = Math.max(100, (gate.periodMs || 1000) / 2);
      const stateIndex = Math.floor((this._rotatingGateTimeMs + (gate.phaseOffsetMs || 0)) / halfPeriod) % 2;
      if (stateIndex === gate.stateIndex) continue;
      gate.stateIndex = stateIndex;
      const state = gate.states[stateIndex] || gate.states[0];
      gate.activeCells = state?.cells || [];
      gate.activeBars = state?.bars || [];
    }
  }

  _activatePortals(playFeedback = true) {
    if (this.portals.length < 2 || this.portals.every(portal => portal.active)) return;
    this.portals.forEach(portal => { portal.active = true; });
    this._portalCooldownMs = PORTAL_COOLDOWN_MS;
    this._portalRequiresExit = Boolean(this._findTouchedPortal());
    this._updateMechanicHint();
    if (playFeedback) {
      this.audio.playPortal?.();
      this.renderer.notifyPortalsActivated?.(this.portals);
      this._showFaceToast('绿色传送门已开启', 'PORTAL ONLINE', 'success');
    }
  }

  _handlePortalTransfer() {
    if (this.portals.length < 2) return;
    const touchingPortal = this._findTouchedPortal();
    if (this._portalRequiresExit) {
      if (!touchingPortal) this._portalRequiresExit = false;
      return;
    }
    if (!touchingPortal || this._portalCooldownMs > 0) return;

    const target = this.portals[touchingPortal.targetIndex];
    if (!target || !target.active) return;
    this.physics.teleportTo(target.x, target.y, PORTAL_EXIT_SPEED_SCALE);
    this._portalCooldownMs = PORTAL_COOLDOWN_MS;
    this._portalRequiresExit = true;
    this.audio.playPortal?.();
    this.renderer.notifyPortalJump?.(touchingPortal.x, touchingPortal.y, target.x, target.y);
  }

  _findTouchedPortal() {
    const radiusSquared = PORTAL_RADIUS * PORTAL_RADIUS;
    for (const portal of this.portals) {
      if (!portal.active) continue;
      const dx = this.physics.x - portal.x;
      const dy = this.physics.y - portal.y;
      if (dx * dx + dy * dy <= radiusSquared) return portal;
    }
    return null;
  }

  _createPatrolTraps(paths) {
    return paths.map(path => ({
      id: path.id || `patrol-${this._nextTrapId++}`,
      kind: 'patrol',
      active: true,
      x: this._cellCenter(path.startCol),
      y: this._cellCenter(path.startRow),
      waypoints: path.waypoints,
      waypointIndex: 1,
      speed: path.speed,
      radius: 13,
      spawnFlash: 1,
    }));
  }

  _updatePatrolTraps(dt) {
    for (const trap of this.movingTraps) {
      if (trap.kind !== 'patrol' || !trap.active) continue;
      const target = trap.waypoints[trap.waypointIndex];
      if (!target) continue;
      const reached = this._moveTrapToward(trap, this._cellCenter(target.col), this._cellCenter(target.row), trap.speed, dt);
      if (reached) trap.waypointIndex = (trap.waypointIndex + 1) % trap.waypoints.length;
    }
  }

  _spawnReadyChaseTraps() {
    let pendingCount = 0;
    for (let index = 0; index < this.pendingChaseTraps.length; index++) {
      const spawn = this.pendingChaseTraps[index];
      const dx = this.physics.x - spawn.x;
      const dy = this.physics.y - spawn.y;
      if (Math.sqrt(dx * dx + dy * dy) < CHASE_SPAWN_DISTANCE) {
        this.pendingChaseTraps[pendingCount++] = spawn;
        continue;
      }
      this.movingTraps.push({
        id: `chase-${this._nextTrapId++}`,
        kind: 'chase',
        active: true,
        x: spawn.x,
        y: spawn.y,
        speed: CHASE_SPEED,
        radius: 13,
        repathTimer: 0,
        path: [],
        pathIndex: 0,
        spawnFlash: 1,
      });
    }
    this.pendingChaseTraps.length = pendingCount;
  }

  _updateChaseTraps(dt) {
    for (const trap of this.movingTraps) {
      if (trap.kind !== 'chase' || !trap.active) continue;
      trap.repathTimer -= dt;
      if (trap.repathTimer <= 0 || trap.pathIndex >= trap.path.length) {
        trap.path = this._findPath(
          this._toCell(trap.x),
          this._toCell(trap.y),
          this._toCell(this.physics.x),
          this._toCell(this.physics.y)
        );
        trap.pathIndex = Math.min(1, trap.path.length - 1);
        trap.repathTimer = 280;
      }
      const target = trap.path[trap.pathIndex];
      if (!target) continue;
      const reached = this._moveTrapToward(trap, this._cellCenter(target.col), this._cellCenter(target.row), trap.speed, dt);
      if (reached) trap.pathIndex++;
    }
  }

  _moveTrapToward(trap, x, y, speed, dt) {
    const dx = x - trap.x;
    const dy = y - trap.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 0.01) return true;
    const step = speed * (dt / 1000);
    if (step >= distance) {
      trap.x = x;
      trap.y = y;
      return true;
    }
    trap.x += (dx / distance) * step;
    trap.y += (dy / distance) * step;
    return false;
  }

  _findPath(startCol, startRow, endCol, endRow) {
    const cols = this.grid[0].length;
    const queue = [{ col: startCol, row: startRow }];
    const startKey = startRow * cols + startCol;
    const previous = new Map([[startKey, -1]]);
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (current.col === endCol && current.row === endRow) {
        const path = [];
        let key = current.row * cols + current.col;
        while (key >= 0) {
          const col = key % cols;
          const row = Math.floor(key / cols);
          path.push({ col, row });
          key = previous.get(key);
        }
        return path.reverse();
      }

      for (const [dc, dr] of directions) {
        const col = current.col + dc;
        const row = current.row + dr;
        if (row < 0 || col < 0 || row >= this.grid.length || col >= this.grid[row].length) continue;
        const key = row * cols + col;
        const gateBlocked = this._isRotatingGateBlockedCell(col, row) && !(col === endCol && row === endRow);
        if (this.grid[row][col] === CELL.WALL || gateBlocked || previous.has(key)) continue;
        previous.set(key, current.row * cols + current.col);
        queue.push({ col, row });
      }
    }
    return [];
  }

  _isRotatingGateBlockedCell(col, row) {
    for (const gate of this.rotatingGates) {
      for (const cell of gate.activeCells || []) {
        if (cell.col === col && cell.row === row) return true;
      }
    }
    return false;
  }

  _onTrapDeath(trapPosition) {
    this.state = State.DEAD;
    this.deathTimer = 680;
    this.deathReason = 'trap';
    this.faceDeaths++;
    this._setCountdownAlert(false);
    this.audio.stopRolling();
    if (trapPosition) this.renderer.notifyTrapSuction(trapPosition.x, trapPosition.y);
    this.audio.playTrapSuction();
    this.audio.playTrapDeath();
    this._vibrateDeath();
    this._shakeScreen();
  }

  async _onFaceComplete() {
    this.state = State.SUMMARY;
    this._setCountdownAlert(false);
    this.audio.stopRolling();
    const faceTime = Date.now() - this.faceStartTime;
    this.faceTimes.push(faceTime);
    const summary = this._buildLevelSummary(faceTime);
    const action = await this._showLevelSummary(summary);

    if (action === 'retry') {
      this.faceTimes.pop();
      this._loadFace(this.currentFace, { resetStats: true });
      this.state = State.PLAYING;
      this._renderFrame(0, 0);
      this._showGameplayTip(this.currentFace);
      this._lastFrameMs = performance.now();
      return;
    }

    if (this.currentFace >= LEVELS.length - 1) {
      this._onGameComplete();
      return;
    }

    this.audio.playFlip();
    this.transition.show();
    await this.transition.play(this.currentFace, this.currentFace + 1);
    this._loadFace(this.currentFace + 1, { resetStats: true });
    this.transition.hide();
    this.state = State.PLAYING;
    this._renderFrame(0, 0);
    this._showGameplayTip(this.currentFace);
    this._lastFrameMs = performance.now();
  }

  _renderFrame(gx = this.input.gx, gy = this.input.gy) {
    this.elapsedTime = Date.now() - this.startTime;
    const timerText = this._formatTime(this.elapsedTime);
    if (timerText !== this._lastTimerText) {
      this._lastTimerText = timerText;
      if (this.timerEl) this.timerEl.textContent = timerText;
    }
    this.renderer.draw(
      this.currentFace,
      this.physics,
      gx,
      gy,
      this.goalUnlocked,
      this.movingTraps,
      this.grid,
      this._gridRevision,
      this.portals,
      this.rotatingGates
    );
  }

  _onGameComplete() {
    this._stopLoop();
    this._setCountdownAlert(false);
    this.audio.stopBackgroundMusic();
    this.audio.stopRolling();
    this.audio.playComplete();
    this.elapsedTime = Date.now() - this.startTime;
    this.totalTimeEl.textContent = this._formatTime(this.elapsedTime);
    this._showScreen('complete');
    this.state = State.COMPLETE;
  }

  _countStars() {
    let count = 0;
    for (let row = 0; row < this.grid.length; row++) {
      for (let col = 0; col < this.grid[row].length; col++) {
        if (this.grid[row][col] === CELL.STAR) count++;
      }
    }
    return count;
  }

  _updateStarHUD() {
    if (this.coinCounterTextEl) {
      this.coinCounterTextEl.textContent = `${this.collectedStars}/${this.totalStars}`;
    } else {
      this.starCounterEl.textContent = `金币 ${this.collectedStars}/${this.totalStars}`;
    }
    this.starCounterEl.classList.toggle('hidden', this.totalStars === 0);
    this.starCounterEl.classList.toggle('unlocked', this.totalStars > 0 && this.collectedStars >= this.totalStars);
  }

  _updateMechanicHint() {
    const level = LEVELS[this.currentFace];
    let text = '倾斜手机控制金属球 · 桌面端使用 WASD';
    if (this.totalStars > 0) text = '黑色暗井可直接通关 · 收集全部金币可冲刺三星';
    if (this.movingTraps.length > 0) text = '红色陷阱会来回巡游 · 金币影响结算评级';
    if (this.portals.length > 0) text = this.portals.some(portal => portal.active)
      ? '绿色传送门已开启 · 两端可以互传'
      : '收集全部金币后开启绿色传送门';
    if (level.chaseStars) text = '传送门开局可用 · 收集金币会唤醒追踪陷阱';
    this.mechanicHintEl.textContent = text;
  }

  _updateInputStatus({ mode }) {
    const messages = {
      idle: '手机端将自动检测体感',
      insecure: '局域网 HTTP 无法启用体感 · 可在迷宫上拖动控制',
      unsupported: '当前浏览器未提供体感 · 可在迷宫上拖动控制',
      'gyro-requesting': '正在请求体感权限…',
      'gyro-denied': '体感权限未允许 · 可在迷宫上拖动控制',
      'gyro-waiting': '等待体感数据 · 可先在迷宫上拖动',
      'gyro-missing': '未收到体感数据 · 请检查权限或使用触控拖动',
      'gyro-calibrating': '屏幕方向已改变 · 正在重新校准',
      'gyro-calibrated': '体感已校准',
      'gyro-active': '体感已连接 · 保持当前姿态开始倾斜',
      touch: '触控模式 · 在迷宫上拖动控制',
    };
    const good = mode === 'gyro-active' || mode === 'gyro-calibrated';
    this.sensorStatusEl.textContent = messages[mode] || messages.idle;
    this.sensorStatusEl.classList.toggle('sensor-good', good);
    this.sensorStatusEl.classList.toggle('sensor-warn', !good && mode !== 'idle');
    this.sensorCalibrateButton.classList.toggle('sensor-calibrate-ready', good);
  }

  resetSensorCalibration() {
    const calibrated = this.input.calibrate();
    if (calibrated) {
      this._updateInputStatus({ mode: 'gyro-calibrated' });
      this._showFaceToast('体感水平已重置', 'GYRO RESET', 'success');
      this.audio.playReady();
      return;
    }

    this._updateInputStatus({ mode: 'gyro-missing' });
    this._showFaceToast('暂未检测到体感数据', 'GYRO RESET', 'danger');
  }

  toggleBackgroundMusic() {
    const enabled = this.audio.toggleBackgroundMusic();
    this._syncBgmButton();
    this._showFaceToast(enabled ? '背景音乐已开启' : '背景音乐已关闭', 'BGM', enabled ? 'success' : 'neutral');
  }

  _syncBgmButton() {
    if (!this.bgmToggleButton) return;
    const enabled = this.audio.isBackgroundMusicEnabled();
    this.bgmToggleButton.classList.toggle('is-muted', !enabled);
    this.bgmToggleButton.classList.toggle('is-playing', enabled);
    this.bgmToggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    this.bgmToggleButton.setAttribute('aria-label', enabled ? '关闭背景音乐' : '开启背景音乐');
    this.bgmToggleButton.title = enabled ? '关闭背景音乐' : '开启背景音乐';
  }

  _updateProgressDots(currentIndex) {
    this.progressDots.forEach((dot, index) => {
      dot.classList.remove('active', 'done');
      dot.style.borderColor = '';
      dot.style.background = '';
      dot.style.boxShadow = '';
      const color = FACE_COLORS[index].color;
      if (index < currentIndex) {
        dot.classList.add('done');
        dot.style.background = color;
        dot.style.borderColor = color;
      } else if (index === currentIndex) {
        dot.classList.add('active');
        dot.style.borderColor = color;
        dot.style.boxShadow = `0 0 6px ${color}80`;
      }
    });
  }

  _setFaceTheme(level) {
    const hex = level.color.replace('#', '');
    const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(', ');
    this.gameScreen.style.setProperty('--face-color', level.color);
    this.gameScreen.style.setProperty('--face-rgb', rgb);
  }

  _buildLevelSummary(faceTimeMs) {
    const levelIndex = this.currentFace;
    const lifeLimit = FACE_LIFE_LIMITS[levelIndex] || 3;
    const usedLives = this.faceDeaths + 1;
    const goalPass = true;
    const collectPass = this.totalStars === 0 || this.collectedStars >= this.totalStars;
    const previousBest = this.bestTimes[levelIndex] || null;
    const challengerMode = this._isChallengerMode(levelIndex);
    const livesPass = challengerMode || usedLives <= lifeLimit;
    const starScore = [goalPass, collectPass, livesPass].filter(Boolean).length;
    const isNewBest = !previousBest || faceTimeMs < previousBest;

    if (isNewBest) {
      this.bestTimes[levelIndex] = faceTimeMs;
      this._saveStoredJSON(BEST_TIMES_STORAGE_KEY, this.bestTimes);
    }

    const summary = {
      levelIndex,
      levelName: LEVELS[levelIndex].name,
      label: levelIndex === 0 ? 'TUTORIAL' : `LEVEL ${String(levelIndex).padStart(2, '0')}`,
      timeMs: faceTimeMs,
      previousBest,
      bestMs: isNewBest ? faceTimeMs : previousBest,
      isNewBest,
      totalStars: this.totalStars,
      collectedStars: this.collectedStars,
      usedLives,
      lifeLimit,
      goalPass,
      collectPass,
      livesPass,
      challengerMode,
      starScore,
      eliteRank: null,
    };

    if (starScore === 3) {
      summary.eliteRank = this._submitEliteRecord(summary);
    }

    if (isNewBest || starScore === 3) this._saveRemotePlayerAccount();

    return summary;
  }

  _showLevelSummary(summary) {
    this.summaryKicker.textContent = summary.label;
    this.summaryTitle.textContent = '关卡结算';
    this.summaryStars.textContent = '★'.repeat(summary.starScore) + '☆'.repeat(3 - summary.starScore);
    this.summaryTime.textContent = this._formatTime(summary.timeMs);
    this.summaryBest.textContent = summary.isNewBest
      ? `${this._formatTime(summary.bestMs)} · 新纪录`
      : this._formatTime(summary.bestMs);
    this._setSummaryOutcome(this.summaryGoal, '已到达', summary.goalPass);
    this._setSummaryOutcome(
      this.summaryCollect,
      summary.totalStars === 0 ? '无金币' : `${summary.collectedStars}/${summary.totalStars}`,
      summary.collectPass
    );
    this._setSummaryOutcome(this.summaryLives, `${summary.usedLives}/${summary.lifeLimit} 条命`, summary.livesPass);
    this.summaryElite.textContent = summary.starScore === 3
      ? `三星彩绩已进入精英榜单 · 当前本关第 ${summary.eliteRank} 名`
      : '获得 3 星后可进入精英榜单';
    this.summaryContinueButton.querySelector('span').textContent =
      this.currentFace >= LEVELS.length - 1 ? '完成游戏' : '继续';
    this.summaryModal.classList.remove('hidden');
    this.summaryModal.classList.add('show');
    this._summaryPauseStart = performance.now();

    return new Promise((resolve) => {
      this._summaryResolver = resolve;
    });
  }

  _resolveLevelSummary(action) {
    if (!this._summaryResolver) return;
    const resolve = this._summaryResolver;
    const pausedMs = performance.now() - this._summaryPauseStart;
    this.startTime += pausedMs;
    this._hideLevelSummary();
    resolve(action);
  }

  _hideLevelSummary() {
    this.summaryModal.classList.remove('show');
    this.summaryModal.classList.add('hidden');
    this._summaryPauseStart = 0;
    this._summaryResolver = null;
  }

  _setSummaryOutcome(element, text, passed) {
    element.textContent = `${text} · ${passed ? '达标' : '未达标'}`;
    element.classList.toggle('summary-pass', passed);
    element.classList.toggle('summary-fail', !passed);
  }

  _submitEliteRecord(summary) {
    const playerName = this.playerName || localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || 'PLAYER';
    const playerKey = this._playerRecordKey(summary.levelIndex, playerName);
    const record = {
      id: `elite-${playerKey}`,
      playerName,
      avatarColor: this.playerAvatar,
      levelIndex: summary.levelIndex,
      label: summary.label,
      timeMs: summary.timeMs,
      usedLives: summary.usedLives,
      collectedStars: summary.collectedStars,
      totalStars: summary.totalStars,
      createdAt: new Date().toISOString(),
    };

    this.eliteBoard.push(record);
    this.eliteBoard = this._trimEliteBoard(this.eliteBoard);
    this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
    this._submitRemoteEliteRecord(record);
    this._saveRemotePlayerAccount();

    return this._getLevelRecords(record.levelIndex)
      .findIndex(item => this._playerRecordKey(item.levelIndex, item.playerName) === playerKey) + 1;
  }

  _trimEliteBoard(records) {
    const unique = new Map();
    for (const record of records) {
      if (!record || !Number.isInteger(record.levelIndex) || !Number.isFinite(record.timeMs)) continue;
      const playerName = this._sanitizePlayerName(record.playerName || 'PLAYER') || 'PLAYER';
      const levelIndex = Math.max(0, Math.min(LEVELS.length - 1, record.levelIndex));
      const key = this._playerRecordKey(levelIndex, playerName);
      const clean = {
        ...record,
        id: record.id || `elite-${key}`,
        playerName,
        levelIndex,
        timeMs: Math.round(record.timeMs),
        avatarColor: this._sanitizeAvatarColor(record.avatarColor),
        createdAt: record.createdAt || new Date().toISOString(),
      };
      const previous = unique.get(key);
      if (!previous || clean.timeMs < previous.timeMs) unique.set(key, clean);
    }

    const trimmed = [];
    for (let index = 0; index < LEVELS.length; index++) {
      trimmed.push(...Array.from(unique.values())
        .filter(record => record.levelIndex === index)
        .sort((a, b) => a.timeMs - b.timeMs || String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(0, 50));
    }
    return trimmed;
  }

  _openLeaderboard() {
    if (this.leaderboardModal.classList.contains('show')) return;
    this.selectedLeaderboardFace = this.currentFace;
    if (this.state !== State.START && this.state !== State.COMPLETE && this.state !== State.TRANSITION) {
      this._leaderboardPreviousState = this.state;
      this._leaderboardPauseStart = performance.now();
      this.state = State.LEADERBOARD;
      this.audio.stopRolling();
    }
    this._renderLeaderboard();
    this.leaderboardModal.classList.remove('hidden');
    this.leaderboardModal.classList.add('show');
    this._refreshRemoteLeaderboard();
  }

  _closeLeaderboard() {
    const wasOpen = this.leaderboardModal.classList.contains('show');
    this.leaderboardModal.classList.remove('show');
    this.leaderboardModal.classList.add('hidden');
    if (!wasOpen || !this._leaderboardPreviousState) return;

    const pausedMs = Math.max(0, performance.now() - this._leaderboardPauseStart);
    if (this._leaderboardPreviousState === State.PLAYING || this._leaderboardPreviousState === State.FALLING) {
      this.startTime += pausedMs;
      this.faceStartTime += pausedMs;
    }
    this.state = this._leaderboardPreviousState;
    this._leaderboardPreviousState = null;
    this._leaderboardPauseStart = 0;
    this._lastFrameMs = performance.now();
    if (this.state === State.PLAYING || this.state === State.FALLING) this._renderFrame(0, 0);
  }

  _renderLeaderboard() {
    this.leaderboardList.innerHTML = '';
    this.leaderboardTabs.forEach((button) => {
      const active = Number(button.dataset.boardFace) === this.selectedLeaderboardFace;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const records = this._getLevelRecords(this.selectedLeaderboardFace);
    const visibleRecords = records;
    const levelLabel = this.selectedLeaderboardFace === 0
      ? 'TUTORIAL'
      : `LEVEL ${String(this.selectedLeaderboardFace).padStart(2, '0')}`;
    this._renderLeaderboardSelf(records, levelLabel);

    const header = document.createElement('div');
    header.className = 'leaderboard-stage';
    const title = document.createElement('div');
    title.className = 'leaderboard-stage-title';
    const name = document.createElement('span');
    name.textContent = levelLabel;
    const count = document.createElement('span');
    count.textContent = records.length > 0 ? `${records.length} 名三星彩绩` : '等待首位精英';
    title.append(name, count);
    const best = document.createElement('div');
    best.className = 'leaderboard-stage-best';
    best.textContent = records[0]
      ? `当前最快：${records[0].playerName} · ${this._formatTime(records[0].timeMs)}`
      : '完成三星彩绩后进入本关精英榜。';
    header.append(title, best);
    this.leaderboardList.appendChild(header);

    if (visibleRecords.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'leaderboard-empty';
      empty.textContent = '本关暂无三星彩绩';
      this.leaderboardList.appendChild(empty);
      return;
    }

    const section = document.createElement('section');
    section.className = 'leaderboard-level';
    visibleRecords.forEach((record, rank) => {
      section.appendChild(this._createLeaderboardRow(record, rank));
    });
    this.leaderboardList.appendChild(section);
  }

  _renderLeaderboardSelf(records, levelLabel) {
    const playerKey = this._playerRecordKey(this.selectedLeaderboardFace, this.playerName);
    const rankIndex = records.findIndex(record => this._playerRecordKey(record.levelIndex, record.playerName) === playerKey);
    this.leaderboardSelf.innerHTML = '';
    this.leaderboardSelf.classList.toggle('has-record', rankIndex >= 0);

    const label = document.createElement('span');
    label.className = 'leaderboard-self-label';
    label.textContent = '你的成绩';
    const value = document.createElement('strong');
    value.textContent = rankIndex >= 0
      ? `${levelLabel} 第 ${rankIndex + 1} 名 · ${this._formatTime(records[rankIndex].timeMs)}`
      : `${levelLabel} 暂无三星彩绩`;
    this.leaderboardSelf.append(label, value);
  }

  _createLeaderboardRow(record, rank) {
    const row = document.createElement('div');
    const mine = this._playerRecordKey(record.levelIndex, record.playerName) === this._playerRecordKey(record.levelIndex, this.playerName);
    row.className = `leaderboard-record rank-${rank + 1}`;
    row.classList.toggle('mine', mine);

    const rankEl = document.createElement('span');
    rankEl.className = 'leaderboard-rank';
    rankEl.textContent = `#${rank + 1}`;

    const avatar = document.createElement('span');
    avatar.className = 'leaderboard-avatar';
    avatar.style.setProperty('--avatar-color', this._sanitizeAvatarColor(record.avatarColor));

    const player = document.createElement('span');
    player.className = 'leaderboard-player';
    player.textContent = record.playerName;

    const meta = document.createElement('span');
    meta.className = 'leaderboard-meta';
    meta.textContent = `${record.usedLives || 1} 命 · ${record.collectedStars || 0}/${record.totalStars || 0} 金币`;

    const time = document.createElement('span');
    time.className = 'leaderboard-time';
    time.textContent = this._formatTime(record.timeMs);

    row.append(rankEl, avatar, player, meta, time);
    return row;
  }

  _getLevelRecords(levelIndex) {
    return this.eliteBoard
      .filter(record => record.levelIndex === levelIndex)
      .sort((a, b) => a.timeMs - b.timeMs || String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  _playerRecordKey(levelIndex, playerName) {
    return `${levelIndex}:${this._sanitizePlayerName(playerName || 'PLAYER').toLowerCase() || 'player'}`;
  }

  _cloudSyncEnabled() {
    return Boolean(this.cloudDataUrl && this.cloudManageUrl);
  }

  async _readCloudStore() {
    const response = await fetch(`${this.cloudDataUrl}?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`cloud-read-${response.status}`);
    const data = await response.json();
    return {
      records: Array.isArray(data.records) ? data.records : [],
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
    };
  }

  async _writeCloudStore({ records = [], accounts = [] } = {}) {
    const snapshot = {
      schemaVersion: 1,
      gameName: 'WANGRAVITY',
      updatedAt: new Date().toISOString(),
      records: this._trimEliteBoard(records),
      accounts: this._trimCloudAccounts(accounts, records),
    };
    const mockPayload = {
      json_payload: snapshot,
      status_code: 200,
      headers: CLOUD_MOCK_HEADERS,
      allowed_methods: CLOUD_MOCK_ALLOWED_METHODS,
      response_delay_ms: 0,
      error_rate_pct: 0,
      error_rate_status_code: 500,
      error_trigger_header_name: null,
      error_trigger_header_value: null,
      error_trigger_status_code: 400,
      conditional_rules: [],
      round_robin_payloads: [],
    };
    const response = await fetch(this.cloudManageUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockPayload),
    });
    if (!response.ok) throw new Error(`cloud-write-${response.status}`);
    return snapshot;
  }

  async _syncCloudStore({ record = null, account = null, render = false } = {}) {
    const cloud = await this._readCloudStore();
    const records = this._trimEliteBoard([
      ...cloud.records,
      ...this.eliteBoard,
      ...(record ? [record] : []),
    ]);
    const accounts = this._trimCloudAccounts([
      ...cloud.accounts,
      ...(account ? [account] : []),
    ], records);
    const snapshot = await this._writeCloudStore({ records, accounts });
    this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...snapshot.records]);
    this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
    if (render && this.leaderboardModal?.classList.contains('show')) this._renderLeaderboard();
    return snapshot;
  }

  _buildPlayerAccountPayload() {
    return {
      playerName: this.playerName,
      avatarColor: this.playerAvatar,
      bestTimes: this.bestTimes,
      eliteRecords: this._getPlayerEliteRecords(),
      profile: {
        gameName: 'WANGRAVITY',
        lastLevel: this.currentFace,
        savedAt: new Date().toISOString(),
      },
    };
  }

  _mergeBestTimesObject(...sources) {
    const merged = {};
    for (const source of sources) {
      const clean = this._sanitizeBestTimes(source);
      for (const [levelIndex, timeMs] of Object.entries(clean)) {
        if (!Number.isFinite(merged[levelIndex]) || timeMs < merged[levelIndex]) {
          merged[levelIndex] = Math.round(timeMs);
        }
      }
    }
    return merged;
  }

  _trimCloudAccounts(accounts = [], records = []) {
    const byPlayer = new Map();
    const recordGroups = new Map();
    for (const record of this._trimEliteBoard(records)) {
      const key = this._sanitizePlayerName(record.playerName || 'PLAYER').toLowerCase();
      if (!key) continue;
      if (!recordGroups.has(key)) recordGroups.set(key, []);
      recordGroups.get(key).push(record);
    }

    for (const account of accounts) {
      const playerName = this._sanitizePlayerName(account?.playerName || account?.name || 'PLAYER') || 'PLAYER';
      const key = playerName.toLowerCase();
      const previous = byPlayer.get(key);
      const eliteRecords = this._trimEliteBoard([
        ...(Array.isArray(previous?.eliteRecords) ? previous.eliteRecords : []),
        ...(Array.isArray(account?.eliteRecords) ? account.eliteRecords : []),
        ...(recordGroups.get(key) || []),
      ]).filter(record => this._sanitizePlayerName(record.playerName || 'PLAYER').toLowerCase() === key);
      const bestTimesFromRecords = {};
      for (const record of eliteRecords) bestTimesFromRecords[record.levelIndex] = record.timeMs;
      const avatarColor = this._sanitizeAvatarColor(account?.avatarColor || previous?.avatarColor);
      byPlayer.set(key, {
        playerName,
        playerKey: key,
        avatarColor,
        bestTimes: this._mergeBestTimesObject(previous?.bestTimes, account?.bestTimes, bestTimesFromRecords),
        eliteRecords: eliteRecords.map(record => ({ ...record, playerName, avatarColor })),
        profile: {
          ...(previous?.profile || {}),
          ...(account?.profile || {}),
          gameName: 'WANGRAVITY',
          savedAt: account?.profile?.savedAt || previous?.profile?.savedAt || new Date().toISOString(),
        },
        createdAt: previous?.createdAt || account?.createdAt || new Date().toISOString(),
        updatedAt: account?.updatedAt || account?.profile?.savedAt || new Date().toISOString(),
      });
    }

    for (const [key, groupedRecords] of recordGroups) {
      if (byPlayer.has(key)) continue;
      const first = groupedRecords[0];
      const bestTimesFromRecords = {};
      for (const record of groupedRecords) bestTimesFromRecords[record.levelIndex] = record.timeMs;
      byPlayer.set(key, {
        playerName: first.playerName,
        playerKey: key,
        avatarColor: this._sanitizeAvatarColor(first.avatarColor),
        bestTimes: this._mergeBestTimesObject(bestTimesFromRecords),
        eliteRecords: groupedRecords,
        profile: {
          gameName: 'WANGRAVITY',
          savedAt: new Date().toISOString(),
        },
        createdAt: first.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return Array.from(byPlayer.values())
      .sort((a, b) => a.playerName.localeCompare(b.playerName, 'zh-CN'))
      .slice(0, 300);
  }

  async _refreshRemoteLeaderboard() {
    if (this._cloudSyncEnabled()) {
      try {
        const data = await this._readCloudStore();
        this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...data.records]);
        this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
        this._renderLeaderboard();
        return;
      } catch (error) {
        console.warn('云端精英榜单同步失败:', error);
      }
    }

    if (!this.remoteLeaderboardEndpoint) return;
    try {
      const response = await fetch(`${this.remoteLeaderboardEndpoint.replace(/\/$/, '')}/records`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data.records)) return;
      this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...data.records]);
      this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
      this._renderLeaderboard();
    } catch (error) {
      console.warn('精英榜单同步失败:', error);
    }
  }

  _submitRemoteEliteRecord(record) {
    if (this._cloudSyncEnabled()) {
      this._syncCloudStore({
        record,
        account: this._buildPlayerAccountPayload(),
        render: true,
      }).catch((error) => {
        console.warn('云端精英榜单提交失败:', error);
      });
      return;
    }

    if (!this.remoteLeaderboardEndpoint) return;
    fetch(`${this.remoteLeaderboardEndpoint.replace(/\/$/, '')}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }).catch((error) => {
      console.warn('精英榜单提交失败:', error);
    });
  }

  _queueRemotePlayerAccountLoad(playerName, { applyAvatar = true, delay = 420 } = {}) {
    if (!this._cloudSyncEnabled() && !this.remotePlayerEndpoint) return;
    window.clearTimeout(this._accountLoadTimer);
    this._accountLoadTimer = window.setTimeout(() => {
      this._loadRemotePlayerAccount(playerName, { applyAvatar });
    }, delay);
  }

  async _loadRemotePlayerAccount(playerName = this.playerName, { applyAvatar = true, resetOnMissing = false } = {}) {
    if (!this._cloudSyncEnabled() && !this.remotePlayerEndpoint) return false;
    const cleanName = this._sanitizePlayerName(playerName);
    if (!cleanName) return false;
    const token = ++this._accountLoadToken;

    if (this._cloudSyncEnabled()) {
      try {
        const data = await this._readCloudStore();
        if (token !== this._accountLoadToken) return false;
        this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...data.records]);
        this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
        const account = this._trimCloudAccounts(data.accounts, data.records)
          .find(item => item.playerKey === cleanName.toLowerCase());
        if (!account) {
          if (resetOnMissing) this._startFreshPlayerAccount(cleanName);
          return false;
        }

        const restoredName = this._sanitizePlayerName(account.playerName || cleanName) || cleanName;
        this.playerName = restoredName;
        if (this.playerNameInput && this._sanitizePlayerName(this.playerNameInput.value) === cleanName) {
          this.playerNameInput.value = restoredName;
        }
        this.bestTimes = this._sanitizeBestTimes(account.bestTimes);
        this._saveStoredJSON(BEST_TIMES_STORAGE_KEY, this.bestTimes);
        if (Array.isArray(account.eliteRecords)) {
          this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...account.eliteRecords]);
          this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
        }
        if (applyAvatar && account.avatarColor) {
          this._selectAvatar(account.avatarColor);
          localStorage.setItem(PLAYER_AVATAR_STORAGE_KEY, this.playerAvatar);
        }
        localStorage.setItem(PLAYER_NAME_STORAGE_KEY, this.playerName);
        return true;
      } catch (error) {
        console.warn('云端玩家档案同步失败:', error);
      }
    }

    try {
      const response = await fetch(`${this.remotePlayerEndpoint.replace(/\/$/, '')}/${encodeURIComponent(cleanName)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        if (response.status === 404 && resetOnMissing) this._startFreshPlayerAccount(cleanName);
        return false;
      }
      const data = await response.json();
      const account = data.account;
      if (token !== this._accountLoadToken || !account) return false;

      const restoredName = this._sanitizePlayerName(account.playerName || cleanName) || cleanName;
      this.playerName = restoredName;
      if (this.playerNameInput && this._sanitizePlayerName(this.playerNameInput.value) === cleanName) {
        this.playerNameInput.value = restoredName;
      }

      this.bestTimes = this._sanitizeBestTimes(account.bestTimes);
      this._saveStoredJSON(BEST_TIMES_STORAGE_KEY, this.bestTimes);
      if (Array.isArray(account.eliteRecords)) {
        this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...account.eliteRecords]);
        this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
      }

      if (applyAvatar && account.avatarColor) {
        this._selectAvatar(account.avatarColor);
        localStorage.setItem(PLAYER_AVATAR_STORAGE_KEY, this.playerAvatar);
      }
      localStorage.setItem(PLAYER_NAME_STORAGE_KEY, this.playerName);
      return true;
    } catch (error) {
      console.warn('玩家档案同步失败:', error);
      return false;
    }
  }

  _mergeBestTimes(remoteBestTimes = {}) {
    const clean = this._sanitizeBestTimes(remoteBestTimes);
    if (!Object.keys(clean).length) return false;
    let changed = false;
    for (let index = 0; index < LEVELS.length; index++) {
      const value = clean[index];
      if (!Number.isFinite(value)) continue;
      if (!Number.isFinite(Number(this.bestTimes[index])) || value < Number(this.bestTimes[index])) {
        this.bestTimes[index] = Math.round(value);
        changed = true;
      }
    }
    if (changed) this._saveStoredJSON(BEST_TIMES_STORAGE_KEY, this.bestTimes);
    return changed;
  }

  _sanitizeBestTimes(bestTimes = {}) {
    const clean = {};
    if (!bestTimes || typeof bestTimes !== 'object') return clean;
    for (let index = 0; index < LEVELS.length; index++) {
      const value = Number(bestTimes[index]);
      if (Number.isFinite(value) && value > 0) clean[index] = Math.round(value);
    }
    return clean;
  }

  _startFreshPlayerAccount(playerName) {
    this.playerName = this._sanitizePlayerName(playerName) || 'PLAYER';
    this.bestTimes = {};
    this.faceTimes = [];
    this._saveStoredJSON(BEST_TIMES_STORAGE_KEY, this.bestTimes);
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, this.playerName);
  }

  _getPlayerEliteRecords() {
    const currentKey = this._sanitizePlayerName(this.playerName || 'PLAYER').toLowerCase();
    return this.eliteBoard.filter((record) => {
      const recordKey = this._sanitizePlayerName(record.playerName || 'PLAYER').toLowerCase();
      return recordKey === currentKey;
    });
  }

  _applyPlayerAvatarToLocalRecords(playerName = this.playerName, avatarColor = this.playerAvatar) {
    const currentKey = this._sanitizePlayerName(playerName || 'PLAYER').toLowerCase();
    const cleanAvatar = this._sanitizeAvatarColor(avatarColor);
    let changed = false;
    this.eliteBoard = this.eliteBoard.map((record) => {
      const recordKey = this._sanitizePlayerName(record.playerName || 'PLAYER').toLowerCase();
      if (recordKey !== currentKey || record.avatarColor === cleanAvatar) return record;
      changed = true;
      return { ...record, avatarColor: cleanAvatar };
    });
    if (changed) this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
  }

  _saveRemotePlayerAccount() {
    if (!this._cloudSyncEnabled() && !this.remotePlayerEndpoint) return;
    const playerName = this._sanitizePlayerName(this.playerNameInput?.value || this.playerName);
    if (!playerName) return;
    this.playerName = playerName;
    this._applyPlayerAvatarToLocalRecords();
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, this.playerName);
    localStorage.setItem(PLAYER_AVATAR_STORAGE_KEY, this.playerAvatar);

    const payload = this._buildPlayerAccountPayload();

    if (this._cloudSyncEnabled()) {
      this._syncCloudStore({ account: payload, render: true })
        .then((snapshot) => {
          const account = snapshot.accounts.find(item => item.playerKey === this.playerName.toLowerCase());
          if (!account) return;
          this._mergeBestTimes(account.bestTimes);
          if (Array.isArray(account.eliteRecords)) {
            this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...account.eliteRecords]);
            this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
          }
        })
        .catch((error) => {
          console.warn('云端玩家档案保存失败:', error);
        });
      return;
    }

    fetch(`${this.remotePlayerEndpoint.replace(/\/$/, '')}/${encodeURIComponent(this.playerName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        const account = data.account;
        if (!account) return;
        this._mergeBestTimes(account.bestTimes);
        if (Array.isArray(account.eliteRecords)) {
          this.eliteBoard = this._trimEliteBoard([...this.eliteBoard, ...account.eliteRecords]);
          this._saveStoredJSON(ELITE_BOARD_STORAGE_KEY, this.eliteBoard);
        }
      })
      .catch((error) => {
        console.warn('玩家档案保存失败:', error);
      });
  }

  _showGameplayTip(index) {
    const tip = GAMEPLAY_TIPS[index];
    if (!tip) return false;
    this.gameplayTipKicker.textContent = tip.kicker;
    this.gameplayTipTitle.textContent = tip.title;
    const lifeLimit = FACE_LIFE_LIMITS[index] || 3;
    const usedLives = this.faceDeaths + 1;
    const challengerText = this._isChallengerMode(index) ? '已进入' : '未进入';
    this.gameplayTipText.textContent = [
      tip.text,
      `时间限制：${this._formatTimeLimit(FACE_TIME_LIMITS_SECONDS[index])}。退出提示后开始计时。`,
      `生命：已用 ${usedLives}/${lifeLimit} 条。`,
      `挑战者模式：${challengerText}。`,
    ].join('\n');
    this.gameplayTip.classList.remove('hidden');
    this.gameplayTip.classList.add('show');
    this.state = State.HINT;
    this._tipPauseStart = performance.now();
    return true;
  }

  _isChallengerMode(index) {
    return Number.isFinite(Number(this.bestTimes[index]));
  }

  _dismissGameplayTip() {
    if (this.state !== State.HINT) return;
    const pausedMs = performance.now() - this._tipPauseStart;
    this.startTime += pausedMs;
    this.faceStartTime += pausedMs;
    this._hideGameplayTip();
    this.input.clearKeys();
    this._lastFrameMs = performance.now();
    this.state = State.PLAYING;
  }

  _hideGameplayTip() {
    this.gameplayTip.classList.remove('show');
    this.gameplayTip.classList.add('hidden');
    this._tipPauseStart = 0;
  }

  _setCalibrationStatus(text) {
    this.calibrationStatusEl.textContent = text;
  }

  _showFaceToast(text, kicker = 'LEVEL UPDATE', variant = '') {
    const token = ++this._toastToken;
    this.faceToastText.textContent = text;
    this.faceToastKicker.textContent = kicker;
    this.faceToast.classList.toggle('danger', variant === 'danger');
    this.faceToast.classList.toggle('success', variant === 'success');
    this.faceToast.classList.remove('hidden');
    this.faceToast.classList.add('show');
    setTimeout(() => {
      if (token !== this._toastToken) return;
      this.faceToast.classList.remove('show');
      setTimeout(() => {
        if (token === this._toastToken) this.faceToast.classList.add('hidden');
      }, 300);
    }, 1200);
  }

  _showGoalToast() {
    const token = ++this._goalToastToken;
    this.goalToast.classList.remove('hidden');
    requestAnimationFrame(() => {
      if (token === this._goalToastToken) this.goalToast.classList.add('show');
    });
    setTimeout(() => {
      if (token !== this._goalToastToken) return;
      this.goalToast.classList.remove('show');
      setTimeout(() => {
        if (token === this._goalToastToken) this.goalToast.classList.add('hidden');
      }, 220);
    }, 1400);
  }

  _hideGoalToast() {
    this._goalToastToken++;
    this.goalToast.classList.remove('show');
    this.goalToast.classList.add('hidden');
  }

  _showScreen(name) {
    [this.startScreen, this.calibrationScreen, this.gameScreen, this.completeScreen, this.transition.screen]
      .forEach(screen => screen.classList.remove('active'));
    if (name === 'start') this.startScreen.classList.add('active');
    if (name === 'calibration') this.calibrationScreen.classList.add('active');
    if (name === 'game') this.gameScreen.classList.add('active');
    if (name === 'complete') this.completeScreen.classList.add('active');
  }

  _startLoop() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._animFrame = requestAnimationFrame(this._boundLoop);
  }

  _stopLoop() {
    if (!this._animFrame) return;
    cancelAnimationFrame(this._animFrame);
    this._animFrame = null;
  }

  restart() {
    this.openCalibration();
  }

  restartFromLevelOne() {
    if (!this.renderer) {
      this._rendererPromise.then(() => this.restartFromLevelOne());
      return;
    }
    this._closeLevelMenu();
    this._hideGameplayTip();
    this._hideLevelSummary();
    this._closeLeaderboard();
    this._hideGoalToast();
    this.audio.stopRolling();
    this.transition.hide();
    this.faceTimes = [];
    this.startTime = Date.now();
    this.elapsedTime = 0;
    this._lastTimerText = '';
    this._showScreen('game');
    this._loadFace(1, { resetStats: true });
    this.state = State.PLAYING;
    this._renderFrame(0, 0);
    this._showGameplayTip(1);
    this._lastFrameMs = performance.now();
    if (!this._animFrame) this._startLoop();
  }

  jumpToFace(index) {
    if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) return;
    if (!this.renderer) {
      this._rendererPromise.then(() => this.jumpToFace(index));
      return;
    }
    this._closeLevelMenu();
    this._hideGameplayTip();
    this._hideLevelSummary();
    this._closeLeaderboard();
    this._hideGoalToast();
    this.audio.stopRolling();
    this.transition.hide();
    this._showScreen('game');
    this._loadFace(index, { resetStats: true });
    this.state = State.PLAYING;
    this._renderFrame(0, 0);
    this._showGameplayTip(index);
    this._lastFrameMs = performance.now();
    if (!this._animFrame) this._startLoop();
  }

  _updateCountdown(dt) {
    this.faceTimeRemainingMs = Math.max(0, this.faceTimeRemainingMs - dt);
    const seconds = Math.ceil(this.faceTimeRemainingMs / 1000);

    if (seconds > 0 && seconds <= 5 && seconds !== this._lastCountdownSecond) {
      this.audio.playCountdownTick(seconds);
      this._vibrateCountdown();
      this._shakeCountdownScreen();
    }
    this._lastCountdownSecond = seconds;
    this._setCountdownAlert(seconds > 0 && seconds <= 5);
    this._updateCountdownHUD();

    if (this.faceTimeRemainingMs > 0) return true;
    this._onTimeoutDeath();
    return false;
  }

  _updateCountdownHUD() {
    const text = this._formatCountdown(this.faceTimeRemainingMs);
    if (text === this._lastCountdownText) return;
    this._lastCountdownText = text;
    this.countdownEl.textContent = text;
  }

  _setCountdownAlert(active) {
    if (active === this._countdownAlertActive) return;
    this._countdownAlertActive = active;
    this.countdownBar.classList.toggle('countdown-alert', active);
    this.gameScreen.classList.toggle('countdown-alert', active);
  }

  _onTimeoutDeath() {
    this.state = State.DEAD;
    this.deathTimer = 680;
    this.deathReason = 'timeout';
    this.faceDeaths++;
    this._setCountdownAlert(false);
    this.physics.beginFall('timeout', this.physics.x, this.physics.y);
    this.audio.stopRolling();
    this.audio.playTimeout();
    this._vibrateDeath();
    this._shakeScreen();
  }

  _toggleLevelMenu() {
    const hidden = this.levelMenuPanel.classList.toggle('hidden');
    this.levelMenuButton.setAttribute('aria-expanded', String(!hidden));
  }

  _closeLevelMenu() {
    this.levelMenuPanel.classList.add('hidden');
    this.levelMenuButton.setAttribute('aria-expanded', 'false');
  }

  _updateLevelMenuButtons() {
    this.levelMenuButtons.forEach((button) => {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.classList.toggle('active', Number(button.dataset.jumpFace) === this.currentFace);
    });
  }

  _vibrateHit(speed = 0) {
    const intensity = Math.min(speed / this.physics.maxSpeed, 1);
    const pattern = 180 + Math.round(intensity * 220);
    if (!this._tryVibrate(pattern)) this.audio.playBuzz(Math.max(0.25, intensity), 0.65);
  }

  _vibrateDeath() {
    if (!this._tryVibrate([260, 70, 320, 70, 420])) this.audio.playBuzz(1, 1.25);
  }

  _vibrateCountdown() {
    if (!this._tryVibrate([260, 70, 260])) this.audio.playBuzz(1, 1.05);
  }

  _unlockVibrationPermission() {
    if (typeof navigator.vibrate !== 'function') return false;
    try {
      navigator.vibrate(80);
      window.setTimeout(() => {
        try {
          navigator.vibrate(0);
        } catch {}
      }, 90);
      return true;
    } catch {
      return false;
    }
  }

  _tryVibrate(pattern) {
    if (typeof navigator.vibrate !== 'function') return false;
    try {
      return navigator.vibrate(pattern) !== false;
    } catch {
      return false;
    }
  }

  _shakeScreen() {
    this.canvas.classList.add('shake');
    setTimeout(() => this.canvas.classList.remove('shake'), 100);
  }

  _shakeCountdownScreen() {
    this.gameScreen.classList.remove('countdown-tick-shake');
    this.countdownBar.classList.remove('countdown-tick-pulse');
    void this.gameScreen.offsetWidth;
    this.gameScreen.classList.add('countdown-tick-shake');
    this.countdownBar.classList.add('countdown-tick-pulse');
    setTimeout(() => {
      this.gameScreen.classList.remove('countdown-tick-shake');
      this.countdownBar.classList.remove('countdown-tick-pulse');
    }, 180);
  }

  _cellCenter(value) {
    return value * CELL_SIZE + CELL_SIZE / 2;
  }

  _toCell(value) {
    return Math.max(0, Math.min(14, Math.floor(value / CELL_SIZE)));
  }

  _formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  _formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  _formatTimeLimit(seconds) {
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds % 60;
    return restSeconds > 0 ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分钟`;
  }

  _sanitizePlayerName(value) {
    return String(value || '')
      .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
      .trim()
      .slice(0, 16);
  }

  _sanitizeAvatarColor(value) {
    const normalized = String(value || '').toLowerCase();
    return AVATAR_COLORS.includes(normalized) ? normalized : AVATAR_COLORS[0];
  }

  _selectAvatar(color, fromUser = false) {
    this.playerAvatar = this._sanitizeAvatarColor(color);
    if (fromUser) this._avatarChangedByUser = true;
    this._applyPlayerAvatarToLocalRecords?.();
    this.avatarButtons.forEach((button) => {
      const active = button.dataset.avatarColor.toLowerCase() === this.playerAvatar;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  _sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  _loadStoredJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  _saveStoredJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('本地记录保存失败:', error);
    }
  }

  _createRenderer() {
    if (shouldUseLiteRenderer()) {
      this.renderer = new LiteRenderer(this.canvas);
      return Promise.resolve(this.renderer);
    }

    return import('./Renderer.js')
      .then(({ default: Renderer }) => {
        this.renderer = new Renderer(this.canvas);
        return this.renderer;
      })
      .catch((error) => {
        console.warn('WebGL renderer failed, using lightweight renderer:', error);
        this.renderer = new LiteRenderer(this.canvas);
        return this.renderer;
      });
  }
}
