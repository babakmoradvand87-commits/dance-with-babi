/* ──────────────────────────────────────────────────────────────
   Dance with Babi — audio.js
   A generative dance-chart engine (no audio files): every track is
   synthesised live with the Web Audio API — four-on-the-floor kicks,
   claps, sidechain-pumped supersaw chords, a root-following bass,
   risers, crashes and an echoing lead hook. The arrangement runs
   intro → drop → verse → build → drop → break → build → finale,
   so the music keeps changing for the whole 2:24 of a dance.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = (window.DWB = window.DWB || {});
  const TAU = Math.PI * 2;

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* fallbacks if a level forgets its own */
  const PROG = [
    [57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59],
  ];
  const MELODY = [76, 72, 69, 72, 76, 79, 74, 71];
  const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

  /* drum maps: step indices inside a bar of `stepsPerBar` eighth notes
     (in an 8-step bar the beats are the even steps 0,2,4,6).
     Patterns follow the globally trending dance genres: tech house,
     afro-house, k-pop, filmi, reggaeton dembow, disco, d'n'b, big room. */
  const DRUMS = {
    waltz:     { kick: [0], clap: [], hat: [2, 4], open: [], bass: [0, 4], pop: [], lead: [2, 5] },
    tech:      { kick: [0, 2, 4, 6], clap: [2, 6], hat: [1, 3, 5, 7], open: [7], bass: [0, 2, 4, 6], pop: [3, 7], lead: [0, 2, 3, 4, 6] },
    afrohouse: { kick: [0, 2, 4, 6], clap: [2, 6], hat: [1, 3, 5, 7], open: [7], bass: [0, 3, 4, 6], pop: [5], lead: [0, 3, 6, 7] },
    kpop:      { kick: [0, 2, 4, 6], clap: [2, 6], hat: [1, 3, 5, 7], open: [7], bass: [0, 2, 4, 6], pop: [3, 7], lead: [0, 2, 4, 6, 7] },
    filmi:     { kick: [0, 2, 4, 6], clap: [4], hat: [1, 3, 5, 7], open: [], bass: [0, 4], pop: [3, 6], lead: [1, 4, 6] },
    dembow:    { kick: [3, 6], clap: [2, 6], hat: [1, 3, 5, 7], open: [7], bass: [0, 3, 6], pop: [2], lead: [3, 6, 7] },
    disco:     { kick: [0, 2, 4, 6], clap: [2, 6], hat: [1, 3, 5, 7], open: [3, 7], bass: [0, 2, 4, 6], pop: [], lead: [0, 4, 6] },
    dnb:       { kick: [0, 7], clap: [4], hat: [0, 1, 2, 3, 4, 5, 6, 7], open: [], bass: [0, 7], pop: [], lead: [2, 5, 6] },
    bigroom:   { kick: [0, 2, 4, 6], clap: [2, 6], hat: [1, 3, 5, 7], open: [7], bass: [0, 2, 4, 6], pop: [3, 7], lead: [0, 1, 2, 3, 4, 5, 6, 7] },
  };
  /* legacy names keep working */
  DRUMS.house = DRUMS.tech;
  DRUMS.pop = DRUMS.disco;
  DRUMS.afro = DRUMS.afrohouse;
  DRUMS.break = DRUMS.dnb;

  /* the shape of a 2:24 dance: eight-bar sections that keep changing */
  const ARR = ["drop", "verse", "build", "drop", "break", "build", "final", "drop"];

  class Sound {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.duck = null;
      this.echo = null;
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
      this._hookIdx = 0;
      /* real-recording mode: the level ships its own mp3 and the game
         clock is the media element's position on the song's beat grid */
      this.fileMode = false;
      this.media = null;          /* HTMLAudioElement */
      this.gridZero = 0;          /* song position (s) that maps to t = 0 */
      this._fileBuf = null;       /* decoded mono buffer of the current song */
      this._bufFor = null;        /* which url _fileBuf belongs to */
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
        comp.threshold.value = -14;
        comp.knee.value = 22;
        comp.ratio.value = 4;
        comp.attack.value = 0.004;
        comp.release.value = 0.24;
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

        /* sidechain bus: chords & lead duck under every kick */
        this.duck = ctx.createGain();
        this.duck.gain.value = 1;
        this.duck.connect(this.musicGain);

        /* echo for the lead hook */
        this.echo = ctx.createDelay(1.5);
        this.echo.delayTime.value = 0.27;
        const fb = ctx.createGain(); fb.gain.value = 0.34;
        const ewet = ctx.createGain(); ewet.gain.value = 0.22;
        this.echo.connect(fb); fb.connect(this.echo);
        this.echo.connect(ewet); ewet.connect(this.musicGain);

        /* a small hall, generated from noise */
        this.convolver = ctx.createConvolver();
        this.convolver.buffer = this._impulse(2.2, 2.6);
        const wet = ctx.createGain();
        wet.gain.value = 0.3;
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
      if (this.media) this.media.muted = !!m;
    }

    /* ── transport ─────────────────────────────────────────── */
    startLevel(level) {
      this.ensure();
      this.level = level;
      this.paused = false;
      this.pointer = 0;
      this.frozen = 0;
      this._hookIdx = 0;
      /* the count-in happens in negative song time: the track starts
         `intro` beats early so the dancers can feel the tempo */
      const lead = level.intro * level.spb;
      if (level.audio) { this._startFile(level); return; }
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

    /* a level with its own recording: t = 0 sits on the song's first
       measured downbeat, so every gate k lands exactly on beat k of the
       real music (gateAt(k) = k * spb). Playback does NOT start at the
       beginning of the file — some songs only start their rhythm seconds
       in — it starts 3 beats before that first downbeat, so the count-in
       is danced to the song's own groove, never to dead air. */
    _startFile(level) {
      this._fileStop();
      this.fileMode = true;
      this.gridZero = level.beatOffset || 0;
      const startPos = Math.max(0, this.gridZero - 3 * level.spb);
      if (typeof Audio !== "undefined") {
        if (!this.media) {
          this.media = new Audio();
          this.media.preload = "auto";
          this.media.addEventListener("error", () => {
            /* the file is missing (e.g. offline first run): fall back to
               the synth engine for this level instead of hanging */
            if (this.fileMode && this.level && this.level.audio) {
              this.level.audio = null;
              this.startLevel(this.level);
            }
          });
        }
        this.media.muted = this.muted;
        if (this.media.getAttribute("src") !== level.audio) {
          this.media.setAttribute("src", level.audio);
        }
        try { this.media.currentTime = startPos; } catch (e) {}
        try {
          const p = this.media.play();
          if (p && p.catch) p.catch(() => {});
        } catch (e) {}
      }
      this._loadFileBuffer(level);
      this._clearTimer();
    }

    /* decode the mp3 once per level into a small mono buffer, so a ring
       hit can replay the song's OWN sound at that exact beat */
    _loadFileBuffer(level) {
      const url = level.audio;
      if (this._bufFor === url) return;
      this._bufFor = url;
      this._fileBuf = null;
      if (typeof fetch !== "function") return;
      fetch(url)
        .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); })
        .then((ab) => {
          const Ctx = this.ctx && this.ctx.constructor;
          const dec = (c) => c.decodeAudioData(ab.slice(0));
          const use = (c) => dec(c).then((buf) => {
            if (this._bufFor !== url) return;
            /* downmix to mono 22 kHz — enough for a percussive hit slice,
               and ~8x smaller than the full-rate stereo decode */
            const sr = 22050;
            const n = Math.floor(buf.duration * sr);
            const mono = (this.ctx || c).createBuffer(1, n, sr);
            const d = mono.getChannelData(0);
            const ch0 = buf.getChannelData(0);
            const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
            const ratio = buf.sampleRate / sr;
            for (let i = 0; i < n; i++) {
              const j = Math.min(buf.length - 1, Math.floor(i * ratio));
              d[i] = (ch0[j] + ch1[j]) * 0.5;
            }
            this._fileBuf = mono;
          });
          if (typeof OfflineAudioContext !== "undefined") {
            try { return use(new OfflineAudioContext(1, 22050, 1)); } catch (e) {}
          }
          if (this.ctx) return use(this.ctx);
          throw new Error("no audio context");
        })
        .catch(() => { if (this._bufFor === url) this._fileBuf = null; });
    }

    /* the ring-entry sound IS the song: replay a short slice of the
       recording starting exactly at the gate's beat, accented */
    _songSlice(pos, streak) {
      if (!this.ctx || !this._fileBuf || this.muted) return;
      const buf = this._fileBuf;
      const start = Math.max(0, Math.min(pos, buf.duration - 0.06));
      const dur = Math.min(0.35, buf.duration - start);
      const ctx = this.ctx;
      const when = this._now();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const peak = Math.min(1.5, 0.85 + Math.min(streak || 0, 12) * 0.05);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
      g.gain.setValueAtTime(peak, when + Math.max(0.02, dur - 0.06));
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(g);
      g.connect(this.sfxGain);
      src.start(when, start, dur + 0.03);
    }

    _fileStop() {
      if (this.media) {
        try { this.media.pause(); this.media.currentTime = 0; } catch (e) {}
      }
      this.fileMode = false;
    }

    mediaEnded() {
      return !!(this.fileMode && this.media && this.media.ended);
    }

    stop() {
      this._clearTimer();
      this._fileStop();
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
      if (this.fileMode) { if (this.media) { try { this.media.pause(); } catch (e) {} } return; }
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
      if (this.fileMode) {
        if (this.media) { try { const p = this.media.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
        return;
      }
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
      if (this.fileMode) {
        const pos = this.media ? this.media.currentTime : 0;
        return pos - this.gridZero;
      }
      if (this.ctx) return this.ctx.currentTime - this.t0;
      if (this.fallbackOrigin !== null) return (performance.now() - this.fallbackOrigin) / 1000;
      return 0;
    }

    _clearTimer() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    /* ── the track ─────────────────────────────────────────── */
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
      const per = L.stepsPerBar || 8;
      const e = spb / 2;                       /* one eighth note */
      n = n + 600000 * per;                    /* keep the grid positive: it is periodic */
      const bar = Math.floor(n / per);
      const st = n % per;
      const prog = L.prog || PROG;
      const chord = prog[bar % prog.length];
      const mel = L.mel || MELODY;
      const D = DRUMS[L.drums] || DRUMS.house;

      /* only 4 bars of intro — the first drop lands within ~8 seconds */
      const sec = bar < 4 ? "intro" : ARR[Math.floor((bar - 4) / 8) % ARR.length];
      const final = sec === "final";
      const drop = sec === "drop" || final;
      const build = sec === "build";
      const intro = sec === "intro";
      const brk = sec === "break";
      const verse = sec === "verse";
      const energetic = drop || build || verse || final;

      /* chords get a seventh, like the real charts */
      const third = chord[1] - chord[0];
      const chord7 = chord.concat([chord[0] + (third === 4 ? 11 : 10)]);
      const root = chord[0] - 24;              /* bass root, two octaves down */

      if (st === 0) {
        if (drop) this._crash(when, final ? 0.22 : 0.15);
        if ((intro && bar >= 2) || build) this._riser(when, e * per * (build ? 4 : 2));
        this._pad(chord7, when, e * per * (brk ? 1.9 : 1.05),
          intro ? 0.75 : brk ? 1.2 : drop ? 1.3 : 0.95);
      }

      /* drums */
      if (!brk) {
        let kickSteps = D.kick;
        if (build) {
          kickSteps = [];
          for (let s = 0; s < per; s += 2) kickSteps.push(s);
        }
        if (kickSteps.indexOf(st) >= 0) {
          this._kick(when, intro ? 0.2 : drop || build ? 0.34 : 0.28);
          if (!intro) this._duckAt(when, spb);
        }
        if ((drop || build) && D.clap.indexOf(st) >= 0) this._clap(when, drop ? 0.13 : 0.09);
        if (build && bar % 8 === 7 && st % 2 === 1) this._snare(when, 0.04 + st * 0.008);
        if (D.hat.indexOf(st) >= 0) this._hat(when, intro ? 0.018 : drop ? 0.038 : 0.028);
        if (drop && D.open.indexOf(st) >= 0 && bar % 2 === 1) this._open(when, 0.05);
      } else if (st === 0) {
        this._kick(when, 0.22);                /* half-time heartbeat in the break */
      }

      /* bass follows the roots — in drops it runs on EVERY eighth note,
         the pumping offbeat bass that makes a track danceable */
      if (energetic && (drop || D.bass.indexOf(st) >= 0)) {
        this._bass(midi(root + (st % 4 === 2 ? 7 : 0)), when, e * (drop ? 0.95 : 1.8), drop ? 0.15 : 0.14);
      } else if (intro && st === 0) {
        this._bass(midi(root), when, e * 3, 0.1);
      }
      if (drop && D.pop && D.pop.indexOf(st) >= 0) {
        this._bass(midi(root + 12), when, e * 0.9, 0.09);
      }

      /* sparkle arp in verses, full lead hook in drops */
      if (!intro && !brk && !build) {
        if (drop) {
          if (D.lead.indexOf(st) >= 0) {
            this._hookIdx++;
            /* a real 4-note hook, repeated every bar — the even bar calls,
               the odd bar answers an octave up: a rhythm built for two
               dancers locking onto each other */
            const answer = bar % 2 === 1;
            const motif = [mel[0], mel[1 % mel.length], mel[2 % mel.length], mel[3 % mel.length]];
            const note = motif[this._hookIdx % 4] + (answer ? 12 : 0);
            this._lead(midi(note), when, e * (final ? 2.2 : 1.6), final ? 0.075 : 0.06);
          }
        } else if (verse) {
          if (st % 2 === 0) this._harp(midi(chord7[st % chord7.length] + 12), when, 0.05);
          if (st === per - 2) this._lead(midi(mel[bar % mel.length]), when, e * 2, 0.04);
        }
      } else if (brk) {
        if (st % 2 === 0) this._harp(midi(chord7[(st / 2) % chord7.length] + 12 + (bar % 2 ? 7 : 0)), when, 0.045);
        if (st === 0) this._lead(midi(mel[bar % mel.length] + 12), when, e * per * 0.9, 0.05);
      }
    }

    /* sidechain: chords & lead pump down when the kick lands */
    _duckAt(when, spb) {
      if (!this.duck) return;
      const g = this.duck.gain;
      g.cancelScheduledValues(when);
      g.setValueAtTime(1, when);
      g.linearRampToValueAtTime(0.3, when + 0.03);
      g.exponentialRampToValueAtTime(1, when + Math.max(0.14, spb * 0.92));
    }

    /* ── instruments ───────────────────────────────────────── */
    _env(gain, when, attack, dur, peak) {
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    }

    /* supersaw pad — the big chord sound of dance music */
    _pad(chord, when, dur, level) {
      const ctx = this.ctx;
      const peak = 0.048 * (level == null ? 1 : level);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + Math.min(0.08, dur * 0.25));
      g.gain.setValueAtTime(Math.max(0.001, peak), when + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2400, when);
      lp.frequency.exponentialRampToValueAtTime(650, when + dur);
      lp.Q.value = 0.4;
      g.connect(lp);
      lp.connect(this.duck);
      chord.forEach((n) => {
        [-10, -4, 0, 4, 10].forEach((det) => {
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

    /* plucky arp */
    _harp(freq, when, peak) {
      const ctx = this.ctx;
      const dur = 0.5;
      const g = ctx.createGain();
      this._env(g, when, 0.004, dur, peak);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(5200, when);
      lp.frequency.exponentialRampToValueAtTime(1500, when + dur);
      g.connect(lp);
      lp.connect(this.duck);
      [["triangle", 0, 1], ["sine", 1205, 0.1]].forEach((v) => {
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

    /* the lead hook: detuned saw + square, vibrato, echo */
    _lead(freq, when, dur, peak) {
      const ctx = this.ctx;
      dur = Math.max(dur, 0.25);
      const g = ctx.createGain();
      this._env(g, when, 0.012, dur, peak);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 5600;
      lp.Q.value = 0.7;
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.6;
      const vibG = ctx.createGain();
      vibG.gain.value = freq * 0.007;
      vib.connect(vibG);
      [["sawtooth", 0, 1], ["square", 6, 0.32]].forEach((v) => {
        const o = ctx.createOscillator();
        o.type = v[0];
        o.frequency.value = freq;
        vibG.connect(o.detune);
        const og = ctx.createGain();
        og.gain.value = v[1];
        o.connect(og);
        og.connect(lp);
        o.start(when);
        o.stop(when + dur + 0.1);
      });
      vib.start(when);
      vib.stop(when + dur + 0.1);
      lp.connect(g);
      g.connect(this.duck);
      g.connect(this.echo);
    }

    /* bass: sub sine + filtered saw, following the chord roots */
    _bass(freq, when, dur, peak) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      this._env(g, when, 0.015, dur, peak);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, when);
      lp.frequency.exponentialRampToValueAtTime(240, when + dur);
      lp.Q.value = 2.5;
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = freq;
      const saw = ctx.createOscillator();
      saw.type = "sawtooth";
      saw.frequency.value = freq;
      const sg = ctx.createGain();
      sg.gain.value = 0.55;
      sub.connect(g);
      saw.connect(sg);
      sg.connect(lp);
      lp.connect(g);
      g.connect(this.musicGain);
      sub.start(when); sub.stop(when + dur + 0.05);
      saw.start(when); saw.stop(when + dur + 0.05);
    }

    _kick(when, peak) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(155, when);
      o.frequency.exponentialRampToValueAtTime(43, when + 0.11);
      const g = ctx.createGain();
      this._env(g, when, 0.003, 0.3, peak);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(when);
      o.stop(when + 0.36);
      /* beater click */
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3000;
      const cg = ctx.createGain();
      this._env(cg, when, 0.001, 0.03, peak * 0.35);
      src.connect(hp); hp.connect(cg); cg.connect(this.musicGain);
      src.start(when);
      src.stop(when + 0.05);
    }

    _clap(when, peak) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600;
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      const t = when;
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.011, 0.023].forEach((dt) => {
        g.gain.exponentialRampToValueAtTime(peak, t + dt + 0.002);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.25), t + dt + 0.009);
      });
      g.gain.exponentialRampToValueAtTime(peak, t + 0.032);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      src.connect(bp); bp.connect(g); g.connect(this.musicGain);
      src.start(when);
      src.stop(when + 0.3);
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

    _hat(when, peak, isOpen) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7600;
      const g = ctx.createGain();
      this._env(g, when, 0.001, isOpen ? 0.16 : 0.045, peak);
      src.connect(hp); hp.connect(g); g.connect(this.musicGain);
      src.start(when);
      src.stop(when + (isOpen ? 0.2 : 0.08));
    }

    _open(when, peak) { this._hat(when, peak, true); }

    _crash(when, peak) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 1.8);
      src.connect(hp); hp.connect(g); g.connect(this.musicGain);
      src.start(when);
      src.stop(when + 1.9);
    }

    _riser(when, dur) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(420, when);
      bp.frequency.exponentialRampToValueAtTime(7800, when + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.055, when + dur * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.02);
      src.connect(bp); bp.connect(g); g.connect(this.musicGain);
      src.start(when);
      src.stop(when + dur + 0.05);
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

    hit(streak, atT) {
      /* in a real recording the hit sound is the song's own beat at that
         moment — replay a slice of the track, never a separate synth */
      if (this.fileMode) {
        if (this._fileBuf && typeof atT === "number") this._songSlice(atT + this.gridZero, streak);
        return;
      }
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
