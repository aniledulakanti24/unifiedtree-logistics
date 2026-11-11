// ==========================================================================
// UT Logistics — Interactive Fleet Matcher Console (Hero Theater)
// Cinema-Grade GSAP Animation Controller:
// - 3D Mouse Parallax Tilt & Vehicle Perspective Physics
// - Laser Scanline Wave across Multi-Fleet Table
// - Live Rolling Fare Number Tickers
// - Dynamic Alert Badges (Surge Pulse, Reject Shake)
// - Golden Shimmer & Victory Lock-in on UT Logistics Winner
// ==========================================================================
(function () {
  'use strict';

  const state = {
    pointA: 'Koramangala',
    pointB: 'Whitefield',
    weight: 18,
    activeKey: 'mini',
    distanceKm: '16.4',
    etaMin: '28',
  };

  const VEHICLES = {
    bike: {
      key: 'bike',
      name: '2-Wheeler (Bike Express)',
      img: 'assets/vehicles3d/bike.jpg',
      fareNum: 85,
      fare: '₹85',
      cap: 'Up to 5 kg',
      tag: 'BEST FOR LIGHT PARCELS',
      desc: 'Optimal for envelopes, documents, food & parcels up to 5 kg.',
      meta: '⚡ 3 mins away · Verified Rider · Live OTP',
      porterNum: 140,
      porterComp: '₹140',
      porterBadge: '1.6x Surge ⚠️',
      porterBadgeClass: 'htStatusBadge--surge',
      porterSub: 'Surge pricing in effect · 25m wait',
      rapidoNum: 95,
      rapidoComp: '₹95',
      rapidoBadge: 'Available ✓',
      rapidoBadgeClass: 'htStatusBadge--best',
      rapidoSub: 'Bike standard delivery',
      courierNum: 120,
      courierComp: '₹120',
      courierBadge: 'Next Day ⏳',
      courierBadgeClass: 'htStatusBadge--delay',
      courierSub: 'Overnight hub transit',
      utNum: 85,
      utFare: '₹85',
      utBadge: 'BEST MATCH ★',
      utSub: 'Optimal vehicle · Save ₹55 vs surge',
    },
    auto: {
      key: 'auto',
      name: '3-Wheeler (Commercial Auto)',
      img: 'assets/vehicles3d/auto.jpg',
      fareNum: 160,
      fare: '₹160',
      cap: 'Up to 25 kg',
      tag: 'BEST FOR MEDIUM BOXES',
      desc: 'Ideal for cartons, small appliances, grocery crates & eCom packages.',
      meta: '⚡ 4 mins away · Covered Carriage · Live OTP',
      porterNum: 260,
      porterComp: '₹260',
      porterBadge: '1.7x Surge ⚠️',
      porterBadgeClass: 'htStatusBadge--surge',
      porterSub: 'Peak hour surge · 30m wait',
      rapidoNum: 0,
      rapidoComp: '--',
      rapidoBadge: 'Rejected ✕',
      rapidoBadgeClass: 'htStatusBadge--reject',
      rapidoSub: 'Exceeds 5kg bike limit',
      courierNum: 180,
      courierComp: '₹180',
      courierBadge: '2 Days ⏳',
      courierBadgeClass: 'htStatusBadge--delay',
      courierSub: 'Standard delayed delivery',
      utNum: 160,
      utFare: '₹160',
      utBadge: 'BEST MATCH ★',
      utSub: 'Optimal vehicle · Save ₹100 vs surge',
    },
    mini: {
      key: 'mini',
      name: 'Tata Ace (Mini Truck)',
      img: 'assets/vehicles3d/mini.jpg',
      fareNum: 310,
      fare: '₹310',
      cap: 'Up to 750 kg',
      tag: 'RECOMMENDED BEST FIT',
      desc: 'Optimal for 18 kg · 5.5 × 4.8 ft load bed · Instant driver dispatch.',
      meta: '⚡ 4 mins away · 5.5ft Load Bed · Verified Driver',
      porterNum: 480,
      porterComp: '₹480',
      porterBadge: '1.8x Surge ⚠️',
      porterBadgeClass: 'htStatusBadge--surge',
      porterSub: 'Heavy surge detected · 35m wait',
      rapidoNum: 0,
      rapidoComp: '--',
      rapidoBadge: 'Rejected ✕',
      rapidoBadgeClass: 'htStatusBadge--reject',
      rapidoSub: 'Exceeds 5kg bike limit (18kg parcel)',
      courierNum: 240,
      courierComp: '₹240',
      courierBadge: '2-3 Days ⏳',
      courierBadgeClass: 'htStatusBadge--delay',
      courierSub: 'No same-day or live GPS tracking',
      utNum: 310,
      utFare: '₹310',
      utBadge: 'BEST MATCH ★',
      utSub: 'Tata Ace · Saves ₹170 vs Porter surge',
    },
    truck14: {
      key: 'truck14',
      name: '14ft Commercial Truck',
      img: 'assets/vehicles3d/truck14.jpg',
      fareNum: 1250,
      fare: '₹1,250',
      cap: 'Up to 4,000 kg',
      tag: 'BEST FOR HEAVY FREIGHT',
      desc: 'Heavy cargo, house moves, pallets & industrial commercial loads.',
      meta: '⚡ 8 mins away · 14ft Container · Certified Driver',
      porterNum: 1850,
      porterComp: '₹1,850',
      porterBadge: 'High Base ⚠️',
      porterBadgeClass: 'htStatusBadge--surge',
      porterSub: 'Peak freight tariff · 45m wait',
      rapidoNum: 0,
      rapidoComp: '--',
      rapidoBadge: 'Unavailable ✕',
      rapidoBadgeClass: 'htStatusBadge--reject',
      rapidoSub: 'No heavy freight service',
      courierNum: 1600,
      courierComp: '₹1,600',
      courierBadge: '3-4 Days ⏳',
      courierBadgeClass: 'htStatusBadge--delay',
      courierSub: 'Freight hub handling delay',
      utNum: 1250,
      utFare: '₹1,250',
      utBadge: 'BEST MATCH ★',
      utSub: '14ft Truck · Saves ₹600 on freight',
    },
  };

  // -------------------------------------------------------------------------
  // 1. Ambient Particle Starfield
  // -------------------------------------------------------------------------
  function initParticleCanvas() {
    const canvas = document.getElementById('heroParticleCanvas');
    if (!canvas || window.getComputedStyle(canvas).display === 'none') return;
    const ctx = canvas.getContext('2d');
    let width, height;
    const particles = [];
    const COUNT = 25;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = canvas.width = rect.width;
      height = canvas.height = rect.height;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 1,
        alpha: Math.random() * 0.45 + 0.2,
        color: Math.random() > 0.4 ? '245, 179, 1' : '30, 158, 106',
      });
    }

    function render() {
      ctx.clearRect(0, 0, width, height);

      // Connect subtle constellation lines
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(245, 179, 1, ${0.14 * (1 - dist / 80)})`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx.fill();
      });

      requestAnimationFrame(render);
    }
    render();
  }

  // -------------------------------------------------------------------------
  // 2. 3D Mouse Parallax Tilt
  // -------------------------------------------------------------------------
  function init3DParallax() {
    const theater = document.getElementById('heroTheater');
    const dock = document.querySelector('.htSpotlightDock');
    const vehicleImg = document.getElementById('htMainVehicleImg');
    if (!theater || !dock || !vehicleImg) return;

    theater.addEventListener('mousemove', (e) => {
      const rect = theater.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width - 0.5;
      const normY = (e.clientY - rect.top) / rect.height - 0.5;

      if (window.gsap) {
        window.gsap.to(dock, {
          rotationY: normX * 8,
          rotationX: -normY * 6,
          duration: 0.35,
          ease: 'power2.out',
          overwrite: 'auto',
        });
        window.gsap.to(vehicleImg, {
          rotationY: normX * 18,
          rotationX: -normY * 12,
          y: normY * 6,
          duration: 0.35,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      }
    });

    theater.addEventListener('mouseleave', () => {
      if (window.gsap) {
        window.gsap.to([dock, vehicleImg], {
          rotationY: 0,
          rotationX: 0,
          y: 0,
          duration: 0.8,
          ease: 'elastic.out(1, 0.4)',
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // 3. Rolling Number Counter for Fares
  // -------------------------------------------------------------------------
  function animateFare(element, targetNum) {
    if (!element) return;
    if (!targetNum || targetNum === 0) {
      element.textContent = '--';
      return;
    }
    if (!window.gsap) {
      element.textContent = `₹${targetNum.toLocaleString('en-IN')}`;
      return;
    }

    const currentText = element.textContent.replace(/[^0-9]/g, '');
    const startNum = currentText ? parseInt(currentText, 10) : targetNum * 0.5;
    const obj = { val: startNum };

    window.gsap.to(obj, {
      val: targetNum,
      duration: 0.55,
      ease: 'power2.out',
      onUpdate: () => {
        element.textContent = `₹${Math.round(obj.val).toLocaleString('en-IN')}`;
      },
    });
  }

  // -------------------------------------------------------------------------
  // 4. Fluid Vehicle Switcher with GSAP Spring Physics
  // -------------------------------------------------------------------------
  function selectVehicle(key, animate = true) {
    state.activeKey = key;
    const v = VEHICLES[key] || VEHICLES.mini;

    // Elements
    const img = document.getElementById('htMainVehicleImg');
    const badge = document.getElementById('htChampionBadge');
    const title = document.getElementById('htSpotlightTitle');
    const desc = document.getElementById('htSpotlightDesc');
    const meta = document.getElementById('htSpotlightMeta');

    // Matrix Elements
    const porterFare = document.getElementById('htPorterFare');
    const porterBadge = document.getElementById('htPorterBadge');
    const porterSub = document.getElementById('htPorterSub');

    const rapidoFare = document.getElementById('htRapidoFare');
    const rapidoBadge = document.getElementById('htRapidoBadge');
    const rapidoSub = document.getElementById('htRapidoSub');

    const courierFare = document.getElementById('htCourierFare');
    const courierBadge = document.getElementById('htCourierBadge');
    const courierSub = document.getElementById('htCourierSub');

    const utFare = document.getElementById('htUtFare');
    const utBadge = document.getElementById('htUtBadge');
    const utSub = document.getElementById('htUtSub');

    // Update active button state
    document.querySelectorAll('.htVehPill').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.veh === key);
    });

    if (badge) badge.textContent = `★ ${v.tag}`;
    if (title) title.textContent = v.name;
    if (desc) desc.textContent = v.desc;
    if (meta) meta.textContent = v.meta;

    // Update Competitor Cards with Rolling Numbers
    if (animate) {
      animateFare(porterFare, v.porterNum);
      animateFare(rapidoFare, v.rapidoNum);
      animateFare(courierFare, v.courierNum);
      animateFare(utFare, v.utNum);
    } else {
      if (porterFare) porterFare.textContent = v.porterComp;
      if (rapidoFare) rapidoFare.textContent = v.rapidoComp;
      if (courierFare) courierFare.textContent = v.courierComp;
      if (utFare) utFare.textContent = v.utFare;
    }

    if (porterBadge) {
      porterBadge.textContent = v.porterBadge;
      porterBadge.className = `htStatusBadge ${v.porterBadgeClass}`;
    }
    if (porterSub) porterSub.textContent = v.porterSub;

    if (rapidoBadge) {
      rapidoBadge.textContent = v.rapidoBadge;
      rapidoBadge.className = `htStatusBadge ${v.rapidoBadgeClass}`;
    }
    if (rapidoSub) rapidoSub.textContent = v.rapidoSub;

    if (courierBadge) {
      courierBadge.textContent = v.courierBadge;
      courierBadge.className = `htStatusBadge ${v.courierBadgeClass}`;
    }
    if (courierSub) courierSub.textContent = v.courierSub;

    if (utBadge) {
      utBadge.textContent = v.utBadge;
      utBadge.className = 'htStatusBadge htStatusBadge--best';
    }
    if (utSub) utSub.textContent = v.utSub;

    // Animate Vehicle Swap with Drive-In Spring Physics
    if (img) {
      if (animate && window.gsap) {
        window.gsap.timeline()
          .to(img, { x: 40, opacity: 0, scale: 0.85, duration: 0.15, ease: 'power2.in' })
          .add(() => {
            img.src = v.img;
            img.alt = v.name;
          })
          .fromTo(img, 
            { x: -40, opacity: 0, scale: 0.85 },
            { x: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.45)' }
          );

        // Core Pulse
        window.gsap.fromTo('.htHoloCore', 
          { scale: 1.35, opacity: 1 }, 
          { scale: 1, opacity: 0.75, duration: 0.5, ease: 'power2.out' }
        );

        // Text subtle slide reveal
        window.gsap.fromTo(['#htSpotlightTitle', '#htSpotlightDesc', '#htSpotlightMeta'],
          { y: 6, opacity: 0.4 },
          { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: 'power2.out' }
        );
      } else {
        img.src = v.img;
        img.alt = v.name;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Cinematic Laser Scan Simulation Sequence
  // -------------------------------------------------------------------------
  function runScenarioSimulation() {
    const gsap = window.gsap;
    if (!gsap) return;

    const rows = document.querySelectorAll('.htMatrixRow');
    const winnerRow = document.querySelector('.htMatrixRow--winner');
    const vehicle = document.getElementById('htMainVehicleImg');
    const champBadge = document.getElementById('htChampionBadge');
    const scanline = document.getElementById('htScanlineBeam');
    const porterBadge = document.getElementById('htPorterBadge');
    const rapidoBadge = document.getElementById('htRapidoBadge');
    const utBadge = document.getElementById('htUtBadge');

    const tl = gsap.timeline();

    // Step 1: Laser Scanline Beam sweeps down the table
    if (scanline) {
      tl.fromTo(scanline,
        { top: '-40px', opacity: 0 },
        { top: '100%', opacity: 1, duration: 0.65, ease: 'power1.inOut' }
      );
      tl.to(scanline, { opacity: 0, duration: 0.15 }, '-=0.1');
    }

    // Step 2: Sequential row scanline reactive flash
    tl.fromTo(rows,
      { backgroundColor: '#F8FAFC' },
      {
        backgroundColor: '#EEF2FF',
        stagger: 0.08,
        duration: 0.16,
        yoyo: true,
        repeat: 1,
        ease: 'power2.inOut',
      },
      '<0.05'
    );

    // Step 3: Trigger Alert Badges (Porter surge pulse & Rapido reject shake)
    if (porterBadge) {
      tl.to(porterBadge, {
        scale: 1.15,
        duration: 0.15,
        yoyo: true,
        repeat: 1,
        ease: 'power2.out',
      }, '-=0.35');
    }

    if (rapidoBadge) {
      tl.to(rapidoBadge, {
        x: '+=3',
        yoyo: true,
        repeat: 4,
        duration: 0.06,
        ease: 'power1.inOut',
      }, '-=0.3');
    }

    // Step 4: Shimmer & Victory Lock on UT Logistics
    if (winnerRow) {
      tl.add(() => {
        winnerRow.classList.remove('is-shimmering');
        void winnerRow.offsetWidth; // force DOM reflow
        winnerRow.classList.add('is-shimmering');
      }, '-=0.2');

      tl.to(winnerRow, {
        scale: 1.01,
        borderColor: '#10B981',
        boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)',
        duration: 0.35,
        yoyo: true,
        repeat: 1,
        ease: 'power2.out',
      }, '<');
    }

    // Step 5: Vehicle Throttle Bounce & Champion Badge Pop
    if (vehicle) {
      tl.to(vehicle, {
        y: -10,
        duration: 0.2,
        ease: 'power2.out',
      }, '-=0.25');
      tl.to(vehicle, {
        y: 0,
        duration: 0.4,
        ease: 'bounce.out',
      });
    }

    if (champBadge) {
      tl.to(champBadge, {
        scale: 1.15,
        duration: 0.2,
        yoyo: true,
        repeat: 1,
        ease: 'back.out(2)',
      }, '<');
    }

    if (utBadge) {
      tl.fromTo(utBadge,
        { scale: 1.3 },
        { scale: 1, duration: 0.4, ease: 'back.out(2)' },
        '<'
      );
    }
  }

  // -------------------------------------------------------------------------
  // 6. Dynamic Route & Weight Updates
  // -------------------------------------------------------------------------
  function updateDynamicData() {
    const a = state.pointA || 'Koramangala';
    const b = state.pointB || 'Whitefield';
    const kg = state.weight || 18;

    const routeText = document.getElementById('htRouteText');
    if (routeText) {
      routeText.textContent = `📍 ${a} ➔ 🏁 ${b} · 📦 ${kg} kg`;
    }

    // Auto-select optimal vehicle for current weight
    let target = 'mini';
    if (kg <= 5) target = 'bike';
    else if (kg <= 25) target = 'auto';
    else if (kg <= 750) target = 'mini';
    else target = 'truck14';

    selectVehicle(target, false);
  }

  // -------------------------------------------------------------------------
  // 7. Zero-Dependency Magnetic Button Physics
  // -------------------------------------------------------------------------
  function initMagneticButtons() {
    if (!window.gsap) return;
    const elements = document.querySelectorAll('.htVehPill, .htSimulateBtn, .presetChip');

    elements.forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const h = rect.width / 2;
        const w = rect.height / 2;
        const x = e.clientX - rect.left - h;
        const y = e.clientY - rect.top - w;

        window.gsap.to(el, {
          x: x * 0.3,
          y: y * 0.3,
          scale: 1.03,
          ease: 'power2.out',
          duration: 0.3,
        });
      });

      el.addEventListener('mouseleave', () => {
        window.gsap.to(el, {
          x: 0,
          y: 0,
          scale: 1,
          ease: 'elastic.out(1, 0.35)',
          duration: 0.8,
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // 8. Initialization & Event Handlers
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initParticleCanvas();
    init3DParallax();
    initMagneticButtons();

    // Vehicle switcher buttons
    document.querySelectorAll('.htVehPill').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectVehicle(btn.dataset.veh, true);
      });
    });

    // Simulate scenario button
    const simBtn = document.getElementById('htSimulateBtn');
    if (simBtn) {
      simBtn.addEventListener('click', runScenarioSimulation);
    }

    // Quick Scenario Buttons inside Action Row
    document.querySelectorAll('.htScenarioBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kg = Number(btn.dataset.kg);
        state.weight = kg;
        const formWeight = document.querySelector('input[name="weight"]');
        if (formWeight) formWeight.value = kg;
        updateDynamicData();
        runScenarioSimulation();
      });
    });

    // Quick Route Preset Chips in the Form
    document.querySelectorAll('.presetChip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.presetChip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');

        const a = chip.dataset.a;
        const b = chip.dataset.b;
        const kg = Number(chip.dataset.kg);

        state.pointA = a;
        state.pointB = b;
        state.weight = kg;

        const fromInput = document.querySelector('input[name="from_place"]');
        const toInput = document.querySelector('input[name="to_place"]');
        const weightInput = document.querySelector('input[name="weight"]');

        if (fromInput) fromInput.value = a;
        if (toInput) toInput.value = b;
        if (weightInput) weightInput.value = kg;

        updateDynamicData();
        runScenarioSimulation();
      });
    });

    updateDynamicData();

    // Intro simulation after 1s
    setTimeout(runScenarioSimulation, 1000);
  });

  // -------------------------------------------------------------------------
  // 9. Integration Bridge for Search Form (#quickBook)
  // -------------------------------------------------------------------------
  window.UTFilm = {
    minSearchMs: 300,
    isLive: () => true,
    update: function ({ a, b, kg }) {
      if (a) state.pointA = a;
      if (b) state.pointB = b;
      if (kg && kg > 0) state.weight = kg;
      updateDynamicData();
    },
    takeOver: function () {
      runScenarioSimulation();
    },
    backToSample: function () {},
    searching: function () {},
    showFound: function () {
      runScenarioSimulation();
    },
  };
})();
