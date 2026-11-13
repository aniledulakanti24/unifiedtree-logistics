// Vehicle, Courier, Logistics and International: each has its own dashboard, a booking
// flow (location or pincode → weight → optional size → recommendations), and orders.
import { api, esc, money, store, toast, modal, withBusy, dateTime, date, formData, inrHint } from '../core.js';
import { duo, tile, scene, vehicleImg } from './art.js';
import { sortChips, tagBadges, star, payChoice, withFunds, refresh, mountDeals, filterBtn, openFilters, countActive } from './ui.js';
import { openTracking } from './tracking.js';
import { smoothTo } from './motion.js';
import { deskTabs, renderDeskBody } from './desk.js';
import { payMethods, checkout, PAY_LABEL, BOOKING_PAY } from './checkout.js';
import { openPlacePicker, placeChips, samePlace } from './places.js';
import { icon } from './icons.js';

export const SECTIONS = {
  vehicle: { title: 'Vehicle Transport', icon: 'bike', tone: 'green', by: 'location', intro: 'Bikes, autos and vans for small loads inside your city.', from: 'Where is your pickup?', to: 'Where is your drop?', providers: ['Rapido', 'Porter', 'Uber', 'Borzo', 'Local vehicle owners'], assigned: 'Rider assigned', newLabel: 'New booking' },
  courier: { title: 'Courier Transport', icon: 'parcel', tone: 'amber', by: 'pincode', intro: 'Parcels and heavy shipments, by pincode and address.', from: 'Pickup pincode', to: 'Delivery pincode', providers: ['Blue Dart', 'Delhivery', 'Xpressbees', 'DTDC', 'Ecom Express', 'Shadowfax', 'Ekart', 'India Post', 'Gati', 'Safexpress', 'TCI Express'], assigned: 'Pickup scheduled', newLabel: 'New shipment', scope: true },
  logistics: { title: 'Logistics Transport', icon: 'truck', tone: 'blue', by: 'location', intro: 'Full trucks through third-party logistics companies and contractors.', from: 'Pickup location or pincode', to: 'Drop location or pincode', providers: ['BlackBuck', 'Mahindra Logistics', 'TCI Freight', 'Highway Freightlines', 'Salim Cargo Movers', 'Deccan Haulage Contractors'], assigned: 'Truck assigned', newLabel: 'New load', scope: true },
  international: { title: 'International', icon: 'globe', tone: 'violet', by: 'country', intro: 'Express, air freight and sea freight from India to the world.', from: 'Pickup pincode', to: 'Destination country', providers: ['DHL Express', 'FedEx International', 'UPS Worldwide', 'Aramex', 'GlobalAir Cargo', 'OceanLink Freight'], assigned: 'Pickup scheduled', newLabel: 'New shipment' },
};
const SAMPLES = { vehicle: { from: 'Koramangala, Bengaluru', to: 'Whitefield, Bengaluru', weight: '12' }, courier: { from: '560034', to: '400053', weight: '2' }, logistics: { from: 'Pune', to: 'Hyderabad', weight: '1200' }, international: { from: '560034', country: 'United Arab Emirates', weight: '5' } };
const SHORT_SORTS = [['best', 'Best'], ['fast', 'Fastest'], ['low', 'Cheapest'], ['rating', 'Top rated']];
const EXTRAS = [['fragile', 'Fragile handling', 49], ['packaging', 'Premium packaging', 99], ['priority', 'Priority pickup', 79]];
const memory = {}; // per section: the last form and results, kept across tabs and currency changes
window.addEventListener('ut:desk-settings', (e) => { delete memory[e.detail]; });
let meta = null;
const loadMeta = async () => { if (!meta) meta = await api('/public/booking/meta'); return meta; };

function header(section, tab) {
  const s = SECTIONS[section];
  return `<div class="page-head"><div class="row head-t">${tile(s.icon, s.tone).value}<div><h1>${esc(s.title)}</h1><p>${esc(s.intro)}</p></div></div>
    <div class="row">${s.scope && tab === 'book' ? `<select class="select scope" aria-label="Domestic or international" data-scope><option selected>Domestic</option><option value="intl">International</option></select>` : ''}</div></div>${deskTabs(section, tab)}`;
}

export async function render(view, { section, tab, query }) {
  view.innerHTML = header(section, tab) + '<div id="body"></div>';
  const scope = view.querySelector('[data-scope]');
  if (scope) scope.addEventListener('change', () => { if (scope.value === 'intl') location.hash = '#/international/book'; });
  const body = view.querySelector('#body');
  if (['dashboard', 'orders', 'returns', 'cancellations', 'analytics', 'tower', 'settings'].includes(tab)) return renderDeskBody(body, section, tab, query, SECTIONS[section].providers);
  if (tab === 'bulk') return bulkForm(body);
  return bookForm(body, section, query);
}

// ---- booking flow -----------------------------------------------------------------
function placeButton(name, placeholder, cfg, value, place) {
  const label = place ? (place.house || place.label) : value;
  const sub = place ? [place.area && place.city ? `${place.area}, ${place.city}` : place.city, place.pincode].filter(Boolean).join(' · ') : value ? 'Tap to set the exact pin' : (name === 'from' ? 'Search, use your location or a saved place' : 'Search an area, street or pin code');
  return `<input type="hidden" name="${name}" value="${esc(value || '')}"><button class="place-btn ${value ? 'is-set' : ''}" type="button" data-place="${name}" aria-label="${esc(placeholder)}${value ? `: ${esc(label)}` : ''}"><span class="grow"><b>${esc(label || placeholder)}</b><small>${esc(sub)}</small></span>${place && place.lat ? `<span class="place-ok">${icon('check', 16)}</span>` : ''}${icon('chevron', 16)}</button>`;
}
function placeInput(name, placeholder, cfg, value) {
  const pin = cfg.by === 'pincode';
  return `<input class="input input--lg" name="${name}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off" ${pin ? 'inputmode="numeric" maxlength="6"' : 'list="areaList"'}>`;
}

