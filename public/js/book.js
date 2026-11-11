// Book a delivery: build a quote request from the form, list every available provider
// (couriers, delivery apps, independent vehicles), let the customer sort and filter them
// by speed, price, weight limit and vehicle, then book their choice and hand off to tracking.
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const ICON = { air: 'plane', plane: 'plane', ship: 'ship', parcel: 'parcel', ptl: 'ptl' };
  const icon = (o) => `/assets/vehicles/${ICON[o.vehicle] || o.vehicle}.svg`;
  const form = $('#qf');
  let meta = null;
  let quote = null;
  let chosen = null;
  const NO_FILTER = { sort: 'best', kind: '', title: '', pickup: '', budget: '' };
  let view = { ...NO_FILTER };

  const authHeaders = () => { let t = ''; try { t = localStorage.getItem('ut_token') || ''; } catch (e) {} return t ? { Authorization: 'Bearer ' + t } : {}; };
  const api = (path, body) => fetch('/v1/public/booking/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) } : { headers: authHeaders() })
    .then((r) => r.json().then((d) => { if (!r.ok) throw new Error(d.message || 'Something went wrong'); return d; }));

  // ---- form setup -----------------------------------------------------------
  function fillLocalities() {
    const c = meta.cities.find((x) => x.key === $('#city').value);
    const opts = c.localities.map((l) => `<option>${esc(l)}</option>`).join('');
    $('#fromLoc').innerHTML = opts;
    $('#toLoc').innerHTML = opts;
    $('#toLoc').selectedIndex = Math.min(2, c.localities.length - 1);
  }
  function syncService() {
    const s = form.service.value;
    $$('[data-for]', form).forEach((el) => { el.hidden = el.dataset.for !== s; });
  }
  async function init() {
    meta = await api('meta');
    $('#city').innerHTML = meta.cities.map((c) => `<option value="${c.key}">${esc(c.name)}</option>`).join('');
    $('#country').innerHTML = meta.countries.map((c) => `<option>${esc(c)}</option>`).join('');
    $('#category').innerHTML = meta.categories.map((c) => `<option>${esc(c)}</option>`).join('');
    $('#fleetGrid').innerHTML = meta.vehicles.map((v) => `<div class="fleetCard"><img src="/assets/vehicles/${v.key}.svg" alt=""><b>${esc(v.name)}</b>
      <span class="cap">Up to ${v.kg >= 1000 ? v.kg / 1000 + ' tonnes' : v.kg + ' kg'} · ${v.m3} m³</span><small>${esc(v.use)}</small></div>`).join('');
    fillLocalities();
    // Prefill from the homepage widget / shared links.
    const q = new URLSearchParams(location.search);
    ['service', 'segment'].forEach((k) => { const v = q.get(k); const r = v && form.querySelector(`input[name=${k}][value="${CSS.escape(v)}"]`); if (r) r.checked = true; });
    if (q.get('city') && meta.cities.some((c) => c.key === q.get('city'))) { $('#city').value = q.get('city'); fillLocalities(); }
    [['from', '#fromLoc'], ['to', '#toLoc'], ['country', '#country']].forEach(([k, sel]) => { if (q.get(k)) $(sel).value = q.get(k); });
    ['from_pincode', 'to_pincode', 'weight'].forEach((k) => { if (q.get(k)) form[k].value = q.get(k); });
    if (q.get('from_pincode')) form.from_pincode_i.value = q.get('from_pincode');
    syncService();
    if (q.get('go')) form.requestSubmit();
  }
  form.addEventListener('change', (e) => {
    if (e.target.name === 'service') syncService();
    if (e.target.id === 'city') fillLocalities();
    if (e.target.id === 'when') $('#atWrap').hidden = e.target.value !== 'later';
  });
  ['from_pincode', 'to_pincode', 'from_pincode_i'].forEach((n) => form[n].addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); }));
  $('.quickLoads').addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    const w = Number(b.dataset.w);
    form.unit.value = w >= 1000 ? 't' : 'kg';
    form.weight.value = w >= 1000 ? w / 1000 : w;
    if (w >= 1000) $$('input[name=segment]')[1].checked = true;
  });

  // ---- quote ------------------------------------------------------------------
  const toIso = (v) => (v ? new Date(v).toISOString() : '');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form;
    $('#qErr').textContent = '';
    const service = f.service.value;
    const body = {
      service, segment: f.segment.value, category: f.category.value,
      weight: Number(f.weight.value) * (f.unit.value === 't' ? 1000 : 1), pieces: f.pieces.value, declared_value: f.declared_value.value,
      length: f.length.value, breadth: f.breadth.value, height: f.height.value, helpers: service === 'local' ? f.helpers.value : 0,
      pickup_at: f.when.value === 'later' ? toIso(f.pickup_at.value) : '', deliver_by: toIso(f.deliver_by.value),
      ...(service === 'local' && { city: f.city.value, from: f.from.value, to: f.to.value }),
      ...(service === 'national' && { from_pincode: f.from_pincode.value, to_pincode: f.to_pincode.value }),
      ...(service === 'international' && { from_pincode: f.from_pincode_i.value, country: f.country.value }),
    };
    $('#go').disabled = true;
    $('#go').textContent = 'Finding the best options…';
    try {
      quote = await api('quote', body);
      if (quote.locked) renderLocked(quote.count, body);
      else renderOptions();
      if (window.matchMedia('(max-width: 960px)').matches) $('.results').scrollIntoView({ behavior: 'smooth' });
    } catch (err) { $('#qErr').textContent = err.message; }
    finally { $('#go').disabled = false; $('#go').textContent = 'See delivery options'; }
  });

  function whenText(o) {
    const eta = new Date(o.eta);
    const time = eta.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (o.mode === 'local') {
      const sameDay = eta.toDateString() === new Date().toDateString();
      return `Pickup in ~${o.eta_pickup_min} min · drop by ${sameDay ? time : eta.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + time} (${o.trip_min} min trip)`;
    }
    return `Delivers by ${eta.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${o.days} day${o.days > 1 ? 's' : ''}`;
  }
  // Signed out: the server sent only a count, so these rows are placeholders behind the blur.
  function renderLocked(count, body) {
    const back = new URLSearchParams({ service: body.service, segment: body.segment, weight: body.weight, go: '1' });
    if (body.service === 'local') { back.set('city', body.city); back.set('from', body.from); back.set('to', body.to); }
    else { back.set('from_pincode', body.from_pincode); if (body.service === 'national') back.set('to_pincode', body.to_pincode); else back.set('country', body.country); }
    const signIn = '/?next=' + encodeURIComponent('/book/?' + back) + '#signup';
    const row = '<article class="card opt"><img src="/assets/vehicles/truck14.svg" alt=""><div><h3>Delivery option</h3><div class="meta"><span>Delivery partner</span></div><div class="when">Arrives soon</div></div><div class="price"><b>₹0,000</b><small class="muted">incl. GST</small></div></article>';
    $('#summary').innerHTML = '';
    $('#options').innerHTML = `<div class="lockedRes"><div class="lockedRes__blur" aria-hidden="true">${row.repeat(3)}</div>
      <div class="lockedRes__card"><div class="lockedRes__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
        <h3>Sign in to see your options</h3>
        <p>${count ? `We found ${count} option${count === 1 ? '' : 's'} for this route.` : 'See prices and delivery times for this route.'} Sign in to see prices and book.</p>
        <a class="btn btn-primary" href="${esc(signIn)}">Sign in to view</a></div></div>`;
  }
  const KINDS = { courier: 'Courier services', app: 'Delivery apps', independent: 'Independent vehicles', freight: 'Freight forwarders' };
  const select = (name, label, first, opts, value) => `<label class="f">${label}<select data-view="${name}"><option value="">${first}</option>${opts.map(([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  function renderCompare() {
    const uniq = (list) => [...new Set(list)];
    const SORTS = [['best', 'Best match'], ['fastest', 'Fastest'], ['cheapest', 'Lowest price'], ['weight', 'Highest weight limit']];
    $('#compare').innerHTML = `<div class="card compare">
      <div class="compare__sort"><span>Sort by</span><div class="pillSeg" role="radiogroup" aria-label="Sort by">${SORTS.map(([v, t]) => `<label><input type="radio" name="viewSort" data-view="sort" value="${v}"${view.sort === v ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      <div class="compare__filters">
        ${select('kind', 'Service type', 'All types', uniq(quote.options.map((o) => o.kind)).map((k) => [k, KINDS[k]]), view.kind)}
        ${select('title', 'Vehicle', 'All vehicles', uniq(quote.options.map((o) => o.title)).map((t) => [t, t]), view.title)}
        ${select('pickup', 'Availability', 'Any pickup time', [['60', 'Pickup within 1 hour'], ['480', 'Pickup today']], view.pickup)}
        <label class="f">Maximum price (₹)<input data-view="budget" inputmode="numeric" placeholder="Any" value="${esc(view.budget)}"></label>
      </div>
      <div class="compare__foot"><span id="showing" aria-live="polite"></span><button type="button" id="clearView">Clear filters</button></div></div>`;
  }
  function visibleOptions() {
    const list = quote.options.filter((o) => (!view.kind || o.kind === view.kind) && (!view.title || o.title === view.title)
      && (!view.pickup || o.pickup_within_min <= Number(view.pickup)) && (!(Number(view.budget) > 0) || o.total <= Number(view.budget)));
    const time = (o) => Date.parse(o.eta);
    if (view.sort === 'fastest') list.sort((a, b) => time(a) - time(b) || a.total - b.total);
    if (view.sort === 'cheapest') list.sort((a, b) => a.total - b.total || time(a) - time(b));
    if (view.sort === 'weight') list.sort((a, b) => b.max_kg - a.max_kg || a.total - b.total);
    return list;
  }
  function renderList() {
    const list = visibleOptions();
    $('#showing').textContent = `Showing ${list.length} of ${quote.options.length}${quote.unavailable_now ? ` · ${quote.unavailable_now} busy right now` : ''}`;
    $('#clearView').hidden = !view.kind && !view.title && !view.pickup && !view.budget && view.sort === 'best';
    if (!list.length) { $('#options').innerHTML = '<div class="card emptyState"><h3>Nothing matches these filters</h3><p class="muted">Try a higher price or clear a filter.</p></div>'; return; }
    $('#options').innerHTML = list.map((o) => `<article class="card opt ${o.tags.includes('Recommended') ? 'rec' : ''}">
      <img src="${icon(o)}" alt="">
      <div><div>${o.tags.map((t) => `<span class="tag ${t}">${t}</span>`).join('')}</div>
        <h3>${esc(o.provider)}</h3>
        <div class="meta"><span>${esc(o.title)} · ${esc(o.provider_type)} ${o.verified ? '<span class="verified">✓ verified</span>' : '<span>new partner</span>'}</span><span>★ ${o.rating}</span></div>
        <div class="optStats">
          <div><small>Speed</small><b>${whenText(o)}</b></div>
          <div><small>Weight limit</small><b>${esc(o.capacity)}</b></div>
          <div><small>Availability</small><b>${esc(o.availability)}</b></div>
        </div>
        <div class="meta"><span>${esc(o.note)}</span>${o.insurance ? `<span>incl. insurance ${money(o.insurance)}</span>` : ''}</div></div>
      <div class="price"><b>${money(o.total)}</b><small class="muted">incl. GST</small><button class="btn btn-primary" data-book="${o.id}">Book</button></div></article>`).join('');
  }
  function onViewChange(e) {
    const key = e.target.dataset.view;
    if (!key) return;
    view[key] = e.target.value;
    renderList();
  }
  function renderOptions() {
    const r = quote.route;
    $('#summary').innerHTML = `<div class="card routeBar"><b>${esc(r.from)} → ${esc(r.to)}</b>${r.city ? `<span class="chip2">${esc(r.city)}</span>` : ''}
      ${r.distance_km ? `<span class="chip2">${r.distance_km.toLocaleString('en-IN')} km</span>` : ''}<span class="chip2">${quote.load.weight >= 1000 ? quote.load.weight / 1000 + ' t' : quote.load.weight + ' kg'} · ${quote.load.pieces} pc</span>
      <span class="chip2">${quote.options.length} available</span>${quote.hidden_by_deadline ? `<span class="chip2">${quote.hidden_by_deadline} miss your deadline</span>` : ''}</div><div id="compare"></div>`;
    if (!quote.options.length) { $('#options').innerHTML = `<div class="card emptyState"><h3>No match yet</h3><p class="muted">${esc(quote.message)}</p></div>`; return; }
    view = { ...view, title: quote.options.some((o) => o.title === view.title) ? view.title : '', kind: quote.options.some((o) => o.kind === view.kind) ? view.kind : '' };
    renderCompare();
    renderList();
    $('#compare').addEventListener('change', onViewChange);
    $('#compare').addEventListener('input', onViewChange);
    $('#clearView').addEventListener('click', () => { view = { ...NO_FILTER }; renderCompare(); renderList(); });
  }

  // ---- book -------------------------------------------------------------------
  const sheet = $('#sheet');
  const bf = $('#bf');
  const sheetDefault = bf.innerHTML;
  function openSheet(o) {
    chosen = o;
    bf.innerHTML = sheetDefault;
    $('#chosen', bf).innerHTML = `<div class="row" style="gap:14px;margin-bottom:6px"><img src="${icon(o)}" alt="" width="84"><div><b style="font-size:18px">${esc(o.title)}</b>
      <div class="muted" style="font-size:13px">${esc(o.provider)} · ${whenText(o)}</div></div><span style="flex:1"></span><b style="font-size:22px">${money(o.total)}</b></div>`;
    $('[data-b2b]', bf).hidden = form.segment.value !== 'b2b';
    const r = quote.route;
    if (r.city) { bf.pickup_address.placeholder = `Building, street — ${r.from}`; bf.drop_address.placeholder = `Building, street — ${r.to}`; }
    bf.phone.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
    sheet.hidden = false;
    bf.name.focus();
  }
  $('#options').addEventListener('click', (e) => {
    const b = e.target.closest('[data-book]');
    if (b) openSheet(quote.options.find((o) => o.id === b.dataset.book));
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.hidden = true; });
  bf.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#bErr', bf).textContent = '';
    const btn = $('#bookBtn', bf);
    btn.disabled = true;
    btn.textContent = 'Booking…';
    try {
      const r = await api('book', {
        quote_id: quote.quote_id, option_id: chosen.id, contact: { name: bf.name.value.trim(), phone: bf.phone.value },
        company: bf.company.value, gstin: bf.gstin.value.trim(), pickup_address: bf.pickup_address.value, drop_address: bf.drop_address.value, payment: bf.pay.value,
      });
      bf.innerHTML = `<div class="success"><div class="tick">✓</div><h2 style="margin:0 0 6px">Booking confirmed</h2>
        <p class="muted">Booked with <b>${esc(chosen.provider)}</b> · ${esc(chosen.title)}</p>
        <p class="muted">Booking ID <b class="mono">${esc(r.id)}</b> · ${money(r.total)}</p>
        <p class="muted">${chosen.mode === 'local' ? 'A driver is being assigned now. Share the pickup OTP only when they arrive.' : 'Your pickup is scheduled. You’ll get updates by SMS.'}</p>
        <a class="btn btn-primary btn-block" href="${esc(r.tracking_url)}">Track live</a></div>`;
    } catch (err) {
      $('#bErr', bf).textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Confirm booking';
      if (/expired/.test(err.message)) { sheet.hidden = true; form.requestSubmit(); }
    }
  });

  init().catch(() => { $('#options').innerHTML = '<div class="card emptyState"><p class="muted">Could not load booking options. Refresh to try again.</p></div>'; });
})();
