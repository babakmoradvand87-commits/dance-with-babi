<p align="center">
  <img src="assets/hero.jpg" alt="Dance with Babi — a duet for two players on one screen" width="100%" />
</p>

<h1 align="center">Dance with Babi</h1>

<p align="center">
  <strong>یک بازی وب برای دو نفر، روی یک صفحه.</strong><br/>
  A two-player dancing game for one screen — playable on a phone, a tablet or a laptop.<br/>
  <a href="https://babakmoradvand87-commits.github.io/dance-with-babi/">▶ play it in the browser</a>
</p>

<p align="center">
  <img alt="no dependencies" src="https://img.shields.io/badge/dependencies-none-ff9ecb" />
  <img alt="no build step" src="https://img.shields.io/badge/build-none-8ff0e2" />
  <img alt="vanilla js" src="https://img.shields.io/badge/3d%20rasterizer%20on%20canvas%202d-ffd28a" />
  <img alt="license mit" src="https://img.shields.io/badge/license-MIT-b993ff" />
</p>

---

## فارسی

**Dance with Babi** یک بازی رقص دونفره است با الهام از بازی *Bounden*: دو بازیکن یک صفحه را بین خودشان
تقسیم می‌کنند و **دو سرِ یک تخته** را در دست دارند. هر کس سرِ خودش را بالا و پایین می‌برد؛ تخته کج می‌شود و
مروارید روی آن می‌غلتد. حلقه‌ها یکی‌یکی روی ضربِ والس می‌آیند و باید مروارید دقیقاً همان لحظه داخل حلقه باشد.

**سه قانون، همین:**

1. **یکی بالا، یکی پایین.** شیب تخته از *تفاضل* دو دست می‌آید. اگر هر دو با هم بالا ببرید، تخته صاف می‌ماند و
   مروارید تکان نمی‌خورد؛ پس یک نفر تنها هم نمی‌تواند برقصاند — با یک دست حداکثر نصفِ شیبِ لازم را دارد.
2. **شیب = سرعت.** هرچه تخته شیب‌دارتر، مروارید تندتر. مروارید با یک تأخیر کوتاه (۱۵ صدم ثانیه) جواب می‌دهد،
   پس باید یک ضرب زودتر شروع کنید و برای ایستادن، تخته را صاف کنید.
3. **روی ضرب داخل حلقه.** قضاوت لحظه‌ای است: همان‌جا که ضرب می‌خورد، فاصلهٔ مروارید تا حلقه اندازه گرفته
   می‌شود — *perfect* / *good* / *on the edge*. اگر از سر تخته رد شوید، مروارید به دیواره می‌خورد و کمبو می‌شکند.

همه‌چیز سه‌بعدی است: یک سالن با ستون‌ها، تخته‌ای که واقعاً کج می‌شود، دوربینی که با مروارید حرکت می‌کند و
سایه و نور و مه — همه با یک رسترایزر نرم‌افزاری روی Canvas 2D، بدون هیچ کتابخانه‌ای.

| | |
|---|---|
| 🎮 **دو نفره روی یک صفحه** | موبایل/تبلت: هر نفر انگشتش را در نیمهٔ خودش بالا/پایین می‌برد · لپ‌تاپ: نفر اول `W`/`S`، نفر دوم `↑`/`↓` |
| 🕺 **حالت تک‌نفره** | یک جفت دست، هر دو سر تخته با هم — برای تمرین |
| 🎵 **موسیقی زنده** | والس در لا مینور که همان لحظه با Web Audio ساخته می‌شود؛ هیچ فایل صوتی در ریپو نیست |
| 💃 **سه رقص** | First Bow (۸۴ bpm) · Moonlit Spin (۹۶ bpm) · Babi's Finale (۱۰۸ bpm) |
| 🏅 **امتیاز و ستاره** | دقت، کمبو، بهترین رکورد و باز شدن رقص بعدی (در `localStorage`) |

نصب لازم نیست: `index.html` را باز کنید (یا با یک سرور محلی سرو کنید) و تمام.

---

## How to play

1. **One end each.** Two players share one device: player one holds the *left* end of the plank, player two
   the *right* one. Lift a finger in your half of the screen, or on a keyboard player one uses
   <kbd>W</kbd>/<kbd>S</kbd> and player two <kbd>↑</kbd>/<kbd>↓</kbd>.
2. **One up, one down.** The plank's tilt is *half the difference* between your two hands, so the pearl only
   rolls when the two of you disagree about height. Both lift together and nothing moves. One player alone
   can reach at most half the tilt a swing needs — this dance genuinely takes two.
3. **The slope is the speed.** Steeper means faster, and the pearl answers your hands about 150 ms late. You
   are steering a pendulum, so *lead* the beat and level the plank to stop it.
