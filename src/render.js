/* ──────────────────────────────────────────────────────────────
   Dance with Babi — render.js  ·  "Open Floor"
   No tray, no walls. An endless dance floor drawn on a 2D canvas:
   a pearl running across a mirror-dark ground under an aurora that
   never ends, one ring per beat laid along a ribbon that wanders
   off into the dark. The camera follows the pearl.

   No WebGL, no assets, no network — gradients, paths and a couple
   of cached glow sprites.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const V = DWB.V;
  const clamp = DWB.clamp;
  const TAU = Math.PI * 2;
  const FOV = (58 * Math.PI) / 180;
  const MARBLE_R = 0.100;
  const RING_R = 0.32;
  const GRID = 1.15;          /* world spacing of the floor inlay */

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
    dark(hex, t) { return C.mix(hex, [3, 2, 8], t); },
    lite(hex, t) { return C.mix(hex, [255, 255, 255], t); },
  };

  const MENU_PAL = {
    bg0: "#050510", bg1: "#0d1c2b", fog: "#0a1520",
    ring: "#ff9ecb", ringNext: "#ffd28a",
    rimA: "#ff9ecb", rimB: "#8ff0e2",
    pearl: "#fff4dc", pearl2: "#ffb877",
    floor: "#0b1622", halo: "#ff9ecb", aura2: "#7ff0d8",
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
      this.time = 0;
      this.tiltX = 0; this.tiltY = 0;
      this.particles = [];
      this.trail = [];
      this.stars = [];
      this.lights = [];
      this.babi = { x: 0, y: 0, vx: 0, vy: 0, ready: false };
      this.pearlScreen = { x: 0, y: 0 };
      this.follow = { x: 0, z: 0 };
      this._glow = new Map();
      this.g = null;
      this._sky = null; this._skyKey = "";
      this._post = null;
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
      this.camHeight = 2.00;
      this.camBack = 3.70;

      /* stars and distant lanterns, in a unit square that we tile */
      this.stars = [];
      const ns = Math.round(clamp((w * h) / 9000, 40, 150));
      for (let i = 0; i < ns; i++) {
        this.stars.push({
          x: Math.random(), y: Math.random() * 0.62,
          r: 0.4 + Math.random() * 1.5,
          tw: Math.random() * TAU,
          sp: 0.4 + Math.random() * 1.6,
        });
      }
      this.lights = [];
      const nl = Math.round(clamp(w / 150, 6, 16));
      for (let i = 0; i < nl; i++) {
        this.lights.push({
          x: Math.random(), y: 0.10 + Math.random() * 0.34,
          r: 0.010 + Math.random() * 0.026,
          ph: Math.random() * TAU,
          sp: 0.15 + Math.random() * 0.4,
          warm: Math.random(),
        });
      }
      this._skyKey = "";
      this._post = null;
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
          rg.addColorStop(0.35, C.out(hex, 0.42));
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

    buildLayer(paint) {
      const cv = makeCanvas(this.canvas.width, this.canvas.height);
      if (!cv) return null;
      const g = cv.getContext("2d");
      if (!g) return null;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.g = g;
      try { paint(g); } catch (e) { this.g = null; return null; }
      this.g = null;
      return cv;
    }

    /* the atmosphere over the whole frame never changes: bake it */
    bake(pal) {
      const key = [pal.bg0, pal.bg1, pal.fog, pal.halo, this.w, this.h, this.dpr].join("|");
      if (this._skyKey === key) return;
      this._skyKey = key;
      this._sky = this.buildLayer(() => this.drawSky(pal));
      this._post = this.buildLayer(() => this.drawPost(pal));
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

    reset() {
      this.particles.length = 0;
      this.trail.length = 0;
      this.babi.ready = false;
    }

    /* ── projection ────────────────────────────────────────────── */
    P(p) {
      const pr = DWB.project(this.cam, this.focal, this.cx, this.cy, p);
      if (!pr || pr.z < 0.2) return null;
      return pr;
    }
    /* a point on the floor (or above it) */
    PT(x, z, y) { return this.P([x, y || 0, z]); }

    /* a circle lying flat on the floor, as a screen ellipse */
    disc(x, z, r, y) {
      const yy = y == null ? 0.004 : y;
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
      const ctx = this.ctx;
      const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
      this.time += dt;
      this.tiltX = clamp(scene.tx || 0, -1, 1);
      this.tiltY = clamp(scene.ty || 0, -1, 1);
      this.updateParticles(dt);

      const pal = (scene.level && (scene.level.pal || scene.level)) || MENU_PAL;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);

      /* the camera glides after the pearl, leaning with the phone */
      const fx = scene.mx || 0, fz = scene.mz || 0;
      const lead = scene.demo ? 2.4 : 3.4;
      this.follow.x += (fx - this.follow.x) * Math.min(1, dt * lead);
      this.follow.z += (fz - this.follow.z) * Math.min(1, dt * lead);

      const t = this.time;
      const swayX = Math.sin(t * 0.21) * 0.10 + Math.sin(t * 0.07) * 0.05;
      const swayY = Math.sin(t * 0.33) * 0.035;
      const beat = scene.phase == null ? 0 : Math.sin(clamp(scene.phase, 0, 1) * Math.PI) * 0.05;
      const f = this.follow;
      const eye = [
        f.x + swayX + this.tiltX * 0.26,
        this.camHeight + swayY - beat * 0.10,
        f.z + this.camBack,
      ];
      const target = [
        f.x + this.tiltX * 0.42,
        0.50,
        f.z - 1.05,
      ];
      const cam = DWB.camera(eye, target, [0, 1, 0], this.tiltX * 0.030 + swayX * 0.02);
      this.cam = cam;
      this.horizonY = (this.P([f.x, 0, f.z - 400]) || { y: this.h * 0.34 }).y;

      this.bake(pal);
      if (this._sky) ctx.drawImage(this._sky, 0, 0, this.w, this.h);
      else this.drawSky(pal);
      this.drawAurora(pal);
      this.drawStars(pal);
      this.drawLights(pal);
      this.drawGround(pal);

      ctx.save();
      if (scene.shake > 0.01) {
        const s3 = scene.shake * 10;
        ctx.translate((Math.random() - 0.5) * s3, (Math.random() - 0.5) * s3);
      }
      /* the path is the notes themselves — no line is drawn anymore */
      this.drawGuide(scene, pal);
      this.drawRings(scene, pal);
      this.drawNotes(scene, pal);
      this.drawMarble(scene, pal);
      this.drawParticles();
      ctx.restore();

      if (this._post) ctx.drawImage(this._post, 0, 0, this.w, this.h);
      else this.drawPost(pal);

      if (!scene.demo) this.drawThumbs(scene, pal);

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

    /* ── the sky: a gradient and a horizon of light ───────────── */
    drawSky(pal) {
      const ctx = this.g || this.ctx, w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, C.out(C.dark(pal.bg0, 0.30), 1));
      g.addColorStop(0.34, C.out(pal.bg1, 1));
      g.addColorStop(0.62, C.out(C.mix(pal.bg1, pal.fog, 0.55), 1));
      g.addColorStop(1, C.out(C.dark(pal.fog, 0.30), 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* the band of light where the floor meets the dark */
      const hy = h * 0.42;
      const rg = ctx.createRadialGradient(w * 0.5, hy, 0, w * 0.5, hy, Math.max(w, h) * 0.75);
      rg.addColorStop(0, C.out(pal.halo, 0.16));
      rg.addColorStop(0.24, C.out(pal.halo, 0.055));
      rg.addColorStop(0.6, C.out(pal.aura2 || pal.halo, 0.018));
      rg.addColorStop(1, C.out(pal.halo, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }

    /* bands of light hanging over the floor, slowly moving */
    drawAurora(pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const px = -this.follow.x * 8;
      const t = this.time;
      const a2 = pal.aura2 || pal.halo;
      const bands = [
        { y: 0.10, amp: 0.055, col: pal.halo, a: 0.10, sp: 0.19 },
        { y: 0.18, amp: 0.045, col: a2, a: 0.085, sp: 0.13 },
        { y: 0.27, amp: 0.035, col: C.mix(pal.halo, a2, 0.5), a: 0.07, sp: 0.23 },
        { y: 0.05, amp: 0.030, col: C.lite(a2, 0.3), a: 0.05, sp: 0.31 },
      ];
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < bands.length; i++) {
        const b = bands[i];
        const y0 = h * b.y + Math.sin(t * b.sp + i) * h * 0.012;
        const amp = h * b.amp;
        const x0 = -w * 0.25 + ((px * (0.4 + i * 0.15)) % (w * 1.5));
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (let k = 0; k <= 6; k++) {
          const x = x0 + (w * 1.5 * k) / 6;
          const y = y0 + Math.sin(t * b.sp * 1.7 + k * 0.9 + i) * amp * 0.5;
          ctx.lineTo(x, y);
        }
        for (let k = 6; k >= 0; k--) {
          const x = x0 + (w * 1.5 * k) / 6;
          const y = y0 + amp + Math.sin(t * b.sp * 1.3 + k * 1.1 + i) * amp * 0.5;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + amp * 2.2);
        g.addColorStop(0, C.out(b.col, 0));
        g.addColorStop(0.35, C.out(b.col, b.a));
        g.addColorStop(0.7, C.out(b.col, b.a * 0.45));
        g.addColorStop(1, C.out(b.col, 0));
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
    }

    drawStars(pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const px = -this.follow.x * 6, py = -this.follow.z * 3;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const tw = 0.45 + 0.55 * Math.sin(this.time * s.sp + s.tw);
        const x = ((s.x * w * 1.4 + px) % (w * 1.4) + w * 1.4) % (w * 1.4) - w * 0.2;
        const y = s.y * h + py;
        if (y < -4 || y > h * 0.72) continue;
        ctx.fillStyle = C.out(C.lite(pal.aura2 || pal.halo, 0.6), 0.15 + 0.55 * tw);
        ctx.beginPath();
        ctx.arc(x, y, s.r * (0.7 + 0.5 * tw), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* drifting lanterns in the air, for depth */
    drawLights(pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const px = -this.follow.x * 26, py = -this.follow.z * 9;
      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        const x = ((l.x * w * 1.6 + px) % (w * 1.6) + w * 1.6) % (w * 1.6) - w * 0.3;
        const y = l.y * h + py + Math.sin(this.time * l.sp + l.ph) * 7;
        const r = w * l.r * (1 + 0.15 * Math.sin(this.time * l.sp * 1.7 + l.ph));
        const col = C.mix(pal.halo, pal.ringNext, l.warm);
        const a = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * 0.9 + l.ph));
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        rg.addColorStop(0, C.out(col, a));
        rg.addColorStop(0.35, C.out(col, a * 0.35));
        rg.addColorStop(1, C.out(col, 0));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    /* ── the endless floor ─────────────────────────────────────── */
    drawGround(pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const fy = this.horizonY;
      const f = this.follow;

      /* the sheet itself, deepest at the horizon */
      const fg = ctx.createLinearGradient(0, fy, 0, h);
      fg.addColorStop(0, C.out(C.mix(pal.fog, pal.floor, 0.62), 1));
      fg.addColorStop(0.28, C.out(C.mix(pal.floor, pal.halo, 0.07), 1));
      fg.addColorStop(1, C.out(C.dark(pal.floor, 0.62), 1));
      ctx.fillStyle = fg;
      ctx.fillRect(0, fy - 1, w, Math.max(0, h - fy + 1));

      /* inlaid lines, anchored to the world so they stream past */
      const half = 9.5;
      const bx = Math.round(f.x / GRID), bz = Math.round(f.z / GRID);
      ctx.save();
      ctx.lineWidth = 1;
      for (let i = -half; i <= half; i++) {
        const x = (bx + i) * GRID;
        const a = this.PT(x, f.z - 16, 0.001);
        const b = this.PT(x, f.z + this.camBack - 0.7, 0.001);
        if (a && b) {
          const d = Math.abs(i) / half;
          ctx.strokeStyle = C.out(C.lite(pal.floor, 0.55), 0.20 * (1 - d * 0.85));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (let j = -5; j <= 16; j++) {
        const z = (bz + j) * GRID;
        const a = this.PT(f.x - 18, z, 0.001);
        const b = this.PT(f.x + 18, z, 0.001);
        if (a && b) {
          const d = clamp(Math.abs(j - 5) / 13, 0, 1);
          ctx.strokeStyle = C.out(C.lite(pal.floor, 0.55), 0.20 * (1 - d * 0.9));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.restore();

      /* a pool of light under the pearl, so the floor reads as polished */
      const c = this.PT(f.x, f.z, 0.001);
      if (c) {
        const rx = w * 0.46;
        const rg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rx);
        rg.addColorStop(0, C.out(pal.halo, 0.09));
        rg.addColorStop(0.4, C.out(pal.halo, 0.028));
        rg.addColorStop(1, C.out(pal.halo, 0));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, rx * 0.30, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      /* the rose of the ballroom, inlaid at the middle of the floor */
      ctx.save();
      const rose = [
        { r: 2.4, a: 0.10, w: 1.2 },
        { r: 2.62, a: 0.06, w: 1.0 },
        { r: 4.3, a: 0.045, w: 1.0 },
        { r: 7.2, a: 0.028, w: 1.0 },
      ];
      for (let i = 0; i < rose.length; i++) {
        const e2 = this.disc(0, 0, rose[i].r, 0.002);
        if (!e2) continue;
        ctx.save();
        ctx.translate(e2.x, e2.y);
        ctx.rotate(e2.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, e2.rx, e2.ry, 0, 0, TAU);
        ctx.strokeStyle = C.out(pal.ringNext, rose[i].a);
        ctx.lineWidth = rose[i].w;
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = C.out(pal.ringNext, 0.035);
      ctx.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const a3 = (i / 16) * TAU;
        const p1 = this.PT(Math.cos(a3) * 2.68, Math.sin(a3) * 2.68, 0.002);
        const p2 = this.PT(Math.cos(a3) * 4.25, Math.sin(a3) * 4.25, 0.002);
        if (!p1 || !p2) continue;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();

      /* glitter caught in the polish */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gx0 = Math.round(f.x / 1.7), gz0 = Math.round(f.z / 1.7);
      for (let a = -4; a <= 4; a++) {
        for (let b = -1; b <= 6; b++) {
          const hsh = Math.sin((gx0 + a) * 12.9898 + (gz0 + b) * 78.233) * 43758.5453;
          const fr = hsh - Math.floor(hsh);
          if (fr > 0.34) continue;
          const wx = (gx0 + a) * 1.7 + fr * 1.3;
          const wz = (gz0 + b) * 1.7 + (fr * 7 % 1);
          const p2 = this.PT(wx, wz, 0.002);
          if (!p2) continue;
          const tw = 0.5 + 0.5 * Math.sin(this.time * (1.4 + fr * 2) + fr * 40);
          const r = 0.7 + fr * 1.8;
          ctx.fillStyle = C.out(C.lite(pal.halo, 0.5), 0.10 + 0.34 * tw);
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, r * (0.6 + tw * 0.7), 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();

      /* the aurora, faintly, on the floor */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const ar = ctx.createLinearGradient(0, fy, 0, h);
      ar.addColorStop(0, C.out(pal.aura2 || pal.halo, 0.07));
      ar.addColorStop(0.35, C.out(pal.halo, 0.022));
      ar.addColorStop(1, C.out(pal.halo, 0));
      ctx.fillStyle = ar;
      ctx.fillRect(0, fy, w, Math.max(0, h - fy));
      ctx.restore();

      /* where the floor dissolves into the sky */
      const hz = ctx.createLinearGradient(0, fy - h * 0.08, 0, fy + h * 0.14);
      hz.addColorStop(0, C.out(pal.fog, 0.85));
      hz.addColorStop(0.45, C.out(C.mix(pal.fog, pal.halo, 0.10), 0.55));
      hz.addColorStop(1, C.out(pal.fog, 0));
      ctx.fillStyle = hz;
      ctx.fillRect(0, fy - h * 0.08, w, h * 0.22);
    }

    /* ── the ribbon the dance follows ──────────────────────────── */
    drawPath(scene, pal, dt) {
      const gates = scene.gates;
      if (!gates || !gates.length) return;
      const ctx = this.ctx;
      const ng = scene.nextGate || 0;
      /* the trail lingers: show well behind and ahead of the next ring and
         fade by age, instead of vanishing a few gates back */
      const from = Math.max(0, ng - 12);
      const to = Math.min(gates.length, ng + 20);
      if (to - from < 2) return;

      /* chevrons flow at the SONG's tempo: one dash-gap per beat, so slow
         songs flow slowly and fast songs flow fast */
      const spb = (scene.level && scene.level.spb) || 0.5;
      this._beatAcc = (this._beatAcc || 0) + (dt || 0.016) / spb;
      const SP = 46;
      const flow = (this._beatAcc * SP) % SP;

      const pts = [];
      for (let k = from; k < to; k++) {
        const p = this.PT(gates[k].x, gates[k].z, 0.002);
        if (p) pts.push({ p, k });
      }
      if (pts.length > 1) {
        /* chevrons flowing along the ribbon, so the way is obvious */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        let carry = -flow;
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1].p.x, ay = pts[i - 1].p.y;
          const bx = pts[i].p.x, by = pts[i].p.y;
          const seg = Math.hypot(bx - ax, by - ay) || 1;
          const ux = (bx - ax) / seg, uy = (by - ay) / seg;
          const fade = clamp(1 - Math.abs(pts[i].k - ng) / 22, 0.12, 1);
          let d = carry;
          while (d < seg) {
            if (d > 0) {
              const x = ax + ux * d, y = ay + uy * d;
              ctx.beginPath();
              ctx.moveTo(x - ux * 4 - uy * 5, y - uy * 4 + ux * 5);
              ctx.lineTo(x + ux * 3, y + uy * 3);
              ctx.lineTo(x - ux * 4 + uy * 5, y - uy * 4 - ux * 5);
              ctx.strokeStyle = C.out(C.lite(pal.ringNext, 0.65), 0.55 * fade);
              ctx.lineWidth = 2;
              ctx.lineCap = "round";
              ctx.stroke();
            }
            d += SP;
          }
          carry = d - seg;
        }
        ctx.restore();
      }

      if (pts.length > 1) {
        /* a faint glow band only — the NOTES are the visible path now,
           still fading with age segment by segment */
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1].p, b = pts[i].p;
          const fade = clamp(1 - Math.abs(pts[i].k - ng) / 24, 0.08, 1);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = C.out(pal.ringNext, 0.09 * fade);
          ctx.lineWidth = 16;
          ctx.stroke();
        }
      }
    }

    /* ── the path is music: one floating 3D note per beat ─────────
       each note's pitch is the note the song actually plays on that
       beat; once you pass a note, its colour dims */
    drawNotes(scene, pal) {
      const gates = scene.gates;
      if (!gates || !gates.length) return;
      const ctx = this.ctx;
      const ng = scene.nextGate || 0;
      const from = Math.max(0, ng - 16);
      const to = Math.min(gates.length, ng + 24);
      for (let k = from; k < to; k++) {
        const g = gates[k];
        const midi = g.note || 0;
        if (!midi) continue;                       /* rest — no note here */
        const e = this.disc(g.x, g.z, RING_R);
        if (!e) continue;
        const hp = this.PT(g.x, g.z, 0.42);
        if (!hp) continue;
        const ahead = k - ng;
        const fade = clamp(1 - Math.abs(ahead) / 30, 0.15, 1);
        const s = Math.max(9, e.rx * (0.72 + (midi - 48) * 0.05));
        const hue = (midi * 14 + 318) % 360;
        const done = g.state !== 0;                /* passed → dimmed */
        const col = done
          ? "hsla(" + hue + ", 22%, 30%, " + (0.32 * fade) + ")"
          : "hsla(" + hue + ", 90%, 67%, " + (0.95 * fade) + ")";
        this.noteGlyph(hp.x, hp.y, s, col, done);
      }
    }

    /* an eighth-note glyph: head, stem, flag */
    noteGlyph(x, y, s, color, dim) {
      const ctx = this.ctx;
      ctx.save();
      if (!dim) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1.4, s * 0.10);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.30, s * 0.22, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.26, y - s * 0.12);
      ctx.lineTo(x + s * 0.26, y - s * 1.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.26, y - s * 1.12);
      ctx.quadraticCurveTo(x + s * 0.95, y - s * 0.94, x + s * 0.66, y - s * 0.42);
      ctx.stroke();
      ctx.restore();
    }

    /* ── the rescue line: pearl lost → a glowing guide to the path ── */
    drawGuide(scene, pal) {
      const gates = scene.gates;
      if (!gates || !gates.length || scene.demo) return;
      const ng = scene.nextGate || 0;
      const g0 = gates[ng];
      if (!g0 || g0.state !== 0) return;
      const far = Math.hypot((scene.mx || 0) - g0.x, (scene.mz || 0) - g0.z);
      if (far < 6) return;   /* not really lost yet */
      /* only when the main path is out of sight: if the next ring (or one
         of the few after it) still shows on screen, the ribbon already
         guides — the rescue line stays hidden */
      let pathVisible = false;
      for (let k = ng; k < Math.min(gates.length, ng + 4); k++) {
        const p = this.PT(gates[k].x, gates[k].z, 0.03);
        if (p && p.x > -100 && p.x < this.w + 100 && p.y > -100 && p.y < this.h + 100) {
          pathVisible = true;
          break;
        }
      }
      if (pathVisible) return;
      const ctx = this.ctx;
      const p0 = this.PT(scene.mx || 0, scene.mz || 0, 0.03);
      if (!p0) return;
      const pts = [p0];
      const to = Math.min(gates.length, ng + 6);
      for (let k = ng; k < to; k++) {
        const p = this.PT(gates[k].x, gates[k].z, 0.03);
        if (p) pts.push(p);
      }
      if (pts.length < 2) return;
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 4.5);
      const SP = 34;
      const flow = (this.time * 60) % SP;
      /* a smooth curve through the points, not a jagged polyline */
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      };
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      /* colour fades from the pearl's warm white to the next ring's colour */
      const a0 = pts[0], a1 = pts[pts.length - 1];
      const grad = ctx.createLinearGradient(a0.x, a0.y, a1.x, a1.y);
      grad.addColorStop(0, C.out(C.lite(pal.pearl, 0.75), 1));
      grad.addColorStop(1, C.out(pal.ringNext, 1));
      /* one soft glow pass */
      path();
      ctx.strokeStyle = C.out(pal.pearl, 0.10 * pulse + 0.05);
      ctx.lineWidth = 9;
      ctx.stroke();
      /* a slim bright dashed core flowing toward the ring */
      path();
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.85 * pulse;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([SP * 0.55, SP * 0.45]);
      ctx.lineDashOffset = -flow;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      /* a soft glowing chevron at the end, pointing along the path */
      const a = pts[pts.length - 1], b = pts[pts.length - 2] || pts[0];
      const seg = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ux = (a.x - b.x) / seg, uy = (a.y - b.y) / seg;
      ctx.beginPath();
      ctx.moveTo(a.x + ux * 14, a.y + uy * 14);
      ctx.lineTo(a.x - uy * 6, a.y + ux * 6);
      ctx.lineTo(a.x + uy * 6, a.y - ux * 6);
      ctx.closePath();
      ctx.fillStyle = C.out(pal.ringNext, 0.85 * pulse);
      ctx.shadowColor = C.out(pal.ringNext, 0.9);
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.restore();
    }

    /* ── the rings ─────────────────────────────────────────────── */
    drawRings(scene, pal) {
      const ctx = this.ctx;
      const gates = scene.gates;
      if (!gates || !gates.length) return;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.4);
      const nextK = scene.nextGate;

      for (let k = 0; k < gates.length; k++) {
        const g = gates[k];
        /* big rings and portal rings are drawn larger */
        const rr = g.kind === "portal" ? RING_R * 1.75 : g.kind === "big" ? RING_R * 1.45 : RING_R;
        const e = this.disc(g.x, g.z, rr);
        if (!e) continue;
        const col = g.kind === "portal" ? (pal.aura2 || pal.ring) : pal.ring;
        const isNext = k === nextK;
        const hit = g.state === 1;
        const flash = g.flash || 0;
        const ahead = nextK == null ? 9 : k - nextK;
        if (!isNext && !hit && (ahead < 0 || ahead > 8)) continue;

        if (isNext) this.glow(pal.ringNext, e.x, e.y, Math.max(e.rx, e.ry) * 1.7, 0.06 + 0.04 * pulse);

        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);

        if (isNext) {
          /* the ring you owe, in gold, with a column of light */
          ctx.beginPath();
          ctx.ellipse(0, 0, e.rx * (1.20 + 0.09 * pulse), e.ry * (1.20 + 0.09 * pulse), 0, 0, TAU);
          ctx.strokeStyle = C.out(pal.ringNext, 0.26 + 0.22 * pulse);
          ctx.lineWidth = 1.3;
          ctx.stroke();

          const mg = ctx.createLinearGradient(-e.rx, -e.ry, e.rx, e.ry);
          mg.addColorStop(0, C.out(C.lite(pal.ringNext, 0.85), 1));
          mg.addColorStop(0.35, C.out(C.lite(pal.ringNext, 0.30), 1));
          mg.addColorStop(0.75, C.out(pal.ringNext, 0.95));
          mg.addColorStop(1, C.out(C.dark(pal.ringNext, 0.45), 0.95));
          ctx.beginPath();
          ctx.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU);
          ctx.strokeStyle = mg;
          ctx.lineWidth = 3.0;
          ctx.stroke();
          ctx.restore();

          /* a gem floating over the ring you owe */
          const gm = this.PT(g.x, g.z, 0.46 + 0.04 * Math.sin(this.time * 2.6));
          if (gm) {
            const gr = clamp((this.focal * 0.035) / gm.z, 2, 9);
            this.glow(pal.ringNext, gm.x, gm.y, gr * 4.2, 0.22);
            ctx.save();
            ctx.translate(gm.x, gm.y);
            ctx.rotate(Math.PI / 4 + this.time * 0.5);
            ctx.fillStyle = C.out(C.lite(pal.ringNext, 0.55), 0.95);
            ctx.fillRect(-gr * 0.62, -gr * 0.62, gr * 1.24, gr * 1.24);
            ctx.restore();
          }

        } else if (hit) {
          if (flash < 0.02) { ctx.restore(); continue; }
          ctx.beginPath();
          ctx.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU);
          ctx.strokeStyle = C.out(C.mix(pal.ring, "#ffffff", 0.25), flash * 0.6);
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          this.glow(pal.ring, e.x, e.y, Math.max(e.rx, e.ry) * 1.2, flash * 0.16);
        } else {
          const near = clamp(0.42 - ahead * 0.07, 0.06, 0.42);
          ctx.beginPath();
          ctx.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU);
          ctx.strokeStyle = C.out(C.mix(col, "#ffffff", 0.25), near);
          ctx.lineWidth = 1.1;
          ctx.stroke();
          if (g.kind === "portal") {
            /* a portal ring has a second, slowly rotating outer ring */
            ctx.beginPath();
            ctx.ellipse(0, 0, e.rx * 1.3, e.ry * 1.3, 0, this.time * 0.6, this.time * 0.6 + Math.PI * 1.4);
            ctx.strokeStyle = C.out(col, near * 0.9);
            ctx.lineWidth = 1.6;
            ctx.stroke();
            this.glow(col, e.x, e.y, Math.max(e.rx, e.ry) * 1.6, near * 0.35);
          }
          ctx.restore();
        }
      }
    }

    /* ── the pearl ─────────────────────────────────────────────── */
    drawMarble(scene, pal) {
      const ctx = this.ctx;
      const mx = scene.mx || 0;
      const mz = scene.mz || 0;
      const pr = this.PT(mx, mz, MARBLE_R);
      if (!pr) return;
      this.pearlScreen = { x: pr.x, y: pr.y };

      const rs = clamp((this.focal * MARBLE_R * 1.35) / pr.z, 5, 42);

      /* trail */
      const tr = this.trail;
      const last = tr.length ? tr[tr.length - 1] : null;
      if (!last || Math.hypot(last.x - pr.x, last.y - pr.y) < this.w * 0.22) tr.push({ x: pr.x, y: pr.y });
      else tr.length = 0;
      while (tr.length > 12) tr.shift();
      if (tr.length > 2) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < tr.length - 1; i++) {
          const f = i / (tr.length - 1);
          ctx.beginPath();
          ctx.arc(tr[i].x, tr[i].y, rs * (0.18 + f * 0.55), 0, TAU);
          ctx.fillStyle = C.out(pal.pearl, 0.025 + f * 0.075);
          ctx.fill();
        }
        ctx.restore();
      }

      /* shadow and reflection on the polished floor */
      const sh = this.PT(mx + MARBLE_R * 0.9, mz + MARBLE_R * 1.1, 0.002);
      if (sh) {
        const sg = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, rs * 2.1);
        sg.addColorStop(0, "rgba(0,0,0,0.60)");
        sg.addColorStop(0.55, "rgba(0,0,0,0.20)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y, rs * 1.8, rs * 0.62, 0, 0, TAU);
        ctx.fill();
      }
      const fl = this.PT(mx, mz + MARBLE_R * 1.4, 0.002);
      if (fl) {
        ctx.save();
        ctx.globalAlpha = 0.13;
        const rg = ctx.createLinearGradient(0, fl.y, 0, fl.y + rs * 2.4);
        rg.addColorStop(0, C.out(pal.pearl, 1));
        rg.addColorStop(1, C.out(pal.pearl, 0));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(fl.x, fl.y + rs * 0.5, rs * 0.75, rs * 1.2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      this.glow(pal.pearl2, pr.x, pr.y, rs * 2.2, 0.10);

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

      ctx.save();
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rs, 0, TAU);
      ctx.clip();
      const tg = ctx.createRadialGradient(
        pr.x + rs * 0.55, pr.y + rs * 0.62, rs * 0.12,
        pr.x + rs * 0.30, pr.y + rs * 0.30, rs * 1.5
      );
      tg.addColorStop(0, C.out(C.dark(pal.pearl2, 0.55), 0.55));
      tg.addColorStop(0.6, C.out(C.dark(pal.pearl2, 0.30), 0.18));
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.fillRect(pr.x - rs, pr.y - rs, rs * 2, rs * 2);

      const rl = ctx.createLinearGradient(pr.x - rs, pr.y + rs, pr.x + rs, pr.y - rs);
      rl.addColorStop(0, C.out(pal.rimA, 0.34));
      rl.addColorStop(0.5, "rgba(255,255,255,0)");
      rl.addColorStop(1, C.out(pal.rimB, 0.16));
      ctx.fillStyle = rl;
      ctx.fillRect(pr.x - rs, pr.y - rs, rs * 2, rs * 2);
      ctx.restore();

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
      ctx.restore();

      this.drawBabi(scene, pal, pr, rs);
    }

    /* ── Babi: a small gold charm riding alongside ─────────────── */
    drawBabi(scene, pal, pr, rs) {
      const ctx = this.ctx;
      const b = this.babi;
      const t = this.time;
      const rb = clamp(rs * 0.52, 5, 14);
      const tx = pr.x + rs * 1.35 + Math.sin(t * 1.6) * rs * 0.18;
      const ty = pr.y - rs * 0.85 + Math.sin(t * 2.1) * rs * 0.22;

      if (!b.ready) { b.x = tx; b.y = ty; b.ready = true; }
      b.vx += (tx - b.x) * 0.30;
      b.vy += (ty - b.y) * 0.30;
      b.vx *= 0.84; b.vy *= 0.84;
      b.x += b.vx; b.y += b.vy;
      const x = b.x, y = b.y;
      const mood = clamp(scene.babiMood || 0, 0, 1);

      this.glow(C.mix(pal.ringNext, "#ffffff", 0.3), x, y, rb * 2.2, 0.07 + mood * 0.05);

      const bg = ctx.createRadialGradient(x - rb * 0.38, y - rb * 0.48, rb * 0.05, x, y, rb * 1.02);
      bg.addColorStop(0, "#fffdf4");
      bg.addColorStop(0.30, C.out(C.lite(pal.ringNext, 0.55), 1));
      bg.addColorStop(0.70, C.out(pal.ringNext, 1));
      bg.addColorStop(1, C.out(C.dark(pal.ringNext, 0.42), 1));
      ctx.beginPath();
      ctx.arc(x, y, rb, 0, TAU);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = C.out(C.dark(pal.ringNext, 0.25), 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, rb * 0.94, Math.PI * 1.05, Math.PI * 1.62);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = Math.max(1, rb * 0.10);
      ctx.stroke();

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
    }

    drawParticles() {
      const ctx = this.ctx;
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

    /* ── small type ────────────────────────────────────────────── */
    spaced(text, x, y, spacing, align) {
      const ctx = this.ctx;
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
      const ctx = this.ctx;
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
      const ctx = this.ctx;
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

        if (on) this.glow(p.color, p.x, p.y, w * 0.75, 0.08);
        this.pill(
          x, y, w, h,
          on ? C.out(p.color, 0.85) : "rgba(255,255,255,0.13)",
          on ? C.out(p.color, 0.14) : "rgba(255,255,255,0.035)",
          on ? p.color : null,
          12
        );

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

    /* ── where the thumbs go: one at the bottom, one at the top ── */
    drawThumbs(scene, pal) {
      const ctx = this.ctx;
      const w = this.w, h = this.h;
      const held = scene.heldBy || [false, false];
      const sensor = !!scene.sensor;
      const pads = [
        {
          x: w / 2, y: h - 92, r: 27, color: pal.rimA, on: held[0],
          label: isTouch() ? "PLAYER ONE" : "W A S D",
          hint: "thumb here",
        },
        {
          x: w / 2, y: 120, r: 27, color: pal.rimB, on: held[1],
          label: isTouch() ? "PLAYER TWO" : "ARROWS",
          hint: "thumb here",
        },
      ];
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.1);

      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const on = p.on;
        const a = on ? 1 : 0.35 + 0.25 * pulse;

        ctx.save();
        /* soft halo */
        this.glow(p.color, p.x, p.y, p.r * (on ? 3.0 : 2.2), on ? 0.16 : 0.06);

        /* the ring the thumb goes in */
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = on ? C.out(p.color, 0.16) : "rgba(10,5,20,0.42)";
        ctx.fill();
        ctx.setLineDash(on ? [] : [4, 5]);
        ctx.strokeStyle = C.out(p.color, a);
        ctx.lineWidth = on ? 2.2 : 1.4;
        ctx.stroke();
        ctx.setLineDash([]);

        /* a print inside: an oval and a little arc */
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 1, p.r * 0.30, p.r * 0.40, 0, 0, TAU);
        ctx.strokeStyle = on ? C.out(C.lite(p.color, 0.6), 0.9) : C.out(p.color, 0.55);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y + p.r * 0.62, p.r * 0.42, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.strokeStyle = C.out(p.color, on ? 0.7 : 0.28);
        ctx.lineWidth = 1.3;
        ctx.stroke();

        if (on) {
          /* a tick when the thumb is down */
          ctx.beginPath();
          ctx.arc(p.x + p.r * 0.72, p.y - p.r * 0.72, 6.5, 0, TAU);
          ctx.fillStyle = C.out(p.color, 0.95);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(p.x + p.r * 0.72 - 2.6, p.y - p.r * 0.72);
          ctx.lineTo(p.x + p.r * 0.72 - 0.6, p.y - p.r * 0.72 + 2.2);
          ctx.lineTo(p.x + p.r * 0.72 + 3.0, p.y - p.r * 0.72 - 2.4);
          ctx.strokeStyle = "#0b0714";
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        /* the name under it */
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "600 9.5px ui-sans-serif, system-ui, -apple-system, sans-serif";
        ctx.fillStyle = on ? C.out(C.lite(p.color, 0.55), 0.98) : C.out(p.color, 0.55);
        const label = on ? p.label + " · HOLDING" : p.label;
        this.spaced(label, p.x, p.y + p.r + 15, 1.0, "center");
        if (!on) {
          ctx.font = "500 8.5px ui-sans-serif, system-ui, sans-serif";
          ctx.fillStyle = "rgba(255,255,255,0.34)";
          this.spaced(p.hint, p.x, p.y + p.r + 27, 0.6, "center");
        }
        ctx.restore();
      }

      /* a quiet chip in the corner, only when the sensor is missing */
      if (!sensor) {
        ctx.save();
        this.pill(14, 96, 132, 22, "rgba(255,180,140,0.45)", "rgba(255,140,90,0.10)", null);
        ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,196,160,0.9)";
        this.spaced("NO SENSOR · TOUCH", 26, 107, 0.9, "left");
        ctx.restore();
      } else {
        ctx.save();
        this.pill(14, 96, 96, 22, "rgba(143,240,226,0.35)", "rgba(143,240,226,0.07)", null);
        ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(143,240,226,0.85)";
        this.spaced("GYROSCOPE", 26, 107, 0.9, "left");
        ctx.restore();
      }
    }

    /* ── atmosphere over everything ────────────────────────────── */
    drawPost(pal) {
      const ctx = this.g || this.ctx;
      const w = this.w, h = this.h;

      const bl = ctx.createRadialGradient(w / 2, h * 0.44, 0, w / 2, h * 0.44, Math.max(w, h) * 0.44);
      bl.addColorStop(0, C.out(pal.halo, 0.05));
      bl.addColorStop(1, C.out(pal.halo, 0));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = bl;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      const g = ctx.createRadialGradient(
        w / 2, h * 0.50, Math.min(w, h) * 0.26,
        w / 2, h * 0.50, Math.max(w, h) * 0.78
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.68, "rgba(3,1,10,0.40)");
      g.addColorStop(1, "rgba(2,0,8,0.88)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

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

  /* ── little top-down previews for the track cards ───────────── */
  function drawLevelPreview(canvas, level) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 58;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    /* centre the ribbon inside the little card */
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    const n = Math.min(level.points.length, level.gates);
    for (let k = 0; k < n; k++) {
      minX = Math.min(minX, level.points[k][0]);
      maxX = Math.max(maxX, level.points[k][0]);
      minZ = Math.min(minZ, level.points[k][1]);
      maxZ = Math.max(maxZ, level.points[k][1]);
    }
    const spanX = Math.max(1e-3, maxX - minX), spanZ = Math.max(1e-3, maxZ - minZ);
    const s = (size * 0.78) / Math.max(spanX, spanZ);
    const ox = size / 2 - ((minX + maxX) / 2) * s;
    const oz = size / 2 - ((minZ + maxZ) / 2) * s;

    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = ox + level.points[k][0] * s;
      const y = oz + level.points[k][1] * s;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = C.rgba(level.pal.ring, 0.55);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    for (let k = 0; k < n; k += Math.max(1, Math.round(n / 7))) {
      const x = ox + level.points[k][0] * s;
      const y = oz + level.points[k][1] * s;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.042, 0, TAU);
      ctx.strokeStyle = C.rgba(level.pal.ringNext, 0.85);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(ox, oz, size * 0.05, 0, TAU);
    ctx.fillStyle = C.rgba(level.pal.pearl, 0.95);
    ctx.fill();
  }

  DWB.drawLevelPreview = drawLevelPreview;
})();
