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

**Dance with Babi** یک بازی رقص دونفره است با الهام از بازی *Bounden*: **گوشی همان تخته است**. دو نفر گوشی را
با هم می‌گیرند (هر کدام یک شست روی صفحه) و آن را مثل سینی کج می‌کنند؛ تختهٔ سه‌بعدی روی صفحه کج می‌شود و مروارید
روی آن می‌غلتد. حلقه‌ها یکی‌یکی روی ضربِ والس می‌آیند و باید مروارید دقیقاً همان لحظه داخل حلقه باشد.

**سه قانون، همین:**

1. **گوشی را با هم بگیرید.** ژیروسکوپ گوشی خوانده می‌شود، نه حرکت انگشت. شست‌های شما روی صفحه «گرفتن» تخته‌اند:
   اگر یکی شستش را بردارد تخته شل می‌شود و مروارید می‌ایستد — پس هیچ‌کس نمی‌تواند تنهایی برقصد.
2. **شیب = سرعت.** گوشی را کج کنید: سمت پایین‌تر، سرازیری تخته است و مروارید به همان سمت می‌غلتد. گوشی را صاف
   بگیرید تا مروارید بایستد. هر позی که در آن شروع کنید «صاف» حساب می‌شود؛ برای تنظیم مجدد، بازی را pause و
   دوباره resume کنید. مروارید با یک تأخیر کوتاه (~۱۵۰ میلی‌ثانیه) جواب می‌دهد، پس باید یک ضرب زودتر شروع کنید.
3. **روی ضرب داخل حلقه.** قضاوت لحظه‌ای است: همان‌جا که ضرب می‌خورد، فاصلهٔ مروارید تا حلقه اندازه گرفته
   می‌شود — *perfect* / *good* / *on the edge*. اگر از سر تخته رد شوید، مروارید به دیواره می‌خورد و کمبو می‌شکند.

همه‌چیز سه‌بعدی است: یک سالن با ستون‌ها، تخته‌ای که واقعاً کج می‌شود، دوربینی که با مروارید حرکت می‌کند و
سایه و نور و مه — همه با یک رسترایزر نرم‌افزاری روی Canvas 2D، بدون هیچ کتابخانه‌ای.

| | |
|---|---|
| 📱 **ژیروسکوپ** | موبایل/تبلت: گوشی را با هم بگیرید و کج کنید (HTTPS لازم است؛ iOS اجازه می‌پرسد) |
| ⌨️ **جایگزین رومیزی** | لپ‌تاپ بدون ژیروسکوپ: نفر اول `W`/`S`، نفر دوم `↑`/`↓` — یک سر تخته برای هر نفر |
| 🕺 **حالت تک‌نفره** | یک شست، هر دو سر تخته با هم — برای تمرین |
| 🎵 **موسیقی زنده** | والس در لا مینور که همان لحظه با Web Audio ساخته می‌شود؛ هیچ فایل صوتی در ریپو نیست |
| 💃 **سه رقص** | First Bow (۸۴ bpm) · Moonlit Spin (۹۶ bpm) · Babi's Finale (۱۰۸ bpm) |
| 🏅 **امتیاز و ستاره** | دقت، کمبو، بهترین رکورد و باز شدن رقص بعدی (در `localStorage`) |

نصب لازم نیست: `index.html` را باز کنید (یا با یک سرور محلی سرو کنید) و تمام.

---

## How to play

1. **Hold the phone together.** The phone *is* the plank. Both of you hold it, one thumb on the glass each —
   one thumb in each half of the screen. Those thumbs are the grip: let go with one hand and the plank goes
   slack, so nobody can carry this dance alone.
2. **Lean it like a tray (gyroscope).** The game reads `DeviceOrientationEvent` — how you physically lean the
   device — not finger dragging. Right side down, plank tips right, pearl rolls downhill. Hold it level and
   the pearl coasts. Whatever pose you hold when the dance starts becomes "level"; pause and resume to
   re-centre. On a laptop with no gyroscope, one end each: <kbd>W</kbd>/<kbd>S</kbd> and <kbd>↑</kbd>/<kbd>↓</kbd>.
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
| `src/motion.js` | the gyroscope. Reads `beta`/`gamma`, rebuilds the gravity vector in the device frame, projects it onto the screen's own axes (so landscape and upside-down work), calibrates "level" and smooths it. |
| `src/paths.js` | the choreography and the physics of each dance: tempo, ring count, swing (`amp`), how fast the pearl rolls at full tilt (`speed`), how late it answers (`lag`), the glide curve of the plank, the palette. |
| `src/render.js` | the look. A **software 3D rasterizer on Canvas 2D**: the plank is re-built every frame as a sheared beam whose two ends sit under each player's hand, faces are painter-sorted, lit by the face normal and faded into fog, and the rings are 3D hoops drawn in projected space. Camera follows the pearl and rocks with the tilt. |
| `src/audio.js` | the music. A generative waltz in A minor: pad, bass, harp arpeggio and a celesta melody, scheduled ahead of the audio clock, plus a generated hall reverb. All synthesised, no samples. |
| `src/game.js` | the rules. Gyroscope grip, hand smoothing, the pearl's integration, beat-snapshot judging, combo, screens and persistence. |

A few notes on the design:

* **The plank is honest.** The pearl's speed is the plank's slope (with a little inertia), the two ends of the
  drawn plank sit exactly where the gyroscope says your two hands are, and the camera rolls with the tilt —
  every degree you lean the phone changes the picture *and* the physics in the same frame.
* **Two thumbs, or nothing.** In duet mode the plank only answers you while both halves of the screen are
  held, so if one player lets go the pearl stops dead. The gyroscope itself cannot see *who* leaned, but the
  grip can see that both of you are still there.
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
node ../tests/gyro.js     # the gyroscope: lean maths, the grip, the permission fallback
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
