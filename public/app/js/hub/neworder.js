// New order: one form, then results.
//   Form: pickup, drop, weight and the service (Vehicle, Courier, Logistics) together; picking a
//   service opens its own fields below. Results: the form folds into a one-line summary, the
//   available vehicles (or courier speeds) show as icons, and tapping one lists its partners
//   with one common sort and filter.
import { api, esc, money, store, toast, date, dateTime, inrHint } from '../core.js';
import { tile, vehicleImg } from './art.js';
import { icon } from './icons.js';
import { sortChips, filterBtn, openFilters, countActive, star } from './ui.js';
import { openPlacePicker } from './places.js';
import { quickBook } from './transport.js';
import { openTracking } from './tracking.js';
import { modOn } from './workspace.js';

const TYPES = [
  { key: 'vehicle', icon: 'bike', tone: 'green', title: 'Vehicle', desc: 'In the city, or vans and trucks between cities', label: 'Vehicle details', go: 'Show available vehicles' },
  { key: 'courier', icon: 'parcel', tone: 'amber', title: 'Courier', desc: 'Parcels to any pin code in India', label: 'Courier details', go: 'Show delivery speeds' },
  { key: 'logistics', icon: 'truck', tone: 'blue', title: 'Logistics', desc: 'Pickups and full trucks between cities', label: 'Load details', go: 'Show available trucks' },
  { key: 'international', icon: 'globe', tone: 'blue', title: 'International', desc: 'Express, air and sea freight to other countries', label: 'Shipment details', go: 'Show international options', intl: true },
];
const DOMESTIC = TYPES.filter((x) => !x.intl);
const isIntl = () => S.scope === 'intl';
const SORTS = [['best', 'Best'], ['fast', 'Fastest'], ['low', 'Cheapest'], ['rating', 'Top rated']];
const SPEEDS = [['same', 'Same day', 'flame'], ['express', 'Express', 'plane'], ['standard', 'Standard', 'truck']];
// Speeds are relative to the route: Express is the quickest couriers on this lane (up to a day
// slower than the fastest), Standard the rest. Same day only when a courier delivers today.
const daysOf = (o) => (o.days != null ? o.days : Math.max(0, Math.ceil((Date.parse(o.eta) - Date.now()) / 864e5)));
let FASTEST = 0;
const speedOf = (o) => { const d = daysOf(o); return d <= 0 ? 'same' : d <= Math.max(2, FASTEST + 1) ? 'express' : 'standard'; };
const dayRange = (list) => { const ds = list.map(daysOf); const lo = Math.min(...ds); const hi = Math.max(...ds); return lo <= 0 ? 'Today' : lo === hi ? `${lo} day${lo === 1 ? '' : 's'}` : `${lo}–${hi} days`; };
const groupOf = (type, o) => (type === 'courier' ? speedOf(o) : o.vehicle);
const kg = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(1)} t` : `${n} kg`);
const km = (a, b) => { if (!a || !b || !a.lat || !b.lat) return null; const R = 6371; const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const placeLabel = (p) => (p ? p.house || p.label || p.area : '');
const placeSub = (p) => (p ? [p.area && p.city ? `${p.area}, ${p.city}` : p.city, p.pincode].filter(Boolean).join(' · ') : '');
// Company logos, shown by each partner's name. Partners without a website keep their initials.
const DOMAIN = { Porter: 'porter.in', Rapido: 'rapido.bike', Uber: 'uber.com', Borzo: 'borzodelivery.com', BlackBuck: 'blackbuck.com', 'Blue Dart': 'bluedart.com', Delhivery: 'delhivery.com', Xpressbees: 'xpressbees.com', DTDC: 'dtdc.in', 'Ecom Express': 'ecomexpress.in', Shadowfax: 'shadowfax.in', Ekart: 'ekartlogistics.com', 'India Post': 'indiapost.gov.in', Gati: 'gati.com', Safexpress: 'safexpress.com', 'TCI Express': 'tciexpress.in', 'TCI Freight': 'tcil.com', 'Mahindra Logistics': 'mahindralogistics.com', 'DHL Express': 'dhl.com', 'DHL Global Forwarding': 'dhl.com', 'FedEx International': 'fedex.com', FedEx: 'fedex.com', Aramex: 'aramex.com', 'UPS Worldwide': 'ups.com', UPS: 'ups.com', 'DB Schenker': 'dbschenker.com', 'Kuehne + Nagel': 'kuehne-nagel.com', Maersk: 'maersk.com', 'CMA CGM': 'cma-cgm.com' };
// Countries (all 194 destinations), kept from the booking metadata.
let COUNTRY_LIST = []; let POPULAR_C = [];
const flag = (code, size = 24) => (code ? `<img class="flag" src="https://flagcdn.com/w40/${esc(code.toLowerCase())}.png" alt="" width="${size}" height="${Math.round(size * 0.75)}" loading="lazy" onerror="this.outerHTML='<i class=&quot;flag flag--txt&quot;>${esc(code)}</i>'">` : '');
const countryOf = (name) => COUNTRY_LIST.find((c) => c.name.toLowerCase() === String(name || '').trim().toLowerCase());
const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.400 9.300 8 11 4.600-1.700 8-6 8-11V5z"/><path d="m8.500 12 2.500 2.500 4.500-5" fill="none"/></svg>';
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const logo = (name) => `<span class="no-av" aria-hidden="true"><i>${esc(initials(name))}</i>${DOMAIN[name] ? `<img src="https://www.google.com/s2/favicons?domain=${DOMAIN[name]}&sz=64" alt="" width="28" height="28" onload="if (this.naturalWidth < 32) this.remove(); else this.classList.add('ok')" onerror="this.remove()">` : ''}</span>`;
// Item types people add themselves, kept in this browser.
const MINE = 'ut-my-categories';
const myCats = () => { try { return JSON.parse(localStorage.getItem(MINE)) || []; } catch (e) { return []; } };
const addCat = (c) => { const list = [c, ...myCats().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 12); try { localStorage.setItem(MINE, JSON.stringify(list)); } catch (e) { /* private mode */ } };
const MAX_ROWS = 20;
const unit = () => (S.type === 'courier' ? 'speed' : S.type === 'logistics' ? 'truck' : S.type === 'international' ? 'shipping option' : 'vehicle');
const betweenCities = () => S.from && S.to && S.from.city && S.to.city && S.from.city !== S.to.city;

// Kept while the app is open, so leaving and coming back keeps the draft.
let S = null;
const fresh = () => ({ scope: 'domestic', stage: 'form', from: null, to: null, type: '', d: { pay_mode: 'prepaid', pieces: 1, helpers: 0, when: 'now' }, quote: null, issue: null, group: '', selected: '', sort: 'best', f: { type: '', rating: '', max: '', cod: '' }, placed: null });

export async function render(view, { query }) {
  if (!S || query.get('fresh')) S = fresh();
  const t = query.get('type');
  if ((t === 'international' || query.get('scope') === 'intl') && !isIntl()) { S.scope = 'intl'; S.type = 'international'; S.to = null; S.stage = 'form'; S.quote = null; S.group = ''; S.selected = ''; }
  else if (t && t !== 'international' && isIntl()) { S.scope = 'domestic'; S.to = null; }
  // A link for another service switches the draft to it and shows the form again.
  if (t && TYPES.some((x) => x.key === t) && t !== S.type) { S.type = t; S.stage = 'form'; S.quote = null; S.group = ''; S.selected = ''; }
  // "Book again" from an order fills in the load; places are picked again on the map.
  let again = null; try { again = JSON.parse(sessionStorage.getItem('ut-rebook')); sessionStorage.removeItem('ut-rebook'); } catch (e) { /* none */ }
  if (again && again.type === S.type && again.form) { const f = again.form; S.d = { ...S.d, ...(f.weight ? { weight: f.weight } : {}), ...(f.category ? { category: f.category } : {}), ...(f.value ? { value: f.value } : {}), pieces: Number(f.pieces) || 1, helpers: Number(f.helpers) || 0 }; }
  let meta = null;
  try { meta = await api('/public/booking/meta'); } catch (e) { meta = { categories: ['Documents', 'Parcel / e-commerce'] }; }
  COUNTRY_LIST = meta.country_list || (meta.countries || []).map((name) => ({ name, code: '', region: '' })); POPULAR_C = meta.popular_countries || [];
  await defaultPickup();
  const draw = () => paint(view, meta, draw);
  draw();
}

// Business accounts start from their business address.
async function defaultPickup() {
  const p = store.state.profile || {}; const ba = p.business_address;
  if (S.from || store.state.accountType !== 'business' || !ba || !ba.line || !/^\d{6}$/.test(ba.pincode || '')) return;
  try {
    const m = await api('/public/booking/meta');
    const named = m.areas.find((x) => ba.line.toLowerCase().includes(x.split(', ')[0].toLowerCase()));
    const pt = (named && m.area_points[named]) || m.pin_points[ba.pincode.slice(0, 3)] || m.pin_points[ba.pincode.slice(0, 2)];
    if (!pt) return;
    const near = await api('/hub/geo/reverse', { method: 'POST', body: { lat: pt[0], lng: pt[1] } });
    S.from = { label: 'Business address', area: near.area || '', city: ba.city || near.city || '', pincode: ba.pincode, lat: pt[0], lng: pt[1], house: ba.line, street: '', contact: null, address: `${ba.line}, ${ba.city} ${ba.pincode}`.replace(/\s+/g, ' ').trim() };
  } catch (e) { /* the user picks it */ }
}

function paint(view, meta, again) {
  if (S.placed) { view.innerHTML = placedView(); wirePlaced(view, again); return; }
  const T = TYPES.find((x) => x.key === S.type);
  const dist = km(S.from, S.to);
  view.innerHTML = `<div class="no">
    <div class="no-head"><div><h1>New order</h1><p>${S.stage === 'form' ? (isIntl() ? 'Ship from India to another country. We compare express, air and sea options.' : 'Fill in the trip and pick a service. We show what is available next.') : `Pick a ${unit()} to see who can carry it.`}</p></div><a class="btn btn-outline" href="#/my/orders">All orders</a></div>
    <div class="no-grid"><div class="no-main">${S.stage === 'form' ? formCard(meta, dist) : resultsView(T, dist)}</div>${sideSummary(T, dist)}</div></div>`;
  wire(view, meta, again);
}

// ---- the form ---------------------------------------------------------------------------------
const placeBtn = (k, p, label) => `<button class="place-btn ${p ? 'is-set' : ''}" type="button" data-place="${k}"><span class="no-pin no-pin--${k}">${icon(k === 'from' ? 'pin' : 'map', 18)}</span><span class="grow"><b>${esc(p ? placeLabel(p) : label)}</b><small>${esc(p ? placeSub(p) : k === 'from' ? 'Search, use your location or a saved place' : 'Search an area, street or pin code')}</small></span>${p && p.lat ? `<span class="place-ok">${icon('check', 16)}</span>` : ''}${icon('chevron', 16)}</button>`;
// A compact two-way switch: the Indian flag for Domestic, a plane for International.
const scopeSwitch = () => `<div class="no-seg" role="radiogroup" aria-label="Where is it going?">${[['domestic', 'Domestic', 'Within India', flag('IN', 20)], ['intl', 'International', 'To another country', icon('plane', 17)]].map(([v, l, sub, ic]) => `<label class="no-seg__o no-seg__o--${v} ${S.scope === v ? 'on' : ''}" title="${sub}"><input type="radio" name="scope" value="${v}" ${S.scope === v ? 'checked' : ''}><span class="no-seg__ico">${ic}</span><b>${l}</b><small>${sub}</small></label>`).join('')}<i class="no-seg__thumb" aria-hidden="true"></i></div>`;
function formCard(meta, dist) {
  const d = S.d; const k = S.type; const T = TYPES.find((x) => x.key === k);
  const types = DOMESTIC.filter((x) => modOn(x.key));
  const mine = myCats(); const base = meta.categories || [];
  const cur = d.category || base[0] || '';
  const catField = S.addCat
    ? `<div class="field"><span>What are you sending?</span><div class="no-addcat"><input class="input" name="newcat" maxlength="40" placeholder="e.g. Spare parts, Artwork" aria-label="Your item type" autocomplete="off"><button class="btn btn-primary btn-sm" type="button" data-catsave>Add</button><button class="btn btn-outline btn-sm" type="button" data-catcancel>Cancel</button></div><small class="muted">Saved for your next orders.</small></div>`
    : `<label class="field">What are you sending?<select class="select" name="category"><optgroup label="Common">${base.map((c) => `<option ${cur === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>${mine.length ? `<optgroup label="Yours">${mine.map((c) => `<option ${cur === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>` : ''}<option value="__add">+ Add your own…</option></select></label>`;
  const num = (name, label, attrs = '') => `<label class="field"><span${attrs.includes('required') ? ' class="req"' : ''}>${label}</span><input class="input" name="${name}" inputmode="decimal" value="${esc(d[name] ?? '')}" ${attrs}></label>`;
  const when = `<div class="field"><span>Pickup</span><div class="seg" role="group" aria-label="Pickup time"><label><input type="radio" name="when" value="now" ${d.when !== 'later' ? 'checked' : ''}><span>Now</span></label><label><input type="radio" name="when" value="later" ${d.when === 'later' ? 'checked' : ''}><span>Schedule</span></label></div></div>
    <label class="field" data-later ${d.when === 'later' ? '' : 'hidden'}>Pickup time<input class="input" type="datetime-local" name="pickup_at" value="${esc(d.pickup_at || '')}"></label>`;
  const helpers = `<label class="field">Loading helpers<select class="select" name="helpers">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}" ${String(d.helpers) === String(n) ? 'selected' : ''}>${n || 'None'}</option>`).join('')}</select></label>`;
  // Courier: one size row per box (up to 20), with "Apply to all" on the first.
  const n = Math.max(1, Math.min(500, Number(d.pieces) || 1));
  const rows = n > MAX_ROWS ? 1 : n;
  const boxes = d.boxes || [];
  const box = (i) => { const b = boxes[i] || {}; return `<div class="no-box"><span class="no-box__n">${n > MAX_ROWS ? 'Each box' : `Box ${i + 1}`}</span><div class="no-box__d">${[['l', 'Length'], ['b', 'Width'], ['h', 'Height']].map(([key, l]) => `<input class="input" name="b${key}_${i}" inputmode="decimal" placeholder="${l[0]}" value="${esc(b[key] || '')}" aria-label="Box ${i + 1} ${l} in cm">`).join('<span aria-hidden="true">×</span>')}<span class="no-box__u">cm</span></div>${i === 0 && rows > 1 ? '<button class="link no-box__all" type="button" data-allboxes>Apply to all boxes</button>' : ''}</div>`; };
  const sub = {
    vehicle: `${num('pieces', 'Number of pieces')}${helpers}${when}`,
    courier: `${num('pieces', 'Number of boxes')}<div class="field full"><span>Box sizes <small class="muted">(optional, for volumetric weight)</small></span><div class="no-boxes">${Array.from({ length: rows }, (_, i) => box(i)).join('')}</div>${n > MAX_ROWS ? `<small class="muted">${n} boxes: enter the size of one box; we count all ${n} as that size.</small>` : ''}<small class="muted" id="volFx"></small></div>`,
    logistics: `${num('pieces', 'Pieces or pallets')}${helpers}${when}`,
    international: `${num('pieces', 'Number of boxes')}<label class="field"><span class="req">Declared value (₹)</span><input class="input" name="value" inputmode="numeric" value="${esc(d.value || '')}" placeholder="For customs"><small class="muted" id="noFx"></small></label><p class="muted small full notop">Customs need the value and contents. Duties in the destination country are paid by the receiver unless you choose otherwise with the partner.</p>`,
  }[k] || '';
  const heavy = Number(d.weight) >= 500;
  const pick = betweenCities() ? (Number(d.weight) > 3500 ? 'logistics' : Number(d.weight) >= 100 ? 'vehicle' : 'courier') : S.from && S.to ? (heavy ? 'logistics' : 'vehicle') : '';
  const sec = (nIdx, title) => `<p class="no-sec"><span>${nIdx}</span>${title}</p>`;
  return `<section class="card no-card">
    <form class="no-f" id="noF" novalidate>
      ${scopeSwitch()}
      ${sec(1, 'Where')}
      ${isIntl()
        ? `<div class="no-route">${placeBtn('from', S.from, 'Pickup address in India')}<i class="no-route__line" aria-hidden="true"></i><div class="no-intl"><span class="no-pin no-pin--to">${icon('globe', 18)}</span><div class="form-grid grow"><div class="field cty"><span class="req">Destination country</span><div class="cty__box"><span class="cty__flag" id="ctyFlag">${countryOf(d.country) ? flag(countryOf(d.country).code) : icon('globe', 18)}</span><input class="input cty__in" name="country_q" value="${esc(d.country || '')}" placeholder="Search ${COUNTRY_LIST.length || 194} countries" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ctyList" aria-autocomplete="list"><input type="hidden" name="country" value="${esc(d.country || '')}">${icon('chevron', 16).replace('class="li"', 'class="li cty__chev"')}</div><ul class="cty__list" id="ctyList" role="listbox" hidden></ul></div><label class="field"><span class="req">City</span><input class="input" name="to_city" value="${esc(d.to_city || '')}" placeholder="e.g. Dubai"></label><label class="field full"><span class="req">Delivery address</span><input class="input" name="to_addr" value="${esc(d.to_addr || '')}" placeholder="Building, street, area and postcode"></label></div></div></div>`
        : `<div class="no-route">${placeBtn('from', S.from, 'Pickup address')}<i class="no-route__line" aria-hidden="true"></i>${placeBtn('to', S.to, 'Drop location')}</div>
      ${dist ? `<p class="no-dist">${icon('map', 14)}${dist.toFixed(1)} km${betweenCities() ? ' · between cities' : ' · same city'}</p>` : ''}`}
      ${sec(2, 'What')}
      <div class="form-grid">
        <label class="field"><span class="req">Total weight (kg)</span><input class="input" name="weight" inputmode="decimal" value="${esc(d.weight ?? '')}" placeholder="e.g. 12" required></label>
        ${catField}
      </div>
      ${sec(3, 'How')}
      ${isIntl() ? `<div class="no-type on no-type--intl">${tile('globe', 'blue').value}<span class="grow"><b>International</b><small>DHL, FedEx, Aramex, UPS and more, compared for express, air and sea</small></span><span class="no-type__tick">${icon('check', 18)}</span></div>` : `<fieldset class="no-svc"><legend class="req">Service</legend><div class="no-types" role="radiogroup" aria-label="Service">${types.map((x) => {
        const off = false;
        return `<label class="no-type ${k === x.key ? 'on' : ''} ${off ? 'is-off' : ''}"><input type="radio" name="svc" value="${x.key}" ${k === x.key ? 'checked' : ''} ${off ? 'disabled' : ''}>${tile(x.icon, x.tone).value}<span class="grow"><b>${esc(x.title)}</b><small>${esc(off ? `Only inside one city${dist ? ` (this trip is ${Math.round(dist)} km)` : ''}` : x.desc)}</small></span>${x.key === pick && !off ? '<i class="ws-tag">Suits this trip</i>' : ''}<span class="no-type__tick">${icon('check', 18)}</span></label>`;
      }).join('')}</div>${types.length < DOMESTIC.length ? '<p class="muted small">More services can be added in <a class="link" href="#/workspace">Workspace</a>.</p>' : ''}</fieldset>`}
      ${T ? `<div class="no-sub"><p class="no-sub__h">${tile(T.icon, T.tone).value}<b>${esc(T.label)}</b></p><div class="form-grid">${sub}</div></div>` : ''}
      <details class="more" ${d.value || d.reference || d.insure ? 'open' : ''}><summary>More options${icon('chevron', 16)}</summary><div class="form-grid more__b">
        ${isIntl() ? '' : `<label class="field">Package value (₹)<input class="input" name="value" inputmode="numeric" value="${esc(d.value || '')}" placeholder="For insurance"><small class="muted" id="noFx"></small></label>`}
        <label class="field">Reference<input class="input" name="reference" value="${esc(d.reference || '')}" placeholder="Your order or invoice number"></label>
        <label class="row insure full"><input type="checkbox" class="check" name="insure" ${d.insure ? 'checked' : ''}> <span>Insure the goods <small class="muted">0.2%, minimum ₹30</small></span></label>
      </div></details>
      <input type="hidden" name="pay_mode" value="prepaid">
      <p class="form-error" id="noErr"></p>
      <button class="btn btn-primary btn-block no-go" type="submit">${icon('search', 18)}${esc(T ? T.go : 'Show what is available')}</button>
    </form></section>`;
}
function detailLine() {
  const d = S.d;
  return [d.weight && `${d.weight} kg`, d.category, d.pieces > 1 && `${d.pieces} pieces`, d.when === 'later' && d.pickup_at && `Pickup ${dateTime(d.pickup_at)}`].filter(Boolean).join(' · ');
}
// Typed values survive re-drawing the form (choosing a service or a place re-draws it).
function keepForm(f) {
  if (!f) return;
  const d = Object.fromEntries(new FormData(f).entries());
  const boxes = [];
  for (const [key, v] of Object.entries(d)) { const m = /^b([lbh])_(\d+)$/.exec(key); if (m) { (boxes[m[2]] = boxes[m[2]] || {})[m[1]] = v; delete d[key]; } }
  if (f.querySelector('.no-boxes')) d.boxes = boxes;
  delete d.svc; delete d.newcat; delete d.scope; delete d.country_q;
  if (d.category === '__add') delete d.category;
  S.d = { ...S.d, ...d, insure: !!(f.insure && f.insure.checked) };
}

// ---- results: the form folded, vehicle icons, partners ------------------------------------------
function groups() {
  const map = new Map();
  for (const o of S.quote.options) { const g = groupOf(S.type, o); if (!map.has(g)) map.set(g, []); map.get(g).push(o); }
  return map;
}
function groupName(g) {
  if (S.type === 'courier') return (SPEEDS.find((s) => s[0] === g) || [, g])[1];
  const o = S.quote && S.quote.options.find((x) => x.vehicle === g);
  return o ? o.title.replace(/^Full truck · /, '').replace(/^Part load · /, '') : g;
}
function resultsView(T, dist) {
  const mini = `<section class="card no-mini"><span class="no-mini__ico">${isIntl() && S.to && S.to.code ? `<span class="no-mini__flag">${flag(S.to.code, 34)}</span>` : tile(T.icon, T.tone).value}</span><div class="grow"><b>${esc(placeLabel(S.from))} → ${esc(placeLabel(S.to))}</b><small>${esc([dist && `${dist.toFixed(1)} km`, T.title, detailLine()].filter(Boolean).join(' · '))}</small></div><button class="btn btn-outline btn-sm" type="button" data-editform>${icon('sliders', 15)}Edit</button></section>`;
  if (S.issue) return `${mini}<div class="card issue" role="alert"><b>${esc(S.issue.title || 'No service for this trip')}</b><p>${esc(S.issue.message)}</p><button class="btn btn-outline btn-sm" type="button" data-editform>Change the details</button></div>`;
  const map = groups();
  const entries = S.type === 'courier' ? SPEEDS.filter(([k]) => map.has(k)).map(([k]) => [k, map.get(k)]) : [...map.entries()].sort((a, b) => (a[1][0].max_kg || 0) - (b[1][0].max_kg || 0));
  const noun = S.type === 'courier' ? 'speeds' : S.type === 'logistics' ? 'trucks' : S.type === 'international' ? 'shipping options' : 'vehicles';
  const icons = entries.map(([k, list], i) => {
    const lo = Math.min(...list.map((o) => o.total));
    const pic = S.type === 'courier' ? tile((SPEEDS.find((s) => s[0] === k) || [])[2] || 'parcel', k === 'same' ? 'coral' : k === 'express' ? 'amber' : 'blue').value : `<img src="${vehicleImg(k)}" alt="" width="72" height="48" loading="lazy">`;
    const sub = S.type === 'courier' ? dayRange(list) : S.type === 'international' ? `${dayRange(list)} · up to ${kg(list[0].max_kg || 0)}` : `Up to ${kg(list[0].max_kg || 0)}`;
    return `<button class="no-vic no-vic--${esc(k)} ${S.group === k ? 'on' : ''}" type="button" role="radio" aria-checked="${S.group === k}" data-g="${esc(k)}">${i === 0 && S.type !== 'courier' ? '<i class="no-vic__fit">Best fit</i>' : ''}<span class="no-vic__pic">${pic}</span><b>${esc(groupName(k))}</b><small>${esc(sub)}</small><span class="no-vic__p">from <b translate="no">${esc(money(lo))}</b></span><small class="no-vic__n">${list.length} ${S.type === 'courier' ? 'courier' : 'partner'}${list.length === 1 ? '' : 's'}</small></button>`;
  }).join('');
  return `${mini}
    <section class="card no-veh"><div class="no-veh__h"><h2>${S.type === 'international' ? 'Shipping options' : `Available ${noun}`}</h2><small>${S.quote.options.length} prices for this trip</small></div>
      <div class="no-vstrip" role="radiogroup" aria-label="Available ${noun}">${icons}</div></section>
    ${S.group ? `<section class="card no-partners"><div class="no-veh__h"><h2>Partners for ${esc(groupName(S.group))}</h2></div>${partnerStep()}</section>` : `<p class="no-hint">${icon('chevron', 16)}Tap a ${S.type === 'courier' ? 'speed' : S.type === 'logistics' ? 'truck' : S.type === 'international' ? 'shipping option' : 'vehicle'} to see who can carry it.</p>`}`;
}
function partnerList() {
  const all = S.quote.options.filter((o) => groupOf(S.type, o) === S.group);
  const f = S.f;
  let list = all.filter((o) => (!f.type || o.provider_type === f.type) && (!f.rating || o.rating >= Number(f.rating)) && (!f.max || o.total <= Number(f.max)) && (!f.cod || o.cod));
  const eta = (o) => Date.parse(o.eta);
  if (S.sort === 'fast') list = [...list].sort((a, b) => eta(a) - eta(b) || a.total - b.total);
  if (S.sort === 'low') list = [...list].sort((a, b) => a.total - b.total);
  if (S.sort === 'rating') list = [...list].sort((a, b) => b.rating - a.rating || a.total - b.total);
  return { all, list };
}
const filterFields = () => [
  { key: 'type', label: 'Partner type', options: [['', 'All partners'], ...[...new Set(S.quote.options.map((o) => o.provider_type))].map((t) => [t, t])] },
  { key: 'rating', label: 'Minimum rating', options: [['', 'Any'], ['4', '4 and above'], ['4.3', '4.3 and above'], ['4.5', '4.5 and above']] },
  { key: 'max', label: 'Maximum price (₹)', placeholder: 'Any' },
];
function partnerStep() {
  const { all, list } = partnerList();
  const cod = S.d.pay_mode === 'cod';
  const when = (o) => (S.type === 'vehicle' ? `${icon('clock', 14)}${o.eta_pickup_min || o.pickup_within_min} min to pickup<span class="dot">·</span>${o.trip_min} min trip` : `${icon('calendar', 14)}Delivers by ${esc(date(o.eta))}<span class="dot">·</span>${o.days != null ? `${o.days} day${o.days === 1 ? '' : 's'}` : ''}`);
  const badge = (o) => (o.kind === 'independent' && o.mode === 'local' ? `<span class="vbadge2 vbadge2--ut" title="Background, licence and vehicle checked by UT Log">${SHIELD}UT partner</span>` : o.verified ? `<span class="vbadge2" title="Licence, GST and KYC checked by UT Log">${SHIELD}Verified</span>` : '');
  const covers = (o) => (S.type !== 'international' ? '' : [/door to door/i.test(o.note || '') ? ['building', 'Door to door', 'route'] : ['plane', 'Airport to airport', 'route'], /customs/i.test(o.note || '') || o.kind === 'freight' ? ['file', 'Customs help', 'help'] : null, ['radar', 'Live tracking', 'track'], /receiver/i.test(o.note || '') ? ['alert', 'Duties paid by receiver', 'warn'] : null].filter(Boolean).map(([ic, t, k]) => `<em class="no-cov no-cov--${k}">${icon(ic, 12)}${t}</em>`).join(''));
  const codWith = all.filter((o) => o.cod).length;
  return `<div class="no-bar">${sortChips(S.sort, SORTS)}${filterBtn(countActive(filterFields(), S.f), 'noFlt')}</div>
    ${cod ? `<p class="no-codnote">${icon('cash', 16)}${codWith ? `You chose pay on delivery. ${codWith} of ${all.length} partners take it; the others are online-only.` : 'None of these partners take pay on delivery. Pick another vehicle, or <button class="link" type="button" data-editform>switch to Pay online</button>.'}</p>` : ''}
    ${list.length ? `<ul class="no-opts" role="radiogroup" aria-label="Partners">${list.map((o) => {
      const off = cod && !o.cod;
      return `<li><button class="no-opt ${o.id === S.selected ? 'on' : ''} ${off ? 'is-off' : ''}" type="button" role="radio" aria-checked="${o.id === S.selected}" data-id="${o.id}" ${off ? 'disabled aria-disabled="true"' : ''}>
      ${logo(o.provider)}
      <span class="grow"><span class="no-opt__h"><b>${esc(o.provider)}</b>${star(o.rating)}${badge(o)}</span>
        <span class="no-opt__m">${when(o)}</span>
        <span class="no-opt__c">${covers(o)}${o.tags && o.tags[0] ? `<em class="no-tag no-tag--${o.tags[0].toLowerCase()}">${esc(o.tags[0])}</em>` : ''}</span></span>
      <span class="no-opt__p"><b translate="no">${esc(money(o.total))}</b>${o.save ? `<small class="pos">${esc(money(o.save))} below avg</small>` : ''}</span><span class="no-radio" aria-hidden="true"></span></button></li>`;
    }).join('')}</ul>`
    : `<p class="muted">No partner matches these filters. <button class="link" type="button" data-clearf>Clear filters</button></p>`}
    <p class="opt-note">${all.length} partner${all.length === 1 ? '' : 's'} for ${esc(groupName(S.group))}. Sort and filters stay the same when you switch. "Below avg" compares each price with all ${S.quote.options.length} quotes for this trip. <a class="link" href="/pricing/#how" target="_blank" rel="noopener">How pricing works</a></p>`;
}

// ---- summary --------------------------------------------------------------------------------
function sideSummary(T, dist) {
  const sel = S.quote && S.quote.options.find((o) => o.id === S.selected);
  const cod = S.d.pay_mode === 'cod';
  const fee = sel && cod && sel.cod ? Math.max(25, Math.round(sel.total * 0.015)) : 0;
  const row = (l, v) => (v ? `<div><dt>${l}</dt><dd>${v}</dd></div>` : '');
  return `<aside class="card no-sum ${sel ? 'no-sum--sel' : ''}" aria-live="polite"><h2>Order summary</h2>
    <dl class="no-sum__dl">${row('Pickup', S.from ? esc(placeLabel(S.from)) : '<span class="muted">Not set</span>')}${row('Drop', S.to ? esc(placeLabel(S.to)) : isIntl() && S.d.country ? esc([S.d.to_city, S.d.country].filter(Boolean).join(', ')) : '<span class="muted">Not set</span>')}${dist ? row('Distance', `${dist.toFixed(1)} km`) : ''}${row('Service', T ? esc(T.title) : '')}${S.quote ? row('Load', esc(detailLine())) : ''}${S.group ? row(T && T.key === 'courier' ? 'Speed' : T && T.key === 'international' ? 'Shipping' : 'Vehicle', esc(groupName(S.group))) : ''}${sel ? row('Partner', esc(sel.provider)) : ''}</dl>
    ${sel ? `<div class="no-sum__total"><span>Total${fee ? ' incl. pay on delivery fee' : ''}</span><b translate="no">${esc(money(sel.total + fee))}</b></div><button class="btn btn-primary btn-block" type="button" id="noGo">Continue to pay</button>` : `<p class="muted small notop">${S.stage === 'form' ? 'Fill in the form to see prices.' : S.group ? 'Pick a partner to continue.' : `Pick a ${unit()}, then a partner.`}</p>`}
  </aside>`;
}

// ---- after booking ----------------------------------------------------------------------------
function placedView() {
  const p = S.placed;
  return `<div class="no"><section class="card no-done"><div class="placed__tree no-done__tree" aria-hidden="true"></div><span class="placed__ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></span>
    <h1>Order placed</h1><small class="mono">${esc(p.id)}</small><p>${esc(p.provider)} · ${esc(p.from)} → ${esc(p.to)}</p><b class="no-done__p" translate="no">${esc(money(p.amount))}</b>
    <div class="row no-done__a"><button class="btn btn-primary" type="button" id="noTrack">Live tracking</button><a class="btn btn-outline" href="#/my/orders/${esc(p.id)}">View order</a><button class="btn btn-outline" type="button" id="noAgain">New order</button></div></section></div>`;
}
function wirePlaced(view, again) {
  if (window.UTTree) window.UTTree.mount(view.querySelector('.no-done__tree'), { compact: true, now: true, seed: S.placed.id.length * 31 + S.placed.amount });
  view.querySelector('#noTrack').onclick = () => openTracking(S.placed.id);
  view.querySelector('#noAgain').onclick = async () => { S = fresh(); await defaultPickup(); again(); };
}

// ---- behaviour ------------------------------------------------------------------------------------
function wire(view, meta, again) {
  const f = view.querySelector('#noF');
  const top = () => view.querySelector('.no-main').scrollIntoView({ block: 'start', behavior: 'smooth' });
  view.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-editform]')) { S.stage = 'form'; S.selected = ''; again(); top(); return; }
    const pl = t.closest('[data-place]');
    if (pl) {
      keepForm(f);
      const k = pl.dataset.place;
      const p = await openPlacePicker({ kind: k === 'from' ? 'pickup' : 'drop', other: k === 'from' ? S.to : S.from });
      if (!p) return;
      S[k] = p; S.quote = null; S.group = ''; S.selected = '';
      again(); return;
    }
    const g = t.closest('[data-g]');
    if (g) { S.group = g.dataset.g; S.selected = ''; again(); const pnl = view.querySelector('.no-partners'); if (pnl) pnl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    const s = t.closest('[data-sort]');
    if (s) { S.sort = s.dataset.sort; again(); return; }
    if (t.closest('[data-clearf]')) { S.f = { type: '', rating: '', max: '', cod: '' }; again(); return; }
    if (t.closest('#noFlt')) { openFilters(t.closest('#noFlt'), filterFields(), S.f, (v) => { S.f = { ...S.f, ...v }; again(); }); return; }
    const o = t.closest('[data-id]');
    if (o) { S.selected = o.dataset.id; again(); const b = view.querySelector('#noGo'); if (b && matchMedia('(max-width: 1100px)').matches) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if (t.closest('#noGo')) book(again);
  };
  if (!f) return;
  // Searchable country picker: type to filter 194 countries by name, region or code.
  const cin = f.querySelector('.cty__in');
  if (cin) {
    const list = f.querySelector('#ctyList'); const hidden = f.country; let hi = 0; let shown = [];
    const row = (c, i) => `<li role="option" id="cty${i}" data-c="${esc(c.name)}" aria-selected="${i === hi}" class="${i === hi ? 'hi' : ''}">${flag(c.code)}<span class="grow">${esc(c.name)}</span><small>${esc(c.region)}</small></li>`;
    const draw = () => {
      const q = cin.value.trim().toLowerCase();
      const exact = countryOf(cin.value);
      if (!q || (exact && exact.name === hidden.value)) {
        const pop = POPULAR_C.map(countryOf).filter(Boolean);
        shown = [...pop, ...COUNTRY_LIST.filter((c) => !POPULAR_C.includes(c.name))];
        list.innerHTML = `<li class="cty__h" role="presentation">Popular</li>${pop.map((c, i) => row(c, i)).join('')}<li class="cty__h" role="presentation">All countries · ${COUNTRY_LIST.length}</li>${shown.slice(pop.length).map((c, i) => row(c, i + pop.length)).join('')}`;
      } else {
        const starts = COUNTRY_LIST.filter((c) => c.name.toLowerCase().startsWith(q) || c.code.toLowerCase() === q);
        const has = COUNTRY_LIST.filter((c) => !starts.includes(c) && (c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q)));
        shown = [...starts, ...has];
        list.innerHTML = shown.length ? shown.map(row).join('') : '<li class="cty__none" role="presentation">No country matches that. Check the spelling.</li>';
      }
      list.hidden = false; cin.setAttribute('aria-expanded', 'true');
    };
    const pick = (name) => {
      const c = countryOf(name); if (!c) return;
      hidden.value = c.name; cin.value = c.name; S.d.country = c.name;
      f.querySelector('#ctyFlag').innerHTML = flag(c.code);
      list.hidden = true; cin.setAttribute('aria-expanded', 'false');
      const err = view.querySelector('#noErr'); if (err) err.textContent = '';
      if (f.to_city && !f.to_city.value) f.to_city.focus();
    };
    const close = () => { list.hidden = true; cin.setAttribute('aria-expanded', 'false'); };
    cin.addEventListener('focus', () => { hi = 0; draw(); cin.select(); });
    cin.addEventListener('input', () => { hidden.value = ''; f.querySelector('#ctyFlag').innerHTML = icon('globe', 18); hi = 0; draw(); });
    cin.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (list.hidden) draw();
        hi = Math.max(0, Math.min(shown.length - 1, hi + (e.key === 'ArrowDown' ? 1 : -1)));
        list.querySelectorAll('[data-c]').forEach((li, i) => { li.classList.toggle('hi', i === hi); li.setAttribute('aria-selected', String(i === hi)); });
        const cur = list.querySelector(`#cty${hi}`); if (cur) { cur.scrollIntoView({ block: 'nearest' }); cin.setAttribute('aria-activedescendant', cur.id); }
      } else if (e.key === 'Enter') { if (!list.hidden && shown[hi]) { e.preventDefault(); pick(shown[hi].name); } }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-c]'); if (li) { e.preventDefault(); pick(li.dataset.c); } });
    cin.addEventListener('blur', () => setTimeout(() => { if (!hidden.value && countryOf(cin.value)) pick(cin.value); close(); }, 120));
  }
  const fx = () => {
    const v = view.querySelector('#noFx'); if (v) v.textContent = inrHint(f.value.value);
    const vol = view.querySelector('#volFx');
    if (vol) {
      const rows = [...f.querySelectorAll('.no-box')].map((r) => [...r.querySelectorAll('input')].map((i) => Number(i.value) || 0));
      const full = rows.filter((r) => r.every((x) => x > 0));
      const count = Math.max(1, Number(f.pieces.value) || 1);
      const cm3 = rows.length === 1 ? (full.length ? full[0][0] * full[0][1] * full[0][2] * count : 0) : full.reduce((t, [l, b, h]) => t + l * b * h, 0);
      vol.textContent = cm3 ? `Volumetric weight ${(cm3 / 5000).toFixed(1)} kg${rows.length > 1 && full.length < rows.length ? ` (${full.length} of ${rows.length} boxes filled)` : ''}. Couriers charge the higher of this and the actual weight.` : '';
    }
  };
  f.addEventListener('input', fx); fx();
  f.addEventListener('change', (e) => {
    // Picking a service opens its own fields below.
    if (e.target.name === 'scope') { keepForm(f); S.scope = e.target.value; S.type = isIntl() ? 'international' : ''; S.to = null; S.quote = null; S.group = ''; S.selected = ''; if (isIntl()) S.d.pay_mode = 'prepaid'; again(); return; }
    if (e.target.name === 'svc') { keepForm(f); S.type = e.target.value; S.quote = null; S.group = ''; S.selected = ''; again(); const sub = view.querySelector('.no-sub'); if (sub) sub.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if (e.target.name === 'when') { const w = f.querySelector('[data-later]'); if (w) w.hidden = e.target.value !== 'later'; }
    if (e.target.name === 'category' && e.target.value === '__add') { keepForm(f); S.addCat = true; again(); const i = view.querySelector('[name=newcat]'); if (i) i.focus(); return; }
    if (e.target.name === 'pieces' && S.type === 'courier') { keepForm(f); again(); const b = view.querySelector('.no-boxes input'); if (b) b.focus(); }
  });
  const saveCat = () => {
    const i = f.querySelector('[name=newcat]'); const v = (i.value || '').trim().replace(/\s+/g, ' ');
    if (v.length < 2) { view.querySelector('#noErr').textContent = 'Type at least 2 letters for your item type.'; i.focus(); return; }
    keepForm(f); addCat(v); S.d.category = v; S.addCat = false; again();
  };
  f.addEventListener('click', (e) => {
    if (e.target.closest('[data-catsave]')) { saveCat(); return; }
    if (e.target.closest('[data-catcancel]')) { keepForm(f); S.addCat = false; again(); return; }
    // Box 1's size copied to every box.
    if (e.target.closest('[data-allboxes]')) {
      const first = [...f.querySelectorAll('.no-box')][0].querySelectorAll('input');
      if (![...first].every((i) => Number(i.value) > 0)) { view.querySelector('#noErr').textContent = 'Fill in Box 1 first, then apply it to all.'; first[0].focus(); return; }
      f.querySelectorAll('.no-box').forEach((r) => r.querySelectorAll('input').forEach((i, n) => { i.value = first[n].value; }));
      view.querySelector('#noErr').textContent = ''; f.dispatchEvent(new Event('input')); toast('Box 1 size applied to all boxes');
    }
  });
  f.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.name === 'newcat') { e.preventDefault(); saveCat(); } });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    keepForm(f);
    const d = S.d; const err = view.querySelector('#noErr');
    const fail = (msg, el) => { err.textContent = msg; if (el) el.focus(); };
    if (!S.from) return fail('Set the pickup address.', view.querySelector('[data-place=from]'));
    if (isIntl()) {
      if (!d.country && countryOf(f.country_q.value)) d.country = countryOf(f.country_q.value).name;
      if (!d.country || !countryOf(d.country)) return fail('Pick the destination country from the list.', f.country_q);
      if (String(d.to_city || '').trim().length < 2) return fail('Enter the destination city.', f.to_city);
      if (String(d.to_addr || '').trim().length < 8) return fail('Enter the full delivery address abroad.', f.to_addr);
      if (!(Number(d.value) > 0)) return fail('Enter the declared value for customs.', f.value);
      S.type = 'international';
      S.to = { label: `${d.to_city.trim()}, ${d.country}`, city: d.to_city.trim(), country: d.country, code: countryOf(d.country).code, address: `${d.to_addr.trim()}, ${d.to_city.trim()}, ${d.country}` };
    } else if (!S.to) return fail('Set the drop location.', view.querySelector('[data-place=to]'));
    if (!(Number(d.weight) > 0)) return fail('Enter the weight in kg.', f.weight);
    if (isIntl() && Number(d.weight) > 300) return fail('International express takes up to 300 kg per booking. Split heavier loads.', f.weight);
    if (!S.type) return fail('Pick a service: Vehicle, Courier or Logistics.', f.querySelector('[name=svc]:not(:disabled)'));
    if (d.when === 'later' && S.type !== 'courier' && !d.pickup_at) return fail('Choose the pickup time, or pick Now.', f.pickup_at);
    S.d = { ...d, pieces: Number(d.pieces) || 1, helpers: Number(d.helpers) || 0, pay_mode: S.type === 'logistics' || isIntl() ? 'prepaid' : d.pay_mode };
    if (S.addCat) return fail('Add your item type, or press Cancel.', f.newcat);
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Finding prices…';
    await quote();
    S.stage = 'results';
    again(); top();
  });
}
const where = (p) => (S.type === 'courier' || S.type === 'international' ? p.pincode || p.city : p.area && p.city ? `${p.area}, ${p.city}` : p.city || p.pincode);
const iso = (v) => (v ? new Date(v).toISOString() : undefined);
async function quote() {
  S.issue = null; S.quote = null; S.group = ''; S.selected = '';
  const d = S.d;
  try {
    const q = await api('/hub/transport/quote', { method: 'POST', body: { section: S.type, segment: store.state.accountType === 'business' ? 'b2b' : 'b2c', from_place: where(S.from), to_place: isIntl() ? undefined : where(S.to), country: isIntl() ? S.d.country : undefined, weight: d.weight, pieces: d.pieces, boxes: S.type === 'courier' && (d.boxes || []).length ? d.boxes.filter(Boolean).map((b) => ({ l: Number(b.l) || 0, b: Number(b.b) || 0, h: Number(b.h) || 0 })) : undefined, length: S.type === 'courier' && d.boxes && d.boxes[0] ? d.boxes[0].l : undefined, breadth: S.type === 'courier' && d.boxes && d.boxes[0] ? d.boxes[0].b : undefined, height: S.type === 'courier' && d.boxes && d.boxes[0] ? d.boxes[0].h : undefined, value: d.value, category: d.category, insure: d.insure, helpers: d.helpers, from_pt: S.from.lat ? { lat: S.from.lat, lng: S.from.lng } : undefined, to_pt: S.to.lat ? { lat: S.to.lat, lng: S.to.lng } : undefined, pickup_at: d.when === 'later' && S.type !== 'courier' ? iso(d.pickup_at) : undefined } });
    if (!q.options || !q.options.length) S.issue = { title: 'No service for this trip', message: q.message || 'No partner can carry this load on this route. Try a different weight or service.' };
    else { S.quote = q; FASTEST = Math.min(...q.options.map(daysOf)); }
  } catch (e) { S.issue = { title: (e.data && e.data.title) || 'We need a little more', message: e.message }; }
}
// The same confirm and payment step as every other booking.
function book(again) {
  const form = document.createElement('form');
  form.innerHTML = `<input name="pay_mode" value="${esc(S.d.pay_mode || 'prepaid')}"><input name="reference" value="${esc(S.d.reference || '')}">`;
  const mem = { form: { from_place: S.from, to_place: S.to, from_addr: S.from.address, to_addr: S.to.address, pay_mode: S.d.pay_mode }, quote: S.quote, selected: S.selected, sample: false };
  mem.onPlaced = () => { S.placed = mem.placed; toast('Order placed'); again(); };
  quickBook(S.type, mem, form);
}
