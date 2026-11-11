/* ──────────────────────────────────────────────────────────────
   Dance with Babi — paths.js
   The phone is a tray. Inside the tray a marble rolls, and three
   dances tell it where to go: each one is a closed curve sampled
   at equal distances, one ring per beat, so the marble always
   has the same distance to travel between two rings.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = (window.DWB = window.DWB || {});
  const TAU = Math.PI * 2;

  const TRAY_HALF = 1.02;   /* world half-size of the tray surface */

  /* walk a closed curve and drop N points on it at equal distance */
  function sampleCurve(pt, turns, n) {
    const M = 3000;
    const xs = new Float64Array(M + 1);
    const zs = new Float64Array(M + 1);
    const cum = new Float64Array(M + 1);
    for (let i = 0; i <= M; i++) {
      const p = pt((i / M) * TAU * turns);
      xs[i] = p[0];
      zs[i] = p[1];
      if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    }
    const length = cum[M];
    const points = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const target = (k / n) * length;
      while (j < M - 1 && cum[j + 1] < target) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const f = (target - cum[j]) / seg;
      points.push([xs[j] + (xs[j + 1] - xs[j]) * f, zs[j] + (zs[j + 1] - zs[j]) * f]);
    }
    return { points: points, length: length, step: length / n };
  }

  const LEVELS = [
    {
      id: "first-bow",
      name: "First Bow",
      subtitle: "Up, down, find the sway",
      blurb: "A slow waltz. The marble swings away from you and back.",
      bpm: 84,
      gates: 24,
      intro: 6,
      turns: 5,      /* how many up-and-down passes the tune makes */
      ampV: 0.62,    /* how far away and back it travels */
      ampU: 0.38,    /* how far it sways sideways */
      lag: 0.16,
      phase: 0.6,
      tiltRange: 26, /* degrees of phone lean that count as full tilt */
      difficulty: 1,
      pal: {
        bg0: "#080611", bg1: "#150c22", fog: "#140c20",
        tray: "#6f6288", trayTop: "#fff0d8", trayGlow: "#ffb877",
        rimA: "#ff9ecb", rimB: "#8ff0e2",
        ring: "#ff9ecb", ringNext: "#ffd28a",
        pearl: "#fff4dc", pearl2: "#ffb877",
        floor: "#2a1f3d", column: "#241a35", halo: "#ff9ecb",
      },
    },
    {
      id: "moonlit-spin",
      name: "Moonlit Spin",
      subtitle: "Further, faster, hold the line",
      blurb: "The curve widens at the corners. Lead the marble a beat early.",
      bpm: 96,
      gates: 30,
      intro: 6,
      turns: 7,
      ampV: 0.66,
      ampU: 0.42,
      lag: 0.15,
      phase: 0.9,
      tiltRange: 26,
      difficulty: 2,
      pal: {
        bg0: "#05070f", bg1: "#0b1226", fog: "#0a1120",
        tray: "#54688a", trayTop: "#d9f0ff", trayGlow: "#8fd0ff",
        rimA: "#9fd0ff", rimB: "#c9b6ff",
        ring: "#9fd0ff", ringNext: "#c9b6ff",
        pearl: "#f4fbff", pearl2: "#8fd0ff",
        floor: "#16233a", column: "#132033", halo: "#6fa8ff",
      },
    },
    {
      id: "babis-finale",
      name: "Babi's Finale",
      subtitle: "All the way, every beat",
      blurb: "Fastest waltz of the evening. The tray has no time to settle.",
      bpm: 108,
      gates: 36,
      intro: 6,
      turns: 9,
      ampV: 0.70,
      ampU: 0.45,
      lag: 0.14,
      phase: 1.2,
      tiltRange: 25,
      difficulty: 3,
      pal: {
        bg0: "#0a0612", bg1: "#1a0d24", fog: "#170b20",
        tray: "#7f6490", trayTop: "#fff0d0", trayGlow: "#ffd28a",
        rimA: "#e0bdff", rimB: "#ffd28a",
        ring: "#e0bdff", ringNext: "#ffd28a",
        pearl: "#fffaef", pearl2: "#ffc48a",
        floor: "#2a1a33", column: "#241530", halo: "#c9a0ff",
      },
    },
  ];

  LEVELS.forEach(function (lv) {
    lv.spb = 60 / lv.bpm;
    /* a tall, slightly wobbly loop: the marble never crosses the middle,
       so it cannot sit there and collect rings by doing nothing */
    const curve = function (th) {
      return [
        lv.ampU * Math.cos(th) + 0.05 * Math.sin(3 * th + lv.phase),
        -lv.ampV * Math.sin(th),
      ];
    };
    const path = sampleCurve(curve, lv.turns, lv.gates);
    lv.points = path.points;
    lv.length = path.length;
    lv.step = path.step;

    /* a steady pair needs most of the tilt to keep up — which is why one
       pair of hands alone can never carry the dance */
    lv.speed = Math.max(1.2, path.step / lv.spb / 0.74);

    /* how close to the ring centre counts as a hit, in tray units */
    lv.perfect = path.step * 0.20;
    lv.good = path.step * 0.42;
    lv.edge = path.step * 0.66;

    lv.gateX = function (i) {
      return lv.points[((i % lv.gates) + lv.gates) % lv.gates][0];
    };
    lv.gateZ = function (i) {
      return lv.points[((i % lv.gates) + lv.gates) % lv.gates][1];
    };
    lv.gateAt = function (i) {
      return (i + 1) * lv.spb;
    };
  });

  DWB.LEVELS = LEVELS;
  DWB.TRAY_HALF = TRAY_HALF;
  DWB.TAU = TAU;
})();
