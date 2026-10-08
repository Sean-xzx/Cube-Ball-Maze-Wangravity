import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CELL, LEVELS } from './LevelData.js';
import { CELL_SIZE } from './Physics.js';

const GRID = 15;
const MAZE = GRID * CELL_SIZE;
const HW = MAZE / 2;
const HH = MAZE / 2;
const WALL_H = 18;
const BALL_Z = WALL_H + 13;
const BALL_R = 12;
const MAX_PIXEL_RATIO = 2;
const MOBILE_MAX_PIXEL_RATIO = 1;
const MOBILE_MIN_PIXEL_RATIO = 0.72;
const MOBILE_LEVEL_PIXEL_RATIO = 0.86;
const MOBILE_FULL_QUERY = '(max-width: 820px), (pointer: coarse)';
const STATIC_TRAP_GLOW = 0xff6f86;
const STATIC_TRAP_RIM = 0x6a1d28;
const STATIC_TRAP_EMISSIVE = 0xff3e5b;
const STATIC_TRAP_INNER = 0x350b12;
const STATIC_TRAP_ACCENT = 0xffbac4;
const CHASE_TRAP_GLOW = 0x9966ff;
const CHASE_TRAP_RIM = 0x201044;
const CHASE_TRAP_EMISSIVE = 0x6f38e8;
const CHASE_TRAP_INNER = 0x14082e;
const CHASE_TRAP_ACCENT = 0xc5a5ff;
const PORTAL_GLOW = 0x4dff87;
const PORTAL_RIM = 0x0e4d31;
const PORTAL_CORE = 0x00120b;
const ROTATING_GATE_GLOW = 0xff355f;
const ROTATING_GATE_ZONE = 0xffd83d;
const TRAIL_OPACITIES = [0.26, 0.22, 0.17, 0.12, 0.075, 0.035];

