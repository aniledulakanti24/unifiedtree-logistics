// ==========================================================================
// UT Logistics — 3D Cinema Director (3D Character + Drone Camera Shots)
// Features:
// 1. Detailed Articulated 3D Character (holding glowing smartphone, expressing
//    frustration, searching, and celebrating).
// 2. 3D Flying Quadcopter Drone (with 4 spinning rotors, gimbal & LED lights).
// 3. Cinematic Drone Camera Shots:
//    - Scene 1: Drone Low-Orbit Tracking Shot around frustrated sender
//    - Scene 2: High-Altitude Sweeping Flyover revealing full Point A -> Point B route
//    - Scene 3: Dynamic Contender Glide & Showcase around vehicle lineup
//    - Scene 4: High-Speed Chase Cam behind moving Tata Ace + Victory Crane shot
// 4. Drone Viewfinder HUD (REC indicator, dynamic telemetry, camera mode selector)
// ==========================================================================
(function () {
  'use strict';

  if (!window.THREE || !window.UTKit) {
    console.warn('Three.js and UTKit required for 3D Scenario');
    return;
  }

  const T = window.THREE;
  const { makeParcel, makeBike, makeVan, makeTruck, makePin, glow, groundShadow, paint, vinyl, capsule, rbox, iconWheel } = window.UTKit;

  // Scene State
  let currentScene = 1;
  const TOTAL_SCENES = 4;
  let isPlaying = true;
  let autoTimer = null;
  const SCENE_DURATION = 5000; // 5s per scene

  // Camera Mode: 'auto', 'chase', 'overhead', 'orbit'
  let cameraMode = 'auto';

  const state = {
    pointA: 'Koramangala',
    pointB: 'Whitefield',
    weight: 18,
    weightUnit: 'kg',
  };

  // 3D Engine Globals
  let container, canvas, renderer, scene, camera;
  let animFrameId = null;
  const clock = new T.Clock();

  // 3D Actors
  let pinA, pinB;
  let senderCharacter, recipientCharacter;
  let flyingDrone;
  let parcelBox;
  let bikeRig, truckRig, vanRig;
  let roadPlane, radarMesh, spotlight;
  let confettiGroup;
  let laserLine;

  // Drone Camera Flight Dynamics
  const dronePos = new T.Vector3(0, 7, 13);
  const droneLookTarget = new T.Vector3(0, 1.2, 0);
  const currentCamLook = new T.Vector3(0, 1.2, 0);
  let droneSpeed = 0;
  let droneAltitude = 7.0;

  // Manual Drag Orbit
  let isDragging = false;
  let prevMouseX = 0;
  let manualOrbitAngle = 0;

  // ==========================================================================
  // DETAILED 3D CHARACTER BUILDER
  // ==========================================================================
  function createDetailedCharacter({ shirtColor = '#f5b301', pantsColor = '#1c2833', skinColor = '#dca176', isSender = true }) {
    const group = new T.Group();
    const clothMat = vinyl(shirtColor);
    const pantsMat = vinyl(pantsColor);
    const skinMat = vinyl(skinColor);
    const hairMat = vinyl('#171513');
    const whiteMat = vinyl('#ffffff');
    const blackMat = vinyl('#111111');

    // Legs with shoes
    const leftLeg = new T.Group();
    leftLeg.position.set(-0.16, 0.85, 0);
    leftLeg.add(capsule([0, 0, 0], [0, -0.65, 0], 0.08, pantsMat));
    const leftShoe = rbox(0.18, 0.12, 0.28, 0.04, whiteMat, 0, -0.72, 0.06);
    leftLeg.add(leftShoe);
    group.add(leftLeg);

    const rightLeg = new T.Group();
    rightLeg.position.set(0.16, 0.85, 0);
    rightLeg.add(capsule([0, 0, 0], [0, -0.65, 0], 0.08, pantsMat));
    const rightShoe = rbox(0.18, 0.12, 0.28, 0.04, whiteMat, 0, -0.72, 0.06);
    rightLeg.add(rightShoe);
    group.add(rightLeg);

    // Hips & Torso
    const hips = rbox(0.44, 0.2, 0.28, 0.06, pantsMat, 0, 0.95, 0);
    group.add(hips);

    const torso = new T.Mesh(new T.CylinderGeometry(0.24, 0.21, 0.65, 16), clothMat);
    torso.position.set(0, 1.35, 0);
    group.add(torso);

    // Neck & Head
    const neck = new T.Mesh(new T.CylinderGeometry(0.08, 0.09, 0.15, 12), skinMat);
    neck.position.set(0, 1.72, 0);
    group.add(neck);

    const headGroup = new T.Group();
    headGroup.position.set(0, 1.9, 0);

    const head = new T.Mesh(new T.SphereGeometry(0.19, 20, 16), skinMat);
    headGroup.add(head);

    // Hair
    const hair = new T.Mesh(new T.SphereGeometry(0.2, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
    hair.position.set(0, 0.04, 0);
    headGroup.add(hair);

    // Eyes
    [-0.07, 0.07].forEach((x) => {
      const eye = new T.Mesh(new T.SphereGeometry(0.024, 8, 8), blackMat);
      eye.position.set(x, 0.02, 0.17);
      headGroup.add(eye);
    });

    group.add(headGroup);

    // Left Arm (with Phone if sender)
    const leftArm = new T.Group();
    leftArm.position.set(-0.28, 1.58, 0);
    const leftUpper = capsule([0, 0, 0], [0, -0.35, 0], 0.065, clothMat);
    leftArm.add(leftUpper);

    const leftForearm = new T.Group();
    leftForearm.position.set(0, -0.35, 0);
    leftForearm.add(capsule([0, 0, 0], [0, -0.32, 0.1], 0.055, skinMat));

    // 3D Smartphone
    let phoneScreen = null;
    if (isSender) {
      const phone = new T.Group();
      phone.position.set(0, -0.34, 0.22);
      phone.rotation.set(-0.4, 0.2, 0);
      const phoneBody = rbox(0.12, 0.22, 0.02, 0.01, blackMat);
      phone.add(phoneBody);

      phoneScreen = new T.Mesh(
        new T.PlaneGeometry(0.1, 0.19),
        new T.MeshBasicMaterial({ color: 0xff3b30 }) // Red warning initially
      );
      phoneScreen.position.set(0, 0, 0.012);
      phone.add(phoneScreen);

      leftForearm.add(phone);
    }
    leftArm.add(leftForearm);
    group.add(leftArm);

    // Right Arm
    const rightArm = new T.Group();
    rightArm.position.set(0.28, 1.58, 0);
    const rightUpper = capsule([0, 0, 0], [0, -0.35, 0], 0.065, clothMat);
    rightArm.add(rightUpper);

    const rightForearm = new T.Group();
    rightForearm.position.set(0, -0.35, 0);
    rightForearm.add(capsule([0, 0, 0], [0, -0.32, 0], 0.055, skinMat));
    rightArm.add(rightForearm);
    group.add(rightArm);

    // Ground Shadow
    const shadowMesh = groundShadow(1, 0.5);
    shadowMesh.scale.set(0.8, 0.8, 1);
    shadowMesh.position.y = 0.01;
    group.add(shadowMesh);

    // Expose animation controllers
    group.userData = {
      head: headGroup,
      leftArm,
      leftForearm,
      rightArm,
      rightForearm,
      phoneScreen,
      setPose(poseName) {
        if (poseName === 'frustrated') {
          headGroup.rotation.set(0.25, 0.15, 0.1);
          // Right arm on head in stress
          rightArm.rotation.set(-1.8, 0.6, -0.4);
          rightForearm.rotation.set(-1.2, 0, 0);
          // Left arm looking at warning phone
          leftArm.rotation.set(-0.8, -0.3, 0.4);
          leftForearm.rotation.set(-0.9, 0, 0);
          if (phoneScreen) phoneScreen.material.color.setHex(0xff3344);
        } else if (poseName === 'searching') {
          headGroup.rotation.set(-0.1, 0, 0);
          leftArm.rotation.set(-0.7, -0.2, 0.3);
          leftForearm.rotation.set(-0.8, 0, 0);
          rightArm.rotation.set(-0.6, 0.2, -0.3);
          rightForearm.rotation.set(-0.8, 0, 0);
          if (phoneScreen) phoneScreen.material.color.setHex(0x1e9e6a); // Emerald UT screen
        } else if (poseName === 'cheering') {
          headGroup.rotation.set(-0.25, 0, 0);
          leftArm.rotation.set(2.4, 0.3, 0.4);
          rightArm.rotation.set(2.4, -0.3, -0.4);
          if (phoneScreen) phoneScreen.material.color.setHex(0xf5b301);
        } else if (poseName === 'waving') {
          headGroup.rotation.set(0, -0.3, 0);
          rightArm.rotation.set(2.1, 0, -0.4);
          rightForearm.rotation.set(0.8, 0, 0);
          leftArm.rotation.set(0, 0, 0.1);
        } else {
          // Neutral
          headGroup.rotation.set(0, 0, 0);
          leftArm.rotation.set(0, 0, 0.1);
          rightArm.rotation.set(0, 0, -0.1);
        }
      },
    };

    group.scale.setScalar(0.92);
    return group;
  }

  // ==========================================================================
  // 3D FLYING QUADCOPTER DRONE
  // ==========================================================================
  function createQuadcopterDrone() {
    const drone = new T.Group();
    const darkMat = paint('#14181b', 0.2);
    const whiteMat = paint('#f2f4f5', 0.25);
    const accentMat = paint('#f5b301', 0.2);
    const propMat = vinyl('#222222');

    // Central body hull
    const body = rbox(0.5, 0.14, 0.5, 0.05, whiteMat, 0, 0, 0);
    drone.add(body);

    const dome = new T.Mesh(new T.SphereGeometry(0.18, 16, 12), darkMat);
    dome.scale.set(1.2, 0.6, 1.2);
    dome.position.set(0, 0.07, 0);
    drone.add(dome);

    // 4 Drone Arms & Motors
    const rotors = [];
    const armCoords = [
      [0.32, 0.32],
      [-0.32, 0.32],
      [-0.32, -0.32],
      [0.32, -0.32],
    ];

    armCoords.forEach(([x, z], i) => {
      // Carbon arm
      const arm = capsule([0, 0, 0], [x, 0, z], 0.035, darkMat);
      drone.add(arm);

      // Motor pod
      const motor = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.09, 12), accentMat);
      motor.position.set(x, 0.02, z);
      drone.add(motor);

      // Spinning 2-blade Propeller
      const propGroup = new T.Group();
      propGroup.position.set(x, 0.08, z);
      const blade1 = rbox(0.42, 0.012, 0.05, 0.01, propMat);
      propGroup.add(blade1);
      drone.add(propGroup);
      rotors.push(propGroup);

      // LED navigation lights
      const ledColor = i < 2 ? 0x00ff88 : 0xff3344; // Green front, red rear
      const led = new T.Mesh(new T.SphereGeometry(0.025, 8, 8), new T.MeshBasicMaterial({ color: ledColor }));
      led.position.set(x, -0.04, z);
      drone.add(led);
    });

    // 4K Camera Gimbal underneath
    const gimbal = new T.Group();
    gimbal.position.set(0, -0.09, 0.14);
    const gimbalMount = rbox(0.1, 0.08, 0.1, 0.02, darkMat);
    gimbal.add(gimbalMount);

    const cameraLens = new T.Mesh(
      new T.CylinderGeometry(0.04, 0.045, 0.08, 12),
      new T.MeshBasicMaterial({ color: 0x00d4ff })
    );
    cameraLens.rotation.x = Math.PI / 2;
    cameraLens.position.set(0, -0.03, 0.05);
    gimbal.add(cameraLens);

    drone.add(gimbal);

    // Ground Shadow for drone
    const droneShadow = groundShadow(1, 0.4);
    droneShadow.scale.set(0.6, 0.6, 1);
    droneShadow.position.y = 0.02;
    drone.add(droneShadow);

    drone.userData = {
      rotors,
      gimbal,
      spinRotors(dt) {
        rotors.forEach((r, idx) => {
          r.rotation.y += (idx % 2 === 0 ? 32 : -32) * dt;
        });
      },
    };

    drone.scale.setScalar(0.9);
    return drone;
  }

  // ==========================================================================
  // SCENE INITIALIZATION
  // ==========================================================================
  function init3D() {
    container = document.getElementById('sc3dViewport');
    canvas = document.getElementById('sc3dCanvas');
    if (!container || !canvas) return;

    const width = container.clientWidth || 560;
    const height = container.clientHeight || 400;

    // Renderer
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    // Scene
    scene = new T.Scene();
    scene.fog = new T.FogExp2(0x061b15, 0.024);

    // Camera
    camera = new T.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(dronePos.x, dronePos.y, dronePos.z);
    camera.lookAt(droneLookTarget);

    // Lights
    const ambient = new T.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const dirLight = new T.DirectionalLight(0xfff7e6, 1.25);
    dirLight.position.set(6, 15, 9);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Contender Spotlight for Scene 3
    spotlight = new T.SpotLight(0xffb81c, 0, 18, Math.PI / 4, 0.4, 1.2);
    spotlight.position.set(0, 9, 2);
    spotlight.target.position.set(0, 0, 0);
    scene.add(spotlight);
    scene.add(spotlight.target);

    // 1. Tarmac Road Platform
    createRoadPlatform();

    // 2. 3D Person Characters
    senderCharacter = createDetailedCharacter({ shirtColor: '#f5b301', pantsColor: '#1c2833', isSender: true });
    senderCharacter.position.set(-4.6, 0, -0.6);
    senderCharacter.rotation.y = 0.55;
    scene.add(senderCharacter);

    recipientCharacter = createDetailedCharacter({ shirtColor: '#1E9E6A', pantsColor: '#334155', isSender: false });
    recipientCharacter.position.set(4.8, 0, -0.6);
    recipientCharacter.rotation.y = -0.55;
    scene.add(recipientCharacter);

    // 3. 3D Flying Quadcopter Drone Actor
    flyingDrone = createQuadcopterDrone();
    flyingDrone.position.set(-2, 4.2, 3);
    scene.add(flyingDrone);

    // 4. Map Pins & Parcel
    pinA = makePin('#f5b301', 'A');
    pinA.scale.setScalar(0.42);
    pinA.position.set(-5.6, 0, -1.2);
    scene.add(pinA);

    pinB = makePin('#1E9E6A', 'B');
    pinB.scale.setScalar(0.42);
    pinB.position.set(5.6, 0, -1.2);
    scene.add(pinB);

    parcelBox = makeParcel(0.68);
    parcelBox.position.set(-3.7, 0, -0.6);
    scene.add(parcelBox);

    // 5. Vehicles
    createContenderVehicles();

    // 6. Confetti
    createConfetti();

    // Orbit & Resize listeners
    setupOrbitControls();
    window.addEventListener('resize', onResize);

    // Start 60fps render loop
    renderLoop();

    // Init Scene 1
    updateDynamicTexts();
    renderJourneyStep(1);
    setScene(1);
    startAutoplay();
  }

  function createRoadPlatform() {
    const roadGeo = new T.PlaneGeometry(16, 5);
    const roadMat = new T.MeshStandardMaterial({ color: 0x0c261e, roughness: 0.8 });
    roadPlane = new T.Mesh(roadGeo, roadMat);
    roadPlane.rotation.x = -Math.PI / 2;
    roadPlane.receiveShadow = true;
    scene.add(roadPlane);

    // Center Dashes
    for (let x = -6.5; x <= 6.5; x += 1.3) {
      const dashGeo = new T.PlaneGeometry(0.7, 0.08);
      const dashMat = new T.MeshBasicMaterial({ color: 0xffffff, opacity: 0.45, transparent: true });
      const dash = new T.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.005, 0);
      scene.add(dash);
    }

    // Glowing Laser Route Line (Point A -> Point B)
    const lineGeo = new T.BufferGeometry().setFromPoints([
      new T.Vector3(-5.5, 0.02, 0),
      new T.Vector3(5.5, 0.02, 0),
    ]);
    const lineMat = new T.LineBasicMaterial({ color: 0x1e9e6a, linewidth: 3, transparent: true, opacity: 0 });
    laserLine = new T.Line(lineGeo, lineMat);
    scene.add(laserLine);

    // Expanding 3D Radar Wave
    const radarGeo = new T.RingGeometry(0.1, 0.28, 32);
    const radarMat = new T.MeshBasicMaterial({ color: 0x1e9e6a, side: T.DoubleSide, transparent: true, opacity: 0 });
    radarMesh = new T.Mesh(radarGeo, radarMat);
    radarMesh.rotation.x = -Math.PI / 2;
    radarMesh.position.set(0, 0.015, 0);
    scene.add(radarMesh);
  }

  function createContenderVehicles() {
    bikeRig = makeBike('#f5b301', 'Rapido');
    bikeRig.scale.setScalar(0.95);
    bikeRig.visible = false;
    scene.add(bikeRig);

    truckRig = makeTruck({ name: 'Heavy Freight', cab: '#2c5d8f', body: '#eef1f2', stripe: '#e39b1f', ink: '#2c5d8f' });
    truckRig.scale.setScalar(0.55);
    truckRig.visible = false;
    scene.add(truckRig);

    vanRig = makeVan({ name: 'Tata Ace', body: '#ffffff', stripe: '#f5b301', low: '#0b5d45', ink: '#0b5d45' });
    vanRig.scale.setScalar(0.85);
    vanRig.visible = false;
    scene.add(vanRig);
  }

  function createConfetti() {
    confettiGroup = new T.Group();
    const colors = [0xf5b301, 0x1e9e6a, 0xffffff, 0xff5252, 0x00d4ff];
    for (let i = 0; i < 50; i++) {
      const geo = new T.PlaneGeometry(0.12, 0.12);
      const mat = new T.MeshBasicMaterial({ color: colors[i % colors.length], side: T.DoubleSide });
      const p = new T.Mesh(geo, mat);
      p.position.set(4.5 + (Math.random() - 0.5) * 2.5, 1 + Math.random() * 2.8, (Math.random() - 0.5) * 2.5);
      p.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      p.userData = { vy: 0.012 + Math.random() * 0.02, vr: (Math.random() - 0.5) * 0.12 };
      confettiGroup.add(p);
    }
    confettiGroup.visible = false;
    scene.add(confettiGroup);
  }

  // ==========================================================================
  // DRONE CAMERA DYNAMICS (CINEMATIC SHOTS)
  // ==========================================================================
  function setScene(num) {
    currentScene = num;
    if (currentScene > TOTAL_SCENES) currentScene = 1;
    if (currentScene < 1) currentScene = TOTAL_SCENES;

    // Reset visual elements
    if (spotlight) spotlight.intensity = 0;
    if (confettiGroup) confettiGroup.visible = false;
    if (radarMesh) radarMesh.material.opacity = 0;
    if (laserLine) laserLine.material.opacity = 0;

    // Update HUD
    const panels = document.querySelectorAll('.scenePanel');
    panels.forEach((p) => p.classList.toggle('is-active', Number(p.dataset.scene) === currentScene));

    const btns = document.querySelectorAll('.scNavBtn');
    btns.forEach((b) => b.classList.toggle('is-active', Number(b.dataset.scene) === currentScene));

    const bar = document.querySelector('.scProgressBar');
    if (bar) bar.style.width = `${(currentScene / TOTAL_SCENES) * 100}%`;

    // Reset vehicles
    if (bikeRig) bikeRig.visible = false;
    if (truckRig) truckRig.visible = false;
    if (vanRig) vanRig.visible = false;
    if (parcelBox) parcelBox.visible = true;

    // Configure Drone Shot & Character Pose based on Scene
    if (currentScene === 1) {
      // SCENE 1: Drone Low-Orbit Tracking Shot on Frustrated Character
      senderCharacter.userData.setPose('frustrated');
      recipientCharacter.userData.setPose('neutral');
      parcelBox.position.set(-3.7, 0, -0.6);
      parcelBox.rotation.set(0, 0, 0);

      dronePos.set(-4.0, 3.8, 6.2); // Low-angle drone shot
      droneLookTarget.set(-4.2, 1.4, -0.4);
      droneAltitude = 3.8;
      droneSpeed = 12;
      updateDroneTelemetry('ORBIT TRACK', 3.8, 12);
    } else if (currentScene === 2) {
      // SCENE 2: High-Altitude Sweeping Aerial Drone Flyover
      senderCharacter.userData.setPose('searching');
      recipientCharacter.userData.setPose('neutral');
      parcelBox.position.set(-3.7, 0, -0.6);
      if (laserLine) laserLine.material.opacity = 0.8;

      dronePos.set(0, 11.5, 12.0); // Epic sweeping birds-eye flyover
      droneLookTarget.set(0, 0.5, 0);
      droneAltitude = 11.5;
      droneSpeed = 34;
      updateDroneTelemetry('OVERHEAD FLYOVER', 11.5, 34);
    } else if (currentScene === 3) {
      // SCENE 3: Dynamic Contender Glide & Orbit at Center Stage
      senderCharacter.userData.setPose('cheering');
      recipientCharacter.userData.setPose('neutral');

      vanRig.visible = true;
      vanRig.position.set(0, 0, 0);
      vanRig.rotation.y = 0;
      parcelBox.position.set(0, 0.95, -0.2);
      spotlight.intensity = 2.4;

      dronePos.set(1.5, 4.8, 8.5); // Cinematic glide shot
      droneLookTarget.set(0, 1.2, 0);
      droneAltitude = 4.8;
      droneSpeed = 18;
      updateDroneTelemetry('CONTENDER GLIDE', 4.8, 18);
    } else if (currentScene === 4) {
      // SCENE 4: High-Speed Chase Cam following Delivery Van
      senderCharacter.userData.setPose('waving');
      recipientCharacter.userData.setPose('cheering');

      vanRig.visible = true;
      vanRig.position.set(4.0, 0, 0);
      vanRig.rotation.y = 0;
      parcelBox.position.set(4.0, 0.95, -0.2);
      if (confettiGroup) confettiGroup.visible = true;

      dronePos.set(4.8, 5.2, 7.8); // Chase Cam / Crane shot
      droneLookTarget.set(3.8, 1.2, 0);
      droneAltitude = 5.2;
      droneSpeed = 42;
      updateDroneTelemetry('CHASE CAM', 5.2, 42);
    }
  }

  function updateDroneTelemetry(modeText, alt, spd) {
    const modeEl = document.getElementById('droneModeLabel');
    if (modeEl) modeEl.textContent = modeText;
    const altEl = document.getElementById('droneAltVal');
    if (altEl) altEl.textContent = `${alt.toFixed(1)}m`;
    const spdEl = document.getElementById('droneSpdVal');
    if (spdEl) spdEl.textContent = `${Math.round(spd)} km/h`;
  }

  // 60FPS Render Loop
  function renderLoop() {
    animFrameId = requestAnimationFrame(renderLoop);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // 1. Spin Drone Rotors
    if (flyingDrone) {
      flyingDrone.userData.spinRotors(dt);
      // Drone gentle bobbing flight physics
      flyingDrone.position.y = 4.0 + Math.sin(elapsed * 2.8) * 0.18;
      flyingDrone.rotation.z = Math.sin(elapsed * 1.5) * 0.08;
    }

    // 2. Camera Flight Interpolation (Drone Shot Smoothing)
    let targetX = dronePos.x;
    let targetY = dronePos.y;
    let targetZ = dronePos.z;

    if (cameraMode === 'chase' && vanRig && vanRig.visible) {
      targetX = vanRig.position.x - 3.5;
      targetY = 3.6;
      targetZ = 5.8;
      droneLookTarget.set(vanRig.position.x + 1.2, 1.0, 0);
    } else if (cameraMode === 'overhead') {
      targetX = 0;
      targetY = 13.5;
      targetZ = 6.0;
      droneLookTarget.set(0, 0, 0);
    } else if (cameraMode === 'orbit') {
      targetX = Math.sin(elapsed * 0.5 + manualOrbitAngle) * 11;
      targetY = 6.2;
      targetZ = Math.cos(elapsed * 0.5 + manualOrbitAngle) * 11;
      droneLookTarget.set(0, 1.2, 0);
    } else {
      // Auto mode: add subtle manual drag offset
      targetX += Math.sin(manualOrbitAngle) * 6;
      targetZ += (Math.cos(manualOrbitAngle) - 1) * 4;
    }

    camera.position.x = T.MathUtils.lerp(camera.position.x, targetX, 0.05);
    camera.position.y = T.MathUtils.lerp(camera.position.y, targetY, 0.05);
    camera.position.z = T.MathUtils.lerp(camera.position.z, targetZ, 0.05);

    currentCamLook.lerp(droneLookTarget, 0.06);
    camera.lookAt(currentCamLook);

    // 3. Map Pins Gentle Hover
    if (pinA) pinA.position.y = Math.sin(elapsed * 2.5) * 0.08;
    if (pinB) pinB.position.y = Math.sin(elapsed * 2.5 + 1.2) * 0.08;

    // 4. Character Animation Gestures
    if (currentScene === 1) {
      // Sender character stress animation
      if (senderCharacter) {
        senderCharacter.userData.head.rotation.y = Math.sin(elapsed * 4) * 0.15;
      }
    } else if (currentScene === 2) {
      // Radar wave expansion
      if (radarMesh) {
        const cycle = (elapsed * 1.5) % 1;
        radarMesh.scale.setScalar(1 + cycle * 14);
        radarMesh.material.opacity = (1 - cycle) * 0.85;
      }
    } else if (currentScene === 3) {
      // Vehicle Contender Showdown: cycle Bike -> Heavy Truck -> Tata Ace
      const subTime = (elapsed * 0.45) % 3;
      if (subTime < 0.9) {
        // Bike tilting (Too small!)
        if (bikeRig) {
          bikeRig.visible = true;
          bikeRig.position.set(0, 0, 0);
          bikeRig.rotation.z = -0.34 + Math.sin(elapsed * 9) * 0.06; // wobbling!
        }
        if (truckRig) truckRig.visible = false;
        if (vanRig) vanRig.visible = false;
        if (parcelBox) parcelBox.position.set(-0.6, 0.82, 0);
        if (spotlight) spotlight.intensity = 0;
      } else if (subTime < 1.8) {
        // Heavy Truck (Overkill!)
        if (bikeRig) bikeRig.visible = false;
        if (truckRig) {
          truckRig.visible = true;
          truckRig.position.set(0, 0, 0);
          truckRig.rotation.z = 0;
        }
        if (vanRig) vanRig.visible = false;
        if (parcelBox) parcelBox.position.set(-1.2, 1.25, 0);
        if (spotlight) spotlight.intensity = 0;
      } else {
        // Tata Ace (Best Match!)
        if (bikeRig) bikeRig.visible = false;
        if (truckRig) truckRig.visible = false;
        if (vanRig) {
          vanRig.visible = true;
          vanRig.position.set(0, 0, 0);
          vanRig.rotation.z = 0;
        }
        if (parcelBox) parcelBox.position.set(0, 0.95, -0.2);
        if (spotlight) spotlight.intensity = 2.4;
      }
    } else if (currentScene === 4) {
      // Tata Ace driving down the road towards Point B
      if (vanRig && vanRig.visible) {
        const roadT = (Math.sin(elapsed * 1.2) + 1) / 2;
        const carX = -2.5 + roadT * 7.2;
        vanRig.position.x = carX;
        if (parcelBox) parcelBox.position.x = carX;
        if (vanRig.userData && vanRig.userData.spin) vanRig.userData.spin(carX * 2);
      }
      // Confetti floating down
      if (confettiGroup && confettiGroup.visible) {
        confettiGroup.children.forEach((c) => {
          c.position.y -= c.userData.vy;
          c.rotation.x += c.userData.vr;
          c.rotation.y += c.userData.vr;
          if (c.position.y < 0.1) c.position.y = 3.8;
        });
      }
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // ==========================================================================
  // CONTROLS & EVENT LISTENERS
  // ==========================================================================
  function setupOrbitControls() {
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      prevMouseX = e.clientX;
      manualOrbitAngle += deltaX * 0.007;
      manualOrbitAngle = Math.max(-0.8, Math.min(0.8, manualOrbitAngle));
    });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouseX = e.touches[0].clientX;
      }
    });
    window.addEventListener('touchend', () => { isDragging = false; });
    window.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - prevMouseX;
      prevMouseX = e.touches[0].clientX;
      manualOrbitAngle += deltaX * 0.008;
      manualOrbitAngle = Math.max(-0.8, Math.min(0.8, manualOrbitAngle));
    });
  }

  function onResize() {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function nextScene() {
    setScene(currentScene + 1);
  }

  function startAutoplay() {
    clearInterval(autoTimer);
    if (!isPlaying) return;
    autoTimer = setInterval(nextScene, SCENE_DURATION);
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    const btn = document.querySelector('.scActionBtn');
    if (btn) btn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
    if (isPlaying) {
      nextScene();
      startAutoplay();
    } else {
      clearInterval(autoTimer);
    }
  }

  function updateDynamicTexts() {
    const aEls = document.querySelectorAll('[data-sc-a]');
    aEls.forEach((el) => { el.textContent = state.pointA || 'Koramangala'; });

    const bEls = document.querySelectorAll('[data-sc-b]');
    bEls.forEach((el) => { el.textContent = state.pointB || 'Whitefield'; });

    const wEls = document.querySelectorAll('[data-sc-weight]');
    wEls.forEach((el) => { el.textContent = `${state.weight} ${state.weightUnit}`; });
  }

  // Interactive Story Section (Below Hero)
  const JOURNEY_STEPS = [
    {
      step: 1,
      title: 'The Multi-App Struggle (The Old Way)',
      desc: 'You need to send an 18kg parcel from Point A to Point B. You open Porter, then Rapido, then courier apps. You check 4 different apps, face surge pricing, discover vehicle weight limits at the last step, and spend 45 minutes haggling or waiting for driver assignments.',
      pills: ['Porter app switching', 'Rapido 5kg bike limit', '1.8x surge pricing', 'Driver cancellations', '45 mins wasted'],
      cardHtml: `
        <div style="background: rgba(180,35,24,0.15); border: 1px solid rgba(239,71,111,0.3); border-radius: 10px; padding: 14px;">
          <b style="color: #FF8597; font-size: 13px; display: block; margin-bottom: 8px;">The 4-App Headache:</b>
          <div style="font-size: 12.5px; color: rgba(255,255,255,0.8); line-height: 1.6;">
            • <b>Porter:</b> Searching for Mini Truck... Surge ₹490 (Wait 35m)<br>
            • <b>Rapido:</b> ❌ "Parcel over 5kg cannot be booked on bike"<br>
            • <b>Delhivery / Couriers:</b> "Estimated delivery 2-3 days"<br>
            • <b>Local Tempo:</b> Driver haggles for return fare
          </div>
        </div>
      `,
    },
    {
      step: 2,
      title: 'Open UT Logistics — One Unified Search',
      desc: 'Instead of switching tabs, open UT Logistics. Simply type Point A (Pickup) and Point B (Drop), enter your parcel weight, and hit search. One query scans every delivery provider, tempo operator, bike rider, and courier fleet in your area.',
      pills: ['Zero app jumping', 'One clean interface', 'Instant route calculation', 'Real-time vehicle radar'],
      cardHtml: `
        <div style="background: rgba(30,158,106,0.15); border: 1px solid rgba(30,158,106,0.4); border-radius: 10px; padding: 14px;">
          <b style="color: #A3E7CA; font-size: 13px; display: block; margin-bottom: 8px;">Unified Search Bar:</b>
          <div style="font-size: 13px; color: #fff; line-height: 1.6;">
            <b>Point A:</b> Koramangala ➔ <b>Point B:</b> Whitefield<br>
            <b>Weight:</b> 18 kg (Medium Carton Box)<br>
            <span style="color: var(--accent); font-size: 12px; margin-top: 6px; display: inline-block;">
              ⚡ Scanning 42 active vehicles & 8 courier networks...
            </span>
          </div>
        </div>
      `,
    },
    {
      step: 3,
      title: 'Compare & Choose the Best Vehicle in Minutes',
      desc: 'UT Logistics displays every available option side-by-side with transparent pricing, accurate arrival ETA, and smart vehicle capacity matching. You never have to guess whether a bike is too small or a 14ft truck is an expensive overkill.',
      pills: ['Side-by-side comparison', 'Best Vehicle Matchmaker', 'Transparent pricing', 'No hidden surge'],
      cardHtml: `
        <div style="display: grid; gap: 8px;">
          <div style="background: rgba(255,255,255,0.06); padding: 8px 12px; border-radius: 8px; font-size: 12px; display: flex; justify-content: space-between;">
            <span>🏍️ 2-Wheeler / Bike</span><span style="color:#FF8597">❌ Max 5kg limit</span>
          </div>
          <div style="background: rgba(30,158,106,0.25); border: 1px solid #1E9E6A; padding: 8px 12px; border-radius: 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div><b>🚚 Tata Ace Mini Truck</b> <span style="background:var(--accent); color:#000; font-weight:800; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">BEST FIT</span><br><small style="color:rgba(255,255,255,0.7)">Fits 18kg perfectly · 4 min away</small></div>
            <b style="color:var(--accent); font-size: 14px;">₹310</b>
          </div>
          <div style="background: rgba(255,255,255,0.06); padding: 8px 12px; border-radius: 8px; font-size: 12px; display: flex; justify-content: space-between;">
            <span>🚛 14ft Bulk Truck</span><span style="color:rgba(255,255,255,0.5)">₹1,150 (Overcapacity)</span>
          </div>
        </div>
      `,
    },
    {
      step: 4,
      title: 'Booked in 2 Minutes & Smooth Doorstep Delivery',
      desc: 'Pick your preferred option with one tap. Your request goes directly to the chosen driver or courier. Receive driver details, pickup OTP, and live map tracking right to the destination door.',
      pills: ['Driver assigned in 90 sec', 'Pickup & Delivery OTP', 'Real-time GPS', 'Zero bargaining'],
      cardHtml: `
        <div style="text-align: center; background: rgba(11,93,69,0.25); border: 1px solid rgba(30,158,106,0.4); border-radius: 10px; padding: 16px;">
          <div style="font-size: 28px; margin-bottom: 6px;">🎉</div>
          <b style="color: #fff; font-size: 14px; display: block;">Booking Confirmed in 2 Minutes!</b>
          <p style="font-size: 12px; color: rgba(255,255,255,0.75); margin: 4px 0 10px;">Driver Ramesh K. (Tata Ace) is 4 mins away</p>
          <span style="background: rgba(245,179,1,0.2); border: 1px solid var(--accent); color: var(--accent); padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700;">
            Pickup OTP: 4921
          </span>
        </div>
      `,
    },
  ];

  function renderJourneyStep(stepNum) {
    const data = JOURNEY_STEPS.find((s) => s.step === stepNum) || JOURNEY_STEPS[0];
    const textContainer = document.querySelector('.jStepText');
    const cardContainer = document.querySelector('.jStepCard');

    if (textContainer) {
      textContainer.innerHTML = `
        <span class="jAct__tag" style="color:var(--accent); font-weight:700; font-size:12.5px; text-transform:uppercase; display:block; margin-bottom:6px;">Step ${data.step} of 4</span>
        <h4>${data.title}</h4>
        <p>${data.desc}</p>
        <div class="jStepPills">
          ${data.pills.map((p) => `<span>${p}</span>`).join('')}
        </div>
      `;
    }

    if (cardContainer) {
      cardContainer.innerHTML = data.cardHtml;
    }

    const pills = document.querySelectorAll('.jNavPill');
    pills.forEach((p) => {
      p.classList.toggle('is-active', Number(p.dataset.jstep) === stepNum);
    });
  }

  // DOM Init
  document.addEventListener('DOMContentLoaded', () => {
    init3D();

    // Scene pill navigation
    const navBtns = document.querySelectorAll('.scNavBtn');
    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = Number(btn.dataset.scene);
        setScene(s);
        startAutoplay();
      });
    });

    // Drone Camera Mode buttons
    const droneBtns = document.querySelectorAll('.droneModeBtn');
    droneBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        droneBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        cameraMode = btn.dataset.cam;
      });
    });

    // Play/Pause button
    const actionBtn = document.querySelector('.scActionBtn');
    if (actionBtn) actionBtn.addEventListener('click', togglePlay);

    // Pause on hover
    if (container) {
      container.addEventListener('mouseenter', () => clearInterval(autoTimer));
      container.addEventListener('mouseleave', () => {
        if (isPlaying) startAutoplay();
      });
    }

    // Journey section pills
    const jPills = document.querySelectorAll('.jNavPill');
    jPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        renderJourneyStep(Number(pill.dataset.jstep));
      });
    });
  });

  // Export adapter for search form
  window.UTFilm = {
    minSearchMs: 400,
    isLive: () => true,
    update: function ({ a, b, kg }) {
      if (a) state.pointA = a;
      if (b) state.pointB = b;
      if (kg && kg > 0) state.weight = kg;
      updateDynamicTexts();
    },
    takeOver: function () {
      setScene(2);
      clearInterval(autoTimer);
    },
    backToSample: function () {
      if (isPlaying) startAutoplay();
    },
    searching: function () {
      setScene(2);
    },
    showFound: function () {
      setScene(3);
    },
  };
})();
