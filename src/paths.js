/* ──────────────────────────────────────────────────────────────
   Dance with Babi — paths.js
   The dance floor has no edge. Each track lays an endless ribbon
   across an open space: a heading that wanders, integrated step by
   step, then sampled at equal distances so there is exactly one ring
   per beat and the marble always has the same distance to travel.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = (window.DWB = window.DWB || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ── an endless, wandering ribbon ───────────────────────────
     heading(s) is a sum of sines of the arc length, so the curve
     never repeats and never closes; positions come from simply
     integrating it. */
  function makeRoute(seed, step, count) {
    const sub = 6;                 /* samples per ring */
    const ds = step / sub;
    const want = Math.min(6000, Math.ceil((count * step * 1.35) / ds) + 8);
    const a = 1.05, b = 0.66, c = 0.22, zz = 0.42;
    const p1 = (seed * 1.91) % 6.28, p2 = (seed * 3.37) % 6.28, p3 = (seed * 5.13) % 6.28;
    const xs = new Float64Array(want + 1);
    const zs = new Float64Array(want + 1);
    let x = 0, z = 0;
    for (let i = 0; i <= want; i++) {
      xs[i] = x;
      zs[i] = z;
      const s = i * ds;
      /* a sharp zig-zag on top of the smooth wander: the ribbon keeps
         slaloming left/right, so the marble can never just coast — both
         dancers have to keep rocking the phone to stay inside the rings */
      const heading = a * Math.sin(s * 0.55 + p1) + b * Math.sin(s * 1.05 + p2) + c * Math.sin(s * 0.12 + p1 * 0.5)
        + zz * Math.sign(Math.sin(s * 0.24 + p3));
      x += Math.cos(heading) * ds;
      z += Math.sin(heading) * ds;
    }
    const points = [];
    for (let k = 0; k * sub <= want; k++) {
      const i = k * sub;
      points.push([xs[i], zs[i]]);
    }
    return { points: points, step: step, sub: sub };
  }

  const P = {
    /* the sky of each dance */
    aurora: { bg0: "#050510", bg1: "#0d1c2b", fog: "#0a1520", halo: "#7ff0d8", aura2: "#6f8cff", floor: "#0b1622" },
    nebula: { bg0: "#06040f", bg1: "#1b0d33", fog: "#120a22", halo: "#b98cff", aura2: "#ff7fcf", floor: "#120c22" },
    ember: { bg0: "#0d0508", bg1: "#2b0f1a", fog: "#1a0a12", halo: "#ff8f6b", aura2: "#ffd28a", floor: "#160a10" },
    ocean: { bg0: "#03080f", bg1: "#07202e", fog: "#061520", halo: "#63d8ff", aura2: "#8ff0e2", floor: "#071620" },
    tokyo: { bg0: "#0a0410", bg1: "#240d2d", fog: "#150818", halo: "#ff7fb0", aura2: "#8fd0ff", floor: "#120811" },
    sahara: { bg0: "#0f0805", bg1: "#2d1608", fog: "#1c0f07", halo: "#ffb26b", aura2: "#ffe9a8", floor: "#170e08" },
    garden: { bg0: "#040a08", bg1: "#0c2418", fog: "#08170f", halo: "#8fffbf", aura2: "#ffe07f", floor: "#0a1710" },
    ice: { bg0: "#04070e", bg1: "#0f1e33", fog: "#0a1420", halo: "#c8e8ff", aura2: "#9fb8ff", floor: "#0b1420" },
    velvet: { bg0: "#0a0410", bg1: "#1f0a24", fog: "#140718", halo: "#e0a0ff", aura2: "#ffb0d8", floor: "#120812" },
    space: { bg0: "#020306", bg1: "#0a1020", fog: "#060a14", halo: "#8fa8ff", aura2: "#e0e8ff", floor: "#070b16" },
  };

  /* prog: one chord per bar [root, third, fifth] as midi numbers        */
  /* mel:  the eight notes the lead picks from, one per bar             */
  const LEVELS = [
    {
      id: "first-bow",
      name: "First Bow",
      style: "Warm waltz",
      subtitle: "Up, down, find the sway",
      blurb: "A slow three-four. The pearl swings away from you and back.",
      bpm: 84, gates: 202, intro: 6, level: 1,
      step: 0.78, lag: 0.045, tiltRange: 26, difficulty: 1,
      space: "aurora", seed: 3,
      stepsPerBar: 6, drums: "waltz",
      prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
      mel: [76, 72, 69, 72, 76, 79, 74, 71],
      pal: {
        bg0: "#050510", bg1: "#0d1c2b", fog: "#0a1520",
        ring: "#ff9ecb", ringNext: "#ffd28a",
        rimA: "#ff9ecb", rimB: "#8ff0e2",
        pearl: "#fff4dc", pearl2: "#ffb877",
        floor: "#0b1622", halo: "#ff9ecb", aura2: "#7ff0d8",
      },
    },
    {
      id: "neon-rooftop",
      name: "Neon Rooftop",
      style: "Tech house",
      subtitle: "The city hums under you",
      blurb: "Four on the floor, wide chords, a bass that leans forward.",
      bpm: 122, gates: 240, intro: 8, level: 2,
      step: 0.84, lag: 0.045, tiltRange: 26, difficulty: 2,
      space: "tokyo", seed: 11,
      stepsPerBar: 8, drums: "tech",
      prog: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [50, 55, 59]],
      mel: [76, 79, 72, 74, 76, 71, 74, 67],
      pal: {
        bg0: "#0a0410", bg1: "#240d2d", fog: "#150818",
        ring: "#ff7fb0", ringNext: "#8fd0ff",
        rimA: "#ff7fb0", rimB: "#8fd0ff",
        pearl: "#fff2fb", pearl2: "#ff8fc4",
        floor: "#120811", halo: "#ff7fb0", aura2: "#8fd0ff",
      },
    },
    {
      id: "sahara-groove",
      name: "Sahara Groove",
      style: "Afro house",
      subtitle: "Let the drums argue",
      blurb: "Syncopated and warm. The pearl wants to go sideways.",
      bpm: 122, gates: 250, intro: 8, level: 3,
      step: 0.86, lag: 0.045, tiltRange: 26, difficulty: 2,
      space: "sahara", seed: 23,
      stepsPerBar: 8, drums: "afrohouse",
      prog: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]],
      mel: [72, 74, 76, 79, 77, 74, 72, 69],
      pal: {
        bg0: "#0f0805", bg1: "#2d1608", fog: "#1c0f07",
        ring: "#ffb26b", ringNext: "#ffe9a8",
        rimA: "#ffb26b", rimB: "#ffd28a",
        pearl: "#fff8ea", pearl2: "#ffb26b",
        floor: "#170e08", halo: "#ffb26b", aura2: "#ffe9a8",
      },
    },
    {
      id: "seoul-nights",
      name: "Seoul Nights",
      style: "K-pop electropop",
      subtitle: "Sharp, bright, fast",
      blurb: "Tight drums, a bright lead, no room to drift.",
      bpm: 128, gates: 269, intro: 8, level: 4,
      step: 0.88, lag: 0.045, tiltRange: 25, difficulty: 3,
      space: "velvet", seed: 31,
      stepsPerBar: 8, drums: "kpop",
      prog: [[60, 64, 67], [57, 60, 64], [59, 62, 67], [55, 59, 62]],
      mel: [79, 76, 74, 76, 79, 83, 81, 76],
      pal: {
        bg0: "#0a0410", bg1: "#1f0a24", fog: "#140718",
        ring: "#e0a0ff", ringNext: "#ffb0d8",
        rimA: "#ffb0d8", rimB: "#a0d8ff",
        pearl: "#fff6ff", pearl2: "#e0a0ff",
        floor: "#120812", halo: "#e0a0ff", aura2: "#ffb0d8",
      },
    },
    {
      id: "bollywood-bloom",
      name: "Bollywood Bloom",
      style: "Filmi strings",
      subtitle: "Both of you, one flourish",
      blurb: "Sliding melody over a walking bass. Big, generous phrases.",
      bpm: 104, gates: 235, intro: 6, level: 5,
      step: 0.82, lag: 0.045, tiltRange: 26, difficulty: 2,
      space: "garden", seed: 41,
      stepsPerBar: 8, drums: "filmi",
      prog: [[57, 60, 64], [57, 62, 65], [55, 58, 62], [53, 57, 60]],
      mel: [72, 75, 76, 79, 76, 75, 72, 68],
      pal: {
        bg0: "#040a08", bg1: "#0c2418", fog: "#08170f",
        ring: "#8fffbf", ringNext: "#ffe07f",
        rimA: "#ffe07f", rimB: "#8fffbf",
        pearl: "#fbfff2", pearl2: "#b8ff8f",
        floor: "#0a1710", halo: "#8fffbf", aura2: "#ffe07f",
      },
    },
    {
      id: "fuego",
      name: "Fuego",
      style: "Reggaeton",
      subtitle: "Hips before hands",
      blurb: "Dembow bounce. The ring is never where you left it.",
      bpm: 100, gates: 230, intro: 8, level: 6,
      step: 0.85, lag: 0.045, tiltRange: 26, difficulty: 2,
      space: "ember", seed: 53,
      stepsPerBar: 8, drums: "dembow",
      prog: [[57, 60, 64], [50, 53, 57], [55, 58, 62], [52, 55, 59]],
      mel: [74, 72, 69, 72, 74, 77, 76, 72],
      pal: {
        bg0: "#0d0508", bg1: "#2b0f1a", fog: "#1a0a12",
        ring: "#ff8f6b", ringNext: "#ffd28a",
        rimA: "#ff8f6b", rimB: "#ffd28a",
        pearl: "#fff3ea", pearl2: "#ff8f6b",
        floor: "#160a10", halo: "#ff8f6b", aura2: "#ffd28a",
      },
    },
    {
      id: "tokyo-rain",
      name: "Tokyo Rain",
      style: "Disco pop",
      subtitle: "Slow it down and listen",
      blurb: "Seventh chords, soft brushes, a long trailing line.",
      bpm: 118, gates: 221, intro: 6, level: 7,
      step: 0.80, lag: 0.045, tiltRange: 27, difficulty: 1,
      space: "ice", seed: 61,
      stepsPerBar: 8, drums: "disco",
      prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      mel: [79, 76, 72, 74, 76, 72, 71, 67],
      pal: {
        bg0: "#04070e", bg1: "#0f1e33", fog: "#0a1420",
        ring: "#c8e8ff", ringNext: "#9fb8ff",
        rimA: "#9fb8ff", rimB: "#8ff0e2",
        pearl: "#f6fbff", pearl2: "#9fb8ff",
        floor: "#0b1420", halo: "#c8e8ff", aura2: "#8ff0e2",
      },
    },
    {
      id: "moonlit-spin",
      name: "Moonlit Spin",
      style: "Disco house",
      subtitle: "Further, faster, hold the line",
      blurb: "The curve widens at the corners. Lead the pearl a beat early.",
      bpm: 124, gates: 259, intro: 8, level: 8,
      step: 0.88, lag: 0.045, tiltRange: 25, difficulty: 3,
      space: "nebula", seed: 71,
      stepsPerBar: 8, drums: "tech",
      prog: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [50, 55, 59]],
      mel: [76, 74, 71, 74, 76, 79, 83, 79],
      pal: {
        bg0: "#06040f", bg1: "#1b0d33", fog: "#120a22",
        ring: "#b98cff", ringNext: "#ff7fcf",
        rimA: "#b98cff", rimB: "#8ff0e2",
        pearl: "#f4f0ff", pearl2: "#b98cff",
        floor: "#120c22", halo: "#b98cff", aura2: "#ff7fcf",
      },
    },
    {
      id: "deep-space",
      name: "Deep Space",
      style: "Liquid drum & bass",
      subtitle: "Nothing to bump into",
      blurb: "Rolling breaks, one long breath. The floor is the whole world.",
      bpm: 174, gates: 288, intro: 8, level: 9,
      step: 0.90, lag: 0.045, tiltRange: 25, difficulty: 3,
      space: "space", seed: 83,
      stepsPerBar: 8, drums: "dnb",
      prog: [[57, 60, 64], [53, 57, 60], [60, 63, 67], [55, 58, 62]],
      mel: [72, 79, 74, 76, 72, 79, 81, 76],
      pal: {
        bg0: "#020306", bg1: "#0a1020", fog: "#060a14",
        ring: "#8fa8ff", ringNext: "#e0e8ff",
        rimA: "#8fa8ff", rimB: "#8ff0e2",
        pearl: "#f2f6ff", pearl2: "#8fa8ff",
        floor: "#070b16", halo: "#8fa8ff", aura2: "#e0e8ff",
      },
    },
    {
      id: "babis-finale",
      name: "Babi's Finale",
      style: "Big room finale",
      subtitle: "All the way, every beat",
      blurb: "The fastest dance of the evening. The pearl has no time to settle.",
      bpm: 128, gates: 278, intro: 8, level: 10,
      step: 0.92, lag: 0.045, tiltRange: 25, difficulty: 3,
      space: "ember", seed: 97,
      stepsPerBar: 8, drums: "bigroom",
      prog: [[57, 60, 64], [59, 62, 67], [57, 60, 64], [55, 59, 62]],
      mel: [76, 79, 83, 79, 76, 72, 74, 79],
      pal: {
        bg0: "#0d0508", bg1: "#2b0f1a", fog: "#1a0a12",
        ring: "#e0bdff", ringNext: "#ffd28a",
        rimA: "#e0bdff", rimB: "#ffd28a",
        pearl: "#fffaef", pearl2: "#ffc48a",
        floor: "#160a10", halo: "#e0bdff", aura2: "#ffd28a",
      },
    },
    {
      id: "encore-a",
      name: "Encore",
      style: "Chart track",
      subtitle: "One more for the road",
      blurb: "A real chart track, synced ring by ring.",
      bpm: 120, gates: 240, intro: 8, level: 10,
      step: 0.9, lag: 0.045, tiltRange: 25, difficulty: 3,
      space: "velvet", seed: 101,
      stepsPerBar: 8, drums: "tech",
      prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
      mel: [76, 72, 69, 72, 76, 79, 74, 71],
      pal: {
        bg0: "#0a0410", bg1: "#1f0a24", fog: "#140718",
        ring: "#e0a0ff", ringNext: "#ffb0d8",
        rimA: "#ffb0d8", rimB: "#a0d8ff",
        pearl: "#fff6ff", pearl2: "#e0a0ff",
        floor: "#120812", halo: "#e0a0ff", aura2: "#ffb0d8",
      },
    },
    {
      id: "encore-b",
      name: "Encore",
      style: "Chart track",
      subtitle: "Last dance of the night",
      blurb: "A real chart track, synced ring by ring.",
      bpm: 120, gates: 240, intro: 8, level: 10,
      step: 0.92, lag: 0.045, tiltRange: 25, difficulty: 3,
      space: "ocean", seed: 113,
      stepsPerBar: 8, drums: "bigroom",
      prog: [[57, 60, 64], [59, 62, 67], [57, 60, 64], [55, 59, 62]],
      mel: [76, 79, 83, 79, 76, 72, 74, 79],
      pal: {
        bg0: "#03080f", bg1: "#07202e", fog: "#061520",
        ring: "#63d8ff", ringNext: "#8ff0e2",
        rimA: "#8ff0e2", rimB: "#63d8ff",
        pearl: "#f2fbff", pearl2: "#8fd0ff",
        floor: "#071620", halo: "#63d8ff", aura2: "#8ff0e2",
      },
    },
  ];

  /* ── derive the timing and the ribbon for every track ─────── */
  /* real recordings from the user's Drive folder, analysed offline:
     bpm = onset-grid regression fit, offset = position of the first strong
     downbeat (some songs start their rhythm seconds into the file),
     dur = decoded length; the ring grid IS the song's own beat grid */
  const TRACKS = [
    { audio: "tracks/01-ahang-faransavi-mp3.mp3", name: "ahang faransavi", bpm: 139.01, offset: 7.285, dur: 268.29 },
    { audio: "tracks/02-ahang-toki-ei-tango-mp3.mp3", name: "ahang toki ei — tango", bpm: 145.3, offset: 0.149, dur: 226.82 },
    { audio: "tracks/03-and-she-was-talking-heads-mp3.mp3", name: "And She Was — Talking Heads", bpm: 124.73, offset: 0.186, dur: 219.6 },
    { audio: "tracks/04-dance-me-to-the-end-of-love-leonard-cohen-mp3.mp3", name: "Dance Me to the End of Love — Leonard Cohen", bpm: 133.18, offset: 4.017, dur: 289.44 },
    { audio: "tracks/05-enrike-tango-mp3.mp3", name: "enrike — tango", bpm: 109.01, offset: 0.627, dur: 333.11 },
    { audio: "tracks/06-feel-so-close-calvin-harris-mp3.mp3", name: "feel so close — calvin harris", bpm: 126.83, offset: 1.486, dur: 208.17 },
    { audio: "tracks/07-i-love-you-baby-frank-sinatra-mp3.mp3", name: "I love you baby — Frank Sinatra", bpm: 120.81, offset: 4.122, dur: 221.01 },
    { audio: "tracks/08-royals-lorde-mp3.mp3", name: "Royals — Lorde", bpm: 84.15, offset: 1.01, dur: 190.22 },
    { audio: "tracks/09-selna-gomez-dance-mp3.mp3", name: "selna gomez — dance", bpm: 109.02, offset: 3.402, dur: 200.68 },
    { audio: "tracks/10-shut-up-and-dance-walk-the-moon-mp3.mp3", name: "Shut Up and Dance — Walk the Moon", bpm: 126.72, offset: 3.855, dur: 197.72 },
    { audio: "tracks/11-theres-nothing-holdin-me-back-shawn-mendes-mp3.mp3", name: "Theres Nothing Holdin Me Back — Shawn Mendes", bpm: 120.83, offset: 0.987, dur: 199.46 },
    { audio: "tracks/12-what-do-you-mean-justin-bieber-mp3.mp3", name: "What Do You Mean — Justin Bieber", bpm: 123.8, offset: 5.445, dur: 207.65 },
  ];

  /* ── derive the timing and the ribbon for every track ─────── */
  LEVELS.forEach((lv, index) => {
    lv.index = index;
    const t = TRACKS[index];
    if (t) {
      lv.audio = t.audio;
      lv.name = t.name;
      lv.style = "Chart track";
      lv.bpm = t.bpm;
      lv.beatOffset = t.offset;
      lv.dur = t.dur;
    }
    lv.spb = 60 / lv.bpm;
    /* a real song runs almost its full length (minus the count-in lead
       and a small tail); a synth fallback stays 2:24 */
    lv.gates = lv.dur
      ? Math.max(40, Math.floor((lv.dur - (lv.beatOffset || 0) - 1.5) / lv.spb))
      : Math.round(144 / lv.spb);
    const route = makeRoute(lv.seed, lv.step, lv.gates);
    lv.points = route.points;
    const lastK = route.points.length - 1;
    /* the pace of the dance IS the song's tempo (one ring per beat), but
       the marble gets a little more than half a beat per ring and its top
       speed is capped, so fast songs stay fun instead of frantic */
    lv.speed = Math.min(2.6, Math.max(1.2, lv.step / lv.spb / 0.85));
    lv.perfect = lv.step * 0.38;
    lv.good = lv.step * 0.78;
    lv.edge = lv.step * 1.15;
    lv.gateX = function (i) {
      if (i < 0) i = 0;
      if (i <= lastK) return lv.points[i][0];
      /* past the sampled ribbon: keep walking in the same direction */
      const a = lv.points[lastK], b = lv.points[lastK - 1] || a;
      const dx = a[0] - b[0], dz = a[1] - b[1];
      const l = Math.hypot(dx, dz) || 1;
      return a[0] + (dx / l) * lv.step * (i - lastK);
    };
    lv.gateZ = function (i) {
      if (i < 0) i = 0;
      if (i <= lastK) return lv.points[i][1];
      const a = lv.points[lastK], b = lv.points[lastK - 1] || a;
      const dx = a[0] - b[0], dz = a[1] - b[1];
      const l = Math.hypot(dx, dz) || 1;
      return a[1] + (dz / l) * lv.step * (i - lastK);
    };
    lv.gateAt = function (i) {
      return i * lv.spb;
    };
    lv.space = P[lv.space] ? lv.space : "aurora";
    lv.sky = P[lv.space];
  });

  DWB.LEVELS = LEVELS;
  DWB.SPACES = P;
  DWB.TRACKS = LEVELS;
  DWB.clamp = clamp;
})();
