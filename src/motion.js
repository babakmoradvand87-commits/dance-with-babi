/* ──────────────────────────────────────────────────────────────
   Dance with Babi — motion.js
   The phone is a tray. We ask the accelerometer one question:
   "which way is down, inside the phone?" — and then we measure how
   far that answer has *rotated* away from the pose you started in.

   That angle is the same number however you hold the phone: flat on
   your palms, upright like a book, in portrait, in landscape. The
   old version projected gravity onto the screen plane, which is
   nearly zero when the phone is upright — that is why nothing moved.

   The rotation between two gravity directions is a rotation vector
   r = θ · (ĝ0 × ĝ); its components along the screen's own axes are
   exactly "how much has the tray tipped right" and "…tipped away".
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const clamp = DWB.clamp;
  const D2R = Math.PI / 180;
  const SMOOTH = 14;                    /* how quickly the tray follows */
  const DEFAULT_RANGE = 26 * Math.PI / 180;  /* 26° of tip = full tilt */

  const Motion = {
    /* state */
    enabled: false,
    has: false,
    state: "off",          /* off | asking | waiting | live | denied | unsupported | nodata */
    source: "",            /* "orientation" | "motion" */
    note: "",
    reason: "",

    /* the maths */
    g: [0, 0, -1],         /* gravity in the screen frame, unit length */
    g0: [0, 0, -1],        /* the pose that counts as flat */
    calibrated: false,
    range: DEFAULT_RANGE,
    flip: 1,
    tx: 0, ty: 0,          /* the tilt the game reads, -1..1 */
    wantX: 0, wantY: 0,

    /* for the on-screen sensor panel */
    raw: { beta: 0, gamma: 0, alpha: 0, count: 0, at: 0 },

    _bound: null,
    _motionBound: null,
    _askedAt: 0,
    _waitFrom: 0,

    /* ── capability ─────────────────────────────────────── */
    supported() {
      if (typeof window === "undefined") return false;
      return typeof window.DeviceOrientationEvent !== "undefined" ||
        typeof window.DeviceMotionEvent !== "undefined";
    },

    /* iOS 13+ only accepts a permission request from inside a tap */
    needsPermission() {
      return typeof window !== "undefined" && (
        (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === "function") ||
        (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === "function")
      );
    },

    inFrame() {
      try { return window.top !== window.self; } catch (e) { return true; }
    },

    statusText() {
      if (this.state === "live") return this.source === "motion" ? "accelerometer ✓" : "gyroscope ✓";
      if (this.state === "waiting") return "waiting for the sensor…";
      if (this.state === "asking") return "asking for permission…";
      if (this.state === "denied") return "motion blocked — tap to allow";
      if (this.state === "nodata") return "no sensor data — tap to retry";
      if (this.state === "unsupported") return "no motion sensor here";
      return "tap to switch the gyroscope on";
    },

    /* ── switching on ───────────────────────────────────── */
    async enable(force) {
      if (this.enabled && this.has) return true;
      const now = Date.now();
      if (!force && now - this._askedAt < 600) return false;
      this._askedAt = now;

      if (!this.supported()) {
        this.state = "unsupported";
        this.note = "This browser has no motion sensor at all.";
        return false;
      }
      this.state = "asking";

      const need = (C) => C && typeof C.requestPermission === "function";
      let granted = true;
      try {
        if (need(window.DeviceOrientationEvent)) granted = await window.DeviceOrientationEvent.requestPermission().then((r) => r === "granted");
        if (!granted && need(window.DeviceMotionEvent)) granted = await window.DeviceMotionEvent.requestPermission().then((r) => r === "granted");
      } catch (e) {
        granted = false;
      }
      if (!granted) {
        this.state = "denied";
        this.note = this.inFrame()
          ? "Motion is blocked inside an embedded page — open the game directly in Safari or Chrome."
          : "Motion was refused. Tap again and choose Allow (iOS: Settings → Safari → Motion & Orientation Access).";
        return false;
      }

      if (!this._bound) this._bound = (ev) => Motion.read(ev);
      if (!this._motionBound) this._motionBound = (ev) => Motion.readMotion(ev);
      window.addEventListener("deviceorientation", this._bound, true);
      /* some Androids only fire the absolute variant */
      window.addEventListener("deviceorientationabsolute", this._bound, true);
      window.addEventListener("devicemotion", this._motionBound, true);
      if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
        window.screen.orientation.addEventListener("change", () => { Motion.has = false; });
      }

      this.enabled = true;
      this.state = this.has ? "live" : "waiting";
      this._waitFrom = Date.now();
      this.note = "";
      return true;
    },

    /* ── reading the sensors ────────────────────────────── */
    screenAngle() {
      return ((window.screen && window.screen.orientation && window.screen.orientation.angle) ||
        window.orientation || 0) * D2R;
    },

    read(ev) {
      if (!ev || (ev.beta == null && ev.gamma == null)) return;
      const b = (ev.beta || 0) * D2R;
      const a = (ev.gamma || 0) * D2R;

      /* gravity in the device frame = minus the third row of Rz·Rx·Ry */
      const dx = Math.cos(b) * Math.sin(a);
      const dy = -Math.sin(b);
      const dz = -Math.cos(b) * Math.cos(a);

      const ang = this.screenAngle();
      this.setGravity(
        dx * Math.cos(ang) - dy * Math.sin(ang),
        dx * Math.sin(ang) + dy * Math.cos(ang),
        dz,
        "orientation"
      );
      this.raw.beta = ev.beta || 0;
      this.raw.gamma = ev.gamma || 0;
      this.raw.alpha = ev.alpha || 0;
    },

    /* phones that only report acceleration still work */
    readMotion(ev) {
      if (this.source === "orientation") return;
      const acc = ev && ev.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const m = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      if (m < 3) return;
      const dx = -acc.x / m;
      const dy = -acc.y / m;
      const dz = -acc.z / m;
      const ang = this.screenAngle();
      this.setGravity(
        dx * Math.cos(ang) - dy * Math.sin(ang),
        dx * Math.sin(ang) + dy * Math.cos(ang),
        dz,
        "motion"
      );
      this.raw.beta = Math.asin(-dy) / D2R;
      this.raw.gamma = Math.asin(clamp(dx, -1, 1)) / D2R;
    },

    setGravity(x, y, z, source) {
      const m = Math.sqrt(x * x + y * y + z * z) || 1;
      this.g[0] = x / m;
      this.g[1] = y / m;
      this.g[2] = z / m;
      if (!this.has) {
        this.has = true;
        if (!this.calibrated) this.calibrate();
      }
      this.source = source;
      this.state = "live";
      this.raw.count++;
      this.compute();
    },

    /* how far has "down" turned, compared with the pose you started in? */
    compute() {
      const a = this.g0, b = this.g;
      const cx = a[1] * b[2] - a[2] * b[1];
      const cy = a[2] * b[0] - a[0] * b[2];
      const cz = a[0] * b[1] - a[1] * b[0];
      const s = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      let rx = 0, ry = 0;
      if (s > 1e-6) {
        const th = Math.atan2(s, c);
        const k = th / s;
        rx = cx * k;
        ry = cy * k;
      }
      /* r_x = the tray tipping away from you, -r_y = the tray tipping right */
      this.wantY = clamp((rx / this.range) * this.flip, -1.3, 1.3);
      this.wantX = clamp((-ry / this.range) * this.flip, -1.3, 1.3);
    },

    update(dt) {
      if (!this.enabled) return;
      if (this.state === "waiting" && this._waitFrom && Date.now() - this._waitFrom > 3000) {
        this.state = "nodata";
        this.note = "The browser accepted, but no sensor data is arriving. On iOS check Settings → Safari → Motion & Orientation Access.";
      }
      const f = Math.min(1, dt * SMOOTH);
      this.tx += (this.wantX - this.tx) * f;
      this.ty += (this.wantY - this.ty) * f;
      if (Math.abs(this.tx) < 0.004) this.tx = 0;
      if (Math.abs(this.ty) < 0.004) this.ty = 0;
    },

    tick() {
      if (this.state === "waiting" && this._waitFrom && Date.now() - this._waitFrom > 3000) {
        this.state = "nodata";
        this.note = "The browser accepted, but no sensor data is arriving. On iOS check Settings → Safari → Motion & Orientation Access.";
      }
    },

    /* whatever pose you are holding right now becomes "flat" */
    calibrate() {
      this.g0[0] = this.g[0];
      this.g0[1] = this.g[1];
      this.g0[2] = this.g[2];
      this.calibrated = true;
      this.tx = 0;
      this.ty = 0;
      this.wantX = 0;
      this.wantY = 0;
    },

    setRange(degrees) {
      this.range = (degrees || 26) * D2R;
    },

    reset() {
      this.has = false;
      this.calibrated = false;
      this.g = [0, 0, -1];
      this.g0 = [0, 0, -1];
      this.tx = this.ty = this.wantX = this.wantY = 0;
      this.source = "";
      this.state = this.enabled ? "waiting" : "off";
    },

    /* for the on-screen panel, in degrees */
    degrees() {
      return [this.wantX * this.range / D2R, this.wantY * this.range / D2R];
    },
  };

  DWB.Motion = Motion;
})();
