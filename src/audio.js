/* ──────────────────────────────────────────────────────────────
   Dance with Babi — audio.js
   A tiny generative waltz (no audio files) + sound effects.
   Everything is synthesised with the Web Audio API.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = (window.DWB = window.DWB || {});
  const TAU = Math.PI * 2;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* one chord per bar, A minor, eight-bar waltz loop */
  const PROG = [
    [57, 60, 64], // Am
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [53, 57, 60], // F
    [48, 52, 55], // C
    [48, 52, 55], // C
    [55, 59, 62], // G
    [55, 59, 62], // G
  ];
  const MELODY = [76, 72, 69, 72, 76, 79, 74, 71];
  const ARP_PATTERN = [1, 0.5, 0.72, 0.44, 0.82, 0.56];
  const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

  /* one entry per feel: where the kick, the snare, the hats, the bass and
     the lead land inside a bar of `stepsPerBar` eighth notes */
  const DRUMS = {
    waltz: { kick: [0], snare: [], hat: [3], bass: [0, 3], lead: [2, 5] },
    house: { kick: [0, 4], snare: [2, 6], hat: [1, 3, 5, 7], bass: [0, 4], lead: [2, 6] },
    pop: { kick: [0], snare: [4], hat: [2, 6], bass: [0, 4], lead: [3, 7] },
    afro: { kick: [0, 3, 6], snare: [2, 5], hat: [1, 3, 5, 7], bass: [0, 3, 6], lead: [1, 4, 7] },
    break: { kick: [0, 6], snare: [4], hat: [1, 2, 3, 5, 6, 7], bass: [0, 4], lead: [2, 5] },
  };

  class Sound {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.convolver = null;
      this.level = null;
      this.t0 = 0;
      this.frozen = 0;
      this.paused = true;
      this.pointer = 0;
      this.timer = null;
      this.fallbackOrigin = null;
      this.muted = false;
      this.ready = false;
    }

    /* ── setup ─────────────────────────────────────────────── */
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return true;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        this.ctx = ctx;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 24;
        comp.ratio.value = 3;
        comp.attack.value = 0.006;
        comp.release.value = 0.22;
        comp.connect(ctx.destination);

        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.82;
        this.master.connect(comp);

        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 0.9;
        this.musicGain.connect(this.master);

        this.sfxGain = ctx.createGain();
        this.sfxGain.gain.value = 0.85;
        this.sfxGain.connect(this.master);

        /* a small hall, generated from noise */
        this.convolver = ctx.createConvolver();
        this.convolver.buffer = this._impulse(2.2, 2.6);
        const wet = ctx.createGain();
        wet.gain.value = 0.32;
        this.convolver.connect(wet);
        wet.connect(this.master);
        this.musicGain.connect(this.convolver);

        this.noise = this._noiseBuffer();
        this.ready = true;
        return true;
      } catch (e) {
        return false;
      }
    }

    _impulse(seconds, decay) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const data = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2);
        }
      }
      return buf;
    }

    _noiseBuffer() {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 0.6);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    setMuted(m) {
      this.muted = !!m;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.82;
    }

    /* ── transport ─────────────────────────────────────────── */
    startLevel(level) {
      this.ensure();
      this.level = level;
      this.paused = false;
      this.pointer = 0;
      this.frozen = 0;
      /* the count-in happens in negative song time: the waltz starts
         `intro` beats early so the dancers can feel the tempo */
      const lead = level.intro * level.spb;
      this.pointer = -Math.round(level.intro * 2);
      if (this.ctx) {
        this.t0 = this.ctx.currentTime + 0.16 + lead;
        this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.musicGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      } else {
        this.fallbackOrigin = performance.now() + lead * 1000;
      }
      this._clearTimer();
      this.timer = setInterval(() => this._schedule(), 50);
      this._schedule();
    }

    stop() {
      this._clearTimer();
      this.level = null;
      this.paused = true;
      if (this.ctx && this.musicGain) {
        const now = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      }
    }

    pause() {
      if (this.paused) return;
      this.frozen = this.songTime();
      this.paused = true;
      if (this.ctx && this.musicGain) {
        const now = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.08);
      }
    }

    resume() {
      if (!this.paused) return;
      this.paused = false;
      if (this.ctx) {
        this.t0 = this.ctx.currentTime - this.frozen;
        const now = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(0.0001, now);
        this.musicGain.gain.linearRampToValueAtTime(0.9, now + 0.2);
      } else {
        this.fallbackOrigin = performance.now() - this.frozen * 1000;
      }
      this._schedule();
    }

    songTime() {
      if (this.paused) return this.frozen;
      if (this.ctx) return this.ctx.currentTime - this.t0;
      if (this.fallbackOrigin !== null) return (performance.now() - this.fallbackOrigin) / 1000;
      return 0;
    }

    _clearTimer() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    /* ── the waltz ─────────────────────────────────────────── */
    _schedule() {
      if (!this.ctx || this.paused || !this.level) return;
      const step = this.level.spb / 2;
      const horizon = this.songTime() + 0.45;
      let guard = 0;
      while (this.pointer * step < horizon && guard++ < 512) {
        const n = this.pointer++;
        const when = this.t0 + n * step;
        if (when > this.ctx.currentTime + 0.005) this._emit(n, when);
      }
    }

    _emit(n, when) {
      const L = this.level;
      const spb = L.spb;
      const per = L.stepsPerBar || 6;
      n = n + 600000 * per;            /* keep the grid positive: it is periodic */
      const bar = Math.floor(n / per);
      const st = n % per;
      const prog = L.prog || PROG;
      const chord = prog[bar % prog.length];
      const mel = L.mel || MELODY;
      const D = DRUMS[L.drums] || DRUMS.waltz;
      const e = spb / 2;               /* an eighth */

      if (st === 0) this._pad(chord, when, e * per * 1.02);

      for (let i = 0; i < D.bass.length; i++) {
        if (D.bass[i] === st) {
          const up = i % 2 === 1;
          this._bass(midi(chord[0] - 12 + (up ? 7 : 0)), when, e * 1.7, up ? 0.10 : 0.16);
        }
      }

      const arp = chord[st % chord.length] + 12 + (st === per - 1 ? 12 : 0);
      this._harp(midi(arp), when, 0.055 * ARP_PATTERN[st % ARP_PATTERN.length]);

      for (let i = 0; i < D.lead.length; i++) {
        if (D.lead[i] === st) {
          const lift = st > per / 2 ? 12 : 0;
          this._bell(midi(mel[bar % mel.length] + lift), when, 0.045);
        }
      }

      if (D.kick.indexOf(st) >= 0) this._kick(when, 0.30);
      if (D.snare.indexOf(st) >= 0) this._snare(when, L.drums === "break" ? 0.10 : 0.085);
      if (D.hat.indexOf(st) >= 0) this._hat(when, L.drums === "break" ? 0.030 : 0.038);
    }

    /* ── instruments ───────────────────────────────────────── */
    _env(gain, when, attack, dur, peak) {
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    }

    _harp(freq, when, peak) {
      const ctx = this.ctx;
      const dur = 1.15;
      const g = ctx.createGain();
      this._env(g, when, 0.004, dur, peak);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(4200, when);
      lp.frequency.exponentialRampToValueAtTime(1200, when + dur);
      g.connect(lp);
      lp.connect(this.musicGain);
      [["triangle", 0, 1], ["sine", 4, 0.45], ["sine", 1202, 0.12]].forEach((v) => {
        const o = ctx.createOscillator();
        o.type = v[0];
        o.frequency.value = freq;
        o.detune.value = v[1];
        const og = ctx.createGain();
        og.gain.value = v[2];
        o.connect(og);
        og.connect(g);
        o.start(when);
        o.stop(when + dur + 0.05);
      });
    }

    _bell(freq, when, peak) {
      const ctx = this.ctx;
      const dur = 2.2;
      const g = ctx.createGain();
      this._env(g, when, 0.01, dur, peak);
      g.connect(this.musicGain);
      [[1, 1], [2.01, 0.34], [3.02, 0.14], [4.98, 0.06]].forEach((v) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq * v[0];
        const og = ctx.createGain();
        og.gain.value = v[1];
        o.connect(og);
        og.connect(g);
        o.start(when);
        o.stop(when + dur + 0.05);
      });
    }

    _pad(chord, when, dur) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.055, when + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 940;
      lp.Q.value = 0.5;
      g.connect(lp);
      lp.connect(this.musicGain);
      chord.forEach((n) => {
        [-6, 6].forEach((det) => {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = midi(n);
          o.detune.value = det;
          o.connect(g);
          o.start(when);
          o.stop(when + dur + 0.05);
        });
      });
    }

    _bass(freq, when, dur, peak) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      this._env(g, when, 0.02, dur, peak);
      g.connect(this.musicGain);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.value = freq * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      o.start(when); o.stop(when + dur + 0.05);
      o2.start(when); o2.stop(when + dur + 0.05);
    }

    _kick(when, peak) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(136, when);
      o.frequency.exponentialRampToValueAtTime(44, when + 0.12);
      const g = ctx.createGain();
      this._env(g, when, 0.004, 0.26, peak);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(when);
      o.stop(when + 0.32);
    }

    _snare(when, peak) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1900;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      this._env(g, when, 0.002, 0.15, peak);
      src.connect(bp); bp.connect(g); g.connect(this.musicGain);
      src.start(when);
      src.stop(when + 0.2);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 186;
      const g2 = ctx.createGain();
      this._env(g2, when, 0.003, 0.09, peak * 0.55);
      o.connect(g2); g2.connect(this.musicGain);
      o.start(when); o.stop(when + 0.14);
    }

    _hat(when, peak) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = 6800;
      const g = ctx.createGain();
      this._env(g, when, 0.001, 0.045, peak);
      src.connect(bp); bp.connect(g); g.connect(this.musicGain);
      src.start(when);
      src.stop(when + 0.08);
    }

    _tick(when, peak) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 2.2;
      const g = ctx.createGain();
      this._env(g, when, 0.002, 0.075, peak);
      src.connect(bp); bp.connect(g); g.connect(this.musicGain);
      src.start(when);
      src.stop(when + 0.12);
    }

    /* ── sound effects ─────────────────────────────────────── */
    _now(delay) {
      if (!this.ctx) return 0;
      return this.ctx.currentTime + (delay || 0.001);
    }

    hit(streak) {
      if (!this.ready || this.muted) return;
      const when = this._now();
      const step = PENTA[Math.min(PENTA.length - 1, streak % PENTA.length)];
      const f = midi(84 + step);
      const ctx = this.ctx;
      const g = ctx.createGain();
      this._env(g, when, 0.004, 1.4, 0.14);
      g.connect(this.sfxGain);
      g.connect(this.convolver);
      [[1, 1], [2.02, 0.3]].forEach((v) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * v[0];
        const og = ctx.createGain();
        og.gain.value = v[1];
        o.connect(og); og.connect(g);
        o.start(when); o.stop(when + 1.5);
      });
    }

    soft(kind) {
      if (!this.ready || this.muted) return;
      const when = this._now();
      const ctx = this.ctx;
      const g = ctx.createGain();
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(kind === "early" ? 196 : 165, when);
      o.frequency.exponentialRampToValueAtTime(120, when + 0.22);
      this._env(g, when, 0.01, 0.28, 0.07);
      o.connect(g); g.connect(this.sfxGain);
      o.start(when); o.stop(when + 0.35);
    }

    tangle() {
      if (!this.ready || this.muted) return;
      const when = this._now();
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(420, when);
      bp.frequency.exponentialRampToValueAtTime(1500, when + 0.3);
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      this._env(g, when, 0.01, 0.34, 0.06);
      src.connect(bp); bp.connect(g); g.connect(this.sfxGain);
      src.start(when); src.stop(when + 0.4);
    }

    complete() {
      if (!this.ready || this.muted) return;
      const when = this._now(0.05);
      [72, 76, 79, 84].forEach((n, i) => {
        const ctx = this.ctx;
        const g = ctx.createGain();
        this._env(g, when + i * 0.13, 0.01, 1.8, 0.11);
        g.connect(this.sfxGain);
        g.connect(this.convolver);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = midi(n);
        o.connect(g);
        o.start(when + i * 0.13);
        o.stop(when + i * 0.13 + 2);
      });
    }

    ui() {
      if (!this.ready || this.muted) return;
      const when = this._now();
      const ctx = this.ctx;
      const g = ctx.createGain();
      this._env(g, when, 0.003, 0.16, 0.05);
      g.connect(this.sfxGain);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      o.start(when); o.stop(when + 0.2);
    }
  }

  /* ── a lazy singleton: created on the first user gesture ──── */
  DWB.Sound = Sound;
  DWB.TAU = DWB.TAU || TAU;
})();
