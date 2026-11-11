/* ──────────────────────────────────────────────────────────────
   Dance with Babi — motion.js
   The phone *is* the plank. Two players hold one device, and the
   way they lean it is what tilts the plank on screen.

   We read the gravity vector out of DeviceOrientationEvent and
   project it onto the screen plane; the component along the
   screen's x axis is the lean. That works whether the phone is
   held flat like a tray or upright like a book, in portrait or
   landscape, because it is the physics, not a special case.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = window.DWB;
  const clamp = DWB.clamp;
  const D2R = Math.PI / 180;
  const MAX_LEAN = (26 * Math.PI) / 180; /* a 26° lean is full tilt */
  const SMOOTH = 16;                     /* how quickly the pearl follows */

  const Motion = {
    enabled: false,
    has: false,
    reason: "",
    sx: 0, sy: 0, sz: 0,  /* gravity in the screen's own frame, unit length */
    zx: 0, zy: 0,         /* the pose that counts as flat */
    tx: 0, ty: 0,         /* calibrated tilt, -1..1, +x = right side down, +y = top side down */
    flip: 1,              /* tap the HUD chip to invert */
    gain: 1,
    _bound: null,

    source: "",        /* "orientation" or "motion" once data arrives */
    state: "off",      /* off | asking | waiting | live | denied | unsupported */
    note: "",
    _motionBound: null,
    _askedAt: 0,

    supported() {
      if (typeof window === "undefined") return false;
      return (
        typeof window.DeviceOrientationEvent !== "undefined" ||
        typeof window.DeviceMotionEvent !== "undefined"
      );
    },

    inFrame() {
      try { return window.top !== window.self; } catch (e) { return true; }
    },

    /* if nothing ever arrives, say so instead of waiting forever */
    tick() {
      if (this.state === "waiting" && this._waitFrom && Date.now() - this._waitFrom > 3000) {
        this.state = "nodata";
        this.note = "The browser accepted but the sensor is not reporting anything. If you are on iOS, check Settings → Safari → Motion & Orientation Access.";
      }
    },

    /* what to tell the player, in one line */
    statusText() {
      if (this.state === "live") return this.source === "motion" ? "motion sensor ✓" : "gyroscope ✓";
      if (this.state === "waiting") return "waiting for the sensor…";
      if (this.state === "nodata") return "no sensor data — tap to retry";
      if (this.state === "asking") return "asking for permission…";
      if (this.state === "denied") return "motion blocked — tap to allow";
      if (this.state === "unsupported") return "no motion sensor here";
      return "tap to switch the gyroscope on";
    },

    /* must be called from a user gesture (iOS asks for permission) */
    async enable(force) {
      if (this.enabled) return true;
      /* don't hammer the browser if we asked a moment ago */
      const now = Date.now();
      if (!force && now - this._askedAt < 700) return false;
      this._askedAt = now;

      if (!this.supported()) {
        this.state = "unsupported";
        this.reason = "unsupported";
        this.note = "This browser has no motion sensor at all.";
        return false;
      }
      this.state = "asking";
      this.reason = "";

      /* iOS 13+ wants an explicit permission, asked from inside a tap */
      const need = (Ctor) => Ctor && typeof Ctor.requestPermission === "function";
      const ask = async (Ctor) => {
        const res = await Ctor.requestPermission();
        return res === "granted";
      };

      let granted = true;
      try {
        if (need(window.DeviceOrientationEvent)) granted = await ask(window.DeviceOrientationEvent);
        if (!granted && need(window.DeviceMotionEvent)) granted = await ask(window.DeviceMotionEvent);
      } catch (err) {
        granted = false;
      }
      if (!granted) {
        this.state = "denied";
        this.reason = "denied";
        this.note = this.inFrame()
          ? "Motion is blocked inside an embedded page. Open the game directly in Safari or Chrome — a sandboxed preview cannot reach the sensor."
          : "Motion was refused. Tap again and choose Allow — on iOS you may also need Settings → Safari → Motion & Orientation Access.";
        return false;
      }

      if (!this._bound) this._bound = (ev) => Motion.read(ev);
      if (!this._motionBound) this._motionBound = (ev) => Motion.readMotion(ev);
      window.addEventListener("deviceorientation", this._bound, true);
      window.addEventListener("devicemotion", this._motionBound, true);
      if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
        window.screen.orientation.addEventListener("change", () => { Motion.has = false; });
      }
      this.enabled = true;
      this.state = "waiting";
      this.note = "";
      this._waitFrom = Date.now();
      return true;
    },

    read(ev) {
      if (!ev || (ev.beta == null && ev.gamma == null)) return;
      const be = (ev.beta || 0) * D2R;
      const ga = (ev.gamma || 0) * D2R;

      /* gravity inside the device frame is minus the third row of the
         W3C rotation matrix Rz(alpha)·Rx(beta)·Ry(gamma) */
      const gx = Math.cos(be) * Math.sin(ga);
      const gy = -Math.sin(be);
      const gz = -Math.cos(be) * Math.cos(ga);

      /* express it in the screen's own frame (landscape, upside down…) */
      const ang =
        ((window.screen && window.screen.orientation && window.screen.orientation.angle) ||
          window.orientation || 0) * D2R;
      this.sx = gx * Math.cos(ang) - gy * Math.sin(ang);
      this.sy = gx * Math.sin(ang) + gy * Math.cos(ang);
      this.sz = gz;
      this.has = true;
      this.source = "orientation";
      this.state = "live";
    },

    /* a second chance: many phones report acceleration but no orientation */
    readMotion(ev) {
      if (this.source === "orientation") return;
      const a = ev && ev.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
      if (m < 3) return;                      /* not gravity, ignore */
      const gx = -a.x / m, gy = -a.y / m, gz = -a.z / m;
      const ang =
        ((window.screen && window.screen.orientation && window.screen.orientation.angle) ||
          window.orientation || 0) * D2R;
      this.sx = gx * Math.cos(ang) - gy * Math.sin(ang);
      this.sy = gx * Math.sin(ang) + gy * Math.cos(ang);
      this.sz = gz;
      this.has = true;
      this.source = "motion";
      this.state = "live";
    },

    update(dt) {
      if (!this.enabled || !this.has) return;
      /* how far the tray has been tipped away from the pose you started in —
         both axes, so *any* way you tilt the phone moves the marble */
      const dx = (this.sx - this.zx) * this.gain * this.flip;
      const dy = (this.sy - this.zy) * this.gain * this.flip;
      const k = 1 / Math.sin(this.range || MAX_LEAN);
      const wx = clamp(dx * k, -1, 1);
      const wy = clamp(dy * k, -1, 1);
      const f = Math.min(1, dt * SMOOTH);
      this.tx += (wx - this.tx) * f;
      this.ty += (wy - this.ty) * f;
      if (Math.abs(this.tx) < 0.004) this.tx = 0;
      if (Math.abs(this.ty) < 0.004) this.ty = 0;
    },

    /* whatever pose you are holding it in right now becomes "flat" */
    calibrate() {
      if (!this.has) return;
      this.zx = this.sx;
      this.zy = this.sy;
      /* a phone held upright moves the gravity vector less per degree:
         give those players a little more gain so it feels the same */
      this.gain = 1 / clamp(Math.abs(this.sz), 0.45, 1);
      this.tx = 0;
      this.ty = 0;
    },

    setRange(degrees) {
      this.range = (degrees || 26) * D2R;
    },

    reset() {
      this.state = this.enabled ? "waiting" : "off";
      this.source = "";
      this.has = false;
      this.sx = this.sy = this.sz = 0;
      this.zx = this.zy = 0;
      this.tx = this.ty = 0;
      this.gain = 1;
    },
  };

  DWB.Motion = Motion;
})();
