/* ──────────────────────────────────────────────────────────────
   Dance with Babi — render.js
   A hand-rolled 3D scene on a 2D canvas: a tray floating in a hall,
   tipped exactly the way the phone in your hands is tipped, a marble
   that runs downhill on it, and rings to be standing in on the beat.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const V = DWB.V;
  const clamp = DWB.clamp;
  const TAU = Math.PI * 2;
  const TRAY_HALF = DWB.TRAY_HALF || 1.02;
  const FOV = (50 * Math.PI) / 180;
  const LIGHT = (function () {
    const v = V.norm([0.35, 0.88, 0.32]);
    return v;
  })();
  const VIS = 0.52;      /* how many radians the tray leans per unit of tilt */
  const MARBLE_R = 0.062;
  const RING_R = 0.155;

  const isTouch = () =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

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
    mix(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ];
    },
  };

  class Stage {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.w = 0; this.h = 0; this.dpr = 1;
      this.particles = [];
      this.motes = [];
      this.time = 0;
      this.babi = { x: 0, y: 0, vx: 0, vy: 0, ready: false };
      this.tiltX = 0;
      this.tiltY = 0;
      this.pearlScreen = { x: 0, y: 0 };
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

      this.cx = w / 2;
      this.cy = h * 0.50;
      this.focal = (h / 2) / Math.tan(FOV / 2);
      /* pull back until the whole tray sits comfortably on the screen */
      const need = (2 * TRAY_HALF * 1.18 * this.focal) / (0.84 * w);
      this.dist = Math.max(2.15, need * 0.62);

      this.motes = [];
      const n = Math.round(clamp((w * h) / 26000, 26, 90));
      for (let i = 0; i < n; i++) {
        this.motes.push({
          a: Math.random() * TAU,
          r: 0.6 + Math.random() * 2.4,
          sp: 0.15 + Math.random() * 0.5,
          z: 1.2 + Math.random() * 5,
          y: (Math.random() - 0.5) * 2.6,
          ph: Math.random() * TAU,
        });
      }
    }

    /* ── particles ─────────────────────────────────────────── */
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
          size: 0.9 + Math.random() * 2.2, color: color,
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

    /* ── the tray's own little coordinate system ───────────── */
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

    /* ── the frame ─────────────────────────────────────────── */
    draw(scene, dt) {
      const ctx = this.ctx;
      this.time += dt;
      this.tiltX = clamp(scene.tx || 0, -1, 1);
      this.tiltY = clamp(scene.ty || 0, -1, 1);
      this.updateParticles(dt);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      if (scene.shake > 0.01) {
        const s2 = scene.shake * 9;
        ctx.translate((Math.random() - 0.5) * s2, (Math.random() - 0.5) * s2);
      }

      const pal = scene.level ? scene.level.pal : MENU_PAL;
      const orbit = Math.sin(this.time * 0.22) * 0.10;
      const eye = [orbit * 0.7, 2.30, 1.92 - Math.abs(orbit) * 0.2];
      const target = [0, 0.03, -0.10];
      const cam = DWB.camera(eye, target, [0, 1, 0], this.tiltX * 0.035);
      this.cam = cam;

      this.drawBackdrop(scene, pal);
      this.drawFloor(pal);
      this.drawColumns(pal);
      this.drawTray(scene, pal);
      this.drawRings(scene, pal);
      this.drawMarble(scene, pal);
      this.drawParticles();
      if (scene.showBars) this.drawGrips(scene, pal);
      this.drawLevel(scene, pal);
      this.drawVignette();
    }

    /* project a world point, or null if it is behind the camera */
    P(p) {
      const pr = DWB.project(this.cam, this.focal, this.cx, this.cy, p);
      if (!pr || pr.z < 0.2) return null;
      return pr;
    }

    /* ── background ────────────────────────────────────────── */
    drawBackdrop(scene, pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, pal.bg0);
      g.addColorStop(0.55, pal.bg1);
      g.addColorStop(1, pal.bg0);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const hy = this.cy - h * 0.06;
      const rg = ctx.createRadialGradient(this.cx, hy, 0, this.cx, hy, Math.max(w, h) * 0.55);
      rg.addColorStop(0, C.rgba(pal.halo, 0.20));
      rg.addColorStop(0.4, C.rgba(pal.halo, 0.06));
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const t = this.time;
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        m.a += m.sp * 0.0016;
        m.y += Math.sin(t * 0.4 + m.ph) * 0.00035;
        const p = this.P([Math.cos(m.a) * m.z * 0.55, m.y + 0.3, -Math.abs(Math.sin(m.a)) * 1.2 - 0.6]);
        if (!p) continue;
        const a = 0.06 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph));
        ctx.fillStyle = C.rgba(pal.halo, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, m.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      void scene;
    }

    drawFloor(pal) {
      const ctx = this.ctx;
      const y = -1.05;
      ctx.save();
      ctx.lineCap = "round";
      for (let i = -7; i <= 7; i++) {
        const x = i * 0.62;
        const a = this.P([x, y, 2.2]);
        const b = this.P([x * 1.35, y, -9]);
        if (!a || !b) continue;
        ctx.strokeStyle = C.rgba(pal.floor, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let j = 0; j < 12; j++) {
        const z = 2.04 - j * j * 0.075;
        const a = this.P([-8.7, y, z]);
        const b = this.P([8.7, y, z]);
        if (!a || !b) continue;
        ctx.strokeStyle = C.rgba(pal.floor, clamp(0.5 - j * 0.035, 0.05, 0.5));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      /* a pool of light under the tray */
      const c = this.P([0, y, -0.1]);
      const e = this.P([TRAY_HALF * 1.5, y, -0.1]);
      if (c && e) {
        const rx = Math.max(40, Math.abs(e.x - c.x));
        ctx.globalCompositeOperation = "lighter";
        const gg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rx);
        gg.addColorStop(0, C.rgba(pal.halo, 0.09));
        gg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, rx * 0.16, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawColumns(pal) {
      if (!this.meshes) this.meshes = {};
      if (!this.meshes.column) this.meshes.column = DWB.mesh.box(0.13, 1, 0.13);
      const mesh = this.meshes.column;
      const base = C.mix(C.parse(pal.column), C.parse(pal.tray), 0.38);
      for (let i = 0; i < 10; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        if (row > 4) continue;
        const x = side * (2.15 + row * 0.72);
        const z = -1.75 - row * 2.3;
        const hgt = 3.2 - row * 0.22;
        const verts = mesh.verts.map((v) => [
          v[0] * hgt + x,
          v[1] * hgt + (-1.05 + hgt / 2),
          v[2] * hgt + z,
        ]);
        this.quads(verts, mesh.faces, base, 0.9, pal, 0.3);
      }
    }

    /** project + light + painter-sort a bag of quads */
    quads(verts, faces, base, fog, pal, rim) {
      const ctx = this.ctx;
      const list = [];
      for (let i = 0; i < faces.length; i++) {
        const f = faces[i];
        const q = [];
        let zsum = 0, ok = true;
        for (let k = 0; k < f.length; k++) {
          const pr = this.P(verts[f[k]]);
          if (!pr) { ok = false; break; }
          q.push(pr);
          zsum += pr.z;
        }
        if (!ok) continue;
        const a = verts[f[0]], b = verts[f[1]], c = verts[f[2]];
        const n = V.norm(V.cross(V.sub(b, a), V.sub(c, a)));
        const diff = Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        const k2 = 0.28 + 0.74 * diff;
        const z = zsum / f.length;
        const fz = clamp((z - this.dist) / 7, 0, 1) * fog;
        const col = C.mix(C.mix(base, C.parse(pal.fog), fz), [255, 255, 255], rim * 0.10);
        list.push({
          z: z,
          c: "rgb(" + Math.round(col[0] * k2) + "," + Math.round(col[1] * k2) + "," + Math.round(col[2] * k2) + ")",
          p: q,
        });
      }
      list.sort((x, y) => y.z - x.z);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        ctx.beginPath();
        ctx.moveTo(it.p[0].x, it.p[0].y);
        for (let k = 1; k < it.p.length; k++) ctx.lineTo(it.p[k].x, it.p[k].y);
        ctx.closePath();
        ctx.fillStyle = it.c;
        ctx.strokeStyle = it.c;
        ctx.lineWidth = 0.8;
        ctx.fill();
        ctx.stroke();
      }
    }

    /* ── the tray: a slab that tips exactly like the phone ──── */
    drawTray(scene, pal) {
      const ctx = this.ctx;
      const H = -0.055;
      const S = TRAY_HALF;
      const base = C.parse(pal.tray);

      /* the body */
      const verts = [
        this.plane(-S, -S, H), this.plane(-S, S, H), this.plane(S, S, H), this.plane(S, -S, H),
        this.plane(-S, -S, 0), this.plane(-S, S, 0), this.plane(S, S, 0), this.plane(S, -S, 0),
      ];
      const faces = [
        [4, 5, 6, 7],
        [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
        [3, 2, 1, 0],
      ];
      this.quads(verts, faces, base, 0.42, pal, 0.35);

      /* the surface: a soft sheen and a grid, so the tip is readable */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = -2; i <= 2; i++) {
        const u = (i / 2) * S * 0.82;
        const a1 = this.P(this.plane(u, -S * 0.94, 0.004));
        const b1 = this.P(this.plane(u, S * 0.94, 0.004));
        const a2 = this.P(this.plane(-S * 0.94, u, 0.004));
        const b2 = this.P(this.plane(S * 0.94, u, 0.004));
        ctx.strokeStyle = C.rgba(pal.trayTop, i === 0 ? 0.16 : 0.07);
        ctx.lineWidth = 1;
        if (a1 && b1) { ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke(); }
        if (a2 && b2) { ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); }
      }
      ctx.restore();

      /* the two ends: player one at the near edge, player two at the far one */
      const ends = [
        { i: 0, color: pal.rimA, z: S, label: "1" },
        { i: 1, color: pal.rimB, z: -S, label: "2" },
      ];
      for (let k = 0; k < ends.length; k++) {
        const e = ends[k];
        const a = this.P(this.plane(-S, e.z, 0.01));
        const b = this.P(this.plane(S, e.z, 0.01));
        if (!a || !b) continue;
        const held = scene.heldBy ? scene.heldBy[e.i] : true;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = C.rgba(e.color, held ? 1 : 0.25);
        ctx.lineWidth = held ? 4.5 : 1.8;
        ctx.lineCap = "round";
        if (held) { ctx.shadowColor = e.color; ctx.shadowBlur = 22; }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }

      /* the rim, as a thin wall all the way round */
      const rimTop = 0.085;
      for (let s2 = -1; s2 <= 1; s2 += 2) {
        const rv = [
          this.plane(-S, s2 * S, 0), this.plane(S, s2 * S, 0),
          this.plane(S, s2 * S, rimTop), this.plane(-S, s2 * S, rimTop),
        ];
        const color = s2 > 0 ? pal.rimA : pal.rimB;
        this.quads(rv, [[0, 1, 2, 3]], C.mix(C.parse(color), base, 0.18), 0.4, pal, 0.8);
      }
      for (let s2 = -1; s2 <= 1; s2 += 2) {
        const rv = [
          this.plane(s2 * S, -S, 0), this.plane(s2 * S, S, 0),
          this.plane(s2 * S, S, rimTop), this.plane(s2 * S, -S, rimTop),
        ];
        this.quads(rv, [[0, 1, 2, 3]], C.mix(base, [255, 255, 255], 0.10), 0.4, pal, 0.4);
      }
    }

    /* ── the rings the marble must be standing in ──────────── */
    drawRings(scene, pal) {
      let gates = scene.gates;
      let nextGate = scene.nextGate || 0;
      if ((!gates || !gates.length) && scene.demo && scene.level) {
        /* a little choreography showing off on the title screen */
        const lv = scene.level;
        gates = [];
        for (let k = 0; k < lv.gates; k++) {
          gates.push({ x: lv.gateX(k), z: lv.gateZ(k), state: 0, q: 0, flash: 0 });
        }
        nextGate = Math.floor(this.time * 1.4) % lv.gates;
        for (let k = 0; k < gates.length; k++) if (k < nextGate) gates[k].state = 2;
      }
      if (!gates || !gates.length) return;

      const ctx = this.ctx;
      const SEG = 30;
      const list = [];
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        const rel = i - nextGate;
        if (rel < -1 || rel > 4) continue;
        let rad = RING_R;
        let alpha = 0.30 * clamp(1 - Math.max(0, rel) / 4.5, 0, 1);
        let color = pal.ring;
        let width = 2;
        let glow = 0;

        if (g.state === 1) {
          const fl = g.flash == null ? 0 : g.flash;
          if (fl <= 0) continue;
          rad = RING_R * (1 + (1 - fl) * 0.9);
          color = g.q === 3 ? "#fffaf0" : pal.ringNext;
          alpha = fl * 0.95;
          width = 2.6 * fl + 0.8;
          glow = 18;
        } else if (g.state === 2) {
          color = "#7d7288";
          alpha = 0.10;
          width = 1.3;
        } else if (i === nextGate) {
          const pulse = 0.5 + 0.5 * Math.sin((scene.phase || 0) * TAU);
          rad = RING_R * (1 + 0.06 * pulse);
          color = pal.ringNext;
          alpha = 0.95;
          width = 2.8 + pulse * 1.4;
          glow = 16 + pulse * 10;
        }

        const pts = [];
        let zsum = 0, ok = true;
        for (let k = 0; k <= SEG; k++) {
          const th = (k / SEG) * TAU;
          const pr = this.P(this.plane(g.x + Math.cos(th) * rad, g.z + Math.sin(th) * rad, 0.012));
          if (!pr) { ok = false; break; }
          pts.push(pr);
          zsum += pr.z;
        }
        if (!ok) continue;
        list.push({ z: zsum / pts.length, pts, alpha, color, width, glow, g });
      }
      list.sort((a, b) => b.z - a.z);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        if (it.glow) { ctx.shadowColor = it.color; ctx.shadowBlur = it.glow; }
        ctx.strokeStyle = C.rgba(it.color, it.alpha);
        ctx.lineWidth = clamp((it.width * this.focal) / (it.z * 320), 1, 7);
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let k = 0; k < it.pts.length; k++) {
          if (k === 0) ctx.moveTo(it.pts[k].x, it.pts[k].y);
          else ctx.lineTo(it.pts[k].x, it.pts[k].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ── the marble, and Babi who floats above it ──────────── */
    drawMarble(scene, pal) {
      const ctx = this.ctx;
      const mx = clamp(scene.mx || 0, -1.05, 1.05);
      const mz = clamp(scene.mz || 0, -1.05, 1.05);
      const p = this.plane(mx, mz, MARBLE_R);
      const pr = this.P(p);
      if (!pr) return;
      this.pearlScreen = { x: pr.x, y: pr.y };

      const rs = clamp((this.focal * MARBLE_R * 1.25) / pr.z, 5, 26);

      /* shadow on the tray */
      const sh = this.P(this.plane(mx + 0.03, mz + 0.03, 0.008));
      if (sh) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        const sg = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, rs * 1.7);
        sg.addColorStop(0, "rgba(0,0,0,0.8)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y, rs * 1.5, rs * 0.62, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      /* glow */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gl = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, rs * 3.2);
      gl.addColorStop(0, C.rgba(pal.pearl, 0.30));
      gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rs * 3.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* body */
      const bg = ctx.createRadialGradient(pr.x - rs * 0.34, pr.y - rs * 0.38, rs * 0.08, pr.x, pr.y, rs);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.45, pal.pearl);
      bg.addColorStop(1, pal.pearl2);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rs, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rs, 0, TAU);
      ctx.strokeStyle = C.rgba(pal.pearl2, 0.5);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pr.x - rs * 0.32, pr.y - rs * 0.38, rs * 0.19, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();

      /* Babi trails along above the marble */
      const b = this.babi;
      const t = this.time;
      const tp = this.P([p[0] + 0.30, p[1] + 0.20 + Math.sin(t * 2.2) * 0.02, p[2] - 0.06]);
      if (tp) {
        if (!b.ready) { b.x = tp.x; b.y = tp.y; b.ready = true; }
        b.vx += (tp.x - b.x) * 0.30;
        b.vy += (tp.y - b.y) * 0.30;
        b.vx *= 0.86; b.vy *= 0.86;
        b.x += b.vx; b.y += b.vy;

        const rb = clamp(rs * 0.85, 6, 17);
        const mood = scene.babiMood || 0;

        ctx.save();
        ctx.strokeStyle = "rgba(255,190,220,0.85)";
        ctx.lineWidth = Math.max(1.2, rb * 0.22);
        ctx.lineCap = "round";
        for (let s2 = -1; s2 <= 1; s2 += 2) {
          const wave = Math.sin(t * 2.6 + s2 * 1.1) * 0.5;
          ctx.beginPath();
          ctx.moveTo(b.x + s2 * rb * 0.86, b.y + rb * 0.24);
          ctx.lineTo(b.x + s2 * rb * (1.5 + wave * 0.25), b.y + rb * (0.05 - wave * 0.6));
          ctx.stroke();
        }
        ctx.restore();

        const bgb = ctx.createRadialGradient(b.x - rb * 0.36, b.y - rb * 0.44, rb * 0.08, b.x, b.y, rb);
        bgb.addColorStop(0, "#fffdfa");
        bgb.addColorStop(0.5, "#ffd8ea");
        bgb.addColorStop(1, "#ff8fc0");
        ctx.save();
        ctx.shadowColor = "rgba(255,150,195,0.8)";
        ctx.shadowBlur = 12 + mood * 12;
        ctx.fillStyle = bgb;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rb, 0, TAU);
        ctx.fill();
        ctx.restore();

        const happy = mood > 0.3;
        ctx.strokeStyle = "rgba(72,32,64,0.85)";
        ctx.lineWidth = Math.max(1.1, rb * 0.15);
        ctx.lineCap = "round";
        const ex = rb * 0.38, ey = b.y - rb * 0.1;
        for (let s3 = -1; s3 <= 1; s3 += 2) {
          ctx.beginPath();
          if (happy) {
            ctx.arc(b.x + s3 * ex, ey + rb * 0.12, rb * 0.24, Math.PI * 1.12, Math.PI * 1.88);
          } else {
            ctx.ellipse(b.x + s3 * ex, ey, rb * 0.15, rb * 0.21, 0, 0, TAU);
          }
          ctx.stroke();
        }
        ctx.beginPath();
        if (happy) ctx.arc(b.x, b.y + rb * 0.16, rb * 0.34, Math.PI * 0.16, Math.PI * 0.84);
        else {
          ctx.moveTo(b.x - rb * 0.24, b.y + rb * 0.42);
          ctx.quadraticCurveTo(b.x, b.y + rb * 0.54, b.x + rb * 0.24, b.y + rb * 0.42);
        }
        ctx.stroke();
      }
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

    /* ── a bubble level, like the one in the iPhone's Measure app ── */
    drawLevel(scene, pal) {
      const ctx = this.ctx;
      const R = Math.min(54, this.w * 0.11);
      const cx = this.w / 2;
      const cy = this.h - R - 62;
      const tx = clamp(this.tiltX, -1, 1);
      const ty = clamp(this.tiltY, -1, 1);
      const flat = Math.hypot(tx, ty) < 0.07;
      const col = flat ? "#8ff0e2" : "#ffd28a";

      ctx.save();
      /* the ring */
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = "rgba(8,4,18,0.42)";
      ctx.fill();
      ctx.strokeStyle = C.rgba(col, flat ? 0.95 : 0.45);
      ctx.lineWidth = flat ? 2.4 : 1.6;
      if (flat) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* crosshair + tolerance ring */
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.92, cy); ctx.lineTo(cx + R * 0.92, cy);
      ctx.moveTo(cx, cy - R * 0.92); ctx.lineTo(cx, cy + R * 0.92);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.34, 0, TAU);
      ctx.strokeStyle = C.rgba(col, 0.25);
      ctx.stroke();

      /* the bubble */
      const bx = cx + tx * R * 0.74;
      const by = cy + ty * R * 0.74;
      const bg = ctx.createRadialGradient(bx - R * 0.1, by - R * 0.12, 0, bx, by, R * 0.30);
      bg.addColorStop(0, "rgba(255,255,255,0.98)");
      bg.addColorStop(1, C.rgba(col, 0.75));
      ctx.beginPath();
      ctx.arc(bx, by, R * 0.26, 0, TAU);
      ctx.fillStyle = bg;
      ctx.shadowColor = C.rgba(col, 0.9);
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();

      void scene;
      void pal;
    }

    /* ── the two thumbs, one at each end of the screen ─────── */
    drawGrips(scene, pal) {
      const ctx = this.ctx;
      const held = scene.heldBy || [false, false];
      const pads = [
        { x: this.w / 2, y: this.h - 24, color: pal.rimA, label: isTouch() ? "PLAYER ONE · BOTTOM" : "PLAYER ONE · WASD", on: held[0] },
        { x: this.w / 2, y: 62, color: pal.rimB, label: isTouch() ? "PLAYER TWO · TOP" : "PLAYER TWO · ARROWS", on: held[1] },
      ];
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const w = 132, h = 26;
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 13);
        } else {
          ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
        }
        ctx.fillStyle = p.on ? C.rgba(p.color, 0.20) : "rgba(255,255,255,0.04)";
        ctx.fill();
        ctx.strokeStyle = p.on ? C.rgba(p.color, 0.9) : "rgba(255,255,255,0.12)";
        ctx.lineWidth = p.on ? 1.6 : 1;
        ctx.stroke();

        ctx.fillStyle = p.on ? C.rgba(p.color, 0.95) : "rgba(255,255,255,0.35)";
        ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.on ? p.label + " ✓" : p.label, p.x, p.y);
        ctx.restore();
      }


    }

    drawVignette() {
      const ctx = this.ctx;
      const g = ctx.createRadialGradient(
        this.w / 2, this.h * 0.5, Math.min(this.w, this.h) * 0.24,
        this.w / 2, this.h * 0.5, Math.max(this.w, this.h) * 0.78
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(2,0,8,0.76)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  const MENU_PAL = {
    bg0: "#080611", bg1: "#150c22", fog: "#140c20",
    tray: "#6f6288", trayTop: "#fff0d8", trayGlow: "#ffb877",
    rimA: "#ff9ecb", rimB: "#8ff0e2",
    ring: "#ff9ecb", ringNext: "#ffd28a",
    pearl: "#fff4dc", pearl2: "#ffb877",
    floor: "#2a1f3d", column: "#241a35", halo: "#ff9ecb",
  };

  /* ── little top-down previews for the level cards ───────── */
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

    /* the tray */
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - r, cy - r, r * 2, r * 2, size * 0.09);
    else ctx.rect(cx - r, cy - r, r * 2, r * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.30)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    /* the path the marble takes */
    ctx.beginPath();
    for (let k = 0; k <= level.gates; k++) {
      const x = cx + level.gateX(k) * r * 0.92;
      const y = cy + level.gateZ(k) * r * 0.92;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = C.rgba(level.pal.ring, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();

    /* a few rings */
    for (let k = 0; k < level.gates; k += Math.max(1, Math.round(level.gates / 7))) {
      const x = cx + level.gateX(k) * r * 0.92;
      const y = cy + level.gateZ(k) * r * 0.92;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.055, 0, TAU);
      ctx.strokeStyle = C.rgba(k === 0 ? level.pal.ringNext : level.pal.ring, 0.75);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    /* the marble */
    const gr = ctx.createRadialGradient(cx - 1, cy - 2, 0, cx, cy, size * 0.09);
    gr.addColorStop(0, "#fffdf6");
    gr.addColorStop(1, level.pal.pearl2);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.075, 0, TAU);
    ctx.fill();
  }

  DWB.Stage = Stage;
  DWB.drawLevelPreview = drawLevelPreview;
  DWB.isTouch = isTouch;
})();
