/**
 * Procedural sound engine for Cabo.
 *
 *   - All sound effects are generated on the fly via Web Audio API oscillators
 *     and short envelopes. No external audio files required.
 *   - Background music is a soft, repeating chord progression with two
 *     detuned sine voices (pad layer) and a subtle plucked bell on the chord
 *     root. The progression cycles through I-vi-IV-V in C major.
 *   - Music and SFX have independent gain nodes so each can be muted /
 *     volume-adjusted independently.
 *   - Browsers require a user gesture to start AudioContext — Audio.ensure()
 *     is called from the first click in the AudioControls UI.
 */

export type SfxName =
  | "click"
  | "card_flip"
  | "card_deal"
  | "card_draw"
  | "card_swap"
  | "card_discard"
  | "peek"
  | "spy"
  | "cabo"
  | "win"
  | "lose"
  | "coin_flip"
  | "coin_land"
  | "action_trigger";

interface AudioSettings {
  musicVol: number;       // 0-1
  sfxVol: number;         // 0-1
  musicMuted: boolean;
  sfxMuted: boolean;
}

const STORAGE_KEY = "cabo:audio";

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

const DEFAULTS: AudioSettings = {
  musicVol: 0.35,
  sfxVol: 0.55,
  musicMuted: false,
  sfxMuted: false,
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStartedAt = 0;
  private settings: AudioSettings = loadSettings();
  private listeners = new Set<() => void>();

  // Lazy-create the context on first user gesture
  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    } catch {
      this.ctx = null;
    }
  }

  private applyVolumes() {
    if (!this.musicGain || !this.sfxGain) return;
    this.musicGain.gain.value = this.settings.musicMuted ? 0 : this.settings.musicVol;
    this.sfxGain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfxVol;
  }

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch {}
    this.listeners.forEach((l) => l());
  }

  // ────────────────────────── Public API ──────────────────────────
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  getSettings(): AudioSettings { return { ...this.settings }; }

  setMusicVol(v: number) { this.settings.musicVol = v; this.applyVolumes(); this.save(); }
  setSfxVol(v: number) { this.settings.sfxVol = v; this.applyVolumes(); this.save(); }
  setMusicMuted(b: boolean) {
    this.settings.musicMuted = b;
    this.applyVolumes();
    if (b) this.stopMusic();
    else this.startMusic();
    this.save();
  }
  setSfxMuted(b: boolean) { this.settings.sfxMuted = b; this.applyVolumes(); this.save(); }

  startMusic() {
    this.ensure();
    if (!this.ctx || this.settings.musicMuted) return;
    if (this.musicTimer !== null) return;
    this.musicStartedAt = this.ctx.currentTime;
    this.scheduleNextBar();
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** I-vi-IV-V in C major: C, Am, F, G (chord roots: 65.41, 55, 87.31, 98 Hz × 4 for register). */
  private scheduleNextBar() {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const barLen = 3.6; // seconds per chord
    const progressions = [
      { root: 261.63, third: 329.63, fifth: 392.00 }, // C major
      { root: 220.00, third: 261.63, fifth: 329.63 }, // A minor
      { root: 174.61, third: 220.00, fifth: 261.63 }, // F major
      { root: 196.00, third: 246.94, fifth: 293.66 }, // G major
    ];
    const elapsed = ctx.currentTime - this.musicStartedAt;
    const barIdx = Math.floor(elapsed / barLen) % progressions.length;
    const chord = progressions[barIdx];

    // Soft pad: two detuned sine waves per note
    this.playPad(chord.root,  ctx.currentTime, barLen);
    this.playPad(chord.third, ctx.currentTime, barLen);
    this.playPad(chord.fifth, ctx.currentTime, barLen);
    // Gentle bell pluck on the root of each bar
    this.playBell(chord.root * 2, ctx.currentTime + 0.05, 1.6);

    this.musicTimer = window.setTimeout(() => this.scheduleNextBar(), barLen * 1000 - 50);
  }

  private playPad(freq: number, when: number, dur: number) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    // ADSR-ish: 0.6s attack, 0.6s release
    g.gain.linearRampToValueAtTime(0.07, when + 0.6);
    g.gain.setValueAtTime(0.07, when + dur - 0.6);
    g.gain.linearRampToValueAtTime(0, when + dur);
    g.connect(this.musicGain);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 1.005; // slight detune
    o1.connect(g); o2.connect(g);
    o1.start(when); o2.start(when);
    o1.stop(when + dur + 0.1);
    o2.stop(when + dur + 0.1);
  }

  private playBell(freq: number, when: number, dur: number) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(this.musicGain);

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    o.connect(g);
    o.start(when);
    o.stop(when + dur);
  }

  // ─────────────────────── SFX synthesis ───────────────────────
  playSfx(name: SfxName) {
    this.ensure();
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    switch (name) {
      case "click":          this.tone(now, 800, 0.06, "square", 0.12); break;
      case "card_flip":      this.sweep(now, 600, 1100, 0.18, "triangle", 0.18); break;
      case "card_deal":      this.noiseBurst(now, 0.08, 0.12); break;
      case "card_draw":      this.sweep(now, 400, 900, 0.22, "triangle", 0.2); break;
      case "card_swap":
        this.sweep(now, 700, 500, 0.15, "triangle", 0.18);
        this.sweep(now + 0.12, 500, 800, 0.15, "triangle", 0.18);
        break;
      case "card_discard":   this.tone(now, 220, 0.18, "sine", 0.25); break;
      case "peek":
        this.tone(now,        880, 0.08, "sine", 0.18);
        this.tone(now + 0.1, 1175, 0.08, "sine", 0.18);
        this.tone(now + 0.2, 1568, 0.18, "sine", 0.18);
        break;
      case "spy":
        this.sweep(now, 300, 1500, 0.4, "sawtooth", 0.1);
        this.tone(now + 0.1, 900, 0.1, "sine", 0.12);
        break;
      case "cabo":
        // dramatic ding-dong
        this.bell(now, 392, 1.0, 0.3);
        this.bell(now + 0.18, 523, 1.4, 0.3);
        break;
      case "win":
        this.tone(now,        523, 0.14, "triangle", 0.22);
        this.tone(now + 0.14, 659, 0.14, "triangle", 0.22);
        this.tone(now + 0.28, 784, 0.14, "triangle", 0.22);
        this.tone(now + 0.42, 1047, 0.32, "triangle", 0.26);
        break;
      case "lose":
        this.tone(now,       330, 0.2, "sawtooth", 0.18);
        this.tone(now + 0.2, 277, 0.2, "sawtooth", 0.18);
        this.tone(now + 0.4, 220, 0.4, "sawtooth", 0.2);
        break;
      case "coin_flip":
        this.sweep(now, 700, 1400, 0.7, "square", 0.06);
        break;
      case "coin_land":
        this.tone(now,        1175, 0.08, "triangle", 0.25);
        this.tone(now + 0.06, 1568, 0.18, "triangle", 0.25);
        break;
      case "action_trigger":
        this.tone(now,        523, 0.1, "triangle", 0.22);
        this.tone(now + 0.08, 784, 0.18, "triangle", 0.22);
        break;
    }
  }

  private tone(when: number, freq: number, dur: number, type: OscillatorType, amp: number) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(this.sfxGain);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  private sweep(when: number, from: number, to: number, dur: number, type: OscillatorType, amp: number) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(amp, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(this.sfxGain);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, when);
    o.frequency.exponentialRampToValueAtTime(to, when + dur);
    o.connect(g);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  private bell(when: number, freq: number, dur: number, amp: number) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(this.sfxGain);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    o.connect(g);
    // Add a soft overtone
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(amp * 0.3, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.6);
    g2.connect(this.sfxGain);
    o2.connect(g2);
    o.start(when); o.stop(when + dur);
    o2.start(when); o2.stop(when + dur * 0.6);
  }

  private noiseBurst(when: number, dur: number, amp: number) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Decaying noise burst — sounds like card flick
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = amp;
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(when);
  }
}

export const Audio = new AudioEngine();
