// The parcel journey: one scroll-pinned 3D film following a single parcel. A drone
// lowers it onto a bike, the bike hands it to a van, a truck takes it across India,
// a plane carries it abroad and lands, and a van brings it to the customer's front door.
// Scroll sets the position on the timeline; the clock keeps traffic and rotors alive.
// Needs three.js (r128); without it or WebGL the stages stay as plain text.
(function () {
  'use strict';
  const root = document.getElementById('journey');
  if (!root || !window.THREE) return;
  const T = window.THREE;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FONT = '"Plus Jakarta Sans", Arial, sans-serif';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (k) => k * k * (3 - 2 * k);
  const rad = (d) => (d * Math.PI) / 180;
  const mod = (a, b) => ((a % b) + b) % b;
  const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  // ---- timeline ------------------------------------------------------------
  const SCENES = [
    { id: 'street', a: 0, b: 0.27 },
    { id: 'depot', a: 0.27, b: 0.37 },
    { id: 'india', a: 0.37, b: 0.52 },
    { id: 'airport', a: 0.52, b: 0.64 },
    { id: 'globe', a: 0.64, b: 0.76 },
    { id: 'arrival', a: 0.76, b: 0.87 },
    { id: 'door', a: 0.87, b: 1 },
  ];
  // How each scene passes to the next, half-width w on the timeline: through a colour of sky
  // and haze, or as a direct dissolve from one picture to the other.
  const CUTS = [
    { color: '#dfeaf2', w: 0.012 },
    { color: '#dfeaf2', w: 0.012 },
    { color: '#f6efe2', w: 0.012 },
    { color: '#eef3f8', w: 0.012 },
    { color: '#eef3f8', w: 0.012 },
    { dissolve: true, w: 0.014 },
  ];
  // Eases out at both ends with no visible start or stop: used for the slow camera moves.
  const smoother = (k) => k * k * k * (k * (k * 6 - 15) + 10);
  // How far along the road the truck is, for both the map and the distance readout.
  const indiaDrive = (k) => smoother(seg(k, 0.03, 0.97));
  // Beats inside the street scene (0 to 1).
  const BEAT = { droneEnd: 0.14, bikeEnd: 0.5, swapEnd: 0.62 };
  const DIST_BIKE = 420; const DIST_VAN = 980; // metres travelled

  const AIR_ROUTE = [
    { lat: 28.6, lon: 77.2, km: 2100, code: 'Delhi' }, { lat: 25.2, lon: 55.3, km: 4290, code: 'Dubai' },
    { lat: 51.5, lon: -0.5, km: 9770, code: 'London' }, { lat: 40.6, lon: -73.8, km: 15310, code: 'New York' },
  ];
  const onSphere = (lat, lon, r = 1) => {
    const phi = rad(lon + 180); const th = rad(90 - lat);
    return new T.Vector3(-Math.cos(phi) * Math.sin(th) * r, Math.cos(th) * r, Math.sin(phi) * Math.sin(th) * r);
  };
  function airAt(k) {
    const n = AIR_ROUTE.length - 1;
    const i = Math.min(n - 1, Math.floor(k * n));
    const f = k * n - i;
    const a = AIR_ROUTE[i]; const b = AIR_ROUTE[i + 1];
    const va = onSphere(a.lat, a.lon); const vb = onSphere(b.lat, b.lon);
    const d = Math.acos(clamp(va.dot(vb), -1, 1)) || 1e-5;
    const pos = va.clone().multiplyScalar(Math.sin((1 - f) * d)).add(vb.clone().multiplyScalar(Math.sin(f * d))).divideScalar(Math.sin(d));
    return { pos: pos.multiplyScalar(1 + Math.sin(f * Math.PI) * 0.07 + 0.012), km: lerp(a.km, b.km, f) };
  }

  // ---- assets ------------------------------------------------------------------
  const PH = 'https://dl.polyhaven.org/file/ph-assets/';
  const SKY_ID = 'kloofendal_48d_partly_cloudy_puresky';
  const EARTH_IMG = 'https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/';
  const pending = [];
  const track = (p) => { pending.push(p.catch(() => {})); return p; };
  const texLoader = new T.TextureLoader();
  texLoader.setCrossOrigin('anonymous');
  function tex(url, srgb, rx = 1, ry = 1) {
    const t = texLoader.load(url);
    if (srgb) t.encoding = T.sRGBEncoding;
    t.wrapS = T.RepeatWrapping;
    t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    return t;
  }
  // A Poly Haven material: colour, relief and roughness, repeated rx by ry times.
  function pbr(id, rx, ry, extra = {}) {
    const base = `${PH}Textures/jpg/1k/${id}/${id}`;
    return new T.MeshStandardMaterial({
      map: tex(`${base}_diff_1k.jpg`, true, rx, ry),
      normalMap: tex(`${base}_nor_gl_1k.jpg`, false, rx, ry),
      roughnessMap: tex(`${base}_rough_1k.jpg`, false, rx, ry),
      ...extra,
    });
  }
  const gltfCache = {};
  function gltf(url) {
    if (!T.GLTFLoader) return Promise.reject(new Error('no loader'));
    if (!gltfCache[url]) {
      gltfCache[url] = track(new Promise((res, rej) => {
        const l = new T.GLTFLoader();
        l.setCrossOrigin('anonymous');
        l.load(url, res, undefined, rej);
      }));
    }
    return gltfCache[url];
  }
  // Poly Haven keeps a model's textures and geometry in other folders, listed by its API.
  function phModel(id) {
    if (!gltfCache[id]) {
      gltfCache[id] = track(fetch(`https://api.polyhaven.com/files/${id}`).then((r) => r.json()).then((f) => new Promise((res, rej) => {
        const g = f.gltf['1k'].gltf;
        const mgr = new T.LoadingManager();
        mgr.setURLModifier((u) => { const hit = Object.keys(g.include).find((k) => u.endsWith(k)); return hit ? g.include[hit].url : u; });
        const l = new T.GLTFLoader(mgr);
        l.setCrossOrigin('anonymous');
        l.load(g.url, res, undefined, rej);
      })));
    }
    return gltfCache[id];
  }
  function applySky(scene, renderer, id, lightOnly = false) {
    if (!T.RGBELoader) return;
    track(new Promise((res, rej) => new T.RGBELoader().setDataType(T.HalfFloatType).load(`${PH}HDRIs/hdr/1k/${id}_1k.hdr`, (t) => {
      const pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(t).texture;
      t.mapping = T.EquirectangularReflectionMapping;
      if (!lightOnly) scene.background = t;
      pm.dispose();
      res();
    }, undefined, rej)));
  }
  function canvasTex(w, h, paint) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    paint(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  let softDot = null;
  function softDotTex() {
    if (!softDot) {
      softDot = canvasTex(128, 128, (c) => {
        const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.18, 'rgba(255,255,255,.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
      });
    }
    return softDot;
  }
  function glow(color, size, opacity = 1) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: softDotTex(), color, blending: T.AdditiveBlending, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false }));
    s.scale.set(size, size, 1);
    return s;
  }
  function label(text, height, color = '#FFFFFF', weight = 700) {
    const px = 64;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `${weight} ${px}px ${FONT}`;
    const w = Math.ceil(probe.measureText(text).width) + 36;
    const t = canvasTex(w, px + 36, (c) => {
      c.font = `${weight} ${px}px ${FONT}`;
      c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,.95)';
      c.shadowBlur = 14;
      c.fillStyle = color;
      c.fillText(text, 18, (px + 36) / 2 + 2);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    s.scale.set((height * w) / (px + 36), height, 1);
    return s;
  }

  // Real plants, rendered once from photo-scanned models and kept as images.
  let plantMeta = {};
  const plantMats = {};
  function plant(id, view, height) {
    const key = `${id}_${view}`;
    if (!plantMats[key]) plantMats[key] = new T.MeshBasicMaterial({ map: tex(`assets/journey/${key}.webp`, true), alphaTest: 0.5, side: T.DoubleSide, toneMapped: false });
    const meta = plantMeta[id] || { span: 10, h: 10 };
    const s = (height / meta.h) * meta.span;
    const g = new T.PlaneGeometry(s, s);
    g.translate(0, s / 2 - s * 0.02, 0);
    const m = new T.Mesh(g, plantMats[key]);
    m.userData.face = true;
    return m;
  }
  function groundShadow(size, opacity = 0.42) {
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: softDotTex(), color: '#000000', transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.17;
    return m;
  }

  // ---- physics -------------------------------------------------------------------
  // A damped spring: stiffness k, damping c. Follows a target with real overshoot.
  function spring(k, c) {
    return {
      x: 0, v: 0,
      step(target, dt) {
        const steps = Math.max(1, Math.ceil(dt / 0.008));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          this.v += (k * (target - this.x) - c * this.v) * h;
          this.x += this.v * h;
        }
        return this.x;
      },
    };
  }
  // Vehicle on suspension: measures speed and acceleration from the distance actually
  // travelled, so the nose lifts when pulling away and dives under braking.
  function suspension(pitchPerG, bumpScale) {
    const pitch = spring(70, 9);
    const heave = spring(120, 11);
    let last = null; let lastT = 0; let speed = 0;
    return {
      get speed() { return speed; },
      apply(obj, dist, t, baseY = 0) {
        if (last === null) { last = dist; lastT = t; }
        const dt = clamp(t - lastT, 0.001, 0.05);
        lastT = t;
        const v = clamp((dist - last) / dt, -60, 60);
        last = dist;
        const accel = clamp((v - speed) / dt, -12, 12);
        speed += (v - speed) * Math.min(1, dt * 6);
        const p = pitch.step(accel * pitchPerG, dt);
        const road = Math.min(1, Math.abs(speed) / 6) * bumpScale;
        const h = heave.step(Math.abs(accel) * -0.002 + (Math.sin(dist * 1.9) + Math.sin(dist * 4.3) * 0.5) * road, dt);
        const part = obj.userData.body || obj;
        part.rotation.z = clamp(p, -0.035, 0.035);
        part.position.y = baseY + Math.max(-0.03, h);
      },
    };
  }

  // ---- model helpers -----------------------------------------------------------
  const std = (color, roughness = 0.7, metalness = 0, extra = {}) => new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const shadow = (m, cast = true, receive = false) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  function box(w, h, d, mat, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return shadow(m);
  }
  // Box whose textures are repeated by real size instead of stretched.
  function wallBox(w, h, d, mat, tile = 3) {
    const g = new T.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      const sx = face < 2 ? d : w;
      const sy = face === 2 || face === 3 ? d : h;
      uv.setXY(i, (uv.getX(i) * sx) / tile, (uv.getY(i) * sy) / tile);
    }
    return shadow(new T.Mesh(g, mat), true, true);
  }
  function extrude(points, depth, mat, bevel = 0.02) {
    const shape = new T.Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    return shadow(new T.Mesh(g, mat));
  }
  function limb(a, b, r, mat) {
    const av = new T.Vector3(...a); const bv = new T.Vector3(...b);
    const m = new T.Mesh(new T.CylinderGeometry(r, r * 0.92, av.distanceTo(bv), 14), mat);
    m.position.copy(av).add(bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), bv.clone().sub(av).normalize());
    return shadow(m);
  }
  const tyreMat = std('#121215', 0.92);
  const rimMat = std('#a9acb0', 0.3, 0.85);
  const boltMat = std('#34363a', 0.45, 0.7);
  function wheel(r, w, x, y, z) {
    const g = new T.Group();
    const tyre = new T.Mesh(new T.CylinderGeometry(r, r, w, 32), tyreMat);
    tyre.rotation.x = Math.PI / 2;
    g.add(shadow(tyre));
    const rim = new T.Mesh(new T.CylinderGeometry(r * 0.6, r * 0.6, w * 1.03, 24), rimMat);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    for (let i = 0; i < 5; i++) { // bolts make the spin visible
      const a = (i / 5) * Math.PI * 2;
      const bolt = new T.Mesh(new T.CylinderGeometry(r * 0.07, r * 0.07, w * 1.08, 8), boltMat);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, 0);
      g.add(bolt);
    }
    g.position.set(x, y, z);
    g.userData.r = r;
    return g;
  }
  // A kraft box with tape across the top. Its origin is on its base.
  function makeParcel(size) {
    const g = new T.Group();
    const h = size * 0.8; const d = size * 0.9;
    g.add(rbox(size, h, d, size * 0.05, vinyl('#c8955a'), 0, h / 2, 0));
    g.add(box(size * 1.01, h * 1.012, d * 0.2, vinyl('#ead3a8'), 0, h / 2, 0));
    return g;
  }
  // ---- 3D icon vehicles: rounded, glossy, built here so they are solid from every angle ---
  const BRAND = { green: '#0d4a38', gold: '#ffb81c', cream: '#f6f1e4' };
  const lin = (c) => new T.Color(c).convertSRGBToLinear();
  const paint = (color, roughness = 0.26) => new T.MeshPhysicalMaterial({ color: lin(color), roughness, metalness: 0.04, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 0.55 });
  const vinyl = (color) => new T.MeshPhysicalMaterial({ color: lin(color), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.4 });
  const glassIcon = () => std('#101c26', 0.05, 0.85, { envMapIntensity: 2 });
  const rubber = std('#0e0f11', 0.82, 0, { envMapIntensity: 0.1 });
  const trimDark = std('#16181b', 0.6, 0.1, { envMapIntensity: 0.2 });
  const chrome = std('#c9ccd0', 0.22, 1, { envMapIntensity: 0.9 });
  // Extruded shapes come out faceted; averaging normals across soft edges makes them read as moulded.
  function smoothNormals(geo, crease = 0.6) {
    const pos = geo.attributes.position; const nor = geo.attributes.normal;
    const groups = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    const out = new Float32Array(nor.count * 3);
    const a = new T.Vector3(); const b = new T.Vector3();
    groups.forEach((ids) => ids.forEach((i) => {
      a.fromBufferAttribute(nor, i);
      const sum = new T.Vector3();
      ids.forEach((j) => { b.fromBufferAttribute(nor, j); if (a.dot(b) > crease) sum.add(b); });
      sum.normalize();
      out[i * 3] = sum.x; out[i * 3 + 1] = sum.y; out[i * 3 + 2] = sum.z;
    }));
    geo.setAttribute('normal', new T.BufferAttribute(out, 3));
    return geo;
  }
  // A closed outline with rounded corners. A point may carry its own radius as a third value.
  function roundedShape(pts, r) {
    const s = new T.Shape();
    const v = (p) => new T.Vector2(p[0], p[1]);
    pts.forEach((p, i) => {
      const here = v(p); const prev = v(pts[(i + pts.length - 1) % pts.length]); const next = v(pts[(i + 1) % pts.length]);
      const rad0 = p[2] === undefined ? r : p[2];
      const ra = Math.min(rad0, here.distanceTo(prev) * 0.48); const rb = Math.min(rad0, here.distanceTo(next) * 0.48);
      const inP = here.clone().add(prev.clone().sub(here).normalize().multiplyScalar(ra));
      const outP = here.clone().add(next.clone().sub(here).normalize().multiplyScalar(rb));
      if (i) s.lineTo(inP.x, inP.y); else s.moveTo(inP.x, inP.y);
      s.quadraticCurveTo(here.x, here.y, outP.x, outP.y);
    });
    s.closePath();
    return s;
  }
  // A side profile (x forward, y up) pushed out to the given width across z.
  function moulded(pts, width, mat, { r = 0.12, bevel = 0.05 } = {}) {
    const g = new T.ExtrudeGeometry(roundedShape(pts, r), { depth: Math.max(0.001, width - bevel * 2), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: 8 });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    smoothNormals(g);
    return shadow(new T.Mesh(g, mat));
  }
  function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0) {
    const m = moulded([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], d, mat, { r, bevel: Math.min(r, d * 0.3) });
    m.position.set(x, y, z);
    return m;
  }
  // Tube with round ends: arms, legs and struts.
  function capsule(a, b, r, mat) {
    const g = new T.Group();
    g.add(limb(a, b, r, mat));
    [a, b].forEach((p) => {
      const s = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat);
      s.position.set(...p);
      g.add(shadow(s));
    });
    return g;
  }
  function iconWheel(r, w, x, y, z, hub = BRAND.gold) {
    const g = new T.Group();
    const pts = [[0, -w / 2], [r * 0.78, -w / 2], [r * 0.96, -w * 0.42], [r, -w * 0.2], [r, w * 0.2], [r * 0.96, w * 0.42], [r * 0.78, w / 2], [0, w / 2]].map(([a, b]) => new T.Vector2(a, b));
    const tyre = new T.Mesh(new T.LatheGeometry(pts, 32), rubber);
    tyre.rotation.x = Math.PI / 2;
    g.add(shadow(tyre));
    const rim = new T.Mesh(new T.CylinderGeometry(r * 0.56, r * 0.56, w * 1.02, 24), chrome);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const cap = new T.Mesh(new T.CylinderGeometry(r * 0.2, r * 0.2, w * 1.06, 16), paint(hub));
    cap.rotation.x = Math.PI / 2;
    g.add(cap);
    for (let i = 0; i < 5; i++) { // slots make the spin visible
      const a = (i / 5) * Math.PI * 2;
      const slot = new T.Mesh(new T.CylinderGeometry(r * 0.08, r * 0.08, w * 1.05, 10), trimDark);
      slot.rotation.x = Math.PI / 2;
      slot.position.set(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, 0);
      g.add(slot);
    }
    g.position.set(x, y, z);
    g.userData.r = r;
    return g;
  }
  // Paint on a panel, on both flanks, in the given colour.
  function sideText(group, text, x, y, halfWidth, height, color, sub) {
    const t = canvasTex(1024, 320, (c, w, h) => {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = color;
      c.font = `800 ${sub ? 170 : 210}px ${FONT}`;
      c.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
      if (sub) {
        c.fillStyle = sub.color;
        c.font = `700 52px ${FONT}`;
        c.fillText(sub.text, w / 2, h * 0.82);
      }
    });
    [1, -1].forEach((side) => {
      const m = new T.Mesh(new T.PlaneGeometry(height * 3.2, height), new T.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(x, y, side * (halfWidth + 0.006));
      if (side < 0) m.rotation.y = Math.PI;
      group.add(m);
    });
  }
  function lamp(group, x, y, z, color, r = 0.1) {
    const m = new T.Mesh(new T.SphereGeometry(r, 14, 10), new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.2 }));
    m.scale.x = 0.45;
    m.position.set(x, y, z);
    group.add(m);
  }
  // Wraps a model with what the scenes drive: forward is +X, spin(dist) rolls the wheels.
  function rig(model, wheels, reverse = false) {
    const g = new T.Group();
    // Wheels and the ground shadow sit in a frame of their own, just clear of the road surface.
    const frame = new T.Group();
    frame.position.y = 0.012;
    if (reverse) frame.rotation.y = Math.PI;
    frame.add(model);
    wheels.forEach((w) => frame.add(w));
    model.children.filter((c) => c.userData.ground).forEach((c) => frame.add(c));
    g.add(frame);
    g.userData = { mixer: null, clipLen: 1, body: model, spin(dist) { wheels.forEach((w) => { w.rotation.z = -dist / w.userData.r; }); } };
    return g;
  }
  function contact(model, length, width) {
    const s = groundShadow(1, 0.55);
    s.scale.set(length * 1.25, width * 1.7, 1);
    s.position.y = 0.03;
    s.userData.ground = true;
    model.add(s);
  }
  function makeBike() {
    const m = new T.Group();
    const gold = paint(BRAND.gold);
    const wheels = [iconWheel(0.25, 0.1, 0.66, 0.25, 0, BRAND.green), iconWheel(0.25, 0.1, -0.64, 0.25, 0, BRAND.green)];
    m.add(moulded([[-0.92, 0.36], [-0.12, 0.34], [-0.02, 0.72], [-0.5, 0.86], [-0.94, 0.82]], 0.36, gold, { r: 0.12, bevel: 0.05 }));
    m.add(rbox(0.72, 0.1, 0.34, 0.04, trimDark, 0.14, 0.36, 0));
    m.add(moulded([[0.3, 0.33], [0.5, 0.31], [0.72, 1.06], [0.54, 1.12]], 0.38, gold, { r: 0.07, bevel: 0.05 }));
    m.add(moulded([[0.42, 0.42], [0.92, 0.42], [0.92, 0.52], [0.42, 0.56]], 0.2, gold, { r: 0.04, bevel: 0.03 }));
    m.add(rbox(0.68, 0.11, 0.3, 0.05, std('#1a1712', 0.6), -0.5, 0.9, 0));
    m.add(capsule([0.62, 1.12, -0.26], [0.62, 1.12, 0.26], 0.018, chrome));
    lamp(m, 0.74, 1.04, 0, '#fff3c4', 0.08);
    lamp(m, -0.95, 0.72, 0, '#d9321f', 0.05);
    // Top box carrying the company mark
    const box2 = rbox(0.52, 0.4, 0.5, 0.06, paint(BRAND.green), -0.74, 1.14, 0);
    m.add(box2);
    sideText(m, 'UT Log', -0.74, 1.14, 0.25, 0.14, BRAND.gold);
    // Rider: smooth vinyl figure, knees bent, hands on the bars
    const jacket = vinyl(BRAND.green); const trousers = vinyl('#1b2a33'); const glove = vinyl('#121416'); const shoe = vinyl('#e9e4d8');
    [-0.15, 0.15].forEach((z) => {
      m.add(capsule([-0.32, 0.98, z * 0.9], [0.14, 0.82, z], 0.082, trousers));
      m.add(capsule([0.14, 0.82, z], [0.2, 0.46, z], 0.066, trousers));
      m.add(capsule([0.14, 0.41, z], [0.32, 0.41, z], 0.052, shoe));
      m.add(capsule([-0.2, 1.46, z * 1.45], [0.16, 1.22, z * 1.75], 0.058, jacket));
      m.add(capsule([0.16, 1.22, z * 1.75], [0.56, 1.13, z * 1.65], 0.048, jacket));
      const hand = new T.Mesh(new T.SphereGeometry(0.056, 14, 10), glove);
      hand.position.set(0.6, 1.13, z * 1.65);
      m.add(shadow(hand));
    });
    const torso = new T.Mesh(new T.SphereGeometry(0.2, 22, 18), jacket);
    torso.scale.set(0.9, 1.55, 1.12);
    torso.position.set(-0.26, 1.24, 0);
    torso.rotation.z = -0.3;
    m.add(shadow(torso));
    const band = new T.Mesh(new T.CylinderGeometry(0.186, 0.2, 0.06, 20), paint(BRAND.gold));
    band.position.set(-0.27, 1.18, 0);
    band.rotation.z = -0.3;
    band.scale.set(0.92, 1, 1.14);
    m.add(band);
    const helmet = new T.Mesh(new T.SphereGeometry(0.168, 26, 20), paint(BRAND.cream, 0.18));
    helmet.position.set(-0.08, 1.72, 0);
    m.add(shadow(helmet));
    const visor = new T.Mesh(new T.SphereGeometry(0.158, 22, 16, -0.9, 1.8, 1.05, 0.72), glassIcon());
    visor.position.copy(helmet.position).add(new T.Vector3(0.018, 0, 0));
    visor.rotation.y = Math.PI;
    m.add(visor);
    m.add(capsule([-0.14, 1.5, 0], [-0.1, 1.6, 0], 0.06, vinyl('#6e452c')));
    contact(m, 1.9, 0.5);
    const g = rig(m, wheels);
    g.userData.rackY = 1.35;
    g.userData.rackX = -0.74;
    return g;
  }
  function iconCar(color) {
    const m = new T.Group();
    m.add(moulded([[-2.15, 0.34, 0.1], [2.15, 0.34, 0.1], [2.2, 0.82, 0.2], [0.95, 0.98, 0.2], [-1.9, 1.02, 0.2], [-2.2, 0.86, 0.15]], 1.8, paint(color), { r: 0.2, bevel: 0.1 }));
    m.add(moulded([[-1.6, 0.92], [1.0, 0.92], [0.28, 1.5, 0.24], [-1.08, 1.5, 0.24]], 1.56, glassIcon(), { r: 0.14, bevel: 0.1 }));
    m.add(moulded([[-1.14, 1.44], [0.34, 1.44], [0.24, 1.55], [-1.04, 1.55]], 1.5, paint(color), { r: 0.05, bevel: 0.05 }));
    m.add(rbox(0.08, 0.56, 1.58, 0.02, paint(color), -0.34, 1.2, 0));
    [-0.68, 0.68].forEach((z) => { lamp(m, 2.17, 0.74, z, '#fff3c4', 0.12); lamp(m, -2.19, 0.76, z, '#d9321f', 0.1); });
    const wheels = [1.35, -1.35].flatMap((x) => [-0.84, 0.84].map((z) => iconWheel(0.36, 0.24, x, 0.36, z)));
    contact(m, 4.3, 1.8);
    return { m, wheels };
  }
  function iconAuto(color) {
    const m = new T.Group();
    m.add(moulded([[-1.25, 0.38], [0.55, 0.32], [1.22, 0.42], [1.26, 0.82], [0.72, 1.05], [-1.25, 1.02]], 1.34, paint(color), { r: 0.16, bevel: 0.08 }));
    m.add(moulded([[-1.2, 1.0], [0.72, 1.0], [0.42, 1.78], [-1.2, 1.84]], 1.24, glassIcon(), { r: 0.1, bevel: 0.06 }));
    m.add(moulded([[-1.3, 1.78], [0.5, 1.72], [0.38, 1.94, 0.1], [-1.26, 1.96, 0.1]], 1.42, paint('#17181b', 0.45), { r: 0.08, bevel: 0.06 }));
    lamp(m, 1.24, 0.72, 0, '#fff3c4', 0.12);
    const wheels = [iconWheel(0.27, 0.16, 0.92, 0.27, 0), iconWheel(0.27, 0.16, -0.8, 0.27, 0.66), iconWheel(0.27, 0.16, -0.8, 0.27, -0.66)];
    contact(m, 2.6, 1.34);
    return { m, wheels };
  }
  function iconBus(color) {
    const m = new T.Group();
    m.add(moulded([[-4.2, 0.48], [4.2, 0.48], [4.26, 3.0, 0.3], [-4.2, 3.06, 0.3]], 2.4, paint(color), { r: 0.18, bevel: 0.08 }));
    const strip = moulded([[-3.9, 1.82], [4.26, 1.82], [4.28, 2.72], [-3.9, 2.72]], 2.43, glassIcon(), { r: 0.1, bevel: 0.03 });
    m.add(strip);
    for (let x = -3; x <= 3; x += 1.5) m.add(rbox(0.09, 0.92, 2.45, 0.02, paint(color), x, 2.27, 0));
    [-0.8, 0.8].forEach((z) => lamp(m, 4.26, 0.98, z, '#fff3c4', 0.14));
    const wheels = [2.6, -2.5].flatMap((x) => [-1.04, 1.04].map((z) => iconWheel(0.48, 0.32, x, 0.48, z)));
    contact(m, 8.4, 2.4);
    return { m, wheels };
  }
  function makeCar(color, kind = 'car', oncoming = false) {
    const { m, wheels } = kind === 'auto' ? iconAuto(color) : kind === 'bus' ? iconBus(color) : iconCar(color);
    return rig(m, wheels, oncoming);
  }
  // The company van.
  function makeVan(reverse = false) {
    const m = new T.Group();
    const white = paint(BRAND.cream);
    m.add(moulded([[-2.7, 0.42, 0.12], [2.66, 0.42, 0.14], [2.72, 1.06, 0.22], [2.02, 1.4, 0.26], [1.14, 2.4, 0.3], [-2.66, 2.44, 0.26]], 2.1, white, { r: 0.2, bevel: 0.1 }));
    m.add(moulded([[1.98, 1.44], [1.12, 2.36], [1.0, 2.26], [1.82, 1.42]], 1.82, glassIcon(), { r: 0.05, bevel: 0.02 }));
    m.add(moulded([[1.84, 1.46], [1.08, 2.24], [0.3, 2.24], [0.3, 1.46]], 2.13, glassIcon(), { r: 0.08, bevel: 0.01 }));
    m.add(moulded([[-2.72, 0.78], [2.7, 0.78], [2.7, 0.94], [-2.72, 0.94]], 2.12, paint(BRAND.gold), { r: 0.02, bevel: 0.01 }));
    m.add(moulded([[-2.72, 0.42], [2.66, 0.42], [2.7, 0.78], [-2.72, 0.78]], 2.115, paint(BRAND.green), { r: 0.08, bevel: 0.01 }));
    sideText(m, 'UT Log', -1.15, 1.62, 1.06, 0.92, BRAND.green);
    m.add(rbox(0.16, 0.26, 2.16, 0.05, trimDark, 2.68, 0.56, 0));
    m.add(rbox(0.14, 0.26, 2.16, 0.05, trimDark, -2.72, 0.56, 0));
    [-0.72, 0.72].forEach((z) => { lamp(m, 2.7, 1.1, z, '#fff3c4', 0.14); lamp(m, -2.72, 1.4, z, '#d9321f', 0.11); });
    m.add(capsule([1.02, 1.62, 1.1], [1.02, 1.7, 1.3], 0.03, trimDark));
    m.add(capsule([1.02, 1.62, -1.1], [1.02, 1.7, -1.3], 0.03, trimDark));
    const wheels = [1.72, -1.72].flatMap((x) => [-0.98, 0.98].map((z) => iconWheel(0.43, 0.27, x, 0.43, z)));
    contact(m, 5.4, 2.1);
    return rig(m, wheels, reverse);
  }
  // The long-haul truck: a cab and a branded box.
  function makeTruck(reverse = false) {
    const m = new T.Group();
    m.add(rbox(7.6, 0.28, 1.5, 0.06, trimDark, -0.1, 0.84, 0));
    m.add(moulded([[1.95, 0.78, 0.1], [3.96, 0.78, 0.16], [4.04, 1.72, 0.2], [3.72, 3.02, 0.26], [1.95, 3.12, 0.22]], 2.42, paint(BRAND.green), { r: 0.2, bevel: 0.1 }));
    m.add(moulded([[3.82, 1.92], [3.6, 2.92], [3.46, 2.86], [3.68, 1.9]], 2.14, glassIcon(), { r: 0.05, bevel: 0.02 }));
    m.add(moulded([[3.54, 1.94], [3.36, 2.84], [2.4, 2.84], [2.4, 1.94]], 2.45, glassIcon(), { r: 0.08, bevel: 0.01 }));
    m.add(moulded([[1.95, 1.3], [4.0, 1.3], [4.02, 1.44], [1.95, 1.44]], 2.44, paint(BRAND.gold), { r: 0.02, bevel: 0.01 }));
    m.add(rbox(0.2, 0.34, 2.46, 0.06, trimDark, 4.0, 0.92, 0));
    [-0.88, 0.88].forEach((z) => lamp(m, 4.05, 1.16, z, '#fff3c4', 0.16));
    m.add(rbox(5.8, 2.76, 2.5, 0.12, paint(BRAND.cream, 0.34), -1.08, 2.46, 0));
    m.add(moulded([[-3.98, 1.08], [1.82, 1.08], [1.82, 1.3], [-3.98, 1.3]], 2.53, paint(BRAND.gold), { r: 0.03, bevel: 0.01 }));
    sideText(m, 'UT Log', -1.08, 2.62, 1.25, 1.62, BRAND.green, { text: 'LOCAL · NATIONAL · INTERNATIONAL', color: '#b77a00' });
    m.add(rbox(5.4, 0.08, 2.1, 0.03, paint(BRAND.green), -1.08, 3.86, 0));
    m.add(rbox(1.5, 0.09, 2.1, 0.03, paint(BRAND.gold), -1.08, 3.87, 0));
    m.add(rbox(0.04, 2.3, 2.14, 0.01, std('#0c0d0f', 0.9, 0, { envMapIntensity: 0.1 }), -3.99, 2.5, 0));
    lamp(m, -3.98, 1.0, 0.9, '#d9321f', 0.12);
    lamp(m, -3.98, 1.0, -0.9, '#d9321f', 0.12);
    const wheels = [2.95, -1.5, -2.72].flatMap((x) => [-1.12, 1.12].map((z) => iconWheel(0.56, 0.38, x, 0.56, z)));
    contact(m, 8, 2.5);
    return rig(m, wheels, reverse);
  }
  // Cargo jet. Nose towards +X, wheels on the ground at y = 0.
  function makePlane(L) {
    const m = new T.Group();
    const R = L * 0.058; const cy = R * 1.55;
    const white = paint('#f3f2ec', 0.24);
    const green = paint(BRAND.green);
    const prof = [[0.001, -0.5], [0.16, -0.47], [0.42, -0.4], [0.78, -0.28], [1, -0.12], [1, 0.26], [0.96, 0.36], [0.78, 0.43], [0.46, 0.485], [0.001, 0.5]].map(([r, y]) => new T.Vector2(r * R, y * L));
    const body = new T.Mesh(new T.LatheGeometry(new T.SplineCurve(prof).getPoints(60), 36), white);
    body.geometry.computeVertexNormals();
    body.rotation.z = -Math.PI / 2;
    body.position.y = cy;
    m.add(shadow(body));
    const belly = new T.Mesh(new T.CylinderGeometry(R * 1.008, R * 1.008, L * 0.38, 36, 1, true, Math.PI * 0.7, Math.PI * 0.6), green);
    belly.rotation.z = -Math.PI / 2;
    belly.position.set(L * 0.07, cy, 0);
    m.add(belly);
    const flat = (pts, thick, mat, y) => {
      const geo = new T.ExtrudeGeometry(roundedShape(pts, L * 0.008), { depth: thick, bevelEnabled: true, bevelSize: thick * 0.4, bevelThickness: thick * 0.4, bevelSegments: 3, curveSegments: 4 });
      geo.rotateX(-Math.PI / 2);
      smoothNormals(geo);
      const w = shadow(new T.Mesh(geo, mat));
      w.position.y = y;
      return w;
    };
    const wing = [[L * 0.14, 0], [L * 0.02, L * 0.46], [-L * 0.05, L * 0.46], [-L * 0.09, 0], [-L * 0.05, -L * 0.46], [L * 0.02, -L * 0.46]];
    m.add(flat(wing, L * 0.012, white, cy - R * 0.42));
    const tail = [[-L * 0.37, 0], [-L * 0.46, L * 0.17], [-L * 0.49, L * 0.17], [-L * 0.46, 0], [-L * 0.49, -L * 0.17], [-L * 0.46, -L * 0.17]];
    m.add(flat(tail, L * 0.008, white, cy + R * 0.38));
    const fin = moulded([[-L * 0.34, 0], [-L * 0.47, 0], [-L * 0.52, L * 0.19], [-L * 0.45, L * 0.19]], L * 0.016, green, { r: L * 0.01, bevel: L * 0.004 });
    fin.position.y = cy + R * 0.72;
    m.add(fin);
    const mark = canvasTex(256, 256, (d) => {
      d.fillStyle = BRAND.gold; d.beginPath(); d.arc(128, 128, 122, 0, 7); d.fill();
      d.fillStyle = BRAND.green; d.font = `800 118px ${FONT}`; d.textAlign = 'center'; d.textBaseline = 'middle'; d.fillText('UT', 128, 136);
    });
    [1, -1].forEach((side) => {
      const logo = new T.Mesh(new T.CircleGeometry(L * 0.034, 32), new T.MeshStandardMaterial({ map: mark, roughness: 0.3 }));
      logo.position.set(-L * 0.455, cy + R * 0.72 + L * 0.09, side * L * 0.0092);
      if (side < 0) logo.rotation.y = Math.PI;
      m.add(logo);
    });
    sideText(m, 'UT Log', -L * 0.12, cy + R * 0.2, R * 1.03, R * 0.72, BRAND.green);
    // Window row and cockpit
    const windows = canvasTex(1024, 48, (c, w, h) => { c.fillStyle = '#17242e'; for (let x = 8; x < w; x += 42) { c.beginPath(); c.arc(x + 10, h / 2, 13, 0, 7); c.fill(); } });
    [1, -1].forEach((side) => {
      const row = new T.Mesh(new T.PlaneGeometry(L * 0.3, L * 0.014), new T.MeshStandardMaterial({ map: windows, transparent: true, roughness: 0.1 }));
      row.position.set(L * 0.18, cy + R * 0.42, side * R * 0.915);
      if (side < 0) row.rotation.y = Math.PI;
      row.rotation.x = -side * 0.42;
      m.add(row);
    });
    const cockpit = new T.Mesh(new T.SphereGeometry(R * 0.62, 22, 14), glassIcon());
    cockpit.scale.set(1.3, 0.48, 1.02);
    cockpit.position.set(L * 0.405, cy + R * 0.46, 0);
    m.add(cockpit);
    // Engines under the wing, gold intake rings
    [L * 0.2, -L * 0.2].forEach((z) => {
      const eng = new T.Group();
      const shell = new T.Mesh(new T.CylinderGeometry(R * 0.46, R * 0.38, L * 0.11, 26), paint(BRAND.green));
      shell.rotation.z = -Math.PI / 2;
      eng.add(shadow(shell));
      const ring = new T.Mesh(new T.TorusGeometry(R * 0.44, R * 0.05, 10, 26), paint(BRAND.gold));
      ring.rotation.y = Math.PI / 2;
      ring.position.x = L * 0.055;
      eng.add(ring);
      const fan = new T.Mesh(new T.CircleGeometry(R * 0.42, 22), std('#2a2c30', 0.4, 0.8));
      fan.rotation.y = Math.PI / 2;
      fan.position.x = L * 0.052;
      eng.add(fan);
      eng.position.set(L * 0.05, cy - R * 0.82, z);
      m.add(eng);
    });
    // Landing gear
    const wheels = [];
    [[L * 0.3, 0, 0.3], [-L * 0.04, R * 0.62, 0.42], [-L * 0.04, -R * 0.62, 0.42]].forEach(([x, z, f]) => {
      const r = R * f;
      m.add(limb([x, r, z], [x, cy - R * 0.6, z * 0.8], R * 0.05, chrome));
      wheels.push(iconWheel(r, R * 0.2, x, r, z));
    });
    const s = groundShadow(1, 0.5);
    s.scale.set(L * 1.05, L * 0.55, 1);
    s.position.y = 0.03;
    m.add(s);
    const g = rig(m, wheels);
    g.userData.door = new T.Vector3(L * 0.25, cy, R * 0.98);
    return g;
  }
  function makeDrone() {
    const m = new T.Group();
    m.add(rbox(0.72, 0.2, 0.62, 0.08, paint(BRAND.green), 0, 0, 0));
    m.add(rbox(0.46, 0.12, 0.42, 0.05, paint(BRAND.gold), 0, 0.14, 0));
    const lens = new T.Mesh(new T.SphereGeometry(0.09, 16, 12), glassIcon());
    lens.position.set(0.3, -0.13, 0);
    m.add(lens);
    const rotors = [];
    [[0.78, 0.68], [0.78, -0.68], [-0.78, 0.68], [-0.78, -0.68]].forEach(([x, z]) => {
      m.add(capsule([0, 0, 0], [x, 0.03, z], 0.032, trimDark));
      const motor = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.11, 16), chrome);
      motor.position.set(x, 0.08, z);
      m.add(motor);
      const disc = new T.Mesh(new T.CircleGeometry(0.46, 30), new T.MeshBasicMaterial({ color: '#10161b', transparent: true, opacity: 0.16, depthWrite: false, side: T.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.145, z);
      m.add(disc);
      const blade = rbox(0.92, 0.012, 0.07, 0.005, trimDark, 0, 0, 0);
      blade.position.set(x, 0.15, z);
      m.add(blade);
      rotors.push(blade);
    });
    m.scale.setScalar(1.15);
    const g = new T.Group();
    g.add(m);
    g.userData = { mixer: null, clipLen: 1, spin(t) { rotors.forEach((b, i) => { b.rotation.y = t * 38 * (i % 3 ? 1 : -1); }); } };
    return g;
  }

  // ---- city building ---------------------------------------------------------------
  const glassMat = () => std('#1b2630', 0.06, 0.92, { envMapIntensity: 1.5 });
  function makeBuilding(w, h, wallMat, r, opts = {}) {
    const g = new T.Group();
    const body = wallBox(w - 0.1, h, 8, wallMat, 3.2);
    body.position.set(0, h / 2, -4);
    g.add(body);
    const trim = std('#8f887b', 0.85);
    g.add(box(w, 0.32, 8.2, trim, 0, h + 0.16, -4));
    const shopH = opts.shop ? 4.1 : 1;
    const floors = Math.max(1, Math.floor((h - shopH - 0.6) / 3.2));
    const cols = Math.max(1, Math.floor((w - 1.6) / 2.9));
    const n = floors * cols;
    const frameGeo = new T.BoxGeometry(1.62, 1.92, 0.14);
    const glassGeo = new T.BoxGeometry(1.42, 1.72, 0.04);
    const sillGeo = new T.BoxGeometry(1.86, 0.1, 0.3);
    const frames = new T.InstancedMesh(frameGeo, std('#5f564a', 0.6), n);
    const panes = new T.InstancedMesh(glassGeo, glassMat(), n);
    const sills = new T.InstancedMesh(sillGeo, std('#b5ac9a', 0.75), n);
    const m = new T.Matrix4();
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * ((w - 1.2) / cols) - (w - 1.2) / 2;
        const y = shopH + f * 3.2 + 1.3;
        const i = f * cols + c;
        m.setPosition(x, y, 0.03); frames.setMatrixAt(i, m);
        m.setPosition(x, y, 0.09); panes.setMatrixAt(i, m);
        m.setPosition(x, y - 1.02, 0.12); sills.setMatrixAt(i, m);
      }
    }
    g.add(frames); g.add(panes); g.add(sills);
    for (let f = 1; f < floors; f++) g.add(shadow(box(w - 0.1, 0.1, 0.1, trim, 0, shopH + f * 3.2 - 0.3, 0.04), false));
    if (opts.shop) {
      const col = opts.shop;
      const open = r() < 0.7;
      const front = box(w - 0.5, 3.1, 0.2, open ? std('#141a1e', 0.05, 0.85, { emissive: '#3a2a14', emissiveIntensity: 0.9 }) : std('#6c6f72', 0.5, 0.6), 0, 1.65, 0.1);
      g.add(front);
      g.add(box(w - 0.3, 0.8, 0.16, std(col, 0.5), 0, 3.55, 0.18));
      if (opts.sign) {
        const t = canvasTex(1024, 180, (c, cw, ch) => {
          c.fillStyle = col; c.fillRect(0, 0, cw, ch);
          c.fillStyle = '#fff6e2'; c.font = `700 92px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(opts.sign, cw / 2, ch / 2 + 4);
        });
        const sign = new T.Mesh(new T.PlaneGeometry(w - 0.5, 0.72), new T.MeshStandardMaterial({ map: t, roughness: 0.5 }));
        sign.position.set(0, 3.55, 0.27);
        g.add(sign);
      }
      const awn = box(w - 0.5, 0.05, 1.2, std(col, 0.8), 0, 3.03, 0.72);
      awn.rotation.x = 0.28;
      g.add(awn);
    }
    if (r() < 0.55) {
      const tank = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 1.3, 18), std('#1d2020', 0.55));
      tank.position.set((r() - 0.5) * (w - 3), h + 0.95, -3);
      g.add(tank);
    }
    return g;
  }
  // Places copies of a real 3D model; on(obj, i) positions each one.
  function props(id, height, count, on) {
    phModel(id).then((m) => {
      const s = new T.Box3().setFromObject(m.scene).getSize(new T.Vector3());
      for (let i = 0; i < count; i++) {
        const c = m.scene.clone(true);
        c.scale.setScalar(height / s.y);
        c.traverse((o) => { o.castShadow = o.isMesh; o.receiveShadow = o.isMesh; });
        const h = new T.Group();
        h.add(c);
        on(h, i, c);
      }
    }).catch(() => {});
  }
  function recycler() {
    const items = [];
    return {
      add(obj, x, span) { items.push({ obj, x, span }); return obj; },
      update(dist) { items.forEach((it) => { it.obj.position.x = mod(it.x - dist + it.span / 2, it.span) - it.span / 2; }); },
    };
  }
  function ribbon(mat, w, d, y, z) {
    const m = new T.Mesh(new T.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, z);
    m.receiveShadow = true;
    return m;
  }
  function sunlight(scene, q, color, intensity, dir, span) {
    const s = new T.DirectionalLight(color, intensity);
    s.position.set(...dir);
    s.castShadow = true;
    s.shadow.mapSize.set(q.narrow ? 1024 : 2048, q.narrow ? 1024 : 2048);
    Object.assign(s.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 400 });
    s.shadow.bias = -0.0005;
    s.shadow.normalBias = 0.02;
    scene.add(s);
    scene.add(s.target);
    return s;
  }
  function faceCamera(list, camera) {
    list.forEach((m) => {
      const p = m.getWorldPosition(new T.Vector3());
      m.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    });
  }
  const collectFacing = (scene) => { const out = []; scene.traverse((o) => { if (o.userData.face) out.push(o); }); return out; };
  // Moves an object between two points in a lifted arc: how the parcel changes hands.
  const arcTo = (obj, a, b, k, lift) => { obj.position.lerpVectors(a, b, k); obj.position.y += Math.sin(k * Math.PI) * lift; };

  const SHOPS = ['Sri Balaji Stores', 'Kaveri Coffee', 'Nandi Mobiles', 'Lakshmi Textiles', 'Green Leaf Bakery', 'Metro Pharmacy', 'Anand Hardware', 'Royal Tailors', 'Hebbal Fresh', 'City Opticals'];

  // ---- scene 1: a tree-lined street. Drone, then bike, then van ---------------------
  function buildStreet(q) {
    const scene = new T.Scene();
    const haze = new T.Color('#c9d6e2');
    scene.background = haze;
    scene.fog = new T.Fog(haze, 60, 300);
    applySky(scene, q.renderer, 'kloofendal_48d_partly_cloudy_puresky');
    scene.add(new T.HemisphereLight('#dfe9f5', '#6f6556', 0.28));
    const sun = sunlight(scene, q, '#fff1dc', 2.3, [-18, 26, 20], 26);

    const roadMat = pbr('asphalt_02', 90, 3, { roughness: 1 });
    scene.add(ribbon(roadMat, 600, 11, 0, 0));
    const walkMat = pbr('brick_pavement', 300, 2, { roughness: 1 });
    scene.add(ribbon(walkMat, 600, 3.6, 0.15, -7.3));
    scene.add(ribbon(walkMat, 600, 4, 0.15, 7.5));
    const earthMat = pbr('leafy_grass', 120, 30, { roughness: 1, color: '#7f9a55' });
    scene.add(ribbon(earthMat, 900, 200, 0.02, 109.5));
    const kerb = std('#c9c4b6', 0.85);
    scene.add(shadow(box(600, 0.15, 0.22, kerb, 0, 0.075, -5.5), false, true));
    scene.add(shadow(box(600, 0.15, 0.22, kerb, 0, 0.075, 5.5), false, true));
    // Painted lane markings move with the road because they share its texture space.
    const dashes = new T.InstancedMesh(new T.PlaneGeometry(3, 0.14), new T.MeshStandardMaterial({ color: '#d9d6c9', roughness: 0.8 }), 50);
    const dm = new T.Matrix4();
    const dq = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
    for (let i = 0; i < 50; i++) { dm.compose(new T.Vector3(i * 8 - 200, 0.02, 0), dq, new T.Vector3(1, 1, 1)); dashes.setMatrixAt(i, dm); }
    dashes.receiveShadow = true;
    scene.add(dashes);

    const rec = recycler();
    const span = 220;
    const r = seeded(21);
    const walls = [pbr('clay_plaster', 1, 1, { color: '#e8dcc6' }), pbr('painted_plaster_wall', 1, 1, { color: '#dbd2c2' }), pbr('concrete_wall_008', 1, 1, { color: '#c7c2b6' }), pbr('red_brick', 1, 1, { color: '#b7a596' }), pbr('painted_plaster_wall', 1, 1, { color: '#d9b79c' }), pbr('clay_plaster', 1, 1, { color: '#bcc9c0' })];
    const shopCols = ['#7b2a1e', '#1d4a4f', '#3c3a35', '#5b4a2c', '#264b33', '#3a3f63'];
    let x = -span / 2; let n = 0;
    while (x < span / 2) {
      const w = Math.min(span / 2 - x + 0.1, 10 + r() * 7);
      const h = 10 + r() * 15;
      const b = makeBuilding(w, h, walls[Math.floor(r() * walls.length)], r, { shop: shopCols[Math.floor(r() * shopCols.length)], sign: SHOPS[n % SHOPS.length] });
      b.position.z = -9.2;
      scene.add(b);
      rec.add(b, x + w / 2, span);
      x += w; n++;
    }
    // far row for depth
    for (let i = 0; i < 14; i++) {
      const w = 14 + r() * 12; const h = 26 + r() * 30;
      const b = wallBox(w, h, 12, walls[i % walls.length], 6);
      b.castShadow = false;
      b.position.set(0, h / 2, -36 - r() * 26);
      scene.add(b);
      rec.add(b, -span / 2 + (i / 14) * span, span);
    }
    const treeIds = ['island_tree_02', 'tree_small_02', 'island_tree_01'];
    for (let i = 0; i < 12; i++) {
      const id = treeIds[i % 3];
      const holder = new T.Group();
      const t = plant(id, i % 2, 9 + (i % 3) * 2.2);
      holder.add(t);
      const sh = groundShadow(7, 0.42);
      holder.add(sh);
      holder.position.z = -6.6;
      scene.add(holder);
      rec.add(holder, -span / 2 + (i + 0.3) * (span / 12), span);
    }
    const lampMetal = std('#2b2e31', 0.55, 0.6, { envMapIntensity: 0.4 });
    for (let i = 0; i < 6; i++) {
      const h = new T.Group();
      h.add(limb([0, 0, -5.2], [0, 7.4, -5.2], 0.065, lampMetal));
      h.add(limb([0, 7.4, -5.2], [0, 7.75, -4], 0.04, lampMetal));
      h.add(box(0.26, 0.09, 0.6, lampMetal, 0, 7.72, -3.8));
      scene.add(h);
      rec.add(h, -span / 2 + (i + 0.72) * (span / 6), span);
    }
    const onWalk = (gap, off, z, rot) => (h, i, c) => {
      c.position.y = 0.15;
      c.rotation.y = rot;
      h.position.z = z;
      scene.add(h);
      rec.add(h, -span / 2 + off + i * gap, span);
    };
    props('metal_trash_can', 0.95, 7, onWalk(span / 7, 11, -5.9, 0));
    props('utility_box_01', 1.25, 4, onWalk(span / 4, 26, -8.6, 0));
    props('modular_street_seating', 0.85, 4, onWalk(span / 4, 42, -7.9, 0));
    props('fire_hydrant', 0.8, 3, onWalk(span / 3, 17, -5.95, 0.6));
    ['#c3c6c9', '#1f2a36', '#7c1f18', '#e8e6e0', '#30384a'].forEach((col, i) => {
      const car = makeCar(col);
      car.position.z = -4.45;
      scene.add(car);
      rec.add(car, -70 + i * 37, span);
    });
    const traffic = [
      { o: makeCar('#e8e6e0', 'car', true), z: 1.9, v: 10, x: 10 },
      { o: makeCar('#d8a800', 'auto', true), z: 2.2, v: 7, x: 70 },
      { o: makeCar('#b5412a', 'bus', true), z: 2, v: 8, x: 130 },
    ];
    traffic.forEach((c) => { c.o.position.z = c.z; scene.add(c.o); });

    const LANE = -2;
    const bike = makeBike();
    bike.position.z = LANE;
    scene.add(bike);
    const van = makeVan();
    van.position.z = LANE;
    scene.add(van);
    const bikeRide = suspension(0.012, 0.004);
    const vanRide = suspension(0.006, 0.006);
    const swing = spring(26, 1.4);
    let droneLastX = null; let droneV = 0; let droneT = 0;
    const drone = makeDrone();
    scene.add(drone);
    const cable = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 1, 6), std('#20201f', 0.6));
    scene.add(cable);
    const parcel = makeParcel(0.5);
    scene.add(parcel);
    const camera = new T.PerspectiveCamera(24, 1, 0.2, 6000);
    const facing = collectFacing(scene);
    const from = new T.Vector3(); const to = new T.Vector3(); const look = new T.Vector3();
    return {
      scene, camera, exposure: 0.6,
      update(k, t, fit) {
        const { droneEnd, bikeEnd, swapEnd } = BEAT;
        const dist = ease(seg(k, droneEnd, bikeEnd)) * DIST_BIKE + ease(seg(k, swapEnd, 1)) * (DIST_VAN - DIST_BIKE);
        roadMat.map.offset.x = (dist / 600) * 90;
        walkMat.map.offset.x = (dist / 600) * 300;
        earthMat.map.offset.x = (dist / 900) * 120;
        dashes.position.x = -mod(dist, 8);
        rec.update(dist);
        traffic.forEach((c) => {
          c.o.position.x = mod(c.x - dist - t * c.v * 1.6 + 150, 300) - 150;
          c.o.userData.spin(t * c.v * 1.6 + dist);
        });
        // Bike stops by the parked van and then falls behind as the van drives off.
        const bikeX = -Math.max(0, dist - DIST_BIKE);
        const vanX = 8.2;
        bike.position.x = bikeX;
        const bikeDist = Math.min(dist, DIST_BIKE);
        bikeRide.apply(bike, bikeDist, t);
        // A bike leans gently into small corrections as it rides.
        bike.rotation.x = Math.sin(bikeDist * 0.03) * 0.03 * Math.min(1, Math.abs(bikeRide.speed) / 5);
        bike.userData.spin(bikeDist);
        // Before the handover the van sits ahead on the road.
        van.position.x = vanX - Math.max(0, DIST_BIKE - dist) + 0;
        van.rotation.y = 0;
        const vanDist = Math.max(0, dist - DIST_BIKE);
        vanRide.apply(van, vanDist, t);
        van.userData.spin(vanDist);

        const rack = from.set(bike.position.x + bike.userData.rackX, bike.userData.rackY + bike.position.y + 0.02, bike.position.z);
        const low = ease(seg(k, 0.02, droneEnd * 0.72));
        const hover = rack.y + 1.55;
        const dy = lerp(16, hover, low);
        drone.position.set(rack.x + lerp(-9, 0, low), dy + Math.sin(t * 2) * 0.05, rack.z + lerp(-5, 0, low));
        drone.position.y += ease(seg(k, droneEnd * 0.82, droneEnd + 0.08)) * 22;
        drone.position.x += ease(seg(k, droneEnd * 0.82, droneEnd + 0.08)) * 18;
        drone.visible = k < droneEnd + 0.09;
        if (droneLastX === null) { droneLastX = drone.position.x; droneT = t; }
        const ddt = clamp(t - droneT, 0.001, 0.05);
        const dv = clamp((drone.position.x - droneLastX) / ddt, -14, 14);
        const dAccel = clamp((dv - droneV) / ddt, -10, 10);
        droneV += (dv - droneV) * Math.min(1, ddt * 5);
        droneLastX = drone.position.x; droneT = t;
        drone.rotation.z = clamp(-droneV * 0.035, -0.32, 0.32);
        const sway = swing.step(clamp(-dAccel * 0.03 - droneV * 0.012, -0.5, 0.5), ddt);
        drone.userData.spin(t);
        // Lowered on a cable, then unhooked.
        const lower = ease(seg(k, droneEnd * 0.72, droneEnd * 0.82));
        const swap = ease(seg(k, bikeEnd + 0.01, swapEnd - 0.01));
        to.set(van.position.x - 2.9, 1.0, van.position.z);
        if (k < droneEnd * 0.72) parcel.position.set(drone.position.x + Math.sin(sway) * 1.1, drone.position.y - Math.cos(sway) * 1.1, drone.position.z);
        else if (k < droneEnd * 0.82) parcel.position.set(rack.x, lerp(drone.position.y - 1.1, rack.y, lower), rack.z);
        else if (swap < 0.001) parcel.position.copy(rack);
        else arcTo(parcel, rack, to, swap, 0.9);
        parcel.visible = swap < 0.995;
        cable.visible = k < droneEnd * 0.84;
        const cableLen = Math.max(0.05, drone.position.y - parcel.position.y - 0.3);
        cable.scale.y = cableLen;
        cable.position.set((parcel.position.x + drone.position.x) / 2, parcel.position.y + 0.3 + cableLen / 2, parcel.position.z);
        cable.rotation.z = Math.atan2(drone.position.x - parcel.position.x, Math.max(0.05, drone.position.y - parcel.position.y));

        // Camera: wide for the drone, close on the rider, then back for the van.
        const onVan = ease(seg(k, bikeEnd - 0.02, swapEnd));
        const closeIn = ease(seg(k, 0, droneEnd));
        const backX = lerp(lerp(-19, -10, closeIn), -16, onVan) * fit;
        const up = lerp(lerp(4.2, 2.6, closeIn), 3.6, onVan) + Math.sin(t * 0.47) * 0.02;
        const out = lerp(lerp(24, 15.5, closeIn), 23, onVan) * fit;
        look.set(lerp(bike.position.x, van.position.x, onVan), lerp(lerp(3.6, 1, closeIn), 1.5, onVan), LANE);
        const rise = ease(seg(k, 0.88, 1));
        camera.position.set(look.x + backX + Math.sin(t * 0.33) * 0.05 + Math.sin(k * 7) * 0.5, up + rise * 52, look.z + out * (1 + rise * 0.7));
        camera.lookAt(look);
        sun.target.position.set(look.x, 0, look.z);
        sun.position.set(look.x - 18, 26, look.z + 20);
        faceCamera(facing, camera);
      },
    };
  }

  // ---- scene 2: the Bengaluru hub, at full size. The van hands the parcel to the truck ----
  function buildDepot(q) {
    const scene = new T.Scene();
    const haze = new T.Color('#c9d6df');
    scene.background = haze;
    scene.fog = new T.Fog(haze, 90, 520);
    applySky(scene, q.renderer, SKY_ID);
    scene.add(new T.HemisphereLight('#e6edf5', '#5c5346', 0.3));
    const sun = sunlight(scene, q, '#fff0d8', 2.3, [-24, 26, 26], 34);
    const yard = ribbon(pbr('asphalt_04', 120, 40, { roughness: 1, color: '#b9b6ae' }), 900, 300, 0, 0);
    scene.add(yard);
    const line = new T.MeshStandardMaterial({ color: lin('#e4e0d2'), roughness: 0.8 });
    const gold = new T.MeshStandardMaterial({ color: lin(BRAND.gold), roughness: 0.7 });
    for (let x = -60; x <= 60; x += 14) { const bay = ribbon(gold, 0.16, 9, 0.012, -7.5); bay.position.x = x; scene.add(bay); }
    const lane = ribbon(line, 900, 0.16, 0.012, 4.6);
    scene.add(lane);

    // The warehouse: long concrete shed, dock doors, canopy and the company sign.
    const wall = pbr('concrete_wall_008', 1, 1, { color: '#cfcac0' });
    const shed = wallBox(170, 13, 34, wall, 6);
    shed.position.set(0, 6.5, -29);
    scene.add(shed);
    scene.add(box(174, 0.8, 37, std('#5b6066', 0.5, 0.5), 0, 13.4, -29));
    scene.add(box(170, 1.1, 0.5, paint(BRAND.green), 0, 11.6, -11.85));
    scene.add(box(170, 0.3, 6, std('#6c7075', 0.5, 0.6), 0, 7.2, -9.2));
    const shutter = canvasTex(128, 256, (c, w, h) => {
      c.fillStyle = '#aeb2b4';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(30,34,38,.34)';
      for (let y = 0; y < h; y += 10) c.fillRect(0, y, w, 2);
    });
    for (let x = -77; x <= 77; x += 14) {
      const door = new T.Mesh(new T.PlaneGeometry(8, 6), new T.MeshStandardMaterial({ map: shutter, roughness: 0.55, metalness: 0.3 }));
      door.position.set(x, 3, -11.9);
      scene.add(door);
      scene.add(box(8.5, 0.3, 0.3, trimDark, x, 6.1, -11.85));
      [-4.1, 4.1].forEach((d) => scene.add(box(0.26, 6, 0.3, trimDark, x + d, 3, -11.85)));
      scene.add(box(0.7, 1, 0.5, std('#1b1c1e', 0.85), x - 3.2, 0.5, -11.7));
      scene.add(box(0.7, 1, 0.5, std('#1b1c1e', 0.85), x + 3.2, 0.5, -11.7));
    }
    const sign = new T.Mesh(new T.PlaneGeometry(26, 3.4), new T.MeshStandardMaterial({
      roughness: 0.4,
      map: canvasTex(1024, 134, (c, w, h) => {
        c.fillStyle = BRAND.green;
        c.fillRect(0, 0, w, h);
        c.textBaseline = 'middle';
        c.textAlign = 'center';
        c.fillStyle = '#ffffff';
        c.font = `800 74px ${FONT}`;
        c.fillText('UT Log  ·  Bengaluru Hub', w / 2, h / 2 + 3);
      }),
    }));
    sign.position.set(2, 9.6, -11.8);
    scene.add(sign);
    // Trees past both ends of the shed and a row of lamp posts along the lane
    const ids = ['island_tree_02', 'tree_small_02', 'island_tree_01'];
    for (let i = 0; i < 16; i++) {
      const h = new T.Group();
      h.add(plant(ids[i % 3], i % 2, 9 + (i % 4) * 2));
      h.add(groundShadow(7, 0.35));
      h.position.set((i % 2 ? 1 : -1) * (96 + i * 9), 0, -22 + (i % 5) * 9);
      scene.add(h);
    }
    const postMat = std('#2b2e31', 0.55, 0.6, { envMapIntensity: 0.4 });
    for (let x = -112; x <= 112; x += 32) {
      scene.add(limb([x, 0, -7.2], [x, 6.6, -7.2], 0.07, postMat));
      scene.add(limb([x, 6.6, -7.2], [x, 7, -6], 0.045, postMat));
      scene.add(box(0.3, 0.1, 0.65, postMat, x, 6.98, -5.8));
    }

    const truck = makeTruck();
    truck.position.set(0, 0, -3);
    scene.add(truck);
    const truckRide = suspension(0.0035, 0.006);
    const van = makeVan();
    van.position.z = 1.3;
    scene.add(van);
    const vanRide = suspension(0.006, 0.006);
    const parcel = makeParcel(0.6);
    scene.add(parcel);
    const start = new T.Vector3(-6.4, 1.15, 0.15);
    const rear = new T.Vector3(-3.9, 1.65, -3);
    const belt = makeBelt(scene, start, rear);
    const camera = new T.PerspectiveCamera(30, 1, 0.3, 3000);
    const facing = collectFacing(scene);
    const look = new T.Vector3();
    return {
      scene, camera, exposure: 0.6,
      update(k, t, fit) {
        // The van rolls in and stops alongside the truck's tail.
        const vanX = lerp(-70, -7.4, smoother(seg(k, 0, 0.26)));
        van.position.x = vanX;
        vanRide.apply(van, vanX, t);
        van.userData.spin(vanX);
        const reach = smoother(seg(k, 0.25, 0.31)) * (1 - smoother(seg(k, 0.55, 0.6)));
        belt.scale.y = Math.max(0.001, reach);
        belt.visible = reach > 0.002;
        const load = smoother(seg(k, 0.31, 0.56));
        parcel.position.lerpVectors(start, rear, load);
        parcel.visible = k > 0.3 && load < 0.995;
        // Then the truck pulls away, gently at first.
        const go = seg(k, 0.6, 1);
        const tx = go * go * 110;
        truck.position.x = tx;
        truckRide.apply(truck, tx, t, 0);
        truck.userData.spin(tx);
        // Comes down out of the sky, holds on the handover, rises again following the truck.
        const descend = 1 - smoother(seg(k, 0, 0.24));
        const leave = smoother(seg(k, 0.6, 0.74));
        const climb = smoother(seg(k, 0.78, 1));
        const side = q.narrow ? 0 : 3;
        look.set(lerp(lerp(vanX, -4.5, smoother(seg(k, 0.12, 0.28))), tx, leave) + side, 3, lerp(0, -3, leave));
        const back = 40 * fit;
        camera.position.set(look.x - 15 - descend * 6, 5.4 + descend * 36 + climb * 74 + Math.sin(t * 0.3) * 0.02, look.z + back * (1 + descend * 0.5 + climb * 0.8));
        camera.lookAt(look);
        sun.target.position.copy(look);
        sun.position.set(look.x - 24, 26, look.z + 26);
        faceCamera(facing, camera);
      },
    };
  }

  // ---- scene 3: across India, seen from high up like a satellite flight. NASA imagery on real
  // terrain, the country outlined, and a small truck driving the real Bengaluru to Delhi road.
  const MAP_LAT = 22; const MAP_LON = 80;
  const MAP_BOX = { west: 60, east: 105, south: 2, north: 40 };
  const onMap = (lat, lon, y = 0) => new T.Vector3((lon - MAP_LON) * 0.927, y, -(lat - MAP_LAT));
  const HEIGHT_SCALE = 2.3; // real relief, exaggerated so it reads from this high up
  function cloudTex() {
    const size = 512;
    const r = seeded(77);
    const grid = (n) => { const g = []; for (let i = 0; i < n * n; i++) g.push(r()); return g; };
    const layers = [8, 16, 32, 64].map((n) => ({ n, g: grid(n) }));
    return canvasTex(size, size, (c) => {
      const img = c.createImageData(size, size);
      const fade = (a) => a * a * (3 - 2 * a);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let v = 0; let amp = 0.5;
          layers.forEach(({ n, g }) => {
            const fx = (x / size) * n; const fy = (y / size) * n;
            const x0 = Math.floor(fx); const y0 = Math.floor(fy);
            const tx = fade(fx - x0); const ty = fade(fy - y0);
            const at = (a, b) => g[((b + n) % n) * n + ((a + n) % n)];
            v += amp * lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
            amp *= 0.5;
          });
          const i = (y * size + x) * 4;
          img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
          const dx = Math.abs(x / size - 0.5) * 2; const dy = Math.abs(y / size - 0.5) * 2;
          const edge = (1 - fade(clamp((dx - 0.5) / 0.45))) * (1 - fade(clamp((dy - 0.5) / 0.45)));
          img.data[i + 3] = 255 * clamp((v - 0.56) / 0.26) * edge;
        }
      }
      c.putImageData(img, 0, 0);
    });
  }
  function buildIndia(q) {
    const scene = new T.Scene();
    const space = new T.Color('#06121e');
    scene.background = space;
    scene.fog = new T.Fog(space, 130, 280);
    applySky(scene, q.renderer, 'qwantani_dusk_2_puresky', true);
    scene.add(new T.HemisphereLight('#ffffff', '#40505a', 0.85));
    // Low sun from the north-west, so the relief throws real light and shade.
    const sun = new T.DirectionalLight('#fff4e4', 2);
    sun.position.set(-30, 26, -22);
    scene.add(sun);

    const { west, east, south, north } = MAP_BOX;
    const mapW = (east - west) * 0.927; const mapD = north - south;
    const cells = q.narrow ? 240 : 360;
    const geo = new T.PlaneGeometry(mapW, mapD, cells, Math.round((cells * mapD) / mapW));
    geo.rotateX(-Math.PI / 2);
    const mid = onMap((north + south) / 2, (east + west) / 2);
    geo.translate(mid.x, 0, mid.z);
    const landTex = canvasTex(4, 4, (c) => { c.fillStyle = '#0b2433'; c.fillRect(0, 0, 4, 4); });
    const landMat = new T.MeshStandardMaterial({ map: landTex, roughness: 1, envMapIntensity: 0 });
    const land = new T.Mesh(geo, landMat);
    scene.add(land);

    // Satellite picture: neighbours dimmed, India outlined, edges melting into the dark.
    const rings = window.UT_INDIA || [];
    const sat = new Image();
    track(new Promise((res) => {
      sat.onload = () => {
        const W = sat.naturalWidth; const H = sat.naturalHeight;
        const t = canvasTex(W, H, (c) => {
          c.drawImage(sat, 0, 0, W, H);
          const px = (lat, lon) => [((lon - west) / (east - west)) * W, ((north - lat) / (north - south)) * H];
          const trace = () => {
            c.beginPath();
            rings.forEach((ring) => { ring.forEach(([la, lo], i) => { const [x, y] = px(la, lo); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); });
          };
          c.save();
          trace();
          c.rect(0, 0, W, H);
          c.fillStyle = 'rgba(6,18,30,.5)';
          c.fill('evenodd');
          c.restore();
          trace();
          c.lineJoin = 'round';
          c.shadowColor = 'rgba(255,190,80,.8)';
          c.shadowBlur = 14;
          c.strokeStyle = 'rgba(255,214,140,.85)';
          c.lineWidth = 2.6;
          c.stroke();
          c.shadowBlur = 0;
          [[0, 0, 240, 0], [W, 0, W - 240, 0], [0, 0, 0, 240], [0, H, 0, H - 240]].forEach(([x0, y0, x1, y1]) => {
            const g = c.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, 'rgba(6,18,30,1)');
            g.addColorStop(1, 'rgba(6,18,30,0)');
            c.fillStyle = g;
            c.fillRect(0, 0, W, H);
          });
        });
        t.anisotropy = q.renderer.capabilities.getMaxAnisotropy();
        landMat.map = t;
        landMat.needsUpdate = true;
        res();
      };
      sat.onerror = res;
      sat.src = 'assets/journey/india-sat.jpg';
    }));

    const clouds = new T.Mesh(new T.PlaneGeometry(mapW, mapD), new T.MeshBasicMaterial({ map: cloudTex(), transparent: true, opacity: 0.62, depthWrite: false, fog: false, toneMapped: false }));
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.set(mid.x, 3.1, mid.z);
    scene.add(clouds);

    // The road follows the ground, so it is laid once the height data has arrived.
    const route = (window.UT_ROUTES && window.UT_ROUTES.india && window.UT_ROUTES.india.pts) || [[12.97, 77.59], [28.61, 77.2]];
    const curve = new T.CatmullRomCurve3(route.map(([la, lo]) => onMap(la, lo)));
    curve.arcLengthDivisions = 1600;
    const pathPts = curve.getSpacedPoints(900);
    let lit = null;
    let heightAt = () => 0;
    const relief = new Image();
    track(new Promise((res) => {
      relief.onload = () => {
        const w = relief.naturalWidth; const h = relief.naturalHeight;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const c = cv.getContext('2d');
        c.drawImage(relief, 0, 0);
        const data = c.getImageData(0, 0, w, h).data;
        const value = (x, y) => data[(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4] / 255;
        heightAt = (wx, wz) => {
          const fx = ((wx - mid.x) / mapW + 0.5) * (w - 1); const fy = ((wz - mid.z) / mapD + 0.5) * (h - 1);
          const x0 = Math.floor(fx); const y0 = Math.floor(fy);
          const ax = fx - x0; const ay = fy - y0;
          return HEIGHT_SCALE * lerp(lerp(value(x0, y0), value(x0 + 1, y0), ax), lerp(value(x0, y0 + 1), value(x0 + 1, y0 + 1), ax), ay);
        };
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        const laid = pathPts.map((p) => new T.Vector3(p.x, heightAt(p.x, p.z) + 0.05, p.z));
        const line = new T.CatmullRomCurve3(laid);
        scene.add(new T.Mesh(new T.TubeGeometry(line, 900, 0.02, 5, false), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false })));
        lit = new T.TubeGeometry(line, 900, 0.034, 6, false);
        scene.add(new T.Mesh(lit, new T.MeshBasicMaterial({ color: '#ffc23d', toneMapped: false })));
        res();
      };
      relief.onerror = res;
      relief.src = 'assets/journey/india-height.png';
    }));

    // Cities: a small point of light and a name that stays the same size on screen.
    const CITIES = [['Bengaluru', 12.97, 77.59, true], ['Hyderabad', 17.39, 78.49, true], ['Nagpur', 21.15, 79.09, true], ['Delhi', 28.61, 77.21, true], ['Mumbai', 19.08, 72.88], ['Chennai', 13.08, 80.27], ['Kolkata', 22.57, 88.36], ['Ahmedabad', 23.02, 72.57], ['Guwahati', 26.14, 91.74], ['Jaipur', 26.91, 75.79]];
    const cities = CITIES.map(([name, la, lo, onRoute]) => {
      const at = onMap(la, lo);
      const dot = glow(onRoute ? '#ffd27a' : '#ffffff', 1, onRoute ? 0.95 : 0.6);
      scene.add(dot);
      const tag = label(name, 1, onRoute ? '#ffffff' : '#cfd9e0', onRoute ? 800 : 500);
      scene.add(tag);
      return { at, dot, tag, aspect: tag.scale.x, big: onRoute ? 1 : 0.8 };
    });

    // The truck, kept small against the country. A soft beacon marks it from far out.
    const truck = makeTruck();
    truck.scale.setScalar(0.1);
    scene.add(truck);
    const beacon = glow('#ffcf6a', 1, 0.75);
    scene.add(beacon);
    const glide = pathPts.map((_, i) => {
      const from = Math.max(0, i - 10); const to = Math.min(pathPts.length - 1, i + 10);
      const sum = new T.Vector3();
      for (let n = from; n <= to; n++) sum.add(pathPts[n]);
      return sum.divideScalar(to - from + 1);
    });
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 1200);
    const here = new T.Vector3(); const tan = new T.Vector3(); const look = new T.Vector3();
    const centre = onMap(22.5, 82.6);
    return {
      scene, camera, exposure: 0.95,
      update(k, t, fit) {
        const u = indiaDrive(k);
        const f = u * (glide.length - 1);
        const i = Math.min(glide.length - 2, Math.floor(f));
        here.copy(glide[i]).lerp(glide[i + 1], f - i);
        tan.copy(glide[Math.min(glide.length - 1, i + 26)]).sub(glide[Math.max(0, i - 26)]).setY(0).normalize();
        const ground = heightAt(here.x, here.z);
        truck.position.set(here.x, ground + 0.09, here.z);
        truck.rotation.y = Math.atan2(-tan.z, tan.x);
        truck.userData.spin(u * 1200);
        if (lit) lit.setDrawRange(0, Math.floor((lit.index.count * u) / 3) * 3);
        // One unbroken flight: low over Bengaluru, up over the country, low into Delhi.
        const out = smoother(seg(k, 0, 0.36)) * (1 - smoother(seg(k, 0.64, 1)));
        const dist = lerp(14, q.narrow ? 56 : 50, out) * fit;
        look.copy(here).lerp(centre, out * 0.95);
        look.y = lerp(ground, 0.3, out);
        const yaw = lerp(-0.22, 0.04, out) + Math.sin(t * 0.1) * 0.006;
        const tilt = lerp(0.6, 0.96, out);
        camera.position.set(look.x + Math.sin(yaw) * Math.cos(tilt) * dist, look.y + Math.sin(tilt) * dist, look.z + Math.cos(yaw) * Math.cos(tilt) * dist);
        camera.lookAt(look);
        beacon.position.set(here.x, ground + 0.3, here.z);
        beacon.scale.setScalar(dist * (0.05 + Math.sin(t * 3) * 0.006));
        cities.forEach((c) => {
          const y = heightAt(c.at.x, c.at.z);
          c.dot.position.set(c.at.x, y + 0.08, c.at.z);
          c.dot.scale.setScalar(dist * 0.016);
          const h = dist * 0.023 * c.big * (q.narrow ? 1.25 : 1);
          c.tag.scale.set(h * c.aspect, h, 1);
          c.tag.position.set(c.at.x, y + h * 0.9, c.at.z);
        });
        clouds.position.x = mid.x + Math.sin(t * 0.02) * 1.2;
        // Clouds thin out as the camera comes low, so they never block the road.
        clouds.material.opacity = lerp(0.12, 0.42, out);
      },
    };
  }

  // ---- scenes 4 and 6: the airports. Same apron, different sign over the terminal --------
  function airportSet(q, sign) {
    const scene = new T.Scene();
    const haze = new T.Color('#d3b79e');
    scene.background = haze;
    scene.fog = new T.Fog(haze, 150, 1800);
    applySky(scene, q.renderer, 'qwantani_dusk_2_puresky');
    scene.add(new T.HemisphereLight('#d9c4b4', '#4a3c30', 0.32));
    const sun = sunlight(scene, q, '#ffc48f', 2.2, [-40, 22, 44], 42);
    const concrete = pbr('asphalt_04', 500, 90, { roughness: 1, color: '#c8c6c0' });
    const apron = ribbon(concrete, 6000, 400, 0, 0);
    apron.position.x = 2000;
    scene.add(apron);
    const grass = pbr('aerial_grass_rock', 200, 40, { roughness: 1, color: '#8f9c62' });
    [-710, 710].forEach((z) => { const g = ribbon(grass, 8000, 1000, -0.02, z); g.position.x = 2000; scene.add(g); });
    const paint = new T.MeshStandardMaterial({ color: '#e6e4da', roughness: 0.75 });
    const yellow = new T.MeshStandardMaterial({ color: '#d7a21d', roughness: 0.75 });
    for (let x = -150; x < 3400; x += 58) { const d = ribbon(paint, 30, 0.8, 0.02, 0); d.position.x = x; scene.add(d); }
    [-22, 22].forEach((z) => { const l = ribbon(paint, 6000, 0.5, 0.02, z); l.position.x = 2000; scene.add(l); });
    const taxi = ribbon(yellow, 90, 0.3, 0.025, 15);
    taxi.position.x = -20;
    scene.add(taxi);
    // terminal and hangars with real concrete and glass
    const wall = pbr('concrete_wall_008', 1, 1, { color: '#b9b5ab' });
    const term = wallBox(280, 22, 30, wall, 6);
    term.position.set(0, 11, -120);
    scene.add(term);
    const glassBand = box(274, 8, 0.2, std('#1b2a35', 0.05, 0.95, { envMapIntensity: 1.6 }), 0, 13, -104.8);
    glassBand.castShadow = false;
    scene.add(glassBand);
    const roof = box(286, 1.4, 34, std('#7d7f80', 0.5, 0.6), 0, 22.7, -120);
    scene.add(roof);
    for (let i = 0; i < 26; i++) {
      const h = new T.Group();
      h.add(plant(['island_tree_02', 'tree_small_02', 'island_tree_01'][i % 3], i % 2, 10 + (i % 4) * 2));
      h.position.set(-300 + i * 130, 0, -190 - (i * 17) % 60);
      scene.add(h);
    }
    const name = label(sign, q.narrow ? 7 : 6);
    name.position.set(q.narrow ? 0 : 8, 28, -103);
    scene.add(name);
    return { scene, sun };
  }
  // A thin belt between two points that grows out from its middle.
  function makeBelt(scene, a, b) {
    const belt = limb(a.toArray(), b.toArray(), 0.09, std('#17181a', 0.9, 0, { envMapIntensity: 0.2 }));
    belt.position.y -= 0.2;
    scene.add(belt);
    return belt;
  }
  // The truck from the road rolls up to the jet from the map; the parcel rides a belt aboard.
  function buildAirport(q) {
    const { scene, sun } = airportSet(q, 'Delhi Air Cargo');
    const plane = makePlane(34);
    scene.add(plane);
    const truck = makeTruck(true);
    scene.add(truck);
    const truckRide = suspension(0.0035, 0.006);
    const parcel = makeParcel(0.7);
    scene.add(parcel);
    const camera = new T.PerspectiveCamera(34, 1, 0.5, 8000);
    const facing = collectFacing(scene);
    const start = new T.Vector3(); const from = new T.Vector3(); const to = new T.Vector3(); const look = new T.Vector3();
    const door = plane.userData.door;
    const park = door.x - 3;
    start.set(park + 4.1, 1.5, door.z + 9.2);
    const belt = makeBelt(scene, start, door);
    return {
      scene, camera, exposure: 0.56,
      update(k, t, fit) {
        const travelled = 80 * smoother(seg(k, 0, 0.18));
        truck.position.x = park + 80 - travelled;
        truck.position.z = door.z + 9.4;
        truckRide.apply(truck, travelled, t);
        truck.userData.spin(travelled);
        const reach = ease(seg(k, 0.16, 0.21)) * (1 - ease(seg(k, 0.4, 0.44)));
        belt.scale.y = Math.max(0.001, reach);
        belt.visible = reach > 0.002;
        const load = ease(seg(k, 0.21, 0.4));
        parcel.position.lerpVectors(start, door, load);
        parcel.visible = k > 0.2 && load < 0.995;
        const roll = seg(k, 0.44, 1);
        const px = roll * roll * 1300;
        const lift = ease(seg(k, 0.7, 1));
        plane.position.set(px, lift * 200, 0);
        plane.rotation.z = lift * 0.2 + ease(seg(k, 0.62, 0.72)) * 0.05;
        plane.userData.spin(px);
        const wide = ease(seg(k, 0.4, 0.56));
        from.set(px - 6, 5, door.z + 56 * fit);
        to.set(px - lerp(10, 60, lift), lerp(3, 40, lift), lerp(58, 110, lift) * fit);
        camera.position.lerpVectors(from, to, wide);
        look.set(px + (q.narrow ? 0 : 6), 3.4, 0).lerp(to.set(px, plane.position.y + 4, 0), wide);
        camera.lookAt(look);
        sun.target.position.set(lerp(door.x, px, wide), 0, 0);
        sun.position.set(sun.target.position.x - 40, 22, 44);
        faceCamera(facing, camera);
      },
    };
  }
  // Abroad: the jet lands and stops, the parcel rides down to a UT Log van, and the van leaves.
  function buildArrival(q) {
    const { scene, sun } = airportSet(q, 'New York Air Cargo');
    const plane = makePlane(34);
    scene.add(plane);
    const van = makeVan();
    scene.add(van);
    const vanRide = suspension(0.006, 0.006);
    const parcel = makeParcel(0.7);
    scene.add(parcel);
    const camera = new T.PerspectiveCamera(34, 1, 0.5, 8000);
    const facing = collectFacing(scene);
    const look = new T.Vector3(); const rear = new T.Vector3();
    const door = plane.userData.door;
    const park = door.x + 2.6;
    rear.set(park - 2.8, 1.25, door.z + 8);
    const belt = makeBelt(scene, door, rear);
    return {
      scene, camera, exposure: 0.56,
      update(k, t, fit) {
        const land = seg(k, 0, 0.4);
        const slowing = 1 - (1 - land) * (1 - land);
        const px = lerp(-460, 0, slowing);
        plane.position.set(px, 70 * Math.pow(1 - seg(land, 0, 0.4), 2), 0);
        plane.rotation.z = 0.12 * (1 - seg(land, 0.25, 0.55));
        plane.userData.spin(px);
        const reach = ease(seg(k, 0.4, 0.45)) * (1 - ease(seg(k, 0.64, 0.68)));
        belt.scale.y = Math.max(0.001, reach);
        belt.visible = reach > 0.002;
        const unload = ease(seg(k, 0.45, 0.64));
        parcel.position.lerpVectors(door, rear, unload);
        parcel.visible = k > 0.44 && unload < 0.995;
        const go = seg(k, 0.68, 1);
        const travelled = go * go * 110;
        van.position.set(park + travelled, 0, door.z + 8);
        vanRide.apply(van, travelled, t);
        van.userData.spin(travelled);
        // Follows the landing, holds on the handover, then goes with the van.
        const settle = ease(seg(k, 0.3, 0.42));
        const follow = ease(seg(k, 0.68, 0.84));
        look.set(lerp(lerp(px, q.narrow ? 0 : 6, settle), van.position.x, follow), lerp(6, 3, settle), lerp(0, door.z + 8, follow));
        camera.position.set(look.x - lerp(14, 11, settle), lerp(8, 5, settle), look.z + lerp(56, 24, follow) * fit);
        camera.lookAt(look);
        sun.target.position.set(look.x, 0, 0);
        sun.position.set(look.x - 40, 22, 44);
        faceCamera(facing, camera);
      },
    };
  }

  // ---- Earth: NASA Blue Marble and Black Marble imagery on a sphere --------------
  let earthMaps = null;
  function loadEarth() {
    if (earthMaps) return earthMaps;
    const load = (file) => {
      const t = new T.Texture();
      track(new Promise((resolve) => {
        texLoader.load(EARTH_IMG + file, (l) => { t.image = l.image; t.anisotropy = 8; t.needsUpdate = true; resolve(); }, undefined, resolve);
      }));
      return t;
    };
    earthMaps = { day: load('earth-blue-marble.jpg'), night: load('earth-night.jpg'), water: load('earth-water.png') };
    return earthMaps;
  }
  const EARTH_VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  // Daylight on one side, city lights on the other, with a soft terminator.
  const EARTH_FRAG = `uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D waterMap; uniform vec3 sun; uniform vec3 eye;
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){
      vec3 N = normalize(vN); vec3 S = normalize(sun); vec3 V = normalize(eye - vP);
      float d = dot(N, S);
      float dayMix = smoothstep(-0.1, 0.24, d);
      vec3 day = texture2D(dayMap, vUv).rgb;
      vec3 lit = day * (0.05 + 1.2 * max(d, 0.0) + 0.16 * dayMix);
      vec3 lights = texture2D(nightMap, vUv).rgb;
      lights = pow(lights, vec3(1.25)) * vec3(1.0, 0.82, 0.55) * 2.1 * (1.0 - dayMix);
      float water = texture2D(waterMap, vUv).r;
      float spec = pow(max(dot(reflect(-S, N), V), 0.0), 42.0) * water * 0.55 * dayMix;
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
      vec3 col = lit + lights + vec3(spec) * vec3(1.0, 0.92, 0.8) + vec3(0.2, 0.42, 0.85) * rim * (0.12 + 0.62 * dayMix);
      gl_FragColor = vec4(col, 1.0);
    }`;
  function buildGlobe(q) {
    const scene = new T.Scene();
    scene.background = new T.Color('#01030a');
    const maps = loadEarth();
    const uniforms = { dayMap: { value: maps.day }, nightMap: { value: maps.night }, waterMap: { value: maps.water }, sun: { value: new T.Vector3(1, 0, 0) }, eye: { value: new T.Vector3() } };
    scene.add(new T.Mesh(new T.SphereGeometry(1, 128, 96), new T.ShaderMaterial({ uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG, toneMapped: false })));
    scene.add(new T.Mesh(new T.SphereGeometry(1.1, 96, 64), new T.ShaderMaterial({
      side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, uniforms: { sun: uniforms.sun },
      vertexShader: 'varying vec3 n; varying vec3 w; void main(){ n = normalize(normalMatrix * normal); w = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 sun; varying vec3 n; varying vec3 w; void main(){ float i = pow(clamp(-n.z / 0.42, 0.0, 1.0), 2.8); float lit = smoothstep(-0.35, 0.45, dot(normalize(w), normalize(sun))); gl_FragColor = vec4(0.3,0.58,1.0,1.0) * i * (0.1 + 0.85 * lit); }',
    })));
    const stars = [];
    const r = seeded(14);
    for (let i = 0; i < 3200; i++) stars.push(new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(40 + r() * 30));
    scene.add(new T.Points(new T.BufferGeometry().setFromPoints(stars), new T.PointsMaterial({ color: '#dfe8ff', size: 0.075, transparent: true, opacity: 0.8, sizeAttenuation: true, depthWrite: false, toneMapped: false })));
    scene.add(new T.AmbientLight('#8a9ab8', 0.7));
    const sun = new T.DirectionalLight('#fff6e6', 1.5);
    scene.add(sun);
    const samples = [];
    for (let i = 0; i <= 240; i++) samples.push(airAt(i / 240).pos);
    const curve = new T.CatmullRomCurve3(samples);
    const tube = new T.TubeGeometry(curve, 480, 0.0026, 8, false);
    const halo = new T.TubeGeometry(curve, 480, 0.0066, 8, false);
    scene.add(new T.Mesh(tube, new T.MeshBasicMaterial({ color: '#ffd166', toneMapped: false })));
    scene.add(new T.Mesh(halo, new T.MeshBasicMaterial({ color: '#ff9d1c', transparent: true, opacity: 0.26, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })));
    AIR_ROUTE.forEach((a) => {
      const g = glow('#ffcf6a', 0.05, 1);
      g.position.copy(onSphere(a.lat, a.lon, 1.006));
      scene.add(g);
      const l = label(a.code, q.narrow ? 0.062 : 0.05);
      l.position.copy(onSphere(a.lat, a.lon, 1.05));
      scene.add(l);
    });
    const aircraft = makePlane(40);
    aircraft.scale.setScalar(0.0034);
    scene.add(aircraft);
    const camera = new T.PerspectiveCamera(32, 1, 0.01, 200);
    const up = new T.Vector3(); const fwd = new T.Vector3(); const side = new T.Vector3();
    const basis = new T.Matrix4(); const camDir = new T.Vector3();
    const yAxis = new T.Vector3(0, 1, 0); const lift = new T.Vector3(0, 1.2, 0);
    return {
      scene, camera, exposure: 1,
      update(k, t, fit) {
        const prog = ease(seg(k, 0.03, 0.92));
        const here = airAt(prog);
        const ahead = airAt(Math.min(1, prog + 0.003)).pos;
        tube.setDrawRange(0, Math.floor((tube.index.count * prog) / 3) * 3);
        halo.setDrawRange(0, Math.floor((halo.index.count * prog) / 3) * 3);
        up.copy(here.pos).normalize();
        fwd.copy(ahead).sub(here.pos);
        if (fwd.lengthSq() < 1e-8) fwd.set(1, 0, 0).cross(up);
        fwd.normalize();
        side.crossVectors(fwd, up).normalize();
        up.crossVectors(side, fwd).normalize();
        basis.makeBasis(fwd, up, side);
        aircraft.quaternion.setFromRotationMatrix(basis);
        aircraft.position.copy(here.pos);
        camDir.copy(here.pos).normalize();
        camDir.y += 0.2 * (1 - seg(k, 0.85, 1));
        camDir.normalize();
        const dist = lerp(lerp(2.3, 3.7, ease(seg(k, 0, 0.25))), 1.45, ease(seg(k, 0.84, 1))) * fit;
        camera.position.copy(camDir).multiplyScalar(dist);
        camera.lookAt(0, 0, 0);
        sun.position.copy(camera.position).applyAxisAngle(yAxis, -1.05).add(lift);
        uniforms.sun.value.copy(sun.position);
        uniforms.eye.value.copy(camera.position);
      },
    };
  }

  // ---- scene 5: the customer's street and front door ---------------------------------
  function makeHouse(brick, r, withDoor) {
    const g = new T.Group();
    const w = 11; const h = 6.2; const d = 9;
    const body = wallBox(w, h, d, brick, 2.4);
    body.position.set(0, h / 2 + 0.6, -d / 2);
    g.add(body);
    const plinth = box(w + 0.1, 0.62, d + 0.1, std('#8e8a80', 0.9), 0, 0.31, -d / 2);
    plinth.receiveShadow = true;
    g.add(plinth);
    const roofMat = std('#3e3a38', 0.78);
    const roof = extrude([[-w / 2 - 0.5, 0], [w / 2 + 0.5, 0], [0, 3.1]], d + 1, roofMat, 0.02);
    roof.position.set(0, h + 0.6, -d / 2);
    g.add(roof);
    const trim = std('#efeadf', 0.5);
    const glass = glassMat();
    const window = (x, y, ww = 1.5, wh = 1.7) => {
      g.add(box(ww + 0.22, wh + 0.22, 0.1, trim, x, y, 0.04));
      const p = box(ww, wh, 0.05, glass, x, y, 0.09);
      p.castShadow = false;
      g.add(p);
      g.add(box(0.06, wh, 0.07, trim, x, y, 0.11));
      g.add(box(ww, 0.06, 0.07, trim, x, y, 0.11));
      g.add(box(ww + 0.4, 0.09, 0.26, trim, x, y - wh / 2 - 0.12, 0.14));
    };
    window(-3.2, 2.5); window(3.2, 2.5);
    window(-3.2, 5.2, 1.3, 1.4); window(0, 5.2, 1.3, 1.4); window(3.2, 5.2, 1.3, 1.4);
    if (!withDoor) { window(0, 2.5, 1.2, 1.7); }
    return g;
  }
  function buildDoor(q) {
    const scene = new T.Scene();
    const haze = new T.Color('#dfe5ea');
    scene.background = haze;
    scene.fog = new T.Fog(haze, 60, 320);
    applySky(scene, q.renderer, 'citrus_orchard_road_puresky');
    scene.add(new T.HemisphereLight('#dfe9f5', '#6f6556', 0.3));
    const sun = sunlight(scene, q, '#fff0d8', 2.2, [-12, 18, 16], 18);
    sun.position.set(-12, 18, 16);
    const lawnMat = pbr('leafy_grass', 26, 18, { roughness: 1, color: '#6f9148' });
    const lawn = ribbon(lawnMat, 200, 60, 0.01, -12);
    scene.add(lawn);
    const road = ribbon(pbr('asphalt_02', 26, 2, { roughness: 1 }), 200, 8, 0.02, 15);
    scene.add(road);
    // Far verge, so a pulled-back camera on a phone never sees past the road.
    scene.add(ribbon(lawnMat, 200, 60, 0.01, 49));
    scene.add(shadow(box(200, 0.15, 0.2, std('#c9c4b6', 0.85), 0, 0.075, 19), false, true));
    const walk = ribbon(pbr('brick_pavement', 80, 2, { roughness: 1 }), 200, 2.4, 0.08, 9.6);
    scene.add(walk);
    scene.add(shadow(box(200, 0.15, 0.2, std('#c9c4b6', 0.85), 0, 0.075, 11), false, true));
    const path = ribbon(pbr('brick_pavement', 1, 5, { roughness: 1 }), 1.5, 8, 0.07, 4.5);
    scene.add(path);
    const brick = pbr('red_brick', 1, 1, { color: '#d8c8bb' });
    const brick2 = pbr('painted_plaster_wall', 1, 1, { color: '#e6dfd2' });
    const r = seeded(4);
    const house = makeHouse(brick, r, true);
    scene.add(house);
    [[-20, brick2], [20, brick2], [-40, brick], [40, brick]].forEach(([x, m]) => {
      const n = makeHouse(m, r, false);
      n.position.x = x;
      scene.add(n);
    });
    // front door, frame, steps
    const landing = 0.62;
    const dW = 1.2; const dH = 2.3;
    const trim = std('#efeadf', 0.5);
    scene.add(box(dW + 0.34, 0.18, 0.2, trim, 0, landing + dH + 0.09, 0.06));
    [-1, 1].forEach((s) => scene.add(box(0.16, dH, 0.2, trim, s * (dW / 2 + 0.08), landing + dH / 2, 0.06)));
    const interior = new T.Mesh(new T.PlaneGeometry(dW, dH), new T.MeshBasicMaterial({ color: '#6e5238', toneMapped: false }));
    interior.position.set(0, landing + dH / 2, 0.012);
    scene.add(interior);
    const hinge = new T.Group();
    hinge.position.set(-dW / 2, landing, 0.08);
    const doorPaint = std('#0a2f25', 0.42, 0.05, { envMapIntensity: 0.5 });
    hinge.add(box(dW, dH, 0.06, doorPaint, dW / 2, dH / 2, 0));
    [[dH * 0.72, dH * 0.34], [dH * 0.26, dH * 0.38]].forEach(([y, h]) => hinge.add(box(dW - 0.32, h, 0.03, std('#0d3a2e', 0.45, 0.05, { envMapIntensity: 0.5 }), dW / 2, y, 0.035)));
    const knob = new T.Mesh(new T.SphereGeometry(0.04, 16, 12), std('#c8a24e', 0.2, 0.95));
    knob.position.set(dW - 0.1, 1.04, 0.07);
    hinge.add(knob);
    scene.add(hinge);
    [[2.4, 1.2, 0.47], [2.8, 1.6, 0.31], [3.2, 2, 0.15]].forEach(([w, d, y]) => {
      const m = box(w, 0.16, d, std('#b6ad9b', 0.85), 0, y, d / 2);
      m.receiveShadow = true;
      scene.add(m);
    });
    const mat = box(0.95, 0.025, 0.55, std('#3a2f24', 0.98), 0, landing - 0.04, 0.55);
    mat.receiveShadow = true;
    scene.add(mat);
    const lampBox = box(0.15, 0.32, 0.13, new T.MeshStandardMaterial({ color: '#ffe3a8', emissive: '#ffd98a', emissiveIntensity: 1.1 }), dW / 2 + 0.5, landing + 2.05, 0.1);
    scene.add(lampBox);
    const doorLight = new T.PointLight('#ffd896', 0, 6, 1.7);
    doorLight.position.set(0, landing + 1.2, 0.9);
    scene.add(doorLight);
    // garden
    [[-4.3, 1.5, 'island_tree_02', 3], [4.5, 1.5, 'tree_small_02', 3.2]].forEach(([x, z, id, h], i) => {
      const p = plant(id, i % 2, h);
      p.position.set(x, 0.02, z);
      scene.add(p);
    });
    [[-14, 3, 'island_tree_02', 10], [10, 6.8, 'tree_small_02', 11], [-25, 6, 'island_tree_01', 12], [28, 6, 'island_tree_02', 11], [-46, 7, 'tree_small_02', 12], [47, 7, 'island_tree_01', 13], [-14, -16, 'island_tree_01', 15], [14, -18, 'tree_small_02', 15], [36, -22, 'island_tree_02', 11], [-34, -24, 'tree_small_02', 12]].forEach(([x, z, id, h], i) => {
      const holder = new T.Group();
      holder.add(plant(id, i % 2, h));
      const sh = groundShadow(8, 0.4);
      holder.add(sh);
      holder.position.set(x, 0, z);
      scene.add(holder);
    });
    props('potted_plant_04', 0.9, 2, (h, i, c) => {
      c.position.set(i ? 1.25 : -1.25, 0.56, 0.5);
      scene.add(h);
    });
    props('wooden_picnic_table', 0.8, 1, (h, i, c) => {
      c.position.set(-9.5, 0.02, 2.5);
      c.rotation.y = 0.5;
      scene.add(h);
    });
    props('metal_trash_can', 1, 1, (h, i, c) => {
      c.position.set(6.4, 0.02, 0.9);
      scene.add(h);
    });
    // mailbox
    scene.add(limb([-3.2, 0, 8.3], [-3.2, 1.05, 8.3], 0.04, std('#2a2b2e', 0.5, 0.5)));
    scene.add(box(0.5, 0.26, 0.24, std('#17361f', 0.5, 0.2), -3.2, 1.15, 8.3));
    const LANE_Z = 16.6;
    const van = makeVan();
    van.position.set(0, 0.02, LANE_Z);
    scene.add(van);
    const vanRide = suspension(0.006, 0.006);
    const parcel = makeParcel(0.55);
    scene.add(parcel);
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 6000);
    const facing = collectFacing(scene);
    const a = new T.Vector3(); const b = new T.Vector3(); const mid = new T.Vector3(); const look = new T.Vector3(); const onVan = new T.Vector3();
    return {
      scene, camera, exposure: 0.58,
      update(k, t, fit) {
        // Still at speed from the airport, it slows and pulls up, then drives off with the parcel left behind.
        const slowing = seg(k, 0, 0.26);
        const parkX = lerp(-60, -7.5, 1 - (1 - slowing) * (1 - slowing));
        van.position.x = parkX + ease(seg(k, 0.66, 0.84)) * 120;
        const travelled = van.position.x + 60;
        vanRide.apply(van, travelled, t);
        van.userData.spin(travelled);
        // Out of the van, up the garden path, set down on the mat.
        const carry = ease(seg(k, 0.3, 0.66));
        a.set(parkX + 0.5, 1, van.position.z - 2);
        mid.set(0.1, 1.05, 5);
        b.set(0.05, landing - 0.025, 0.55);
        if (carry < 0.45) parcel.position.lerpVectors(a, mid, carry / 0.45);
        else parcel.position.lerpVectors(mid, b, (carry - 0.45) / 0.55);
        if (carry > 0 && carry < 1) parcel.position.y += Math.abs(Math.sin(carry * 22)) * 0.03;
        parcel.rotation.y = lerp(0.5, -0.1, carry);
        const open = ease(seg(k, 0.74, 1));
        hinge.rotation.y = -open * 1.3;
        doorLight.intensity = open * 1.4;
        const push = ease(seg(k, 0, 0.5)) * 0.18 + ease(seg(k, 0.72, 1)) * 0.82;
        camera.position.set(lerp(9, 2.6, push) * fit, lerp(3.4, 1.75, push), lerp(31, 7.6, push) * fit);
        look.set(lerp(-1, 0, push), lerp(2.2, 1.05, push), lerp(6, 0.3, push));
        // Opens framed on the van just as the airport scene left it, then settles on the house.
        const follow = 1 - smoother(seg(k, 0.06, 0.28));
        look.lerp(onVan.set(van.position.x, 3, LANE_Z), follow);
        camera.position.lerp(onVan.set(van.position.x - 11, 5, LANE_Z + 24 * fit), follow);
        camera.position.x += Math.sin(t * 0.3) * 0.03;
        camera.lookAt(look);
        faceCamera(facing, camera);
      },
    };
  }
  const BUILD = { street: buildStreet, depot: buildDepot, india: buildIndia, airport: buildAirport, globe: buildGlobe, arrival: buildArrival, door: buildDoor };

  // ---- renderer ----------------------------------------------------------------
  function Stage(canvas, fader) {
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const built = {};
    let W = 0; let H = 0; let narrow = false;
    function resize(rw, rh) {
      const rect = canvas.getBoundingClientRect();
      W = rw || rect.width; H = rh || rect.height;
      narrow = W < 760;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 1.75));
      renderer.setSize(W, H, false);
    }
    function get(id) {
      if (!built[id]) built[id] = BUILD[id]({ narrow, renderer });
      return built[id];
    }
    // Holds the outgoing picture during a dissolve, laid over the incoming one.
    const held = document.createElement('canvas');
    held.setAttribute('aria-hidden', 'true');
    held.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none';
    if (fader) fader.parentNode.insertBefore(held, fader);
    function draw(i, p, t) {
      const sc = SCENES[i];
      const s = get(sc.id);
      const aspect = W / H;
      // Portrait screens need the camera further back to keep subjects in frame.
      const fit = clamp(1.5 / aspect, 1, 1.9);
      s.camera.aspect = aspect;
      // Subject sits clear of the stage card: right on desktop, up on phones.
      if (narrow) s.camera.setViewOffset(W, H, 0, H * 0.13, W, H);
      else s.camera.setViewOffset(W, H, -W * 0.13, 0, W, H);
      s.update(seg(p, sc.a, sc.b), t, fit);
      renderer.toneMappingExposure = s.exposure;
      renderer.render(s.scene, s.camera);
    }
    function render(p, t) {
      if (!W || !H) return;
      let idx = SCENES.findIndex((s) => p < s.b);
      if (idx < 0) idx = SCENES.length - 1;
      const sc = SCENES[idx];
      const next = CUTS[idx]; const prev = CUTS[idx - 1];
      const toNext = next ? (sc.b - p) / next.w : 9;
      const fromPrev = prev ? (p - sc.a) / prev.w : 9;
      const cutHere = toNext < fromPrev ? next : prev || next;
      const near = Math.min(toNext, fromPrev);
      if (fader && near < 1 && cutHere.dissolve) {
        // Draw the outgoing scene, copy it, then draw the incoming one underneath the copy.
        const from = toNext < fromPrev ? idx : idx - 1;
        const mix = toNext < fromPrev ? 0.5 * (1 - near) : 0.5 + 0.5 * near;
        draw(from, p, t);
        const cw = Math.max(2, Math.round(W * 0.75)); const ch = Math.max(2, Math.round(H * 0.75));
        if (held.width !== cw || held.height !== ch) { held.width = cw; held.height = ch; }
        held.getContext('2d').drawImage(canvas, 0, 0, cw, ch);
        draw(from + 1, p, t);
        held.style.display = 'block';
        held.style.opacity = String(1 - ease(mix));
        fader.style.opacity = '0';
        return;
      }
      held.style.display = 'none';
      draw(idx, p, t);
      if (fader) {
        if (cutHere && !cutHere.dissolve) {
          fader.style.background = cutHere.color;
          fader.style.opacity = String(ease(1 - clamp(near)));
        } else fader.style.opacity = '0';
      }
    }
    // Builds later scenes between frames so reaching them doesn't stall the scroll.
    function prebuild(ids) {
      const queue = ids.slice();
      const next = () => {
        const id = queue.shift();
        if (!id) return;
        get(id);
        setTimeout(next, 150);
      };
      setTimeout(next, 300);
    }
    return { render, resize, prebuild, renderer };
  }

  const acts = Array.from(root.querySelectorAll('.jAct'));
  const fontReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`800 40px ${FONT}`), document.fonts.load(`500 40px ${FONT}`)]).catch(() => {})
    : Promise.resolve();
  const metaReady = fetch('assets/journey/plants.json').then((r) => r.json()).then((m) => { plantMeta = m; }).catch(() => {});
  const allReady = Promise.all([fontReady, metaReady]);

  // ---- reduced motion: one still per stage beside the text, nothing pinned ------
  if (reduceMotion) {
    allReady.then(() => {
      const off = document.createElement('canvas');
      const stage = Stage(off);
      if (!stage) return Promise.resolve();
      const shots = acts.filter((a) => !Number.isNaN(Number(a.dataset.still))).map((act) => {
        const shot = document.createElement('canvas');
        shot.className = 'jAct__still';
        shot.setAttribute('aria-hidden', 'true');
        act.prepend(shot);
        return { shot, still: Number(act.dataset.still) };
      });
      const r0 = shots[0].shot.getBoundingClientRect();
      stage.resize(r0.width, r0.height);
      shots.forEach(({ still }) => stage.render(still, 1)); // builds each scene and queues its assets
      return Promise.all(pending).then(() => new Promise((res) => setTimeout(res, 800))).then(() => {
        shots.forEach(({ shot, still }) => {
          const r = shot.getBoundingClientRect();
          shot.width = Math.round(r.width); shot.height = Math.round(r.height);
          stage.resize(r.width, r.height);
          stage.render(still, 1);
          shot.getContext('2d').drawImage(off, 0, 0, shot.width, shot.height);
        });
        stage.renderer.dispose();
      });
    });
    return;
  }

  // ---- live, pinned journey ---------------------------------------------------
  const canvas = root.querySelector('.journey__canvas');
  const fader = root.querySelector('.journey__fade');
  root.classList.add('is-pinned');
  const stage = Stage(canvas, fader);
  if (!stage) { root.classList.remove('is-pinned'); return; }
  window.addEventListener('resize', () => stage.resize());

  const hud = {
    status: root.querySelector('[data-hud=status]'),
    mode: root.querySelector('[data-hud=mode]'),
    route: root.querySelector('[data-hud=route]'),
    km: root.querySelector('[data-hud=km]'),
    fill: root.querySelector('.jRail__fill'),
    parcel: root.querySelector('.jRail__parcel'),
    stops: Array.from(root.querySelectorAll('.jRail__stop')),
  };
  const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  const kmFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

  function hudFor(p) {
    const k = (s) => seg(p, s.a, s.b);
    const [st, hub, hw, ap, gl, ar, dr] = SCENES;
    if (p < st.b) {
      const q = k(st);
      if (q < BEAT.droneEnd) return { status: 'Coming in by drone', mode: 'Drone', route: 'Sky → Indiranagar', km: 0 };
      if (q < BEAT.bikeEnd) return { status: 'On the bike', mode: 'Two-wheeler', route: 'Indiranagar → Koramangala', km: seg(q, BEAT.droneEnd, BEAT.bikeEnd) * 5 };
      if (q < BEAT.swapEnd) return { status: 'Moving to the van', mode: 'Handover', route: 'Koramangala', km: 5 };
      return { status: 'In the van', mode: 'Four-wheeler', route: 'Koramangala → City hub', km: 5 + seg(q, BEAT.swapEnd, 1) * 7 };
    }
    if (p < hub.b) {
      const q = k(hub);
      if (q < 0.26) return { status: 'Arriving at the hub', mode: 'Four-wheeler', route: 'City hub → Bengaluru hub', km: 12 };
      if (q < 0.6) return { status: 'Moving to the truck', mode: 'Handover', route: 'Bengaluru hub', km: 12 };
      return { status: 'Leaving Bengaluru', mode: 'Truck · NH 44', route: 'Bengaluru → Delhi', km: 12 };
    }
    if (p < hw.b) return { status: 'Crossing India', mode: 'Truck · NH 44', route: 'Bengaluru → Delhi', km: 12 + indiaDrive(k(hw)) * 2088 };
    if (p < ap.b) return { status: k(ap) < 0.21 ? 'Truck to the plane' : k(ap) < 0.44 ? 'Loading on the plane' : 'Taking off', mode: k(ap) < 0.21 ? 'Truck' : 'Air cargo', route: 'Delhi → New York', km: 2100 };
    if (p < gl.b) return { status: 'In the air', mode: 'Air cargo', route: 'Delhi → Dubai → London → New York', km: airAt(ease(seg(k(gl), 0.03, 0.92))).km };
    if (p < ar.b) {
      const q = k(ar);
      if (q < 0.4) return { status: 'Landing in New York', mode: 'Air cargo', route: 'London → New York', km: 15310 };
      if (q < 0.68) return { status: 'Moving to the van', mode: 'Handover', route: 'New York air cargo', km: 15310 };
      return { status: 'Out for delivery', mode: 'Four-wheeler', route: 'New York → Customer', km: 15310 + seg(q, 0.68, 1) * 4 };
    }
    const q = k(dr);
    return { status: q > 0.66 ? 'Delivered' : q > 0.28 ? 'At the door' : 'Out for delivery', mode: 'Four-wheeler', route: 'New York → Customer', km: 15314 + seg(q, 0, 0.26) * 18 };
  }

  const actFor = (p) => (p < SCENES[0].b ? 0 : p < SCENES[2].b ? 1 : p < SCENES[5].b ? 2 : 3);
  // Local, national, international.
  const stopAt = [0, SCENES[1].a, SCENES[3].a];

  let target = 0; let shown = 0; let visible = false; let raf = 0; let lastAct = -1; let ready = false;
  const start = performance.now();
  let lastFrame = start;

  function readScroll() {
    const rect = root.getBoundingClientRect();
    const span = rect.height - window.innerHeight;
    target = span > 0 ? clamp(-rect.top / span) : 0;
  }

  function frame(now) {
    raf = 0;
    if (!visible || !ready) return;
    readScroll();
    // Eases towards the scroll position at the same speed on any refresh rate.
    shown += (target - shown) * (1 - Math.exp(-Math.min(0.1, (now - lastFrame) / 1000) * 6));
    lastFrame = now;
    if (Math.abs(target - shown) < 0.00015) shown = target;
    stage.render(shown, (now - start) / 1000);

    const h = hudFor(shown);
    setText(hud.status, h.status);
    setText(hud.mode, h.mode);
    setText(hud.route, h.route);
    setText(hud.km, kmFmt.format(h.km < 100 ? Math.round(h.km * 10) / 10 : Math.round(h.km)) + ' km');
    hud.fill.style.transform = `scaleX(${shown})`;
    hud.parcel.style.left = shown * 100 + '%';
    hud.stops.forEach((el, i) => el.classList.toggle('is-done', shown >= stopAt[i] - 0.001));

    const act = actFor(shown);
    if (act !== lastAct) {
      acts.forEach((a, i) => {
        a.classList.toggle('is-active', i === act);
        a.setAttribute('aria-hidden', String(i !== act));
        a.querySelectorAll('a').forEach((link) => { if (i === act) link.removeAttribute('tabindex'); else link.tabIndex = -1; });
      });
      lastAct = act;
    }
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (visible && ready && !raf) raf = requestAnimationFrame(frame); };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    kick();
  }, { rootMargin: '30% 0px' }).observe(root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  allReady.then(() => {
    stage.resize();
    readScroll();
    shown = target;
    ready = true;
    kick();
    stage.prebuild(SCENES.map((s) => s.id));
  });
})();