4. **Be in the ring on the beat.** Each ring is snapshotted the instant the beat lands: the closer the pearl
   is to the ring's centre, the better — *perfect*, *good*, *on the edge*. Overshoot and the pearl slams
   into the end of the plank and the streak snaps.

<br/>
<p align="center">
  <img src="assets/level-1.jpg" alt="First Bow" width="24%" />
  <img src="assets/level-2.jpg" alt="Moonlit Spin" width="24%" />
  <img src="assets/level-3.jpg" alt="Babi's Finale" width="24%" />
</p>

## The three dances

| dance | tempo | rings | swing | what happens |
|---|---|---|---|---|
| **First Bow** | 84 bpm | 24 | ±0.62 | a gentle bow: one ring per beat, alternating ends, plenty of room to breathe |
| **Moonlit Spin** | 96 bpm | 30 | ±0.72 | faster music, wider swing — the plank has to be levelled on the off-beat |
| **Babi's Finale** | 108 bpm | 36 | ±0.82 | the fastest waltz of the evening; the pearl needs 5.6 units a second |

Finishing a dance with at least one star unlocks the next one.

## How it works

Five small scripts, one stylesheet, zero dependencies:

| file | what's inside |
|---|---|
| `src/math3d.js` | the maths: vectors, a look-at camera with roll, perspective projection, and box/beam/sphere meshes. |
| `src/paths.js` | the choreography and the physics of each dance: tempo, ring count, swing (`amp`), how fast the pearl rolls at full tilt (`speed`), how late it answers (`lag`), the glide curve of the plank, the palette. |
| `src/render.js` | the look. A **software 3D rasterizer on Canvas 2D**: the plank is re-built every frame as a sheared beam whose two ends sit under each player's hand, faces are painter-sorted, lit by the face normal and faded into fog, and the rings are 3D hoops drawn in projected space. Camera follows the pearl and rocks with the tilt. |
| `src/audio.js` | the music. A generative waltz in A minor: pad, bass, harp arpeggio and a celesta melody, scheduled ahead of the audio clock, plus a generated hall reverb. All synthesised, no samples. |
| `src/game.js` | the rules. Hand smoothing, the pearl's integration, beat-snapshot judging, combo, screens and persistence. |

A few notes on the design:

* **The plank is honest.** The pearl's speed is the plank's slope (with a little inertia), the two ends are
  drawn exactly where your two hands are, and the camera rolls with the tilt — every change of your hand
  changes the picture *and* the physics in the same frame.
* **Timing** is measured against the audio clock (`AudioContext.currentTime`), not `requestAnimationFrame`,
  so the rings stay true to the music even if the frame rate dips. With no audio it falls back to
  `performance.now()`.
* **The count-in happens in negative song time.** The waltz starts six beats before the first ring so both
  players can feel the tempo before anything is asked of them.
* **No failure state.** You cannot lose a dance; you can only leave with fewer stars.
* **Balance is tested, not guessed.** `tests/smoke.js` plays every dance with a model of two skilled dancers
  and checks the score, and with models of lazy, one-sided and idle players to make sure they *don't* score.

## Run it locally

```bash
git clone https://github.com/babakmoradvand87-commits/dance-with-babi.git
cd dance-with-babi
python3 -m http.server 8000   # or just double-click index.html
```

`index.html` is a **single self-contained file** — the CSS and the JavaScript are inlined, so the game
works from the filesystem, from a USB stick, or inside a sandboxed iframe with no network at all.
It is generated from the sources:

```
src/                  editable sources (style.css + five scripts)
tools/template.html   the HTML shell (English + Persian copy)
tools/build.py        welds src/ into index.html
```

After editing anything in `src/`, rebuild:

```bash
python3 tools/build.py      # writes index.html (~100 KB)
```

No bundler, no npm, no dependencies. Published with GitHub Pages straight from the `main` branch.

## Tests

```bash
node ../tests/smoke.js    # headless playtest: balance, inputs, screens (jsdom)
node ../tests/audio.js    # the synthesised waltz, with a mock AudioContext
node ../tests/render.js   # renders stills of the 3D scene to ../tests/shots/ (@napi-rs/canvas)
```

The playtest reports, for each dance, what a pair of careful dancers score (they land every ring), what a
sloppy pair scores, and that idle, both-lifting and one-sided players score nothing.

## Credits

* Inspired by **[Bounden](https://apps.apple.com/us/app/bounden/id850456491)** (Adriaan de Jongh / Game Oven,
  choreography by the Dutch National Ballet) — a game about two people holding one phone. This is an
  original, non-commercial tribute: all code, choreography, art direction and music here are written from
  scratch for the browser.
* Built with the Canvas 2D API and the Web Audio API. No libraries, no image files, no audio files.

## License

MIT — see [LICENSE](LICENSE).

<p align="center"><sub>made for two people and one screen · با دو دست و یک صفحه</sub></p>
