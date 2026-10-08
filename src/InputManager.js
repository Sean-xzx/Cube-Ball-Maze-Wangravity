const CONTROL_SCALE = 1.1;

export default class InputManager {
  constructor() {
    this.gx = 0;
    this.gy = 0;
    this.sensorGX = 0;
    this.sensorGY = 0;
    this.touchGX = 0;
    this.touchGY = 0;
    this.keys = {};
    this.hasGyro = false;
    this.gyroActive = false;
    this.touchActive = false;
    this.calibrationBeta = 0;
    this.calibrationGamma = 0;
    this.calibrationMotionX = 0;
    this.calibrationMotionY = 0;
    this.calibrationPending = false;
    this.orientationCalibrated = false;
    this.motionCalibrated = false;
    this.lastOrientation = null;
    this.lastMotion = null;
    this.sensorMode = null;
    this.status = 'idle';
    this.statusListeners = new Set();
    this.touchTarget = null;
    this._gyroWaitTimer = null;
    this._lastOrientationAt = 0;

    this._onKeydown = (event) => {
      this.keys[event.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        event.preventDefault();
      }
    };
    this._onKeyup = (event) => { this.keys[event.key] = false; };
    this._onOrientationChange = () => {
      if (!this.gyroActive) return;
      this.calibrationPending = true;
      this.orientationCalibrated = false;
      this.motionCalibrated = false;
      this._setStatus('gyro-calibrating');
    };

    window.addEventListener('keydown', this._onKeydown);
    window.addEventListener('keyup', this._onKeyup);
    window.addEventListener('orientationchange', this._onOrientationChange);
    if (screen.orientation) screen.orientation.addEventListener('change', this._onOrientationChange);
  }