async function bookForm(body, section, query) {
  const cfg = SECTIONS[section];
  const m = await loadMeta();
  const { profiles } = await api('/hub/weight').catch(() => ({ profiles: [] }));
  if (!memory[section]) {
    const st = await api('/hub/desk/settings', { query: { desk: section } }).catch(() => ({}));
    memory[section] = { form: { from: st.pickup || undefined, pay_mode: st.pay_mode }, sort: st.sort || 'best', type: 'all', quote: null, selected: null, compare: [], when: 'now' };
  }
  const mem = memory[section];
  ['from', 'to', 'weight', 'country'].forEach((k) => { if (query.get(k)) { mem.form[k] = query.get(k); mem.quote = null; } });
  const f = mem.form;
  const intl = cfg.by === 'country';
  const business = store.state.accountType === 'business';
  body.innerHTML = `
    <div class="book">
      <form class="book__form card" id="bf" novalidate>
        <h2 class="h-lg">Delivery details</h2>
        <div class="route">
          <div class="route__row">${tile('pin', 'plain').value}${intl ? `<input class="input input--lg" name="from" value="${esc(f.from || '')}" placeholder="${esc(cfg.from)}" aria-label="${esc(cfg.from)}" inputmode="numeric" maxlength="6">` : placeButton('from', cfg.from, cfg, f.from, f.from_place)}</div>
          <i class="route__dash" aria-hidden="true"></i>
          <div id="stops"></div>
          <div class="route__row">${tile('flag', 'plain').value}${intl ? `<select class="select input--lg" name="country" aria-label="${esc(cfg.to)}"><option value="">${esc(cfg.to)}</option>${m.countries.map((c) => `<option ${f.country === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : placeButton('to', cfg.to, cfg, f.to, f.to_place)}</div>
          ${cfg.by === 'location' ? '<button class="link add-stop" id="addStop" type="button">+ Add a stop</button>' : ''}
        </div>
        ${cfg.by === 'location' ? `<datalist id="areaList">${m.areas.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>` : ''}
        <hr class="rule">
        <h2 class="h-lg">Package details</h2>
        ${profiles.length ? `<label class="field">Saved package<select class="select" id="prof"><option value="">Choose a saved package</option>${profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.weight} kg</option>`).join('')}</select></label>` : ''}
        <div class="form-grid">
          <label class="field"><span class="req">Weight (kg)</span><span class="with-ico">${duo('scale', 'sm').value}<input class="input" name="weight" inputmode="decimal" value="${esc(f.weight || '')}" placeholder="Total weight"></span></label>
          <label class="field">Package type<span class="with-ico">${duo('box2', 'sm').value}<select class="select" name="category">${m.categories.map((c) => `<option ${f.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></span></label>
          <div class="field full"><span>Size in cm (optional)</span><div class="dims">${duo('ruler', 'sm').value}${[['length', 'Length'], ['breadth', 'Width'], ['height', 'Height']].map(([k, l]) => `<input class="input" name="${k}" inputmode="decimal" value="${esc(f[k] || '')}" placeholder="${l}" aria-label="${l} in cm">`).join('')}</div></div>
          <div class="field full"><span class="req">Pay for shipping</span>${payChoice('pay_mode', { value: f.pay_mode || 'prepaid' })}</div>
        </div>
        <details class="more" ${f.more ? 'open' : ''}><summary>More options<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="form-grid more__b">
          <div class="field"><span>Pickup</span><div class="seg" id="when" role="group"><button type="button" data-w="now" aria-pressed="${mem.when !== 'later'}">Now</button><button type="button" data-w="later" aria-pressed="${mem.when === 'later'}">Schedule</button></div></div>
          <label class="field" id="pickWrap" ${mem.when === 'later' ? '' : 'hidden'}>Pickup time<input class="input" type="datetime-local" name="pickup_at" value="${esc(f.pickup_at || '')}"></label>
          <label class="field">Deliver by<input class="input" type="datetime-local" name="deliver_by" value="${esc(f.deliver_by || '')}"></label>
          <label class="field">Number of pieces<input class="input" name="pieces" inputmode="numeric" value="${esc(f.pieces || '1')}"></label>
          ${['vehicle', 'logistics'].includes(section) ? `<label class="field">Loading helpers<select class="select" name="helpers">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}" ${String(f.helpers || 0) === String(n) ? 'selected' : ''}>${n ? n : 'None'}</option>`).join('')}</select></label>` : ''}
          <label class="field">Package value (₹)<input class="input" name="value" inputmode="numeric" value="${esc(f.value || '')}" placeholder="For insurance"><small class="muted" id="valFx"></small></label>
          <label class="row insure"><input type="checkbox" class="check" name="insure" ${f.insure ? 'checked' : ''}> ${duo('shield', 'sm').value}<span>Insure <small class="muted">0.2%, minimum ₹30</small></span></label>
          <label class="field full">Reference ID<input class="input" name="reference" value="${esc(f.reference || '')}" placeholder="Your order or invoice number"></label>
        </div></details>
        <button class="btn btn-primary btn-block book__go" type="submit">Show services</button>
      </form>
      <aside class="book__side card" aria-live="polite"><h2 class="h-lg">Checkout</h2><div id="results"></div></aside>
    </div>`;
  const form = body.querySelector('#bf');
  const results = body.querySelector('#results');
  const valFx = () => { body.querySelector('#valFx').textContent = inrHint(form.value.value); };
  valFx();

  const waiting = () => `<div class="wait">${scene('orders').value}<b>Your options appear here</b><p>${intl ? 'Add the pickup pincode, country and weight.' : `Add the ${cfg.by === 'pincode' ? 'pincodes' : 'pickup, drop'} and weight.`}</p><button class="btn btn-outline btn-sm" data-sample type="button">Try a sample order</button></div>`;
  const issueCard = (x) => `<div class="issue" role="alert">${scene('carton').value}<b>${esc(x.title || 'We need a little more')}</b><p>${esc(x.message)}</p><div class="issue__a">${x.suggest ? `<a class="btn btn-primary" href="#/${x.suggest}/book?${new URLSearchParams(Object.entries(x.query || {}).filter(([, v]) => v))}">Switch to ${esc(SECTIONS[x.suggest].title.split(' ')[0])}</a>` : ''}<button class="btn btn-outline" data-sample type="button">Try a sample order</button></div></div>`;
  let placedTimer = 0;
  const STEPS = [['Booked', ['BOOKED']], ['Assigned', ['ASSIGNED', 'ARRIVING', 'PICKUP_SCHEDULED']], ['Picked up', ['PICKED_UP']], ['On the way', ['IN_TRANSIT', 'OUT_FOR_DELIVERY']], ['Delivered', ['DELIVERED']]];
  async function pollPlaced() {
    clearTimeout(placedTimer);
    const host = results.querySelector('#placedLive');
    if (!host || !mem.placed) return;
    try {
      const r = await api('/hub/orders/track', { query: { id: mem.placed.id } });
      const t = r.tracking; if (!t || !results.querySelector('#placedLive')) return;
      const at = STEPS.findIndex(([, l]) => l.includes(t.status));
      const otp = t.otp ? (t.otp.pickup ? ['Pickup OTP', t.otp.pickup] : ['Delivery OTP', t.otp.delivery]) : null;
      results.querySelector('#placedLive').innerHTML = `<ol class="pl-steps">${STEPS.map(([l], n) => `<li class="${n < at ? 'done' : n === at ? 'now' : ''}"><i></i><span>${l}</span></li>`).join('')}</ol><p class="pl-now"><b>${esc(t.label)}</b>${t.status !== 'DELIVERED' && t.remaining_min < 90 ? ` · ${t.remaining_min} min left` : ''}</p>${t.driver ? `<div class="pl-driver">${duo('user').value}<div><b>${esc(t.driver.name)}</b><small>${esc(t.driver.vehicle_no)} · ${esc(t.driver.rating)} ★</small></div>${otp ? `<div class="pl-otp"><small>${esc(otp[0])}</small><b class="mono" translate="no">${esc(otp[1])}</b></div>` : ''}</div>` : ''}`;
      if (t.status !== 'DELIVERED') placedTimer = setTimeout(pollPlaced, 3000);
    } catch (e) { /* retried when the panel repaints */ }
  }
  function paintPlaced() {
    const p = mem.placed;
    results.innerHTML = `<div class="placed"><div class="placed__tree" aria-hidden="true"></div><span class="placed__ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></span><b class="placed__t">Order placed</b><small class="mono">${esc(p.id)}</small><p>${esc(p.provider)} · ${esc(p.from)} → ${esc(p.to)}</p><b class="placed__p" translate="no">${esc(money(p.amount))}</b><small class="muted">${p.pay_mode === 'cod' ? 'Pay on delivery' : `Paid by ${PAY_LABEL[p.pay_via] || 'wallet'}`}</small><div id="placedLive" class="placed__live"><div class="skeleton" style="height:80px"></div></div><div class="placed__a"><button class="btn btn-primary" data-live type="button">Live tracking</button><a class="btn btn-outline" href="#/my/orders/${esc(p.id)}">View order</a></div><button class="link" data-another type="button">Book another</button><small class="muted">Simulated order. The journey runs faster than real time.</small></div>`;
    // A small tree grows for the new order.
    if (window.UTTree) window.UTTree.mount(results.querySelector('.placed__tree'), { compact: true, now: true, seed: p.id.length * 31 + p.amount });
    pollPlaced();
  }
  const ready = (d) => (intl ? /^\d{6}$/.test(d.from || '') && d.country : cfg.by === 'pincode' ? /^\d{6}$/.test(d.from || '') && /^\d{6}$/.test(d.to || '') : (d.from || '').trim().length > 2 && (d.to || '').trim().length > 2) && Number(d.weight) > 0;

  const optFields = () => [{ key: 'type', label: 'Service type', options: [['', 'All services'], ...[...new Set(mem.quote.options.map((o) => o.provider_type))].map((t) => [t, t])] }, { key: 'max', label: 'Maximum price (₹)', placeholder: 'Any' }, { key: 'rating', label: 'Minimum rating', options: [['', 'Any'], ['4', '4 and above'], ['4.3', '4.3 and above'], ['4.5', '4.5 and above']] }, { key: 'ontime', label: 'On-time record', options: [['', 'Any'], ['90', '90% and above'], ['95', '95% and above']] }];
  function paint() {
    if (mem.placed) { paintPlaced(); return; }
    if (mem.issue) { results.innerHTML = issueCard(mem.issue); return; }
    const q = mem.quote;
    if (!q) { results.innerHTML = waiting(); return; }
    if (!q.options.length) { results.innerHTML = issueCard({ title: 'No service available', message: q.message || 'No service fits this load.' }); return; }
    mem.f = mem.f || { type: '', max: '', rating: '', ontime: '' };
    let list = q.options.filter((o) => (!mem.f.type || o.provider_type === mem.f.type) && (!mem.f.max || o.total <= Number(mem.f.max)) && (!mem.f.rating || o.rating >= Number(mem.f.rating)) && (!mem.f.ontime || o.on_time >= Number(mem.f.ontime)));
    const eta = (o) => Date.parse(o.eta);
    if (mem.sort === 'fast') list = [...list].sort((a, b) => eta(a) - eta(b) || a.total - b.total);
    if (mem.sort === 'low') list = [...list].sort((a, b) => a.total - b.total);
    if (mem.sort === 'rating') list = [...list].sort((a, b) => b.rating - a.rating || a.total - b.total);
    const sel = q.options.find((o) => o.id === mem.selected);
    const cod = form.pay_mode.value === 'cod';
    const fee = sel && cod ? Math.max(25, Math.round(sel.total * 0.015)) : 0;
    const load = (o) => Math.min(100, Math.round((q.load.weight / o.max_kg) * 100));
    results.innerHTML = `
      <p class="route-sum"><b>${esc(q.route.from)}</b><span>→</span><b>${esc(q.route.to)}</b><small>${q.route.distance_km ? `${q.route.distance_km} km · ` : ''}${q.load.weight} kg</small></p>
      ${q.holiday ? `<p class="note note--warn">${esc(q.holiday.name || 'Holiday')}: ${q.holiday.closed.length ? `${q.holiday.closed.length} partners closed` : 'reduced service'}. <a class="link" href="#/holidays">Calendar</a></p>` : q.insight ? `<p class="note note--${q.insight.tone}">${esc(q.insight.text)}</p>` : ''}
      <div class="res-bar res-bar--tight">${sortChips(mem.sort, SHORT_SORTS)}${filterBtn(countActive(optFields(), mem.f), 'optF')}</div>
      ${list.length ? '' : '<p class="muted center">No services match these filters.</p>'}
      <ul class="opts" aria-describedby="optNote">${list.map((o, n) => `<li style="--i:${Math.min(n, 8)}" class="${o.id === mem.selected ? 'open' : ''}"><button type="button" class="opt ${o.id === mem.selected ? 'on' : ''}" data-id="${o.id}" aria-pressed="${o.id === mem.selected}">
        <img src="${vehicleImg(o.vehicle)}" alt="" width="60" height="40" loading="lazy"><span class="opt__m"><span class="opt__h"><b>${esc(o.provider)}</b>${star(o.rating)}${o.kind === 'independent' && o.mode === 'local' ? '<span class="vbadge vbadge--ut" title="UT partner network: drivers verified by UT Log (licence, RC, selfie)">UT partner</span>' : o.verified ? '<span class="vbadge" title="Registered business, checked by UT Log">Verified</span>' : ''}</span><small>${esc(shortEta(o))}</small>${o.tags[0] || o.holiday ? `<span class="opt__tags">${tagBadges(o.tags.slice(0, 1))}${o.holiday ? '<span class="badge badge-amber">Limited</span>' : ''}</span>` : ''}</span>
        <span class="opt__r"><b translate="no">${esc(money(o.total))}</b>${o.save ? `<small class="pos" translate="no" title="Lower than the average of the ${q.options.length} prices shown for this trip">${esc(money(o.save))} below avg</small>` : ''}</span></button>
        ${o.id === mem.selected ? `<div class="opt__x"><dl><div><dt>Service</dt><dd>${esc(o.title)}</dd></div><div><dt>On time</dt><dd>${o.on_time}%</dd></div>${o.max_kg ? `<div><dt>Load</dt><dd>${load(o)}% of ${o.max_kg >= 1000 ? `${o.max_kg / 1000} t` : `${o.max_kg} kg`}</dd></div>` : ''}<div><dt>Carbon</dt><dd>${o.co2} kg CO₂</dd></div><div><dt>Availability</dt><dd>${esc(o.availability)}</dd></div></dl><label class="opt__cmp"><input type="checkbox" data-cmp="${o.id}" ${mem.compare.includes(o.id) ? 'checked' : ''}> Add to compare</label></div>` : ''}</li>`).join('')}</ul>
      <p class="opt-note" id="optNote">"Below avg" compares each price with the ${q.options.length} quotes shown for this trip. On-time and claims figures are sample data in this sandbox. <a class="link" href="/pricing/#how" target="_blank" rel="noopener">How pricing works</a></p>
      ${mem.compare.length >= 2 ? `<button class="btn btn-outline btn-block cmp-go" id="cmpGo" type="button">Compare ${mem.compare.length} services</button>` : ''}
      ${sel ? `<div class="sumbar"><div class="sumbar__l"><small>${esc(sel.provider)}${fee ? ' · with pay on delivery fee' : ''}</small><b translate="no">${esc(money(sel.total + fee))}</b></div><button class="btn btn-primary" id="goBook" type="button">Continue</button></div>` : ''}
      ${q.estimated ? '<p class="muted small center notop">Location estimated for this demo.</p>' : ''}`;
  }
  function shortEta(o) {
    if (o.mode === 'local') return `${o.pickup_within_min} min pickup · ${o.trip_min} min trip`;
    return `Arrives ${date(o.eta)}`;
  }
  const profSel = body.querySelector('#prof');
  if (profSel) profSel.addEventListener('change', () => { const p = profiles.find((x) => x.id === profSel.value); if (!p) return; ['weight', 'length', 'breadth', 'height'].forEach((k) => { form[k].value = p[k] || ''; }); form.weight.dispatchEvent(new Event('input', { bubbles: true })); });
  // Extra stops between pickup and drop.
  const stopsEl = body.querySelector('#stops');
  const readStops = () => [...stopsEl.querySelectorAll('input')].map((i) => i.value.trim());
  function drawStops(list) {
    stopsEl.innerHTML = list.map((v, n) => `<div class="route__row stop-row">${tile('pin', 'plain').value}<input class="input input--lg" value="${esc(v)}" list="areaList" placeholder="Stop ${n + 1}" aria-label="Stop ${n + 1}" autocomplete="off"><button class="icon-btn" type="button" data-rm="${n}" aria-label="Remove stop ${n + 1}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><i class="route__dash" aria-hidden="true"></i>`).join('');
    const add = body.querySelector('#addStop');
    if (add) add.hidden = list.length >= 3;
  }
  drawStops(f.stops || []);
  const addBtn = body.querySelector('#addStop');
  if (addBtn) addBtn.addEventListener('click', () => { drawStops([...readStops(), '']); const all = stopsEl.querySelectorAll('input'); all[all.length - 1].focus(); });
  stopsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; const l = readStops(); l.splice(Number(b.dataset.rm), 1); drawStops(l); clearTimeout(timer); timer = setTimeout(search, 300); });
  body.querySelector('#when').addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    mem.when = b.dataset.w;
    body.querySelectorAll('#when [data-w]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    body.querySelector('#pickWrap').hidden = mem.when !== 'later';
    clearTimeout(timer); timer = setTimeout(search, 300);
  });
  const toIso = (v) => { const t = v ? new Date(v) : null; return t && !Number.isNaN(t.getTime()) ? t.toISOString() : undefined; };
  let seq = 0;
  async function search() {
    const d = formData(form);
    Object.assign(mem.form, d, { insure: !!d.insure, stops: readStops() });
    mem.issue = null;
    if (!ready(d)) { mem.quote = null; mem.selected = null; paint(); return false; }
    const my = ++seq;
    results.innerHTML = '<div class="skeleton" style="height:64px;margin-bottom:8px"></div><div class="skeleton" style="height:64px;margin-bottom:8px"></div><div class="skeleton" style="height:64px"></div>';
    try {
      const q = await api('/hub/transport/quote', { method: 'POST', body: { section, segment: business ? 'b2b' : 'b2c', from_place: d.from, to_place: d.to, country: d.country, weight: d.weight, pieces: d.pieces, length: d.length, breadth: d.breadth, height: d.height, value: d.value, category: d.category, insure: !!d.insure, helpers: d.helpers, from_pt: mem.form.from_pt, to_pt: mem.form.to_pt, stops: mem.form.stops.filter(Boolean), pickup_at: mem.when === 'later' ? toIso(d.pickup_at) : undefined, deliver_by: toIso(d.deliver_by) } });
      if (my !== seq) return false;
      mem.quote = q; mem.selected = q.options[0] ? q.options[0].id : null; mem.f = null; mem.compare = []; paint();
      if (matchMedia('(max-width: 1180px)').matches && wantScroll) smoothTo(results.parentElement);
      wantScroll = false;
      return true;
    } catch (e) {
      if (my !== seq) return false;
      mem.quote = null; mem.issue = { title: e.data && e.data.title, message: e.message, suggest: e.data && e.data.suggest, query: e.data && e.data.suggest_query }; paint();
      return false;
    }
  }
  let timer; let wantScroll = false;
  const setPlace = (k, p) => {
    const value = cfg.by === 'location' && p.area ? `${p.area}, ${p.city}` : p.pincode;
    if (!value) { toast('That pin has no pin code we can deliver to. Move it a little.', true); return; }
    mem.form[`${k}_place`] = p;
    mem.form[`${k}_pt`] = { lat: p.lat, lng: p.lng };
    mem.form[`${k}_addr`] = p.address;
    mem.form[k] = value;
    const btn = body.querySelector(`[data-place="${k}"]`);
    btn.outerHTML = placeButton(k, k === 'from' ? cfg.from : cfg.to, cfg, value, p).replace(/^<input[^>]*>/, '');
    form[k].value = value;
    form[k].dispatchEvent(new Event('input', { bubbles: true }));
  };
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-place]'); if (!b) return;
    const k = b.dataset.place; const other = mem.form[k === 'from' ? 'to_place' : 'from_place'];
    const cur = mem.form[`${k}_place`];
    const p = await openPlacePicker({ kind: k === 'from' ? 'pickup' : 'drop', start: null, other });
    if (p) setPlace(k, p); else if (cur) b.focus();
  });
  // Business accounts: the business address is the starting pickup.
  const ba = business && (store.state.profile || {}).business_address;
  if (ba && ba.line && !intl && !mem.form.from && /^\d{6}$/.test(ba.pincode || '')) {
    (async () => {
      try {
        const mm = await api('/public/booking/meta');
        // Prefer the locality named in the address ("Koramangala"), then the pin code area.
        const named = mm.areas.find((x) => ba.line.toLowerCase().includes(x.split(', ')[0].toLowerCase()));
        const pt = (named && mm.area_points[named]) || mm.pin_points[ba.pincode.slice(0, 3)] || mm.pin_points[ba.pincode.slice(0, 2)];
        if (!pt || mem.form.from) return;
        const near = await api('/hub/geo/reverse', { method: 'POST', body: { lat: pt[0], lng: pt[1] } });
        const place = { label: 'Business address', area: near.area || '', city: ba.city || near.city || '', pincode: ba.pincode, lat: pt[0], lng: pt[1], house: ba.line, street: '', floor: '', lift: null, landmark: '', contact: null };
        place.address = `${ba.line}, ${ba.city} ${ba.pincode}`.replace(/\s+/g, ' ').trim();
        if (body.isConnected && !mem.form.from) setPlace('from', place);
      } catch (x) { /* the user can still pick */ }
    })();
  }
  form.addEventListener('input', (e) => { if (e.isTrusted && (e.target.name === 'from' || e.target.name === 'to')) { delete mem.form[`${e.target.name}_pt`]; delete mem.form[`${e.target.name}_addr`]; } valFx(); if (e.target.name === 'reference') { mem.form.reference = e.target.value; return; } if (e.target.name === 'pay_mode') return; clearTimeout(timer); timer = setTimeout(search, 650); });
  form.addEventListener('change', (e) => { if (e.target.name === 'pay_mode') { mem.form.pay_mode = e.target.value; paint(); } });
  form.addEventListener('submit', (e) => {
    e.preventDefault(); clearTimeout(timer);
    const d = formData(form);
    if (!ready(d)) { mem.quote = null; mem.issue = { title: 'A few details are missing', message: intl ? 'Enter a 6-digit pickup pincode, the country and the weight.' : cfg.by === 'pincode' ? 'Enter both 6-digit pincodes and the weight.' : 'Enter the pickup, drop and weight.' }; paint(); smoothTo(results.parentElement); return; }
    wantScroll = true;
    search();
  });
  mem.onPlaced = () => { paint(); if (matchMedia('(max-width: 1180px)').matches) smoothTo(results.parentElement); };
  body.querySelector('.more').addEventListener('toggle', (e) => { mem.form.more = e.target.open; });
  results.addEventListener('click', (e) => {
    if (e.target.closest('[data-sample]')) { const sm = SAMPLES[section]; Object.entries(sm).forEach(([k, v]) => { if (form[k]) form[k].value = v; }); mem.sample = true; clearTimeout(timer); search(); return undefined; }
    if (e.target.closest('[data-live]')) { openTracking(mem.placed.id); return undefined; }
    if (e.target.closest('[data-another]')) { clearTimeout(placedTimer); mem.placed = null; mem.quote = null; mem.sample = false; form.reset(); ['from', 'to', 'weight', 'country'].forEach((k) => { if (form[k]) form[k].value = ''; }); mem.form = {}; paint(); return undefined; }
    const flt = e.target.closest('#optF');
    if (flt) { openFilters(flt, optFields(), mem.f, (v) => { mem.f = v; paint(); }); return undefined; }
    const s = e.target.closest('[data-sort]');
    if (s) { mem.sort = s.dataset.sort; return paint(); }
    const o = e.target.closest('[data-id]');
    if (o) { mem.selected = o.dataset.id; return paint(); }
    if (e.target.closest('#cmpGo')) return compare(mem, (id) => { mem.selected = id; paint(); });
    if (e.target.closest('#goBook')) confirmBooking(section, mem, form);
  });
  results.addEventListener('change', (e) => {
    if (e.target.dataset.cmp) {
      const id = e.target.dataset.cmp;
      if (e.target.checked && mem.compare.length >= 3) { e.target.checked = false; toast('Compare up to 3 services at a time.', true); return; }
      mem.compare = e.target.checked ? [...mem.compare, id] : mem.compare.filter((x) => x !== id);
      const keep = results.querySelector('.opts').scrollTop;
      paint();
      results.querySelector('.opts').scrollTop = keep;
    }
  });
  paint();
  if (!mem.placed && !mem.quote && ready(mem.form)) search();
  return () => { clearTimeout(timer); clearTimeout(placedTimer); };
}

