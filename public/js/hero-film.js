// The hero film, in 3D, with a setting for each kind of route: a miniature city for local, the map
// of India for national, the globe for international. Until someone types it loops the sample story
// in each setting in turn: pickup, drop, the available services, the sender selects one, the request
// goes to that partner only, who comes to the pickup and delivers. Once they type it follows their
// route (driven by js/home-book.js). Without three.js or WebGL only the captions remain.
window.UTFilm = (function () {
  'use strict';
  const root = document.getElementById('heroFilm');
  if (!root) return null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => root.querySelector(s);
  const stepsEl = Array.from(root.querySelectorAll('.film__steps li'));
  const textEl = $('[data-film-text]');
  const sampleEl = $('[data-film-sample]');
  const chipEl = {};
  root.querySelectorAll('[data-chip]').forEach((el) => { chipEl[el.dataset.chip] = el; });
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => k * k * (3 - 2 * k);
  const backOut = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

  const STATES = ['is-a', 'is-b', 'is-load', 'is-net', 'is-search', 'is-found', 'is-list', 'is-send', 'is-arrive', 'is-move', 'is-done'];
  const BEATS = [
    { on: ['is-a'], ms: 2400, step: 1, text: 'Tell us where to pick it up.' },
    { on: ['is-a', 'is-b'], ms: 2400, step: 2, text: 'And where it needs to go.' },
    { on: ['is-a', 'is-b', 'is-net'], ms: 2400, step: 3, text: 'We show the services available on your route.' },
    { on: ['is-a', 'is-b', 'is-net', 'is-list'], ms: 3200, step: 3, text: 'Compare them by speed, price, weight limit and vehicle.' },
    { on: ['is-a', 'is-b', 'is-net', 'is-send'], ms: 2600, step: 4, text: 'Select one, and your request goes to that partner only.' },
    { on: ['is-a', 'is-b', 'is-arrive'], ms: 2800, step: 4, text: 'Your partner accepts and comes to your pickup.', ride: ['start', 'shop', 2400] },
    { on: ['is-a', 'is-b', 'is-move'], ms: 4100, step: 5, text: 'They collect it with a pickup OTP and head to the drop.', ride: ['shop', 'home', 3200, 700] },
    { on: ['is-a', 'is-b', 'is-done'], ms: 2500, step: 5, text: 'Delivered, with tracking the whole way.' },
  ];
  const row = (img, cls, t, sub, price) => `<div class="filmCard__row"><img class="${cls}" src="${img}" alt=""><div><b>${t}</b><small>${sub}</small></div><em>${price}</em></div>`;
  const SAMPLES = {
    local: { a: 'Pickup · Koramangala', b: 'Drop · Whitefield', partners: ['Delivery partner', 'Courier service', 'Independent van', 'Truck owner'],
      rows: [row('assets/vehicles3d/bike.webp', 'bike', 'Two-wheeler', 'Delivery partner · up to 20 kg · 8 min', '₹196'), row('assets/favicon.svg', 'box', 'Courier parcel', 'Courier service · up to 30 kg · 2 days', '₹138'), row('assets/vehicles3d/mini.webp', 'van', 'Mini truck', 'Independent van · up to 750 kg · 20 min', '₹729')] },
    national: { a: 'Pickup · Bengaluru', b: 'Drop · Delhi', partners: ['Truck owner', 'Air cargo', 'Courier service', 'Part truck load'],
      rows: [row('assets/vehicles3d/truck19.webp', 'van', 'Full truck', 'Truck owner · up to 9 t · 5 days', '₹64,300'), row('assets/favicon.svg', 'box', 'Courier parcel', 'Courier service · up to 30 kg · 3 days', '₹415'), row('assets/vehicles/plane.svg', 'box', 'Air cargo', 'Next flight · up to 3 t · 2 days', '₹6,418')] },
    international: { a: 'Pickup · New Delhi', b: 'Drop · United Kingdom', partners: ['Express courier', 'Air freight', 'Sea freight', ''],
      rows: [row('assets/vehicles/plane.svg', 'box', 'Express courier', 'Door to door · up to 30 kg · 4 days', '₹5,240'), row('assets/vehicles/plane.svg', 'box', 'Air freight', 'Freight forwarder · up to 5 t · 6 days', '₹74,045'), row('assets/vehicles/ship.svg', 'box', 'Sea freight', 'Shared container · up to 40 t · 32 days', '₹20,414')] },
  };
  const ORDER = ['local', 'national', 'international'];
  const has = (c) => root.classList.contains(c);
  function chip(name, text) { if (chipEl[name].textContent !== text) chipEl[name].textContent = text; }
  const short = (s) => (s.length > 24 ? s.slice(0, 23) + '…' : s);

  function show(on, step, text) {
    STATES.forEach((c) => root.classList.toggle(c, on.includes(c)));
    stepsEl.forEach((li, n) => li.classList.toggle('is-on', n < step));
    textEl.textContent = text;
    if (world && reduceMotion) world.still();
  }

  // ---- the 3D world -------------------------------------------------------------
  function buildWorld() {
    const T = window.THREE;
    const K = window.UTKit;
    if (!T || !K) return null;
    const canvas = $('.film__canvas');
    const stage = $('.film__stage');
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const { std, shadow, box, wallBox, canvasTex, glow, paint, vinyl, glassIcon, roundedShape, capsule, rbox, makeParcel, makeBike, makeVan, makeTruck, makeParkedCar, makePerson, makePin, roadPath, ribbon } = K;
    const small = window.innerWidth < 760;
    const camera = new T.OrthographicCamera(-80, 80, 80, -80, 1, 1200);

    // Soft sky for the paint reflections, shared by all three settings.
    const envScene = new T.Scene();
    const skyTex = canvasTex(8, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#8fbfdc');
      g.addColorStop(0.5, '#f4f6ee');
      g.addColorStop(0.56, '#8c8f7c');
      g.addColorStop(1, '#5d6252');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    envScene.add(new T.Mesh(new T.SphereGeometry(50, 24, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide })));
    const pmrem = new T.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
    function lit(scene, span, castShadow = true) {
      scene.environment = envTex;
      scene.add(new T.HemisphereLight('#f4f8ff', '#71806a', 0.6));
      const sun = new T.DirectionalLight('#fff0d6', 1.9);
      sun.position.set(-span * 0.9, span * 1.8, span * 0.75);
      if (castShadow) {
        sun.castShadow = true;
        Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: span * 4 });
        sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.3;
      }
      scene.add(sun);
    }
    const loader = new T.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const ringGeo = new T.RingGeometry(0.86, 1, 48);
    function makePulse(scene) {
      const mat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, toneMapped: false });
      const mesh = new T.Mesh(ringGeo, mat);
      mesh.renderOrder = 3;
      scene.add(mesh);
      return { mat, mesh };
    }
    function makeBurst(scene, size) {
      return Array.from({ length: 14 }, (_, i) => {
        const s = glow(i % 2 ? '#ffd872' : '#7fe0b3', size, 0);
        const a = (i / 14) * Math.PI * 2;
        s.userData = { dx: Math.cos(a) * (1 + (i % 3) * 0.5), dz: Math.sin(a) * (1 + (i % 3) * 0.5), up: 1.5 + (i % 4) * 0.5 };
        scene.add(s);
        return s;
      });
    }
    function runBurst(list, c, x, y, z, scale) {
      const k = clamp((c.clock.done - 0.5) / 1);
      list.forEach((b) => {
        b.material.opacity = c.done && k > 0 && k < 1 ? 1 - k : 0;
        b.position.set(x + b.userData.dx * scale * k, y + (b.userData.up * k - 1.2 * k * k) * scale, z + b.userData.dz * scale * k);
      });
    }
    function makePlaneModel(body, stripe) {
      const g = new T.Group();
      g.add(capsule([-4.6, 0, 0], [4.6, 0, 0], 1.05, paint(body)));
      g.add(rbox(2.6, 0.26, 12.4, 0.1, paint(body), -0.2, -0.2, 0));
      g.add(rbox(1.5, 0.2, 4.8, 0.08, paint(body), -4.4, 0.25, 0));
      g.add(rbox(1.7, 2.2, 0.26, 0.1, paint(stripe), -4.5, 1.5, 0));
      g.add(rbox(6.5, 0.32, 2.1, 0.08, paint(stripe), 0, -0.1, 0));
      [-3, 3].forEach((z) => g.add(capsule([-0.1, -0.75, z], [1.1, -0.75, z], 0.42, paint('#50565c'))));
      return g;
    }
    function makeShip() {
      const g = new T.Group();
      g.add(rbox(9, 1.5, 2.8, 0.45, paint('#26455f'), 0, 0.8, 0));
      g.add(rbox(1.7, 2.1, 2.2, 0.15, paint('#f2f2ee'), -3.2, 2.5, 0));
      ['#c2452a', '#e0a020', '#2c7a68', '#c2452a'].forEach((col, i) => g.add(box(1.25, 1.1, 2.1, paint(col), -1.3 + i * 1.4, 2.1, 0)));
      return g;
    }

    // ---- local: the miniature city ----------------------------------------------
    function buildCity() {
      const scene = new T.Scene();
      lit(scene, 100);
      const EDGE = 63;
      const slab = new T.Mesh(new T.ExtrudeGeometry(roundedShape([[-EDGE, -EDGE], [EDGE, -EDGE], [EDGE, EDGE], [-EDGE, EDGE]], 9), { depth: 7, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.8, bevelSegments: 3, curveSegments: 10 }), [std('#86a771', 0.95), std('#6d5a43', 0.95)]);
      slab.rotation.x = Math.PI / 2;
      slab.position.y = -0.8;
      slab.receiveShadow = true;
      scene.add(slab);
      const under = new T.Mesh(new T.ExtrudeGeometry(roundedShape([[-EDGE + 5, -EDGE + 5], [EDGE - 5, -EDGE + 5], [EDGE - 5, EDGE - 5], [-EDGE + 5, EDGE - 5]], 9), { depth: 5, bevelEnabled: false }), std('#4e4132', 1));
      under.rotation.x = Math.PI / 2;
      under.position.y = -8.2;
      scene.add(under);

      // Roads run off the island's edge, so traffic can arrive and leave.
      const dash = canvasTex(32, 128, (c, w, h) => {
        c.fillStyle = '#454a50';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#ece9dc';
        c.fillRect(w / 2 - 1.2, 0, 2.4, h * 0.5);
      });
      dash.wrapT = T.RepeatWrapping;
      dash.repeat.set(1, 18);
      const roadMat = std('#ffffff', 0.92, 0, { map: dash });
      [-54, -18, 18, 54].forEach((v, i) => {
        const a = new T.Mesh(new T.PlaneGeometry(10, 126), roadMat);
        a.rotation.x = -Math.PI / 2;
        a.position.set(v, 0.04, 0);
        a.receiveShadow = true;
        scene.add(a);
        const b = new T.Mesh(new T.PlaneGeometry(10, 126), roadMat);
        b.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        b.position.set(0, 0.06 + i * 0.002, v);
        b.receiveShadow = true;
        scene.add(b);
      });

      // The camera looks from the south-east, so whatever stands south or east of the
      // route stays low, or it would hide the partner as they ride past.
      const rnd = (function () { let s = 23; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
      const windows = canvasTex(64, 64, (c, w, h) => {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#3e5866';
        c.fillRect(13, 12, 38, 38);
        c.fillStyle = 'rgba(255,255,255,.4)';
        c.fillRect(13, 12, 38, 12);
      });
      windows.wrapS = windows.wrapT = T.RepeatWrapping;
      const roofMat = std('#bcb6a8', 0.9);
      const walls = ['#f1e4c9', '#e9c6a0', '#dca486', '#c8d8c6', '#e3e3dc', '#ecd98d', '#d6c4e0'].map((c) => {
        const wall = std(c, 0.82, 0, { map: windows });
        return [wall, wall, roofMat, roofMat, wall, wall];
      });
      const paving = std('#c6c2b4', 0.95);
      const LOW = { '0,36': 5.5, '36,0': 5.5 };
      const SPECIAL = { '0,0': 1, '-36,36': 1, '36,-36': 1, '36,36': 1 };
      const spots = [];
      [-36, 0, 36].forEach((bx) => [-36, 0, 36].forEach((bz) => {
        const key = `${bx},${bz}`;
        if (key !== '0,0') {
          const pad = new T.Mesh(new T.BoxGeometry(26, 0.3, 26), paving);
          pad.position.set(bx, 0.15, bz);
          pad.receiveShadow = true;
          scene.add(pad);
        }
        if (SPECIAL[key]) return;
        [-6.4, 6.4].forEach((ox) => [-6.4, 6.4].forEach((oz) => {
          const x = bx + ox; const z = bz + oz;
          if (LOW[key] && rnd() < 0.4) { spots.push([x, z]); return; }
          const w = 10 + rnd() * 1.6; const d = 10 + rnd() * 1.6;
          const h = LOW[key] ? 3.6 + rnd() * (LOW[key] - 3.6) : 8 + rnd() * 15;
          const b = wallBox(w, h, d, walls[Math.floor(rnd() * walls.length)], 2.6);
          b.position.set(x, h / 2 + 0.3, z);
          scene.add(b);
          scene.add(box(w + 0.5, 0.5, d + 0.5, roofMat, x, h + 0.5, z));
          if (rnd() < 0.5) {
            const tank = shadow(new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 1.3, 12), std('#2b3a42', 0.6)));
            tank.position.set(x + 1.8, h + 1.3, z - 1.8);
            scene.add(tank);
          }
        }));
      }));

      // The park in the middle, with a pond and trees.
      for (let i = 0; i < 16; i++) spots.push([(rnd() - 0.5) * 22, (rnd() - 0.5) * 22]);
      [[-44, 26], [-46, 46], [-44, 30], [47, 25], [47, 47], [28, -26], [-4, 61]].forEach((p) => spots.push(p));
      spots.forEach((p, i) => { if (Math.hypot(p[0] - 5, p[1] - 5) < 7.5) spots[i] = [p[0] - 11, p[1] - 9]; });
      const pond = new T.Mesh(new T.CylinderGeometry(6.4, 6.4, 0.12, 32), std('#59a6cc', 0.12, 0.25));
      pond.position.set(5, 0.1, 5);
      pond.receiveShadow = true;
      scene.add(pond);
      const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(2.3, 1), std('#5e9a53', 0.88, 0, { flatShading: true }), spots.length);
      const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.26, 0.38, 2.4, 7), std('#6d543c', 0.9), spots.length);
      const dummy = new T.Object3D();
      spots.forEach(([x, z], i) => {
        const s = 0.75 + rnd() * 0.65;
        dummy.position.set(x, 1.2, z); dummy.scale.set(1, s, 1); dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, 2.1 + 2 * s, z); dummy.scale.set(s, s * 1.12, s); dummy.updateMatrix();
        crowns.setMatrixAt(i, dummy.matrix);
      });
      crowns.castShadow = true;
      trunks.castShadow = true;
      scene.add(crowns, trunks);

      const sign = (text, w, h, bg, ink) => new T.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(Math.round(256 * w / h), 256, (c, cw, ch) => {
        c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
        c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
        let size = 170;
        do { c.font = `800 ${size}px "Plus Jakarta Sans", Arial, sans-serif`; size -= 6; } while (c.measureText(text).width > cw * 0.9);
        c.fillText(text, cw / 2, ch / 2 + 6);
      }) });

      // The sender's shop; its front faces the road on the east.
      const SHOP = { x: -25, z: 36 };
      scene.add(box(13, 6.4, 15, std('#f4e9d4', 0.85), -33, 3.5, 36));
      scene.add(box(13.6, 0.6, 15.6, std('#b5482a', 0.6), -33, 6.9, 36));
      const awning = box(2, 0.28, 13, vinyl('#d24f2d'), -25.6, 3.8, 36);
      awning.rotation.z = -0.2;
      scene.add(awning);
      const shopSign = new T.Mesh(new T.PlaneGeometry(12, 1.6), sign('Lakshmi Textiles', 12, 1.6, '#10543f', '#ffd872'));
      shopSign.rotation.y = Math.PI / 2;
      shopSign.position.set(-26.45, 5.4, 36);
      scene.add(shopSign);
      scene.add(box(0.2, 2.8, 3, std('#31434c', 0.3, 0.3), -26.42, 1.7, 36));
      [31, 41].forEach((z) => scene.add(box(0.2, 2, 3.2, glassIcon(), -26.42, 2, z)));
      const sender = makePerson('#c2452a');
      sender.position.set(-24.6, 0.3, 39.2);
      sender.rotation.y = Math.PI / 2;
      sender.scale.setScalar(1.7);
      scene.add(sender);

      // The customer's home; its front faces the road on the south.
      const HOME = { x: 37.5, z: -24.5 };
      scene.add(box(15, 7, 11, std('#ecd9bb', 0.85), 36, 3.8, -32));
      scene.add(box(16, 0.6, 12, std('#a5522f', 0.7), 36, 7.6, -32));
      scene.add(box(2.4, 3.6, 0.2, std('#6b3f26', 0.5), 38, 2.1, -26.42));
      [31.5, 42].forEach((x) => scene.add(box(2.8, 2, 0.2, glassIcon(), x, 3.6, -26.42)));
      const customer = makePerson('#2c7a68', '#a36b47');
      customer.position.set(34.5, 0.3, -24.4);
      customer.scale.setScalar(1.7);
      scene.add(customer);

      // A courier service: depot and parcels.
      scene.add(box(14, 6.6, 16, std('#e5e9eb', 0.8), 31, 3.6, 36));
      scene.add(box(14.6, 0.5, 16.6, std('#1f4e8c', 0.6), 31, 7.1, 36));
      const depotSign = new T.Mesh(new T.PlaneGeometry(11, 1.7), sign('Swift Courier', 11, 1.7, '#1f4e8c', '#ffffff'));
      depotSign.position.set(31, 5.1, 44.1);
      scene.add(depotSign);
      for (let i = 0; i < 6; i++) {
        const p = makeParcel(1.35);
        p.position.set(26.6 + (i % 3) * 1.6, 0.3 + Math.floor(i / 3) * 1.1, 45.8);
        scene.add(p);
      }

      // The partners, a little larger than life so they read at this size.
      const TOY = 1.75;
      const place = (obj, x, z, yaw) => { obj.position.set(x, 0.08, z); obj.rotation.y = yaw; obj.scale.setScalar(TOY); scene.add(obj); return obj; };
      const trip = roadPath([[34, 54], [-18, 54], [-18, 18], [18, 18], [18, -18], [46, -18]], 2.5, 6);
      const stops = { start: 0, shop: 0, home: 0 };
      let bestA = 1e9; let bestB = 1e9;
      for (let s = 0; s < trip.length; s += 0.2) {
        const q = trip.at(s);
        const a = Math.hypot(q.x - SHOP.x, q.z - SHOP.z);
        const b = Math.hypot(q.x - HOME.x, q.z - HOME.z);
        if (a < bestA) { bestA = a; stops.shop = s; }
        if (b < bestB) { bestB = b; stops.home = s; }
      }
      const startAt = trip.at(0);
      const rider = place(makeBike('#2c7a68', 'Zip Riders'), startAt.x, startAt.z, startAt.yaw);
      const others = [
        { obj: place(makeVan({ name: 'Swift Courier', body: '#ffffff', low: '#1f4e8c', stripe: '#e8483b', ink: '#1f4e8c' }), 44, 36, Math.PI / 2), h: 7 },
        { obj: place(makeVan({ name: 'Ravi Transport', body: '#f6f1e4', low: '#b5482a', stripe: '#f2b632', ink: '#8c3419' }), 36, 15.5, 0), h: 7 },
        { obj: place(makeTruck({ name: 'Highway Freight', cab: '#2c5d8f', body: '#eef1f2', stripe: '#e39b1f', ink: '#2c5d8f' }), -38, -20.5, 0), h: 11 },
      ];
      const partners = [{ obj: rider, h: 6.5 }, ...others];
      partners.forEach((p) => { p.pulse = makePulse(scene); p.pulse.mesh.rotation.x = -Math.PI / 2; });

      // Passing traffic, so the city is alive between beats.
      const LANES = [
        { axis: 'x', fixed: -56.5, dir: 1, color: '#7b2d2d', at: 0.1 },
        { axis: 'z', fixed: -56.5, dir: -1, color: '#e7e7e2', at: 0.6 },
        { axis: 'x', fixed: 56.5, dir: -1, color: '#34506b', at: 0.35 },
      ];
      LANES.forEach((l) => { l.obj = makeParkedCar(l.color); scene.add(l.obj); });

      const pinA = makePin('#f5b301', 'A');
      const pinB = makePin('#ffffff', 'B');
      pinA.scale.setScalar(1.55);
      pinB.scale.setScalar(1.55);
      const PIN_A = { x: -23.8, z: 33 };
      const PIN_B = { x: 41, z: -24.4 };
      scene.add(pinA, pinB);
      const parcel = makeParcel(2.1);
      scene.add(parcel);
      const PARCEL_AT = { x: -24.6, z: 35.2 };

      const line = [];
      for (let s = stops.shop; s <= stops.home; s += 1) { const q = trip.at(s); line.push(new T.Vector2(q.x, q.z)); }
      const ghost = ribbon(line, 0.5, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), 0.14);
      const trail = ribbon(line, 0.75, new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, depthWrite: false, toneMapped: false }), 0.16);
      ghost.renderOrder = 2;
      trail.renderOrder = 3;
      scene.add(ghost, trail);

      const from = new T.Vector3(PIN_A.x, 7, PIN_A.z);
      const to = new T.Vector3(startAt.x, 5, startAt.z);
      const mid = from.clone().lerp(to, 0.5);
      mid.y += 24;
      const arcCurve = new T.QuadraticBezierCurve3(from, mid, to);
      const arcMat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, depthWrite: false, toneMapped: false });
      const arc = new T.Mesh(new T.TubeGeometry(arcCurve, 48, 0.42, 8), arcMat);
      arc.renderOrder = 5;
      scene.add(arc);
      const spark = glow('#ffe39a', 8, 0);
      spark.renderOrder = 6;
      scene.add(spark);
      const burst = makeBurst(scene, 2.6);
      let size = 1;
      let q = trip.at(0);

      return {
        scene, stops, cam: { half: 80, az: Math.PI / 4, el: 0.66, sway: 0.05 }, count: 4,
        reset() {},
        draw(c) {
          pinA.visible = c.va > 0.01;
          pinB.visible = c.vb > 0.01;
          pinA.position.set(PIN_A.x, 0.3 + (1 - backOut(clamp(c.va))) * 26 + c.bob, PIN_A.z);
          pinB.position.set(PIN_B.x, 0.3 + (1 - backOut(clamp(c.vb))) * 26 + c.bob, PIN_B.z);
          pinB.children[0].material.color.lerp(c.done ? c.green : c.white, c.rate(5));
          q = trip.at(c.s);
          const before = trip.at(c.s - 1.5); const after = trip.at(c.s + 1.5);
          rider.position.set(q.x, 0.08, q.z);
          rider.rotation.y = Math.atan2(-(after.z - before.z), after.x - before.x);
          rider.userData.spin(c.s / TOY);

          const shopAt = trip.at(stops.shop);
          parcel.visible = c.showA && (c.loadK < 1 || c.dropK > 0);
          if (c.loadK < 1) parcel.position.set(lerp(PARCEL_AT.x, shopAt.x, c.loadK), 0.3 + Math.sin(c.loadK * Math.PI) * 5 + c.loadK * 1.6, lerp(PARCEL_AT.z, shopAt.z, c.loadK));
          else parcel.position.set(lerp(q.x, HOME.x, c.dropK), lerp(2, 0.3, c.dropK) + Math.sin(c.dropK * Math.PI) * 5, lerp(q.z, HOME.z, c.dropK));
          size += (c.parcelGoal - size) * c.rate(6);
          parcel.scale.setScalar(size);
          sender.userData.arm.rotation.x = c.showA && !c.move && !c.done ? -0.25 + Math.sin(c.t * 5) * 0.22 : 2.5;
          customer.userData.arm.rotation.x = c.done || c.move ? -0.25 + Math.sin(c.t * 5) * 0.22 : 2.5;

          ghost.material.opacity = 0.78 * c.vb;
          ghost.geometry.setDrawRange(0, Math.floor((ghost.userData.total * clamp(c.vb)) / 6) * 6);
          ghost.visible = c.vb > 0.01;
          const gone = clamp((c.s - stops.shop) / Math.max(1, stops.home - stops.shop));
          trail.geometry.setDrawRange(0, Math.floor((trail.userData.total * gone) / 6) * 6);
          trail.visible = gone > 0;

          partners.forEach((p, i) => {
            const k = (c.t * 0.55 + i * 0.27) % 1;
            p.pulse.mesh.position.set(p.obj.position.x, 0.5, p.obj.position.z);
            p.pulse.mesh.scale.setScalar(reduceMotion ? 7 : 3 + k * 10);
            p.pulse.mat.opacity = c.on(i) ? (reduceMotion ? 0.7 : (1 - k) * 0.9) * c.lit[i] : 0;
          });
          arc.visible = c.sendOn && c.sentK > 0;
          arc.geometry.setDrawRange(0, Math.floor((arc.geometry.index.count * c.sentK) / 6) * 6);
          spark.material.opacity = c.sendOn && c.sentK > 0 && c.sentK < 1 ? 1 : 0;
          spark.position.copy(arcCurve.getPoint(c.sentK));
          runBurst(burst, c, HOME.x, 2, HOME.z, 6);

          LANES.forEach((l) => {
            const k = (c.t * 0.045 + l.at) % 1;
            const along = (k - 0.5) * 124 * l.dir;
            const scale = 1.5 * clamp(Math.min(k, 1 - k) * 14);
            if (l.axis === 'x') { l.obj.position.set(l.fixed, 0.08, along); l.obj.rotation.y = l.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
            else { l.obj.position.set(along, 0.08, l.fixed); l.obj.rotation.y = l.dir > 0 ? 0 : Math.PI; }
            l.obj.scale.setScalar(Math.max(0.001, scale));
            l.obj.userData.spin(along / 1.5);
          });
        },
        goal(c) {
          if (c.showA && !c.showB) return [PIN_A.x + 2, 0, PIN_A.z - 4, 1.5];
          if (c.sendOn) return [2, 0, 26, 1.2];
          if (c.arrive || c.move) return [q.x, 0, q.z, 1.55];
          if (c.done) return [HOME.x - 1, 0, HOME.z + 1, 1.75];
          return [0, 0, 4, 1];
        },
        anchors: () => ({
          a: [PIN_A.x, 14, PIN_A.z], b: [PIN_B.x, 14, PIN_B.z], load: [PARCEL_AT.x, -1, PARCEL_AT.z + 3], found: [0, 12, 4],
          partner: (i) => { const p = partners[i]; return [p.obj.position.x, p.h, p.obj.position.z]; },
          status: (c) => (c.done ? [HOME.x, 8, HOME.z] : [q.x, 9, q.z]),
        }),
      };
    }

    // ---- national: the map of India ---------------------------------------------
    function buildIndia() {
      const scene = new T.Scene();
      lit(scene, 70);
      const SCALE = 2.75;
      const LAT0 = 22; const LNG0 = 81;
      const pt = (ll) => [(ll[1] - LNG0) * SCALE, -(ll[0] - LAT0) * SCALE];
      const shapes = (window.UT_INDIA || []).filter((r) => r.length > 3).map((r) => {
        const s = new T.Shape();
        r.forEach(([lat, lng], i) => { const x = (lng - LNG0) * SCALE; const y = (lat - LAT0) * SCALE; if (i) s.lineTo(x, y); else s.moveTo(x, y); });
        s.closePath();
        return s;
      });
      const geo = new T.ExtrudeGeometry(shapes, { depth: 3.4, bevelEnabled: false });
      // Satellite picture, placed by latitude and longitude (the image covers 60-105 E, 2-40 N).
      const uv = geo.attributes.uv; const posA = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (posA.getX(i) / SCALE + LNG0 - 60) / 45, (posA.getY(i) / SCALE + LAT0 - 2) / 38);
      }
      const top = std('#8ba56f', 1);
      const map = new T.Mesh(geo, [top, std('#3f4a33', 1)]);
      map.rotation.x = -Math.PI / 2;
      map.position.y = -3.4;
      map.receiveShadow = true;
      map.castShadow = true;
      scene.add(map);
      let textureAsked = false;
      function askTexture() {
        if (textureAsked) return;
        textureAsked = true;
        loader.load('assets/journey/india-sat.jpg', (t) => { t.encoding = T.sRGBEncoding; t.anisotropy = 8; top.map = t; top.color.set('#ffffff'); top.needsUpdate = true; });
      }

      const CITIES = [[19.08, 72.88], [22.57, 88.36], [13.08, 80.27], [17.39, 78.49], [23.02, 72.57], [26.91, 75.79], [26.85, 80.95], [18.52, 73.86], [21.15, 79.09]];
      CITIES.forEach((ll) => {
        const [x, z] = pt(ll);
        const dot = glow('#ffe39a', 3.6, 0.9);
        dot.position.set(x, 0.6, z);
        scene.add(dot);
      });

      const TOY = 0.82;
      const place = (obj, ll, yaw, ox = 0, oz = 0) => { const [x, z] = pt(ll); obj.position.set(x + ox, 0.05, z + oz); obj.rotation.y = yaw; obj.scale.setScalar(TOY); scene.add(obj); return obj; };
      const truck = place(makeTruck({ name: 'Highway Freight', cab: '#2c5d8f', body: '#eef1f2', stripe: '#e39b1f', ink: '#2c5d8f' }), [13.08, 80.27], Math.PI);
      const plane = makePlaneModel('#ffffff', '#1f4e8c');
      plane.position.y = 3;
      place(plane, [17.39, 78.49], 0.4, 3, -2);
      plane.position.y = 3;
      const others = [
        { obj: plane, h: 7 },
        { obj: place(makeVan({ name: 'Swift Courier', body: '#ffffff', low: '#1f4e8c', stripe: '#e8483b', ink: '#1f4e8c' }), [19.08, 72.88], 0.5), h: 5 },
        { obj: place(makeTruck({ name: 'Metro Cargo', cab: '#b5482a', body: '#f6f1e4', stripe: '#f2b632', ink: '#8c3419' }), [22.57, 88.36], Math.PI, -3), h: 7 },
      ];
      const partners = [{ obj: truck, h: 7 }, ...others];
      partners.forEach((p) => { p.pulse = makePulse(scene); p.pulse.mesh.rotation.x = -Math.PI / 2; });

      const pinA = makePin('#f5b301', 'A');
      const pinB = makePin('#ffffff', 'B');
      scene.add(pinA, pinB);
      pinA.scale.setScalar(1.2);
      pinB.scale.setScalar(1.2);
      const parcel = makeParcel(1.9);
      scene.add(parcel);

      const SAMPLE_ROAD = ((window.UT_ROUTES && window.UT_ROUTES.india && window.UT_ROUTES.india.pts) || [[12.97, 77.59], [28.61, 77.21]]);
      const thin = SAMPLE_ROAD.filter((_, i) => i % Math.max(1, Math.floor(SAMPLE_ROAD.length / 40)) === 0);
      thin.push(SAMPLE_ROAD[SAMPLE_ROAD.length - 1]);
      let trip; let A; let B; let startAt; let ghost; let trail; let arcCurve; let arc; const stops = { start: 0, shop: 0, home: 0 };
      const ghostMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const trailMat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, depthWrite: false, toneMapped: false });
      const arcMat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, depthWrite: false, toneMapped: false });
      const spark = glow('#ffe39a', 6, 0);
      spark.renderOrder = 6;
      scene.add(spark);
      const burst = makeBurst(scene, 2.2);
      let last = '';
      function setRoute(fromLL, toLL) {
        const key = JSON.stringify([fromLL, toLL]);
        if (key === last) return;
        last = key;
        const road = fromLL && toLL ? [fromLL, [(fromLL[0] + toLL[0]) / 2 + 0.4, (fromLL[1] + toLL[1]) / 2 - 0.5], toLL] : thin;
        const roadPts = road.map(pt);
        A = roadPts[0];
        B = roadPts[roadPts.length - 1];
        // The partner starts in a nearby city, so they visibly come to the pickup and stay on land.
        const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
        startAt = CITIES.map(pt).filter((p) => dist(p, A) > 7 && dist(p, B) > 7).sort((p, q) => dist(p, A) - dist(q, A))[0];
        trip = roadPath([startAt, ...roadPts], 0, 0.6);
        let best = 1e9;
        for (let s = 0; s < trip.length; s += 0.1) {
          const q = trip.at(s);
          const d = Math.hypot(q.x - A[0], q.z - A[1]);
          if (d < best) { best = d; stops.shop = s; }
        }
        stops.home = trip.length;
        const line = [];
        for (let s = stops.shop; s <= stops.home; s += 0.6) { const q = trip.at(s); line.push(new T.Vector2(q.x, q.z)); }
        [ghost, trail, arc].forEach((m) => { if (m) { scene.remove(m); m.geometry.dispose(); } });
        ghost = ribbon(line, 0.32, ghostMat, 0.1);
        trail = ribbon(line, 0.5, trailMat, 0.14);
        ghost.renderOrder = 2;
        trail.renderOrder = 3;
        const from = new T.Vector3(A[0], 7, A[1]);
        const to = new T.Vector3(startAt[0], 4, startAt[1]);
        const mid = from.clone().lerp(to, 0.5);
        mid.y += 18;
        arcCurve = new T.QuadraticBezierCurve3(from, mid, to);
        arc = new T.Mesh(new T.TubeGeometry(arcCurve, 40, 0.34, 8), arcMat);
        arc.renderOrder = 5;
        scene.add(ghost, trail, arc);
      }
      setRoute(null, null);
      let q = trip.at(0);
      let size = 1;

      return {
        scene, stops, cam: { half: 56, az: 0.1, el: 0.98, sway: 0.03 }, count: 4, setRoute,
        reset() { askTexture(); },
        draw(c) {
          pinA.visible = c.va > 0.01;
          pinB.visible = c.vb > 0.01;
          pinA.position.set(A[0], 0.2 + (1 - backOut(clamp(c.va))) * 20 + c.bob, A[1]);
          pinB.position.set(B[0], 0.2 + (1 - backOut(clamp(c.vb))) * 20 + c.bob, B[1]);
          pinB.children[0].material.color.lerp(c.done ? c.green : c.white, c.rate(5));
          q = trip.at(c.s);
          const before = trip.at(c.s - 1.2); const after = trip.at(c.s + 1.2);
          truck.position.set(q.x, 0.05, q.z);
          truck.rotation.y = Math.atan2(-(after.z - before.z), after.x - before.x);
          truck.userData.spin(c.s * 3);

          parcel.visible = c.showA && (c.loadK < 1 || c.dropK > 0);
          if (c.loadK < 1) parcel.position.set(lerp(A[0] + 3.4, A[0], c.loadK), 0.1 + Math.sin(c.loadK * Math.PI) * 4, lerp(A[1] + 1.5, A[1], c.loadK));
          else parcel.position.set(lerp(q.x, B[0] + 3, c.dropK), 0.1 + Math.sin(c.dropK * Math.PI) * 4, lerp(q.z, B[1] + 1, c.dropK));
          size += (c.parcelGoal - size) * c.rate(6);
          parcel.scale.setScalar(size);

          ghostMat.opacity = 0.85 * c.vb;
          ghost.visible = c.vb > 0.01;
          ghost.geometry.setDrawRange(0, Math.floor((ghost.userData.total * clamp(c.vb)) / 6) * 6);
          const gone = clamp((c.s - stops.shop) / Math.max(1, stops.home - stops.shop));
          trail.geometry.setDrawRange(0, Math.floor((trail.userData.total * gone) / 6) * 6);
          trail.visible = gone > 0;
          partners.forEach((p, i) => {
            const k = (c.t * 0.55 + i * 0.27) % 1;
            p.pulse.mesh.position.set(p.obj.position.x, 0.4, p.obj.position.z);
            p.pulse.mesh.scale.setScalar(reduceMotion ? 6 : 2.5 + k * 8);
            p.pulse.mat.opacity = c.on(i) ? (reduceMotion ? 0.7 : (1 - k) * 0.9) * c.lit[i] : 0;
          });
          arc.visible = c.sendOn && c.sentK > 0;
          arc.geometry.setDrawRange(0, Math.floor((arc.geometry.index.count * c.sentK) / 6) * 6);
          spark.material.opacity = c.sendOn && c.sentK > 0 && c.sentK < 1 ? 1 : 0;
          spark.position.copy(arcCurve.getPoint(c.sentK));
          runBurst(burst, c, B[0], 2, B[1], 5);
        },
        goal(c) {
          if (c.showA && !c.showB) return [A[0], 0, A[1] - 4, 1.35];
          if (c.sendOn) return [(A[0] + startAt[0]) / 2, 0, (A[1] + startAt[1]) / 2 - 3, 1.35];
          if (c.arrive || c.move) return [q.x, 0, q.z, 1.45];
          if (c.done) return [B[0], 0, B[1], 1.6];
          return [0, 0, 0, 1];
        },
        anchors: () => ({
          a: [A[0], 8.5, A[1]], b: [B[0], 8.5, B[1]], load: [A[0] + 3, -1, A[1] + 3], found: [0, 5, -6],
          partner: (i) => { const p = partners[i]; return [p.obj.position.x, p.h, p.obj.position.z]; },
          status: (c) => (c.done ? [B[0], 7, B[1]] : [q.x, 7, q.z]),
        }),
      };
    }

    // ---- international: the globe -----------------------------------------------
    function buildGlobe() {
      const scene = new T.Scene();
      lit(scene, 80, false);
      const R = 56;
      const halo = glow('#7cc8ff', R * 2.9, 0.42);
      halo.renderOrder = -1;
      halo.material.depthTest = false;
      scene.add(halo);
      const spin = new T.Group();
      scene.add(spin);
      const skin = std('#1c5f86', 0.72, 0.02);
      spin.add(new T.Mesh(new T.SphereGeometry(R, 72, 48), skin));
      let textureAsked = false;
      function askTexture() {
        if (textureAsked) return;
        textureAsked = true;
        loader.load('https://cdn.jsdelivr.net/npm/three-globe@2.31.1/example/img/earth-blue-marble.jpg', (t) => { t.encoding = T.sRGBEncoding; t.anisotropy = 8; skin.map = t; skin.color.set('#ffffff'); skin.needsUpdate = true; });
      }
      // Latitude and longitude to a point, with the same mapping the Earth picture wraps with.
      const on = (ll, h = 0) => {
        const phi = ((90 - ll[0]) * Math.PI) / 180; const th = ((ll[1] + 180) * Math.PI) / 180;
        const r = R + h;
        return new T.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
      };
      const up = new T.Vector3(0, 1, 0);
      const standOn = (obj, v) => { obj.position.copy(v); obj.quaternion.setFromUnitVectors(up, v.clone().normalize()); };
      // A curve over the Earth's surface between two points.
      function arcBetween(a, b, lift) {
        const pts = [];
        const ua = a.clone().normalize(); const ub = b.clone().normalize();
        const angle = ua.angleTo(ub);
        for (let i = 0; i <= 36; i++) {
          const k = i / 36;
          const s0 = Math.sin((1 - k) * angle) / Math.sin(angle); const s1 = Math.sin(k * angle) / Math.sin(angle);
          pts.push(ua.clone().multiplyScalar(s0).add(ub.clone().multiplyScalar(s1)).normalize().multiplyScalar(R + 1 + Math.sin(k * Math.PI) * lift));
        }
        return new T.CatmullRomCurve3(pts);
      }
      const orient = (obj, v, tangent) => {
        const y = v.clone().normalize();
        const x = tangent.clone().sub(y.clone().multiplyScalar(tangent.dot(y))).normalize();
        const z = new T.Vector3().crossVectors(x, y);
        obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
      };
      const express = makePlaneModel('#ffffff', '#c2452a');
      express.scale.setScalar(1.05);
      spin.add(express);
      const freight = makePlaneModel('#eef1f2', '#2c5d8f');
      freight.scale.setScalar(1.05);
      spin.add(freight);
      const ship = makeShip();
      ship.scale.setScalar(1.25);
      spin.add(ship);
      const SHIP_LL = [12, 62]; const FREIGHT_LL = [19, 72];
      orient(freight, on(FREIGHT_LL, 4), new T.Vector3(1, 0.2, 0.3));
      freight.position.copy(on(FREIGHT_LL, 4));
      standOn(ship, on(SHIP_LL, 0.1));
      const items = [{ obj: express, h: 7 }, { obj: freight, h: 7 }, { obj: ship, h: 6 }];
      items.forEach((p) => { p.pulse = makePulse(scene); spin.add(p.pulse.mesh); });

      const pinA = makePin('#f5b301', 'A');
      const pinB = makePin('#ffffff', 'B');
      pinA.scale.setScalar(1.25);
      pinB.scale.setScalar(1.25);
      spin.add(pinA, pinB);
      const parcel = makeParcel(1.8);
      spin.add(parcel);
      const ghostMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const trailMat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, depthWrite: false, toneMapped: false });
      const arcMat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, depthWrite: false, toneMapped: false });
      const spark = glow('#ffe39a', 7, 0);
      spin.add(spark);
      const burst = makeBurst(spin, 2.6);
      const stops = { start: 0, shop: 1, home: 2 };
      let va; let vb; let inbound; let outbound; let ghost; let trail; let reqCurve; let req; let baseYaw = 0; let baseTilt = 0; let last = '';
      function setRoute(fromLL, toLL) {
        const f = fromLL || [28.61, 77.21];
        const d = toLL || [54, -2];
        const key = JSON.stringify([f, d]);
        if (key === last) return;
        last = key;
        va = on(f); vb = on(d);
        const start = on([f[0] - 16, f[1] - 22]); // the partner flies in from elsewhere
        inbound = arcBetween(start, va, 7);
        outbound = arcBetween(va, vb, 15);
        [ghost, trail, req].forEach((m) => { if (m) { spin.remove(m); m.geometry.dispose(); } });
        ghost = new T.Mesh(new T.TubeGeometry(outbound, 80, 0.36, 8), ghostMat);
        trail = new T.Mesh(new T.TubeGeometry(outbound, 80, 0.62, 8), trailMat);
        reqCurve = arcBetween(va, start, 14);
        req = new T.Mesh(new T.TubeGeometry(reqCurve, 40, 0.42, 8), arcMat);
        spin.add(ghost, trail, req);
        // Turn the Earth so both ends of the route face the camera.
        const mid = va.clone().add(vb).add(start.clone().multiplyScalar(0.4)).normalize();
        baseYaw = -Math.atan2(mid.x, mid.z);
        baseTilt = Math.atan2(mid.y, Math.hypot(mid.x, mid.z)) * 0.85;
      }
      setRoute(null, null);
      const v = new T.Vector3();
      let planeAt = on([0, 0]);
      let size = 1;
      const worldOf = (p) => { v.copy(p); spin.localToWorld(v); return [v.x, v.y, v.z]; };

      return {
        scene, stops, cam: { half: 72, az: 0, el: 0, sway: 0, globe: true }, count: 3, setRoute,
        reset() { askTexture(); },
        draw(c) {
          spin.rotation.set(baseTilt, baseYaw + (reduceMotion ? 0 : Math.sin(c.t * 0.22) * 0.06), 0);
          spin.updateMatrixWorld();
          const fall = (k) => 16 * (1 - backOut(clamp(k)));
          pinA.visible = c.va > 0.01;
          pinB.visible = c.vb > 0.01;
          standOn(pinA, va.clone().normalize().multiplyScalar(R + 0.1 + fall(c.va) + c.bob));
          standOn(pinB, vb.clone().normalize().multiplyScalar(R + 0.1 + fall(c.vb) + c.bob));
          pinB.children[0].material.color.lerp(c.done ? c.green : c.white, c.rate(5));

          const first = clamp(c.s);
          const second = clamp(c.s - 1);
          const curve = c.s <= 1 ? inbound : outbound;
          const k = c.s <= 1 ? first : second;
          const lift = 2.4 * Math.sin(k * Math.PI);
          planeAt = curve.getPoint(k).clone().normalize().multiplyScalar(curve.getPoint(k).length() + 2.2 + lift);
          express.position.copy(planeAt);
          orient(express, planeAt, curve.getTangent(k));

          const home = va.clone().normalize().multiplyScalar(R + 0.1);
          parcel.visible = c.showA && (c.loadK < 1 || c.dropK > 0);
          if (c.loadK < 1) { standOn(parcel, home.clone().lerp(planeAt, c.loadK)); parcel.translateX(2.2 * (1 - c.loadK)); }
          else { standOn(parcel, planeAt.clone().lerp(vb.clone().normalize().multiplyScalar(R + 0.1), c.dropK)); parcel.translateX(2.2 * c.dropK); }
          size += (c.parcelGoal - size) * c.rate(6);
          parcel.scale.setScalar(size);

          ghostMat.opacity = 0.85 * c.vb;
          ghost.visible = c.vb > 0.01;
          ghost.geometry.setDrawRange(0, Math.floor((ghost.geometry.index.count * clamp(c.vb)) / 6) * 6);
          trail.visible = second > 0;
          trail.geometry.setDrawRange(0, Math.floor((trail.geometry.index.count * second) / 6) * 6);
          items.forEach((p, i) => {
            const t = (c.t * 0.55 + i * 0.27) % 1;
            const ground = p.obj.position.clone().normalize();
            p.pulse.mesh.position.copy(ground.clone().multiplyScalar(R + 0.5));
            p.pulse.mesh.lookAt(spin.localToWorld(ground.clone().multiplyScalar(R * 3)));
            p.pulse.mesh.scale.setScalar(reduceMotion ? 6 : 2.5 + t * 9);
            p.pulse.mat.opacity = c.on(i) ? (reduceMotion ? 0.7 : (1 - t) * 0.9) * c.lit[i] : 0;
          });
          req.visible = c.sendOn && c.sentK > 0;
          req.geometry.setDrawRange(0, Math.floor((req.geometry.index.count * c.sentK) / 6) * 6);
          spark.material.opacity = c.sendOn && c.sentK > 0 && c.sentK < 1 ? 1 : 0;
          spark.position.copy(reqCurve.getPoint(c.sentK));
          const b = vb.clone().normalize().multiplyScalar(R + 2);
          runBurst(burst, c, b.x, b.y, b.z, 5);
        },
        goal(c) {
          if (c.showA && !c.showB) { const w = worldOf(va); return [w[0], w[1], 0, 1.3]; }
          if (c.arrive || c.move) { const w = worldOf(planeAt); return [w[0] * 0.5, w[1] * 0.5, 0, 1.28]; }
          if (c.done) { const w = worldOf(vb); return [w[0], w[1], 0, 1.45]; }
          return [0, 0, 0, 1];
        },
        anchors: () => {
          const lifted = (p, h) => worldOf(p.clone().normalize().multiplyScalar(R + h));
          return {
            a: lifted(va, 9), b: lifted(vb, 9), load: lifted(va, -1), found: [0, 42, 60],
            partner: (i) => (items[i] ? lifted(items[i].obj.position, 8) : null),
            status: (c) => (c.done ? lifted(vb, 8) : lifted(planeAt, 7)),
          };
        },
      };
    }

    // ---- the shared timeline ------------------------------------------------------
    const BUILD = { local: buildCity, national: buildIndia, international: buildGlobe };
    const built = {};
    let cur = null;
    let curName = '';
    const v = { a: 0, b: 0 };
    const clock = { net: 0, send: 0, done: 0, load: 0 };
    let ride = { from: 0, to: 0, start: 0, ms: 1, delay: 0 };
    let s = 0;
    const look = new T.Vector3(0, 0, 4);
    let zoom = 1;
    let az = Math.PI / 4; let el = 0.66;
    let tiltX = 0; let tiltY = 0; let tiltGoalX = 0; let tiltGoalY = 0;
    let W = 0; let H = 0;
    const px = new T.Vector3();
    const white = new T.Color('#ffffff').convertSRGBToLinear();
    const green = new T.Color('#2bb37c').convertSRGBToLinear();

    function resize() {
      const r = stage.getBoundingClientRect();
      W = r.width; H = r.height;
      if (!W || !H) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.6 : 2));
      renderer.setSize(W, H, false);
    }
    window.addEventListener('resize', resize);
    if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
      root.closest('.hero').addEventListener('pointermove', (e) => {
        const r = stage.getBoundingClientRect();
        tiltGoalX = clamp((e.clientX - r.left) / r.width - 0.5, -1, 1);
        tiltGoalY = clamp((e.clientY - r.top) / r.height - 0.5, -1, 1);
      });
    }

    function place2d(name, at, on, anchor = 'top') {
      const el2 = chipEl[name];
      const show2 = on && !!at;
      el2.classList.toggle('is-on', show2);
      if (!show2) return;
      px.set(at[0], at[1], at[2]).project(camera);
      const w = el2.offsetWidth; const h = el2.offsetHeight;
      const cx = clamp((px.x * 0.5 + 0.5) * W - w / 2, 4, W - w - 4);
      const sy = (0.5 - px.y * 0.5) * H;
      const cy = clamp(anchor === 'top' ? sy - h - 4 : sy + 6, 4, H - h - 4);
      el2.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
    }

    function step(dt, t, snap) {
      if (!cur) return;
      const rate = (k) => (snap ? 1 : 1 - Math.exp(-dt * k));
      const showA = has('is-a'); const showB = has('is-b');
      v.a += ((showA ? 1 : 0) - v.a) * rate(6);
      v.b += ((showB ? 1 : 0) - v.b) * rate(6);
      const net = has('is-net'); const sendOn = has('is-send'); const arrive = has('is-arrive'); const move = has('is-move'); const done = has('is-done');
      clock.net = net ? clock.net + dt : 0;
      clock.send = sendOn ? clock.send + dt : 0;
      clock.load = move || done ? clock.load + dt : 0;
      clock.done = done ? clock.done + dt : 0;
      if (snap) { clock.net = net ? 9 : 0; clock.send = sendOn ? 9 : 0; clock.load = move || done ? 9 : 0; clock.done = done ? 9 : 0; }
      if (ride.ms > 1) {
        const k = ease(clamp((performance.now() - ride.start - ride.delay) / ride.ms));
        s = snap ? ride.to : lerp(ride.from, ride.to, k);
      }
      const litList = [0, 1, 2, 3].map((i) => ease(clamp((clock.net - i * 0.26) / 0.35)));
      const sentK = ease(clamp((clock.send - 0.25) / 0.9));
      const c = {
        t, dt, rate, s, showA, showB, net, sendOn, arrive, move, done, va: v.a, vb: v.b, clock, lit: litList, sentK, white, green,
        bob: reduceMotion ? 0 : Math.sin(t * 2) * 0.25,
        loadK: ease(clamp(clock.load / 0.6)), dropK: ease(clamp(clock.done / 0.7)),
        parcelGoal: has('is-load') ? clamp(0.85 + Math.log10(trip_.kg + 1) * 0.42, 0.85, 2.1) : 1,
        on: (i) => net && i < cur.count && litList[i] > 0.02 && (!sendOn || i === 0),
      };
      cur.draw(c);

      // Camera: it moves with the story.
      const [gx, gy, gz, gZoom] = cur.goal(c);
      zoom += (gZoom - zoom) * rate(2.1);
      look.x += (gx - look.x) * rate(2.1);
      look.y += (gy - look.y) * rate(2.1);
      look.z += (gz - look.z) * rate(2.1);
      tiltX += (tiltGoalX - tiltX) * rate(3);
      tiltY += (tiltGoalY - tiltY) * rate(3);
      const C = cur.cam;
      az = C.az + (reduceMotion ? 0 : Math.sin(t * 0.16) * C.sway) + (C.globe ? 0 : tiltX * 0.09);
      el = C.el - (C.globe ? 0 : tiltY * 0.05);
      const aspect = W / H;
      camera.left = -C.half * aspect; camera.right = C.half * aspect;
      camera.top = C.half; camera.bottom = -C.half;
      camera.position.set(look.x + Math.sin(az) * Math.cos(el) * 400, look.y + Math.sin(el) * 400, look.z + Math.cos(az) * Math.cos(el) * 400);
      camera.zoom = zoom;
      camera.lookAt(look);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      renderer.render(cur.scene, camera);

      // Labels, after the frame so they sit exactly on it.
      const A = cur.anchors();
      const quiet = has('is-list');
      place2d('a', A.a, showA && !quiet && !move && !done && !arrive);
      place2d('b', A.b, showB && !quiet && !done);
      place2d('load', A.load, has('is-load') && !quiet, 'below');
      [0, 1, 2, 3].forEach((i) => place2d('p' + i, i < cur.count ? A.partner(i) : null, c.on(i) && !quiet));
      place2d('found', A.found, has('is-found'));
      const status = sendOn && sentK >= 1 ? 'Request accepted' : move && clock.load < 2 ? 'Pickup OTP verified' : done ? 'Delivered · OTP verified' : '';
      if (status) chip('status', status);
      place2d('status', A.status(c), !!status && (!done || clock.done > 0.5));
    }

    let raf = 0; let visible = true; let last = 0;
    function frame(now) {
      raf = 0;
      if (!visible || reduceMotion) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      step(dt, now / 1000, false);
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && visible && !reduceMotion) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function resetRide() {
      ride = { from: 0, to: 0, start: 0, ms: 1, delay: 0 };
      s = 0;
      Object.assign(clock, { net: 0, send: 0, done: 0, load: 0 });
    }

    resize();
    return {
      setVisible(on) { visible = on; if (on) kick(); },
      kick,
      still() { if (W) step(0.016, 1, true); },
      startRide(a, b, ms, delay = 0) { ride = { from: cur.stops[a], to: cur.stops[b], start: performance.now(), ms, delay }; },
      reset: resetRide,
      name: () => curName,
      // Change the setting. The camera jumps with it, since the stage has faded out.
      use(name) {
        if (name === curName) return;
        if (!built[name]) built[name] = BUILD[name]();
        cur = built[name];
        curName = name;
        if (cur.reset) cur.reset();
        look.set(0, 0, name === 'local' ? 4 : 0);
        zoom = 1;
        v.a = 0; v.b = 0;
        resetRide();
      },
      setRoute(fromLL, toLL) { if (cur && cur.setRoute) cur.setRoute(fromLL, toLL); },
    };
  }

  // Filled in by update(); read while drawing the parcel.
  const trip_ = { a: '', b: '', kg: 0 };
  const world = buildWorld();
  if (!world) root.classList.add('film--plain');

  const scaleEls = Array.from(root.querySelectorAll('[data-scale]'));
  const cardRows = $('[data-film-rows]');
  const creditEl = $('[data-film-credit]');
  function labelScale(name) {
    scaleEls.forEach((el) => el.classList.toggle('is-on', el.dataset.scale === name));
    if (creditEl) creditEl.hidden = name === 'local';
    const sample = SAMPLES[name];
    if (cardRows.dataset.for !== name) { cardRows.innerHTML = sample.rows.join(''); cardRows.dataset.for = name; }
    sample.partners.forEach((text, i) => chip('p' + i, text));
  }
  function setScale(name, then) {
    labelScale(name);
    if (!world) { if (then) then(); return; }
    if (world.name() === name) { if (then) then(); return; }
    world.use(name);
    if (then) then();
  }

  // ---- the sample loop ------------------------------------------------------
  let live = false;
  let timer = null;
  let beat = 0;
  let scene = 0;
  let onScreen = true;
  function stopLoop() { clearTimeout(timer); timer = null; }
  function playBeat() {
    const b = BEATS[beat];
    if (beat === 0) {
      const name = ORDER[scene];
      setScale(name);
      if (world) { world.setRoute(null, null); world.reset(); }
      chip('a', SAMPLES[name].a);
      chip('b', SAMPLES[name].b);
    }
    root.classList.remove('is-fading');
    show(b.on, b.step, b.text);
    if (b.ride && world) world.startRide(b.ride[0], b.ride[1], b.ride[2], b.ride[3] || 0);
    // The later settings run a little quicker, so the whole loop stays watchable.
    timer = setTimeout(() => {
      if (beat < BEATS.length - 1) { beat++; playBeat(); return; }
      root.classList.add('is-fading');
      timer = setTimeout(() => { beat = 0; scene = (scene + 1) % ORDER.length; playBeat(); }, 380);
    }, b.ms);
  }
  function startSample() {
    stopLoop();
    live = false;
    sampleEl.hidden = false;
    if (reduceMotion) {
      setScale('local');
      chip('a', SAMPLES.local.a);
      chip('b', SAMPLES.local.b);
      show(['is-a', 'is-b', 'is-net'], 3, 'See the services available on your route, then select the partner you want.');
      return;
    }
    beat = 0;
    if (onScreen) playBeat();
  }
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (world) world.setVisible(onScreen);
    if (live || reduceMotion) return;
    if (onScreen && !timer) { beat = 0; playBeat(); }
    if (!onScreen) stopLoop();
  }).observe(root);

  // ---- following the visitor's route ----------------------------------------
  let phase = 'typing'; // typing | search | found
  let found = null;
  function render() {
    const on = [];
    if (trip_.a) on.push('is-a');
    if (trip_.b) on.push('is-b');
    if (trip_.kg) on.push('is-load');
    if (phase === 'search') on.push('is-net', 'is-search');
    if (phase === 'found') on.push('is-net', 'is-found');
    let step = trip_.a ? (trip_.b ? 2 : 1) : 0;
    let text = 'Enter your pickup location or pin code.';
    if (trip_.a) text = 'Now add where it needs to go.';
    if (trip_.a && trip_.b) text = 'Add the weight so we can match the right vehicles.';
    if (trip_.a && trip_.b && trip_.kg) text = 'Ready. Find the services available on your route.';
    if (phase === 'search') { step = 3; text = 'Finding the services available on your route…'; }
    if (phase === 'found') { step = 3; text = found; }
    show(on, step, text);
  }
  function takeOver() {
    if (live) return;
    live = true;
    stopLoop();
    root.classList.remove('is-fading');
    sampleEl.hidden = true;
    if (world) { world.reset(); world.setRoute(null, null); }
    Object.assign(trip_, { a: '', b: '', kg: 0 });
    phase = 'typing';
    setScale('local');
    render();
  }

  if (document.fonts && document.fonts.ready && world) document.fonts.ready.then(() => world.kick());
  startSample();
  if (world) world.kick();

  return {
    takeOver,
    backToSample: () => { Object.assign(trip_, { a: '', b: '', kg: 0 }); scene = 0; if (world) world.reset(); startSample(); },
    isLive: () => live,
    update({ a = '', b = '', kg = 0, scale = 'local', fromLL = null, toLL = null }) {
      takeOver();
      trip_.a = a;
      trip_.b = b;
      trip_.kg = kg;
      setScale(scale);
      if (world && scale !== 'local' && fromLL && toLL) world.setRoute(fromLL, toLL);
      if (a) chip('a', 'Pickup · ' + short(a));
      if (b) chip('b', 'Drop · ' + short(b));
      if (kg) chip('load', kg >= 1000 ? +(kg / 1000).toFixed(1) + ' t' : +kg.toFixed(1) + ' kg');
      phase = 'typing';
      render();
    },
    searching() { takeOver(); phase = 'search'; render(); },
    showFound(count, text) {
      chip('found', count === 1 ? '1 service found' : count + ' services found');
      phase = 'found';
      found = text;
      render();
    },
    minSearchMs: reduceMotion ? 0 : 1600,
  };
})();
