const SFX_GAIN = 4;
const BGM_SRC = './audio/pixel-city-beat.mp3';
const BGM_VOLUME = 0.18;
const BGM_STORAGE_KEY = 'wangravity-bgm-enabled-v1';

export default class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.backgroundMusic = null;
    this.sfxGainNode = null;
    this.rollingSource = null;
    this.rollingGain = null;
    this.rollingFilter = null;
    this.rollingTone = null;
    this.rollingToneGain = null;
    this.bgmEnabled = this._loadBgmPreference();
  }

  _loadBgmPreference() {
    try {
      return localStorage.getItem(BGM_STORAGE_KEY) !== 'off';
    } catch (error) {
      return true;
    }
  }

  _saveBgmPreference() {
    try {
      localStorage.setItem(BGM_STORAGE_KEY, this.bgmEnabled ? 'on' : 'off');
    } catch (error) {
      // Ignore unavailable storage; the button still works for the current session.
    }
  }

  init() {
    if (this.ctx || !this.enabled) return this.ctx;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('AudioContext unavailable');
      this.ctx = new AudioContext();
      this.sfxGainNode = this.ctx.createGain();
      this.sfxGainNode.gain.value = SFX_GAIN;
      this.sfxGainNode.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API 不可用');
      this.enabled = false;
    }
    return this.ctx;
  }

  async unlock() {
    const ctx = this.init();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      if (ctx.state !== 'running') return false;

      // A nearly silent pulse keeps iOS Web Audio unlocked after the start tap.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(this._sfxOutput());
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.02);
      return true;
    } catch (error) {
      console.warn('音效解锁失败:', error);
      return false;
    }
  }

  playBackgroundMusic() {
    if (!this.enabled || !this.bgmEnabled) return false;
    if (!this.backgroundMusic) {
      this.backgroundMusic = new Audio(BGM_SRC);
      this.backgroundMusic.loop = true;
      this.backgroundMusic.preload = 'auto';
    }
    this.backgroundMusic.volume = BGM_VOLUME;
    const playPromise = this.backgroundMusic.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        console.warn('背景音乐播放失败:', error);
      });
    }
    return true;
  }

  isBackgroundMusicEnabled() {
    return this.bgmEnabled;
  }

  setBackgroundMusicEnabled(enabled) {
    this.bgmEnabled = Boolean(enabled);
    this._saveBgmPreference();
    if (this.bgmEnabled) {
      this.playBackgroundMusic();
    } else {
      this.pauseBackgroundMusic();
    }
    return this.bgmEnabled;
  }

  toggleBackgroundMusic() {
    return this.setBackgroundMusicEnabled(!this.bgmEnabled);
  }

  pauseBackgroundMusic() {
    if (!this.backgroundMusic) return;
    this.backgroundMusic.pause();
  }

  stopBackgroundMusic() {
    if (!this.backgroundMusic) return;
    this.backgroundMusic.pause();
    this.backgroundMusic.currentTime = 0;
  }

  _ensure() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _sfxOutput() {
    return this.sfxGainNode || this.ctx?.destination;
  }

  _ensureRollingLoop() {
    if (this.rollingSource || !this.ctx) return;

    const ctx = this.ctx;
    const bufferSize = Math.floor(ctx.sampleRate * 0.75);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < bufferSize; index++) {
      const sample = (Math.random() * 2 - 1) * 0.55;
      last = last * 0.74 + sample * 0.26;
      data[index] = last;
    }

    this.rollingSource = ctx.createBufferSource();
    this.rollingSource.buffer = buffer;
    this.rollingSource.loop = true;
    this.rollingSource.playbackRate.value = 0.82;

    this.rollingFilter = ctx.createBiquadFilter();
    this.rollingFilter.type = 'bandpass';
    this.rollingFilter.frequency.value = 520;
    this.rollingFilter.Q.value = 0.85;

    this.rollingGain = ctx.createGain();
    this.rollingGain.gain.value = 0;

    this.rollingTone = ctx.createOscillator();
    this.rollingTone.type = 'triangle';
    this.rollingTone.frequency.value = 86;

    this.rollingToneGain = ctx.createGain();
    this.rollingToneGain.gain.value = 0;

    this.rollingSource.connect(this.rollingFilter);
    this.rollingFilter.connect(this.rollingGain);
    this.rollingGain.connect(this._sfxOutput());
    this.rollingTone.connect(this.rollingToneGain);
    this.rollingToneGain.connect(this._sfxOutput());

    this.rollingSource.start();
    this.rollingTone.start();
  }

  updateRolling() {
    this.stopRolling();
  }

  stopRolling() {
    if (!this.ctx || !this.rollingGain || !this.rollingToneGain) return;
    const now = this.ctx.currentTime;
    this.rollingGain.gain.cancelScheduledValues(now);
    this.rollingToneGain.gain.cancelScheduledValues(now);
    this.rollingGain.gain.setTargetAtTime(0, now, 0.06);
    this.rollingToneGain.gain.setTargetAtTime(0, now, 0.08);
  }

  playReady() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    [440, 660].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.09;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.22);
      osc.connect(gain);
      gain.connect(this._sfxOutput());
      osc.start(start);
      osc.stop(start + 0.22);
    });
  }

  // 撞墙音效 — 短促金属撞击，音高/音量随速度变化
  playHit(speed = 3) {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const intensity = Math.min(speed / 7, 1);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400 + intensity * 600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150 + intensity * 100, ctx.currentTime + 0.1);

    const vol = 0.1 + intensity * 0.3;
    const dur = 0.08 + intensity * 0.15;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);

    osc.connect(gain);
    gain.connect(this._sfxOutput());
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  }

  // 掉入洞口音效 — 下滑音调
  playFall() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(this._sfxOutput());
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  playGoalEnter() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const start = ctx.currentTime;
    const drop = ctx.createOscillator();
    const dropGain = ctx.createGain();
    drop.type = 'sine';
    drop.frequency.setValueAtTime(520, start);
    drop.frequency.exponentialRampToValueAtTime(145, start + 0.32);
    dropGain.gain.setValueAtTime(0, start);
    dropGain.gain.linearRampToValueAtTime(0.18, start + 0.035);
    dropGain.gain.exponentialRampToValueAtTime(0.01, start + 0.34);
    drop.connect(dropGain);
    dropGain.connect(this._sfxOutput());
    drop.start(start);
    drop.stop(start + 0.34);

    [740, 988].forEach((frequency, index) => {
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      const bellStart = start + 0.16 + index * 0.055;
      bell.type = 'triangle';
      bell.frequency.value = frequency;
      bellGain.gain.setValueAtTime(0, bellStart);
      bellGain.gain.linearRampToValueAtTime(0.09, bellStart + 0.02);
      bellGain.gain.exponentialRampToValueAtTime(0.01, bellStart + 0.36);
      bell.connect(bellGain);
      bellGain.connect(this._sfxOutput());
      bell.start(bellStart);
      bell.stop(bellStart + 0.38);
    });
  }

  // 翻转转场音效 — whoosh
  playFlip() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    // 白噪音 + 带通滤波
    const bufferSize = ctx.sampleRate * 0.6;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.3);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.6);
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxOutput());
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.6);
  }

  // 通关成功音效 — 上升和弦
  playComplete() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      const startTime = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.8);

      osc.connect(gain);
      gain.connect(this._sfxOutput());
      osc.start(startTime);
      osc.stop(startTime + 0.8);
    });
  }

  // 震动感嗡嗡声 — iOS 回退，模拟手机震动
  playBuzz(intensity = 0.5, durationScale = 1) {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 60;

    const vol = 0.15 + intensity * 0.25;
    const dur = (0.18 + intensity * 0.32) * durationScale;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(vol, ctx.currentTime + dur * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);

    osc.connect(gain);
    gain.connect(this._sfxOutput());
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  }

  playTrapSuction() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const start = ctx.currentTime;
    const tone = ctx.createOscillator();
    const toneFilter = ctx.createBiquadFilter();
    const toneGain = ctx.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(260, start);
    tone.frequency.exponentialRampToValueAtTime(68, start + 0.42);
    toneFilter.type = 'lowpass';
    toneFilter.frequency.setValueAtTime(860, start);
    toneFilter.frequency.exponentialRampToValueAtTime(140, start + 0.42);
    toneFilter.Q.value = 4;
    toneGain.gain.setValueAtTime(0, start);
    toneGain.gain.linearRampToValueAtTime(0.13, start + 0.04);
    toneGain.gain.exponentialRampToValueAtTime(0.01, start + 0.42);
    tone.connect(toneFilter);
    toneFilter.connect(toneGain);
    toneGain.connect(this._sfxOutput());
    tone.start(start);
    tone.stop(start + 0.42);

    const bufferSize = Math.floor(ctx.sampleRate * 0.24);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index++) {
      const fade = 1 - index / bufferSize;
      data[index] = (Math.random() * 2 - 1) * fade * 0.16;
    }
    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noise.buffer = buffer;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(620, start);
    noiseFilter.frequency.exponentialRampToValueAtTime(160, start + 0.24);
    noiseFilter.Q.value = 2.8;
    noiseGain.gain.setValueAtTime(0.08, start);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, start + 0.24);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this._sfxOutput());
    noise.start(start);
    noise.stop(start + 0.24);
  }

  playTrapDeath() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this._sfxOutput());
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);

    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index++) {
      data[index] = (Math.random() * 2 - 1) * Math.max(0, 1 - index / bufferSize);
    }
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(0.25, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    noise.connect(noiseGain);
    noiseGain.connect(this._sfxOutput());
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.15);
  }

  playCountdownTick(seconds = 5) {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 720 + (5 - Math.max(1, seconds)) * 95;
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this._sfxOutput());
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  playTimeout() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    [310, 220].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.16;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(frequency, start);
      osc.frequency.exponentialRampToValueAtTime(70, start + 0.38);
      gain.gain.setValueAtTime(0.24, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.4);
      osc.connect(gain);
      gain.connect(this._sfxOutput());
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  playCoinCollect() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const start = ctx.currentTime;
    const notes = [
      { frequency: 740, delay: 0, volume: 0.085, type: 'triangle', duration: 0.16 },
      { frequency: 1120, delay: 0.052, volume: 0.12, type: 'sine', duration: 0.2 },
      { frequency: 1480, delay: 0.098, volume: 0.055, type: 'sine', duration: 0.18 },
    ];

    notes.forEach(({ frequency, delay, volume, type, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = start + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, t);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.035, t + duration * 0.48);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
      osc.connect(gain);
      gain.connect(this._sfxOutput());
      osc.start(t);
      osc.stop(t + duration + 0.02);
    });

    const bufferSize = Math.floor(ctx.sampleRate * 0.045);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index++) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize) * 0.038;
    }
    const sparkle = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    sparkle.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1750;
    filter.Q.value = 0.9;
    gain.gain.value = 0.055;
    sparkle.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxOutput());
    sparkle.start(start);
    sparkle.stop(start + 0.06);
  }

  playStarCollect() {
    this.playCoinCollect();
  }

  playPortal() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    const start = ctx.currentTime;
    [440, 660, 990].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = start + index * 0.045;
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(frequency, t);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.32, t + 0.18);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(index === 0 ? 0.11 : 0.075, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.26);
      osc.connect(gain);
      gain.connect(this._sfxOutput());
      osc.start(t);
      osc.stop(t + 0.28);
    });

    const bufferSize = Math.floor(ctx.sampleRate * 0.14);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index++) {
      const fade = 1 - index / bufferSize;
      data[index] = (Math.random() * 2 - 1) * fade * 0.11;
    }
    const swirl = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    swirl.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620, start);
    filter.frequency.exponentialRampToValueAtTime(1800, start + 0.14);
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0.08, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.16);
    swirl.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxOutput());
    swirl.start(start);
    swirl.stop(start + 0.16);
  }

  playGoalUnlock() {
    if (!this.enabled) return;
    this._ensure();
    const ctx = this.ctx;
    if (!ctx) return;

    [523, 659, 784].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.1;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.5);
      osc.connect(gain);
      gain.connect(this._sfxOutput());
      osc.start(start);
      osc.stop(start + 0.5);
    });
  }
}
