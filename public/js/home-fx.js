// Homepage set pieces: the "what fits?" weight box (real vehicle capacities from
// the booking API) and the webhook feed.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const $ = (s, scope = document) => scope.querySelector(s);
  const $$ = (s, scope = document) => Array.from(scope.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- what fits? ----------------------------------------------------------
  (function fits() {
    const root = $('#fits');
    if (!root) return;
    const input = $('#fitWeight');
    const error = $('#fitError');
    const pic = $('.fitPic', root);
    const out = {
      name: $('[data-fit=name]', root), cap: $('[data-fit=cap]', root), use: $('[data-fit=use]', root),
      gauge: $('.fitGauge__fill', root), pct: $('[data-fit=pct]', root), cta: $('[data-fit=cta]', root),
    };
    const unit = () => $('input[name=fitUnit]:checked', root).value;
    const nice = (kg) => (kg >= 1000 ? +(kg / 1000).toFixed(1) + ' t' : +kg.toFixed(1) + ' kg');
    let vehicles = [];
    let shownKey = 'bike';

    function getVehicleImg(key) {
      const jpgs = ['bike', 'auto', 'mini', 'truck14'];
      return jpgs.includes(key) ? `assets/vehicles3d/${key}.jpg` : `assets/vehicles3d/${key}.webp`;
    }

    function showVehicle(v) {
      if (v.key === shownKey) return;
      shownKey = v.key;
      pic.src = getVehicleImg(v.key);
      pic.classList.remove('is-swap');
      void pic.offsetWidth;
      pic.classList.add('is-swap');
    }
    function update() {
      if (!vehicles.length) return;
      const raw = input.value.trim().replace(/,/g, '');
      const value = Number(raw);
      if (!raw) { // nothing typed yet: invite, rather than complain
        error.textContent = '';
        out.name.textContent = 'Your vehicle';
        out.cap.textContent = 'Enter a weight to see the right one.';
        out.use.textContent = '';
        out.gauge.style.transform = 'scaleX(0)';
        out.pct.textContent = '';
        out.cta.href = '/book/?service=local';
        return;
      }
      if (!Number.isFinite(value) || value <= 0) {
        error.textContent = 'Enter a weight as a number, like 250.';
        return;
      }
      const kg = unit() === 't' ? value * 1000 : value;
      const biggest = vehicles[vehicles.length - 1];
      error.textContent = kg > biggest.kg ? `One vehicle carries up to ${nice(biggest.kg)}. We can split a heavier load across several.` : '';
      const v = vehicles.find((x) => x.kg >= kg) || biggest;
      const pct = Math.min(100, Math.max(1, Math.round((kg / v.kg) * 100)));
      out.name.textContent = v.name;
      out.cap.textContent = 'Carries up to ' + nice(v.kg);
      out.use.textContent = v.use;
      out.gauge.style.transform = `scaleX(${pct / 100})`;
      out.pct.textContent = kg > v.kg ? `${nice(kg)} is more than one vehicle can carry` : `${nice(kg)} fills ${pct}% of this vehicle`;
      out.cta.href = `/book/?service=local&weight=${Math.max(1, Math.round(kg))}`;
      showVehicle(v);
    }
    input.addEventListener('input', update);
    $('.fitForm', root).addEventListener('submit', (e) => { e.preventDefault(); update(); });
    $$('input[name=fitUnit]', root).forEach((r) => r.addEventListener('change', update));
    $$('[data-kg]', root).forEach((chip) => chip.addEventListener('click', () => {
      const kg = Number(chip.dataset.kg);
      const inTonnes = kg >= 1000;
      $(`input[name=fitUnit][value=${inTonnes ? 't' : 'kg'}]`, root).checked = true;
      input.value = inTonnes ? kg / 1000 : kg;
      update();
    }));
    fetch('/v1/public/booking/meta').then((r) => r.json()).then((m) => {
      vehicles = m.vehicles.slice().sort((a, b) => a.kg - b.kg);
      // Fetched ahead of time so a new vehicle appears the moment the weight calls for it.
      vehicles.forEach((v) => { new Image().src = getVehicleImg(v.key); });
      update();
    }).catch(() => { root.hidden = true; });
  })();

  // ---- webhook feed: same event names the API sends ------------------------
  (function feed() {
    const term = $('#hookFeed');
    if (!term) return;
    const EVENTS = [
      ['order.created', '{ "order_id": "UT-48213", "payment_method": "cod" }'],
      ['order.confirmed', '{ "order_id": "UT-48213" }'],
      ['shipment.created', '{ "awb": "UT7741920386", "courier": "recommended" }'],
      ['shipment.pickup_scheduled', '{ "awb": "UT7741920386", "pickup_date": "tomorrow" }'],
      ['ndr.actioned', '{ "awb": "UT7741920386", "action": "reattempt" }'],
      ['return.created', '{ "return_id": "R1042", "type": "exchange" }'],
    ];
    const add = (evt, body) => {
      const li = document.createElement('li');
      const time = document.createElement('span');
      time.textContent = new Date().toLocaleTimeString('en-GB');
      const name = document.createElement('b');
      name.textContent = evt;
      const data = document.createElement('code');
      data.textContent = body;
      const ok = document.createElement('em');
      ok.textContent = '200 signed';
      li.append(time, name, data, ok);
      term.appendChild(li);
      while (term.children.length > 5) term.firstElementChild.remove();
    };
    if (reduceMotion) { EVENTS.slice(0, 5).forEach(([a, b]) => add(a, b)); return; }
    let i = 0;
    let timer = null;
    const tick = () => { add(EVENTS[i][0], EVENTS[i][1]); i = (i + 1) % EVENTS.length; };
    tick();
    new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting) timer = setInterval(tick, 1500);
    }).observe(term);
  })();
});
