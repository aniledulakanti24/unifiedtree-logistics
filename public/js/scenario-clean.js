// ==========================================================================
// UT Logistics — Vehicle & Rate Comparison Engine
// Clean, professional client-side controller. Zero heavy animation.
// ==========================================================================
(function () {
  'use strict';

  const state = {
    pointA: 'Koramangala',
    pointB: 'Whitefield',
    weight: 18,
  };

  const VEHICLES = {
    bike: {
      key: 'bike',
      name: '2-Wheeler (Motorbike)',
      img: 'assets/vehicles3d/bike.webp',
      specs: 'Max Payload: 5 kg · Ideal for envelopes & small parcels',
      baseFare: 85,
    },
    auto: {
      key: 'auto',
      name: 'Electric 3-Wheeler',
      img: 'assets/vehicles3d/auto.webp',
      specs: 'Max Payload: 25 kg · Ideal for cartons & grocery crates',
      baseFare: 160,
    },
    mini: {
      key: 'mini',
      name: 'Tata Ace (Mini Truck)',
      img: 'assets/vehicles3d/mini.webp',
      specs: 'Max Payload: 750 kg · 5.5 × 4.8 ft bed · House moves & commercial',
      baseFare: 310,
    },
    truck14: {
      key: 'truck14',
      name: '14ft Commercial Truck',
      img: 'assets/vehicles3d/truck14.webp',
      specs: 'Max Payload: 4,000 kg · 14 × 6.5 ft bed · Heavy freight & pallets',
      baseFare: 1250,
    },
  };

  function getBestFit(kg) {
    if (kg <= 5) return VEHICLES.bike;
    if (kg <= 25) return VEHICLES.auto;
    if (kg <= 750) return VEHICLES.mini;
    return VEHICLES.truck14;
  }

  function updateView() {
    const a = state.pointA || 'Koramangala';
    const b = state.pointB || 'Whitefield';
    const kg = state.weight || 18;
    const best = getBestFit(kg);

    // Update route indicators
    document.querySelectorAll('[data-comp-route]').forEach((el) => {
      el.textContent = `${a} → ${b} · ${kg} kg`;
    });

    // Update vehicle showcase
    const img = document.getElementById('compVehicleImg');
    const title = document.getElementById('compVehicleTitle');
    const specs = document.getElementById('compVehicleSpecs');

    if (img && img.src.indexOf(best.img) === -1) {
      img.src = best.img;
      img.alt = best.name;
    }
    if (title) title.textContent = best.name;
    if (specs) specs.textContent = best.specs;

    // Update comparison rows
    const utPrice = document.getElementById('compUtPrice');
    const utVehicle = document.getElementById('compUtVehicle');
    if (utPrice) utPrice.textContent = `₹${best.baseFare}`;
    if (utVehicle) utVehicle.textContent = best.name;

    const porterPrice = document.getElementById('compPorterPrice');
    if (porterPrice) {
      const porterCost = Math.round(best.baseFare * 1.55);
      porterPrice.textContent = `₹${porterCost}`;
    }

    const rapidoStatus = document.getElementById('compRapidoStatus');
    const rapidoPrice = document.getElementById('compRapidoPrice');
    if (rapidoStatus && rapidoPrice) {
      if (kg > 5) {
        rapidoStatus.textContent = 'Unavailable (5 kg limit)';
        rapidoStatus.className = 'compBadgeSurge';
        rapidoPrice.textContent = '—';
      } else {
        rapidoStatus.textContent = 'Available';
        rapidoStatus.className = 'compBadgeGood';
        rapidoPrice.textContent = '₹85';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateView();
  });

  // Export adapter for search form
  window.UTFilm = {
    minSearchMs: 300,
    isLive: () => true,
    update: function ({ a, b, kg }) {
      if (a) state.pointA = a;
      if (b) state.pointB = b;
      if (kg && kg > 0) state.weight = kg;
      updateView();
    },
    takeOver: function () {},
    backToSample: function () {},
    searching: function () {},
    showFound: function () {},
  };
})();
