// Homepage search: pickup and drop (area or pin code) plus weight. Runs the quote
// here so the hero film can follow along, then shows the result under the hero:
// signed out only the count, signed in the services, each opening the booking page.
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const form = document.getElementById('quickBook');
  if (!form) return;
  const film = window.UTFilm;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const ICON = { air: 'plane', plane: 'plane', ship: 'ship', parcel: 'parcel', ptl: 'ptl' };
  const error = document.getElementById('quickBookError');
  const result = document.getElementById('heroResult');
  const submit = form.querySelector('button.btn');
  let areas = [];
  let meta = null;
  let searchId = 0;

  const abroad = () => form.dest.value === 'abroad';
  const known = (v) => {
    const t = v.trim().toLowerCase();
    return /^\d{6}$/.test(t) || areas.some((a) => {
      const [area, city] = a.toLowerCase().split(', ');
      return a.toLowerCase() === t || area === t || city === t || city.split(' ')[0] === t;
    });
  };
  const placeLabel = (input) => (known(input.value) ? input.value.split(',')[0].trim() : '');

  // Whatever is complete so far goes on the film's map.
  // Which city a place is in, and where it is, from what the server shares in its meta data.
  function placeOf(text) {
    const t = text.trim().toLowerCase();
    if (!meta || !t) return { city: null, ll: null };
    if (/^\d{6}$/.test(t)) {
      const p3 = t.slice(0, 3);
      return { city: meta.pin_cities[p3] || 'pin ' + p3, ll: meta.pin_points[p3] ? meta.pin_points[p3].slice(0, 2) : meta.pin_points[t.slice(0, 2)] || null };
    }
    const hit = areas.find((a) => {
      const [area, city] = a.toLowerCase().split(', ');
      return a.toLowerCase() === t || area === t || city === t || city.split(' ')[0] === t;
    });
    return hit ? { city: hit.split(', ')[1], ll: meta.area_points[hit] } : { city: 'other ' + t, ll: null };
  }
  // accepted: the server resolved this route, so pin the text even if we don't recognise it here.
  function syncFilm(accepted, service) {
    if (!film) return;
    const label = (input) => (accepted ? input.value.split(',')[0].trim() : placeLabel(input));
    const a = label(form.from_place);
    const b = abroad() ? form.country.value : label(form.to_place);
    const from = placeOf(form.from_place.value);
    const to = abroad() ? { ll: meta && meta.country_points[form.country.value] } : placeOf(form.to_place.value);
    // The film's setting: the city, the map of India or the globe.
    let scale = 'local';
    if (abroad()) scale = 'international';
    else if (service) scale = service;
    else if (a && b && from.city !== to.city) scale = 'national';
    film.update({ a, b, kg: Number(form.weight.value) > 0 ? Number(form.weight.value) : 0, scale, fromLL: from.ll, toLL: to.ll });
  }
  function clearResult() {
    searchId++;
    result.hidden = true;
    result.innerHTML = '';
    submit.disabled = false;
    submit.textContent = 'Find available services';
  }
  form.addEventListener('focusin', () => { if (film) film.takeOver(); });
  // Left the form with nothing entered: the sample story picks up again.
  form.addEventListener('focusout', () => setTimeout(() => {
    const empty = !form.from_place.value.trim() && !form.to_place.value.trim() && !form.weight.value.trim() && !form.country.value;
    if (film && empty && !form.contains(document.activeElement)) film.backToSample();
  }, 0));
  form.addEventListener('input', () => { error.textContent = ''; clearResult(); syncFilm(); });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'dest') {
      form.querySelectorAll('[data-dest]').forEach((el) => { el.hidden = el.dataset.dest !== form.dest.value; });
    }
    syncFilm();
  });

  fetch('/v1/public/booking/meta').then((r) => r.json()).then((m) => {
    areas = m.areas;
    meta = m;
    document.getElementById('areaList').innerHTML = m.areas.map((a) => `<option value="${esc(a)}"></option>`).join('');
    form.country.innerHTML = '<option value="">Select country</option>' + m.countries.map((c) => `<option>${esc(c)}</option>`).join('');
    if (film && film.isLive()) syncFilm(); // anything typed before the areas arrived
  }).catch(() => {});

  // First thing still missing, in the order the fields appear.
  function problem() {
    if (!form.from_place.value.trim()) return [form.from_place, 'Enter the pickup location or pin code.'];
    if (abroad()) { if (!form.country.value) return [form.country, 'Select a country.']; }
    else if (!form.to_place.value.trim()) return [form.to_place, 'Enter the drop location or pin code.'];
    if (!(Number(form.weight.value) > 0)) return [form.weight, 'Enter the weight in kg.'];
    return null;
  }
  const bookUrl = (resolved) => '/book/?' + new URLSearchParams({ ...resolved, segment: form.hb_segment.value, weight: form.weight.value, go: '1' });

  function whenText(o) {
    const eta = new Date(o.eta);
    if (o.mode === 'local') return `Pickup in ~${o.eta_pickup_min} min · ${o.trip_min} min trip`;
    return `By ${eta.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${o.days} day${o.days > 1 ? 's' : ''}`;
  }
  const countText = (n) => `${n} service${n === 1 ? '' : 's'}`;

  function renderLocked(q) {
    const signIn = '/?next=' + encodeURIComponent(bookUrl(q.resolved)) + '#signup';
    result.innerHTML = `<div class="heroResult__locked">
      <div class="lockedRes__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
      <div><h3>We found ${countText(q.count)} for this route</h3><p>Sign in to compare couriers, delivery apps and independent vehicles by speed, price, weight limit and vehicle.</p></div>
      <a class="btn btn-primary" href="${esc(signIn)}">Sign in to view</a></div>`;
    if (film) film.showFound(q.count, `${countText(q.count)} found on your route. Sign in to see them.`);
  }
  // The highlights only; the booking page is where every provider is compared.
  function renderList(q) {
    const url = bookUrl(q.resolved);
    result.innerHTML = `<div class="heroResult__head"><div><h3>${countText(q.options.length)} available</h3><span>${esc(q.route.from)} → ${esc(q.route.to)}</span></div><a class="btn btn-primary" href="${esc(url)}">Compare all ${q.options.length}</a></div>
      <div class="heroResult__list">${q.options.filter((o) => o.tags.length).map((o) => `<article class="svcRow">
        <img src="/assets/vehicles/${ICON[o.vehicle] || o.vehicle}.svg" alt="">
        <div><h4>${esc(o.provider)}${o.tags.map((t) => `<em>${esc(t)}</em>`).join('')}</h4>
          <p>${esc(o.title)} · ${esc(o.provider_type)} · ★ ${o.rating}</p><p>${whenText(o)} · ${esc(o.availability)}</p></div>
        <b>${money(o.total)}</b></article>`).join('')}</div>`;
    if (film) film.showFound(q.options.length, `${countText(q.options.length)} available on your route. Compare them and choose.`);
  }
  function renderEmpty() {
    result.innerHTML = `<div class="heroResult__locked"><div><h3>No service fits this load yet</h3><p>Try splitting it into smaller loads, or check the weight.</p></div></div>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bad = problem();
    error.textContent = bad ? bad[1] : '';
    if (bad) { bad[0].focus(); return; }
    const id = ++searchId;
    result.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Finding services…';
    syncFilm();
    if (film) film.searching();
    let token = '';
    try { token = localStorage.getItem('ut_token') || ''; } catch (err) {}
    const ask = fetch('/v1/public/booking/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
      body: JSON.stringify({
        from_place: form.from_place.value, weight: Number(form.weight.value), segment: form.hb_segment.value,
        ...(abroad() ? { country: form.country.value } : { to_place: form.to_place.value }),
      }),
    }).then((r) => r.json().then((d) => { if (!r.ok) throw new Error(d.message || 'Something went wrong'); return d; }));
    // Long enough to see the partners connect on the map.
    const pause = new Promise((done) => setTimeout(done, film ? film.minSearchMs : 0));
    try {
      const [q] = await Promise.all([ask, pause]);
      if (id !== searchId) return; // the route was edited while this was running
      const count = q.locked ? q.count : q.options.length;
      syncFilm(true, q.resolved && q.resolved.service);
      if (!count) renderEmpty();
      else if (q.locked) renderLocked(q);
      else renderList(q);
      result.hidden = false;
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      if (id !== searchId) return;
      error.textContent = err.message === 'Failed to fetch' ? 'Could not reach the server. Please try again.' : err.message;
      syncFilm();
    } finally {
      if (id === searchId) {
        submit.disabled = false;
        submit.textContent = 'Find available services';
      }
    }
  });
});