  onStatusChange(listener) {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  getStatus() {
    return {
      mode: this.status,
      secureContext: window.isSecureContext,
      gyroActive: this.gyroActive,
      touchActive: this.touchActive,
      angle: this._getScreenAngle(),
    };
  }

  attachTouchControls(target) {
    if (!target || this.touchTarget === target) return;
    this._detachTouchControls();
    this.touchTarget = target;
    this.touchTarget.style.touchAction = 'none';

    this._onPointerDown = (event) => {
      if (event.pointerType === 'mouse') return;
      this.touchActive = true;
      this.touchStartX = event.clientX;
      this.touchStartY = event.clientY;
      this.touchGX = 0;
      this.touchGY = 0;
      this.touchTarget.setPointerCapture?.(event.pointerId);
      if (!this.gyroActive) this._setStatus('touch');
    };
    this._onPointerMove = (event) => {
      if (!this.touchActive || event.pointerType === 'mouse') return;
      const maxDistance = Math.max(54, Math.min(window.innerWidth, window.innerHeight) * 0.18);
      this.touchGX = this._clamp((event.clientX - this.touchStartX) / maxDistance, -1, 1);
      this.touchGY = this._clamp((event.clientY - this.touchStartY) / maxDistance, -1, 1);
      event.preventDefault();
    };
    this._onPointerUp = (event) => {
      if (event.pointerType === 'mouse') return;
      this.touchActive = false;
      this.touchGX = 0;
      this.touchGY = 0;
      this.touchTarget.releasePointerCapture?.(event.pointerId);
    };

    this.touchTarget.addEventListener('pointerdown', this._onPointerDown);
    this.touchTarget.addEventListener('pointermove', this._onPointerMove);
    this.touchTarget.addEventListener('pointerup', this._onPointerUp);
    this.touchTarget.addEventListener('pointercancel', this._onPointerUp);
  }

  async requestGyroPermission() {
    if (!window.isSecureContext) {
      this._setStatus('insecure');
      return false;
    }
    const hasOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
    const hasMotion = typeof window.DeviceMotionEvent !== 'undefined';
    if (!hasOrientation && !hasMotion) {
      this._setStatus('unsupported');
      return false;
    }

    this._setStatus('gyro-requesting');
    const orientationAllowed = await this._requestSensorPermission(window.DeviceOrientationEvent);
    const motionAllowed = await this._requestSensorPermission(window.DeviceMotionEvent);
    if (!orientationAllowed && !motionAllowed) {
      this._setStatus('gyro-denied');
      return false;
    }

    this._startGyro({ orientation: orientationAllowed, motion: motionAllowed });
    return true;
  }

  _startGyro({ orientation = true, motion = true } = {}) {
    this.hasGyro = true;
    this.calibrationPending = true;
    this.orientationCalibrated = false;
    this.motionCalibrated = false;
    this._setStatus('gyro-waiting');
    if (orientation && !this._onDeviceOrientation) {
      this._onDeviceOrientation = (event) => {
        if (!Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
        this.lastOrientation = { beta: event.beta, gamma: event.gamma };
        this._lastOrientationAt = performance.now();
        this.sensorMode = 'orientation';

        if (this.calibrationPending || !this.orientationCalibrated) {
          this.calibrationBeta = event.beta;
          this.calibrationGamma = event.gamma;
          this.orientationCalibrated = true;
          this.sensorGX = 0;
          this.sensorGY = 0;
        } else {
          this._updateSensorGravity(event.beta, event.gamma);
        }

        this.calibrationPending = false;
        this.gyroActive = true;
        this._clearGyroWaitTimer();
        this._setStatus('gyro-active');
      };
      window.addEventListener('deviceorientation', this._onDeviceOrientation);
    }
    if (motion && !this._onDeviceMotion) {
      this._onDeviceMotion = (event) => {
        const gravity = event.accelerationIncludingGravity || event.acceleration;
        if (!gravity || !Number.isFinite(gravity.x) || !Number.isFinite(gravity.y)) return;
        this.lastMotion = { x: gravity.x, y: gravity.y };

        // DeviceOrientation is smoother for tilt control when available. DeviceMotion is a fallback.
        if (performance.now() - this._lastOrientationAt < 800) return;
        this.sensorMode = 'motion';

        if (this.calibrationPending || !this.motionCalibrated) {
          this.calibrationMotionX = gravity.x;
          this.calibrationMotionY = gravity.y;
          this.motionCalibrated = true;
          this.sensorGX = 0;
          this.sensorGY = 0;
        } else {
          this._updateMotionGravity(gravity.x, gravity.y);
        }

        this.calibrationPending = false;
        this.gyroActive = true;
        this._clearGyroWaitTimer();
        this._setStatus('gyro-active');
      };
      window.addEventListener('devicemotion', this._onDeviceMotion);
    }

    this._clearGyroWaitTimer();
    this._gyroWaitTimer = window.setTimeout(() => {
      if (!this.gyroActive) this._setStatus('gyro-missing');
    }, 3600);
  }

  calibrate() {
    if (!this.gyroActive || (!this.lastOrientation && !this.lastMotion)) return false;
    if (this.lastOrientation) {
      this.calibrationBeta = this.lastOrientation.beta;
      this.calibrationGamma = this.lastOrientation.gamma;
      this.orientationCalibrated = true;
    }
    if (this.lastMotion) {
      this.calibrationMotionX = this.lastMotion.x;
      this.calibrationMotionY = this.lastMotion.y;
      this.motionCalibrated = true;
    }
    this.calibrationPending = false;
    this.sensorGX = 0;
    this.sensorGY = 0;
    this._setStatus('gyro-calibrated');
    window.setTimeout(() => {
      if (this.gyroActive) this._setStatus('gyro-active');
    }, 1100);
    return true;
  }

  waitForGyroSample(timeoutMs = 1400) {
    if (this.gyroActive && this.lastOrientation) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe = null;
      const timer = window.setTimeout(() => finish(false), timeoutMs);
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (unsubscribe) unsubscribe();
        resolve(value);
      };
      unsubscribe = this.onStatusChange(() => {
        if (this.gyroActive && this.lastOrientation) finish(true);
      });
    });
  }

  clearKeys() {
    this.keys = {};
  }

  update() {
    if (this.touchActive) {
      this.gx = this.touchGX * CONTROL_SCALE;
      this.gy = this.touchGY * CONTROL_SCALE;
      return;
    }
    if (this.gyroActive) {
      this.gx = this.sensorGX * CONTROL_SCALE;
      this.gy = this.sensorGY * CONTROL_SCALE;
      return;
    }

    let kx = 0;
    let ky = 0;
    if (this.keys.ArrowLeft || this.keys.a || this.keys.A) kx -= 1;
    if (this.keys.ArrowRight || this.keys.d || this.keys.D) kx += 1;
    if (this.keys.ArrowUp || this.keys.w || this.keys.W) ky -= 1;
    if (this.keys.ArrowDown || this.keys.s || this.keys.S) ky += 1;
    if (kx !== 0 && ky !== 0) {
      const length = Math.sqrt(kx * kx + ky * ky);
      kx /= length;
      ky /= length;
    }
    this.gx = kx * CONTROL_SCALE;
    this.gy = ky * CONTROL_SCALE;
  }

  getGravity() {
    return { x: this.gx, y: this.gy };
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeydown);
    window.removeEventListener('keyup', this._onKeyup);
    window.removeEventListener('orientationchange', this._onOrientationChange);
    if (screen.orientation) screen.orientation.removeEventListener('change', this._onOrientationChange);
    if (this._onDeviceOrientation) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    }
    if (this._onDeviceMotion) {
      window.removeEventListener('devicemotion', this._onDeviceMotion);
    }
    this._clearGyroWaitTimer();
    this._detachTouchControls();
    this.statusListeners.clear();
  }

  async _requestSensorPermission(SensorEvent) {
    if (typeof SensorEvent === 'undefined') return false;
    if (typeof SensorEvent.requestPermission !== 'function') return true;
    try {
      return await SensorEvent.requestPermission() === 'granted';
    } catch (error) {
      console.warn('体感权限请求失败:', error);
      return false;
    }
  }

  _updateSensorGravity(beta, gamma) {
    const betaRad = (beta - this.calibrationBeta) * Math.PI / 180;
    const gammaRad = (gamma - this.calibrationGamma) * Math.PI / 180;
    const baseX = Math.sin(gammaRad) * Math.cos(betaRad);
    const baseY = Math.sin(betaRad);
    const angle = this._getScreenAngle() * Math.PI / 180;
    let gx = baseX * Math.cos(angle) + baseY * Math.sin(angle);
    let gy = -baseX * Math.sin(angle) + baseY * Math.cos(angle);
    const deadZone = 0.035;
    if (Math.abs(gx) < deadZone) gx = 0;
    if (Math.abs(gy) < deadZone) gy = 0;
    this.sensorGX = this._clamp(gx, -1, 1);
    this.sensorGY = this._clamp(gy, -1, 1);
  }

  _updateMotionGravity(x, y) {
    const baseX = (x - this.calibrationMotionX) / 9.81;
    const baseY = -(y - this.calibrationMotionY) / 9.81;
    const angle = this._getScreenAngle() * Math.PI / 180;
    let gx = baseX * Math.cos(angle) + baseY * Math.sin(angle);
    let gy = -baseX * Math.sin(angle) + baseY * Math.cos(angle);
    const deadZone = 0.035;
    if (Math.abs(gx) < deadZone) gx = 0;
    if (Math.abs(gy) < deadZone) gy = 0;
    this.sensorGX = this._clamp(gx, -1, 1);
    this.sensorGY = this._clamp(gy, -1, 1);
  }

  _getScreenAngle() {
    return screen.orientation?.angle ?? window.orientation ?? 0;
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    const snapshot = this.getStatus();
    this.statusListeners.forEach(listener => listener(snapshot));
  }

  _clearGyroWaitTimer() {
    if (!this._gyroWaitTimer) return;
    window.clearTimeout(this._gyroWaitTimer);
    this._gyroWaitTimer = null;
  }

  _detachTouchControls() {
    if (!this.touchTarget) return;
    this.touchTarget.removeEventListener('pointerdown', this._onPointerDown);
    this.touchTarget.removeEventListener('pointermove', this._onPointerMove);
    this.touchTarget.removeEventListener('pointerup', this._onPointerUp);
    this.touchTarget.removeEventListener('pointercancel', this._onPointerUp);
    this.touchTarget = null;
  }

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}
