// Flights, buses, hotels, accommodation and local rides: search, compare, book from the wallet.
import { api, esc, money, store, toast, modal, withBusy, dateTime, formData } from '../core.js';
import { tile } from './art.js';
import { deskTabs } from './desk.js';
import { payMethods, checkout, BOOKING_PAY } from './checkout.js';
import { sortChips, tagBadges, star, payChoice, statusPill, emptyScene, withFunds, refresh, mountDeals, filterBtn, openFilters, countActive } from './ui.js';

const iso = (offset) => { const d = new Date(Date.now() + offset * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const KINDS = {
  flights: { api: 'flight', title: 'Flights', icon: 'plane', tone: 'blue', intro: 'Domestic and international flights from every airline.', fast: 'Fastest', section: 'travel', match: /^Flight/, cal: true },
  trains: { api: 'train', title: 'Trains', icon: 'train', tone: 'green', intro: 'Express and premium trains across India.', fast: 'Fastest', section: 'travel', match: /^Train/, cal: true },
  buses: { api: 'bus', title: 'Buses', icon: 'bus', tone: 'coral', intro: 'Intercity buses from private and state operators.', fast: 'Fastest', section: 'travel', match: /^Bus/, cal: true },
  hotels: { api: 'hotel', title: 'Hotels', icon: 'hotel', tone: 'violet', intro: 'Hotels at every budget, in India and abroad.', fast: 'Closest to centre', section: 'travel', kind: 'hotel' },
  stays: { api: 'stay', title: 'Accommodation', icon: 'bed', tone: 'rose', intro: 'Apartments, homestays, hostels, PG and co-living.', fast: 'Closest to centre', section: 'travel', kind: 'stay' },
  movers: { api: 'movers', title: 'Packers & Movers', icon: 'truck', tone: 'blue', intro: 'Home and office moves, packed, moved and unpacked.', fast: 'Fastest', section: 'logistics', kind: 'movers', group: 'services' },
  warehouse: { api: 'service', service: 'warehouse', title: 'Warehousing', icon: 'building', tone: 'violet', intro: 'Secure storage with inventory tracking.', fast: 'Closest', section: 'logistics', kind: 'warehouse', group: 'services', qty: 'Pallets' },
  coldchain: { api: 'service', service: 'coldchain', title: 'Cold Chain', icon: 'drop', tone: 'blue', intro: 'Temperature-controlled transport for food and pharma.', fast: 'Fastest', section: 'logistics', kind: 'coldchain', group: 'services', qty: 'Pallets' },
  customs: { api: 'service', service: 'customs', title: 'Customs', icon: 'doc', tone: 'amber', intro: 'Licensed brokers for import and export clearance.', fast: 'Fastest', section: 'logistics', kind: 'customs', group: 'services', qty: 'Shipments' },
  rental: { api: 'service', service: 'rental', title: 'Vehicle Rental', icon: 'truck', tone: 'green', intro: 'Trucks and vans with a driver, by the day.', fast: 'Closest', section: 'logistics', kind: 'rental', group: 'services', qty: 'Days' },
  packaging: { api: 'service', service: 'packaging', title: 'Packaging', icon: 'box2', tone: 'coral', intro: 'Cartons, tape and bubble wrap, delivered.', fast: 'Fastest', section: 'logistics', kind: 'packaging', group: 'services', qty: 'Boxes' },
  rides: { api: 'ride', title: 'Local Rides', icon: 'ride', tone: 'amber', intro: 'Bike, auto and cab rides from Rapido, Uber, Ola and Namma Yatri.', fast: 'Fastest', section: 'rides' },
};
// Each ride shows its own vehicle: bike, auto, cab or XL.
const RIDE_ICON = { bike: ['bike', 'green'], auto: ['auto', 'amber'], cab: ['ride', 'blue'], xl: ['ride', 'violet'] };
const rideIcon = (x, k) => { if (k.api !== 'ride') return tile(k.icon, k.tone).value; const t = x.ride_type || (/bike|moto/i.test(x.title || '') ? 'bike' : /auto/i.test(x.title || '') ? 'auto' : /xl|suv/i.test(x.title || '') ? 'xl' : 'cab'); const [i, tone] = RIDE_ICON[t] || RIDE_ICON.cab; return tile(i, tone).value; };
const memory = {};
window.addEventListener('ut:desk-settings', (e) => { Object.keys(KINDS).forEach((x) => { if ((KINDS[x].group ? 'services' : 'travel') === e.detail) delete memory[x]; }); });
const TRIP = ['flight', 'bus', 'train'];
let catalog = null;
let areas = null;

const sel = (name, label, options, value) => `<label class="field">${esc(label)}<select class="select" name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const inp = (name, label, type, value, extra = '') => `<label class="field">${esc(label)}<input class="input" type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
const count = (name, label, max, value) => sel(name, label, Array.from({ length: max }, (_, i) => [String(i + 1), String(i + 1)]), String(value));

function fields(key, f) {
  const today = iso(0);
  if (key === 'flights') {
    const ap = catalog.airports.map((a) => [a.code, `${a.city} (${a.code})`]);
    return sel('from', 'From', ap, f.from || 'BLR') + sel('to', 'To', ap, f.to || 'DEL') + inp('date', 'Departure', 'date', f.date || iso(7), `min="${today}"`) + count('pax', 'Travellers', 9, f.pax || 1) + sel('cabin', 'Cabin', [['economy', 'Economy'], ['business', 'Business']], f.cabin || 'economy');
  }
  if (key === 'trains') {
    const c = catalog.bus_cities.map((x) => [x, x]);
    return sel('from', 'From', c, f.from || 'Bengaluru') + sel('to', 'To', c, f.to || 'Hyderabad') + inp('date', 'Travel date', 'date', f.date || iso(5), `min="${today}"`) + count('pax', 'Passengers', 6, f.pax || 1);
  }
  if (key === 'buses') {
    const c = catalog.bus_cities.map((x) => [x, x]);
    return sel('from', 'From', c, f.from || 'Bengaluru') + sel('to', 'To', c, f.to || 'Chennai') + inp('date', 'Travel date', 'date', f.date || iso(3), `min="${today}"`) + count('seats', 'Seats', 6, f.seats || 1);
  }
  if (KINDS[key].service) return sel('city', 'City', catalog.bus_cities.map((x) => [x, x]), f.city || 'Bengaluru') + inp('date', 'Start date', 'date', f.date || iso(3), `min="${today}"`) + inp('qty', KINDS[key].qty, 'text', f.qty || '10', 'inputmode="numeric"');
  if (key === 'movers') {
    const c = catalog.bus_cities.map((x) => [x, x]);
    return sel('from', 'Moving from', c, f.from || 'Bengaluru') + sel('to', 'Moving to', c, f.to || 'Bengaluru') + inp('date', 'Moving date', 'date', f.date || iso(7), `min="${today}"`) + sel('size', 'Home size', [['1rk', '1 RK'], ['1bhk', '1 BHK'], ['2bhk', '2 BHK'], ['3bhk', '3 BHK'], ['office', 'Small office']], f.size || '2bhk');
  }
  if (key === 'rides') {
    return inp('from', 'Pickup', 'text', f.from || '', 'list="rideAreas" placeholder="Area or pin code" autocomplete="off"') + inp('to', 'Drop', 'text', f.to || '', 'list="rideAreas" placeholder="Area or pin code" autocomplete="off"') + sel('type', 'Ride type', [['all', 'All'], ['bike', 'Bike'], ['auto', 'Auto'], ['cab', 'Cab'], ['xl', 'XL']], f.type || 'all') + `<datalist id="rideAreas">${areas.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>`;
  }
  const cities = catalog.stay_cities.map((x) => [x, x]);
  return sel('city', 'City', cities, f.city || 'Goa') + inp('checkin', 'Check-in', 'date', f.checkin || iso(7), `min="${today}"`) + inp('checkout', 'Check-out', 'date', f.checkout || iso(9), `min="${today}"`) + count('rooms', 'Rooms', 8, f.rooms || 1) + (key === 'stays' ? sel('type', 'Type', catalog.stay_types.map((t) => [t, t]), f.type || 'All') : '');
}

export async function render(view, { kind: key, query }) {
  const k = KINDS[key];
  if (!k) { location.hash = '#/home'; return; }
  if (!catalog) [catalog, areas] = await Promise.all([api('/hub/catalog'), api('/public/booking/meta').then((m) => m.areas)]);
  if (!memory[key]) { const st = await api('/hub/desk/settings', { query: { desk: k.group ? 'services' : 'travel' } }).catch(() => ({})); memory[key] = { form: {}, sort: st.sort || 'best', options: null }; }
  const mem = memory[key];
  // Smart search can pass the route in the address.
  let auto = false;
  if (query) ['from', 'to', 'city'].forEach((n) => {
    let v = query.get(n);
    if (!v) return;
    if (key === 'flights') { const a = catalog.airports.find((x) => x.city.toLowerCase() === v.toLowerCase() || x.code === v.toUpperCase()); if (!a) return; v = a.code; }
    mem.form[n] = v; mem.options = null; auto = true;
  });
  const tabs = `${deskTabs(k.group ? 'services' : 'travel', 'book')}<nav class="tabs tabs--sub">${Object.entries(KINDS).filter(([, v]) => !!v.group === !!k.group).map(([x, v]) => `<a href="${x === 'rides' ? '#/rides' : `#/${v.group ? 'services' : 'travel'}/${x}`}" class="${x === key ? 'active' : ''}">${esc(v.title)}</a>`).join('')}</nav>`;
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile(k.icon, k.tone).value}<div><h1>${esc(k.title)}</h1><p>${esc(k.intro)}</p></div></div></div>${tabs}
    <form class="card search-bar" id="sf" novalidate>${fields(key, mem.form)}<button class="btn btn-primary" type="submit">Search</button></form>
    <p class="form-error" id="err"></p>
    <section id="locks"></section>
    <div id="cal"></div>
    <section id="results"></section>
    ${k.cal ? '<section id="alerts"></section>' : ''}
    <section class="card" id="history"></section>`;
  const form = view.querySelector('#sf'); const out = view.querySelector('#results'); const err = view.querySelector('#err');
  const sorts = [['best', 'Recommended'], ['fast', k.fast], ['low', 'Price: low to high'], ['rating', 'Top rated']];

  function paint() {
    if (!mem.options) { out.innerHTML = ''; return; }
    if (!mem.options.length) { out.innerHTML = `<div class="card">${emptyScene('No options found. Try different details.', null, 'carton')}</div>`; return; }
    mem.f = mem.f || { provider: '', max: '', rating: '' };
    const offFields = [{ key: 'provider', label: 'Provider', options: [['', 'All providers'], ...[...new Set(mem.options.map((o) => o.provider))].map((p) => [p, p])] }, { key: 'max', label: 'Maximum price (₹)', placeholder: 'Any' }, { key: 'rating', label: 'Minimum rating', options: [['', 'Any'], ['4', '4 and above'], ['4.3', '4.3 and above'], ['4.5', '4.5 and above']] }];
    paint.fields = offFields;
    let list = mem.options.filter((o) => (!mem.f.provider || o.provider === mem.f.provider) && (!mem.f.max || o.price <= Number(mem.f.max)) && (!mem.f.rating || o.rating >= Number(mem.f.rating)));
    if (mem.sort === 'fast') list.sort((a, b) => a.mins - b.mins || a.price - b.price);
    if (mem.sort === 'low') list.sort((a, b) => a.price - b.price);
    if (mem.sort === 'rating') list.sort((a, b) => b.rating - a.rating || a.price - b.price);
    out.innerHTML = `<div class="results-head"><div class="row"><b>${list.length} options</b>${k.cal ? '<button class="link" id="setAlert" type="button">Set a price alert</button>' : ''}</div><div class="res-bar">${sortChips(mem.sort, sorts)}${filterBtn(countActive(offFields, mem.f), 'offF')}</div></div>
      <ul class="offers">${list.map((o, n) => `<li class="offer" style="--i:${Math.min(n, 8)}">${rideIcon(o, k)}<div class="offer__m"><div class="row"><b>${esc(o.provider)}</b>${star(o.rating)}${tagBadges(o.tags)}</div><span>${esc(o.title)} · ${esc(o.sub)}</span><small>${o.meta.map(esc).join(' · ')}</small></div><div class="offer__r"><b translate="no">${esc(money(o.price))}</b><div class="row row--nw">${k.cal ? `<button class="btn btn-outline btn-sm" type="button" data-lock="${o.id}">Lock price</button>` : ''}<button class="btn btn-primary btn-sm" type="button" data-book="${o.id}">Book</button></div></div></li>`).join('')}</ul>`;
  }
  async function search() {
    err.textContent = '';
    const d = formData(form);
    Object.assign(mem.form, d);
    out.innerHTML = '<div class="skeleton" style="height:90px;margin-bottom:10px"></div><div class="skeleton" style="height:90px"></div>';
    try { const r = await api('/hub/search', { method: 'POST', body: { kind: k.api, service: k.service, ...d } }); mem.options = r.options; mem.f = null; paint(); calendar(d); }
    catch (e) { mem.options = null; out.innerHTML = ''; err.textContent = e.message; view.querySelector('#cal').innerHTML = ''; }
  }
  // Cheapest fare per day for the next two weeks.
  async function calendar(d) {
    if (!k.cal) return;
    const el = view.querySelector('#cal');
    try {
      const c = await api('/hub/calendar', { method: 'POST', body: { kind: k.api, from: d.from, to: d.to } });
      el.innerHTML = `<div class="fare-cal" role="group" aria-label="Cheapest fares by date">${c.days.map((x) => { const dt = new Date(x.date + 'T00:00:00'); return `<button type="button" data-date="${x.date}" class="${x.low ? 'low' : ''}" aria-pressed="${x.date === d.date}"><small>${dt.toLocaleDateString(undefined, { weekday: 'short' })}</small><b>${dt.getDate()}</b><span translate="no">${esc(money(x.price))}</span></button>`; }).join('')}</div>`;
    } catch (e) { el.innerHTML = ''; }
  }
  async function locks() {
    if (!k.cal) return;
    const el = view.querySelector('#locks');
    const r = await api('/hub/lock');
    const rows = r.data.filter((l) => l.offer.kind === k.api);
    el.innerHTML = rows.length ? `<div class="card lockbox"><div class="card__head"><h2>Locked fares</h2></div><ul class="feed">${rows.map((l) => `<li><div class="feed__t"><b>${esc(l.offer.provider)} · ${esc(l.offer.title)}</b><small>Held until ${esc(dateTime(l.expires))} · fee ${esc(money(l.fee))} comes off the price</small></div><b translate="no">${esc(money(l.offer.price))}</b><button class="btn btn-primary btn-sm" data-lbook="${esc(l.id)}" type="button">Book</button></li>`).join('')}</ul></div>` : '';
    el.onclick = (e) => { const b = e.target.closest('[data-lbook]'); if (b) { const l = rows.find((x) => x.id === b.dataset.lbook); book(l.offer, k, () => { locks(); history(); }, l); } };
  }
  async function alerts() {
    if (!k.cal) return;
    const el = view.querySelector('#alerts');
    const r = await api('/hub/alerts');
    const rows = r.data.filter((a) => a.kind === k.api);
    el.innerHTML = rows.length ? `<div class="card"><div class="card__head"><h2>Price alerts</h2></div><ul class="feed">${rows.map((a) => `<li><div class="feed__t"><b>${esc(a.from)} → ${esc(a.to)}</b><small>Target ${esc(money(a.target))} · lowest now ${a.current != null ? esc(money(a.current)) : 'not available'}</small></div>${a.triggered ? '<span class="badge badge-green">Price dropped</span>' : '<span class="badge">Watching</span>'}<button class="btn btn-danger btn-sm" data-rm-alert="${a.id}" type="button">Remove</button></li>`).join('')}</ul></div>` : '';
  }
  async function history() {
    const el = view.querySelector('#history');
    const r = await api('/hub/orders', { query: { section: k.section, per_page: 50 } });
    const rows = r.data.filter((x) => (k.match ? k.match.test(x.title) : k.kind ? x.kind === k.kind : true)).slice(0, 5);
    el.innerHTML = `<div class="card__head"><h2>Your recent bookings</h2><a class="link" href="#/${k.group ? 'services' : 'travel'}/orders">View all</a></div>${rows.length ? `<ul class="feed">${rows.map((x) => `<li>${rideIcon(x, k)}<div class="feed__t"><b>${esc(x.title)}</b><small>${esc(x.provider)} · ${esc(x.sub || '')}</small></div><div class="feed__r"><b translate="no">${esc(money(x.amount))}</b><small>${esc(dateTime(x.at))}</small></div>${statusPill(x)}</li>`).join('')}</ul>` : '<p class="muted notop">Nothing booked here yet.</p>'}`;
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); search(); });
  out.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { mem.sort = s.dataset.sort; return paint(); }
    const flt = e.target.closest('#offF');
    if (flt) return openFilters(flt, paint.fields, mem.f, (v) => { mem.f = v; paint(); });
    if (e.target.closest('#setAlert')) {
      const d = formData(form);
      const lowest = Math.min(...mem.options.map((o) => o.price));
      return modal({
        title: 'Set a price alert',
        body: `<p class="notop">We will tell you on the dashboard when ${esc(d.from)} → ${esc(d.to)} is at or below your target in the next 14 days.</p><label class="field">Target price (₹)<input class="input" id="tg" inputmode="numeric" value="${Math.round(lowest * 0.9)}"></label><p class="form-error" id="tgErr"></p>`,
        footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="tgGo">Create alert</button>',
        onMount(el, close) { el.querySelector('#tgGo').addEventListener('click', async () => { try { await api('/hub/alerts', { method: 'POST', body: { kind: k.api, from: d.from, to: d.to, target: el.querySelector('#tg').value } }); close(true); toast('Price alert created'); refresh(); alerts(); } catch (x) { el.querySelector('#tgErr').textContent = x.message; } }); },
      });
    }
    const lk = e.target.closest('[data-lock]');
    if (lk) { const o = mem.options.find((x) => x.id === lk.dataset.lock); const fee = Math.min(499, Math.max(99, Math.round(o.price * 0.02))); return modal({ title: 'Lock this price', body: `<p class="notop">Hold <b translate="no">${esc(money(o.price))}</b> with ${esc(o.provider)} for 48 hours for <b translate="no">${esc(money(fee))}</b>. The fee comes off the price when you book.</p><p class="form-error" id="e"></p>`, footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="y">Lock price</button>', onMount: (el, close) => el.querySelector('#y').addEventListener('click', async () => { try { await withFunds(() => api('/hub/lock', { method: 'POST', body: { offer_id: o.id } })); close(true); toast('Price locked for 48 hours'); refresh(); locks(); } catch (x) { if (!x.quiet) el.querySelector('#e').textContent = x.message; } }) }); }
    const b = e.target.closest('[data-book]');
    if (b) book(mem.options.find((o) => o.id === b.dataset.book), k, () => { mem.options = mem.options.filter((o) => o.id !== b.dataset.book); paint(); history(); });
  });
  view.querySelector('#cal').addEventListener('click', (e) => { const b = e.target.closest('[data-date]'); if (b) { form.date.value = b.dataset.date; search(); } });
  if (k.cal) view.querySelector('#alerts').addEventListener('click', async (e) => { const b = e.target.closest('[data-rm-alert]'); if (b) { await api('/hub/alerts/remove', { method: 'POST', body: { id: b.dataset.rmAlert } }); toast('Alert removed'); refresh(); alerts(); } });
  paint();
  if (auto) search(); else if (mem.options) calendar(formData(form));
  alerts();
  locks();
  history();
}

function seatMap(o) {
  const m = /(\d+) (traveller|seat|passenger)/.exec(o.meta.join(' '));
  const need = m ? Number(m[1]) : 1;
  const cols = o.kind === 'bus' ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E', 'F'];
  const taken = (id) => [...(o.id + id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) % 3 === 0;
  const rows = Array.from({ length: 8 }, (_, r) => `<div class="seat-row"><small>${r + 1}</small>${cols.map((c, i) => { const id = `${r + 1}${c}`; return `${i === cols.length / 2 ? '<i class="aisle"></i>' : ''}<button type="button" class="seat ${o.kind === 'flight' && r < 3 ? 'prem' : ''}" data-seat="${id}" ${taken(id) ? 'disabled' : ''} aria-pressed="false" aria-label="Seat ${id}">${c}</button>`; }).join('')}</div>`).join('');
  return { need, html: `<div class="field full"><span>Choose ${need === 1 ? 'a seat' : `${need} seats`} (optional)${o.kind === 'flight' ? ' · rows 1 to 3 cost ₹199 more' : ''}</span><div class="seats">${rows}</div></div>` };
}

function book(o, k, done, lock) {
  const p = store.state.profile || {};
  const trip = TRIP.includes(o.kind);
  const sm = trip ? seatMap(o) : null;
  const flexFee = Math.max(99, Math.round(o.price * 0.06));
  modal({
    title: `Book ${k.title.toLowerCase() === 'local services' ? 'ride' : o.provider}`,
    body: `<div class="confirm">${rideIcon(o, k)}<div><b>${esc(o.provider)}</b><small>${esc(o.title)} · ${esc(o.sub)}</small><small>${o.meta.map(esc).join(' · ')}</small></div><b class="confirm__p" translate="no">${esc(money(o.price))}</b></div>
      <form class="form-grid" id="tf" novalidate><label class="field">${o.kind === 'ride' ? 'Rider name' : 'Traveller or guest name'}<input class="input" name="name" value="${esc(p.name || '')}"></label><label class="field">Mobile number<input class="input" name="phone" inputmode="numeric" maxlength="10" value="${esc(p.mobile || '')}"></label>
      <div class="field full"><span>Payment</span>${payChoice('pay_mode', { allowLater: o.pay_later, later: o.pay_later_label || 'Pay later', laterHint: 'Pay when you use the service' })}</div><div class="full" id="pmBox">${payMethods({ only: BOOKING_PAY })}<p class="pay-hint">Have a gift card? <button class="link" type="button" data-gc>Add it to your wallet</button> and pay with Wallet.</p></div>${sm ? sm.html : ''}${o.kind === 'flight' ? '<div class="field full"><span>Add-ons</span><div class="row"><label class="row"><input type="checkbox" class="check" data-add="bag"> Extra 15 kg bag (₹650)</label><label class="row"><input type="checkbox" class="check" data-add="meal"> Meal (₹350)</label></div></div>' : ''}${['flight', 'bus', 'train', 'hotel', 'stay'].includes(o.kind) ? `<label class="row full insure"><input type="checkbox" class="check" id="flex"><span>Flexible protection (${esc(money(flexFee))}) <small class="muted">Full refund on cancellation and one free date change. Without it, 25% is charged on cancelling.</small></span></label>` : ''}</form>${lock ? `<p class="callout">Locked price. Your ${esc(money(lock.fee))} lock fee comes off the total.</p>` : ''}<div id="deals"></div>
      <p class="muted small notop">${esc(o.provider)} provides this service. UT Log connects you and keeps the record. Demo booking: nothing is really reserved.</p><p class="form-error" id="tfErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Back</button><button class="btn btn-primary" id="tfGo">Confirm booking</button>',
    onMount(el, close) {
      const picked = new Set(); let deal = { discount: 0, points: 0 };
      const extras = () => { const seats = o.kind === 'flight' ? [...picked].filter((x) => Number.parseInt(x, 10) <= 3).length * 199 : 0; const add = [...el.querySelectorAll('[data-add]:checked')].reduce((t, c) => t + (c.dataset.add === 'bag' ? 650 : 350), 0); const flex = el.querySelector('#flex') && el.querySelector('#flex').checked ? flexFee : 0; return seats + add + flex - (lock ? lock.fee : 0); };
      const total = () => { el.querySelector('.confirm__p').textContent = money(o.price + extras() - deal.discount - deal.points); };
      el.addEventListener('change', total);
      el.addEventListener('change', (e) => { if (e.target.name === 'pay_mode') el.querySelector('#pmBox').hidden = e.target.value === 'cod'; });
      el.addEventListener('click', (e) => { const s = e.target.closest('[data-seat]'); if (!s || s.disabled) return; const id = s.dataset.seat; if (picked.has(id)) picked.delete(id); else { if (picked.size >= sm.need) { toast(`You can choose ${sm.need} ${sm.need === 1 ? 'seat' : 'seats'}.`, true); return; } picked.add(id); } s.setAttribute('aria-pressed', String(picked.has(id))); total(); });
      const deals = mountDeals(el.querySelector('#deals'), { section: o.section, amount: o.price, onChange: (st) => { deal = st; total(); } });
      total();
      const go = el.querySelector('#tfGo');
      go.addEventListener('click', () => withBusy(go, async () => {
        const d = formData(el.querySelector('#tf'));
        delete d.pm;
        try {
          const book_ = (x) => api('/hub/search/book', { method: 'POST', body: { ...x, offer_id: o.id, ...d, coupon: deals.coupon, use_points: deals.use_points, seats: [...picked], addons: [...el.querySelectorAll('[data-add]:checked')].map((c) => c.dataset.add), flex: !!(el.querySelector('#flex') && el.querySelector('#flex').checked) } });
          let extra = {};
          if (d.pay_mode !== 'cod') { const check = await book_({ dry_run: true }); extra = await checkout(el, check.amount); if (!extra) return; }
          const r = await withFunds(() => book_(extra)); close(r); toast(`Booked with ${o.provider} · ${r.id}`); refresh(); done(); }
        catch (e) { if (!e.quiet) el.querySelector('#tfErr').textContent = e.message; }
      }));
    },
  });
}