function confirmBooking(section, mem, form) {
  const q = mem.quote; const o = q.options.find((x) => x.id === mem.selected);
  const p = store.state.profile || {};
  const business = store.state.accountType === 'business';
  const pay = form.pay_mode.value;
  const fee = pay === 'cod' ? Math.max(25, Math.round(o.total * 0.015)) : 0;
  const ba = business && p.business_address && p.business_address.line ? p.business_address : null;
  const bizAddr = ba ? `${ba.line}, ${ba.city} ${ba.pincode}`.replace(/\s+/g, ' ').trim() : '';
  const saved = [...(ba ? [{ label: 'Business address', line: ba.line, city: ba.city, pincode: ba.pincode }] : []), ...(p.addresses || [])];
  const addrOpt = (a, cur) => { const v = `${a.line}, ${a.city} ${a.pincode}`.replace(/\s+/g, ' ').trim(); return `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(a.label)} · ${esc(a.line)}</option>`; };
  // A pinned place shows as a card (address, floor, lift, contact); otherwise the old typed field.
  const pinned = (name, label, pl) => `<div class="field full"><span>${label}</span><div class="addr-card"><span class="addr-card__ico">${icon('pin', 18)}</span><div class="grow"><b>${esc(pl.address)}</b>${placeChips(pl).length ? `<span class="addr-chips">${placeChips(pl).map((c) => `<em>${esc(c)}</em>`).join('')}</span>` : ''}</div><span class="place-ok" title="Pinned on the map">${icon('check', 16)}</span></div><textarea name="${name}" hidden>${esc(pl.address)}</textarea></div>`;
  const addr = (name, label, prefill = '') => (name === 'pickup_address' && mem.form.from_place && mem.form.from_place.house ? pinned(name, label, mem.form.from_place) : name === 'drop_address' && mem.form.to_place && mem.form.to_place.house ? pinned(name, label, mem.form.to_place) : `<label class="field full">${label}${saved.length ? `<select class="select" data-fill="${name}"><option value="">Choose a saved address</option>${saved.map((a) => addrOpt(a, prefill)).join('')}</select>` : ''}<textarea class="input" name="${name}" rows="2" placeholder="House or building, street, landmark">${esc(prefill)}</textarea></label>`);
  modal({
    title: 'Confirm your booking', wide: true,
    body: `<div class="confirm"><img src="${vehicleImg(o.vehicle)}" alt="" width="84" height="56"><div><b>${esc(o.provider)}</b><small>${esc(o.title)} · ${esc(q.route.from)} → ${esc(q.route.to)}</small></div><b class="confirm__p" translate="no">${esc(money(o.total + fee))}</b></div>
      <form class="form-grid" id="cf" novalidate>
        <label class="field">Your name <span class="req" aria-hidden="true"></span><input class="input" name="name" required aria-required="true" autocomplete="name" value="${esc(p.name || (mem.sample ? 'Asha Rao' : ''))}"></label>
        <label class="field">Your mobile number <span class="req" aria-hidden="true"></span><input class="input" name="phone" required aria-required="true" autocomplete="tel-national" inputmode="numeric" maxlength="10" value="${esc((/^[6-9]\d{9}$/.test(p.mobile || '') && p.mobile) || (mem.sample ? '9876500001' : ''))}"></label>
        ${addr('pickup_address', 'Pickup address', mem.form.from_addr || bizAddr || (mem.sample ? '12, 5th Main, Sector 3' : ''))}${addr('drop_address', 'Drop address', mem.form.to_addr || (mem.sample ? '44, Lake View Road, Block B' : ''))}
        <div class="field full"><span>Add-ons</span><div class="extras">${EXTRAS.map(([k, l, c]) => `<label class="extra"><input type="checkbox" data-extra="${k}" data-cost="${c}"><span><b>${l}</b><small translate="no">+${esc(money(c))}</small></span></label>`).join('')}</div></div>
        ${business ? `<label class="field">Receiver name<input class="input" name="r_name" value="${esc((mem.form.to_place && mem.form.to_place.contact && mem.form.to_place.contact.name) || '')}"></label><label class="field">Receiver mobile<input class="input" name="r_phone" inputmode="numeric" maxlength="10" value="${esc((mem.form.to_place && mem.form.to_place.contact && mem.form.to_place.contact.phone) || '')}"></label><label class="row full"><input type="checkbox" class="check" name="r_consent"> The receiver agreed to get delivery updates on WhatsApp</label>` : ''}
        ${business ? `<label class="field">Company<input class="input" name="company" value="${esc(p.company || '')}"></label><label class="field">GSTIN (optional)<input class="input" name="gstin" maxlength="15" value="${esc(p.gstin || '')}"></label>` : ''}
      ${pay === 'cod' ? '' : `${payMethods({ only: BOOKING_PAY })}<p class="pay-hint full">Have a gift card? <button class="link" type="button" data-gc>Add it to your wallet</button> and pay with Wallet.</p>`}</form>
      <div id="deals"></div><dl class="break" id="brk"></dl>
      <p class="muted small notop">${esc(o.provider)} carries out this job. UT Log connects you and keeps the record. Demo booking: no real pickup is arranged.</p>
      <p class="form-error" id="cfErr"></p>`,
    footer: `<button class="btn btn-outline" data-close>Back</button><button class="btn btn-primary" id="cfGo">${pay === 'cod' ? 'Confirm booking' : 'Pay and book'}</button>`,
    onMount(el, close) {
      const f = el.querySelector('#cf');
      el.addEventListener('change', (e) => { if (e.target.dataset.fill) f[e.target.dataset.fill].value = e.target.value; });
      const row = (l, v) => `<div><dt>${esc(l)}</dt><dd translate="no">${esc(v)}</dd></div>`;
      let lastDeal = { discount: 0, points: 0 };
      const extraSum = () => [...el.querySelectorAll('[data-extra]:checked')].reduce((t, c) => t + Number(c.dataset.cost), 0);
      el.addEventListener('change', (e) => { if (e.target.dataset.extra) draw(lastDeal); });
      const draw = (st) => { lastDeal = st; const ex = extraSum(); const pay_ = o.total + fee + ex - st.discount - st.points; el.querySelector('#brk').innerHTML = row('Service charge', money(o.price)) + (o.insurance ? row('Insurance', money(o.insurance)) : '') + (ex ? row('Add-ons', money(ex)) : '') + (fee ? row('Pay on delivery fee', money(fee)) : '') + (st.discount ? row(`Coupon ${st.coupon}`, '−' + money(st.discount)) : '') + (st.points ? row('Reward points', '−' + money(st.points)) : '') + `<div class="break__t"><dt>${pay === 'cod' ? 'Pay on delivery' : 'Total to pay'}</dt><dd translate="no">${esc(money(pay_))}</dd></div>`; el.querySelector('.confirm__p').textContent = money(pay_); };
      draw({ discount: 0, points: 0 });
      const deals = mountDeals(el.querySelector('#deals'), { section, amount: o.total + fee, onChange: draw });
      const go = el.querySelector('#cfGo');
      go.addEventListener('click', () => withBusy(go, async () => {
        const d = formData(f);
        // Name and mobile are required before anything is charged.
        const cfErr = el.querySelector('#cfErr');
        if (String(d.name || '').trim().length < 2) { cfErr.textContent = 'Enter your name.'; f.querySelector('[name=name]').focus(); return; }
        if (!/^[6-9]\d{9}$/.test(String(d.phone || '').trim())) { cfErr.textContent = 'Enter your 10-digit mobile number.'; f.querySelector('[name=phone]').focus(); return; }
        cfErr.textContent = '';
        try {
          const book = (x) => api('/hub/transport/book', { method: 'POST', body: { ...x, quote_id: q.quote_id, option_id: o.id, pay_mode: pay, contact: { name: d.name, phone: d.phone }, pickup_address: d.pickup_address, drop_address: d.drop_address, pickup_place: mem.form.from_place || null, drop_place: mem.form.to_place || null, company: d.company, gstin: d.gstin, reference: form.reference.value, coupon: deals.coupon, use_points: deals.use_points, extras: [...el.querySelectorAll('[data-extra]:checked')].map((c) => c.dataset.extra), receiver: d.r_phone ? { name: d.r_name, phone: d.r_phone, consent: !!d.r_consent } : undefined } });
          let extra = {};
          if (pay !== 'cod') { const check = await book({ dry_run: true }); extra = await checkout(el, check.amount); if (!extra) return; }
          const r = await withFunds(() => book(extra));
          close(r);
          mem.placed = { id: r.id, amount: r.amount, pay_mode: r.pay_mode, pay_via: r.pay_via, provider: o.provider, from: q.route.from, to: q.route.to };
          mem.quote = null; mem.selected = null;
          refresh();
          if (mem.onPlaced) mem.onPlaced();
        } catch (e) { if (!e.quiet) el.querySelector('#cfErr').textContent = e.message; }
      }));
    },
  });
}

