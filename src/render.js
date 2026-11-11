/* ──────────────────────────────────────────────────────────────
   Dance with Babi — render.js
   A hand-rolled 3D scene on a 2D canvas: a plank floating in a
   hall, a pearl that rolls on it, rings to pass through, and the
   camera that swings with both of you.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const V = DWB.V;
  const clamp = DWB.clamp;
  const TAU = Math.PI * 2;
  const RAIL_HALF = DWB.RAIL_HALF;
  const FOV = (52 * Math.PI) / 180;
  const LIGHT = V.norm([0.42, 0.82, 0.44]);
  const LIFT = 0.30;   /* how high a full lift raises one end */

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
      this.meshes = {};
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
      this.cy = h * 0.53;
      this.focal = (h / 2) / Math.tan(FOV / 2);
      /* frame the plank so it fills most of the width, phone or desktop */
      const need = (2 * RAIL_HALF * this.focal) / (0.62 * w);
      this.dist = Math.max(1.62, need);

      this.bars = [
        { x: Math.max(46, w * 0.13), y: h - Math.max(96, h * 0.13), len: Math.min(150, h * 0.26) },
        { x: Math.min(w - 46, w * 0.87), y: h - Math.max(96, h * 0.13), len: Math.min(150, h * 0.26) },
      ];
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

    /* ── the frame ─────────────────────────────────────────── */
    draw(scene, dt) {
      const ctx = this.ctx;
      this.time += dt;
      this.updateParticles(dt);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      if (scene.shake > 0.01) {
        const s2 = scene.shake * 9;
        ctx.translate((Math.random() - 0.5) * s2, (Math.random() - 0.5) * s2);
      }

      const pal = scene.level ? scene.level.pal : MENU_PAL;
      const tilt = clamp(scene.tilt || 0, -1, 1);

      /* camera: slides along the plank and rocks with it */
      const px = clamp(scene.pearlU || 0, -1.2, 1.2);
      const orbit = Math.sin(this.time * 0.22) * 0.22;
      const eye = [
        px * 0.34 + orbit * 0.6,
        0.52 + tilt * 0.04,
        this.dist + Math.abs(px) * 0.18,
      ];
      const target = [px * 0.26, 0.03 + tilt * 0.05, 0];
      const cam = DWB.camera(eye, target, [0, 1, 0], -tilt * 0.045);
      this.cam = cam;

      this.drawBackdrop(scene, pal);
      this.drawFloor(pal);
      this.drawFloorGlow(pal, scene);
      this.drawColumns(pal);
      this.drawPlank(scene, pal);
      this.drawGates(scene, pal);
      this.drawPearl(scene, pal);
      this.drawParticles();
      if (scene.showBars) this.drawBars(scene, pal);
      this.drawVignette();
    }

    P(p) {
      return DWB.project(this.cam, this.focal, this.cx, this.cy, p);
    }

    /* ── environment ───────────────────────────────────────── */
    drawBackdrop(scene, pal) {
      const ctx = this.ctx, w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, pal.bg0);
      g.addColorStop(0.55, pal.bg1);
      g.addColorStop(1, pal.bg0);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* the glow of the hall behind the plank */
      const hy = this.cy - h * 0.04;
      const rg = ctx.createRadialGradient(this.cx, hy, 0, this.cx, hy, Math.max(w, h) * 0.55);
      rg.addColorStop(0, C.rgba(pal.halo, 0.20));
      rg.addColorStop(0.4, C.rgba(pal.halo, 0.06));
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      /* slow motes drifting in the light */
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

    /* the plank's height at u ∈ [-1, 1]: each end follows its own hand */
    plankY(u, hands) {
      const hA = clamp(hands ? hands[0] || 0 : 0, -1, 1);
      const hB = clamp(hands ? hands[1] || 0 : 0, -1, 1);
      const mean = (hA + hB) * 0.5;
      const tilt = (hB - hA) * 0.5;
      const bend = this.bendAt(u);
      return LIFT * (mean + tilt * u) + bend;
    }

    bendAt(u) {
      const lv = this.curLevel;
      return lv && lv.bend ? lv.bend(u * RAIL_HALF) : 0;
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
        const k2 = 0.30 + 0.72 * diff;
        const z = zsum / f.length;
        const fz = clamp((z - this.dist) / 6.5, 0, 1) * fog;
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
      ctx.restore();
    }

    drawFloorGlow(pal, scene) {
      const ctx = this.ctx;
      const hands = scene.hands || [0, 0];
      const c = this.P([0, -1.04, 0]);
      const e = this.P([RAIL_HALF * 1.5, -1.04, 0]);
      if (!c || !e) return;
      const rx = Math.max(40, Math.abs(e.x - c.x));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rx);
      g.addColorStop(0, C.rgba(pal.halo, 0.10));
      g.addColorStop(0.5, C.rgba(pal.halo, 0.03));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, rx * 0.14, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      void hands;
    }

    drawColumns(pal) {
      if (!this.meshes.column) this.meshes.column = DWB.mesh.box(0.13, 1, 0.13);
      const mesh = this.meshes.column;
      const base = C.mix(C.parse(pal.column), C.parse(pal.rail), 0.42);
      for (let i = 0; i < 10; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        if (row > 4) continue;
        const x = side * (2.10 + row * 0.70);
        const z = -1.9 - row * 2.3;
        const hgt = 3.2 - row * 0.22;
        const verts = mesh.verts.map((v) => [
          v[0] * hgt + x,
          v[1] * hgt + (-1.05 + hgt / 2),
          v[2] * hgt + z,
        ]);
        this.quads(verts, mesh.faces, base, 0.9, pal, 0.3);
      }
    }

    /* ── the plank, and the two hands that hold it ─────────── */
    drawPlank(scene, pal) {
      const ctx = this.ctx;
      const hands = scene.hands || [0, 0];
      this.curLevel = scene.level;

      const SEG = 18, W = 0.22, H = 0.07;
      const verts = [];
      const quads = [];
      for (let i = 0; i <= SEG; i++) {
        const u = -1 + (2 * i) / SEG;
        const x = u * RAIL_HALF;
        const y = this.plankY(u, hands);
        verts.push([x, y - H / 2, -W / 2], [x, y + H / 2, -W / 2], [x, y + H / 2, W / 2], [x, y - H / 2, W / 2]);
      }
      for (let i = 0; i < SEG; i++) {
        const a = i * 4, b = (i + 1) * 4;
        quads.push([a + 2, a + 3, b + 3, b + 2]);
        quads.push([a + 0, a + 1, b + 1, b + 0]);
        quads.push([a + 1, a + 2, b + 2, b + 1]);
        quads.push([a + 3, a + 0, b + 0, b + 3]);
      }
      quads.push([0, 1, 2, 3]);
      quads.push([SEG * 4 + 3, SEG * 4 + 2, SEG * 4 + 1, SEG * 4 + 0]);
      this.quads(verts, quads, C.parse(pal.rail), 0.5, pal, 0.5);

      /* a thread of light along the top edge */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 26; i++) {
        const u = -1 + (2 * i) / 26;
        const pr = this.P([u * RAIL_HALF, this.plankY(u, hands) + H / 2 + 0.004, 0]);
        if (!pr) { started = false; continue; }
        if (!started) { ctx.moveTo(pr.x, pr.y); started = true; }
        else ctx.lineTo(pr.x, pr.y);
      }
      ctx.strokeStyle = C.rgba(pal.railGlow, 0.34);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      /* the two grips */
      for (let i = 0; i < 2; i++) {
        const u = i === 0 ? -1 : 1;
        const pr = this.P([u * RAIL_HALF, this.plankY(u, hands) + 0.02, 0]);
        if (!pr) continue;
        const tint = i === 0 ? "#ff9ecb" : "#8ff0e2";
        const hand = clamp(hands[i] || 0, -1, 1);
        const r = clamp((this.focal * 0.03) / pr.z, 3.5, 15);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, r * 4.4);
        glow.addColorStop(0, C.rgba(tint, 0.36 + Math.abs(hand) * 0.34));
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r * 4.4, 0, TAU);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(pr.x, pr.y, r, 0, TAU);
        ctx.fillStyle = C.rgba(tint, 0.92);
        ctx.fill();

        if (scene.showHands) {
          const dir = hand > 0.06 ? -1 : hand < -0.06 ? 1 : 0;
          ctx.save();
          ctx.globalAlpha = 0.45 + Math.abs(hand) * 0.55;
          ctx.fillStyle = C.rgba(tint, 0.9);
          if (dir !== 0) {
            const y0 = pr.y + dir * (r + 6), y1 = pr.y + dir * (r + 21);
            ctx.beginPath();
            ctx.moveTo(pr.x, y1);
            ctx.lineTo(pr.x - 6, y1 - dir * 7);
            ctx.lineTo(pr.x + 6, y1 - dir * 7);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = C.rgba(tint, 0.5);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pr.x, y0);
            ctx.lineTo(pr.x, y1 - dir * 4);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    /* ── rings ─────────────────────────────────────────────── */
    drawGates(scene, pal) {
      if (!scene.gates || !scene.gates.length) return;
      const ctx = this.ctx;
      const SEG = 26;
      const hands = scene.hands || [0, 0];
      const list = [];
      for (let i = 0; i < scene.gates.length; i++) {
        const g = scene.gates[i];
        const rel = i - scene.nextGate;
        if (rel < -1 || rel > 4) continue;
        let rad = 0.16;
        let alpha = 0.32 * clamp(1 - Math.max(0, rel) / 4.5, 0, 1);
        let color = pal.ring;
        let width = 2;
        let glow = 0;

        if (g.state === 1) {
          const fl = g.flash == null ? 0 : g.flash;
          if (fl <= 0) continue;
          rad = 0.16 + (1 - fl) * 0.20;
          color = g.q === 3 ? "#fffaf0" : pal.ringNext;
          alpha = fl * 0.9;
          width = 2.4 * fl + 0.8;
          glow = 16;
        } else if (g.state === 2) {
          color = "#7d7288";
          alpha = 0.09;
          width = 1.3;
        } else if (i === scene.nextGate) {
          const pulse = 0.5 + 0.5 * Math.sin((scene.phase || 0) * TAU);
          rad = 0.163 + 0.013 * pulse;
          color = pal.ringNext;
          alpha = 0.92;
          width = 2.6 + pulse * 1.2;
          glow = 15 + pulse * 9;
        }

        const cy = this.plankY(g.u, hands) + 0.10;
        const pts = [];
        let zsum = 0, ok = true;
        for (let k = 0; k <= SEG; k++) {
          const th = (k / SEG) * TAU;
          const pr = this.P([g.u * RAIL_HALF, cy + Math.cos(th) * rad, Math.sin(th) * rad]);
          if (!pr) { ok = false; break; }
          pts.push(pr);
          zsum += pr.z;
        }
        if (!ok) continue;
        list.push({ z: zsum / pts.length, pts: pts, alpha: alpha, color: color, width: width, glow: glow });
      }
      list.sort((a, b) => b.z - a.z);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        if (it.glow) { ctx.shadowColor = it.color; ctx.shadowBlur = it.glow; }
        ctx.strokeStyle = C.rgba(it.color, it.alpha);
        ctx.lineWidth = clamp((it.width * this.focal) / (it.z * 300), 1, 7);
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let k = 0; k < it.pts.length; k++) {
          if (k === 0) ctx.moveTo(it.pts[k].x, it.pts[k].y);
          else ctx.lineTo(it.pts[k].x, it.pts[k].y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    /* ── the pearl, and Babi beside it ─────────────────────── */
    drawPearl(scene, pal, ca, sa) {
      const ctx = this.ctx;
      const u = clamp(scene.pearlU || 0, -1.15, 1.15);
      this.curLevel = scene.level;
      const p = [u * RAIL_HALF, this.plankY(u, scene.hands || [0, 0]) + 0.10, 0];
      const pr = this.P(p);
      if (!pr) return;
      this.pearlScreen = { x: pr.x, y: pr.y };

      const rs = clamp((this.focal * 0.052) / pr.z, 5, 22);

      /* shadow on the plank */
      const shadowP = this.P([p[0], p[1] - 0.10, p[2]]);
      if (shadowP) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        const sg = ctx.createRadialGradient(shadowP.x, shadowP.y, 0, shadowP.x, shadowP.y, rs * 1.5);
        sg.addColorStop(0, "rgba(0,0,0,0.85)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(shadowP.x, shadowP.y, rs * 1.35, rs * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      /* glow */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gl = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, rs * 3.6);
      gl.addColorStop(0, C.rgba(pal.pearl, 0.26));
      gl.addColorStop(0.3, C.rgba(pal.pearl2, 0.20));
      gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, rs * 3.6, 0, TAU);
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
      ctx.strokeStyle = C.rgba(pal.pearl2, 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pr.x - rs * 0.34, pr.y - rs * 0.4, rs * 0.20, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();

      /* Babi trails along behind the pearl, in the air */
      const b = this.babi;
      const t = this.time;
      const side = Math.sin(t * 0.7) > 0 ? 1 : -1;
      const tp = this.P([p[0] + side * 0.17, p[1] + 0.09 + Math.sin(t * 2.2) * 0.02, p[2] + 0.04]);
      if (tp) {
        if (!b.ready) { b.x = tp.x; b.y = tp.y; b.ready = true; }
        b.vx += (tp.x - b.x) * 0.30;
        b.vy += (tp.y - b.y) * 0.30;
        b.vx *= 0.86; b.vy *= 0.86;
        b.x += b.vx; b.y += b.vy;

        const rb = clamp(rs * 0.60, 6, 16);
        const mood = scene.babiMood || 0;

        /* little arms that wave with the music */
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

        /* face */
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

    /* ── each player's hand, as a vertical bar ─────────────── */
    drawBars(scene, pal) {
      const ctx = this.ctx;
      const hands = scene.hands || [0, 0];
      const duet = scene.mode !== "solo";
      for (let i = 0; i < (duet ? 2 : 1); i++) {
        const b = this.bars[duet ? i : 0];
        const tint = i === 0 ? "#ff9ecb" : "#8ff0e2";
        const raised = clamp(hands[i] || 0, -1, 1);
        const top = b.y - b.len;
        const midY = b.y - b.len / 2;
        const thY = midY - raised * (b.len / 2);

        ctx.save();
        /* track */
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, top);
        ctx.stroke();

        /* centre tick */
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.beginPath();
        ctx.moveTo(b.x - 8, midY);
        ctx.lineTo(b.x + 8, midY);
        ctx.stroke();

        /* filled part */
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = C.rgba(tint, 0.75);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, midY);
        ctx.lineTo(b.x, thY);
        ctx.stroke();

        /* thumb */
        const gr = ctx.createRadialGradient(b.x, thY, 0, b.x, thY, 22);
        gr.addColorStop(0, C.rgba(tint, 0.55));
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(b.x, thY, 22, 0, TAU);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(b.x, thY, 5, 0, TAU);
        ctx.fillStyle = "#fffdf7";
        ctx.fill();

        ctx.save();
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(duet ? (i === 0 ? "PLAYER ONE" : "PLAYER TWO") : "YOUR HANDS", b.x, b.y + 18);
        if (!isTouch()) {
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.fillText(i === 0 ? "W  ·  S" : "↑  ·  ↓", b.x, b.y + 31);
        }
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
    rail: "#7b6a95", railTop: "#ffe3c0", railGlow: "#ffb877",
    ring: "#ff9ecb", ringNext: "#ffd28a",
    pearl: "#fff4dc", pearl2: "#ffb877",
    floor: "#2a1f3d", column: "#241a35", halo: "#ff9ecb",
  };

  /* ── little side-view previews for the level cards ───────── */
  function drawLevelPreview(canvas, level) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 58;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size * 0.62;
    const half = size * 0.40;
    const ang = 0.16;
    const ca = Math.cos(ang), sa = Math.sin(ang);

    /* the plank */
    ctx.beginPath();
    ctx.moveTo(cx - half * ca, cy - half * sa);
    ctx.lineTo(cx + half * ca, cy + half * sa);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();

    /* rings at both ends */
    const amp = level.amp;
    [-amp, amp].forEach((u, i) => {
      const x = u * half;
      const y = u * half * (sa / ca);
      ctx.beginPath();
      ctx.arc(cx + x, cy + y, size * 0.13, 0, TAU);
      ctx.strokeStyle = i === 0 ? C.rgba(level.pal.ring, 0.85) : C.rgba(level.pal.ringNext, 0.85);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    });

    /* the pearl */
    const gr = ctx.createRadialGradient(cx - 1, cy - 2, 0, cx, cy, size * 0.09);
    gr.addColorStop(0, "#fffdf6");
    gr.addColorStop(1, level.pal.pearl2);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.085, 0, TAU);
    ctx.fill();
  }

  DWB.Stage = Stage;
  DWB.drawLevelPreview = drawLevelPreview;
  DWB.isTouch = isTouch;
})();
