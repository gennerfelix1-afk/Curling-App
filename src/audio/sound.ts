import type { Game } from '../game/game';

/**
 * Synthesised sound (WebAudio, no assets): stone rumble by speed, collision clack by impulse,
 * sweeping noise by intensity, skip calls via speech synthesis. Created on a user gesture.
 */
export class Sound {
  muted = false;
  /** Speak the skip's calls ("Hard!", "Off!" …). */
  voice = true;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rumbleGain!: GainNode;
  private rumbleFilter!: BiquadFilterNode;
  private sweepGain!: GainNode;
  private noise!: AudioBuffer;
  private eventCursor = 0;
  private lastCall = '';
  private lastCallTime = 0;
  private sweepPhase = 0;

  /** Must be called from a user gesture (browser autoplay policy). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);

    // 2 s of white noise, reused by all sources
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // stone on pebbled ice: low-passed noise
    const rumble = this.loop();
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 200;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.master);

    // brushes: band-passed noise, pulsed with the stroke rate
    const sweep = this.loop();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3800;
    band.Q.value = 0.7;
    this.sweepGain = ctx.createGain();
    this.sweepGain.gain.value = 0;
    sweep.connect(band).connect(this.sweepGain).connect(this.master);
  }

  private loop(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }

  /** Granite on granite. */
  private clack(strength: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(1, 0.15 + strength * 0.85), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    g.connect(this.master);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 2.5;
    src.connect(bp).connect(g);
    src.start(t, Math.random(), 0.12);
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private say(text: string): void {
    if (!this.voice || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace('!', ''));
    u.lang = 'en-US';
    u.rate = 1.25;
    u.pitch = 1.1;
    u.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  /** Follow the game state (call once per frame). */
  update(game: Game, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, t, 0.05);

    // rumble: all moving stones
    let speed = 0;
    for (const s of game.world.stones) {
      if (s.inPlay && s.moving) speed = Math.max(speed, Math.sqrt(s.vx * s.vx + s.vy * s.vy));
    }
    if (game.phase !== 'running' && game.phase !== 'slide' && game.phase !== 'gesture') speed = 0;
    else if (game.phase !== 'running') speed = 1.6; // sliding out of the hack
    this.rumbleGain.gain.setTargetAtTime(Math.min(0.5, speed * 0.16), t, 0.08);
    this.rumbleFilter.frequency.setTargetAtTime(90 + speed * 150, t, 0.08);

    // sweeping: louder and faster strokes with intensity
    let sweep = 0;
    if (game.phase === 'running') {
      for (const sw of game.world.sweepers.state) if (sw.down) sweep = Math.max(sweep, sw.effective);
    }
    this.sweepPhase += dt * (5 + sweep * 9) * Math.PI * 2;
    const pulse = 0.55 + 0.45 * Math.sin(this.sweepPhase);
    this.sweepGain.gain.setTargetAtTime(sweep > 0 ? (0.05 + sweep * 0.22) * pulse : 0, t, 0.02);

    // collisions
    const ev = game.world.events;
    if (ev.length < this.eventCursor) this.eventCursor = 0;
    for (; this.eventCursor < ev.length; this.eventCursor++) {
      const e = ev[this.eventCursor];
      if (e.type === 'collision' && !this.muted) this.clack(Math.min(1, e.impulse / 45));
    }

    // skip calls
    const call = game.call;
    const now = performance.now();
    if (call !== this.lastCall && now - this.lastCallTime > 700) {
      this.lastCall = call;
      this.lastCallTime = now;
      if (call && !this.muted) this.say(call);
    }
  }
}
