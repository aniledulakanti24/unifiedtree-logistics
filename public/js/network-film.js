// How the platform works, as one scroll-pinned 3D film in a single city: a shop has a
// parcel to send, the available services appear, the sender selects one, the request goes
// to that partner only, and the partner collects it and delivers it. Everything is built here in code, with no
// downloaded textures. Scroll sets the position; the clock keeps the beacons alive.
// Needs three.js (r128); without it or WebGL the stages stay as plain text.
(function () {
  'use strict';
  const root = document.getElementById('journey');
  if (!root || !window.THREE || !window.UTKit) return;
  const T = window.THREE;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FONT = '"Plus Jakarta Sans", Arial, sans-serif';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (k) => k * k * (3 - 2 * k);
  const seeded = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  // ---- timeline ------------------------------------------------------------
  const ACTS = [
    { id: 'request', a: 0, b: 0.16 },
    { id: 'services', a: 0.16, b: 0.36 },
    { id: 'choose', a: 0.36, b: 0.52 },
    { id: 'pickup', a: 0.52, b: 0.72 },
    { id: 'deliver', a: 0.72, b: 0.9 },
    { id: 'network', a: 0.9, b: 1 },
  ];
  const ROUTE = 'Koramangala → Whitefield'; // the same sample route as the hero film
  const ROUTE_KM = 19.2;

  const { canvasTex, glow, groundShadow, std, shadow, box, wallBox, limb, makeParcel, paint, vinyl, glassIcon, roundedShape, moulded, rbox, capsule, iconWheel, sideText, lamp, rig, contact, makeBike, iconCar, iconAuto, makeVan, makeTruck, makeAuto, makeParkedCar, makePerson, makePin, pill, roadPath, ribbon } = window.UTKit;

  // ---- the city -----------------------------------------------------------------
  const LIVERY = {
    van: { name: 'Ravi Transport', body: '#f6f1e4', low: '#b5482a', stripe: '#f2b632', ink: '#8c3419' },
    courier: { name: 'Swift Courier', body: '#ffffff', low: '#1f4e8c', stripe: '#e8483b', ink: '#1f4e8c' },
    truck: { name: 'Highway Freight', cab: '#2c5d8f', body: '#eef1f2', stripe: '#e39b1f', ink: '#2c5d8f' },
  };
  const SHOP = { x: -72, z: -5.2 };
  const HOME = { x: 72, z: -53.2 };

  function buildCity({ narrow, renderer }) {
    const scene = new T.Scene();
    scene.background = new T.Color('#cfe2ea');
    scene.fog = new T.Fog('#cfe2ea', 210, 520);
    const camera = new T.PerspectiveCamera(40, 1.6, 1, 1500);

    // Soft sky for the paint reflections, generated rather than downloaded.
    const envScene = new T.Scene();
    const skyTex = canvasTex(8, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#7fb2d6');
      g.addColorStop(0.5, '#f4f6ee');
      g.addColorStop(0.56, '#8c8f7c');
      g.addColorStop(1, '#5d6252');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    envScene.add(new T.Mesh(new T.SphereGeometry(50, 24, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide })));
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();

    scene.add(new T.HemisphereLight('#f4f8ff', '#8d927a', 0.55));
    const sun = new T.DirectionalLight('#fff1d8', 1.7);
    sun.position.set(-110, 190, 90);
    sun.castShadow = true;
    const span = 200;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 20, far: 520 });
    sun.shadow.mapSize.set(narrow ? 1024 : 2048, narrow ? 1024 : 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.4;
    scene.add(sun);

    const rnd = seeded(41);
    const GRID = [-144, -96, -48, 0, 48, 96, 144];
    const ground = new T.Mesh(new T.PlaneGeometry(1400, 1400), std('#a8b58f', 1));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const dash = canvasTex(32, 128, (c, w, h) => {
      c.fillStyle = '#41464c';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e9e6d8';
      c.fillRect(w / 2 - 1, 0, 2, h * 0.5);
    });
    dash.wrapT = T.RepeatWrapping;
    dash.repeat.set(1, 56);
    const roadMat = std('#ffffff', 0.95, 0, { map: dash });
    GRID.forEach((v, i) => {
      const a = new T.Mesh(new T.PlaneGeometry(8, 336), roadMat);
      a.rotation.x = -Math.PI / 2;
      a.position.set(v, 0.03, 0);
      a.receiveShadow = true;
      scene.add(a);
      const b = new T.Mesh(new T.PlaneGeometry(8, 336), roadMat);
      b.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      b.position.set(0, 0.05 + i * 0.001, v);
      b.receiveShadow = true;
      scene.add(b);
    });

    // Reserved plots: the shop, the customer's home, the courier depot, a park, and open
    // squares facing the shop and the home so the camera has a clear view of them.
    const RESERVED = [[-72, -13, 12], [72, -59, 12], [24, 72, 26], [24, -24, 26], [-72, 24, 24], [72, -24, 24]];
    const free = (x, z) => !RESERVED.some(([rx, rz, r]) => Math.abs(x - rx) < r && Math.abs(z - rz) < r);

    const windows = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#3e5866';
      c.fillRect(14, 14, 36, 36);
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.fillRect(14, 14, 36, 13);
    });
    windows.wrapS = windows.wrapT = T.RepeatWrapping;
    const walls = ['#efe4cf', '#e6c9a8', '#d9a98a', '#c9d6c6', '#dfe2de', '#e8d78f'].map((c) => {
      const wall = std(c, 0.82, 0, { map: windows });
      const roof = std('#b9b4a8', 0.9);
      return [wall, wall, roof, roof, wall, wall];
    });
    const paving = std('#a39f92', 0.95);
    for (let i = 0; i < GRID.length - 1; i++) {
      for (let j = 0; j < GRID.length - 1; j++) {
        const bx = GRID[i] + 24; const bz = GRID[j] + 24;
        const slab = new T.Mesh(new T.BoxGeometry(40, 0.16, 40), paving);
        slab.position.set(bx, 0.08, bz);
        slab.receiveShadow = true;
        scene.add(slab);
        [-9, 9].forEach((ox) => [-9, 9].forEach((oz) => {
          const x = bx + ox; const z = bz + oz;
          if (!free(x, z) || rnd() < 0.08) return;
          const w = 13 + rnd() * 3; const d = 13 + rnd() * 3;
          const centre = Math.hypot(x, z) < 130;
          const h = (centre ? 8 : 6) + rnd() * (centre ? 15 : 9);
          const b = wallBox(w, h, d, walls[Math.floor(rnd() * walls.length)], 3.4);
          b.position.set(x, h / 2 + 0.16, z);
          scene.add(b);
          if (rnd() < 0.3) { // water tank on the roof, as on most Indian city buildings
            const tank = new T.Mesh(new T.CylinderGeometry(1, 1, 1.6, 12), std('#2b3a42', 0.6));
            tank.position.set(x + 2, h + 1, z - 2);
            scene.add(shadow(tank));
          }
        }));
      }
    }

    // Trees: the park, plus a few along the pavements.
    const spots = [];
    for (let i = 0; i < 26; i++) spots.push([24 + (rnd() - 0.5) * 34, -24 + (rnd() - 0.5) * 34]);
    for (let i = 0; i < 12; i++) { spots.push([-90 + i * 3.4, 34 + rnd() * 9]); spots.push([54 + i * 3.2, -6 - rnd() * 8]); }
    GRID.slice(0, -1).forEach((v) => GRID.slice(0, -1).forEach((u) => { if (rnd() < 0.55 && free(v + 6, u + 5)) spots.push([v + 6, u + 5]); }));
    const crownG = new T.IcosahedronGeometry(2.6, 1);
    const trunkG = new T.CylinderGeometry(0.28, 0.4, 2.6, 7);
    const crowns = new T.InstancedMesh(crownG, std('#5f8f4e', 0.9, 0, { flatShading: true }), spots.length);
    const trunks = new T.InstancedMesh(trunkG, std('#6d543c', 0.9), spots.length);
    const dummy = new T.Object3D();
    spots.forEach(([x, z], i) => {
      const s = 0.8 + rnd() * 0.7;
      dummy.position.set(x, 1.4, z); dummy.scale.set(1, s, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 2.4 + 2.2 * s, z); dummy.scale.set(s, s * 1.1, s); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    crowns.castShadow = true;
    trunks.castShadow = true;
    scene.add(crowns, trunks);
    const lawn = new T.Mesh(new T.BoxGeometry(38, 0.2, 38), std('#7fa864', 0.95));
    lawn.position.set(24, 0.1, -24);
    lawn.receiveShadow = true;
    scene.add(lawn);
    const pond = new T.Mesh(new T.CylinderGeometry(6, 6, 0.1, 28), std('#5da3c4', 0.15, 0.2));
    pond.position.set(30, 0.24, -30);
    scene.add(pond);

    // The sender: a shop on the street.
    const shopWall = std('#f3e8d2', 0.85);
    const shop = box(18, 7.4, 12, shopWall, -72, 3.86, -13);
    shop.receiveShadow = true;
    scene.add(shop);
    scene.add(box(18.6, 0.5, 13, std('#b5482a', 0.6), -72, 7.8, -13));
    const awning = box(16, 0.3, 2.2, vinyl('#c2452a'), -72, 3.9, -6);
    awning.rotation.x = 0.22;
    scene.add(awning);
    const sign = (text, w, h, bg, ink) => new T.MeshStandardMaterial({ map: canvasTex(Math.round(512 * w / h), 512, (c, cw, ch) => {
      c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
      c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
      let size = 320;
      do { c.font = `800 ${size}px ${FONT}`; size -= 10; } while (c.measureText(text).width > cw * 0.92);
      c.fillText(text, cw / 2, ch / 2 + 10);
    }), roughness: 0.6 });
    const shopSign = new T.Mesh(new T.PlaneGeometry(13, 1.8), sign('Lakshmi Textiles', 13, 1.8, '#10543f', '#ffd872'));
    shopSign.position.set(-72, 5.8, -6.94);
    scene.add(shopSign);
    const shopDoor = box(3, 3.2, 0.2, std('#31434c', 0.3, 0.3), -72, 1.76, -6.95);
    scene.add(shopDoor);
    [-79, -65].forEach((x) => scene.add(box(4, 2.4, 0.2, glassIcon(), x, 2, -6.95)));
    const sender = makePerson('#c2452a');
    sender.position.set(SHOP.x - 2.6, 0.16, SHOP.z);
    sender.rotation.y = -Math.PI / 2 + 0.6;
    scene.add(sender);

    // The customer: a house across town.
    const house = box(13, 8, 10, std('#e8d6bb', 0.85), HOME.x, 4.16, -60);
    house.receiveShadow = true;
    scene.add(house);
    const roof = box(14.2, 0.6, 11.2, std('#a5522f', 0.7), HOME.x, 8.46, -60);
    scene.add(roof);
    scene.add(box(2.4, 3.8, 0.24, std('#6b3f26', 0.5), HOME.x + 0.5, 2.06, -54.95));
    [-4, 5].forEach((x) => scene.add(box(2.6, 2.2, 0.2, glassIcon(), HOME.x + x, 5.4, -54.95)));
    const customer = makePerson('#2c7a68', '#a36b47');
    customer.position.set(HOME.x - 1.6, 0.16, HOME.z);
    customer.rotation.y = Math.PI / 2 - 0.5;
    scene.add(customer);

    // A courier service: depot, stacked parcels, its own van.
    scene.add(box(32, 9, 20, std('#e4e8ea', 0.8), 24, 4.66, 74));
    scene.add(box(32.6, 0.5, 20.6, std('#1f4e8c', 0.6), 24, 9.4, 74));
    const depotSign = new T.Mesh(new T.PlaneGeometry(18, 2.4), sign('Swift Courier', 18, 2.4, '#1f4e8c', '#ffffff'));
    depotSign.position.set(24, 6.8, 63.94);
    scene.add(depotSign);
    [12, 24, 36].forEach((x) => scene.add(box(6.5, 4.4, 0.2, std('#50606a', 0.5, 0.2), x, 2.4, 63.96)));
    for (let i = 0; i < 9; i++) {
      const p = makeParcel(1.15);
      p.position.set(3 + (i % 3) * 1.4, 0.16 + Math.floor(i / 3) * 0.95, 60 + Math.floor(i / 3) * 0.3);
      scene.add(p);
    }

    // The partners waiting around the city. Parked along their own lanes.
    const placed = (obj, x, z, yaw) => { obj.position.set(x, 0.05, z); obj.rotation.y = yaw; scene.add(obj); return obj; };
    const partners = [
      { name: 'Delivery partner', obj: placed(makeBike('#2c7a68', 'Zip Riders'), -24, 46, 0), h: 3.6, drive: [-1, 0] },
      { name: 'Three-wheeler owner', obj: placed(makeAuto('#e9b92f'), -50, -70, Math.PI / 2), h: 3.4, drive: [0, -1] },
      { name: 'Courier service', obj: placed(makeVan(LIVERY.courier), 24, 56, 0), h: 11.5, drive: null },
      { name: 'Truck owner', obj: placed(makeTruck(LIVERY.truck), 94, 34, Math.PI / 2), h: 6, drive: [0, -1] },
    ];
    const chosenVan = placed(makeVan(LIVERY.van), -98, 46, Math.PI / 2);
    const CHOSEN = { name: 'Independent van', obj: chosenVan, h: 4.2, drive: null };
    partners.push(CHOSEN);
    [['#e7e7e2', -144, 20, 0], ['#7b2d2d', 2, 98, 0], ['#34506b', 98, -100, Math.PI / 2], ['#d8d2c2', -2, -96, 0], ['#3a3f45', 50, 110, Math.PI / 2]]
      .forEach(([c, x, z, yaw]) => placed(makeParkedCar(c), x, z, yaw));

    const pinA = makePin('#f2b632', 'A');
    const pinB = makePin('#ffffff', 'B');
    scene.add(pinA, pinB);

    // The van's whole trip; it stops at the shop, then carries on to the customer.
    const trip = roadPath([[-96, 46], [-96, 0], [48, 0], [48, -48], [84, -48]]);
    let sShop = 0; let sHome = 0; { // nearest points on the path to each door
      let bestA = 1e9; let bestB = 1e9;
      for (let s = 0; s < trip.length; s += 0.25) {
        const q = trip.at(s);
        const a = Math.hypot(q.x - (SHOP.x + 1), q.z - SHOP.z);
        const b = Math.hypot(q.x - (HOME.x + 2), q.z - HOME.z);
        if (a < bestA) { bestA = a; sShop = s; }
        if (b < bestB) { bestB = b; sHome = s; }
      }
    }
    const even = [];
    for (let s = 0; s <= trip.length; s += 1.5) { const q = trip.at(s); even.push(new T.Vector2(q.x, q.z)); }
    const routeGhost = ribbon(even, 0.45, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
    const routeGold = ribbon(even, 0.6, new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, depthWrite: false, fog: false, toneMapped: false }), 0.14);
    routeGhost.renderOrder = 2;
    routeGold.renderOrder = 3;
    scene.add(routeGhost, routeGold);

    // Available partners, and the request that goes to the selected one: an arc and a ring.
    const ringMats = [];
    const rings = [0, 1, 2].map(() => {
      const mat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, fog: false, toneMapped: false });
      ringMats.push(mat);
      const r = new T.Mesh(new T.RingGeometry(0.965, 1, 96), mat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(SHOP.x, 0.5, SHOP.z);
      r.renderOrder = 4;
      scene.add(r);
      return r;
    });
    const origin = new T.Vector3(SHOP.x, 6, SHOP.z);
    const links = partners.map((pt) => {
      const end = new T.Vector3(pt.obj.position.x, pt.h, pt.obj.position.z);
      const dist = origin.distanceTo(end);
      const mid = origin.clone().lerp(end, 0.5);
      mid.y += 14 + dist * 0.16;
      const curve = new T.QuadraticBezierCurve3(origin, mid, end);
      const mat = new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
      const tube = new T.Mesh(new T.TubeGeometry(curve, 48, narrow ? 0.42 : 0.3, 6), mat);
      tube.renderOrder = 5;
      scene.add(tube);
      const spark = glow('#ffd872', 5, 0);
      scene.add(spark);
      const beacon = new T.Mesh(new T.CylinderGeometry(1.3, 1.3, 40, 16, 1, true), new T.MeshBasicMaterial({ color: '#f5b301', transparent: true, opacity: 0, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false, fog: false, toneMapped: false }));
      beacon.position.set(end.x, 20, end.z);
      scene.add(beacon);
      return { curve, mat, tube, spark, beacon, dist, total: tube.geometry.index.count, home: pt.obj.position.clone(), obj: pt.obj, h: pt.h, label: pill(pt.name), chosen: pt === CHOSEN };
    });
    links.forEach((l) => scene.add(l.label));
    const maxDist = Math.max(...links.map((l) => l.dist));

    const labels = {
      pickup: pill('Pickup · Koramangala', { bg: '#f5b301' }),
      drop: pill('Drop · Whitefield'),
      chosen: pill('Selected · Independent van', { bg: '#0b5d45', ink: '#ffffff' }),
      accepted: pill('Request accepted', { bg: '#1e9e6a', ink: '#ffffff' }),
      otpA: pill('Pickup OTP verified', { bg: '#0b5d45', ink: '#ffffff' }),
      otpB: pill('Delivered · OTP verified', { bg: '#1e9e6a', ink: '#ffffff' }),
    };
    Object.values(labels).forEach((l) => scene.add(l));

    const parcel = makeParcel(1.5);
    scene.add(parcel);

    // ---- camera: fixed marks, plus following the van while it drives -------------
    const MARKS = [
      [0, [-58, 5, 13], [-72, 3, -6]],
      [0.1, [-50, 11, 28], [-72, 4, -6]],
      [0.2, [-34, 66, 104], [-30, 0, 8]],
      [0.34, [-16, 158, 214], [-34, 0, -22]],
      [0.5, [-44, 132, 190], [-62, 0, -6]],
      [0.86, [92, 13, -28], [72, 3, -55]],
      [0.9, [92, 13, -28], [72, 3, -55]],
      [1, [-4, 206, 274], [-16, 0, -18]],
    ];
    const v3 = (a) => new T.Vector3(a[0], a[1], a[2]);
    const camPos = new T.Vector3();
    const camLook = new T.Vector3();
    function placeCamera(p, d, fit) {
      let i = 1;
      while (i < MARKS.length - 1 && MARKS[i][0] < p) i++;
      const [pa, a, la] = MARKS[i - 1];
      const [pb, b, lb] = MARKS[i];
      const k = ease(seg(p, pa, pb));
      camPos.lerpVectors(v3(a), v3(b), k);
      camLook.lerpVectors(v3(la), v3(lb), k);
      const w = ease(seg(p, 0.52, 0.565)) * (1 - ease(seg(p, 0.835, 0.875)));
      if (w > 0) {
        const behind = trip.at(d - 20);
        const here = trip.at(d);
        const ahead = trip.at(d + 8);
        camPos.lerp(new T.Vector3(behind.x - behind.dz * 3.5, 13, behind.z + behind.dx * 3.5), w);
        camLook.lerp(new T.Vector3((here.x + ahead.x) / 2, 1.5, (here.z + ahead.z) / 2), w);
      }
      camPos.sub(camLook).multiplyScalar(fit).add(camLook);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    }
    // Labels keep their size on screen wherever the camera goes.
    function showLabel(s, x, y, z, opacity) {
      s.material.opacity = opacity;
      s.visible = opacity > 0.01;
      if (!s.visible) return;
      s.position.set(x, y, z);
      const size = camera.position.distanceTo(s.position) * (narrow ? 0.022 : 0.032);
      s.scale.set(size * s.userData.aspect, size, 1);
    }

    function update(p, t, fit) {
      // Portrait screens sit further back, so the haze moves back with them.
      scene.fog.near = 210 * fit;
      scene.fog.far = 520 * fit;
      // --- the van
      const toShop = ease(seg(p, 0.53, 0.645));
      const toHome = ease(seg(p, 0.725, 0.85));
      const d = lerp(lerp(0, sShop, toShop), sHome, toHome);
      const q = trip.at(d);
      chosenVan.position.set(q.x, 0.05, q.z);
      chosenVan.rotation.y = q.yaw;
      chosenVan.userData.spin(d);
      placeCamera(p, d, fit);

      // --- pins and the parcel
      const dropA = ease(seg(p, 0.015, 0.06));
      const dropB = ease(seg(p, 0.09, 0.14));
      const bob = Math.sin(t * 1.8) * 0.2;
      pinA.position.set(SHOP.x, 8 + (1 - dropA) * 18 + bob, SHOP.z);
      pinA.visible = dropA > 0;
      pinB.position.set(HOME.x, 10 + (1 - dropB) * 18 + bob, -53);
      pinB.visible = dropB > 0;
      const load = ease(seg(p, 0.645, 0.685));
      const drop = ease(seg(p, 0.85, 0.885));
      const rearA = trip.at(sShop - 2.4);
      const rearB = trip.at(sHome - 2.4);
      if (load < 1) {
        parcel.position.set(lerp(SHOP.x, rearA.x, load), 0.16 + Math.sin(load * Math.PI) * 3.2 + load, lerp(SHOP.z, rearA.z, load));
        parcel.visible = true;
      } else if (drop > 0) {
        parcel.position.set(lerp(rearB.x, HOME.x + 0.6, drop), 1.16 + Math.sin(drop * Math.PI) * 3 - drop, lerp(rearB.z, HOME.z, drop));
        parcel.visible = true;
      } else parcel.visible = false;
      sender.userData.arm.rotation.x = p < 0.2 || (p > 0.63 && p < 0.72) ? -0.25 + Math.sin(t * 5) * 0.22 : 2.5;
      customer.userData.arm.rotation.x = p > 0.8 ? -0.25 + Math.sin(t * 5) * 0.22 : 2.5;

      // --- available services light up on the map
      const reveal = seg(p, 0.17, 0.3);
      const othersFade = 1 - seg(p, 0.42, 0.45);
      const network = seg(p, 0.905, 0.95);
      links.forEach((l) => {
        const at = l.dist / maxDist;
        const lit = ease(seg(reveal, at * 0.7, Math.min(1, at * 0.7 + 0.3)));
        const show = Math.max(lit * (l.chosen ? 1 - seg(p, 0.53, 0.56) : othersFade), network);
        l.beacon.material.opacity = (0.2 + Math.sin(t * 3 + l.dist) * 0.05) * show;
        l.beacon.position.x = l.obj.position.x;
        l.beacon.position.z = l.obj.position.z;
        showLabel(l.label, l.obj.position.x, l.h, l.obj.position.z, l.chosen ? lit * othersFade + network : show);
        // Once the sender selects, the request goes to that one partner only.
        const sent = l.chosen ? ease(seg(p, 0.445, 0.5)) : 0;
        l.tube.geometry.setDrawRange(0, Math.floor((l.total * sent) / 6) * 6);
        l.mat.opacity = sent > 0 ? 0.9 * (1 - seg(p, 0.53, 0.56)) : 0;
        l.spark.position.copy(l.curve.getPoint(sent));
        l.spark.material.opacity = sent > 0 && sent < 1 ? 1 : 0;
      });
      // The partner accepts: one ring around the van.
      rings.forEach((r, i) => {
        const k = clamp(seg(p, 0.495, 0.535) * 1.5 - i * 0.25);
        r.position.set(chosenVan.position.x, 0.5, chosenVan.position.z);
        r.scale.setScalar(2 + k * 34);
        ringMats[i].opacity = k > 0 && k < 1 ? (1 - k) * 0.95 : 0;
      });
      // Other partners head off to other jobs at the end.
      partners.forEach((pt, i) => {
        if (!pt.drive) return;
        const go = ease(seg(p, 0.92, 1)) * 34;
        const h = links[i].home;
        pt.obj.position.set(h.x + pt.drive[0] * go, 0.05, h.z + pt.drive[1] * go);
        pt.obj.userData.spin(go);
      });

      // --- the chosen route
      routeGhost.material.opacity = 0.75 * seg(p, 0.46, 0.5) * (1 - seg(p, 0.92, 0.96));
      routeGold.material.opacity = 1 - seg(p, 0.92, 0.96);
      routeGold.geometry.setDrawRange(0, Math.floor((routeGold.userData.total * (d / trip.length)) / 6) * 6);
      routeGhost.visible = routeGhost.material.opacity > 0.01;
      routeGold.visible = d > 0.5 && routeGold.material.opacity > 0.01;

      // --- labels
      const gone = 1 - seg(p, 0.92, 0.95);
      showLabel(labels.pickup, SHOP.x, 14.5, SHOP.z, seg(p, 0.03, 0.07) * (1 - seg(p, 0.69, 0.72)));
      showLabel(labels.drop, HOME.x, 16.5, -53, seg(p, 0.11, 0.15) * gone * (1 - seg(p, 0.85, 0.87)));
      showLabel(labels.chosen, chosenVan.position.x, 4.2, chosenVan.position.z, seg(p, 0.43, 0.46) * (1 - seg(p, 0.495, 0.51)));
      showLabel(labels.accepted, chosenVan.position.x, 4.2, chosenVan.position.z, seg(p, 0.505, 0.52) * (1 - seg(p, 0.6, 0.63)));
      showLabel(labels.otpA, chosenVan.position.x, 4.2, chosenVan.position.z, seg(p, 0.655, 0.67) * (1 - seg(p, 0.72, 0.74)));
      showLabel(labels.otpB, HOME.x, 8, HOME.z + 1, seg(p, 0.875, 0.89) * gone);
    }

    return { scene, camera, update, exposure: 0.86 };
  }

  function Stage(canvas) {
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    let city = null;
    let W = 0; let H = 0; let narrow = false;
    function resize(rw, rh) {
      const rect = canvas.getBoundingClientRect();
      W = rw || rect.width; H = rh || rect.height;
      narrow = W < 760;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 1.75));
      renderer.setSize(W, H, false);
    }
    function render(p, t) {
      if (!W || !H) return;
      if (!city) city = buildCity({ narrow, renderer });
      const aspect = W / H;
      // Portrait screens need the camera further back to keep subjects in frame.
      const fit = clamp(1.5 / aspect, 1, 1.9);
      city.camera.aspect = aspect;
      // Subject sits clear of the stage card: right on desktop, up on phones.
      if (narrow) city.camera.setViewOffset(W, H, 0, H * 0.13, W, H);
      else city.camera.setViewOffset(W, H, -W * 0.13, 0, W, H);
      city.update(p, t, fit);
      renderer.toneMappingExposure = city.exposure;
      renderer.render(city.scene, city.camera);
    }
    return { render, resize, renderer };
  }

  const acts = Array.from(root.querySelectorAll('.jAct'));
  const fontReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`800 40px ${FONT}`)]).catch(() => {})
    : Promise.resolve();

  // ---- reduced motion: one still per stage beside the text, nothing pinned ------
  if (reduceMotion) {
    fontReady.then(() => {
      const off = document.createElement('canvas');
      const stage = Stage(off);
      if (!stage) return;
      acts.forEach((act) => {
        const shot = document.createElement('canvas');
        shot.className = 'jAct__still';
        shot.setAttribute('aria-hidden', 'true');
        act.prepend(shot);
        const r = shot.getBoundingClientRect();
        shot.width = Math.round(r.width); shot.height = Math.round(r.height);
        stage.resize(r.width, r.height);
        stage.render(Number(act.dataset.still), 1);
        shot.getContext('2d').drawImage(off, 0, 0, shot.width, shot.height);
      });
      stage.renderer.dispose();
    });
    return;
  }

  // ---- live, pinned film ------------------------------------------------------
  const canvas = root.querySelector('.journey__canvas');
  root.classList.add('is-pinned');
  const stage = Stage(canvas);
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

  function hudFor(p) {
    const van = 'Independent van';
    const km = (ROUTE_KM * seg(p, 0.725, 0.85)).toFixed(1) + ' km';
    if (p < 0.16) return { status: 'New request', mode: 'Not chosen yet', km: '0 km' };
    if (p < 0.44) return { status: 'Services available', mode: 'Compare and choose', km: '0 km' };
    if (p < 0.505) return { status: 'Request sent to your partner', mode: van, km: '0 km' };
    if (p < 0.535) return { status: 'Request accepted', mode: van, km: '0 km' };
    if (p < 0.645) return { status: 'Partner on the way', mode: van, km: '0 km' };
    if (p < 0.725) return { status: 'Picked up', mode: van, km: '0 km' };
    if (p < 0.875) return { status: 'On the way to the drop', mode: van, km };
    return { status: 'Delivered', mode: van, km };
  }
  const actFor = (p) => { const i = ACTS.findIndex((a) => p < a.b); return i < 0 ? ACTS.length - 1 : i; };

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
    setText(hud.route, ROUTE);
    setText(hud.km, h.km);
    hud.fill.style.transform = `scaleX(${shown})`;
    hud.parcel.style.left = shown * 100 + '%';
    hud.stops.forEach((el, i) => el.classList.toggle('is-done', shown >= ACTS[i].a - 0.001));

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

  fontReady.then(() => {
    stage.resize();
    readScroll();
    shown = target;
    ready = true;
    kick();
  });
})();
