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
    lean: 0,   /* radians, + = the screen's right side is down */
    value: 0,  /* -1..1 after calibration */
    zero: 0,
    _bound: null,

    supported() {
      return typeof window !== "undefined" && typeof window.DeviceOrientationEvent !== "undefined";
    },

    /* must be called from a user gesture (iOS asks for permission) */
    async enable() {
      if (this.enabled) return true;
      if (!this.supported()) { this.reason = "unsupported"; return false; }
      const DOE = window.DeviceOrientationEvent;
      try {
        if (typeof DOE.requestPermission === "function") {
          const res = await DOE.requestPermission();
          if (res !== "granted") { this.reason = "denied"; return false; }
        }
      } catch (err) {
        this.reason = "denied";
        return false;
      }
      if (!this._bound) this._bound = (ev) => Motion.read(ev);
      window.addEventListener("deviceorientation", this._bound, true);
      if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
        window.screen.orientation.addEventListener("change", () => { Motion.has = false; });
      }
      this.enabled = true;
      this.reason = "";
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

      /* express it in the screen's own frame (landscape, upside down…) */
      const ang =
        ((window.screen && window.screen.orientation && window.screen.orientation.angle) ||
          window.orientation || 0) * D2R;
      const sx = gx * Math.cos(ang) - gy * Math.sin(ang);

      this.lean = Math.asin(clamp(sx, -1, 1));
      this.has = true;
    },

    update(dt) {
      if (!this.enabled || !this.has) return;
      const want = clamp((this.lean - this.zero) / MAX_LEAN, -1, 1);
      this.value += (want - this.value) * Math.min(1, dt * SMOOTH);
      if (Math.abs(this.value) < 0.004) this.value = 0;
    },

    /* whatever pose you are holding it in right now becomes "level" */
    calibrate() {
      if (this.has) this.zero = this.lean;
      this.value = 0;
    },

    reset() {
      this.has = false;
      this.lean = 0;
      this.value = 0;
      this.zero = 0;
    },

    /* how far past "level" you are right now, for the HUD */
    leanDegrees() {
      return ((this.lean - this.zero) / D2R) | 0;
    },
  };

  DWB.Motion = Motion;
})();
