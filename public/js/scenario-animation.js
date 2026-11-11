// ==========================================================================
// UT Logistics — Scenario & Vehicle Match Animation Controller
// Smooth, responsive, medium-range animation showing the user scenario:
// 1. User wants to send Point A -> Point B. Opens Porter, Rapido, Couriers.
//    Gets frustrated by multiple apps, surge rates, and size limits.
// 2. Opens UT Logistics. Enters Point A & B once.
// 3. Vehicle Matchmaker showdown finds the best vehicle in minutes!
// 4. Booked & dispatched with verified OTP and live road tracking.
// ==========================================================================
(function () {
  'use strict';

  let currentScene = 1;
  const TOTAL_SCENES = 4;
  let isPlaying = true;
  let timer = null;
  const SCENE_DURATION = 4600; // 4.6 seconds per scene

  const state = {
    pointA: 'Koramangala',
    pointB: 'Whitefield',
    weight: 18,
    weightUnit: 'kg',
  };

  function getBestVehicle(kg) {
    if (kg <= 5) return { key: 'bike', name: 'Bike / 2-Wheeler', price: '₹85', save: 'Lowest local fare', tag: 'RECOMMENDED BEST FIT' };
    if (kg <= 450) return { key: 'mini', name: 'Tata Ace (Mini Truck)', price: '₹310', save: 'Save ₹180 vs standalone app', tag: 'RECOMMENDED BEST FIT' };
    if (kg <= 1200) return { key: 'pickup8', name: 'Pickup 8ft Truck', price: '₹620', save: 'Optimal for medium freight', tag: 'RECOMMENDED BEST FIT' };
    return { key: 'truck14', name: '14ft Heavy Truck', price: '₹1,250', save: 'Commercial bulk carrier', tag: 'RECOMMENDED BEST FIT' };
  }

  function updateDynamicTexts() {
    const aEls = document.querySelectorAll('[data-sc-a]');
    aEls.forEach((el) => { el.textContent = state.pointA || 'Koramangala'; });

    const bEls = document.querySelectorAll('[data-sc-b]');
    bEls.forEach((el) => { el.textContent = state.pointB || 'Whitefield'; });

    const wEls = document.querySelectorAll('[data-sc-weight]');
    wEls.forEach((el) => { el.textContent = `${state.weight} ${state.weightUnit}`; });

    const kg = state.weight;
    const best = getBestVehicle(kg);

    // Update Contender cards in Scene 3
    const matchCards = document.querySelectorAll('.matchCard');
    matchCards.forEach((card) => {
      const veh = card.dataset.veh;
      const fitEl = card.querySelector('.matchCardFit');
      const badge = card.querySelector('.badgeBestFit');

      card.classList.remove('matchCard--best', 'matchCard--dim');

      if (veh === best.key) {
        card.classList.add('matchCard--best');
        if (badge) {
          badge.hidden = false;
          badge.textContent = best.tag;
        }
        if (fitEl) {
          fitEl.className = 'matchCardFit matchCardFit--good';
          fitEl.textContent = `Optimal for ${kg} kg package · Lowest route fare`;
        }
      } else {
        card.classList.add('matchCard--dim');
        if (badge) badge.hidden = true;
        if (fitEl) {
          if (veh === 'bike' && kg > 5) {
            fitEl.className = 'matchCardFit matchCardFit--bad';
            fitEl.textContent = `Too small for ${kg} kg (max 5 kg limit)`;
          } else if (veh === 'truck14' && kg < 500) {
            fitEl.className = 'matchCardFit matchCardFit--bad';
            fitEl.textContent = `Overkill for ${kg} kg · High base fare`;
          } else {
            fitEl.className = 'matchCardFit';
            fitEl.textContent = 'Available alternative';
          }
        }
      }
    });
  }

  function setScene(sceneNum) {
    currentScene = sceneNum;
    if (currentScene > TOTAL_SCENES) currentScene = 1;
    if (currentScene < 1) currentScene = TOTAL_SCENES;

    // Update scene panels
    const panels = document.querySelectorAll('.scenePanel');
    panels.forEach((p) => {
      p.classList.toggle('is-active', Number(p.dataset.scene) === currentScene);
    });

    // Update nav buttons
    const btns = document.querySelectorAll('.scNavBtn');
    btns.forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.scene) === currentScene);
    });

    // Update timeline progress bar
    const bar = document.querySelector('.scProgressBar');
    if (bar) {
      bar.style.width = `${(currentScene / TOTAL_SCENES) * 100}%`;
    }
  }

  function nextScene() {
    setScene(currentScene + 1);
  }

  function startAutoplay() {
    clearInterval(timer);
    if (!isPlaying) return;
    timer = setInterval(nextScene, SCENE_DURATION);
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    const btn = document.querySelector('.scActionBtn');
    if (btn) btn.textContent = isPlaying ? 'Pause ⏸' : 'Play ▶';
    if (isPlaying) {
      nextScene();
      startAutoplay();
    } else {
      clearInterval(timer);
    }
  }

  // Interactive 4-step story walk in the section below
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

  // Initialize once DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    const root = document.getElementById('heroScenario');
    if (!root) return;

    // Nav pill clicks
    const navBtns = root.querySelectorAll('.scNavBtn');
    navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = Number(btn.dataset.scene);
        setScene(s);
        startAutoplay();
      });
    });

    // Play/Pause button
    const actionBtn = root.querySelector('.scActionBtn');
    if (actionBtn) actionBtn.addEventListener('click', togglePlay);

    // Pause on hover
    root.addEventListener('mouseenter', () => clearInterval(timer));
    root.addEventListener('mouseleave', () => {
      if (isPlaying) startAutoplay();
    });

    // Journey section pills
    const jPills = document.querySelectorAll('.jNavPill');
    jPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        renderJourneyStep(Number(pill.dataset.jstep));
      });
    });

    renderJourneyStep(1);
    updateDynamicTexts();
    setScene(1);
    startAutoplay();
  });

  // Export adapter for window.UTFilm so search form integrates smoothly
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
      setScene(2); // Jump to Act 2 (UT Search) on form focus
      clearInterval(timer);
    },
    backToSample: function () {
      if (isPlaying) startAutoplay();
    },
    searching: function () {
      setScene(2);
      const radar = document.querySelector('.radarDetails span');
      if (radar) radar.textContent = `Scanning routes for ${state.pointA || 'Point A'} → ${state.pointB || 'Point B'}...`;
    },
    showFound: function (count) {
      setScene(3); // Jump to Act 3 (Best Vehicle Match)
      const title = document.querySelector('#scene3 .sceneTitle');
      if (title) title.innerHTML = `<span>🎯</span> Contender Matchmaker (${count} services found)`;
    },
  };
})();
