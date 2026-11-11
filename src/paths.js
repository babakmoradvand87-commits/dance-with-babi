/* ──────────────────────────────────────────────────────────────
   Dance with Babi — paths.js
   The choreography: closed curves painted on a unit sphere,
   re-sampled by arc length so beats map to even steps.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = (window.DWB = window.DWB || {});
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const V = {
    norm(a) {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
    cross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    },
    dot(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    },
    len(a) {
      return Math.hypot(a[0], a[1], a[2]);
    },
    /** Rodrigues rotation of v around unit axis by ang */
    rot(v, axis, ang) {
      const c = Math.cos(ang), s = Math.sin(ang);
      const kv = V.cross(axis, v);
      const kd = V.dot(axis, v) * (1 - c);
      return [
        v[0] * c + kv[0] * s + axis[0] * kd,
        v[1] * c + kv[1] * s + axis[1] * kd,
        v[2] * c + kv[2] * s + axis[2] * kd,
      ];
    },
  };

  /* row-major 3x3 matrices */
  const M = {
    identity: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    mul(A, B) {
      const R = new Array(9);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          R[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
        }
      }
      return R;
    },
    apply(A, v) {
      return [
        A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
        A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
        A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
      ];
    },
    axis(ax, ang) {
      const x = ax[0], y = ax[1], z = ax[2];
      const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
      return [
        t * x * x + c, t * x * y - s * z, t * x * z + s * y,
        t * x * y + s * z, t * y * y + c, t * y * z - s * x,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c,
      ];
    },
    z(ang) {
      const c = Math.cos(ang), s = Math.sin(ang);
      return [c, -s, 0, s, c, 0, 0, 0, 1];
    },
    /** rotation that carries unit vector `from` onto unit vector `to` */
    align(from, to) {
      const d = clamp(V.dot(from, to), -1, 1);
      if (d > 0.9999999) return M.identity;
      if (d < -0.9999999) return M.axis([1, 0, 0], Math.PI);
      const ax = V.norm(V.cross(from, to));
      return M.axis(ax, Math.acos(d));
    },
  };

  DWB.V = V;
  DWB.M = M;
  DWB.clamp = clamp;

  /* ── arc-length re-sampled path on the unit sphere ─────────── */
  function buildPath(raw, opts) {
    const M_ = (opts && opts.samples) || 3600;
    const pts = new Array(M_);
    for (let i = 0; i < M_; i++) pts[i] = V.norm(raw(i / M_));

    /* nudge the whole curve so its centre of mass faces the camera,
       unless it is (nearly) a great circle — then leave it alone. */
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < M_; i++) { mx += pts[i][0]; my += pts[i][1]; mz += pts[i][2]; }
    mx /= M_; my /= M_; mz /= M_;
    const ml = Math.hypot(mx, my, mz);
    if (ml > 0.2) {
      const rot = M.align([mx / ml, my / ml, mz / ml], [0, 0, 1]);
      for (let i = 0; i < M_; i++) pts[i] = V.norm(M.apply(rot, pts[i]));
    }

    /* cumulative arc length, closing the loop */
    const cum = new Float64Array(M_ + 1);
    for (let i = 0; i < M_; i++) {
      const a = pts[i], b = pts[(i + 1) % M_];
      cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    const total = cum[M_];

    function pointAt(s) {
      const wrapped = s - Math.floor(s);
      const target = wrapped * total;
      let lo = 0, hi = M_;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= target) lo = mid; else hi = mid;
      }
      const a = pts[lo], b = pts[(lo + 1) % M_];
      const seg = cum[lo + 1] - cum[lo] || 1e-9;
      const f = clamp((target - cum[lo]) / seg, 0, 1);
      return V.norm([
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
      ]);
    }

    function tangentAt(s) {
      const e = 0.0022;
      const a = pointAt(s - e), b = pointAt(s + e);
      return V.norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    }

    return { pointAt, tangentAt, total, samples: pts };
  }

  /* ── the raw curves ────────────────────────────────────────── */

  /** a ring around the sphere whose latitude breathes `amp` times `freq` */
  function ribbon(amp, freq, twist) {
    twist = twist || 0;
    return function (u) {
      const phi = TAU * u;
      const psi = Math.PI / 2 + amp * Math.cos(freq * phi + twist);
      return [Math.sin(psi) * Math.cos(phi), Math.sin(psi) * Math.sin(phi), Math.cos(psi)];
    };
  }

  /** inverse stereographic projection of a plane curve onto the sphere */
  function stereo(x, y) {
    const r2 = x * x + y * y;
    const d = 1 + r2;
    return [(2 * x) / d, (2 * y) / d, (r2 - 1) / d];
  }

  /** Gerono's lemniscate — a figure eight, one graceful crossing */
  function figureEight(scale) {
    scale = scale || 0.9;
    return function (u) {
      const a = TAU * u;
      return stereo(Math.cos(a) * scale, Math.sin(a) * Math.cos(a) * scale * 1.15);
    };
  }

  /** three petals, closing after half a turn */
  function rose(petals, scale) {
    return function (u) {
      const phi = Math.PI * u;
      const r = scale * Math.cos(petals * phi);
      return stereo(r * Math.cos(phi), r * Math.sin(phi));
    };
  }

  /* ── the repertory ─────────────────────────────────────────── */
  const LEVELS = [
    {
      id: "first-bow",
      name: "First Bow",
      subtitle: "Two bars to find each other",
      blurb: "A slow waltz in A minor. One ring per beat, nothing hidden.",
      bpm: 84,
      gates: 24,
      intro: 6,
      accent: "#ff9ecb",
      accent2: "#ffd28a",
      difficulty: 1,
      raw: ribbon(0.34, 2, 0),
    },
    {
      id: "moonlit-spin",
      name: "Moonlit Spin",
      subtitle: "The figure eight",
      blurb: "The path crosses itself — keep turning, trust the count.",
      bpm: 96,
      gates: 30,
      intro: 6,
      accent: "#9fd0ff",
      accent2: "#c9b6ff",
      difficulty: 2,
      raw: figureEight(0.86),
    },
    {
      id: "babis-finale",
      name: "Babi's Finale",
      subtitle: "Three petals, one breath",
      blurb: "The fastest waltz, and Babi's favourite. Steady hands.",
      bpm: 108,
      gates: 36,
      intro: 6,
      accent: "#e0bdff",
      accent2: "#ffd28a",
      difficulty: 3,
      raw: ribbon(0.55, 3, 0.45),
    },
  ];

  LEVELS.forEach(function (lv) {
    lv.path = buildPath(lv.raw);
    lv.spb = 60 / lv.bpm;                       /* seconds per beat */
    lv.interval = 1 / (lv.gates + 1);           /* path fraction per gate */
    /* rotation (radians) that advances the pearl by one unit of path */
    lv.speed = lv.interval / (lv.spb * 1.35);
    lv.brush = "rgba(255,255,255,0.9)";
  });

  DWB.LEVELS = LEVELS;
  DWB.buildPath = buildPath;
  DWB.TAU = TAU;
})();
