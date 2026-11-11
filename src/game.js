/* ──────────────────────────────────────────────────────────────
   Dance with Babi — game.js
   The phone is a tray, and a marble rolls on it. Tip the phone any
   way at all and the marble runs downhill; your job is to land it
   in the next ring exactly when the waltz beats.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const LEVELS = DWB.LEVELS;
  const MOTION = DWB.Motion;
  const clamp = DWB.clamp;
  const TAU = Math.PI * 2;

  const GRAB_RANGE = 0.24;   /* fraction of the screen for a full tilt */
  const GRIP_GRACE = 0.45;   /* you may lose your grip for this long */
  const PAD_RATE = 3.2;      /* how fast a key tips the tray */
  const RIM_BOUNCE = 0.42;
  const RIM_PENALTY = 0.9;   /* how hard the marble must hit the rim to count */
  const FOLLOW = 22;         /* how quickly the tray answers your hands */

  /* judged on the beat: how close is the marble to the ring centre */
  const JUDGE = [
    { d: "perfect", q: 3, points: 100, label: "perfect" },
    { d: "good", q: 2, points: 60, label: "good" },
    { d: "edge", q: 1, points: 30, label: "on the edge" },
  ];

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
  };

  class Game {
    constructor() {
      this.el = {
        stage: document.getElementById("stage"),
        topbar: document.getElementById("topbar"),
        screens: document.getElementById("screens"),
        hudLevel: document.getElementById("hud-level"),
        hudProgress: document.getElementById("hud-progress"),
        hudScore: document.getElementById("hud-score"),
        hudCombo: document.getElementById("hud-combo"),
        countin: document.getElementById("countin"),
        hint: document.getElementById("hint"),
        ctl: document.getElementById("ctl"),
        motionBtn: document.getElementById("btn-motion"),
        motionLabel: document.getElementById("motion-label"),
        motionNote: document.getElementById("motion-note"),
        sensor: document.getElementById("sensor"),
        sensorState: document.getElementById("sensor-state"),
        sensorRaw: document.getElementById("sensor-raw"),
        sensorTilt: document.getElementById("sensor-tilt"),
        judge: document.getElementById("judge"),
        grid: document.getElementById("level-grid"),
        sound: document.getElementById("btn-sound"),
        pause: document.getElementById("btn-pause"),
        resKicker: document.getElementById("res-kicker"),
        resTitle: document.getElementById("res-title"),
        resStars: document.getElementById("res-stars"),
        resScore: document.getElementById("res-score"),
        resBest: document.getElementById("res-best"),
        resBreak: document.getElementById("res-breakdown"),
        again: document.getElementById("btn-again"),
        next: document.getElementById("btn-next"),
      };

      this.stage = new DWB.Stage(this.el.stage);
      this.sound = new DWB.Sound();
      this.sound.setMuted(store.get("dwb.muted", false));
      this.el.sound.classList.toggle("muted", this.sound.muted);

      this.state = "title";
      this.mode = store.get("dwb.mode", "duet") || "duet";
      this.li = 0;
      this.level = null;
      this.gates = [];
      this.nextGate = 0;
      this.heldBy = [false, false];
      this.lostGrip = 0;
      this.gripped = false;
      this.mx = 0; this.mz = 0;          /* the marble, in tray units */
      this.vx = 0; this.vz = 0;
      this.tiltX = 0; this.tiltY = 0;    /* where the tray is tipped right now */
      this.pads = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.counts = { 3: 0, 2: 0, 1: 0, miss: 0 };
      this.babiMood = 0;
      this.beatPhase = -1;
      this.pointers = new Map();
      this.keys = { w: 0, s: 0, a: 0, d: 0, up: 0, down: 0, left: 0, right: 0 };
      this.lastT = 0;
      this.resumeState = "playing";
      this.shake = 0;

      this.bindUI();
      this.bindInput();
      /* only switch on by itself where no permission prompt is needed */
      if (MOTION && !MOTION.needsPermission()) MOTION.enable().then(() => this.syncMotionUI());
      this.renderLevels();
      this.setMode(this.mode);
      this.show("title");
      this.lastT = performance.now() / 1000;
      requestAnimationFrame(this.frame);
    }

    /* ── screens ───────────────────────────────────────────── */
    show(name) {
      const map = {
        title: "screen-title",
        levels: "screen-levels",
        howto: "screen-howto",
        pause: "screen-pause",
        results: "screen-results",
      };
      document.querySelectorAll("#screens .screen").forEach((s) => s.classList.add("hidden"));
      this.el.screens.classList.remove("hidden");
      if (name && map[name]) {
        const el = document.getElementById(map[name]);
        if (el) {
          el.classList.remove("hidden");
          el.style.animation = "none";
          void el.offsetWidth;
          el.style.animation = "";
        }
      } else {
        this.el.screens.classList.add("hidden");
      }
    }

    setMode(mode) {
      this.mode = mode === "solo" ? "solo" : "duet";
      store.set("dwb.mode", this.mode);
      document.querySelectorAll("[data-mode]").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === this.mode);
      });
    }

    /* ── level list ────────────────────────────────────────── */
    unlocked() {
      return LEVELS.length;
    }

    best(id) { return store.get("dwb.best." + id, null); }

    renderLevels() {
      const grid = this.el.grid;
      grid.innerHTML = "";
      const unlocked = this.unlocked();
      LEVELS.forEach((lv, i) => {
        const locked = i >= unlocked;
        const card = document.createElement("button");
        card.className = "level-card" + (locked ? " locked" : "");
        card.dataset.level = String(i);
        card.setAttribute("aria-label", lv.name + (locked ? " (locked)" : ""));

        const cv = document.createElement("canvas");
        card.appendChild(cv);

        const body = document.createElement("div");
        body.className = "lc-body";
        const h = document.createElement("h3");
        h.textContent = lv.name;
        const p = document.createElement("p");
        p.textContent = lv.subtitle;
        const meta = document.createElement("div");
        meta.className = "lc-meta";
        meta.textContent = (lv.style ? lv.style + " · " : "") + lv.bpm + " bpm · " + lv.gates + " rings";
        body.appendChild(h);
        body.appendChild(p);
        body.appendChild(meta);

        const best = this.best(lv.id);
        if (best) {
          const stars = document.createElement("div");
          stars.className = "lc-stars";
          for (let s = 0; s < 3; s++) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.innerHTML = '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"/>';
            if (s < best.stars) svg.classList.add("on");
            stars.appendChild(svg);
          }
          body.appendChild(stars);
        } else {
          const m2 = document.createElement("div");
          m2.className = "lc-meta";
          m2.textContent = "not danced yet";
          body.appendChild(m2);
        }

        card.appendChild(body);
        grid.appendChild(card);
        DWB.drawLevelPreview(cv, lv);
      });
    }

    /* ── ui wiring ─────────────────────────────────────────── */
    bindUI() {
      this.el.screens.addEventListener("click", (e) => {
        const go = e.target.closest("[data-go]");
        if (go) {
          this.sound.ensure();
          this.sound.ui();
          const to = go.dataset.go;
          if (to === "levels") {
            if (this.state !== "playing" && this.state !== "countin") {
              this.sound.stop();
              this.state = "levels";
              this.el.topbar.classList.add("hidden");
              this.el.hint.classList.add("hidden");
            }
            this.renderLevels();
          }
          this.show(to);
          return;
        }
        const modeBtn = e.target.closest("[data-mode]");
        if (modeBtn) {
          this.sound.ensure();
          this.sound.ui();
          this.setMode(modeBtn.dataset.mode);
          return;
        }
        const pauseBtn = e.target.closest("[data-pause]");
        if (pauseBtn) {
          this.sound.ui();
          const what = pauseBtn.dataset.pause;
          if (what === "resume") this.togglePause();
          else if (what === "restart") this.start(this.li);
          else this.quit();
          return;
        }
        const card = e.target.closest("[data-level]");
        if (card) {
          if (card.classList.contains("locked")) return;
          this.sound.ensure();
          this.sound.ui();
          this.start(Number(card.dataset.level));
        }
      });

      if (this.el.motionBtn) {
        this.el.motionBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.sound.ensure();
          this.askGyro(true);
        });
      }

      this.el.pause.addEventListener("click", () => this.togglePause());
      this.el.sound.addEventListener("click", () => {
        this.sound.setMuted(!this.sound.muted);
        store.set("dwb.muted", this.sound.muted);
        this.el.sound.classList.toggle("muted", this.sound.muted);
        if (!this.sound.muted) { this.sound.ensure(); this.sound.ui(); }
      });

      this.el.again.addEventListener("click", () => this.start(this.li));
      this.el.next.addEventListener("click", () => this.start(Math.min(LEVELS.length - 1, this.li + 1)));

      window.addEventListener("resize", () => this.stage.resize());
      window.addEventListener("orientationchange", () => setTimeout(() => this.stage.resize(), 250));
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && (this.state === "playing" || this.state === "countin")) this.togglePause();
      });
    }

    /* ── the gyroscope ─────────────────────────────────────── */
    gyroLive() {
      return !!(MOTION && MOTION.enabled && MOTION.has);
    }

    /* must run inside a real user gesture (iOS asks first) */
    askGyro(force) {
      if (!MOTION) return;
      MOTION.enable(force).then((ok) => {
        this.gyroAllowed = ok;
        if (ok) MOTION.calibrate();
        this.syncMotionUI();
      });
    }

    /* keep the little label honest about what is actually driving the tray */
    syncMotionUI() {
      if (MOTION) MOTION.tick();
      const live = this.gyroLive();
      const el = this.el.ctl;
      if (el) {
        el.textContent = live
          ? "motion " + (MOTION.flip < 0 ? "↺" : "↻")
          : "touch · keyboard";
        el.classList.toggle("live", live);
      }
      if (this.el.motionBtn) {
        this.el.motionBtn.classList.toggle("live", live);
        this.el.motionBtn.classList.toggle("bad", MOTION.state === "denied" || MOTION.state === "unsupported");
      }
      if (this.el.motionLabel) {
        this.el.motionLabel.textContent = live ? MOTION.statusText() : "Gyroscope: " + MOTION.statusText();
      }
      if (this.el.motionNote) {
        this.el.motionNote.textContent = MOTION.note || "";
        this.el.motionNote.classList.toggle("hidden", !MOTION.note);
      }
    }

    setControlChip() { this.syncMotionUI(); }

    /* a plain read-out so you can *see* whether the sensor is alive */
    syncSensorPanel() {
      if (!this.el.sensor) return;
      const now = performance.now();
      if (now - (this._sensorAt || 0) < 110) return;
      this._sensorAt = now;
      const live = this.gyroLive();
      this.el.sensor.classList.toggle("live", live);
      if (this.el.sensorState) this.el.sensorState.textContent = MOTION.statusText();
      if (this.el.sensorRaw) {
        this.el.sensorRaw.textContent = MOTION.has
          ? "beta " + MOTION.raw.beta.toFixed(0) + "° · gamma " + MOTION.raw.gamma.toFixed(0) + "° · " + MOTION.raw.count + " samples"
          : "no samples yet";
      }
      if (this.el.sensorTilt) {
        const d = MOTION.degrees();
        this.el.sensorTilt.textContent = MOTION.has
          ? "tilt " + d[0].toFixed(0) + "° / " + d[1].toFixed(0) + "°"
          : "tilt —";
      }
    }

    /* ── input: two thumbs, one at each end of the phone ───── */
    zoneFor(y) {
      if (this.mode === "solo") return 0;
      /* player one holds the near end (bottom), player two the far end */
      return y < this.stage.h * 0.5 ? 1 : 0;
    }

    bindInput() {
      const cv = this.el.stage;
      const pos = (e) => {
        const r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      cv.addEventListener("pointerdown", (e) => {
        this.sound.ensure();
        this.askGyro();
        if (this.state !== "playing" && this.state !== "countin") return;
        const p = pos(e);
        const zone = this.zoneFor(p.y);
        this.pointers.set(e.pointerId, { zone: zone, ax: p.x, ay: p.y, x: 0, y: 0 });
        this.heldBy[zone] = true;
        if (this.mode === "solo") this.heldBy = [true, true];
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        e.preventDefault();
      });

      cv.addEventListener("pointermove", (e) => {
        const d = this.pointers.get(e.pointerId);
        if (!d) return;
        e.preventDefault();
        if (this.gyroLive()) return;         /* the gyroscope is steering */
        /* with no gyroscope, a drag becomes a little joystick */
        const p = pos(e);
        const sc = this.stage.h * GRAB_RANGE;
        d.x = clamp((p.x - d.ax) / sc, -1, 1);
        d.y = clamp((d.ay - p.y) / sc, -1, 1);
        this.pads[d.zone].x = d.x;
        this.pads[d.zone].y = d.y;
      });

      const release = (e) => {
        const d = this.pointers.get(e.pointerId);
        if (d) {
          this.heldBy[d.zone] = false;
          this.pads[d.zone].x = 0;
          this.pads[d.zone].y = 0;
          if (this.mode === "solo") this.heldBy = [false, false];
        }
        this.pointers.delete(e.pointerId);
      };
      cv.addEventListener("pointerup", release);
      cv.addEventListener("pointercancel", release);
      cv.addEventListener("pointerleave", release);

      window.addEventListener("touchstart", () => this.askGyro(), { passive: true });
      window.addEventListener("pointerdown", () => {
        if (!this.gyroLive()) this.askGyro();
      }, true);

      /* some phones lean the other way round — one tap puts it right */
      if (this.el.ctl) {
        this.el.ctl.addEventListener("click", () => {
          if (!this.gyroLive()) return;
          MOTION.flip = -MOTION.flip;
          this.setControlChip();
          this.popJudge(MOTION.flip > 0 ? "lean ↻" : "lean ↺", "soft");
        });
      }

      window.addEventListener("keydown", (e) => {
        if (e.repeat) {
          if (e.code.indexOf("Arrow") === 0) e.preventDefault();
          return;
        }
        switch (e.code) {
          case "KeyW": this.keys.w = 1; break;
          case "KeyS": this.keys.s = 1; break;
          case "KeyA": this.keys.a = 1; break;
          case "KeyD": this.keys.d = 1; break;
          case "ArrowUp": this.keys.up = 1; e.preventDefault(); break;
          case "ArrowDown": this.keys.down = 1; e.preventDefault(); break;
          case "ArrowLeft": this.keys.left = 1; e.preventDefault(); break;
          case "ArrowRight": this.keys.right = 1; e.preventDefault(); break;
          case "Escape": case "KeyP":
            if (this.state === "playing" || this.state === "countin" || this.state === "paused") {
              this.togglePause();
            }
            break;
          case "KeyM": this.el.sound.click(); break;
          default: return;
        }
        this.sound.ensure();
      });

      window.addEventListener("keyup", (e) => {
        switch (e.code) {
          case "KeyW": this.keys.w = 0; break;
          case "KeyS": this.keys.s = 0; break;
          case "KeyA": this.keys.a = 0; break;
          case "KeyD": this.keys.d = 0; break;
          case "ArrowUp": this.keys.up = 0; break;
          case "ArrowDown": this.keys.down = 0; break;
          case "ArrowLeft": this.keys.left = 0; break;
          case "ArrowRight": this.keys.right = 0; break;
          default: break;
        }
      });

      window.addEventListener("blur", () => {
        this.keys = { w: 0, s: 0, a: 0, d: 0, up: 0, down: 0, left: 0, right: 0 };
        this.pointers.clear();
        this.heldBy = [false, false];
      });
    }

    /* ── lifecycle ─────────────────────────────────────────── */
    start(i) {
      const lv = LEVELS[i];
      if (!lv) return;
      this.li = i;
      this.level = lv;
      if (this.stage.reset) this.stage.reset();
      else { this.stage.particles.length = 0; this.stage.babi.ready = false; }

      this.gates = [];
      for (let k = 0; k < lv.gates; k++) {
        this.gates.push({
          x: lv.gateX(k),
          z: lv.gateZ(k),
          expected: lv.gateAt(k),
          state: 0, q: 0, flash: 0,
        });
      }
      this.nextGate = 0;
      this.heldBy = [false, false];
      this.pads = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
      this.mx = 0; this.mz = 0;
      this.vx = 0; this.vz = 0;
      this.tiltX = 0; this.tiltY = 0;
      if (MOTION) MOTION.setRange(lv.tiltRange);
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.counts = { 3: 0, 2: 0, 1: 0, miss: 0 };
      this.babiMood = 0;
      this.beatPhase = -1;
      this.pointers.clear();
      this.keys = { w: 0, s: 0, a: 0, d: 0, up: 0, down: 0, left: 0, right: 0 };
      this.lastCount = null;
      this.shake = 0;

      this.sound.ensure();
      this.sound.startLevel(lv);
      if (MOTION && MOTION.enabled) MOTION.calibrate();
      this.state = "countin";
      this.el.topbar.classList.remove("hidden");
      this.el.countin.classList.remove("hidden");
      this.el.hint.textContent = this.gyroLive()
        ? "one thumb at each end of the phone — then tip it"
        : this.mode === "solo"
          ? "drag anywhere (or WASD) to tip the tray"
          : "a thumb each: WASD and the arrows — tip it together";
      this.el.hint.classList.remove("hidden");
      this.el.hudLevel.textContent = lv.name;
      this.setControlChip();
      this.el.hudProgress.style.width = "0%";
      this.setHud();
      this.show(null);
    }

    quit() {
      this.sound.stop();
      this.state = "levels";
      this.el.topbar.classList.add("hidden");
      this.el.countin.classList.add("hidden");
      this.el.hint.classList.add("hidden");
      this.renderLevels();
      this.show("levels");
    }

    togglePause() {
      if (this.state === "paused") {
        this.state = this.resumeState;
        this.sound.resume();
        if (MOTION && MOTION.enabled) MOTION.calibrate();
        this.show(null);
        this.el.countin.classList.toggle("hidden", this.state !== "countin");
        this.el.hint.classList.toggle("hidden", this.state !== "countin");
        return;
      }
      if (this.state !== "playing" && this.state !== "countin") return;
      this.resumeState = this.state;
      this.state = "paused";
      this.sound.pause();
      this.pointers.clear();
      this.heldBy = [false, false];
      this.show("pause");
    }

    /* ── the swing of the dance ────────────────────────────── */
    update(dt) {
      /* gates fade out after a hit */
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.9);
      }
      this.babiMood = Math.max(0, this.babiMood - dt * 1.4);
      this.shake = Math.max(0, this.shake - dt * 3.4);

      const live = this.state === "playing" || this.state === "countin";
      if (!live) return;

      /* ── where is the tray tipped right now? ── */
      const lv = this.level;
      const gyro = this.gyroLive();
      let tx = 0, ty = 0;

      if (gyro) {
        MOTION.update(dt);
        const grip = this.heldBy[0] && (this.mode === "solo" || this.heldBy[1]);
        if (grip) { tx = MOTION.tx; ty = MOTION.ty; }
        if (!grip && this.gripped) this.lostGrip += dt;
        else this.lostGrip = 0;
        this.gripped = grip;
        if (this.lostGrip > GRIP_GRACE && this.state === "playing") {
          this.lostGrip = 0;
          this.breakCombo("keep a thumb at each end");
          this.sound.soft("late");
        }
      } else {
        /* no gyroscope: the two of you push with keys or a drag */
        const keys = this.keys;
        const raw = [
          { x: (keys.d ? 1 : 0) - (keys.a ? 1 : 0), y: (keys.w ? 1 : 0) - (keys.s ? 1 : 0) },
          { x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), y: (keys.up ? 1 : 0) - (keys.down ? 1 : 0) },
        ];
        for (let i = 0; i < 2; i++) {
          let d = null;
          this.pointers.forEach((p) => { if (p.zone === i) d = p; });
          let wx = 0, wy = 0, stick = false;
          const canPush = this.heldBy[i] || (!this.gyroLive() && !DWB.isTouch());
          if (canPush) {
            wx = raw[i].x; wy = raw[i].y;
            if (d) { wx = d.x; wy = d.y; stick = true; }
          }
          /* a thumb is already smooth; a key press needs easing */
          const f = stick ? 1 : Math.min(1, dt * PAD_RATE * 2);
          this.pads[i].x += (wx - this.pads[i].x) * f;
          this.pads[i].y += (wy - this.pads[i].y) * f;
        }
        const p0 = this.pads[0], p1 = this.pads[1];
        if (this.mode === "solo") {
          tx = p0.x; ty = p0.y;
        } else {
          /* the tray only tips while the two of you push the same way */
          const agree = Math.abs(p0.x - p1.x) < 0.5 && Math.abs(p0.y - p1.y) < 0.5;
          if (agree) { tx = (p0.x + p1.x) * 0.5; ty = (p0.y + p1.y) * 0.5; }
        }
      }

      const f2 = Math.min(1, dt * FOLLOW);
      this.tiltX += (clamp(tx, -1, 1) - this.tiltX) * f2;
      this.tiltY += (clamp(ty, -1, 1) - this.tiltY) * f2;

      const t = this.sound.songTime();
      this.beatPhase = t < 0 ? -1 : (t / lv.spb) % 1;

      /* ── the marble: gravity down the tilted tray, with a little lag ── */
      const wx = lv.speed * this.tiltX;
      const wz = -lv.speed * this.tiltY;
      const kk = Math.min(1, dt / lv.lag);
      this.vx += (wx - this.vx) * kk;
      this.vz += (wz - this.vz) * kk;
      this.mx += this.vx * dt;
      this.mz += this.vz * dt;

      /* no walls: if you run away from the dance, an invisible leash
         simply pulls the pearl back towards the ring you owe */
      const g0 = this.gates[this.nextGate];
      if (g0) {
        const dx = g0.x - this.mx, dz = g0.z - this.mz;
        const far = Math.hypot(dx, dz);
        if (far > 7.5) {
          const pull = Math.min(1, (far - 7.5) * 0.9 * dt);
          this.mx += dx * pull;
          this.mz += dz * pull;
          this.vx *= 1 - 0.9 * dt;
          this.vz *= 1 - 0.9 * dt;
        }
      }

      /* count-in */
      if (this.state === "countin") {
        if (t > -3 * lv.spb && t < 0) {
          const n = Math.ceil(-t / lv.spb);
          if (n !== this.lastCount) {
            this.lastCount = n;
            this.el.countin.innerHTML = "<b>" + n + "</b>";
            this.el.countin.classList.remove("hidden");
          }
        }
        if (t >= 0) {
          this.state = "playing";
          this.el.countin.classList.add("hidden");
          this.el.hint.classList.add("hidden");
        }
      }

      if (t >= 0) this.judgeBeats(t);

      this.el.hudProgress.style.width = ((this.nextGate / this.gates.length) * 100).toFixed(1) + "%";

      const last = this.gates[this.gates.length - 1];
      if (this.nextGate >= this.gates.length && last && t > last.expected + 1.7) this.finish();
    }

    /** every ring is a snapshot: is the pearl inside it when the beat lands? */
    gripOK() {
      /* on a phone both thumbs must be on the glass; on a laptop there is
         nothing to hold, so the keyboard or a drag counts on its own */
      if (!this.gyroLive() && !DWB.isTouch()) return true;
      return this.heldBy[0] && (this.mode === "solo" || this.heldBy[1]);
    }

    judgeBeats(t) {
      let guard = 0;
      while (this.nextGate < this.gates.length && t >= this.gates[this.nextGate].expected && guard++ < 8) {
        if (this.gripOK()) this.scoreGate(this.nextGate);
        else this.missGate(this.nextGate, "let go");
        this.nextGate++;
      }
    }

    scoreGate(i) {
      const g = this.gates[i];
      const lv = this.level;
      const d = Math.hypot(this.mx - g.x, this.mz - g.z);
      let tier = null;
      for (let j = 0; j < JUDGE.length; j++) {
        if (d <= lv[JUDGE[j].d]) { tier = JUDGE[j]; break; }
      }
      if (!tier) {
        /* ahead of the ring along the dance, or still behind it? */
        const nx = lv.gateX(i + 1) - g.x;
        const nz = lv.gateZ(i + 1) - g.z;
        const along = (this.mx - g.x) * nx + (this.mz - g.z) * nz;
        this.missGate(i, along > 0 ? "early" : "late");
        return;
      }

      g.state = 1;
      g.q = tier.q;
      g.flash = 1;
      this.counts[tier.q] += 1;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const mult = 1 + Math.min(3, Math.floor(this.combo / 8)) * 0.5;
      this.score += Math.round(tier.points * mult);
      this.babiMood = Math.min(1.2, this.babiMood + 0.7);

      this.popJudge(tier.label, tier.q === 3 ? "perfect" : tier.q === 2 ? "good" : "soft");
      this.sound.hit(this.combo);
      const ps = this.stage.pearlScreen || { x: this.stage.cx, y: this.stage.cy };
      this.stage.burst(
        ps.x, ps.y,
        tier.q === 3 ? "#fff3d6" : tier.q === 2 ? "#bfeee6" : "#c8b6e8",
        tier.q === 3 ? 20 : 11,
        tier.q === 3 ? 210 : 140
      );
      this.setHud();
    }

    missGate(i, why) {
      const g = this.gates[i];
      if (g.state !== 0) return;
      g.state = 2;
      this.counts.miss += 1;
      this.breakCombo(
        why === "early" ? "a little early"
          : why === "late" ? "a little late"
            : why === "let go" ? "keep a thumb at each end"
              : why
      );
      this.sound.soft(why === "early" ? "early" : "late");
      this.setHud();
    }

    hitTheEnd() {
      this.shake = 1;
      this.sound.tangle();
      if (this.combo > 2) this.popJudge("off the tray", "bad");
      this.breakCombo(null);
    }

    breakCombo(word) {
      this.combo = 0;
      if (word) this.popJudge(word, "bad");
      this.setHud();
    }

    setHud() {
      this.el.hudScore.textContent = String(this.score);
      if (this.combo >= 3) {
        this.el.hudCombo.textContent = "×" + this.combo + " streak";
        this.el.hudCombo.classList.add("on");
      } else {
        this.el.hudCombo.classList.remove("on");
      }
    }

    popJudge(text, cls) {
      const el = this.el.judge;
      el.textContent = text;
      el.className = "";
      void el.offsetWidth;
      el.className = "show " + (cls || "");
    }

    finish() {
      if (this.state === "results") return;
      this.state = "results";
      this.sound.stop();
      this.sound.complete();
      this.pointers.clear();
      this.heldBy = [false, false];

      const lv = this.level;
      const total = this.gates.length;
      const acc = (this.counts[3] + this.counts[2] * 0.6 + this.counts[1] * 0.3) / total;
      const stars = acc >= 0.86 ? 3 : acc >= 0.62 ? 2 : acc >= 0.34 ? 1 : 0;

      const key = "dwb.best." + lv.id;
      const prev = this.best(lv.id);
      const isBest = !prev || this.score > prev.score;
      if (isBest) store.set(key, { score: this.score, stars: Math.max(stars, prev ? prev.stars : 0) });
      else if (stars > prev.stars) store.set(key, { score: prev.score, stars: stars });

      const unlocked = this.unlocked();
      if (stars >= 1 && this.li + 1 >= unlocked) store.set("dwb.unlocked", Math.min(LEVELS.length, this.li + 2));

      this.el.resKicker.textContent = stars === 3 ? "a flawless duet" : stars === 2 ? "a lovely dance" : stars === 1 ? "the dance is complete" : "you kept hold of each other";
      this.el.resTitle.textContent = lv.name;
      this.el.resScore.textContent = String(this.score);
      this.el.resBest.textContent = isBest ? "new best" : "best " + (prev ? prev.score : 0);
      Array.from(this.el.resStars.children).forEach((svg, i) => svg.classList.toggle("on", i < stars));

      this.el.resBreak.innerHTML = "";
      [
        ["perfect", this.counts[3]],
        ["good", this.counts[2]],
        ["edge", this.counts[1]],
        ["missed", this.counts.miss],
        ["streak", this.maxCombo],
      ].forEach((row) => {
        const d = document.createElement("div");
        d.innerHTML = "<b>" + row[1] + "</b>" + row[0];
        this.el.resBreak.appendChild(d);
      });

      this.el.next.classList.toggle("hidden", this.li + 1 >= Math.min(LEVELS.length, this.unlocked()));
      this.el.topbar.classList.add("hidden");
      this.show("results");
    }

    /* ── frame ─────────────────────────────────────────────── */
    frame = (ts) => {
      const now = ts / 1000;
      let dt = now - this.lastT;
      this.lastT = now;
      if (!isFinite(dt) || dt < 0) dt = 0.016;
      dt = Math.min(dt, 0.05);

      this.update(dt);

      const demo = !this.level || this.state === "title" || this.state === "levels" || this.state === "howto";
      this.demoT = (this.demoT || 0) + dt;
      const demoTilt = Math.sin(this.demoT * 1.6) * 0.85;
      const demoLevel = LEVELS[0];

      /* before the dance starts, the menu doubles as a sensor test:
         tip the phone and the marble on screen rolls with it */
      const sensing = MOTION && MOTION.enabled;
      if (sensing) MOTION.update(dt);
      const liveTilt = sensing && MOTION.has;
      this.syncMotionUI();
      if (demo) this.syncSensorPanel();

      const scene = {
        level: demo ? demoLevel : this.level,
        demo: demo,
        tx: demo ? (liveTilt ? MOTION.tx : demoTilt) : this.tiltX,
        ty: demo ? (liveTilt ? MOTION.ty : Math.cos(this.demoT * 1.1) * 0.55) : this.tiltY,
        mx: demo ? (liveTilt ? MOTION.tx * 0.62 : Math.sin(this.demoT * 1.6) * 0.45) : this.mx,
        mz: demo ? (liveTilt ? -MOTION.ty * 0.62 : Math.cos(this.demoT * 1.1) * 0.28) : this.mz,
        vx: demo ? 0 : this.vx,
        vz: demo ? 0 : this.vz,
        gates: demo ? [] : this.gates,
        nextGate: demo ? 0 : this.nextGate,
        phase: this.beatPhase >= 0 ? this.beatPhase : (this.demoT * 1.6) % 1,
        heldBy: demo ? [true, true] : this.heldBy,
        sensor: this.gyroLive(),
        babiMood: demo ? 0.7 : this.babiMood,
        showBars: !demo,
        showHands: !demo && (this.state === "countin" || (this.state === "playing" && this.li === 0 && this.nextGate < 6)),
        mode: this.mode,
        shake: this.shake,
      };

      this.stage.draw(scene, dt);
      requestAnimationFrame(this.frame);
    };
  }

  function boot() {
    if (!window.DWB || !DWB.LEVELS) return;
    window.game = new Game();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
