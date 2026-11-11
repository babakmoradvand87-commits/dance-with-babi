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
      const gz = -Math.cos(be) * Math.cos(ga);

      /* express it in the screen's own frame (landscape, upside down…) */
      const ang =
        ((window.screen && window.screen.orientation && window.screen.orientation.angle) ||
          window.orientation || 0) * D2R;
      this.sx = gx * Math.cos(ang) - gy * Math.sin(ang);
      this.sy = gx * Math.sin(ang) + gy * Math.cos(ang);
      this.sz = gz;
      this.has = true;
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
      this.has = false;
      this.sx = this.sy = this.sz = 0;
      this.zx = this.zy = 0;
      this.tx = this.ty = 0;
      this.gain = 1;
    },
  };

  DWB.Motion = Motion;
})();