export default class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this._mobilePerformanceMode = window.matchMedia(MOBILE_FULL_QUERY).matches;
    if (this._mobilePerformanceMode) document.documentElement.classList.add('mobile-full-performance');
    this.time = 0;
    this._currentLevel = -1;
    this._levelColor = new THREE.Color();
    this._hitFlash = 0;
    this._goalPos = null;
    this._rippleCursor = 0;
    this._trailTick = 0;
    this._trailReady = false;
    this._gridRevision = -1;
    this._activeGrid = null;
    this._movingTrapSyncToken = 0;
    this._lastBallPos = { x: 0, y: 0 };
    this._drawPos = { x: 0, y: 0, radius: BALL_R };
    this._lastFrameTime = 0;
    this._frameTimeEma = 1000 / 60;
    this._lastResolutionAdjustTime = performance.now();
    this._decorativeFrame = 0;
    this._maxPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this._mobilePerformanceMode ? MOBILE_MAX_PIXEL_RATIO : MAX_PIXEL_RATIO
    );
    this._pixelRatio = this._maxPixelRatio;
    this._scratchBallPoint = new THREE.Vector3();
    this._scratchTrailPoint = new THREE.Vector3();
    this._scratchShadowDirection = new THREE.Vector2();
    this._scratchRollAxis = new THREE.Vector3();

    this._initRenderer();
    this._createEnvMap();
    this._initLights();
    this._initTray();
    this._initFloor();
    this._initEffects();
    this._initBall();
    this._initHole();
    this._initTraps();
    this._initStars();
    this._initPortals();
    this._initRotatingGates();
    this._initMovingTraps();
    this.resize();
  }

  _p(x, y, z = 0) {
    return new THREE.Vector3(x - HW, HH - y, z);
  }

  _segments(desktop, mobile) {
    return this._mobilePerformanceMode ? mobile : desktop;
  }

  _surfaceMaterial(parameters) {
    if (!this._mobilePerformanceMode) return new THREE.MeshPhysicalMaterial(parameters);
    const {
      transmission,
      thickness,
      clearcoat,
      clearcoatRoughness,
      ...standardParameters
    } = parameters;
    return new THREE.MeshStandardMaterial(standardParameters);
  }

  _initRenderer() {
    this.gl = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this._mobilePerformanceMode,
      powerPreference: 'high-performance',
    });
    this.gl.setPixelRatio(this._pixelRatio);
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.2;
    this.gl.shadowMap.enabled = !this._mobilePerformanceMode;
    this.gl.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08174f);

    this.cam = new THREE.OrthographicCamera(-HW, HW, HH, -HH, 0.1, 2000);
    this.cam.position.set(0, 0, 1000);
    this.cam.lookAt(0, 0, 0);
  }

  _createEnvMap() {
    const pmrem = new THREE.PMREMGenerator(this.gl);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x06133f);

    [
      [0xffd93d, -120, 100, 90],
      [0x35d9ff, 130, 90, 120],
      [0xff5ab6, -90, -120, 70],
      [0x8b63ff, 130, -110, 60],
      [0xffffff, 0, 0, 180],
    ].forEach(([color, x, y, z], index) => {
      const lightCard = new THREE.Mesh(
        new THREE.PlaneGeometry(index === 4 ? 110 : 72, index === 4 ? 110 : 72),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      );
      lightCard.position.set(x, y, z);
      lightCard.lookAt(0, 0, 0);
      envScene.add(lightCard);
    });

    this._envMap = pmrem.fromScene(envScene, 0.02, 0.1, 500);
    envScene.traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });

    const metalEnvScene = new THREE.Scene();
    metalEnvScene.background = new THREE.Color(0x151a22);
    [
      [0xffffff, -150, 100, 120, 120, 70],
      [0xd5e1ed, 150, 20, 100, 90, 160],
      [0x7e8996, -80, -150, 70, 120, 80],
      [0xffffff, 20, 40, 210, 110, 110],
    ].forEach(([color, x, y, z, width, height]) => {
      const lightCard = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      );
      lightCard.position.set(x, y, z);
      lightCard.lookAt(0, 0, 0);
      metalEnvScene.add(lightCard);
    });

    this._metalEnvMap = pmrem.fromScene(metalEnvScene, 0.02, 0.1, 500);
    metalEnvScene.traverse((child) => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
    pmrem.dispose();
  }

  _initLights() {
    this.scene.add(new THREE.HemisphereLight(0xcde9ff, 0x18204f, 1.78));

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-220, 260, 440);
    key.intensity = 1.06;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x6fdfff, 0.72);
    fill.position.set(240, -180, 280);
    this.scene.add(fill);

    this._orbitKey = new THREE.PointLight(0xffffff, 185, 760, 1.8);
    this._orbitKey.position.set(-180, 170, 190);
    this._orbitKey.castShadow = !this._mobilePerformanceMode;
    this._orbitKey.shadow.mapSize.set(512, 512);
    this._orbitKey.shadow.camera.near = 15;
    this._orbitKey.shadow.camera.far = 760;
    this._orbitKey.shadow.bias = -0.001;
    if (!this._mobilePerformanceMode) this.scene.add(this._orbitKey);

    this._accentLights = [
      new THREE.PointLight(0x4bdcff, 82, 560, 1.9),
      new THREE.PointLight(0xff5ab6, 76, 560, 1.9),
    ];
    this._accentLights[0].position.set(210, 0, 105);
    this._accentLights[1].position.set(-210, 0, 98);
    if (!this._mobilePerformanceMode) this.scene.add(...this._accentLights);

    this._ballLight = new THREE.PointLight(0xffffff, 1.1, 230);
    this._ballLight.position.z = BALL_Z;
    if (!this._mobilePerformanceMode) this.scene.add(this._ballLight);
  }

  _initTray() {
    this._trayMat = this._surfaceMaterial({
      color: 0x48cfff,
      roughness: 0.18,
      metalness: 0.02,
      transparent: true,
      opacity: 0.55,
      transmission: 0.14,
      thickness: 8,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMap: this._envMap.texture,
      envMapIntensity: 1.5,
    });

    this._tray = new THREE.Mesh(
      new RoundedBoxGeometry(MAZE + 34, MAZE + 34, 17, 5, this._segments(13, 7)),
      this._trayMat
    );
    this._tray.position.z = -10;
    this._tray.receiveShadow = true;
    this.scene.add(this._tray);

    this._trayGlowMat = new THREE.MeshBasicMaterial({
      color: 0x48cfff,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._trayGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(MAZE + 22, MAZE + 22),
      this._trayGlowMat
    );
    this._trayGlow.position.z = -0.15;
    this.scene.add(this._trayGlow);

    this._frameMat = this._surfaceMaterial({
      color: 0xb9f0ff,
      roughness: 0.12,
      metalness: 0.02,
      transparent: true,
      opacity: 0.72,
      transmission: 0.24,
      thickness: 5,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMap: this._envMap.texture,
      envMapIntensity: 1.8,
    });

    this._frame = new THREE.Group();
    const frameOffset = MAZE / 2 + 11;
    const frameZ = 9;
    const horizontal = new RoundedBoxGeometry(MAZE + 32, 20, 24, 4, this._segments(7, 4));
    const vertical = new RoundedBoxGeometry(20, MAZE + 32, 24, 4, this._segments(7, 4));
    const corner = new RoundedBoxGeometry(34, 34, 30, 5, this._segments(9, 5));

    [
      [horizontal, 0, frameOffset],
      [horizontal, 0, -frameOffset],
      [vertical, frameOffset, 0],
      [vertical, -frameOffset, 0],
    ].forEach(([geometry, x, y]) => {
      const bar = new THREE.Mesh(geometry, this._frameMat);
      bar.position.set(x, y, frameZ);
      bar.castShadow = true;
      bar.receiveShadow = true;
      this._frame.add(bar);
    });

    [
      [-frameOffset, frameOffset],
      [frameOffset, frameOffset],
      [-frameOffset, -frameOffset],
      [frameOffset, -frameOffset],
    ].forEach(([x, y]) => {
      const bumper = new THREE.Mesh(corner, this._frameMat);
      bumper.position.set(x, y, frameZ + 2);
      bumper.castShadow = true;
      bumper.receiveShadow = true;
      this._frame.add(bumper);
    });
    this.scene.add(this._frame);
  }

  _initFloor() {
    this._floorMat = this._surfaceMaterial({
      color: 0x177ccb,
      roughness: 0.46,
      metalness: 0,
      transparent: true,
      opacity: 0.86,
      clearcoat: 0.7,
      clearcoatRoughness: 0.25,
    });
    this._floor = new THREE.Mesh(new THREE.PlaneGeometry(MAZE, MAZE), this._floorMat);
    this._floor.position.z = 0;
    this._floor.receiveShadow = true;
    this.scene.add(this._floor);

    this._floorTileMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    });
    this._floorTiles = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(CELL_SIZE - 1.5, CELL_SIZE - 1.5),
      this._floorTileMat,
      GRID * GRID
    );
    const tile = new THREE.Object3D();
    let tileIndex = 0;
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const pos = this._p(
          col * CELL_SIZE + CELL_SIZE / 2,
          row * CELL_SIZE + CELL_SIZE / 2,
          0.08
        );
        tile.position.copy(pos);
        tile.updateMatrix();
        this._floorTiles.setMatrixAt(tileIndex++, tile.matrix);
      }
    }
    this._floorTiles.instanceMatrix.needsUpdate = true;
    this.scene.add(this._floorTiles);

    this._gridMat = new THREE.LineBasicMaterial({
      color: 0xbdeeff,
      transparent: true,
      opacity: 0.11,
    });
    const gridPoints = [];
    for (let i = 0; i <= GRID; i++) {
      const offset = i * CELL_SIZE;
      gridPoints.push(
        new THREE.Vector3(offset - HW, -HH, 0.12),
        new THREE.Vector3(offset - HW, HH, 0.12),
        new THREE.Vector3(-HW, offset - HH, 0.12),
        new THREE.Vector3(HW, offset - HH, 0.12),
      );
    }
    this.scene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(gridPoints),
      this._gridMat
    ));
  }

  _updateFloorTiles(level) {
    const base = new THREE.Color(level.color);
    const cool = new THREE.Color(0x77dfff);
    const shadow = new THREE.Color(0x082356);
    let index = 0;

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const color = base.clone();
        const pattern = (row * 3 + col * 5) % 7;
        color.lerp(pattern % 2 === 0 ? cool : shadow, pattern % 2 === 0 ? 0.22 : 0.34);
        this._floorTiles.setColorAt(index++, color);
      }
    }
    this._floorTiles.instanceColor.needsUpdate = true;
  }

  _initEffects() {
    this._glowTexture = this._createGlowTexture();
    const lightPoolConfigs = this._mobilePerformanceMode
      ? [[0xfff0a0, 132, 0.24, this._orbitKey.position]]
      : [
          [0x4bdcff, 150, 0.36, this._accentLights[0].position],
          [0xff5ab6, 160, 0.3, this._accentLights[1].position],
          [0xfff0a0, 132, 0.26, this._orbitKey.position],
        ];
    this._lightPools = lightPoolConfigs.map(([color, radius, opacity]) =>
      this._createLightPool(color, radius, opacity)
    );
    this._lightPoolSources = lightPoolConfigs.map(([, , , source]) => source);

    this._ripples = Array.from({ length: this._mobilePerformanceMode ? 3 : 5 }, () => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(10, 12, this._segments(48, 24)),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      mesh.position.z = 0.52;
      mesh.visible = false;
      this.scene.add(mesh);
      return { mesh, life: 0 };
    });
  }

  _createLightPool(color, radius, opacity) {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        color,
        map: this._glowTexture,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    pool.scale.set(radius, radius, 1);
    pool.userData.baseScale = radius;
    pool.position.z = 0.18;
    this.scene.add(pool);
    return pool;
  }

  _createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.38, 'rgba(255, 255, 255, 0.38)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  _clearWalls() {
    if (!this._wallMesh) return;

    this._wallMesh.geometry.dispose();
    this._wallMesh.material.dispose();
    this.scene.remove(this._wallMesh);
    this._wallCapMesh.geometry.dispose();
    this._wallCapMesh.material.dispose();
    this.scene.remove(this._wallCapMesh);
    this._wallBaseMesh.geometry.dispose();
    this._wallBaseMesh.material.dispose();
    this.scene.remove(this._wallBaseMesh);
  }

  _buildWalls(level) {
    this._clearWalls();

    const grid = level.grid;
    let count = 0;
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (grid[row][col] === CELL.WALL) count++;
      }
    }
    if (!count) return;

    this._levelColor.set(level.color);
    const geometry = new RoundedBoxGeometry(CELL_SIZE - 2, CELL_SIZE - 2, WALL_H + 6, 3, this._segments(5, 3));
    const material = this._surfaceMaterial({
      color: level.color,
      emissive: new THREE.Color(level.color).multiplyScalar(0.22),
      emissiveIntensity: 0.14,
      roughness: 0.2,
      metalness: 0.02,
      transparent: true,
      opacity: 0.8,
      transmission: 0.12,
      thickness: 4,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMap: this._envMap.texture,
      envMapIntensity: 1.45,
    });
    this._wallMesh = new THREE.InstancedMesh(geometry, material, count);
    this._wallMesh.castShadow = true;
    this._wallMesh.receiveShadow = true;

    this._wallCapMesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(CELL_SIZE - 8, CELL_SIZE - 8, 2.4, 2, this._segments(4, 3)),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.23,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      count
    );

    this._wallBaseMesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(CELL_SIZE - 1, CELL_SIZE - 1, 3.2, 2, this._segments(4, 3)),
      new THREE.MeshBasicMaterial({
        color: 0x061539,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
      count
    );

    const dummy = new THREE.Object3D();
    let index = 0;
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (grid[row][col] !== CELL.WALL) continue;

        const pos = this._p(
          col * CELL_SIZE + CELL_SIZE / 2,
          row * CELL_SIZE + CELL_SIZE / 2
        );
        dummy.position.set(pos.x, pos.y, (WALL_H + 6) / 2);
        dummy.updateMatrix();
        this._wallMesh.setMatrixAt(index, dummy.matrix);

        dummy.position.z = WALL_H + 5.8;
        dummy.updateMatrix();
        this._wallCapMesh.setMatrixAt(index, dummy.matrix);

        dummy.position.z = 1.7;
        dummy.updateMatrix();
        this._wallBaseMesh.setMatrixAt(index, dummy.matrix);
        index++;
      }
    }

    this._wallMesh.instanceMatrix.needsUpdate = true;
    this._wallCapMesh.instanceMatrix.needsUpdate = true;
    this._wallBaseMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this._wallBaseMesh, this._wallMesh);
    if (!this._mobilePerformanceMode) this.scene.add(this._wallCapMesh);
  }

  _initBall() {
    this._ballGroup = new THREE.Group();

    this.ball3D = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, this._segments(72, 40), this._segments(56, 32)),
      this._surfaceMaterial({
        color: 0xf8fbff,
        emissive: 0x05070b,
        emissiveIntensity: 0.05,
        roughness: 0.09,
        metalness: 1,
        clearcoat: 1,
        clearcoatRoughness: 0.035,
        envMap: this._metalEnvMap.texture,
        envMapIntensity: 2.85,
      })
    );
    this.ball3D.castShadow = true;
    this._ballGroup.add(this.ball3D);
    this._ballBands = [];
    this._ballMarkers = [];

    this._ballGroup.position.z = BALL_Z;
    this.scene.add(this._ballGroup);

    this._ballShadows = this._mobilePerformanceMode
      ? [this._createBallShadow(this._orbitKey, 0.28, 15, 8.2)]
      : [
          this._createBallShadow(this._orbitKey, 0.28, 15, 8.2),
          this._createBallShadow(this._accentLights[0], 0.12, 13.5, 7.4),
          this._createBallShadow(this._accentLights[1], 0.1, 13, 7),
        ];

    this._ballHalo = new THREE.Mesh(
      new THREE.CircleGeometry(1, this._segments(32, 20)),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this._ballHalo.scale.set(22, 22, 1);
    this._ballHalo.position.z = 0.28;
    this.scene.add(this._ballHalo);

    this._trailPositions = Array.from({ length: this._mobilePerformanceMode ? 3 : 6 }, () => new THREE.Vector3());
    const ghostGeometry = new THREE.SphereGeometry(BALL_R, this._segments(36, 18), this._segments(28, 14));
    this._trailGhosts = this._trailPositions.map((_, index) => {
      const material = this._mobilePerformanceMode
        ? new THREE.MeshBasicMaterial({
            color: 0xdce3e8,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        : this._surfaceMaterial({
            color: 0xdce3e8,
            emissive: 0x080c12,
            emissiveIntensity: 0.08,
            roughness: 0.24,
            metalness: 0.9,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            envMap: this._metalEnvMap.texture,
            envMapIntensity: 1.35,
          });
      const ghost = new THREE.Mesh(
        ghostGeometry,
        material
      );
      const scale = [1, 1, 0.92, 0.74, 0.54, 0.34][index];
      ghost.scale.setScalar(scale);
      ghost.visible = false;
      ghost.renderOrder = 2;
      this.scene.add(ghost);
      return ghost;
    });
  }

  _createBallShadow(source, opacity, scaleX, scaleY) {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        color: 0x00030c,
        map: this._glowTexture,
        transparent: true,
        opacity,
        depthWrite: false,
      })
    );
    shadow.position.z = 0.34;
    shadow.scale.set(scaleX, scaleY, 1);
    shadow.userData = { source, opacity, scaleX, scaleY };
    this.scene.add(shadow);
    return shadow;
  }

  _initHole() {
    this._holeGroup = new THREE.Group();
    this.scene.add(this._holeGroup);
  }

  _initTraps() {
    this._trapGroup = new THREE.Group();
    this._trapMeshes = [];
    this._trapSignature = '';
    this.scene.add(this._trapGroup);
  }

  _initStars() {
    this._starGroup = new THREE.Group();
    this._starMeshes = [];
    this._starSignature = '';
    this.scene.add(this._starGroup);
  }

  _initPortals() {
    this._portalGroup = new THREE.Group();
    this._portalMeshes = [];
    this._portalSignature = '';
    this.scene.add(this._portalGroup);
  }

  _initRotatingGates() {
    this._rotatingGateGroup = new THREE.Group();
    this._rotatingGateMeshes = [];
    this._rotatingGateSignature = '';
    this.scene.add(this._rotatingGateGroup);
  }

  _initMovingTraps() {
    this._patrolTrackGroup = new THREE.Group();
    this._patrolTrackSignature = null;
    this._movingTrapGroup = new THREE.Group();
    this._movingTrapMeshes = new Map();
    this.scene.add(this._patrolTrackGroup);
    this.scene.add(this._movingTrapGroup);
  }

  _buildHole(cx, cy, level) {
    while (this._holeGroup.children.length) {
      const child = this._holeGroup.children[0];
      this._disposeObject(child);
      this._holeGroup.remove(child);
    }

    const color = new THREE.Color(level.color);
    const rimR = CELL_SIZE * 0.42;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(rimR * 1.68, this._segments(80, 40)),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    shadow.position.set(3.6, -3.6, 0.14);
    this._holeGroup.add(shadow);

    this._holeGlow = new THREE.Mesh(
      new THREE.CircleGeometry(rimR * 1.96, this._segments(88, 44)),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this._holeGlow.position.z = 0.12;
    this._holeGroup.add(this._holeGlow);

    this._holeRim = new THREE.Mesh(
      new THREE.TorusGeometry(rimR * 1.1, 3.35, this._segments(22, 12), this._segments(96, 48)),
      this._surfaceMaterial({
        color: 0x8f9ba7,
        emissive: 0x050608,
        emissiveIntensity: 0.2,
        roughness: 0.18,
        metalness: 0.96,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        envMap: this._metalEnvMap.texture,
        envMapIntensity: 1.85,
      })
    );
    this._holeRim.position.z = 1.8;
    this._holeGroup.add(this._holeRim);

    this._holeInnerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(rimR * 0.96, rimR * 0.72, 10, this._segments(96, 48), 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x111722,
        roughness: 0.48,
        metalness: 0.54,
        side: THREE.DoubleSide,
      })
    );
    this._holeInnerWall.rotation.x = Math.PI / 2;
    this._holeInnerWall.position.z = 0.78;
    this._holeGroup.add(this._holeInnerWall);

    this._holeInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(rimR * 0.54, rimR * 0.94, this._segments(96, 48)),
      new THREE.MeshBasicMaterial({
        color: 0x101722,
        transparent: true,
        opacity: 0.94,
      })
    );
    this._holeInnerRing.position.z = 0.66;
    this._holeGroup.add(this._holeInnerRing);

    this._holeCore = new THREE.Mesh(
      new THREE.CircleGeometry(rimR * 0.6, this._segments(96, 48)),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    this._holeCore.position.z = 0.72;
    this._holeGroup.add(this._holeCore);

    this._holeEdgeLight = new THREE.Mesh(
      new THREE.TorusGeometry(rimR * 1.06, 0.86, this._segments(14, 8), this._segments(96, 48)),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this._holeEdgeLight.position.z = 2.2;
    this._holeGroup.add(this._holeEdgeLight);

    this._holeLock = new THREE.Group();
    const lockMaterial = new THREE.MeshBasicMaterial({
      color: 0xa6b6ca,
      transparent: true,
      opacity: 0.72,
    });
    [-1, 1].forEach((direction) => {
      const bar = new THREE.Mesh(
        new RoundedBoxGeometry(rimR * 1.05, 2.4, 2.4, 2, this._segments(3, 2)),
        lockMaterial.clone()
      );
      bar.rotation.z = direction * Math.PI / 4;
      bar.position.z = 2.7;
      this._holeLock.add(bar);
    });
    this._holeGroup.add(this._holeLock);

    const pos = this._p(cx, cy);
    this._holeGroup.position.set(pos.x, pos.y, 0.5);
    this._goalUnlocked = null;
  }

  _findGoal(grid) {
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (grid[row][col] === CELL.GOAL) {
          return {
            x: col * CELL_SIZE + CELL_SIZE / 2,
            y: row * CELL_SIZE + CELL_SIZE / 2,
          };
        }
      }
    }
    return null;
  }

  _clearTrapHoles() {
    while (this._trapGroup.children.length) {
      const child = this._trapGroup.children[0];
      child.traverse((node) => {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) {
          node.material.forEach(material => material.dispose());
        } else {
          node.material?.dispose();
        }
      });
      this._trapGroup.remove(child);
    }
    this._trapMeshes = [];
  }

  _buildTrapHoles(grid) {
    this._clearTrapHoles();

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (grid[row][col] !== CELL.TRAP) continue;
        this._trapGroup.add(this._createTrapHole(col, row));
      }
    }
  }

  _createTrapHole(col, row, options = {}) {
    const group = new THREE.Group();
    const rimR = CELL_SIZE * 0.36;
    const isChase = options.kind === 'chase';
    const danger = new THREE.Color(options.color || (isChase ? CHASE_TRAP_GLOW : STATIC_TRAP_GLOW));

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(rimR * 1.56, this._segments(48, 24)),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
      })
    );
    shadow.position.set(3, -3, 0.12);
    group.add(shadow);

    let glow = null;
    if (!this._mobilePerformanceMode) {
      glow = new THREE.Mesh(
        new THREE.RingGeometry(rimR * 0.92, rimR * 1.58, this._segments(48, 24)),
        new THREE.MeshBasicMaterial({
          color: danger,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.z = 0.18;
      group.add(glow);
    }

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(rimR * 1.04, 2.4, this._segments(12, 8), this._segments(56, 28)),
      this._mobilePerformanceMode
        ? new THREE.MeshBasicMaterial({ color: isChase ? CHASE_TRAP_EMISSIVE : STATIC_TRAP_EMISSIVE })
        : this._surfaceMaterial({
            color: isChase ? CHASE_TRAP_RIM : STATIC_TRAP_RIM,
            emissive: isChase ? CHASE_TRAP_EMISSIVE : STATIC_TRAP_EMISSIVE,
            emissiveIntensity: options.dynamic ? 0.52 : 0.36,
            roughness: 0.3,
            metalness: 0.76,
            clearcoat: 0.9,
            clearcoatRoughness: 0.18,
            envMap: this._metalEnvMap.texture,
            envMapIntensity: 0.82,
          })
    );
    rim.position.z = 1.2;
    group.add(rim);

    if (!this._mobilePerformanceMode) {
      const innerRing = new THREE.Mesh(
        new THREE.RingGeometry(rimR * 0.4, rimR * 0.92, this._segments(56, 28)),
        new THREE.MeshBasicMaterial({ color: isChase ? CHASE_TRAP_INNER : STATIC_TRAP_INNER })
      );
      innerRing.position.z = 0.58;
      group.add(innerRing);
    }

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(rimR * 0.48, this._segments(56, 28)),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    core.position.z = 0.64;
    group.add(core);

    const vortexScales = this._mobilePerformanceMode ? [0.62] : [0.7, 0.52, 0.34];
    const vortex = vortexScales.map((scale, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(rimR * scale, 0.56 - index * 0.09, this._segments(7, 5), this._segments(40, 20)),
        new THREE.MeshBasicMaterial({
          color: index === 1 ? (isChase ? CHASE_TRAP_ACCENT : STATIC_TRAP_ACCENT) : danger,
          transparent: true,
          opacity: 0.44 - index * 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ring.position.z = 0.92 + index * 0.08;
      group.add(ring);
      return ring;
    });

    group.position.copy(this._p(
      col * CELL_SIZE + CELL_SIZE / 2,
      row * CELL_SIZE + CELL_SIZE / 2,
      0.48
    ));
    group.userData = {
      glow,
      rim,
      vortex,
      dynamic: Boolean(options.dynamic),
      kind: options.kind || 'static',
      spawnFlash: 0,
      phase: (row * GRID + col) * 0.37,
    };
    if (!options.dynamic) this._trapMeshes.push(group);
    return group;
  }

  _syncTrapHoles(grid) {
    const signature = this._getCellSignature(grid, CELL.TRAP);
    if (signature === this._trapSignature) return;
    this._trapSignature = signature;
    this._buildTrapHoles(grid);
  }

  _syncStars(grid) {
    const signature = this._getCellSignature(grid, CELL.STAR);
    if (signature === this._starSignature) return;
    this._starSignature = signature;
    this._disposeGroupChildren(this._starGroup);
    this._starMeshes = [];

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (grid[row][col] !== CELL.STAR) continue;
        this._starGroup.add(this._createStar(col, row));
      }
    }
  }

  _createStar(col, row) {
    const group = new THREE.Group();
    const coin = new THREE.Group();
    const faceMaterial = this._surfaceMaterial({
      color: 0xffd83d,
      emissive: 0xffb300,
      emissiveIntensity: 0.54,
      roughness: 0.14,
      metalness: 0.82,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMap: this._metalEnvMap.texture,
      envMapIntensity: 1.85,
    });
    const rimMaterial = this._surfaceMaterial({
      color: 0xffc82e,
      emissive: 0xff9f1a,
      emissiveIntensity: 0.64,
      roughness: 0.12,
      metalness: 0.9,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      envMap: this._metalEnvMap.texture,
      envMapIntensity: 1.95,
    });

    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(11.4, 11.4, 3.4, this._segments(88, 44), 1, false),
      faceMaterial
    );
    face.rotation.x = Math.PI / 2;
    face.castShadow = !this._mobilePerformanceMode;
    coin.add(face);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(9.3, 1.05, this._segments(22, 12), this._segments(88, 44)),
      rimMaterial
    );
    rim.position.z = 1.7;
    rim.castShadow = !this._mobilePerformanceMode;
    coin.add(rim);

    const groove = new THREE.Mesh(
      new THREE.TorusGeometry(5.35, 0.48, this._segments(16, 8), this._segments(72, 36)),
      this._surfaceMaterial({
        color: 0xf5b51d,
        emissive: 0xffa000,
        emissiveIntensity: 0.38,
        roughness: 0.16,
        metalness: 0.82,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMap: this._metalEnvMap.texture,
        envMapIntensity: 1.55,
      })
    );
    groove.position.z = 1.92;
    coin.add(groove);

    const shine = new THREE.Mesh(
      new RoundedBoxGeometry(2.4, 8.4, 0.82, this._segments(4, 2), 0.55),
      new THREE.MeshBasicMaterial({
        color: 0xffffc7,
        transparent: true,
        opacity: this._mobilePerformanceMode ? 0.48 : 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    shine.position.set(-2.8, 0.8, 2.25);
    shine.rotation.z = -0.42;
    coin.add(shine);

    group.add(coin);

    let glow = null;
    if (!this._mobilePerformanceMode) {
      glow = new THREE.Mesh(
        new THREE.RingGeometry(11.2, 17.5, this._segments(72, 36)),
        new THREE.MeshBasicMaterial({
          color: 0xffe35b,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.z = -1.8;
      group.add(glow);
    }
    group.position.copy(this._p(
      col * CELL_SIZE + CELL_SIZE / 2,
      row * CELL_SIZE + CELL_SIZE / 2,
      8
    ));
    group.userData = { star: coin, glow, phase: (row * GRID + col) * 0.41 };
    this._starMeshes.push(group);
    return group;
  }

  _syncPortals(portals = []) {
    const activePortals = portals.filter(portal => portal.active);
    const signature = activePortals
      .map(portal => `${portal.id}:${portal.x.toFixed(1)},${portal.y.toFixed(1)}`)
      .join('|');
    if (signature === this._portalSignature) return;
    this._portalSignature = signature;
    this._disposeGroupChildren(this._portalGroup);
    this._portalMeshes = [];

    activePortals.forEach((portal, index) => {
      const mesh = this._createPortal(portal, index);
      this._portalMeshes.push(mesh);
      this._portalGroup.add(mesh);
    });
  }

  _createPortal(portal, index = 0) {
    const group = new THREE.Group();
    const rimR = CELL_SIZE * 0.38;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(rimR * 1.65, this._segments(48, 24)),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      })
    );
    shadow.position.set(3.2, -3.2, 0.1);
    group.add(shadow);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(rimR * 0.92, rimR * 1.75, this._segments(56, 28)),
      new THREE.MeshBasicMaterial({
        color: PORTAL_GLOW,
        transparent: true,
        opacity: this._mobilePerformanceMode ? 0.2 : 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    aura.position.z = 0.16;
    group.add(aura);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(rimR * 1.04, 2.7, this._segments(14, 8), this._segments(64, 32)),
      this._mobilePerformanceMode
        ? new THREE.MeshBasicMaterial({ color: PORTAL_GLOW })
        : this._surfaceMaterial({
            color: PORTAL_RIM,
            emissive: PORTAL_GLOW,
            emissiveIntensity: 0.55,
            roughness: 0.25,
            metalness: 0.82,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            envMap: this._metalEnvMap.texture,
            envMapIntensity: 1.35,
          })
    );
    rim.position.z = 1.9;
    group.add(rim);

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(rimR * 0.84, this._segments(56, 28)),
      new THREE.MeshBasicMaterial({
        color: PORTAL_CORE,
        transparent: true,
        opacity: 0.96,
      })
    );
    core.position.z = 0.72;
    group.add(core);

    const rings = [];
    for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(
          rimR * (0.25 + ringIndex * 0.17),
          rimR * (0.32 + ringIndex * 0.17),
          this._segments(44, 22)
        ),
        new THREE.MeshBasicMaterial({
          color: ringIndex % 2 === 0 ? 0x8dffb1 : PORTAL_GLOW,
          transparent: true,
          opacity: 0.5 - ringIndex * 0.09,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      ring.position.z = 0.92 + ringIndex * 0.06;
      rings.push(ring);
      group.add(ring);
    }

    group.position.copy(this._p(portal.x, portal.y, 0.56));
    group.userData = {
      aura,
      rim,
      rings,
      phase: (portal.phase || 0) + index * 0.83,
    };
    return group;
  }

  _syncRotatingGates(gates = []) {
    const signature = gates
      .map(gate => `${gate.id}:${gate.stateIndex}:${(gate.activeCells || []).map(cell => `${cell.col},${cell.row}`).join(';')}`)
      .join('|');
    if (signature === this._rotatingGateSignature) return;
    this._rotatingGateSignature = signature;
    this._disposeGroupChildren(this._rotatingGateGroup);
    this._rotatingGateMeshes = [];

    gates.forEach((gate, index) => {
      const mesh = this._createRotatingGate(gate, index);
      this._rotatingGateMeshes.push(mesh);
      this._rotatingGateGroup.add(mesh);
    });
  }

  _createRotatingGate(gate, index = 0) {
    const group = new THREE.Group();
    const zoneMaterial = new THREE.MeshBasicMaterial({
      color: ROTATING_GATE_ZONE,
      transparent: true,
      opacity: this._mobilePerformanceMode ? 0.28 : 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: ROTATING_GATE_GLOW,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
    });
    const lineGlowMaterial = new THREE.MeshBasicMaterial({
      color: ROTATING_GATE_ZONE,
      transparent: true,
      opacity: this._mobilePerformanceMode ? 0.16 : 0.22,
      depthWrite: false,
    });

    (gate.activeCells || []).forEach((cell) => {
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE * 0.84, CELL_SIZE * 0.84),
        zoneMaterial.clone()
      );
      tile.position.copy(this._p(
        cell.col * CELL_SIZE + CELL_SIZE / 2,
        cell.row * CELL_SIZE + CELL_SIZE / 2,
        2.45
      ));
      tile.userData.gateRole = 'zone';
      group.add(tile);
    });

    (gate.activeBars || []).forEach((bar) => {
      const [from, to] = bar;
      const fromX = from.col * CELL_SIZE + CELL_SIZE / 2;
      const fromY = from.row * CELL_SIZE + CELL_SIZE / 2;
      const toX = to.col * CELL_SIZE + CELL_SIZE / 2;
      const toY = to.row * CELL_SIZE + CELL_SIZE / 2;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const length = Math.sqrt(dx * dx + dy * dy) + CELL_SIZE * 0.76;
      const glowLine = new THREE.Mesh(
        new RoundedBoxGeometry(length, 14, 1.8, this._segments(3, 2), 4.2),
        lineGlowMaterial.clone()
      );
      glowLine.position.copy(this._p((fromX + toX) / 2, (fromY + toY) / 2, 8.7));
      glowLine.rotation.z = -Math.atan2(dy, dx);
      glowLine.userData.gateRole = 'line-glow';
      group.add(glowLine);

      const line = new THREE.Mesh(
        new RoundedBoxGeometry(length, 8.8, 2.8, this._segments(3, 2), 3),
        lineMaterial.clone()
      );
      line.position.copy(this._p((fromX + toX) / 2, (fromY + toY) / 2, 9.2));
      line.rotation.z = -Math.atan2(dy, dx);
      line.userData.gateRole = 'line';
      group.add(line);
    });

    const pivot = gate.pivot || {};
    const pivotX = (pivot.col ?? 0) * CELL_SIZE + CELL_SIZE / 2;
    const pivotY = (pivot.row ?? 0) * CELL_SIZE + CELL_SIZE / 2;
    const pivotHalo = new THREE.Mesh(
      new THREE.CircleGeometry(15.5, this._segments(36, 18)),
      new THREE.MeshBasicMaterial({
        color: ROTATING_GATE_GLOW,
        transparent: true,
        opacity: this._mobilePerformanceMode ? 0.12 : 0.18,
        depthWrite: false,
      })
    );
    pivotHalo.position.copy(this._p(pivotX, pivotY, 10));
    pivotHalo.userData.gateRole = 'hub-glow';
    group.add(pivotHalo);

    const pivotRim = new THREE.Mesh(
      new THREE.RingGeometry(7.4, 11.2, this._segments(34, 18)),
      new THREE.MeshBasicMaterial({
        color: ROTATING_GATE_GLOW,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      })
    );
    pivotRim.position.copy(this._p(pivotX, pivotY, 10.25));
    pivotRim.userData.gateRole = 'hub-rim';
    group.add(pivotRim);

    const pivotDot = new THREE.Mesh(
      new THREE.CircleGeometry(5.8, this._segments(28, 16)),
      new THREE.MeshBasicMaterial({
        color: 0xfff0a6,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    pivotDot.position.copy(this._p(pivotX, pivotY, 10.45));
    pivotDot.userData.gateRole = 'hub';
    group.add(pivotDot);

    group.userData = { phase: index * 0.9 };
    return group;
  }

  _syncMovingTraps(movingTraps) {
    const syncToken = ++this._movingTrapSyncToken;

    for (let index = 0; index < movingTraps.length; index++) {
      const trap = movingTraps[index];
      if (!trap.active) continue;
      let mesh = this._movingTrapMeshes.get(trap.id);
      if (!mesh) {
        mesh = this._createTrapHole(0, 0, {
          dynamic: true,
          kind: trap.kind,
          color: trap.kind === 'chase' ? CHASE_TRAP_GLOW : STATIC_TRAP_GLOW,
        });
        this._movingTrapMeshes.set(trap.id, mesh);
        this._movingTrapGroup.add(mesh);
      }
      mesh.position.set(trap.x - HW, HH - trap.y, 0.58);
      mesh.userData.syncToken = syncToken;
      mesh.userData.spawnFlash = trap.spawnFlash || 0;
      trap.spawnFlash = Math.max(0, (trap.spawnFlash || 0) - 0.035);
    }

    for (const [id, mesh] of this._movingTrapMeshes) {
      if (mesh.userData.syncToken === syncToken) continue;
      this._disposeObject(mesh);
      this._movingTrapGroup.remove(mesh);
      this._movingTrapMeshes.delete(id);
    }
  }

  _syncPatrolTracks() {
    if (this._patrolTrackSignature !== null) return;
    this._patrolTrackSignature = '';
    this._disposeGroupChildren(this._patrolTrackGroup);
  }

  _getCellSignature(grid, cellType) {
    const cells = [];
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        if (grid[row][col] === cellType) cells.push(`${col},${row}`);
      }
    }
    return cells.join('|');
  }

  _disposeGroupChildren(group) {
    while (group.children.length) {
      const child = group.children[0];
      this._disposeObject(child);
      group.remove(child);
    }
  }

  _disposeObject(object) {
    object.traverse((node) => {
      node.geometry?.dispose();
      if (Array.isArray(node.material)) node.material.forEach(material => material.dispose());
      else node.material?.dispose();
    });
  }

  addFlash(col, row) {
    this._hitFlash = 6;

    const pos = this._lastBallPos || { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
    const ripple = this._ripples[this._rippleCursor++ % this._ripples.length];
    ripple.life = 1;
    ripple.mesh.visible = true;
    ripple.mesh.position.copy(this._p(pos.x, pos.y, 0.52));
    ripple.mesh.scale.set(0.42, 0.42, 1);
    ripple.mesh.material.color.copy(this._levelColor);
    ripple.mesh.material.opacity = 0.62;
  }

  notifyStarCollected(col, row) {
    const ripple = this._ripples[this._rippleCursor++ % this._ripples.length];
    ripple.life = 1;
    ripple.mesh.visible = true;
    ripple.mesh.position.copy(this._p(
      col * CELL_SIZE + CELL_SIZE / 2,
      row * CELL_SIZE + CELL_SIZE / 2,
      0.56
    ));
    ripple.mesh.scale.set(0.5, 0.5, 1);
    ripple.mesh.material.color.set(0xffdf4d);
    ripple.mesh.material.opacity = 0.82;
  }

  notifyPortalsActivated(portals = []) {
    portals.forEach((portal, index) => {
      const ripple = this._ripples[this._rippleCursor++ % this._ripples.length];
      ripple.life = 1;
      ripple.mesh.visible = true;
      ripple.mesh.position.copy(this._p(portal.x, portal.y, 0.58 + index * 0.02));
      ripple.mesh.scale.set(0.5, 0.5, 1);
      ripple.mesh.material.color.set(PORTAL_GLOW);
      ripple.mesh.material.opacity = 0.82;
    });
  }

  notifyPortalJump(fromX, fromY, toX, toY) {
    [
      { x: fromX, y: fromY, scale: 0.48 },
      { x: toX, y: toY, scale: 0.62 },
    ].forEach((point, index) => {
      const ripple = this._ripples[this._rippleCursor++ % this._ripples.length];
      ripple.life = 1 - index * 0.08;
      ripple.mesh.visible = true;
      ripple.mesh.position.copy(this._p(point.x, point.y, 0.6 + index * 0.03));
      ripple.mesh.scale.set(point.scale, point.scale, 1);
      ripple.mesh.material.color.set(index === 0 ? 0x8dffb1 : PORTAL_GLOW);
      ripple.mesh.material.opacity = 0.9 - index * 0.08;
    });
  }

  notifyTrapSuction(x, y) {
    [0.56, 0.34].forEach((scale, index) => {
      const ripple = this._ripples[this._rippleCursor++ % this._ripples.length];
      ripple.life = 1 - index * 0.16;
      ripple.mesh.visible = true;
      ripple.mesh.position.copy(this._p(x, y, 0.62 + index * 0.03));
      ripple.mesh.scale.set(scale, scale, 1);
      ripple.mesh.material.color.set(index === 0 ? 0x54dcff : 0x7964ff);
      ripple.mesh.material.opacity = 0.9 - index * 0.16;
    });
  }

  resetLevelEffects() {
    this._currentLevel = -1;
    this._goalPos = null;
    this._gridRevision = -1;
    this._activeGrid = null;
    this._trapSignature = null;
    this._starSignature = null;
    this._portalSignature = null;
    this._rotatingGateSignature = null;
    this._trailReady = false;
    this._trailTick = 0;
    this._hitFlash = 0;
    this._clearTrapHoles();
    this._disposeGroupChildren(this._starGroup);
    this._starMeshes = [];
    this._disposeGroupChildren(this._portalGroup);
    this._portalMeshes = [];
    this._disposeGroupChildren(this._rotatingGateGroup);
    this._rotatingGateMeshes = [];
    this._disposeGroupChildren(this._movingTrapGroup);
    this._disposeGroupChildren(this._patrolTrackGroup);
    this._patrolTrackSignature = null;
    this._movingTrapMeshes.clear();
    this._trailGhosts.forEach((ghost) => { ghost.visible = false; });
    this._ripples.forEach((ripple) => {
      ripple.life = 0;
      ripple.mesh.visible = false;
    });
  }

  resize() {
    const wrapper = document.getElementById('canvas-wrapper');
    const availableW = wrapper?.clientWidth > 0 ? wrapper.clientWidth - 44 : window.innerWidth * 0.88;
    const availableH = wrapper?.clientHeight > 0 ? wrapper.clientHeight - 32 : window.innerHeight - 160;
    const maxW = Math.min(window.innerWidth * 0.9, availableW);
    const maxH = Math.min(window.innerHeight - 150, availableH);
    const scale = Math.max(0.25, Math.min(maxW / MAZE, maxH / MAZE));
    this.scale = scale;
    this.gl.setSize(Math.floor(MAZE * scale), Math.floor(MAZE * scale));
  }

  _setPixelRatio(ratio) {
    const minRatio = Math.min(MOBILE_MIN_PIXEL_RATIO, this._maxPixelRatio);
    const nextRatio = Math.max(
      minRatio,
      Math.min(this._maxPixelRatio, Math.round(ratio * 100) / 100)
    );
    if (nextRatio === this._pixelRatio) return false;
    this._pixelRatio = nextRatio;
    this.gl.setPixelRatio(this._pixelRatio);
    this.resize();
    return true;
  }

  _updateAdaptiveQuality(now, frameMs) {
    if (!this._mobilePerformanceMode) return;
    this._frameTimeEma += (frameMs - this._frameTimeEma) * 0.06;
    const elapsed = now - this._lastResolutionAdjustTime;
    let nextRatio = this._pixelRatio;

    if (this._frameTimeEma > 21 && elapsed >= 1600) {
      nextRatio = Math.max(MOBILE_MIN_PIXEL_RATIO, this._pixelRatio - 0.05);
    } else if (this._frameTimeEma < 18 && elapsed >= 1800) {
      nextRatio = Math.min(MOBILE_MAX_PIXEL_RATIO, this._pixelRatio + 0.05);
    }

    if (this._setPixelRatio(nextRatio)) this._lastResolutionAdjustTime = now;
  }

  draw(levelIndex, ball, gx, gy, goalUnlocked = true, movingTraps = [], grid = null, gridRevision = 0, portals = [], rotatingGates = []) {
    const now = performance.now();
    const frameMs = this._lastFrameTime > 0
      ? Math.min(50, Math.max(1, now - this._lastFrameTime))
      : 1000 / 60;
    this._lastFrameTime = now;
    this._updateAdaptiveQuality(now, frameMs);
    this.time += frameMs / 1000;
    const level = LEVELS[levelIndex];
    const activeGrid = grid || level.grid;

    if (levelIndex !== this._currentLevel) {
      this._currentLevel = levelIndex;
      if (this._mobilePerformanceMode) {
        if (this._pixelRatio < MOBILE_LEVEL_PIXEL_RATIO) {
          this._setPixelRatio(Math.min(MOBILE_LEVEL_PIXEL_RATIO, this._maxPixelRatio));
        }
        this._frameTimeEma = 1000 / 60;
        this._lastResolutionAdjustTime = now;
      }
      this._buildWalls(level);
      this._goalPos = null;
      this._trailReady = false;
      this._ballLight.color.set(level.color);
      this._ballHalo.material.color.set(level.color);
      this._trayMat.color.set(level.color).lerp(new THREE.Color(0x7be4ff), 0.4);
      this._trayGlowMat.color.set(level.color);
      this._frameMat.color.set(level.color).lerp(new THREE.Color(0xd7f8ff), 0.64);
      this._floorMat.color.set(level.color).lerp(new THREE.Color(0xe4f8ff), 0.38);
      this._gridMat.color.set(level.color).lerp(new THREE.Color(0xc7f5ff), 0.68);
      this._lightPools[this._lightPools.length - 1].material.color.set(level.color);
      this._updateFloorTiles(level);
      this.scene.background = new THREE.Color(level.color).lerp(new THREE.Color(0x061341), 0.88);
    }

    const gridChanged = activeGrid !== this._activeGrid || gridRevision !== this._gridRevision;
    if (gridChanged) {
      this._activeGrid = activeGrid;
      this._gridRevision = gridRevision;
      this._syncTrapHoles(activeGrid);
      this._syncStars(activeGrid);

      const goal = this._findGoal(activeGrid);
      if (goal && (!this._goalPos || this._goalPos.x !== goal.x || this._goalPos.y !== goal.y)) {
        this._goalPos = goal;
        this._buildHole(goal.x, goal.y, level);
      }
    }

    this._syncPortals(portals);
    this._syncRotatingGates(rotatingGates);
    this._syncMovingTraps(movingTraps);
    this._syncPatrolTracks(movingTraps);

    this._setGoalUnlocked(goalUnlocked);

    const updateDecorativeEffects = !this._mobilePerformanceMode || this._decorativeFrame++ % 2 === 0;
    if (updateDecorativeEffects) this._updateAmbientLights();
    this._updateBall(ball);
    this._updateEffects();
    if (updateDecorativeEffects) {
      this._updateTrapHoles();
      this._updateStars();
      this._updatePortals();
      this._updateRotatingGateVisuals();

      if (this._holeRim) {
        this._holeRim.rotation.z += 0.002;
        this._holeEdgeLight.material.opacity = this._goalUnlocked
          ? 0.25 + Math.sin(this.time * 2.4) * 0.1
          : 0.06;
        this._holeGlow.material.opacity = this._goalUnlocked
          ? 0.055 + Math.sin(this.time * 2.1) * 0.018
          : 0.018;
        const pulse = 1 + Math.sin(this.time * 2.4) * 0.08;
        this._holeGlow.scale.set(pulse, pulse, 1);
      }

      this._trayGlowMat.opacity = 0.1 + Math.sin(this.time * 1.8) * 0.025;
      if (this._wallMesh) {
        this._wallMesh.material.emissiveIntensity = 0.12 + Math.sin(this.time * 1.5) * 0.025 + this._hitFlash * 0.035;
        if (!this._mobilePerformanceMode) {
          this._wallCapMesh.material.opacity = 0.25 + Math.sin(this.time * 1.8) * 0.035;
        }
      }
    }
    this.gl.render(this.scene, this.cam);
  }

  _setGoalUnlocked(unlocked) {
    if (!this._holeRim || !this._holeEdgeLight || !this._holeLock) return;
    if (this._goalUnlocked === unlocked) return;
    this._goalUnlocked = unlocked;
    this._holeLock.visible = false;
    this._holeRim.material.color.set(0x8f9ba7);
    this._holeRim.material.emissive.set(0x050608);
    this._holeEdgeLight.material.opacity = 0.42;
  }

  _updateAmbientLights() {
    const orbit = this.time * 0.42;
    const sweepX = Math.cos(orbit) * HW * 0.76;
    const sweepY = Math.sin(orbit * 1.18) * HH * 0.7;
    this._orbitKey.position.set(sweepX, sweepY, 175 + Math.sin(orbit * 1.7) * 24);

    if (!this._mobilePerformanceMode) {
      const accentA = this._accentLights[0];
      const accentB = this._accentLights[1];
      accentA.position.set(
        Math.cos(orbit + Math.PI * 0.75) * HW * 0.92,
        Math.sin(orbit * 0.86 + Math.PI * 0.75) * HH * 0.9,
        92
      );
      accentB.position.set(
        Math.cos(orbit + Math.PI * 1.6) * HW * 0.9,
        Math.sin(orbit * 1.08 + Math.PI * 1.6) * HH * 0.86,
        86
      );
    }

    this._lightPools.forEach((pool, index) => {
      const source = this._lightPoolSources[index];
      pool.position.set(source.x, source.y, 0.18);
      const pulse = 1 + Math.sin(this.time * (1.2 + index * 0.16) + index) * 0.12;
      pool.scale.setScalar(pool.userData.baseScale * pulse);
    });
  }

  _updateEffects() {
    for (let index = 0; index < this._ripples.length; index++) {
      const ripple = this._ripples[index];
      if (ripple.life <= 0) continue;

      ripple.life = Math.max(0, ripple.life - 0.045);
      const progress = 1 - ripple.life;
      const size = 0.42 + progress * 3.2;
      ripple.mesh.scale.set(size, size, 1);
      ripple.mesh.material.opacity = ripple.life * 0.58;
      ripple.mesh.visible = ripple.life > 0;
    }
  }

  _updateTrapHoles() {
    let index = 0;
    for (const trap of this._trapMeshes) this._updateTrapHole(trap, index++);
    for (const trap of this._movingTrapMeshes.values()) this._updateTrapHole(trap, index++);
  }

  _updateTrapHole(trap, index) {
    const { glow, rim, vortex, phase, dynamic, kind, spawnFlash } = trap.userData;
    const speed = dynamic ? 4.9 : 3.4;
    const wave = Math.sin(this.time * speed + phase);
    const pulse = 1 + wave * (dynamic ? 0.12 : 0.09) + spawnFlash * 0.22;

    if (glow) {
      glow.scale.set(pulse, pulse, 1);
      glow.material.opacity = 0.14 + wave * 0.045 + spawnFlash * 0.24;
    }
    rim.rotation.z += (kind === 'chase' ? 0.015 : 0.006) + index * 0.0006;
    for (let ringIndex = 0; ringIndex < vortex.length; ringIndex++) {
      const ring = vortex[ringIndex];
      ring.rotation.z += (ringIndex % 2 === 0 ? 1 : -1) * (dynamic ? 0.024 : 0.016 + ringIndex * 0.006);
      const ringPulse = 1 + Math.sin(this.time * (4.2 + ringIndex) + phase) * 0.08;
      ring.scale.set(ringPulse, ringPulse, 1);
    }
  }

  _updateStars() {
    for (let index = 0; index < this._starMeshes.length; index++) {
      const group = this._starMeshes[index];
      const { star, glow, phase } = group.userData;
      const float = Math.sin(this.time * 3 + phase);
      group.position.z = 8 + float * 2.4;
      star.rotation.z += 0.018;
      star.rotation.y = Math.sin(this.time * 1.8 + phase) * 0.24;
      const pulse = 1 + float * 0.1;
      if (glow) {
        glow.scale.set(pulse, pulse, 1);
        glow.material.opacity = 0.19 + float * 0.07;
      }
    }
  }

  _updatePortals() {
    for (let index = 0; index < this._portalMeshes.length; index++) {
      const portal = this._portalMeshes[index];
      const { aura, rim, rings, phase } = portal.userData;
      const wave = Math.sin(this.time * 3.4 + phase);
      const pulse = 1 + wave * 0.08;
      portal.position.z = 0.56 + wave * 0.12;
      aura.scale.set(pulse, pulse, 1);
      aura.material.opacity = (this._mobilePerformanceMode ? 0.18 : 0.28) + wave * 0.08;
      rim.rotation.z += 0.014 + index * 0.003;
      rings.forEach((ring, ringIndex) => {
        ring.rotation.z += (ringIndex % 2 === 0 ? 1 : -1) * (0.024 + ringIndex * 0.008);
        const ringPulse = 1 + Math.sin(this.time * (4.1 + ringIndex) + phase) * 0.12;
        ring.scale.set(ringPulse, ringPulse, 1);
      });
    }
  }

  _updateRotatingGateVisuals() {
    for (let index = 0; index < this._rotatingGateMeshes.length; index++) {
      const gate = this._rotatingGateMeshes[index];
      const wave = Math.sin(this.time * 7.2 + gate.userData.phase);
      gate.children.forEach((child) => {
        if (!child.material) return;
        const role = child.userData.gateRole;
        if (role === 'zone') {
          child.material.opacity = (this._mobilePerformanceMode ? 0.24 : 0.3) + Math.max(0, wave) * 0.08;
        } else if (role === 'line-glow') {
          child.material.opacity = (this._mobilePerformanceMode ? 0.12 : 0.18) + Math.max(0, wave) * 0.1;
        } else if (role === 'hub-glow') {
          const pulse = 1 + Math.max(0, wave) * 0.12;
          child.scale.set(pulse, pulse, 1);
          child.material.opacity = (this._mobilePerformanceMode ? 0.1 : 0.16) + Math.max(0, wave) * 0.08;
        } else if (role === 'hub-rim') {
          child.rotation.z -= 0.018;
          child.material.opacity = 0.72 + Math.max(0, wave) * 0.16;
        } else {
          child.material.opacity = 0.9 + Math.max(0, wave) * 0.08;
        }
      });
    }
  }

  _updateBall(ball) {
    const pos = ball.getDrawPos(this._drawPos);
    this._lastBallPos.x = pos.x;
    this._lastBallPos.y = pos.y;

    if (ball.falling) {
      const progress = ball.fallProgress;
      const scale = Math.max(0.01, 1 - progress);
      const isTrap = ball.fallType === 'trap';
      const swirlRadius = isTrap ? Math.sin(Math.min(1, progress) * Math.PI) * 8 : 0;
      const swirlAngle = progress * Math.PI * 6;
      this._ballGroup.scale.set(scale, scale, Math.max(0.01, 1 - progress * 1.5));
      this._scratchBallPoint.set(
        pos.x - HW + Math.cos(swirlAngle) * swirlRadius,
        HH - pos.y + Math.sin(swirlAngle) * swirlRadius,
        BALL_Z - 40 * progress * progress
      );
      this._ballGroup.position.copy(this._scratchBallPoint);
      this._ballGroup.rotation.z += isTrap ? 0.18 + progress * 0.24 : 0.04;
      this.ball3D.material.emissive.set(isTrap ? 0x1f9dff : this._levelColor);
      this.ball3D.material.emissiveIntensity = progress * (isTrap ? 0.7 : 0.45);
      for (let index = 0; index < this._ballShadows.length; index++) {
        this._ballShadows[index].visible = false;
      }
      this._ballHalo.visible = false;
      for (let index = 0; index < this._trailGhosts.length; index++) {
        this._trailGhosts[index].visible = false;
      }
      if (!this._mobilePerformanceMode) {
        this._ballLight.color.set(isTrap ? 0x1f9dff : this._levelColor);
        this._ballLight.intensity = 2.2 * scale;
        this._ballLight.position.copy(this._ballGroup.position);
      }
      return;
    }

    this._ballGroup.scale.set(1, 1, 1);
    this.ball3D.material.emissive.setHex(0x090d14);
    this.ball3D.material.emissiveIntensity = 0.08;
    if (!this._mobilePerformanceMode) this._ballLight.color.copy(this._levelColor);

    const point = this._scratchBallPoint.set(pos.x - HW, HH - pos.y, BALL_Z);
    this._ballGroup.position.copy(point);

    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed > 0.1) {
      this._ballGroup.rotateOnWorldAxis(
        this._scratchRollAxis.set(ball.vy, ball.vx, 0).normalize(),
        speed / BALL_R
      );
    }

    this._updateBallShadows(point, speed);

    this._ballHalo.visible = true;
    this._ballHalo.position.set(point.x, point.y, 0.28);
    const haloSize = 21 + speed * 1.4;
    this._ballHalo.scale.set(haloSize, haloSize, 1);
    this._ballHalo.material.opacity = 0.1 + Math.min(speed / 7, 1) * 0.12;
    this._updateBallTrail(point, speed);

    if (this._mobilePerformanceMode) {
      if (this._hitFlash > 0) this._hitFlash--;
    } else {
      this._ballLight.position.copy(point);
      this._ballLight.intensity = this._hitFlash > 0
        ? (this._hitFlash--, 3.5)
        : 1.0 + Math.min(speed / 5, 1) * 0.9;
    }
  }

  _updateBallShadows(point, speed) {
    for (let index = 0; index < this._ballShadows.length; index++) {
      const shadow = this._ballShadows[index];
      const { source, opacity, scaleX, scaleY } = shadow.userData;
      const direction = this._scratchShadowDirection.set(
        point.x - source.position.x,
        point.y - source.position.y
      );
      const distance = Math.max(1, direction.length());
      direction.normalize();

      const sourceHeight = Math.max(40, source.position.z);
      const offset = 3.8 + Math.min(distance / sourceHeight, 2.4) * 2.4 + speed * 0.34;
      const localStrength = Math.max(0.34, 1 - distance / 980);

      shadow.visible = true;
      shadow.position.set(
        point.x + direction.x * offset,
        point.y + direction.y * offset,
        0.34 + index * 0.012
      );
      shadow.rotation.z = Math.atan2(direction.y, direction.x);
      shadow.scale.set(
        scaleX + speed * 0.58 + offset * 0.22,
        scaleY + speed * 0.16,
        1
      );
      shadow.material.opacity = opacity * localStrength;
    }
  }

  _updateBallTrail(point, speed) {
    const floorPoint = this._scratchTrailPoint.set(point.x, point.y, BALL_Z - 0.45);
    const previous = this._trailPositions[0];
    const teleported = this._trailReady && previous.distanceToSquared(floorPoint) > CELL_SIZE * CELL_SIZE * 4;

    if (!this._trailReady || teleported) {
      for (let index = 0; index < this._trailPositions.length; index++) {
        this._trailPositions[index].copy(floorPoint);
      }
      this._trailReady = true;
    }

    if (speed > 0.18 && this._trailTick++ % 2 === 0) {
      for (let index = this._trailPositions.length - 1; index > 0; index--) {
        this._trailPositions[index].copy(this._trailPositions[index - 1]);
      }
      this._trailPositions[0].copy(floorPoint);
    }

    const strength = Math.min(speed / 5, 1);
    for (let index = 0; index < this._trailGhosts.length; index++) {
      const ghost = this._trailGhosts[index];
      ghost.position.copy(this._trailPositions[index]);
      ghost.visible = strength > 0.08;
      ghost.material.opacity = strength * TRAIL_OPACITIES[index];
      ghost.quaternion.copy(this._ballGroup.quaternion);
    }
  }
}
