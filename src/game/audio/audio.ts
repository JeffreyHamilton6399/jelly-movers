/**
 * Tiny synth sound engine (Web Audio, no asset files).
 * Squishy boings, thuds, pops and delivery chimes.
 */
export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();
  private unlocked = false;

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private ready(name: string, minGap = 0.05): boolean {
    if (!this.ctx || !this.master) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < minGap) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  private env(gain: GainNode, t: number, peak: number, dur: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  /** squishy landing: filtered noise + descending blip */
  squish(intensity: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    if (!this.ready('squish', 0.045)) return;
    const t = this.ctx.currentTime;
    const vol = Math.min(1, intensity);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + vol * 700;
    const g = this.ctx.createGain();
    this.env(g, t, 0.14 * vol + 0.03, 0.14);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.16);

    const o = this.ctx.createOscillator();
    o.type = 'sine';
    const f0 = 220 + Math.random() * 120;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.16);
    const og = this.ctx.createGain();
    this.env(og, t, 0.1 * vol + 0.02, 0.18);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** heavy object thud */
  thud(intensity: number): void {
    if (!this.ctx || !this.master) return;
    if (!this.ready('thud', 0.06)) return;
    const t = this.ctx.currentTime;
    const vol = Math.min(1, intensity);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = this.ctx.createGain();
    this.env(g, t, 0.22 * vol + 0.05, 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** jump boing */
  boing(): void {
    if (!this.ctx || !this.master) return;
    if (!this.ready('boing', 0.05)) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(480, t + 0.14);
    const g = this.ctx.createGain();
    this.env(g, t, 0.12, 0.16);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.18);
  }

  /** grab pop */
  pop(): void {
    if (!this.ctx || !this.master) return;
    if (!this.ready('pop', 0.04)) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.05);
    const g = this.ctx.createGain();
    this.env(g, t, 0.05, 0.07);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.08);
  }

  /** grab released / snapped */
  pip(): void {
    if (!this.ctx || !this.master) return;
    if (!this.ready('pip', 0.04)) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(640, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.08);
    const g = this.ctx.createGain();
    this.env(g, t, 0.06, 0.1);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** item delivered arpeggio */
  chime(): void {
    if (!this.ctx || !this.master) return;
    if (!this.ready('chime', 0.1)) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      const t0 = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.4);
    });
  }

  fanfare(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      const t0 = t + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.55);
    });
  }

  sad(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const notes = [
      { f: 392, d: 0 },
      { f: 311, d: 0.18 },
      { f: 233, d: 0.36 },
    ];
    for (const n of notes) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = n.f;
      const g = this.ctx.createGain();
      const t0 = t + n.d;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.15, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.45);
    }
  }
}
