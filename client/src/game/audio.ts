/**
 * Procedural Audio System
 *
 * Generates all sound effects and ambient music at runtime using the Web Audio API.
 * No external audio files needed — everything is synthesized procedurally.
 *
 * SFX: footsteps, creature growls, beast roars, stone impacts, UI clicks,
 *      recruit chime, coffee slurp, level-up, hit, death
 * Music: biome-specific ambient drones with melodic layers
 */

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private currentMusic: { stop: () => void } | null = null;
  private enabled = true;
  private musicVolume = 0.3;
  private sfxVolume = 0.5;

  constructor() {
    // Lazy init — AudioContext requires user gesture
  }

  /** Expose the AudioContext so other systems (VoiceManager) can share it. */
  get context(): AudioContext | null { return this.ctx; }

  /** Initialize the audio context (call on first user interaction). */
  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);
    } catch (e) {
      console.warn("AudioSystem: Web Audio API not available", e);
      this.enabled = false;
    }
  }

  /** Resume audio context (needed after user gesture). */
  resume(): void {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.masterGain) this.masterGain.gain.value = on ? 0.7 : 0;
  }

  // ============================================================
  // SFX Synthesis
  // ============================================================

  /** Play a synthesized tone with envelope. */
  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.5,
    attack = 0.01,
    decay = 0.1,
  ): void {
    if (!this.ctx || !this.sfxGain || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.sfxGain);

    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  /** Play a noise burst (for impacts, footsteps). */
  private noise(
    duration: number,
    volume = 0.3,
    filterFreq = 1000,
    filterQ = 1,
  ): void {
    if (!this.ctx || !this.sfxGain || !this.enabled) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start();
  }

  /** Frequency sweep — for sci-fi sounds, roars. */
  private sweep(
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = "sawtooth",
    volume = 0.3,
  ): void {
    if (!this.ctx || !this.sfxGain || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.connect(gain);
    gain.connect(this.sfxGain);

    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  // ============================================================
  // Named SFX
  // ============================================================

  footstep(): void {
    this.noise(0.08, 0.15, 200, 2);
  }

  hit(): void {
    this.noise(0.15, 0.4, 300, 3);
    this.tone(80, 0.1, "square", 0.2);
  }

  golfSwing(): void {
    this.sweep(800, 200, 0.15, "sine", 0.15);
    this.noise(0.1, 0.15, 2000, 1);
  }

  tennisHit(): void {
    this.sweep(600, 300, 0.08, "sine", 0.18);
    this.noise(0.06, 0.12, 3000, 1.5);
  }

  tennisBounce(): void {
    this.tone(440, 0.05, "sine", 0.15);
    this.noise(0.04, 0.08, 2000, 2);
  }

  private lastGrowlTime = 0;

  creatureGrowl(): void {
    const now = performance.now();
    if (now - this.lastGrowlTime < 200) return;
    this.lastGrowlTime = now;
    this.sweep(200, 80, 0.4, "sawtooth", 0.2);
  }

  beastRoar(): void {
    this.sweep(150, 50, 0.8, "sawtooth", 0.4);
    this.tone(60, 0.6, "square", 0.3);
    this.noise(0.5, 0.2, 500, 0.5);
  }

  rumble(): void {
    this.tone(35, 0.4, "sine", 0.12);
    this.noise(0.3, 0.08, 60, 0.5);
  }

  stoneImpact(): void {
    this.noise(0.1, 0.3, 800, 2);
    this.tone(120, 0.08, "square", 0.15);
  }

  uiClick(): void {
    this.tone(800, 0.05, "sine", 0.2);
  }

  recruit(): void {
    // ascending arpeggio
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.3, "sine", 0.3, 0.01, 0.25), i * 80);
    });
  }

  coffee(): void {
    this.sweep(300, 500, 0.2, "sine", 0.15);
    this.noise(0.15, 0.1, 1500, 1);
  }

  levelUp(): void {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.4, "triangle", 0.3, 0.01, 0.35), i * 60);
    });
  }

  death(): void {
    this.sweep(400, 50, 0.6, "sawtooth", 0.3);
    this.noise(0.4, 0.2, 200, 0.5);
  }

  voidDeath(): void {
    this.sweep(800, 20, 1.0, "sine", 0.3);
    this.tone(40, 0.8, "sine", 0.2);
  }

  /** Helicopter rotor whirring — looping blade chops + turbine whine.
   *  Returns a handle whose stop() fades out and tears down all nodes. */
  helicopter(): { stop: () => void } {
    if (!this.ctx || !this.sfxGain || !this.enabled) return { stop: () => {} };
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // --- Blade-pass "whomp whomp" via amplitude-modulated noise ---
    // Generate 2s of filtered noise, loop it
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 600;
    noiseFilter.Q.value = 0.7;

    // Amplitude modulation via LFO → gain to create blade chops (~14 Hz = 2 blades)
    const bladeLfo = ctx.createOscillator();
    bladeLfo.type = "sine";
    bladeLfo.frequency.value = 14;
    const bladeLfoGain = ctx.createGain();
    bladeLfoGain.gain.value = 0.25; // modulation depth
    const bladeGain = ctx.createGain();
    bladeGain.gain.value = 0.25; // baseline level
    bladeLfo.connect(bladeLfoGain);
    bladeLfoGain.connect(bladeGain.gain);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(bladeGain);
    bladeGain.connect(this.sfxGain);

    // --- Rotor thump — low sine at blade-pass frequency ---
    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = "sine";
    thumpOsc.frequency.value = 14;
    const thumpGain = ctx.createGain();
    thumpGain.gain.value = 0;
    thumpGain.gain.linearRampToValueAtTime(0.12, now + 1);
    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.sfxGain);

    // Start everything
    noiseSrc.start(now);
    bladeLfo.start(now);
    thumpOsc.start(now);

    // Fade in the blade gain
    bladeGain.gain.setValueAtTime(0, now);
    bladeGain.gain.linearRampToValueAtTime(0.25, now + 1);

    return {
      stop: () => {
        const stopTime = ctx.currentTime;
        const fadeDuration = 0.5;
        bladeGain.gain.cancelScheduledValues(stopTime);
        bladeGain.gain.setValueAtTime(bladeGain.gain.value, stopTime);
        bladeGain.gain.linearRampToValueAtTime(0, stopTime + fadeDuration);
        thumpGain.gain.cancelScheduledValues(stopTime);
        thumpGain.gain.setValueAtTime(thumpGain.gain.value, stopTime);
        thumpGain.gain.linearRampToValueAtTime(0, stopTime + fadeDuration);
        const end = stopTime + fadeDuration + 0.1;
        try { noiseSrc.stop(end); } catch {}
        try { bladeLfo.stop(end); } catch {}
        try { thumpOsc.stop(end); } catch {}
      },
    };
  }

  // ============================================================
  // Ambient Music
  // ============================================================

  /** Start biome-specific ambient music. */
  playMusic(biome: string): void {
    if (!this.ctx || !this.musicGain || !this.enabled) return;
    this.stopMusic();

    const config = MUSIC_CONFIG[biome] ?? MUSIC_CONFIG.meadow;
    const musicGain = this.musicGain;
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    // Drone layer
    for (const freq of config.drones) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(config.droneVolume, this.ctx.currentTime + 2);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start();
      oscs.push(osc);
      gains.push(gain);
    }

    // LFO for subtle modulation
    if (config.lfo) {
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = config.lfo;
      lfoGain.gain.value = 2;
      lfo.connect(lfoGain);
      oscs.forEach((o) => lfoGain.connect(o.frequency));
      lfo.start();
      oscs.push(lfo);
    }

    // Melodic layer — periodic notes
    let melodicTimer: number | null = null;
    if (config.melody && config.melody.length > 0) {
      const playMelodyNote = () => {
        if (!this.ctx || !this.enabled) return;
        const note = config.melody![Math.floor(Math.random() * config.melody!.length)];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = note;
        const now = this.ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(config.melodyVolume, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(now);
        osc.stop(now + 1.5);
        melodicTimer = window.setTimeout(playMelodyNote, 2000 + Math.random() * 3000);
      };
      melodicTimer = window.setTimeout(playMelodyNote, 1000);
    }

    this.currentMusic = {
      stop: () => {
        if (melodicTimer) clearTimeout(melodicTimer);
        if (this.ctx) {
          const now = this.ctx.currentTime;
          gains.forEach((g) => g.gain.linearRampToValueAtTime(0, now + 1));
          oscs.forEach((o) => o.stop(now + 1.5));
        }
      },
    };
  }

  /** Stop current music. */
  stopMusic(): void {
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic = null;
    }
  }

  /** Set music intensity (e.g., ramp up when beast is near). */
  setMusicIntensity(intensity: number): void {
    if (this.musicGain && this.ctx) {
      const target = this.musicVolume * (0.5 + intensity * 0.5);
      this.musicGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.5);
    }
  }

  destroy(): void {
    this.stopMusic();
    if (this.ctx) this.ctx.close();
  }
}