function compare(mem, pick) {
  const list = mem.quote.options.filter((o) => mem.compare.includes(o.id));
  const minP = Math.min(...list.map((o) => o.total)); const minE = Math.min(...list.map((o) => Date.parse(o.eta))); const maxR = Math.max(...list.map((o) => o.rating)); const maxT = Math.max(...list.map((o) => o.on_time));
  const cell = (on, t) => `<td class="${on ? 'best' : ''}">${esc(t)}</td>`;
  modal({
    title: 'Compare services', wide: true,
    body: `<div class="table-wrap"><table class="cmp"><thead><tr><th></th>${list.map((o) => `<th>${esc(o.provider)}<small class="block muted">${esc(o.title)}</small></th>`).join('')}</tr></thead><tbody>
      <tr><th scope="row">Price</th>${list.map((o) => cell(o.total === minP, money(o.total))).join('')}</tr>
      <tr><th scope="row">Arrives</th>${list.map((o) => cell(Date.parse(o.eta) === minE, dateTime(o.eta))).join('')}</tr>
      <tr><th scope="row">Rating</th>${list.map((o) => cell(o.rating === maxR, o.rating.toFixed(1))).join('')}</tr>
      <tr><th scope="row">On-time record</th>${list.map((o) => cell(o.on_time === maxT, o.on_time + '%')).join('')}</tr>
      <tr><th scope="row">Claims</th>${list.map((o) => cell(false, o.claims_pct + '%')).join('')}</tr>
      <tr><th scope="row">Capacity</th>${list.map((o) => cell(false, o.capacity)).join('')}</tr>
      <tr><th scope="row">Pickup</th>${list.map((o) => cell(false, o.availability)).join('')}</tr>
      <tr><th scope="row"></th>${list.map((o) => `<td><button class="btn btn-primary btn-sm" type="button" data-pick="${o.id}">Choose</button></td>`).join('')}</tr></tbody></table></div><p class="muted small notop">Highlighted cells are the best in each row. Service records are simulated demo data.</p>`,
    onMount(el, close) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { close(); pick(b.dataset.pick); } }); },
  });
}

