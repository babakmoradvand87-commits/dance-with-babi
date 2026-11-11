/* ──────────────────────────────────────────────────────────────
   Dance with Babi — paths.js
   The three dances: tempo, swinging distance, light, and the
   shape of the plank. Everything else is computed from these.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = (window.DWB = window.DWB || {});
  const TAU = Math.PI * 2;

  /* the rail is a function u ∈ [-1, 1] → world position */
  const RAIL_HALF = 0.86;

  const LEVELS = [
    {
      id: "first-bow",
      name: "First Bow",
      subtitle: "Raise, lower, find the sway",
      blurb: "A slow waltz. One ring at each end, one beat apart.",
      bpm: 84,
      gates: 24,
      intro: 6,
      amp: 0.62,       /* how far along the plank each ring sits */
      speed: 3.3,      /* units/s the pearl rolls at a full tilt */
      lag: 0.16,       /* how long the pearl takes to answer your hands */
      maxTilt: 0.26,   /* how far the plank visually rotates (rad) */
      difficulty: 1,
      curve: 0.16,
      pal: {
        bg0: "#080611", bg1: "#150c22", fog: "#140c20",
        rail: "#7b6a95", railTop: "#ffe3c0", railGlow: "#ffb877",
        ring: "#ff9ecb", ringNext: "#ffd28a",
        pearl: "#fff4dc", pearl2: "#ffb877",
        floor: "#2a1f3d", column: "#241a35", halo: "#ff9ecb",
      },
    },
    {
      id: "moonlit-spin",
      name: "Moonlit Spin",
      subtitle: "Wider, slower, watch the far end",
      blurb: "The plank is longer now. Lead the swing a beat early.",
      bpm: 96,
      gates: 30,
      intro: 6,
      amp: 0.72,
      speed: 4.4,
      lag: 0.15,
      maxTilt: 0.30,
      difficulty: 2,
      curve: 0.26,
      pal: {
        bg0: "#05070f", bg1: "#0b1226", fog: "#0a1120",
        rail: "#5f7595", railTop: "#d9f0ff", railGlow: "#8fd0ff",
        ring: "#9fd0ff", ringNext: "#c9b6ff",
        pearl: "#f4fbff", pearl2: "#8fd0ff",
        floor: "#16233a", column: "#132033", halo: "#6fa8ff",
      },
    },
    {
      id: "babis-finale",
      name: "Babi's Finale",
      subtitle: "Both arms, all the way",
      blurb: "Fastest waltz of the evening. Full swings, no hesitation.",
      bpm: 108,
      gates: 36,
      intro: 6,
      amp: 0.82,
      speed: 5.6,
      lag: 0.14,
      maxTilt: 0.34,
      difficulty: 3,
      curve: 0.34,
      pal: {
        bg0: "#0a0612", bg1: "#1a0d24", fog: "#170b20",
        rail: "#8a6d9c", railTop: "#fff0d0", railGlow: "#ffd28a",
        ring: "#e0bdff", ringNext: "#ffd28a",
        pearl: "#fffaef", pearl2: "#ffc48a",
        floor: "#2a1a33", column: "#241530", halo: "#c9a0ff",
      },
    },
  ];

  LEVELS.forEach(function (lv) {
    lv.spb = 60 / lv.bpm;                 /* seconds per beat */
    /* the plank bows gently towards the camera, so it reads as 3D */
    lv.rail = function (u) {
      return [u * RAIL_HALF, 0, lv.curve * Math.cos(u * Math.PI * 0.75)];
    };
    lv.bend = function (x) {
      const u = x / RAIL_HALF;
      return lv.curve * 0.14 * Math.cos(u * Math.PI * 0.75);
    };
    /* rings sit alternately at either end of the swing */
    lv.gateU = function (i) {
      return i % 2 === 0 ? lv.amp : -lv.amp;
    };
    lv.gateAt = function (i) {
      return (i + 1) * lv.spb;
    };
  });

  DWB.LEVELS = LEVELS;
  DWB.RAIL_HALF = RAIL_HALF;
  DWB.TAU = TAU;
})();
