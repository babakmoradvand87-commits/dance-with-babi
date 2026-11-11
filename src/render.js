/* ──────────────────────────────────────────────────────────────
   Dance with Babi — render.js  ·  "Obsidian Ballroom"
   A hand-rolled 3D scene on a 2D canvas: an oiled-stone tray floats in a
   dark hall, tipped exactly the way the phone in your hands is tipped.
   A pearl runs downhill on it. Two thumbs hold the ends of the phone.

   No WebGL, no assets, no network — every frame is gradients, paths and
   a couple of cached glow sprites.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const V = DWB.V;
  const clamp = DWB.clamp;
  const TAU = Math.PI * 2;
  const TRAY_HALF = DWB.TRAY_HALF || 1.02;
  const FOV = (46 * Math.PI) / 180;
  const VIS = 0.52;          /* radians of tray lean per unit of tilt */
  const MARBLE_R = 0.076;
  const RING_R = 0.155;
  const THICK = 0.105;       /* tray slab thickness */

  const isTouch = () =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* ── colour ─────────────────────────────────────────────────── */
  const C = {
    parse(hex) {
      if (Array.isArray(hex)) return hex;
      const h = String(hex).replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    mix(a, b, t) {
      const x = C.parse(a), y = C.parse(b);
      return [
        Math.round(x[0] + (y[0] - x[0]) * t),
        Math.round(x[1] + (y[1] - x[1]) * t),
        Math.round(x[2] + (y[2] - x[2]) * t),
      ];
    },
    out(c, a) {
      const r = C.parse(c);
      return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + clamp(a, 0, 1).toFixed(3) + ")";
    },
    rgba(hex, a) { return C.out(hex, a); },
    dark(hex, t) { return C.mix(hex, [4, 2, 10], t); },
    lite(hex, t) { return C.mix(hex, [255, 255, 255], t); },
  };

  const MENU_PAL = {
    bg0: "#070510", bg1: "#170d26", fog: "#140c20",
    tray: "#6f6288", trayTop: "#fff0d8", trayGlow: "#ffb877",
    rimA: "#ff9ecb", rimB: "#8ff0e2",
    ring: "#ff9ecb", ringNext: "#ffd28a",
    pearl: "#fff4dc", pearl2: "#ffb877",
    floor: "#2a1f3d", column: "#241a35", halo: "#ff9ecb",
  };

  function makeCanvas(w, h) {
    try {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    } catch (e) {
      return null;
    }
  }

  class Stage {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.w = 0; this.h = 0; this.dpr = 1;
      this.particles = [];
      this.motes = [];
      this.bokeh = [];
      this.time = 0;
      this.tiltX = 0; this.tiltY = 0;
      this.babi = { x: 0, y: 0, vx: 0, vy: 0, ready: false };
      this.pearlScreen = { x: 0, y: 0 };
      this._glow = new Map();
      this.trail = [];
      this.g = null;          /* the offscreen target while baking a layer */
      this._set = null;
      this._setKey = "";
      this._post = null;
      this._grain = null;
      this.resize();
    }

    resize() {
      this.dprCap = this.dprCap || 2;
      const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
      const w = this.canvas.clientWidth || (window.innerWidth || 720);
      const h = this.canvas.clientHeight || (window.innerHeight || 480);
      this.dpr = dpr; this.w = w; this.h = h;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.cx = w / 2;
      this.cy = h * 0.505;
      this.focal = h / 2 / Math.tan(FOV / 2);
      const need = (2 * TRAY_HALF * 1.18 * this.focal) / (0.84 * w);
      this.dist = Math.max(2.15, need * 0.62);

      /* dust */
      this.motes = [];
      const n = Math.round(clamp((w * h) / 30000, 22, 64));
      for (let i = 0; i < n; i++) {
        this.motes.push({
          a: Math.random() * TAU,
          r: 0.5 + Math.random() * 2.6,
          sp: 0.10 + Math.random() * 0.34,
          z: 1.4 + Math.random() * 4.4,
          y: (Math.random() - 0.4) * 2.4,
          ph: Math.random() * TAU,
          sz: 0.6 + Math.random() * 1.7,
        });
      }
      /* out-of-focus lights in the hall */
      this.bokeh = [];
      const nb = Math.round(clamp(w / 130, 6, 14));
      for (let i = 0; i < nb; i++) {
        this.bokeh.push({
          x: Math.random(),
          y: 0.05 + Math.random() * 0.30,
          r: 0.004 + Math.random() * 0.016,
          ph: Math.random() * TAU,
          sp: 0.12 + Math.random() * 0.3,
          warm: Math.random(),
        });
      }
      this._grain = null;
      this._setKey = "";
      this._set = null;
      this._post = null;
    }

    /* a fixed camera, used only for the layers we bake once */
    nominalCam() {
      return DWB.camera([0, 1.80, this.dist * 1.14], [0, -0.03, -0.24], [0, 1, 0], 0);
    }

    buildLayer(paint) {
      const cv = makeCanvas(this.canvas.width, this.canvas.height);
      if (!cv) return null;
      const g = cv.getContext("2d");
      if (!g) return null;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.g = g;
      try {
        paint(g);
      } catch (e) {
        this.g = null;
        return null;
      }
      this.g = null;
      return cv;
    }

    /* the hall and the floor never change within a level: bake them */
    bake(pal) {
      const key = [pal.bg0, pal.bg1, pal.floor, this.w, this.h, this.dpr].join("|");
      if (this._setKey === key) return;
      this._setKey = key;
      const cam = this.cam;
      this._set = this.buildLayer(() => {
        this.cam = this.nominalCam();
        this.drawBackdrop(null, pal);
        this.drawHall(pal);
        this.drawFloor(pal);
        this.cam = cam;
      });
      this._post = this.buildLayer(() => this.drawPost(pal));
    }

    /* cached radial glow sprite, tinted per colour */
    glowSprite(hex) {
      const key = String(hex);
      let c = this._glow.get(key);
      if (c !== undefined) return c;
      c = null;
      const S = 96;
      const cv = makeCanvas(S, S);
      if (cv) {
        const g = cv.getContext("2d");
        if (g) {
          const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
          rg.addColorStop(0, C.out(hex, 1));
          rg.addColorStop(0.35, C.out(hex, 0.45));
          rg.addColorStop(1, C.out(hex, 0));
          g.fillStyle = rg;
          g.fillRect(0, 0, S, S);
        }
      }
      this._glow.set(key, cv);
      return cv;
    }

    glow(hex, x, y, r, a) {
      const s = this.glowSprite(hex);
      const ctx = this.g || this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(a, 0, 1);
      if (s) ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
      else {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, C.out(hex, 0.9));
        g.addColorStop(1, C.out(hex, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ── particles ─────────────────────────────────────────────── */
    burst(x, y, color, n, speed) {
      const count = n || 14;
      const sp = speed || 150;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const v = sp * (0.25 + Math.random() * 0.9);
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.15,
          life: 0, max: 0.5 + Math.random() * 0.7,
          size: 0.9 + Math.random() * 2.4, color: color,
        });
      }
    }

    reset() {
      this.particles.length = 0;
      this.trail.length = 0;
      this.babi.ready = false;
    }

    updateParticles(dt) {
      const p = this.particles;
      for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        q.life += dt;
        if (q.life >= q.max) { p.splice(i, 1); continue; }
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= 1 - 2.2 * dt;
        q.vy = q.vy * (1 - 2.2 * dt) + 40 * dt;
      }
    }

    /* ── the tray's own little coordinate system ───────────────── */
    plane(x, z, y) {
      const ax = -this.tiltY * VIS;
      const az = -this.tiltX * VIS;
      const cx = Math.cos(ax), sx = Math.sin(ax);
      const cz = Math.cos(az), sz = Math.sin(az);
      const py = y || 0;
      const y1 = py * cx - z * sx;
      const z1 = py * sx + z * cx;
      const x2 = x * cz - y1 * sz;
      const y2 = x * sz + y1 * cz;
      return [x2, y2, z1];
    }

    P(p) {
      const pr = DWB.project(this.cam, this.focal, this.cx, this.cy, p);
      if (!pr || pr.z < 0.2) return null;
      return pr;
    }
    PT(x, z, y) { return this.P(this.plane(x, z, y)); }

    /* a circle lying in the tray plane, as a screen-space ellipse */
    disc(x, z, r, y) {
      const yy = y == null ? 0.0012 : y;
      const c = this.PT(x, z, yy);
      const e1 = this.PT(x + r, z, yy);
      const e2 = this.PT(x, z + r, yy);
      if (!c || !e1 || !e2) return null;
      const ax = e1.x - c.x, ay = e1.y - c.y;
      const bx = e2.x - c.x, by = e2.y - c.y;
      return {
        x: c.x, y: c.y,
        rx: Math.hypot(ax, ay) || 1,
        ry: Math.hypot(bx, by) || 1,
        rot: Math.atan2(ay, ax),
      };
    }

    /* ── the frame ─────────────────────────────────────────────── */
    draw(scene, dt) {
      const ctx = this.g || this.ctx;
      const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
      this.time += dt;
      this.tiltX = clamp(scene.tx || 0, -1, 1);
      this.tiltY = clamp(scene.ty || 0, -1, 1);
      this.updateParticles(dt);

      const pal = (scene.level && scene.level.pal) || MENU_PAL;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      /* camera: low, close, breathing a little with the music */
      const t = this.time;
      const sway = Math.sin(t * 0.21) * 0.10 + Math.sin(t * 0.07) * 0.05;
      const lift = Math.sin(t * 0.33) * 0.035;
      const beat = scene.phase == null ? 0 : Math.sin(clamp(scene.phase, 0, 1) * Math.PI) * 0.045;
      const d = this.dist + (scene.demo ? 0.16 : 0);
      const eye = [sway * 0.85, 1.80 + lift - beat * 0.20, d * 1.14];
      const target = [-sway * 0.16, -0.03 + lift * 0.4, -0.24];
      const cam = DWB.camera(eye, target, [0, 1, 0], this.tiltX * 0.030 + sway * 0.02);
      this.cam = cam;

      this.bake(pal);
      if (this._set) ctx.drawImage(this._set, 0, 0, this.w, this.h);
      else {
        this.drawBackdrop(scene, pal);
        this.drawHall(pal);
        this.drawFloor(pal);
      }
      this.drawDust(pal);
      this.drawBokeh(pal);
      this.drawSmears(pal);

      ctx.save();
      if (scene.shake > 0.01) {
        const s3 = scene.shake * 10;
        ctx.translate((Math.random() - 0.5) * s3, (Math.random() - 0.5) * s3);
      }
      this.drawTray(scene, pal);
      this.drawPath(scene, pal);
      this.drawRings(scene, pal);
      this.drawMarble(scene, pal);
      this.drawParticles();
      ctx.restore();

      if (this._post) ctx.drawImage(this._post, 0, 0, this.w, this.h);
      else this.drawPost(pal);

      if (scene.showBars && !scene.demo) this.drawGrips(scene, pal);
      if (!scene.demo) this.drawLevel(scene, pal);

      /* if this phone cannot hold 60fps, quietly render fewer pixels */
      if (t0) {
        const ms = performance.now() - t0;
        this._slow = this._slow ? this._slow * 0.90 + ms * 0.10 : ms;
        if (this._slow > 19 && this.dprCap > 1.30 && this._drops !== 3) {
          this._drops = (this._drops || 0) + 1;
          this.dprCap = Math.max(1.30, this.dprCap - 0.35);
          this._slow = 0;
          this.resize();
        }
      }
    }

    /* ── background ────────────────────────────────────────────── */
    drawBackdrop(scene, pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, C.out(C.dark(pal.bg0, 0.35), 1));
      g.addColorStop(0.46, C.out(pal.bg1, 1));
      g.addColorStop(0.78, C.out(C.dark(pal.bg1, 0.45), 1));
      g.addColorStop(1, C.out(C.dark(pal.bg0, 0.25), 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* the window the light comes from */
      const hx = w * 0.5 + Math.sin(this.time * 0.11) * w * 0.02;
      const hy = h * 0.40;
      const R = Math.max(w, h) * 0.62;
      const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
      rg.addColorStop(0, C.out(pal.halo, 0.13));
      rg.addColorStop(0.30, C.out(pal.halo, 0.045));
      rg.addColorStop(0.65, C.out(pal.halo, 0.010));
      rg.addColorStop(1, C.out(pal.halo, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      /* floor haze so the far hall dissolves */
      const fz = ctx.createLinearGradient(0, h * 0.40, 0, h * 0.80);
      fz.addColorStop(0, C.out(pal.fog, 0));
      fz.addColorStop(0.55, C.out(pal.fog, 0.42));
      fz.addColorStop(1, C.out(pal.fog, 0));
      ctx.fillStyle = fz;
      ctx.fillRect(0, h * 0.40, w, h * 0.42);
      void scene;
    }

    /* ── drifting dust (animated) ─────────────────────────────── */
    drawDust(pal) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        m.a += m.sp * 0.0014;
        const p = this.P([
          Math.cos(m.a) * m.r,
          m.y + Math.sin(this.time * 0.5 + m.ph) * 0.06 + 0.22,
          -1.6 - Math.abs(Math.sin(m.a * 0.7)) * 2.4,
        ]);
        if (!p) continue;
        const tw = 0.5 + 0.5 * Math.sin(this.time * 1.7 + m.ph);
        const a = 0.05 + 0.16 * tw;
        const r = m.sz * (0.7 + tw * 0.6);
        ctx.fillStyle = C.out(C.lite(pal.halo, 0.5), a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ── the hall: arches and far lights ───────────────────────── */
    drawHall(pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const horizon = this.P([0, -1.05, -9]);
      const fy = horizon ? horizon.y : h * 0.62;
      const sway = Math.sin(this.time * 0.21) * 0.10;

      /* arches receding into the dark */
      const cols = 5;
      for (let i = 0; i < cols; i++) {
        const k = (i - (cols - 1) / 2);
        const depth = 1 + Math.abs(k) * 0.55;
        const ax = this.cx + k * w * 0.30 - sway * w * 0.045 * depth;
        const aw = w * 0.155 / depth;
        const top = h - (h - fy) * 1.02 - aw * 0.95;
        const bottom = fy + (h - fy) * 0.05;
        const alpha = clamp(0.34 - Math.abs(k) * 0.13, 0.06, 0.34);

        ctx.beginPath();
        ctx.moveTo(ax - aw, bottom);
        ctx.lineTo(ax - aw, top + aw * 0.9);
        ctx.quadraticCurveTo(ax - aw, top, ax, top);
        ctx.quadraticCurveTo(ax + aw, top, ax + aw, top + aw * 0.9);
        ctx.lineTo(ax + aw, bottom);
        ctx.closePath();
        const ag = ctx.createLinearGradient(0, top, 0, bottom);
        ag.addColorStop(0, C.out(C.mix(pal.bg1, pal.halo, 0.22), alpha * 0.5));
        ag.addColorStop(0.4, C.out(pal.column, alpha));
        ag.addColorStop(1, C.out(C.dark(pal.column, 0.5), alpha * 0.7));
        ctx.fillStyle = ag;
        ctx.fill();
        ctx.strokeStyle = C.out(pal.halo, alpha * 0.42);
        ctx.lineWidth = 1;
        ctx.stroke();

        /* light spilling through each arch */
        if (Math.abs(k) > 0.4) {
          this.glow(pal.halo, ax, top + aw * 0.75, aw * 1.9, 0.05);
        }
      }

      /* the horizon haze that hides where the floor ends */
      const hz = ctx.createLinearGradient(0, fy - h * 0.10, 0, fy + h * 0.10);
      hz.addColorStop(0, C.out(pal.fog, 0));
      hz.addColorStop(0.5, C.out(C.mix(pal.fog, pal.halo, 0.18), 0.5));
      hz.addColorStop(1, C.out(pal.fog, 0));
      ctx.fillStyle = hz;
      ctx.fillRect(0, fy - h * 0.10, w, h * 0.2);
    }

    /* ── the lights hanging in the hall (animated) ────────────── */
    drawBokeh(pal) {
      const ctx = this.ctx;
      const sway = Math.sin(this.time * 0.21) * 0.10;
      for (let i = 0; i < this.bokeh.length; i++) {
        const b = this.bokeh[i];
        const x = this.w * (b.x + Math.sin(this.time * b.sp + b.ph) * 0.010) - sway * this.w * 0.03;
        const y = this.h * b.y + Math.sin(this.time * b.sp * 1.6 + b.ph) * 5;
        const r = this.w * b.r * 2.6;
        const col = C.mix(pal.halo, pal.ringNext, b.warm);
        const a = (0.16 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * 0.9 + b.ph))) * 0.55;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, C.out(col, a * 0.9));
        rg.addColorStop(0.32, C.out(col, a * 0.5));
        rg.addColorStop(0.68, C.out(col, a * 0.16));
        rg.addColorStop(1, C.out(col, 0));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    /* ── the polished floor ────────────────────────────────────── */
    drawFloor(pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const Y = -1.05;
      const far = this.P([0, Y, -9]);
      const near = this.P([0, Y, 2.4]);
      if (!far || !near) return;
      const fy = far.y, ny = near.y;

      const fg = ctx.createLinearGradient(0, fy, 0, ny);
      fg.addColorStop(0, C.out(C.mix(pal.fog, pal.floor, 0.55), 0.90));
      fg.addColorStop(0.30, C.out(C.mix(pal.floor, pal.halo, 0.10), 0.97));
      fg.addColorStop(0.70, C.out(C.dark(pal.floor, 0.12), 1));
      fg.addColorStop(1, C.out(C.dark(pal.floor, 0.40), 1));
      ctx.fillStyle = fg;
      ctx.fillRect(0, fy, w, Math.max(0, h - fy));

      /* inlaid grid */
      ctx.save();
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        const a = this.P([i * 0.78, Y, 2.4]);
        const b = this.P([i * 2.4, Y, -9]);
        if (!a || !b) continue;
        ctx.strokeStyle = C.out(C.lite(pal.floor, 0.35), 0.045);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let j = 0; j < 16; j++) {
        const z = 2.3 - j * j * 0.048;
        const a = this.P([-10, Y, z]);
        const b = this.P([10, Y, z]);
        if (!a || !b) continue;
        ctx.strokeStyle = C.out(C.lite(pal.floor, 0.35), clamp(0.06 - j * 0.003, 0.008, 0.06));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();

      /* rings of light inlaid in the floor, echoing the tray */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fr = [1.55, 2.45, 3.6];
      for (let i = 0; i < fr.length; i++) {
        ctx.beginPath();
        let started = false;
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * TAU;
          const p = this.P([Math.cos(a) * fr[i], Y, Math.sin(a) * fr[i] * 0.86 - 0.15]);
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = C.out(pal.trayGlow, 0.05 - i * 0.012);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      /* the pool of light the tray sits in */
      const c = this.P([0, Y, -0.12]);
      const e = this.P([TRAY_HALF * 2.2, Y, -0.12]);
      if (c && e) {
        const rx = Math.max(60, Math.abs(e.x - c.x));
        const rg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rx);
        rg.addColorStop(0, C.out(pal.halo, 0.10));
        rg.addColorStop(0.45, C.out(pal.halo, 0.035));
        rg.addColorStop(1, C.out(pal.halo, 0));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, rx * 0.34, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      /* the tray's own shadow on the floor */
      if (c && e) {
        const rx = Math.abs(e.x - c.x) * 0.92;
        const sx2 = c.x + this.w * 0.012, sy2 = c.y + rx * 0.10;
        const sh = ctx.createRadialGradient(sx2, sy2, 0, sx2, sy2, rx);
        sh.addColorStop(0, "rgba(0,0,0,0.55)");
        sh.addColorStop(0.7, "rgba(0,0,0,0.20)");
        sh.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sh;
        ctx.beginPath();
        ctx.ellipse(sx2, sy2, rx, rx * 0.26, 0, 0, TAU);
        ctx.fill();
      }

    }

    /* ── the polish catching the lights (animated) ─────────────── */
    drawSmears(pal) {
      const ctx = this.ctx;
      const w = this.w, h = this.h;
      const far = this.P([0, -1.05, -9]);
      if (!far) return;
      const fy = far.y;
            ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const x = this.cx + (i - 1.5) * w * 0.19 + Math.sin(this.time * 0.3 + i) * 5;
        const g2 = ctx.createLinearGradient(0, fy, 0, h);
        g2.addColorStop(0, C.out(pal.halo, 0.045));
        g2.addColorStop(0.45, C.out(pal.ringNext, 0.016));
        g2.addColorStop(1, C.out(pal.halo, 0));
        ctx.fillStyle = g2;
        ctx.fillRect(x - w * 0.02, fy, w * 0.04, h - fy);
      }
      ctx.restore();
    }

    /* ── the tray: an oiled stone slab with a gold inlay ───────── */
    drawTray(scene, pal) {
      const ctx = this.g || this.ctx;
      const H = TRAY_HALF;
      const top = [
        this.PT(-H, -H, 0), this.PT(H, -H, 0), this.PT(H, H, 0), this.PT(-H, H, 0),
      ];
      const bot = [
        this.PT(-H, -H, -THICK), this.PT(H, -H, -THICK),
        this.PT(H, H, -THICK), this.PT(-H, H, -THICK),
      ];
      if (top.some((p) => !p) || bot.some((p) => !p)) return;

      /* soft glow underneath, as if it floats */
      const c0 = this.P(this.plane(0, 0, -THICK * 1.4));
      const e0 = this.P(this.plane(H * 1.25, 0, -THICK * 1.4));
      if (c0 && e0) this.glow(pal.trayGlow, c0.x, c0.y + 6, Math.abs(e0.x - c0.x) * 1.1, 0.09);

      const poly = (pts, fill) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };

      /* side faces, far ones first */
      const sides = [
        { a: 0, b: 1, lit: 0.10 },   /* far edge  */
        { a: 3, b: 2, lit: 1.00 },   /* near edge */
        { a: 1, b: 2, lit: 0.55 },   /* right     */
        { a: 0, b: 3, lit: 0.30 },   /* left      */
      ];
      for (let i = 0; i < sides.length; i++) {
        const s = sides[i];
        const q = [top[s.a], top[s.b], bot[s.b], bot[s.a]];
        const g = ctx.createLinearGradient(q[0].x, q[0].y, q[2].x, q[2].y);
        const base = C.dark(pal.tray, 0.78 + 0.10 * (1 - s.lit));
        g.addColorStop(0, C.out(C.mix(base, s.a === 3 ? pal.rimA : pal.rimB, 0.16 * (0.35 + s.lit)), 1));
        g.addColorStop(0.55, C.out(base, 1));
        g.addColorStop(1, C.out(C.dark(base, 0.55), 1));
        poly(q, g);
        /* the lit rim along the top edge */
        const edgeCol = s.a === 3 ? pal.rimA : s.a === 1 ? pal.rimB : C.lite(pal.tray, 0.4);
        ctx.strokeStyle = C.out(edgeCol, 0.12 + 0.42 * s.lit);
        ctx.lineWidth = 1.1 + s.lit * 1.1;
        ctx.beginPath();
        ctx.moveTo(top[s.a].x, top[s.a].y);
        ctx.lineTo(top[s.b].x, top[s.b].y);
        ctx.stroke();
      }

      /* the top face */
      const gx0 = (top[0].x + top[1].x) / 2, gy0 = (top[0].y + top[1].y) / 2;
      const gx1 = (top[3].x + top[2].x) / 2, gy1 = (top[3].y + top[2].y) / 2;
      const tg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      tg.addColorStop(0, C.out(C.dark(pal.tray, 0.84), 1));
      tg.addColorStop(0.30, C.out(C.dark(pal.tray, 0.93), 1));
      tg.addColorStop(0.66, C.out(C.dark(pal.tray, 0.88), 1));
      tg.addColorStop(1, C.out(C.dark(pal.tray, 0.95), 1));
      poly(top, tg);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(top[i].x, top[i].y);
      ctx.closePath();
      ctx.clip();

      /* etched grid */
      ctx.strokeStyle = "rgba(255,255,255,0.028)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const u = -H + (2 * H * i) / 6;
        let a = this.PT(u, -H, 0), b = this.PT(u, H, 0);
        if (a && b) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        a = this.PT(-H, u, 0); b = this.PT(H, u, 0);
        if (a && b) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      /* the slab darkens towards its rim, which seats the light in the middle */
      const vc = this.PT(0, 0, 0.0012);
      const ve = this.PT(H, 0, 0.0012);
      if (vc && ve) {
        const vg = ctx.createRadialGradient(vc.x, vc.y, 0, vc.x, vc.y, Math.abs(ve.x - vc.x) * 1.42);
        vg.addColorStop(0, "rgba(0,0,0,0)");
        vg.addColorStop(0.55, "rgba(2,0,8,0.10)");
        vg.addColorStop(1, "rgba(2,0,8,0.58)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, this.w, this.h);
      }

      /* art-deco inlay: a medallion and its spokes */
      {
        const rings = [
          { r: 0.30, a: 0.16, w: 1.2 },
          { r: 0.34, a: 0.09, w: 1.0 },
          { r: 0.58, a: 0.05, w: 1.0 },
        ];
        for (let i = 0; i < rings.length; i++) {
          const g2 = this.disc(0, 0, rings[i].r);
          if (!g2) continue;
          ctx.save();
          ctx.translate(g2.x, g2.y);
          ctx.rotate(g2.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, g2.rx, g2.ry, 0, 0, TAU);
          ctx.strokeStyle = C.out(pal.trayGlow, rings[i].a);
          ctx.lineWidth = rings[i].w;
          ctx.stroke();
          ctx.restore();
        }
        /* twelve spokes */
        ctx.strokeStyle = C.out(pal.trayGlow, 0.055);
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
          const a2 = (i / 12) * TAU;
          const p1 = this.PT(Math.cos(a2) * 0.35, Math.sin(a2) * 0.35, 0.0012);
          const p2 = this.PT(Math.cos(a2) * 0.565, Math.sin(a2) * 0.565, 0.0012);
          if (!p1 || !p2) continue;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        /* a medallion at the very centre */
        const mk = this.disc(0, 0, 0.055);
        if (mk) {
          ctx.save();
          ctx.translate(mk.x, mk.y);
          ctx.rotate(mk.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, mk.rx, mk.ry, 0, 0, TAU);
          ctx.fillStyle = C.out(pal.trayGlow, 0.10);
          ctx.fill();
          ctx.strokeStyle = C.out(C.lite(pal.trayGlow, 0.5), 0.35);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }

      /* the sheen of a polished surface */
      const sh = ctx.createLinearGradient(
        this.cx - this.w * 0.5 + this.tiltX * 40, top[0].y,
        this.cx + this.w * 0.5 + this.tiltX * 40, top[2].y
      );
      sh.addColorStop(0, "rgba(255,255,255,0)");
      sh.addColorStop(0.40, C.out(pal.trayTop, 0.030));
      sh.addColorStop(0.52, C.out(pal.trayTop, 0.070));
      sh.addColorStop(0.66, "rgba(255,255,255,0)");
      ctx.fillStyle = sh;
      ctx.fillRect(0, 0, this.w, this.h);

      /* pooled light in the middle of the slab */
      const mid = this.PT(0, 0, 0);
      const edge = this.PT(H, 0, 0);
      if (mid && edge) {
        const rg = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, Math.abs(edge.x - mid.x) * 1.35);
        rg.addColorStop(0, C.out(pal.halo, 0.022));
        rg.addColorStop(1, C.out(pal.halo, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      ctx.restore();

      /* bevel: the chamfer catching the room */
      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(top[i].x, top[i].y);
      ctx.closePath();
      ctx.strokeStyle = C.out(C.lite(pal.tray, 0.55), 0.55);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = C.out(pal.rimA, 0.30);
      ctx.beginPath();
      ctx.moveTo(top[3].x, top[3].y);
      ctx.lineTo(top[2].x, top[2].y);
      ctx.strokeStyle = C.out(C.mix(pal.rimA, "#ffffff", 0.4), 0.55);
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      ctx.lineTo(top[1].x, top[1].y);
      ctx.strokeStyle = C.out(C.mix(pal.rimB, "#ffffff", 0.4), 0.30);
      ctx.lineWidth = 1.6;
      ctx.stroke();

      /* gold inlay: two hairlines just inside the edge */
      const inset = [0.045, 0.085];
      for (let k = 0; k < inset.length; k++) {
        const d = H - inset[k];
        const q = [this.PT(-d, -d, 0), this.PT(d, -d, 0), this.PT(d, d, 0), this.PT(-d, d, 0)];
        if (q.some((p) => !p)) continue;
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
        ctx.closePath();
        const beatGlow = 1 - clamp(scene.phase == null ? 0.5 : scene.phase, 0, 1);
        ctx.strokeStyle = C.out(C.lite(pal.trayGlow, 0.25 + 0.25 * beatGlow),
          k === 0 ? 0.50 + 0.30 * beatGlow : 0.18 + 0.14 * beatGlow);
        ctx.lineWidth = k === 0 ? 1.3 : 0.9;
        ctx.stroke();
      }

      /* corner studs */
      const studs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const p = this.PT(studs[i][0] * (H - 0.075), studs[i][1] * (H - 0.075), 0);
        if (!p) continue;
        const r = clamp((this.focal * 0.012) / p.z, 1, 4);
        this.glow(pal.trayGlow, p.x, p.y, r * 3.0,
          0.16 + 0.16 * (1 - clamp(scene.phase == null ? 0.5 : scene.phase, 0, 1)));
        ctx.fillStyle = C.out(C.lite(pal.trayGlow, 0.55), 0.85);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      }
    }

    /* ── the line the marble is meant to follow ────────────────── */
    drawPath(scene, pal) {
      const gates = scene.gates;
      if (!gates || !gates.length) return;
      const ctx = this.g || this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      ctx.setLineDash([2, 7]);
      for (let pass = 0; pass < 1; pass++) {
        ctx.beginPath();
        let started = false;
        const from = pass === 0 ? Math.max(0, (scene.nextGate || 0) - 1) : 0;
        const to = pass === 0 ? Math.min(gates.length, from + 7) : 0;
        for (let k = from; k < to; k++) {
          const g = gates[k];
          if (pass === 0 ? g.state !== 0 : g.state === 0) continue;
          const p = this.PT(g.x, g.z, 0.004);
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = C.out(pal.ringNext, pass === 0 ? 0.26 : 0.0);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      /* a chevron from the marble towards the next ring */
      const nk = scene.nextGate;
      if (nk != null && gates[nk]) {
        const g = gates[nk];
        const a = this.PT(clamp(scene.mx || 0, -H(), H()), clamp(scene.mz || 0, -H(), H()), 0.006);
        const b = this.PT(g.x, g.z, 0.006);
        if (a && b) {
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const t0 = 0.55;
          const sx = a.x + dx * t0, sy = a.y + dy * t0;
          const ex = b.x - dx * 0.09, ey = b.y - dy * 0.09;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const lg = ctx.createLinearGradient(sx, sy, ex, ey);
          lg.addColorStop(0, C.out(pal.ringNext, 0));
          lg.addColorStop(1, C.out(pal.ringNext, 0.40));
          ctx.strokeStyle = lg;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([2, 6]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.setLineDash([]);
          /* arrowhead */
          const hx = ex - ux * 9, hy = ey - uy * 9;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(hx - uy * 5, hy + ux * 5);
          ctx.lineTo(hx + uy * 5, hy - ux * 5);
          ctx.closePath();
          ctx.fillStyle = C.out(pal.ringNext, 0.5);
          ctx.fill();
          ctx.restore();

        }
      }
      function H() { return TRAY_HALF; }
    }

    /* ── the rings ─────────────────────────────────────────────── */
    drawRings(scene, pal) {
      const ctx = this.g || this.ctx;
      const gates = scene.gates;
      if (!gates || !gates.length) return;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.4);
      const nextK = scene.nextGate;

      for (let k = 0; k < gates.length; k++) {
        const g = gates[k];
        const c = this.PT(g.x, g.z, 0.002);
        const ex = this.PT(g.x + RING_R, g.z, 0.002);
        const ez = this.PT(g.x, g.z + RING_R, 0.002);
        if (!c || !ex || !ez) continue;
        const ax = ex.x - c.x, ay = ex.y - c.y;
        const bx = ez.x - c.x, by = ez.y - c.y;
        const rx = Math.hypot(ax, ay), ry = Math.hypot(bx, by);
        if (rx < 0.6 || ry < 0.6) continue;
        const rot = Math.atan2(ay, ax);   /* the ellipse's long axis follows the tray's x */

        const isNext = k === nextK;
        const hit = g.state === 1;
        const flash = g.flash || 0;

        /* glow under it */
        if (isNext) this.glow(pal.ringNext, c.x, c.y, Math.max(rx, ry) * 1.55, 0.055 + 0.035 * pulse);

        /* the ring itself */
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);

        const ahead = nextK == null ? 9 : k - nextK;
        if (!isNext && !hit && (ahead < 0 || ahead > 4)) { ctx.restore(); continue; }

        if (isNext) {
          const mg = ctx.createLinearGradient(-rx, -ry, rx, ry);
          mg.addColorStop(0, C.out(C.lite(pal.ringNext, 0.85), 1));
          mg.addColorStop(0.35, C.out(C.lite(pal.ringNext, 0.35), 1));
          mg.addColorStop(0.75, C.out(pal.ringNext, 0.95));
          mg.addColorStop(1, C.out(C.dark(pal.ringNext, 0.45), 0.95));
          ctx.strokeStyle = mg;
          ctx.lineWidth = 3.0;
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, rx * (1.20 + 0.09 * pulse), ry * (1.20 + 0.09 * pulse), 0, 0, TAU);
          ctx.strokeStyle = C.out(pal.ringNext, 0.30 + 0.24 * pulse);
          ctx.lineWidth = 1.3;
          ctx.stroke();
          /* a light column standing up out of the ring */
          ctx.restore();
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const top = this.PT(g.x, g.z, 0.62);
          if (top) {
            const cg = ctx.createLinearGradient(0, top.y, 0, c.y);
            cg.addColorStop(0, C.out(pal.ringNext, 0));
            cg.addColorStop(1, C.out(pal.ringNext, 0.05 + 0.03 * pulse));
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.moveTo(c.x - rx * 0.92, c.y);
            ctx.lineTo(top.x - rx * 0.34, top.y);
            ctx.lineTo(top.x + rx * 0.34, top.y);
            ctx.lineTo(c.x + rx * 0.92, c.y);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        } else if (hit) {
          if (flash < 0.02) { ctx.restore(); continue; }
          ctx.strokeStyle = C.out(C.mix(pal.ring, "#ffffff", 0.25), flash * 0.55);
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          if (flash > 0.02) {
            this.glow(pal.ring, c.x, c.y, Math.max(rx, ry) * 1.15, flash * 0.14);
          }
        } else {
          const near = clamp(0.30 - ahead * 0.055, 0.05, 0.30);
          ctx.strokeStyle = C.out(C.mix(pal.ring, "#ffffff", 0.25), near);
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    /* ── the pearl ─────────────────────────────────────────────── */
    drawMarble(scene, pal) {
      const ctx = this.g || this.ctx;
      const mx = clamp(scene.mx || 0, -1.05, 1.05);
      const mz = clamp(scene.mz || 0, -1.05, 1.05);
      const p = this.plane(mx, mz, MARBLE_R);
      const pr = this.P(p);
      if (!pr) return;
      this.pearlScreen = { x: pr.x, y: pr.y };

      const rs = clamp((this.focal * MARBLE_R * 1.35) / pr.z, 5, 34);

      /* a short trail, so speed can be seen */
      const tr = this.trail;
      const last = tr.length ? tr[tr.length - 1] : null;
      if (!last || Math.hypot(last.x - pr.x, last.y - pr.y) < this.w * 0.22) tr.push({ x: pr.x, y: pr.y });
      else tr.length = 0;
      while (tr.length > 11) tr.shift();
      if (tr.length > 2) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < tr.length - 1; i++) {
          const f = i / (tr.length - 1);
          ctx.beginPath();
          ctx.arc(tr[i].x, tr[i].y, rs * (0.20 + f * 0.55), 0, TAU);
          ctx.fillStyle = C.out(pal.pearl, 0.03 + f * 0.08);
          ctx.fill();
        }
        ctx.restore();
      }

      /* contact shadow, thrown away from the light */
      const sh = this.PT(mx + 0.045, mz + 0.05, 0.004);
      if (sh) {
        ctx.save();
        const sg = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, rs * 2.0);
        sg.addColorStop(0, "rgba(0,0,0,0.62)");
        sg.addColorStop(0.55, "rgba(0,0,0,0.22)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y, rs * 1.75, rs * 0.72, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      /* the glow it throws on the tray */
      this.glow(pal.pearl2, pr.x, pr.y + rs * 0.30, rs * 1.75, 0.08);

      /* reflection on the polished slab */
      ctx.save();
      ctx.globalAlpha = 0.14;
      const rg = ctx.createLinearGradient(0, pr.y + rs * 0.5, 0, pr.y + rs * 2.4);
      rg.addColorStop(0, C.out(pal.pearl, 1));
      rg.addColorStop(1, C.out(pal.pearl, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y + rs * 1.5, rs * 0.82, rs * 1.15, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* the sphere */
      const bg = ctx.createRadialGradient(
        pr.x - rs * 0.38, pr.y - rs * 0.42, rs * 0.06,
        pr.x, pr.y, rs * 1.02
      );
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.26, C.out(C.lite(pal.pearl, 0.70), 1));
      bg.addColorStop(0.62, C.out(C.lite(pal.pearl, 0.18), 1));
      bg.addColorStop(1, C.out(C.dark(pal.pearl2, 0.58), 1));
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rs, 0, TAU);
      ctx.fillStyle = bg;
      ctx.fill();

      /* the shadowed side, so it reads as a ball */
      ctx.save();
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rs, 0, TAU);
      ctx.clip();
      const tg = ctx.createRadialGradient(
        pr.x + rs * 0.55, pr.y + rs * 0.62, rs * 0.12,
        pr.x + rs * 0.30, pr.y + rs * 0.30, rs * 1.5
      );
      tg.addColorStop(0, C.out(C.dark(pal.pearl2, 0.55), 0.55));
      tg.addColorStop(0.6, C.out(C.dark(pal.pearl2, 0.30), 0.20));
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.fillRect(pr.x - rs, pr.y - rs, rs * 2, rs * 2);

      /* rim light from the room */
      const rl = ctx.createLinearGradient(pr.x - rs, pr.y + rs, pr.x + rs, pr.y - rs);
      rl.addColorStop(0, C.out(pal.rimA, 0.34));
      rl.addColorStop(0.5, "rgba(255,255,255,0)");
      rl.addColorStop(1, C.out(pal.rimB, 0.16));
      ctx.fillStyle = rl;
      ctx.fillRect(pr.x - rs, pr.y - rs, rs * 2, rs * 2);
      ctx.restore();

      /* speculars */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const s1 = ctx.createRadialGradient(
        pr.x - rs * 0.34, pr.y - rs * 0.40, 0,
        pr.x - rs * 0.34, pr.y - rs * 0.40, rs * 0.52
      );
      s1.addColorStop(0, "rgba(255,255,255,0.95)");
      s1.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = s1;
      ctx.beginPath();
      ctx.arc(pr.x - rs * 0.34, pr.y - rs * 0.40, rs * 0.52, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pr.x + rs * 0.30, pr.y + rs * 0.34, rs * 0.14, 0, TAU);
      ctx.fillStyle = C.out(C.lite(pal.pearl2, 0.7), 0.5);
      ctx.fill();
      ctx.restore();

      this.drawBabi(scene, pal, p, rs);
    }

    /* ── Babi: a small gold charm that rides alongside ─────────── */
    drawBabi(scene, pal, p, rs) {
      const ctx = this.g || this.ctx;
      const b = this.babi;
      const t = this.time;
      const tp = this.P([
        p[0] + 0.30,
        p[1] + 0.19 + Math.sin(t * 2.1) * 0.022,
        p[2] - 0.05,
      ]);
      if (!tp) return;
      if (!b.ready) { b.x = tp.x; b.y = tp.y; b.ready = true; }
      b.vx += (tp.x - b.x) * 0.34;
      b.vy += (tp.y - b.y) * 0.34;
      b.vx *= 0.84; b.vy *= 0.84;
      b.x += b.vx; b.y += b.vy;

      const rb = clamp(rs * 0.60, 6, 14);
      const mood = clamp(scene.babiMood || 0, 0, 1);
      const x = b.x, y = b.y;

      /* aura */
      this.glow(C.mix(pal.ringNext, "#ffffff", 0.3), x, y, rb * 2.1, 0.07 + mood * 0.05);

      /* body: a polished gold coin */
      const bg = ctx.createRadialGradient(x - rb * 0.38, y - rb * 0.48, rb * 0.05, x, y, rb * 1.02);
      bg.addColorStop(0, "#fffdf4");
      bg.addColorStop(0.30, C.out(C.lite(pal.ringNext, 0.55), 1));
      bg.addColorStop(0.70, C.out(pal.ringNext, 1));
      bg.addColorStop(1, C.out(C.dark(pal.ringNext, 0.42), 1));
      ctx.beginPath();
      ctx.arc(x, y, rb, 0, TAU);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = C.out(C.dark(pal.ringNext, 0.25), 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
      /* the rim catching the room, top-left only */
      ctx.beginPath();
      ctx.arc(x, y, rb * 0.94, Math.PI * 1.05, Math.PI * 1.62);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = Math.max(1, rb * 0.10);
      ctx.stroke();

      /* face: two calm eyes and a small smile */
      const ex = rb * 0.26, ey = -rb * 0.08, er = Math.max(0.8, rb * 0.075);
      ctx.fillStyle = "rgba(58,22,30,0.88)";
      ctx.beginPath(); ctx.ellipse(x - ex, y + ey, er, er * 1.25, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + ex, y + ey, er, er * 1.25, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(58,22,30,0.78)";
      ctx.lineWidth = Math.max(0.7, rb * 0.060);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, y + rb * 0.12, rb * 0.26, 0.28 * Math.PI, 0.72 * Math.PI);
      ctx.stroke();
      /* one small highlight so it reads as polished */
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(x - rb * 0.42, y - rb * 0.46, Math.max(0.6, rb * 0.10), 0, TAU);
      ctx.fill();

      /* a little crown of light when the run is hot */
      if (mood > 0.55) {
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i - 1) * 0.5;
          const px = x + Math.cos(a) * rb * 1.5;
          const py = y + Math.sin(a) * rb * 1.5;
          this.glow(pal.ringNext, px, py, rb * 0.7, 0.4 * mood);
        }
      }
    }

    drawParticles() {
      const ctx = this.g || this.ctx;
      if (!this.particles.length) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const f = 1 - p.life / p.max;
        ctx.fillStyle = C.out(p.color, 0.9 * f);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + f * 0.9), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ── small type, spaced like a title card ──────────────────── */
    spaced(text, x, y, spacing, align) {
      const ctx = this.g || this.ctx;
      const chars = String(text).split("");
      const widths = [];
      let total = 0;
      for (let i = 0; i < chars.length; i++) {
        const m = ctx.measureText(chars[i]);
        const w = (m && m.width) || 6;
        widths.push(w);
        total += w + spacing;
      }
      total -= spacing;
      let px = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
      for (let i = 0; i < chars.length; i++) {
        ctx.fillText(chars[i], px, y);
        px += widths[i] + spacing;
      }
      return total;
    }

    pill(x, y, w, h, stroke, fill, glowColor, glowAmount) {
      const ctx = this.g || this.ctx;
      ctx.save();
      if (glowColor) {
        ctx.shadowColor = C.out(glowColor, 0.9);
        ctx.shadowBlur = glowAmount || 10;
      }
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
      else ctx.rect(x, y, w, h);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    /* ── the two thumbs, one at each end of the phone ──────────── */
    drawGrips(scene, pal) {
      const ctx = this.g || this.ctx;
      const held = scene.heldBy || [false, false];
      const pads = [
        {
          x: this.w / 2, y: this.h - 26, color: pal.rimA, on: held[0],
          label: isTouch() ? "PLAYER ONE · BOTTOM" : "PLAYER ONE · W A S D",
        },
        {
          x: this.w / 2, y: 64, color: pal.rimB, on: held[1],
          label: isTouch() ? "PLAYER TWO · TOP" : "PLAYER TWO · ARROWS",
        },
      ];
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const w = 158, h = 27;
        const x = p.x - w / 2, y = p.y - h / 2;
        const on = p.on;

        ctx.save();
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";

        if (on) this.glow(p.color, p.x, p.y, w * 0.75, 0.10);
        this.pill(
          x, y, w, h,
          on ? C.out(p.color, 0.85) : "rgba(255,255,255,0.13)",
          on ? C.out(p.color, 0.14) : "rgba(255,255,255,0.035)",
          on ? p.color : null,
          12
        );

        /* the little status dot */
        const dx = x + 15;
        ctx.beginPath();
        ctx.arc(dx, p.y, 2.8, 0, TAU);
        ctx.fillStyle = on ? C.out(C.lite(p.color, 0.5), 1) : "rgba(255,255,255,0.18)";
        ctx.fill();
        if (on) {
          ctx.beginPath();
          ctx.arc(dx, p.y, 6.5, 0, TAU);
          ctx.strokeStyle = C.out(p.color, 0.45);
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        ctx.fillStyle = on ? C.out(C.lite(p.color, 0.55), 0.98) : "rgba(255,255,255,0.42)";
        ctx.font = "600 9.5px ui-sans-serif, system-ui, -apple-system, sans-serif";
        this.spaced(p.label, dx + 9, p.y + 0.5, 0.9, "left");
        ctx.restore();
      }
    }

    /* ── a bubble level, like the one in the iPhone's Measure app ── */
    drawLevel(scene, pal) {
      const ctx = this.g || this.ctx;
      const w = this.w, h = this.h;

      if (!scene.sensor) {
        const pw = 176, ph = 26;
        const x = w / 2 - pw / 2, y = h - 62;
        this.pill(x, y, pw, ph, "rgba(255,170,120,0.5)", "rgba(255,140,90,0.10)", null);
        ctx.save();
        ctx.fillStyle = "rgba(255,196,160,0.95)";
        ctx.font = "600 9.5px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        this.spaced("TOUCH MODE · NO SENSOR", w / 2, y + ph / 2 + 0.5, 1.1, "center");
        ctx.restore();
        return;
      }

      const R = Math.min(56, w * 0.115);
      const cx = w / 2;
      const cy = h - R - 66;
      const tx = clamp(this.tiltX, -1, 1);
      const ty = clamp(this.tiltY, -1, 1);
      const flat = Math.hypot(tx, ty) < 0.07;
      const col = flat ? "#8ff0e2" : "#ffd28a";

      ctx.save();

      /* glass disc */
      const gl = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx, cy, R);
      gl.addColorStop(0, "rgba(255,255,255,0.10)");
      gl.addColorStop(0.55, "rgba(12,6,24,0.55)");
      gl.addColorStop(1, "rgba(4,2,10,0.72)");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = gl;
      ctx.fill();

      /* bezel */
      const bez = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      bez.addColorStop(0, C.out(C.lite(col, 0.5), flat ? 0.95 : 0.5));
      bez.addColorStop(0.5, C.out(col, flat ? 0.7 : 0.28));
      bez.addColorStop(1, C.out(C.dark(col, 0.3), flat ? 0.6 : 0.22));
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.strokeStyle = bez;
      ctx.lineWidth = flat ? 2.6 : 1.8;
      if (flat) { ctx.shadowColor = C.out(col, 1); ctx.shadowBlur = 16; }
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* ticks */
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const r0 = R * (i % 3 === 0 ? 0.80 : 0.86);
        const r1 = R * 0.93;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.strokeStyle = "rgba(255,255,255," + (i % 3 === 0 ? 0.26 : 0.13) + ")";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      /* crosshair + tolerance ring */
      ctx.strokeStyle = "rgba(255,255,255,0.20)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.62, cy); ctx.lineTo(cx + R * 0.62, cy);
      ctx.moveTo(cx, cy - R * 0.62); ctx.lineTo(cx, cy + R * 0.62);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.34, 0, TAU);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = C.out(col, 0.30);
      ctx.stroke();
      ctx.setLineDash([]);

      /* the bubble itself */
      const bx = cx + tx * R * 0.70;
      const by = cy + ty * R * 0.70;
      this.glow(col, bx, by, R * 0.85, 0.35);
      const bg = ctx.createRadialGradient(bx - R * 0.09, by - R * 0.11, 0, bx, by, R * 0.285);
      bg.addColorStop(0, "rgba(255,255,255,0.99)");
      bg.addColorStop(0.55, C.out(C.lite(col, 0.55), 0.95));
      bg.addColorStop(1, C.out(col, 0.75));
      ctx.beginPath();
      ctx.arc(bx, by, R * 0.255, 0, TAU);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = C.out(C.lite(col, 0.8), 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();

      /* label */
      ctx.fillStyle = flat ? C.out(col, 0.85) : "rgba(255,255,255,0.30)";
      ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      this.spaced(flat ? "LEVEL" : "TIP TO LEVEL", cx, cy + R + 11, 1.6, "center");

      ctx.restore();
      void pal;
    }

    /* ── atmosphere over everything ────────────────────────────── */
    drawPost(pal) {
      const ctx = this.g || this.ctx;
      const w = this.w, h = this.h;

      /* a shaft of light coming in from the upper left */
      const shaft = ctx.createLinearGradient(w * 0.10, 0, w * 0.70, h);
      shaft.addColorStop(0, C.out(pal.trayTop, 0.055));
      shaft.addColorStop(0.45, C.out(pal.trayTop, 0.016));
      shaft.addColorStop(1, C.out(pal.trayTop, 0));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.moveTo(w * 0.02, -h * 0.05);
      ctx.lineTo(w * 0.34, -h * 0.05);
      ctx.lineTo(w * 0.76, h * 1.05);
      ctx.lineTo(w * 0.26, h * 1.05);
      ctx.closePath();
      ctx.fillStyle = shaft;
      ctx.fill();
      ctx.restore();

      /* out-of-focus lights in the foreground, for depth */
      const fg = [
        { x: 0.06, y: 0.92, r: 0.13, c: pal.ringNext, a: 0.10 },
        { x: 0.93, y: 0.86, r: 0.10, c: pal.halo, a: 0.09 },
        { x: 0.80, y: 1.02, r: 0.07, c: pal.rimB, a: 0.07 },
      ];
      for (let i = 0; i < fg.length; i++) {
        const f = fg[i];
        const x = w * f.x + Math.sin(this.time * 0.4 + i) * 4;
        const y = h * f.y;
        const r = w * f.r;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, C.out(f.c, f.a * 0.55));
        rg.addColorStop(0.55, C.out(f.c, f.a * 0.28));
        rg.addColorStop(0.86, C.out(f.c, f.a * 0.10));
        rg.addColorStop(1, C.out(f.c, 0));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }

      /* warm bloom on the horizon */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const bl = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.max(w, h) * 0.42);
      bl.addColorStop(0, C.out(pal.halo, 0.06));
      bl.addColorStop(1, C.out(pal.halo, 0));
      ctx.fillStyle = bl;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      /* vignette */
      const g = ctx.createRadialGradient(
        w / 2, h * 0.50, Math.min(w, h) * 0.26,
        w / 2, h * 0.50, Math.max(w, h) * 0.76
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.7, "rgba(3,1,10,0.42)");
      g.addColorStop(1, "rgba(2,0,8,0.88)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* top and bottom fades so the canvas melts into the page */
      const tg = ctx.createLinearGradient(0, 0, 0, h * 0.16);
      tg.addColorStop(0, "rgba(4,2,10,0.55)");
      tg.addColorStop(1, "rgba(4,2,10,0)");
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, w, h * 0.16);
      const bg2 = ctx.createLinearGradient(0, h, 0, h * 0.86);
      bg2.addColorStop(0, "rgba(4,2,10,0.62)");
      bg2.addColorStop(1, "rgba(4,2,10,0)");
      ctx.fillStyle = bg2;
      ctx.fillRect(0, h * 0.86, w, h * 0.14);
    }
  }

  DWB.Stage = Stage;
  DWB.isTouch = isTouch;
  DWB.MENU_PAL = MENU_PAL;

  /* ── little top-down previews for the level cards ───────────── */
  function drawLevelPreview(canvas, level) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 58;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2;
    const r = size * 0.40;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - r, cy - r, r * 2, r * 2, size * 0.09);
    else ctx.rect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.beginPath();
    for (let k = 0; k <= level.gates; k++) {
      const x = cx + level.gateX(k) * r * 0.92;
      const y = cy + level.gateZ(k) * r * 0.92;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = C.rgba(level.pal.ring, 0.30);
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let k = 0; k < level.gates; k += Math.max(1, Math.round(level.gates / 7))) {
      const x = cx + level.gateX(k) * r * 0.92;
      const y = cy + level.gateZ(k) * r * 0.92;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.045, 0, TAU);
      ctx.strokeStyle = C.rgba(level.pal.ringNext, 0.85);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx + level.gateX(0) * r * 0.92, cy + level.gateZ(0) * r * 0.92, size * 0.05, 0, TAU);
    ctx.fillStyle = C.rgba(level.pal.pearl, 0.95);
    ctx.fill();
  }

  DWB.drawLevelPreview = drawLevelPreview;
})();
