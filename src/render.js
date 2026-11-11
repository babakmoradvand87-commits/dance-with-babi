/* ──────────────────────────────────────────────────────────────
   Dance with Babi — render.js
   Everything you see: a glass sphere, a choreography drawn on it,
   rings, a pearl called Babi, and two dials.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const V = DWB.V, M = DWB.M, clamp = DWB.clamp;
  const TAU = Math.PI * 2;
  const CAM_Z = 3.35;

  /* ── colour helpers ───────────────────────────────────────── */
  const C = {
    parse(hex) {
      const h = hex.replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    rgba(hex, a) {
      const c = C.parse(hex);
      return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + clamp(a, 0, 1).toFixed(3) + ")";
    },
    mix(h1, h2, t) {
      const a = C.parse(h1), b = C.parse(h2);
      const f = (i) => Math.round(a[i] + (b[i] - a[i]) * clamp(t, 0, 1));
      return "rgb(" + f(0) + "," + f(1) + "," + f(2) + ")";
    },
  };

  const isTouch = () =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  class Stage {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.mode = "duet";
      this.w = 0; this.h = 0; this.dpr = 1;
      this.particles = [];
      this.stars = [];
      this.pathCache = { path: null, pts: null };
      this.babi = { x: 0, y: 0, vx: 0, vy: 0, ready: false, spin: 0 };
      this.time = 0;
      this.resize();
    }

    /* ── geometry ──────────────────────────────────────────── */
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.dpr = dpr; this.w = w; this.h = h;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layout();
      this.makeStars();
    }

    layout() {
      const w = this.w, h = this.h, m = Math.min(w, h);
      this.cx = w / 2;
      this.cy = h * (h > w ? 0.41 : 0.44);
      this.R = Math.min(w * (h > w ? 0.46 : 0.34), h * 0.32);
      this.f = this.R * Math.sqrt(CAM_Z * CAM_Z - 1);
      this.dialR = clamp(m * 0.085, 32, 54);
      const dy = h - Math.max(this.dialR + 26, h * 0.115) - (isTouch() ? 10 : 0);
      if (this.mode === "solo") {
        this.dials = [{ x: w * 0.5, y: dy }];
      } else {
        const inset = Math.max(this.dialR + 20, w * 0.2);
        this.dials = [
          { x: clamp(inset, 20 + this.dialR, w / 2 - this.dialR - 24), y: dy },
          { x: clamp(w - inset, w / 2 + this.dialR + 24, w - 20 - this.dialR), y: dy },
        ];
      }
    }

    setMode(mode) {
      this.mode = mode;
      this.layout();
    }

    makeStars() {
      const n = Math.round(clamp((this.w * this.h) / 22000, 40, 130));
      this.stars = [];
      for (let i = 0; i < n; i++) {
        this.stars.push({
          x: Math.random(), y: Math.random(),
          r: Math.random() * 1.5 + 0.4,
          ph: Math.random() * TAU,
          sp: 0.4 + Math.random() * 1.4,
        });
      }
    }

    projectRot(v) {
      const depth = CAM_Z - v[2];
      const s = this.f / depth;
      return { x: this.cx + v[0] * s, y: this.cy - v[1] * s, z: v[2], s: s };
    }

    project(mat, v) {
      return this.projectRot(M.apply(mat, v));
    }

    pts(path) {
      if (this.pathCache.path === path) return this.pathCache.pts;
      const N = 300;
      const pts = new Array(N);
      for (let i = 0; i < N; i++) pts[i] = path.pointAt(i / N);
      this.pathCache = { path: path, pts: pts };
      return pts;
    }

    gateFrame(level, path, s) {
      let c = level.__gf;
      if (!c || c.path !== path) c = level.__gf = { path: path, map: {} };
      const k = s.toFixed(5);
      let f = c.map[k];
      if (!f) {
        const p = path.pointAt(s);
        const t = path.tangentAt(s);
        let up = Math.abs(t[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
        const b1 = V.norm(V.cross(t, up));
        const b2 = V.norm(V.cross(t, b1));
        f = c.map[k] = { p: p, b1: b1, b2: b2 };
      }
      return f;
    }

    /* ── particles ─────────────────────────────────────────── */
    burst(x, y, color, n, speed) {
      const count = n || 16;
      const sp = speed || 150;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const v = sp * (0.25 + Math.random() * 0.9);
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - sp * 0.12,
          life: 0,
          max: 0.5 + Math.random() * 0.7,
          size: 0.9 + Math.random() * 2.4,
          color: color,
        });
      }
    }

    updateParticles(dt) {
      const p = this.particles;
      for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        q.life += dt;
        if (q.life >= q.max) { p.splice(i, 1); continue; }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 1 - 2.4 * dt;
        q.vy = q.vy * (1 - 2.4 * dt) + 42 * dt;
      }
    }

    /* ── master draw ───────────────────────────────────────── */
    draw(scene, dt) {
      const ctx = this.ctx;
      const lv = scene.level;
      const accent = lv ? lv.accent : "#ff9ecb";
      const accent2 = lv ? lv.accent2 : "#ffd28a";

      this.time += dt;
      this.updateParticles(dt);

      ctx.clearRect(0, 0, this.w, this.h);
      this.drawBackdrop(scene, accent, accent2);

      if (scene.path) {
        const mat = M.mul(M.z(scene.sway || 0), M.align(scene.path.pointAt(scene.ballS), [0, 0, 1]));
        this.drawSphere(scene, accent, accent2);
        this.drawPath(scene, mat, accent, accent2);
        this.drawGates(scene, mat, accent, accent2);

        /* light & dust */
        this.drawParticles(scene);
        this.drawBall(scene, mat, accent2);
      } else {
        /* title screen: a slow idle sphere */
        this.drawIdle(dt);
      }

      if (scene.showDials) this.drawDials(scene, accent, accent2, dt);
      this.drawVignette();
    }

    drawIdle(dt) {
      const ctx = this.ctx;
      const R = this.R;
      this.idleRot = (this.idleRot || 0) + dt * 0.12;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const a = this.idleRot + (i * TAU) / 3;
        ctx.beginPath();
        ctx.ellipse(
          this.cx + Math.cos(a) * R * 0.32,
          this.cy + Math.sin(a) * R * 0.26,
          R * (0.5 + 0.06 * Math.sin(a * 2)),
          R * (0.19 + 0.05 * Math.cos(a * 3)),
          a * 0.6,
          0, TAU
        );
        ctx.strokeStyle = C.rgba(i === 0 ? "#ff9ecb" : i === 1 ? "#8ff0e2" : "#ffd28a", 0.16);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawBackdrop(scene, accent, accent2) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
      g.addColorStop(0, "#07050e");
      g.addColorStop(0.55, "#0c0817");
      g.addColorStop(1, "#100a1a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const rg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.R * 2.7);
      rg.addColorStop(0, C.rgba(accent, 0.17));
      rg.addColorStop(0.45, C.rgba(accent, 0.05));
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      const rg2 = ctx.createRadialGradient(w * 0.82, h * 0.14, 0, w * 0.82, h * 0.14, this.R * 1.7);
      rg2.addColorStop(0, C.rgba(accent2, 0.07));
      rg2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg2;
      ctx.fillRect(0, 0, w, h);

      /* stars */
      const t = this.time;
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        const a = 0.16 + 0.34 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        ctx.fillStyle = "rgba(255,245,255," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
        ctx.fill();
      }
      void scene;
    }

    drawSphere(scene, accent, accent2) {
      const ctx = this.ctx, R = this.R, cx = this.cx, cy = this.cy;

      /* outer halo */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.5);
      halo.addColorStop(0, C.rgba(accent, 0.10));
      halo.addColorStop(0.35, C.rgba(accent, 0.045));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* glass body */
      const body = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.42, R * 0.02, cx, cy, R * 1.04);
      body.addColorStop(0, "rgba(255,255,255,0.11)");
      body.addColorStop(0.32, "rgba(190,170,235,0.055)");
      body.addColorStop(0.72, "rgba(120,95,180,0.03)");
      body.addColorStop(0.97, "rgba(90,60,140,0.075)");
      body.addColorStop(1, "rgba(140,110,200,0.10)");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = body;
      ctx.fill();

      /* rim light — a thin edge that catches the light at the top left */
      const rim = ctx.createLinearGradient(cx - R * 0.95, cy - R * 0.95, cx + R * 0.85, cy + R);
      rim.addColorStop(0, C.rgba(accent2, 0.85));
      rim.addColorStop(0.3, C.rgba(accent, 0.45));
      rim.addColorStop(0.62, C.rgba(accent, 0.16));
      rim.addColorStop(1, C.rgba(accent, 0.42));
      ctx.beginPath();
      ctx.arc(cx, cy, R - 0.75, 0, TAU);
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.7;
      ctx.stroke();

      /* a second, softer edge just inside it, so the glass has some thickness */
      const rim2 = ctx.createLinearGradient(cx - R * 0.9, cy - R, cx + R, cy + R * 0.9);
      rim2.addColorStop(0, C.rgba(accent2, 0.16));
      rim2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R - 5, 0, TAU);
      ctx.strokeStyle = rim2;
      ctx.lineWidth = 3.4;
      ctx.stroke();

      /* specular sheen */
      const sp = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.46, 0, cx - R * 0.38, cy - R * 0.46, R * 0.72);
      sp.addColorStop(0, "rgba(255,255,255,0.07)");
      sp.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(cx - R * 0.38, cy - R * 0.46, R * 0.72, 0, TAU);
      ctx.fillStyle = sp;
      ctx.fill();

      /* a soft equator, so the ball reads as a sphere */
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.clip();
      const eq = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
      eq.addColorStop(0, "rgba(0,0,0,0)");
      eq.addColorStop(0.55, "rgba(0,0,0,0)");
      eq.addColorStop(1, "rgba(6,3,14,0.42)");
      ctx.fillStyle = eq;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();

      /* beat pulse around the pearl */
      if (scene.beatPhase != null && scene.beatPhase >= 0) {
        const ph = scene.beatPhase;
        const rad = R * (0.09 + ph * 0.42);
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, TAU);
        ctx.strokeStyle = C.rgba(accent2, 0.22 * (1 - ph) * (1 - ph));
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    drawPath(scene, mat, accent, accent2) {
      const ctx = this.ctx;
      const pts = this.pts(scene.path);
      const n = pts.length;
      const proj = new Array(n);
      for (let i = 0; i < n; i++) proj[i] = this.project(mat, pts[i]);
      const frac = scene.ballS - Math.floor(scene.ballS);

      /* the choreography, band by band: bright where the pearl is,
         ghostly at the far end of the dance */
      const BANDS = 26;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let b = 0; b < BANDS; b++) {
        const i0 = Math.floor((b * n) / BANDS);
        const i1 = Math.floor(((b + 1) * n) / BANDS);
        const mid = (i0 + i1) / 2 / n;
        let d = Math.abs(mid - frac);
        d = Math.min(d, 1 - d);
        const fade = clamp(1 - d / 0.42, 0.09, 1);
        const near = clamp(1 - d / 0.1, 0, 1);

        for (let front = 0; front < 2; front++) {
          let any = false;
          ctx.beginPath();
          for (let i = i0; i < i1; i++) {
            const a = proj[i], bb = proj[(i + 1) % n];
            const c = (a.z + bb.z) * 0.5;
            if (front ? c < 0 : c >= 0) continue;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(bb.x, bb.y);
            any = true;
          }
          if (!any) continue;
          ctx.strokeStyle = front ? accent : accent2;
          ctx.globalAlpha = front ? 0.40 * fade + near * 0.55 : 0.16 * fade;
          ctx.lineWidth = front ? 1.5 + near * 2.6 : 0.9;
          ctx.stroke();
        }
      }
      ctx.restore();

      /* the tail of light the pearl drags behind it */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const N = 18;
      for (let b = 0; b < N; b++) {
        const f0 = 1 - b / N, f1 = 1 - (b + 1) / N;
        const s0 = frac - (b / N) * 0.07;
        const s1 = frac - ((b + 1) / N) * 0.07;
        const a = this.project(mat, scene.path.pointAt(s0));
        const bb = this.project(mat, scene.path.pointAt(s1));
        ctx.strokeStyle = accent2;
        ctx.globalAlpha = 0.5 * f0 * f0;
        ctx.lineWidth = 0.6 + 3.6 * f0 * f0;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bb.x, bb.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawGates(scene, mat, accent, accent2) {
      const ctx = this.ctx;
      const level = scene.level;
      const path = scene.path;
      const gates = scene.gates || [];
      const SEG = 24;

      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        const rel = i - scene.nextGate;
        if (rel < -1 || rel > 5) continue;
        const fr = this.gateFrame(level, path, g.s);
        const center = M.apply(mat, fr.p);
        const b1 = M.apply(mat, fr.b1);
        const b2 = M.apply(mat, fr.b2);
        const back = center[2] < -0.02;
        const occl = back ? 0.10 : 1;

        let rad = 0.118;
        let color = accent;
        let alpha = 0.3;
        let width = 1.3;
        let glow = 0;

        if (g.state === 1) {
          /* taken — a flash that expands and dies */
          const fl = g.flash == null ? 0 : g.flash;
          if (fl <= 0) continue;
          rad = 0.118 + (1 - fl) * 0.16;
          color = g.q === 3 ? "#fffaf0" : accent2;
          alpha = fl * 0.95;
          width = 2.6 * fl + 0.6;
          glow = 18;
        } else if (g.state === 2) {
          color = "#8b7f96";
          alpha = 0.10;
          width = 1;
        } else if (i === scene.nextGate) {
          const pulse = 0.5 + 0.5 * Math.sin((scene.phase || 0) * TAU);
          rad = 0.122 + 0.012 * pulse;
          color = accent2;
          alpha = 0.85;
          width = 2.2 + pulse * 0.9;
          glow = 16 + pulse * 10;
        } else {
          const d = Math.max(0, rel);
          alpha = 0.34 * clamp(1 - d / 5.5, 0, 1);
        }

        if (alpha * occl <= 0.012) continue;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        if (glow && !back) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
        ctx.strokeStyle = C.rgba(color, alpha * occl);
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let k = 0; k <= SEG; k++) {
          const th = (k / SEG) * TAU;
          const c = Math.cos(th) * rad, s = Math.sin(th) * rad;
          const v = [
            center[0] + b1[0] * c + b2[0] * s,
            center[1] + b1[1] * c + b2[1] * s,
            center[2] + b1[2] * c + b2[2] * s,
          ];
          const q = this.projectRot(v);
          if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
        ctx.stroke();
        ctx.restore();

        /* a speck of light on the next ring, to make it sing */
        if (i === scene.nextGate && !back) {
          const q = this.projectRot(center);
          const pulse = 0.5 + 0.5 * Math.sin((scene.phase || 0) * TAU);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 16 + pulse * 9);
          gg.addColorStop(0, C.rgba(accent2, 0.5));
          gg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 16 + pulse * 9, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    drawBall(scene, mat, accent2) {
      const ctx = this.ctx;
      const cx = this.cx, cy = this.cy;
      const rs = this.R * 0.058;
      const mood = scene.babiMood || 0;

      /* glow */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, rs * 5.2);
      gl.addColorStop(0, "rgba(255,244,220,0.34)");
      gl.addColorStop(0.22, C.rgba(accent2, 0.22));
      gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(cx, cy, rs * 5.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* pearl */
      const pg = ctx.createRadialGradient(cx - rs * 0.34, cy - rs * 0.38, rs * 0.06, cx, cy, rs);
      pg.addColorStop(0, "#fffdf6");
      pg.addColorStop(0.5, "#ffeccb");
      pg.addColorStop(1, "#ffb877");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(cx, cy, rs, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - rs * 0.36, cy - rs * 0.4, rs * 0.19, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();

      /* ── Babi, the little companion ───────────────────── */
      const b = this.babi;
      const t = this.time;
      const targetX = cx + Math.cos(t * 0.9) * this.R * 0.16 + Math.cos(t * 2.3) * 5;
      const targetY = cy + Math.sin(t * 0.9) * this.R * 0.13 + Math.sin(t * 1.7) * 5 + this.R * 0.05;
      if (!b.ready) { b.x = targetX; b.y = targetY; b.ready = true; }
      b.vx += (targetX - b.x) * 0.9;
      b.vy += (targetY - b.y) * 0.9;
      b.vx *= 0.88; b.vy *= 0.88;
      b.x += b.vx; b.y += b.vy;

      const rb = clamp(this.R * 0.05, 7, 12);
      const bob = Math.sin(t * 3.1) * 1.8;
      const spin = clamp(mood, 0, 1);

      /* ribbons */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,228,196,0.45)";
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + bob);
        ctx.bezierCurveTo(
          b.x + side * rb * 1.9, b.y - rb * 1.5 + bob,
          b.x + side * rb * 3.0, b.y + rb * 2.5 + bob,
          b.x + side * rb * 1.7 + Math.sin(t * 2.4 + side) * 7, b.y + rb * 3.6 + bob
        );
        ctx.stroke();
      }
      ctx.restore();

      /* body */
      const bg = ctx.createRadialGradient(b.x - rb * 0.36, b.y - rb * 0.44 + bob, rb * 0.08, b.x, b.y + bob, rb);
      bg.addColorStop(0, "#fffdfa");
      bg.addColorStop(0.5, "#ffd8ea");
      bg.addColorStop(1, "#ff8fc0");
      ctx.save();
      ctx.shadowColor = "rgba(255,150,195,0.75)";
      ctx.shadowBlur = 14 + spin * 12;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(b.x, b.y + bob, rb, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* face */
      const happy = mood > 0.3;
      const fy = b.y + bob;
      ctx.strokeStyle = "rgba(72,32,64,0.85)";
      ctx.lineWidth = Math.max(1.2, rb * 0.15);
      ctx.lineCap = "round";
      const ex = rb * 0.38, ey = fy - rb * 0.1;
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        if (happy) {
          ctx.arc(b.x + side * ex, ey + rb * 0.12, rb * 0.24, Math.PI * 1.12, Math.PI * 1.88);
        } else {
          ctx.ellipse(b.x + side * ex, ey, rb * 0.15, rb * 0.21, 0, 0, TAU);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      if (happy) ctx.arc(b.x, fy + rb * 0.16, rb * 0.34, Math.PI * 0.16, Math.PI * 0.84);
      else {
        ctx.moveTo(b.x - rb * 0.24, fy + rb * 0.42);
        ctx.quadraticCurveTo(b.x, fy + rb * 0.54, b.x + rb * 0.24, fy + rb * 0.42);
      }
      ctx.stroke();
      void mat;
    }

    drawParticles() {
      const ctx = this.ctx;
      if (!this.particles.length) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const f = 1 - p.life / p.max;
        ctx.fillStyle = C.rgba(p.color, 0.85 * f);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + f * 0.8), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ── dials ─────────────────────────────────────────────── */
    drawDials(scene, accent, accent2, dt) {
      const ctx = this.ctx;
      const duet = this.mode !== "solo";
      const showKeys = !isTouch();

      if (duet) this.drawRibbon(scene, accent, accent2);

      for (let z = 0; z < this.dials.length; z++) {
        const d = this.dials[z];
        const angle = scene.cum[z] || 0;
        const held = scene.held && scene.held[z];
        const tint = z === 0 ? accent : duet ? "#8ff0e2" : accent2;
        const label = duet ? (z === 0 ? "player one" : "player two") : "your hands";
        const keys = showKeys ? (z === 0 ? ["A", "D"] : ["←", "→"]) : null;

        /* glow disc */
        const pulse = held ? 1 : 0.55;
        const gl = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, this.dialR * 2.1);
        gl.addColorStop(0, C.rgba(tint, 0.20 * pulse));
        gl.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(d.x, d.y, this.dialR * 2.1, 0, TAU);
        ctx.fill();

        /* dial face */
        ctx.beginPath();
        ctx.arc(d.x, d.y, this.dialR, 0, TAU);
        ctx.fillStyle = "rgba(255,255,255,0.045)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 1;
        ctx.stroke();

        /* ticks */
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU - Math.PI / 2;
          const r0 = this.dialR * 0.84, r1 = this.dialR * (k % 3 === 0 ? 0.97 : 0.92);
          ctx.beginPath();
          ctx.moveTo(d.x + Math.cos(a) * r0, d.y + Math.sin(a) * r0);
          ctx.lineTo(d.x + Math.cos(a) * r1, d.y + Math.sin(a) * r1);
          ctx.strokeStyle = "rgba(255,255,255," + (k % 3 === 0 ? 0.28 : 0.14) + ")";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        /* rotation arc + handle */
        const spin = (angle % TAU + TAU) % TAU;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(d.x, d.y, this.dialR * 0.68, -Math.PI / 2, -Math.PI / 2 + spin);
        ctx.strokeStyle = C.rgba(tint, 0.9);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.shadowColor = tint;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();

        const hx = d.x + Math.cos(-Math.PI / 2 + spin) * this.dialR * 0.68;
        const hy = d.y + Math.sin(-Math.PI / 2 + spin) * this.dialR * 0.68;
        ctx.beginPath();
        ctx.arc(hx, hy, 4.4, 0, TAU);
        ctx.fillStyle = "#fffdf7";
        ctx.fill();

        /* labels */
        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "600 9.5px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(label.toUpperCase(), d.x, d.y + this.dialR + 17);
        if (keys) {
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.fillText(keys[0] + "  ·  " + keys[1], d.x, d.y + this.dialR + 30);
        }
        ctx.restore();

        /* turning hint */
        if (scene.showHint) {
          const a0 = -Math.PI * 0.72, a1 = -Math.PI * 0.05;
          const pulseA = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 3.2));
          ctx.save();
          ctx.strokeStyle = C.rgba(tint, pulseA);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(d.x, d.y, this.dialR * 1.28, a0, a1);
          ctx.stroke();
          const ax = d.x + Math.cos(a1) * this.dialR * 1.28;
          const ay = d.y + Math.sin(a1) * this.dialR * 1.28;
          ctx.beginPath();
          ctx.moveTo(ax - 5, ay - 5);
          ctx.lineTo(ax + 3, ay + 1);
          ctx.lineTo(ax - 6, ay + 4);
          ctx.closePath();
          ctx.fillStyle = C.rgba(tint, pulseA + 0.2);
          ctx.fill();
          ctx.restore();
        }
      }
      void dt;
    }

    drawRibbon(scene, accent, accent2) {
      const ctx = this.ctx;
      const a = this.dials[0], b = this.dials[1];
      if (!a || !b) return;
      const tangle = clamp(scene.tangle || 0, 0, 1);
      const col = tangle > 0.02 ? C.mix(accent2, "#ff5d5d", tangle) : accent2;
      const midX = (a.x + b.x) / 2;
      const sag = 22 + tangle * 26;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = C.rgba("#ffd28a", 0) ;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.18 + 0.4 * tangle;
      ctx.lineWidth = 1.2 + tangle * 2.2;
      ctx.setLineDash(tangle > 0.35 ? [2 + tangle * 5, 3 + tangle * 9] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const wob = Math.sin(this.time * 6) * tangle * 7;
      ctx.quadraticCurveTo(midX, a.y + sag + wob, b.x, b.y);
      ctx.stroke();
      ctx.restore();
      void accent;
    }

    drawVignette() {
      const ctx = this.ctx;
      const g = ctx.createRadialGradient(
        this.w / 2, this.h * 0.45, Math.min(this.w, this.h) * 0.22,
        this.w / 2, this.h * 0.5, Math.max(this.w, this.h) * 0.78
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(2,0,8,0.72)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  /* ── little previews for the level cards ──────────────────── */
  function drawLevelPreview(canvas, level) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 58;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const path = level.path;
    const cx = size / 2, cy = size / 2, r = size * 0.42;
    const rot = M.mul(M.axis([1, 0, 0], -0.5), M.axis([0, 1, 0], 0.6));
    ctx.beginPath();
    for (let i = 0; i <= 220; i++) {
      const p = M.apply(rot, path.pointAt(i / 220));
      const depth = 1.9 - p[2];
      const s = (r * 1.9) / depth;
      const x = cx + p[0] * s * 0.62;
      const y = cy - p[1] * s * 0.62;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = C.rgba(level.accent, 0.9);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  DWB.Stage = Stage;
  DWB.drawLevelPreview = drawLevelPreview;
  DWB.isTouch = isTouch;
})();
