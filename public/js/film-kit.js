// Shared kit for the 3D films: materials, the partner vehicles, people, map pins, labels
// and road paths. Loaded after three.js and before js/hero-film.js and js/network-film.js.
window.UTKit = (function () {
  'use strict';
  const T = window.THREE;
  if (!T) return null;
  const FONT = '"Plus Jakarta Sans", Arial, sans-serif';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;

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
  function groundShadow(size, opacity = 0.42) {
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: softDotTex(), color: '#000000', transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.17;
    return m;
  }
  const std = (color, roughness = 0.7, metalness = 0, extra = {}) => new T.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const shadow = (m, cast = true, receive = false) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  function box(w, h, d, mat, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return shadow(m);
  }
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
  function limb(a, b, r, mat) {
    const av = new T.Vector3(...a); const bv = new T.Vector3(...b);
    const m = new T.Mesh(new T.CylinderGeometry(r, r * 0.92, av.distanceTo(bv), 14), mat);
    m.position.copy(av).add(bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), bv.clone().sub(av).normalize());
    return shadow(m);
  }
  function makeParcel(size) {
    const g = new T.Group();
    const h = size * 0.8; const d = size * 0.9;
    g.add(rbox(size, h, d, size * 0.05, vinyl('#c8955a'), 0, h / 2, 0));
    g.add(box(size * 1.01, h * 1.012, d * 0.2, vinyl('#ead3a8'), 0, h / 2, 0));
    return g;
  }
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
  function sideText(group, text, x, y, halfWidth, height, color, sub) {
    const t = canvasTex(1024, 320, (c, w, h) => {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = color;
      let size = sub ? 170 : 210;
      do { c.font = `800 ${size}px ${FONT}`; size -= 8; } while (c.measureText(text).width > w * 0.94 && size > 40);
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
  function makeBike(color, name) {
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
    // Top box carrying the rider's name
    const box2 = rbox(0.52, 0.4, 0.5, 0.06, paint(color), -0.74, 1.14, 0);
    m.add(box2);
    sideText(m, name, -0.74, 1.14, 0.25, 0.14, BRAND.gold);
    // Rider: smooth vinyl figure, knees bent, hands on the bars
    const jacket = vinyl(color); const trousers = vinyl('#1b2a33'); const glove = vinyl('#121416'); const shoe = vinyl('#e9e4d8');
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

  // Vehicles belong to the partners, so each carries its owner's name and colours.
  function makeVan(l) {
    const m = new T.Group();
    m.add(moulded([[-2.7, 0.42, 0.12], [2.66, 0.42, 0.14], [2.72, 1.06, 0.22], [2.02, 1.4, 0.26], [1.14, 2.4, 0.3], [-2.66, 2.44, 0.26]], 2.1, paint(l.body), { r: 0.2, bevel: 0.1 }));
    m.add(moulded([[1.98, 1.44], [1.12, 2.36], [1.0, 2.26], [1.82, 1.42]], 1.82, glassIcon(), { r: 0.05, bevel: 0.02 }));
    m.add(moulded([[1.84, 1.46], [1.08, 2.24], [0.3, 2.24], [0.3, 1.46]], 2.13, glassIcon(), { r: 0.08, bevel: 0.01 }));
    m.add(moulded([[-2.72, 0.78], [2.7, 0.78], [2.7, 0.94], [-2.72, 0.94]], 2.12, paint(l.stripe), { r: 0.02, bevel: 0.01 }));
    m.add(moulded([[-2.72, 0.42], [2.66, 0.42], [2.7, 0.78], [-2.72, 0.78]], 2.115, paint(l.low), { r: 0.08, bevel: 0.01 }));
    sideText(m, l.name, -1.15, 1.62, 1.06, 0.92, l.ink);
    m.add(rbox(0.16, 0.26, 2.16, 0.05, trimDark, 2.68, 0.56, 0));
    m.add(rbox(0.14, 0.26, 2.16, 0.05, trimDark, -2.72, 0.56, 0));
    [-0.72, 0.72].forEach((z) => { lamp(m, 2.7, 1.1, z, '#fff3c4', 0.14); lamp(m, -2.72, 1.4, z, '#d9321f', 0.11); });
    const wheels = [1.72, -1.72].flatMap((x) => [-0.98, 0.98].map((z) => iconWheel(0.43, 0.27, x, 0.43, z)));
    contact(m, 5.4, 2.1);
    return rig(m, wheels);
  }
  function makeTruck(l) {
    const m = new T.Group();
    m.add(rbox(7.6, 0.28, 1.5, 0.06, trimDark, -0.1, 0.84, 0));
    m.add(moulded([[1.95, 0.78, 0.1], [3.96, 0.78, 0.16], [4.04, 1.72, 0.2], [3.72, 3.02, 0.26], [1.95, 3.12, 0.22]], 2.42, paint(l.cab), { r: 0.2, bevel: 0.1 }));
    m.add(moulded([[3.82, 1.92], [3.6, 2.92], [3.46, 2.86], [3.68, 1.9]], 2.14, glassIcon(), { r: 0.05, bevel: 0.02 }));
    m.add(moulded([[3.54, 1.94], [3.36, 2.84], [2.4, 2.84], [2.4, 1.94]], 2.45, glassIcon(), { r: 0.08, bevel: 0.01 }));
    m.add(rbox(0.2, 0.34, 2.46, 0.06, trimDark, 4.0, 0.92, 0));
    [-0.88, 0.88].forEach((z) => lamp(m, 4.05, 1.16, z, '#fff3c4', 0.16));
    m.add(rbox(5.8, 2.76, 2.5, 0.12, paint(l.body, 0.34), -1.08, 2.46, 0));
    m.add(moulded([[-3.98, 1.08], [1.82, 1.08], [1.82, 1.3], [-3.98, 1.3]], 2.53, paint(l.stripe), { r: 0.03, bevel: 0.01 }));
    sideText(m, l.name, -1.08, 2.62, 1.25, 1.62, l.ink);
    lamp(m, -3.98, 1.0, 0.9, '#d9321f', 0.12);
    lamp(m, -3.98, 1.0, -0.9, '#d9321f', 0.12);
    const wheels = [2.95, -1.5, -2.72].flatMap((x) => [-1.12, 1.12].map((z) => iconWheel(0.56, 0.38, x, 0.56, z)));
    contact(m, 8, 2.5);
    return rig(m, wheels);
  }
  function makeAuto(color) {
    const { m, wheels } = iconAuto(color);
    return rig(m, wheels);
  }
  function makeParkedCar(color) {
    const { m, wheels } = iconCar(color);
    return rig(m, wheels);
  }
  function makePerson(top, skin = '#8a5a3a') {
    const g = new T.Group();
    const cloth = vinyl(top);
    const legs = vinyl('#26323a');
    [-0.14, 0.14].forEach((z) => g.add(capsule([0, 0.08, z], [0, 0.82, z], 0.1, legs)));
    const body = new T.Mesh(new T.SphereGeometry(0.28, 20, 16), cloth);
    body.scale.set(0.85, 1.5, 1.05);
    body.position.y = 1.18;
    g.add(shadow(body));
    const head = new T.Mesh(new T.SphereGeometry(0.2, 20, 16), vinyl(skin));
    head.position.y = 1.86;
    g.add(shadow(head));
    const hair = new T.Mesh(new T.SphereGeometry(0.205, 20, 12, 0, Math.PI * 2, 0, 1.4), vinyl('#1b1512'));
    hair.position.y = 1.87;
    g.add(hair);
    g.add(capsule([0, 1.5, 0.26], [0, 0.96, 0.32], 0.07, cloth));
    const arm = new T.Group(); // raised to wave
    arm.position.set(0, 1.5, -0.26);
    arm.add(capsule([0, 0, 0], [0, 0.56, -0.12], 0.07, cloth));
    g.add(arm);
    g.userData.arm = arm;
    g.scale.setScalar(1.25);
    return g;
  }
  function makePin(color, letter) {
    const g = new T.Group();
    const mat = paint(color, 0.3);
    const ball = new T.Mesh(new T.SphereGeometry(1.5, 28, 20), mat);
    ball.position.y = 3.4;
    g.add(ball);
    const tip = new T.Mesh(new T.ConeGeometry(1.32, 2.7, 28), mat);
    tip.rotation.x = Math.PI;
    tip.position.y = 1.35;
    g.add(tip);
    const t = canvasTex(128, 128, (c) => {
      c.fillStyle = '#17130D';
      c.font = `800 86px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(letter, 64, 70);
    });
    const face = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
    face.scale.set(2.4, 2.4, 1);
    face.position.y = 3.4;
    face.renderOrder = 8;
    g.add(face);
    return g;
  }
  // A small card that floats over the map and stays the same size on screen.
  function pill(text, { bg = '#ffffff', ink = '#10211b' } = {}) {
    const px = 44;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `700 ${px}px ${FONT}`;
    const w = Math.ceil(probe.measureText(text).width) + 64;
    const h = px + 44;
    const t = canvasTex(w, h, (c) => {
      c.fillStyle = bg;
      c.beginPath();
      c.moveTo(22, 0); c.arcTo(w, 0, w, h, 22); c.arcTo(w, h, 0, h, 22); c.arcTo(0, h, 0, 0, 22); c.arcTo(0, 0, w, 0, 22);
      c.fill();
      c.font = `700 ${px}px ${FONT}`;
      c.textBaseline = 'middle';
      c.fillStyle = ink;
      c.fillText(text, 32, h / 2 + 2);
    });
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    s.center.set(0.5, 0);
    s.renderOrder = 10;
    s.userData.aspect = w / h;
    return s;
  }

  // ---- roads ------------------------------------------------------------------
  // A rounded path along the road centres, shifted into the left lane (India drives on the left).
  function roadPath(points, lane = 2, corner = 7) {
    const c = [];
    points.forEach((pt, i) => {
      const here = new T.Vector2(pt[0], pt[1]);
      if (i === 0 || i === points.length - 1) { c.push(here); return; }
      const a = new T.Vector2(...points[i - 1]).sub(here).normalize().multiplyScalar(corner).add(here);
      const b = new T.Vector2(...points[i + 1]).sub(here).normalize().multiplyScalar(corner).add(here);
      for (let n = 0; n <= 10; n++) {
        const k = n / 10;
        c.push(new T.Vector2((1 - k) * (1 - k) * a.x + 2 * k * (1 - k) * here.x + k * k * b.x, (1 - k) * (1 - k) * a.y + 2 * k * (1 - k) * here.y + k * k * b.y));
      }
    });
    const shifted = c.map((p, i) => {
      const d = c[Math.min(i + 1, c.length - 1)].clone().sub(c[Math.max(i - 1, 0)]).normalize();
      return new T.Vector2(p.x + d.y * lane, p.y - d.x * lane);
    });
    const at0 = [0];
    for (let i = 1; i < shifted.length; i++) at0.push(at0[i - 1] + shifted[i].distanceTo(shifted[i - 1]));
    const length = at0[at0.length - 1];
    function at(s) {
      const d = clamp(s, 0, length);
      let i = 1;
      while (i < at0.length - 1 && at0[i] < d) i++;
      const k = (d - at0[i - 1]) / Math.max(0.0001, at0[i] - at0[i - 1]);
      const x = lerp(shifted[i - 1].x, shifted[i].x, k);
      const z = lerp(shifted[i - 1].y, shifted[i].y, k);
      const dir = shifted[i].clone().sub(shifted[i - 1]).normalize();
      return { x, z, dx: dir.x, dz: dir.y, yaw: Math.atan2(-dir.y, dir.x) };
    }
    return { at, length, samples: shifted };
  }
  // Flat strip on the road surface; setDrawRange reveals it as the van moves.
  function ribbon(samples, width, mat, y = 0.12) {
    const pos = [];
    const idx = [];
    samples.forEach((p, i) => {
      const a = samples[Math.max(i - 1, 0)];
      const b = samples[Math.min(i + 1, samples.length - 1)];
      const d = b.clone().sub(a).normalize();
      pos.push(p.x + d.y * width, y, p.y - d.x * width, p.x - d.y * width, y, p.y + d.x * width);
      if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, i * 2, (i - 1) * 2 + 1, i * 2 + 1);
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new T.Mesh(g, mat);
    m.userData.total = idx.length;
    return m;
  }


  return { canvasTex, glow, groundShadow, std, shadow, box, wallBox, limb, makeParcel, paint, vinyl, glassIcon, roundedShape, moulded, rbox, capsule, iconWheel, sideText, lamp, rig, contact, makeBike, iconCar, iconAuto, makeVan, makeTruck, makeAuto, makeParkedCar, makePerson, makePin, pill, roadPath, ribbon };
})();
