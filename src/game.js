/* ──────────────────────────────────────────────────────────────
   Dance with Babi — game.js
   State, input, judging, and the little bit of ritual in between.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const LEVELS = DWB.LEVELS;
  const clamp = DWB.clamp;
  const TAU = Math.PI * 2;

  const GAIN = 1.75;       /* gesture radians → dial radians */
  const KEY_RATE = 2.15;   /* keyboard radians per second */
  const TANGLE_MAX = 3.0;  /* dial disagreement that counts as a tangle */
  const TANGLE_HOLD = 0.28;

  const JUDGE = [
    { t: 0.105, q: 3, points: 100, label: "perfect" },
    { t: 0.205, q: 2, points: 60, label: "good" },
    { t: 0.34, q: 1, points: 30, label: "on the edge" },
  ];

  const wrapPi = (a) => {
    let x = (a + Math.PI) % TAU;
    if (x < 0) x += TAU;
    return x - Math.PI;
  };

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
      this.ballS = 0;
      this.prevBallS = 0;
      this.prevT = -0.001;
      this.cum = [0, 0];
      this.prevShared = 0;
      this.sharedVel = 0;
      this.sway = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.counts = { 3: 0, 2: 0, 1: 0, miss: 0 };
      this.tangle = 0;
      this.tangleHold = 0;
      this.tangleWarned = false;
      this.babiMood = 0;
      this.beatPhase = -1;
      this.pointers = new Map();
      this.keys = { a: 0, d: 0, l: 0, r: 0 };
      this.lastT = 0;
      this.resumeState = "playing";

      this.bindUI();
      this.bindInput();
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
      this.stage.setMode(this.mode);
      document.querySelectorAll("[data-mode]").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === this.mode);
      });
    }

    /* ── level list ────────────────────────────────────────── */
    unlocked() {
      const n = store.get("dwb.unlocked", 1);
      return clamp(Number(n) || 1, 1, LEVELS.length);
    }

    best(id) {
      return store.get("dwb.best." + id, null);
    }

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
        meta.textContent = lv.gates + " rings · " + lv.bpm + " bpm";
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
          const meta2 = document.createElement("div");
          meta2.className = "lc-meta";
          meta2.textContent = locked ? "finish the dance before it" : "not danced yet";
          body.appendChild(meta2);
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
          const i = Number(card.dataset.level);
          if (card.classList.contains("locked")) return;
          this.sound.ensure();
          this.sound.ui();
          this.start(i);
        }
      });

      this.el.pause.addEventListener("click", () => this.togglePause());

      this.el.sound.addEventListener("click", () => {
        this.sound.setMuted(!this.sound.muted);
        store.set("dwb.muted", this.sound.muted);
        this.el.sound.classList.toggle("muted", this.sound.muted);
        if (!this.sound.muted) { this.sound.ensure(); this.sound.ui(); }
      });

      this.el.again.addEventListener("click", () => this.start(this.li));
      this.el.next.addEventListener("click", () => {
        const n = Math.min(LEVELS.length - 1, this.li + 1);
        this.start(n);
      });

      window.addEventListener("resize", () => this.stage.resize());
      window.addEventListener("orientationchange", () => setTimeout(() => this.stage.resize(), 250));
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && (this.state === "playing" || this.state === "countin")) this.togglePause();
      });
    }

    /* ── input ─────────────────────────────────────────────── */
    zoneFor(x) {
      if (this.mode === "solo" || this.stage.dials.length < 2) return 0;
      return x < this.stage.w / 2 ? 0 : 1;
    }

    bindInput() {
      const cv = this.el.stage;
      const pos = (e) => {
        const r = cv.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      cv.addEventListener("pointerdown", (e) => {
        this.sound.ensure();
        if (this.state !== "playing" && this.state !== "countin") return;
        const p = pos(e);
        const zone = this.zoneFor(p.x);
        const c = this.stage.dials[zone] || { x: this.stage.w / 2, y: this.stage.h / 2 };
        const a = Math.atan2(p.y - c.y, p.x - c.x);
        this.pointers.set(e.pointerId, { zone: zone, last: a });
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        e.preventDefault();
      });

      cv.addEventListener("pointermove", (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        const q = pos(e);
        const c = this.stage.dials[p.zone];
        if (!c) return;
        const dx = q.x - c.x, dy = q.y - c.y;
        if (Math.hypot(dx, dy) < Math.min(14, this.stage.dialR * 0.34)) return;
        const a = Math.atan2(dy, dx);
        const d = wrapPi(a - p.last);
        p.last = a;
        if (this.state === "playing" || this.state === "countin") this.cum[p.zone] += d * GAIN;
        e.preventDefault();
      });

      const release = (e) => { this.pointers.delete(e.pointerId); };
      cv.addEventListener("pointerup", release);
      cv.addEventListener("pointercancel", release);
      cv.addEventListener("pointerleave", release);

      window.addEventListener("keydown", (e) => {
        if (e.repeat) {
          if (e.code.indexOf("Arrow") === 0) e.preventDefault();
          return;
        }
        switch (e.code) {
          case "KeyA": this.keys.a = 1; break;
          case "KeyD": this.keys.d = 1; break;
          case "ArrowLeft": this.keys.l = 1; e.preventDefault(); break;
          case "ArrowRight": this.keys.r = 1; e.preventDefault(); break;
          case "Escape":
          case "KeyP":
            if (this.state === "playing" || this.state === "countin" || this.state === "paused") {
              this.togglePause();
            }
            break;
          case "KeyM":
            this.el.sound.click();
            break;
          default: return;
        }
        this.sound.ensure();
      });

      window.addEventListener("keyup", (e) => {
        switch (e.code) {
          case "KeyA": this.keys.a = 0; break;
          case "KeyD": this.keys.d = 0; break;
          case "ArrowLeft": this.keys.l = 0; break;
          case "ArrowRight": this.keys.r = 0; break;
          default: break;
        }
      });

      window.addEventListener("blur", () => {
        this.keys.a = this.keys.d = this.keys.l = this.keys.r = 0;
      });
    }

    /* ── lifecycle ─────────────────────────────────────────── */
    start(i) {
      const lv = LEVELS[i];
      if (!lv) return;
      this.li = i;
      this.level = lv;
      this.stage.setMode(this.mode);
      this.stage.pathCache = { path: null, pts: null };
      this.stage.particles.length = 0;
      this.stage.babi.ready = false;

      this.gates = [];
      for (let k = 0; k < lv.gates; k++) {
        this.gates.push({
          s: (k + 1) * lv.interval,
          expected: (k + 1) * lv.spb,
          state: 0,
          q: 0,
          flash: 0,
        });
      }
      this.nextGate = 0;
      this.ballS = 0;
      this.prevBallS = 0;
      this.prevT = -0.001;
      this.cum = [0, 0];
      this.prevShared = 0;
      this.sharedVel = 0;
      this.sway = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.counts = { 3: 0, 2: 0, 1: 0, miss: 0 };
      this.tangle = 0;
      this.tangleHold = 0;
      this.tangleWarned = false;
      this.babiMood = 0;
      this.beatPhase = -1;
      this.pointers.clear();
      this.keys = { a: 0, d: 0, l: 0, r: 0 };
      this.lastCount = null;

      this.sound.ensure();
      this.sound.startLevel(lv);
      this.state = "countin";
      this.el.topbar.classList.remove("hidden");
      this.el.countin.classList.remove("hidden");
      this.el.hint.textContent = this.mode === "solo" ? "turn the dial in a slow circle" : "turn both dials together — clockwise";
      this.el.hint.classList.remove("hidden");
      this.el.hudLevel.textContent = lv.name;
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
      this.show("pause");
    }

    /* ── the beat of play ──────────────────────────────────── */
    update(dt) {
      const kx = (this.keys.d - this.keys.a) * KEY_RATE * dt;
      const ky = (this.keys.r - this.keys.l) * KEY_RATE * dt;
      const live = this.state === "playing" || this.state === "countin";
      if (live) {
        if (this.mode === "solo") this.cum[0] += kx + ky;
        else { this.cum[0] += kx; this.cum[1] += ky; }
      }

      /* gate flashes */
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 1.9);
      }
      this.babiMood = Math.max(0, this.babiMood - dt * 1.4);

      if (!live) return;

      const lv = this.level;
      const t = this.sound.songTime();
      this.beatPhase = t < 0 ? -1 : (t / lv.spb) % 1;

      const shared = this.mode === "solo" ? this.cum[0] : (this.cum[0] + this.cum[1]) * 0.5;
      const dShared = shared - this.prevShared;
      this.prevShared = shared;
      this.sharedVel = dt > 0 ? dShared / dt : 0;

      const targetSway = clamp(this.sharedVel * 0.10, -0.30, 0.30);
      this.sway += (targetSway - this.sway) * Math.min(1, dt * 7);

      /* count-in: 3 · 2 · 1 in the last three beats before the first ring */
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

      /* the pearl only moves by the average of both dials, and only
         once the waltz has actually begun */
      const prevT = this.prevT;
      this.prevT = t;
      this.prevBallS = this.ballS;
      if (t >= 0) this.ballS += dShared * lv.speed;
      this.judge(t, prevT);

      /* the ribbon between you */
      if (this.mode === "duet") {
        const diff = Math.abs(wrapPi(this.cum[0] - this.cum[1]));
        this.tangle = clamp(diff / TANGLE_MAX, 0, 1);
        if (this.tangle > 0.92) {
          this.tangleHold += dt;
          if (this.tangleHold > TANGLE_HOLD && !this.tangleWarned) {
            this.tangleWarned = true;
            this.breakCombo("stay together");
            this.sound.tangle();
          }
        } else {
          this.tangleHold = 0;
          if (this.tangle < 0.4) this.tangleWarned = false;
        }
      } else {
        this.tangle = 0;
      }

      /* expire rings the music has already passed */
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        if (g.state === 0 && t > g.expected + JUDGE[2].t + 0.06) {
          this.missGate(i, "late");
        }
      }

      /* progress */
      const done = this.gates.filter((g) => g.state !== 0).length;
      this.el.hudProgress.style.width = ((done / this.gates.length) * 100).toFixed(1) + "%";

      /* the end of the dance */
      const last = this.gates[this.gates.length - 1];
      if (done === this.gates.length && last && t > last.expected + 1.7) this.finish();
    }

    judge(t, prevT) {
      const prev = this.prevBallS, cur = this.ballS;
      if (prev === cur) return;
      const lo = Math.min(prev, cur), hi = Math.max(prev, cur);
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        if (g.state !== 0) continue;
        const base = Math.floor(lo - g.s);
        for (let k = base; k <= base + 2; k++) {
          const gp = g.s + k;
          if (gp > lo && gp <= hi) {
            const f = (gp - prev) / (cur - prev);
            this.resolveGate(i, prevT + f * (t - prevT));
            break;
          }
        }
      }
      this.advance();
    }

    resolveGate(i, tc) {
      const g = this.gates[i];
      const err = tc - g.expected;
      let tier = null;
      for (let j = 0; j < JUDGE.length; j++) {
        if (Math.abs(err) <= JUDGE[j].t) { tier = JUDGE[j]; break; }
      }
      if (!tier) { this.missGate(i, err < 0 ? "early" : "late"); return; }

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
      this.stage.burst(
        this.stage.cx, this.stage.cy,
        tier.q === 3 ? "#fff3d6" : tier.q === 2 ? "#bfeee6" : "#c8b6e8",
        tier.q === 3 ? 22 : 12,
        tier.q === 3 ? 210 : 140
      );
      this.setHud();
    }

    missGate(i, why) {
      const g = this.gates[i];
      if (g.state !== 0) return;
      g.state = 2;
      this.counts.miss += 1;
      this.breakCombo(why === "early" ? "a little early" : why === "late" ? "a little late" : why);
      this.sound.soft(why);
      this.setHud();
    }

    breakCombo(word) {
      this.combo = 0;
      if (word) this.popJudge(word, "bad");
      this.setHud();
    }

    advance() {
      let i = this.nextGate;
      while (i < this.gates.length && this.gates[i].state !== 0) i++;
      this.nextGate = i;
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

      const playing = this.state === "playing" || this.state === "countin";
      const held = [false, false];
      this.pointers.forEach((p) => { held[p.zone] = true; });

      /* in the menus the sphere keeps dancing quietly to itself */
      const demo = !this.level || this.state === "title" || this.state === "levels" || this.state === "howto";
      this.demoS = (this.demoS || 0) + dt * (this.state === "title" ? 0.035 : 0.05);
      const demoLevel = LEVELS[0];

      const scene = demo
        ? {
            level: demoLevel,
            path: demoLevel.path,
            ballS: this.demoS,
            gates: [],
            nextGate: 0,
            sway: Math.sin(this.demoS * 6) * 0.18,
            beatPhase: -1,
            phase: (this.demoS * 7) % 1,
            tangle: 0,
            cum: [this.demoS * 2, this.demoS * 2],
            held: [false, false],
            babiMood: 0.7,
            showDials: false,
            showHint: false,
          }
        : {
            level: this.level,
            path: this.level.path,
            ballS: this.ballS,
            gates: this.gates,
            nextGate: this.nextGate,
            sway: this.sway,
            beatPhase: this.beatPhase,
            phase: this.beatPhase >= 0 ? this.beatPhase : 0.5,
            tangle: this.tangle,
            cum: this.cum,
            held: held,
            babiMood: this.babiMood,
            showDials: true,
            showHint: this.state === "countin",
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
