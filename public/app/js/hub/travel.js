// Flights, buses, hotels, accommodation and local rides: search, compare, book from the wallet.
import { api, esc, money, store, toast, modal, withBusy, dateTime, formData } from '../core.js';
import { tile } from './art.js';
import { deskTabs } from './desk.js';
import { payMethods, BOOKING_PAY } from './checkout.js';
import { walletCheckout, payWithApproval } from './wallet-checkout.js';
import { svcHero, BADGES } from './svc-hero.js';
import { icon } from './icons.js';
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
// One-tap searches shown under the form.
const POPULAR = {
  flights: [['BLR', 'DEL', 'Bengaluru → Delhi'], ['BOM', 'GOI', 'Mumbai → Goa'], ['DEL', 'BOM', 'Delhi → Mumbai'], ['BLR', 'DXB', 'Bengaluru → Dubai'], ['HYD', 'MAA', 'Hyderabad → Chennai']].map(([from, to, l]) => [{ from, to }, l]),
  trains: [['Bengaluru', 'Hyderabad'], ['Chennai', 'Bengaluru'], ['Mumbai', 'Pune'], ['Delhi', 'Jaipur']].map(([from, to]) => [{ from, to }, `${from} → ${to}`]),
  buses: [['Bengaluru', 'Chennai'], ['Bengaluru', 'Goa'], ['Mumbai', 'Pune'], ['Hyderabad', 'Vijayawada'], ['Bengaluru', 'Mysuru']].map(([from, to]) => [{ from, to }, `${from} → ${to}`]),
  hotels: ['Goa', 'Jaipur', 'Mumbai', 'Kochi', 'Dubai'].map((city) => [{ city }, city]),
  stays: ['Goa', 'Bengaluru', 'Kochi', 'Jaipur', 'Singapore'].map((city) => [{ city }, city]),
  rides: [['Koramangala', 'Indiranagar'], ['MG Road', 'Whitefield'], ['HSR Layout', 'Electronic City']].map(([from, to]) => [{ from, to }, `${from} → ${to}`]),
};
const OFFER = { travel: { code: 'TRAVEL300', text: '₹300 off travel over ₹3,000' }, rides: { code: 'RIDE20', text: '20% off rides, up to ₹50' }, logistics: { code: 'FIRST100', text: '₹100 off your first booking over ₹300' } };
window.addEventListener('ut:desk-settings', (e) => { Object.keys(KINDS).forEach((x) => { if ((KINDS[x].group ? 'services' : 'travel') === e.detail) delete memory[x]; }); });
const TRIP = ['flight', 'bus', 'train'];
const NOUN = { flight: 'flight', train: 'train', bus: 'bus' };
const TOD = [['morning', 'Morning', '5 AM – 12 PM', 'sunrise'], ['afternoon', 'Afternoon', '12 – 5 PM', 'sun'], ['evening', 'Evening', '5 – 9 PM', 'sunset'], ['night', 'Night', '9 PM – 5 AM', 'moon']];
const todOf = (min) => { const h = Math.floor(((min % 1440) + 1440) % 1440 / 60); return h >= 5 && h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'; };
const todLabel = (min) => { const t = TOD.find((x) => x[0] === todOf(min)); return `<span class="tod tod--${t[0]}">${icon(t[3], 13)}${t[1]}</span>`; };
const arrOf = (o) => (o.arr != null ? o.arr : (o.dep + o.mins) % 1440);
const LEG_ICON = { flight: ['plane', 'blue'], train: ['train', 'green'], bus: ['bus', 'coral'] };
const hm = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const day = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
// One leg of a connecting journey, and the wait between legs.
const hhmm = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const legRow = (l) => `<li class="conn-leg"><span class="conn-leg__ico">${tile(...LEG_ICON[l.kind]).value}</span><div class="conn-leg__m"><b>${esc(l.title)} ${todLabel(hhmm(l.dep))}</b><span><b translate="no">${esc(l.dep)}</b> → <b translate="no">${esc(l.arr)}</b>${l.next_day ? ' <em>+1 day</em>' : ''} · ${esc(hm(l.mins))}</span><small>${esc(l.provider)} · ${esc(l.sub)} · ${esc(day(l.date))}</small></div><span class="conn-leg__p" translate="no">${esc(money(l.price))}</span></li>`;
const legsHtml = (o) => `<ol class="conn-legs">${legRow(o.legs[0])}<li class="conn-wait">${icon('clock', 15)}${esc(hm(o.layover))} to change at ${esc(o.change_at)}</li>${legRow(o.legs[1])}</ol>`;
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
  // Each travel page shows only itself; Travel & Bills is where you pick another one.
  const tabs = '';
  view.innerHTML = `
    ${svcHero({ icon: k.icon, tone: k.tone, title: k.title, intro: k.intro, back: k.group ? ['Dashboard', '#/dashboard'] : ['Travel & Bills', '#/book-pay'], badges: BADGES[k.group ? 'service' : k.api === 'ride' ? 'ride' : ['hotel', 'stay'].includes(k.api) ? 'stay' : 'travel'], offer: OFFER[k.section] })}${tabs}
    <form class="card search-bar sb2" id="sf" novalidate>${fields(key, mem.form)}<button class="btn btn-primary sb2__go" type="submit">${icon('search', 17)}Search</button></form>
    ${POPULAR[key] ? `<div class="svh-pop"><span>Popular</span>${POPULAR[key].map(([v, l], i) => `<button type="button" data-pop="${i}">${esc(l)}</button>`).join('')}</div>` : ''}
    <p class="form-error" id="err"></p>
    <section id="locks"></section>
    <div id="cal"></div>
    <section id="results"></section>
    ${k.cal ? '<section id="alerts"></section>' : ''}
    <section class="card" id="history"></section>`;
  const form = view.querySelector('#sf'); const out = view.querySelector('#results'); const err = view.querySelector('#err');
  // Swap From and To, like every travel app.
  if (form.from && form.to) {
    const swap = document.createElement('button');
    swap.type = 'button'; swap.className = 'sb2__swap'; swap.setAttribute('aria-label', 'Swap from and to');
    swap.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>';
    form.from.closest('label').appendChild(swap);
    swap.addEventListener('click', (e) => { e.preventDefault(); const a = form.from.value; form.from.value = form.to.value; form.to.value = a; swap.classList.remove('spun'); void swap.offsetWidth; swap.classList.add('spun'); });
  }
  const pop = view.querySelector('.svh-pop');
  if (pop) pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pop]'); if (!b) return;
    const [vals] = POPULAR[key][Number(b.dataset.pop)];
    Object.entries(vals).forEach(([n, v]) => { if (form[n]) form[n].value = v; });
    form.requestSubmit();
  });
  const sorts = [['best', 'Recommended'], ['fast', k.fast], ['low', 'Price: low to high'], ['rating', 'Top rated']];

  function paint() {
    if (!mem.options) { out.innerHTML = ''; return; }
    const conn = mem.conn || [];
    const trip = TRIP.includes(k.api);
    const noun = NOUN[k.api] || 'trip';
    const poor = mem.state && mem.state !== 'ok';
    mem.view = mem.view || (poor && conn.length ? 'conn' : 'direct');
    if (!conn.length) mem.view = 'direct';
    if (!mem.options.length && conn.length) mem.view = 'conn';
    mem.tod = mem.tod || { dep: [], arr: [] };
    const timeOk = (o) => o.dep == null || ((!mem.tod.dep.length || mem.tod.dep.includes(todOf(o.dep))) && (!mem.tod.arr.length || mem.tod.arr.includes(todOf(arrOf(o)))));
    const why = mem.state === 'waitlist' ? `Every direct ${noun} on this date is waitlisted.` : mem.state === 'sold_out' ? `Every direct ${noun} on this date is sold out.` : mem.state === 'none' ? mem.note || `There is no direct ${noun} on this route.` : `Direct ${noun}s have seats too.`;
    if (!mem.options.length && !conn.length) { out.innerHTML = `<div class="card">${emptyScene('No options found. Try different details.', null, 'carton')}</div>`; return; }
    mem.f = mem.f || { provider: '', max: '', rating: '' };
    const offFields = [{ key: 'provider', label: 'Provider', options: [['', 'All providers'], ...[...new Set(mem.options.map((o) => o.provider))].map((p) => [p, p])] }, { key: 'max', label: 'Maximum price (₹)', placeholder: 'Any' }, { key: 'rating', label: 'Minimum rating', options: [['', 'Any'], ['4', '4 and above'], ['4.3', '4.3 and above'], ['4.5', '4.5 and above']] }];
    paint.fields = offFields;
    let list = mem.options.filter((o) => (!mem.f.provider || o.provider === mem.f.provider) && (!mem.f.max || o.price <= Number(mem.f.max)) && (!mem.f.rating || o.rating >= Number(mem.f.rating)) && timeOk(o));
    if (mem.sort === 'fast') list.sort((a, b) => a.mins - b.mins || a.price - b.price);
    if (mem.sort === 'low') list.sort((a, b) => a.price - b.price);
    if (mem.sort === 'rating') list.sort((a, b) => b.rating - a.rating || a.price - b.price);
    const connList = conn.filter((o) => (!mem.f.max || o.price <= Number(mem.f.max)) && timeOk(o));
    if (mem.sort === 'fast') connList.sort((a, b) => a.mins - b.mins);
    if (mem.sort === 'low') connList.sort((a, b) => a.price - b.price);
    const freeDirect = mem.options.filter((o) => o.status === 'ok').length;
    // Time chips, with how many trips leave in each part of the day.
    const pool = mem.view === 'conn' ? conn : mem.options;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    // Small time chips: icon, part of day and how many trips; the hours show on hover.
    const chips = (which, label) => `<div class="tchips" role="group" aria-label="${label} time"><span class="tchips__l">${label}</span>${TOD.map(([key, name, hint, ic]) => { const n = pool.filter((o) => o.dep != null && todOf(which === 'dep' ? o.dep : arrOf(o)) === key).length; const on = mem.tod[which].includes(key); return `<button type="button" class="tchip tchip--${key} ${on ? 'on' : ''}" data-tod="${which}:${key}" aria-pressed="${on}" title="${name} · ${hint}" ${n || on ? '' : 'disabled'}>${icon(ic, 14)}<span>${name}</span><em>${n}</em></button>`; }).join('')}</div>`;
    const anyTime = mem.tod.dep.length || mem.tod.arr.length;
    const timeHtml = trip ? `<div class="res-tool__times">${chips('dep', 'Departs')}${chips('arr', 'Arrives')}${anyTime ? '<button class="link tchips__clear" type="button" data-tod-clear>Clear</button>' : ''}</div>` : '';
    const wait = mem.options.length - freeDirect;
    const seg = conn.length ? `<div class="seg" role="tablist" aria-label="Journey type"><button type="button" role="tab" data-view="direct" aria-selected="${mem.view === 'direct'}" title="${freeDirect} with seats${wait ? `, ${wait} waitlisted or full` : ''}">Direct<em class="${mem.options.length && !freeDirect ? 'warn' : ''}">${mem.options.length ? (freeDirect || 'WL') : 0}</em></button><button type="button" role="tab" data-view="conn" aria-selected="${mem.view === 'conn'}" title="With confirmed seats on both legs">Connecting<em>${conn.length}</em></button></div>` : '';
    const count = mem.view === 'conn' ? plural(connList.length, 'connecting journey', 'connecting journeys') : plural(list.length, `direct ${noun}`, `direct ${noun}s`);
    const head = `<div class="card res-tool"><div class="res-tool__top">${seg}<div class="res-tool__count"><b>${count}</b>${k.cal ? '<button class="link" id="setAlert" type="button">Price alert</button>' : ''}</div><div class="res-bar">${sortChips(mem.sort, sorts)}${mem.view === 'direct' ? filterBtn(countActive(offFields, mem.f), 'offF') : ''}</div></div>${timeHtml}</div>`;
    const none = '<div class="card"><p class="muted notop">Nothing leaves or arrives at those times. <button class="link" type="button" data-tod-clear>Clear times</button></p></div>';
    let body;
    if (mem.view === 'conn') {
      body = `${poor ? `<p class="callout conn-why">${esc(why)} These journeys change once on the way, with a confirmed seat on both legs, booked and paid together.</p>` : ''}${connList.length ? `<ul class="conn-list">${connList.map((o, n) => `<li class="conn-card" style="--i:${Math.min(n, 8)}"><div class="conn-card__top"><div class="conn-card__t"><div class="row"><b>${esc(o.title)}</b>${tagBadges(o.tags)}<span class="badge badge-green">${icon('check', 12)}Confirmed seats</span></div><small>${esc(o.modes)} · ${esc(hm(o.mins))} in total · ${esc(o.meta[0])}</small></div><div class="conn-card__r"><b translate="no">${esc(money(o.price))}</b><button class="btn btn-primary btn-sm" type="button" data-cbook="${o.id}">Book both legs</button></div></div>${legsHtml(o)}</li>`).join('')}</ul>` : none}`;
    } else {
      const avail = (o) => (o.status === 'waitlist' ? '<span class="badge badge-amber">Waitlist</span>' : o.status === 'sold_out' ? '<span class="badge badge-red">Sold out</span>' : '');
      body = `${poor && conn.length ? `<p class="callout conn-why">${esc(why)} <button class="link" type="button" data-view="conn">See ${conn.length} connecting journeys with confirmed seats</button></p>` : ''}${!mem.options.length ? `<div class="card"><p class="muted notop">${esc(why)}</p></div>` : list.length ? `<ul class="offers">${list.map((o, n) => `<li class="offer" style="--i:${Math.min(n, 8)}">${rideIcon(o, k)}<div class="offer__m"><div class="row"><b>${esc(o.provider)}</b>${star(o.rating)}${tagBadges(o.tags)}${avail(o)}</div><span>${esc(o.title)} · ${esc(o.sub)}</span><small class="offer__when">${o.dep != null ? todLabel(o.dep) : ''}${o.meta.map(esc).join(' · ')}</small></div><div class="offer__r"><b translate="no">${esc(money(o.price))}</b><div class="row row--nw">${k.cal && o.status === 'ok' ? `<button class="btn btn-outline btn-sm" type="button" data-lock="${o.id}">Lock price</button>` : ''}<button class="btn ${o.status === 'waitlist' ? 'btn-outline' : 'btn-primary'} btn-sm" type="button" data-book="${o.id}" ${o.status === 'sold_out' ? 'disabled' : ''}>${o.status === 'waitlist' ? 'Join waitlist' : 'Book'}</button></div></div></li>`).join('')}</ul>` : none}`;
    }
    out.innerHTML = `${head}${body}`;
  }
  async function search() {
    err.textContent = '';
    const d = formData(form);
    Object.assign(mem.form, d);
    out.innerHTML = '<div class="skeleton" style="height:90px;margin-bottom:10px"></div><div class="skeleton" style="height:90px"></div>';
    try { const r = await api('/hub/search', { method: 'POST', body: { kind: k.api, service: k.service, ...d } }); mem.options = r.options; mem.conn = r.connections || []; mem.state = r.direct_state || 'ok'; mem.note = r.note || ''; mem.view = null; mem.tod = null; mem.f = null; paint(); calendar(d); }
    catch (e) { mem.options = null; mem.conn = []; out.innerHTML = ''; err.textContent = e.message; view.querySelector('#cal').innerHTML = ''; }
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
    if (lk) { const o = mem.options.find((x) => x.id === lk.dataset.lock); const fee = Math.min(499, Math.max(99, Math.round(o.price * 0.02))); return modal({ title: 'Lock this price', body: `<p class="notop">Hold <b translate="no">${esc(money(o.price))}</b> with ${esc(o.provider)} for 48 hours for <b translate="no">${esc(money(fee))}</b>. The fee comes off the price when you book.</p><p class="form-error" id="e"></p>`, footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="y">Lock price</button>', onMount: (el, close) => el.querySelector('#y').addEventListener('click', async () => { try { close(true); const r = await payWithApproval({ path: '/hub/lock', body: { offer_id: o.id }, total: fee, info: { title: 'Price lock', payee: o.provider, icon: 'shield', tone: 'blue', baseLabel: 'Lock fee' } }); if (!r) return; toast('Price locked for 48 hours'); refresh(); locks(); } catch (x) { if (!x.quiet) el.querySelector('#e').textContent = x.message; } }) }); }
    const tv = e.target.closest('[data-view]');
    if (tv) { mem.view = tv.dataset.view; return paint(); }
    const tc = e.target.closest('[data-tod]');
    if (tc) { const [w, key] = tc.dataset.tod.split(':'); const l = mem.tod[w]; mem.tod[w] = l.includes(key) ? l.filter((x) => x !== key) : [...l, key]; return paint(); }
    if (e.target.closest('[data-tod-clear]')) { mem.tod = { dep: [], arr: [] }; return paint(); }
    const cb = e.target.closest('[data-cbook]');
    if (cb) return book(mem.conn.find((o) => o.id === cb.dataset.cbook), k, () => { mem.conn = mem.conn.filter((o) => o.id !== cb.dataset.cbook); paint(); history(); });
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
  const sm = trip && !o.connecting ? seatMap(o) : null;
  const flexFee = Math.max(99, Math.round(o.price * 0.06));
  modal({
    title: `Book ${k.title.toLowerCase() === 'local services' ? 'ride' : o.provider}`,
    body: `<div class="confirm">${rideIcon(o, k)}<div><b>${esc(o.provider)}</b><small>${esc(o.title)} · ${esc(o.sub)}</small><small>${o.meta.map(esc).join(' · ')}</small></div><b class="confirm__p" translate="no">${esc(money(o.price))}</b></div>${o.connecting ? `${legsHtml(o)}<p class="callout">One booking for both legs, each with its own PNR. Seats are assigned on each leg. If the first leg runs late and you miss the second, you can change it for free with Flexible protection.</p>` : ''}${o.status === 'waitlist' ? '<p class="callout">This ticket is waitlisted. It confirms only if seats free up; if it stays waitlisted, the fare is refunded to your wallet.</p>' : ''}
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
          let r;
          if (d.pay_mode !== 'cod') {
            const check = await book_({ dry_run: true });
            const trip = ['flight', 'train', 'bus'].includes(o.kind);
            r = await walletCheckout({ amount: check.amount, run: book_, info: { title: o.record_title || o.title, payee: o.provider, sub: o.record_sub || o.title || '', icon: { flight: 'plane', train: 'train', bus: 'bus', hotel: 'hotel', stay: 'bed', ride: 'ride' }[o.kind] || 'plane', tone: 'blue', baseLabel: 'Fare', refLabel: trip ? 'PNR' : 'Booking reference', refPrefix: trip ? 'PNR' : 'BK', rows: [['Traveller', `${d.name || ''} · ${d.phone || ''}`], ...(o.connecting ? [['Journey', `${o.modes} · change at ${o.change_at}`]] : [])] } });
            if (!r) return;
          } else r = await withFunds(() => book_({}));
          close(r); refresh(); done(); }
        catch (e) { if (!e.quiet) el.querySelector('#tfErr').textContent = e.message; }
      }));
    },
  });
}