const MUSIC_CONFIG: Record<string, {
  drones: number[];
  droneVolume: number;
  lfo?: number;
  melody?: number[];
  melodyVolume: number;
}> = {
  meadow: {
    drones: [130.81, 196.0, 261.63],
    droneVolume: 0.08,
    lfo: 0.1,
    melody: [523.25, 587.33, 659.25, 783.99],
    melodyVolume: 0.06,
  },
  forest: {
    drones: [110, 164.81, 220],
    droneVolume: 0.07,
    lfo: 0.08,
    melody: [440, 493.88, 554.37],
    melodyVolume: 0.05,
  },
  ruins: {
    drones: [98, 146.83, 196],
    droneVolume: 0.06,
    lfo: 0.05,
    melody: [392, 466.16, 523.25],
    melodyVolume: 0.04,
  },
  wasteland: {
    drones: [87.31, 130.81, 174.61],
    droneVolume: 0.09,
    lfo: 0.03,
    melody: [349.23, 415.3, 466.16],
    melodyVolume: 0.04,
  },
  void: {
    drones: [65.41, 97.99, 130.81],
    droneVolume: 0.1,
    lfo: 0.02,
    melody: [261.63, 311.13, 349.23],
    melodyVolume: 0.05,
  },
  infernal: {
    drones: [55, 82.41, 110],
    droneVolume: 0.12,
    lfo: 0.15,
    melody: [220, 261.63, 311.13],
    melodyVolume: 0.06,
  },
};
