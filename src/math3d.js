/* ──────────────────────────────────────────────────────────────
   Dance with Babi — math3d.js
   A very small 3D kit: vectors, a look-at camera with roll,
   perspective projection, and mesh builders.
   No WebGL — every triangle is filled on a 2D canvas.
   ────────────────────────────────────────────────────────────── */
(function () {
  const DWB = (window.DWB = window.DWB || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const V = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ],
    norm(a) {
      const l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
  };

  /* ── camera ───────────────────────────────────────────────── */
  function camera(eye, target, up, roll) {
    const fwd = V.norm(V.sub(target, eye));
    let right = V.norm(V.cross(fwd, up || [0, 1, 0]));
    let u = V.norm(V.cross(right, fwd));
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll);
      const r2 = [right[0] * c + u[0] * s, right[1] * c + u[1] * s, right[2] * c + u[2] * s];
      const u2 = [u[0] * c - right[0] * s, u[1] * c - right[1] * s, u[2] * c - right[2] * s];
      right = r2;
      u = u2;
    }
    return { eye: eye, fwd: fwd, right: right, up: u };
  }

  /** world point → {x, y screen, z depth}, or null when behind the eye */
  function project(cam, focal, cx, cy, p) {
    const rx = p[0] - cam.eye[0], ry = p[1] - cam.eye[1], rz = p[2] - cam.eye[2];
    const z = rx * cam.fwd[0] + ry * cam.fwd[1] + rz * cam.fwd[2];
    if (z < 0.12) return null;
    const x = rx * cam.right[0] + ry * cam.right[1] + rz * cam.right[2];
    const y = rx * cam.up[0] + ry * cam.up[1] + rz * cam.up[2];
    return { x: cx + (x / z) * focal, y: cy - (y / z) * focal, z: z };
  }

  /* ── meshes: verts + triangle faces, with local normals ───── */
  function finalize(mesh) {
    const faces = [];
    for (let i = 0; i < mesh.quads.length; i++) {
      const q = mesh.quads[i];
      faces.push([q[0], q[1], q[2]]);
      faces.push([q[0], q[2], q[3]]);
    }
    mesh.faces = faces;
    const v = mesh.verts;
    mesh.normals = mesh.quads.map((q) => {
      const a = v[q[0]], b = v[q[1]], c = v[q[2]];
      return V.norm(V.cross(V.sub(b, a), V.sub(c, a)));
    });
    delete mesh.quads;
    return mesh;
  }

  /** an axis-aligned box, centred on the origin */
  function box(w, h, d) {
    const x = w / 2, y = h / 2, z = d / 2;
    const verts = [
      [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
      [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
    ];
    const quads = [
      [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
      [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
    ];
    return finalize({ verts: verts, quads: quads });
  }

  /** a beam along x, from -len/2 to +len/2, used as the plank */
  function beam(len, w, h, shapeFn) {
    const verts = [];
    const quads = [];
    const SEG = 14;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const x = (u - 0.5) * len;
      const bendY = shapeFn ? shapeFn(x) : 0;
      verts.push([x, -h / 2 + bendY, -w / 2]);
      verts.push([x, h / 2 + bendY, -w / 2]);
      verts.push([x, h / 2 + bendY, w / 2]);
      verts.push([x, -h / 2 + bendY, w / 2]);
    }
    for (let i = 0; i < SEG; i++) {
      const a = i * 4, b = (i + 1) * 4;
      quads.push([a + 2, a + 3, b + 3, b + 2]); /* top */
      quads.push([a + 0, a + 1, b + 1, b + 0]); /* bottom */
      quads.push([a + 1, a + 2, b + 2, b + 1]); /* back */
      quads.push([a + 3, a + 0, b + 0, b + 3]); /* front */
    }
    quads.push([0, 1, 2, 3]);
    quads.push([SEG * 4 + 3, SEG * 4 + 2, SEG * 4 + 1, SEG * 4 + 0]);
    return finalize({ verts: verts, quads: quads });
  }

  /** a sphere, used only for anything that needs real shading */
  function sphere(r, seg, rings) {
    const verts = [];
    const quads = [];
    for (let j = 0; j <= rings; j++) {
      const v = (j / rings) * Math.PI;
      for (let i = 0; i < seg; i++) {
        const u = (i / seg) * Math.PI * 2;
        verts.push([
          r * Math.sin(v) * Math.cos(u),
          r * Math.cos(v),
          r * Math.sin(v) * Math.sin(u),
        ]);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const n = (i + 1) % seg;
        quads.push([j * seg + i, j * seg + n, (j + 1) * seg + n, (j + 1) * seg + i]);
      }
    }
    return finalize({ verts: verts, quads: quads });
  }

  /** rotation about z, applied to a point */
  function rotZ(p, c, s) {
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  }

  DWB.V = V;
  DWB.camera = camera;
  DWB.project = project;
  DWB.mesh = { box: box, beam: beam, sphere: sphere };
  DWB.rotZ = rotZ;
  DWB.clamp = clamp;
  DWB.TAU = Math.PI * 2;
})();