const SAMPLE = 'from,to,weight,name,phone,address\n560034,400053,2,Asha Rao,9876500001,12 Hill Road Bandra Mumbai\n560034,110017,5,Vikram Das,9876500002,44 Saket Main Road New Delhi\n560034,500081,1.5,Meera Iyer,9876500003,8 Cyber Towers Hitec City';
function bulkForm(body) {
  body.innerHTML = `<div class="dash dash--even"><section class="card"><h2>Paste or upload a CSV</h2><p class="muted notop">Columns: from, to, weight, name, phone, address. Up to 200 rows.</p><textarea class="input mono" id="csvT" rows="8"></textarea><div class="row mt"><label class="btn btn-outline">Upload CSV<input type="file" id="csvF" accept=".csv,text/csv" hidden></label><button class="btn btn-outline" id="sample" type="button">Use sample</button></div>
    <div class="form-grid mt"><label class="field">Choose by<select class="select" id="strat"><option value="cheapest">Cheapest</option><option value="fastest">Fastest</option></select></label><label class="field">Pickup address<input class="input" id="pick"></label></div><p class="form-error" id="e"></p><div class="row mt"><button class="btn btn-outline" id="prev" type="button">Preview</button><button class="btn btn-primary" id="go" type="button">Book all</button></div></section>
    <section class="card"><h2>Results</h2><div id="out"><p class="muted notop">Preview shows the courier and price for each row.</p></div></section></div>`;
  const t = body.querySelector('#csvT'); const err = body.querySelector('#e'); const out = body.querySelector('#out');
  const rows = () => { const lines = t.value.trim().split(/\r?\n/).filter(Boolean); if (lines.length < 2) throw new Error('Add a header line and at least one row.'); const keys = lines[0].split(',').map((k) => k.trim().toLowerCase()); return lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(keys.map((k, i) => [k, (c[i] || '').trim()])); }); };
  const run = async (btn, dry) => { err.textContent = ''; await withBusy(btn, async () => { try { const r = await withFunds(() => api('/hub/transport/bulk', { method: 'POST', body: { rows: rows(), strategy: body.querySelector('#strat').value, pickup_address: body.querySelector('#pick').value, dry } })); out.innerHTML = `<p class="notop"><b>${r.booked} of ${r.results.length} rows ${dry ? 'can be booked' : 'booked'}</b> · <span translate="no">${esc(money(r.total))}</span></p><div class="table-wrap"><table><thead><tr><th>Row</th><th>Courier</th><th>Price or issue</th></tr></thead><tbody>${r.results.map((x) => `<tr><td>${x.n}</td><td>${x.ok ? esc(x.provider) : '—'}</td><td>${x.ok ? esc(money(x.total)) : `<span class="neg">${esc(x.error)}</span>`}</td></tr>`).join('')}</tbody></table></div>`; if (!dry) { refresh(); toast(`${r.booked} shipments booked`); } } catch (x) { if (!x.quiet) err.textContent = x.message; } }); };
  body.querySelector('#sample').addEventListener('click', () => { t.value = SAMPLE; });
  body.querySelector('#csvF').addEventListener('change', async (e) => { if (e.target.files[0]) t.value = await e.target.files[0].text(); });
  body.querySelector('#prev').addEventListener('click', (e) => run(e.currentTarget, true));
  body.querySelector('#go').addEventListener('click', (e) => run(e.currentTarget, false));
}

export function rebook(r) { memory[r.section] = { form: { ...r.form }, sort: 'best', type: 'all', quote: null, selected: null, compare: [], when: 'now' }; location.hash = `#/${r.section}/book`; }

