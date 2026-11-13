// Pin-first places, the way city delivery apps work: search or use your location, confirm the
// pin on a map, then add the details a driver needs (flat, floor, lift, landmark, who to call).
// A place: { label, area, city, pincode, lat, lng, house, street, floor, lift, landmark, contact, address, saved }
import { api, esc, modal, store, toast } from '../core.js';
import { icon } from './icons.js';
import { createMap, describe } from './maps.js';

const RECENT = 'ut-recent-places';
let meta = null;
const getMeta = async () => (meta || (meta = await api('/public/booking/meta')));
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch (e) { return []; } };
export function remember(p) {
  if (!p || !p.lat) return;
  const key = (x) => `${x.house}|${x.lat.toFixed(4)}|${x.lng.toFixed(4)}`;
  const list = [p, ...readRecent().filter((x) => x.lat && key(x) !== key(p))].slice(0, 6);
  try { localStorage.setItem(RECENT, JSON.stringify(list)); } catch (e) { /* private mode */ }
}
const FLOORS = [['', 'Floor (optional)'], ['basement', 'Basement'], ['0', 'Ground floor'], ...Array.from({ length: 20 }, (_, i) => [String(i + 1), `${i + 1}${['st', 'nd', 'rd'][i] || 'th'} floor`]), ['21', 'Above 20th floor']];
export const floorText = (f) => (f === '' || f == null ? '' : (FLOORS.find(([k]) => k === String(f)) || [, ''])[1]);

// One line for the driver, the label and the invoice.
const landmarkText = (l) => (!l ? '' : /^(near|opp|opposite|behind|next|beside|above|below|in front|across|inside|at )/i.test(l) ? l : `near ${l}`);
export function placeLine(p) {
  if (!p) return '';
  const bits = [p.house, p.street].filter(Boolean).join(', ');
  const fl = floorText(p.floor);
  // The city only once; landmarks that already say where ("Opposite …") keep their own wording.
  const tail = p.city && bits.toLowerCase().includes(p.city.toLowerCase()) ? p.pincode : [p.city, p.pincode].filter(Boolean).join(' ');
  return [bits, fl && `${fl}${p.lift === true ? ', lift available' : p.lift === false ? ', no lift' : ''}`, landmarkText(p.landmark), tail].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
}
// Short chips for summaries: floor, lift, contact.
export const placeChips = (p) => [floorText(p.floor) && `${floorText(p.floor)}${p.lift === true ? ' · lift' : p.lift === false ? ' · no lift' : ''}`, p.landmark && landmarkText(p.landmark).replace(/^./, (c) => c.toUpperCase()), p.contact && p.contact.phone && `${p.contact.name || 'Contact'} · ${p.contact.phone}`].filter(Boolean);
const dist = (a, b) => { const R = 6371e3; const r = (d) => (d * Math.PI) / 180; const x = r(b.lng - a.lng) * Math.cos(r((a.lat + b.lat) / 2)); const y = r(b.lat - a.lat); return Math.sqrt(x * x + y * y) * R; };
export const samePlace = (a, b) => !!(a && b && a.lat && b.lat && dist(a, b) < 40);

// Saved places from the profile, plus the business address.
function savedPlaces() {
  const p = store.state.profile || {};
  const out = (p.addresses || []).map((a) => ({ ...a, saved: true, label: a.label, kind: a.label }));
  const ba = p.business_address;
  if (store.state.accountType === 'business' && ba && ba.line) out.unshift({ label: 'Business address', kind: 'Business', house: ba.line, street: '', city: ba.city, pincode: ba.pincode, saved: true });
  return out;
}
// Typed text to suggestions: localities, pin codes, saved and recent places.
async function suggest(q) {
  const m = await getMeta();
  const t = q.trim().toLowerCase();
  if (/^\d{6}$/.test(t)) {
    const pt = m.pin_points[t.slice(0, 3)] || m.pin_points[t.slice(0, 2)];
    return pt ? [{ title: `Pin code ${t}`, sub: m.pin_cities[t.slice(0, 3)] || 'India', point: pt, pincode: t }] : [];
  }
  if (t.length < 2) return [];
  const words = t.split(/\s+/);
  return m.areas.filter((a) => words.every((w) => a.toLowerCase().includes(w))).slice(0, 8).map((a) => { const [area, city] = a.split(', '); return { title: area, sub: city, point: m.area_points[a] }; });
}
// Where to centre the map for a saved place without coordinates: its pin code.
async function pointFor(place) {
  if (place.lat) return [place.lat, place.lng];
  const m = await getMeta();
  const pin = String(place.pincode || '');
  return m.pin_points[pin.slice(0, 3)] || m.pin_points[pin.slice(0, 2)] || [12.9716, 77.5946];
}
const row = (ico, title, sub, data) => `<button class="pl-row" type="button" ${data}><span class="pl-ico">${icon(ico, 18)}</span><span class="grow"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chevron', 16)}</button>`;
const KIND_ICON = { Home: 'building', Office: 'building', Shop: 'tag', Warehouse: 'box', Business: 'building' };

/**
 * Opens the picker. kind: 'pickup' | 'drop' | 'stop' | 'place'.
 * Resolves with a place, or null if closed.
 */
export function openPlacePicker({ kind = 'pickup', start = null, other = null, saveDefault = false } = {}) {
  const NOUN = { pickup: 'pickup', drop: 'drop', stop: 'stop', place: 'place' }[kind];
  const me = store.state.profile || {};
  let map = null;
  let place = start && start.lat ? { ...start } : null;
  let point = null;
  const result = modal({
    title: kind === 'place' ? 'Add a place' : `Set ${NOUN} location`,
    body: '<div class="pl" id="pl"></div>',
    footer: '<div class="pl-foot" id="plFoot"></div>',
    async onMount(el, close) {
      const host = el.querySelector('#pl'); const foot = el.querySelector('#plFoot');
      const title = el.querySelector('.modal__head h2');
      // ---- step 1: search ----
      const stepSearch = () => {
        if (map) { map.destroy(); map = null; }
        title.textContent = kind === 'place' ? 'Add a place' : `Set ${NOUN} location`;
        const saved = savedPlaces(); const recent = readRecent();
        host.innerHTML = `<div class="pl-search"><span class="pl-sico">${icon('search', 18)}</span><input class="input input--lg" id="plQ" placeholder="Search area, street or 6-digit pin code" autocomplete="off" aria-label="Search for a place" enterkeyhint="search"></div>
          <div id="plList" class="pl-list">
            ${row('locate', 'Use my current location', 'Best for pickups from where you are now', 'data-gps')}
            ${saved.length ? `<p class="pl-h">Saved places</p>${saved.map((p, i) => row(KIND_ICON[p.kind] || 'pin', p.label, [p.house, p.city, p.pincode].filter(Boolean).join(', '), `data-saved="${i}"`)).join('')}` : ''}
            ${recent.length ? `<p class="pl-h">Recent</p>${recent.map((p, i) => row('clock', p.house || p.area || p.label, [p.area, p.city, p.pincode].filter(Boolean).join(', '), `data-recent="${i}"`)).join('')}` : ''}
          </div><p class="form-error" id="plErr"></p>`;
        foot.innerHTML = '<button class="btn btn-outline" data-close type="button">Cancel</button>';
        const q = host.querySelector('#plQ'); const list = host.querySelector('#plList');
        const base = list.innerHTML; let seq = 0; let found = [];
        q.addEventListener('input', async () => {
          const my = ++seq;
          if (!q.value.trim()) { list.innerHTML = base; return; }
          found = await suggest(q.value);
          if (my !== seq) return;
          list.innerHTML = found.length ? found.map((s, i) => row('pin', s.title, s.sub, `data-found="${i}"`)).join('') : `<p class="pl-none">No match for "${esc(q.value)}". Try an area name or a 6-digit pin code, or <button class="link" type="button" data-gps>use your location</button>.</p>`;
        });
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = list.querySelector('.pl-row'); if (first) first.click(); } });
        list.onclick = async (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.hasAttribute('data-gps')) {
            if (!navigator.geolocation) { host.querySelector('#plErr').textContent = 'Location is not available in this browser. Search instead.'; return; }
            b.disabled = true;
            navigator.geolocation.getCurrentPosition((pos) => { point = [pos.coords.latitude, pos.coords.longitude]; stepPin({}); }, () => { b.disabled = false; host.querySelector('#plErr').textContent = 'Allow location access, or search for the place instead.'; }, { timeout: 9000, enableHighAccuracy: true });
            return;
          }
          if (b.dataset.found != null) { const s = found[b.dataset.found]; point = s.point; stepPin({ pincode: s.pincode }); return; }
          const p = b.dataset.saved != null ? saved[b.dataset.saved] : b.dataset.recent != null ? recent[b.dataset.recent] : null;
          if (p) { point = await pointFor(p); stepPin(p); }
        };
        setTimeout(() => q.focus(), 60);
      };
      // ---- step 2: confirm the pin ----
      const stepPin = async (seed) => {
        title.textContent = `Confirm ${NOUN} pin`;
        host.innerHTML = `<div class="mp-wrap map-host pl-map"><div id="plMap" class="mp-map"></div><span class="pl-pin" aria-hidden="true"><svg width="40" height="52" viewBox="0 0 40 52"><path d="M20 49S35 34.500 35 21.500a15 15 0 0 0-30 0C5 34.500 20 49 20 49z" fill="#0e7c66" stroke="#fff" stroke-width="2.500"/><circle cx="20" cy="21" r="6" fill="#fff"/></svg></span><span class="pl-dot" aria-hidden="true"></span><span class="pl-tip">Move the map to put the pin on the exact gate or door</span></div>
          <div class="mp-addr" aria-live="polite"><b id="plT">Finding the address…</b><small id="plS" class="muted"></small></div><p class="form-error" id="plErr"></p>`;
        foot.innerHTML = '<button class="btn btn-outline" id="plBack" type="button">Back</button><button class="btn btn-primary" id="plOk" type="button" disabled>Confirm pin</button>';
        foot.querySelector('#plBack').onclick = stepSearch;
        let here = null; let seq = 0;
        try { map = await createMap(host.querySelector('#plMap'), { center: point, zoom: 17 }); } catch (e) { host.querySelector('#plErr').textContent = `${e.message} You can still add the address by hand.`; here = { lat: point[0], lng: point[1], pincode: seed.pincode || '' }; foot.querySelector('#plOk').disabled = false; }
        const ok = foot.querySelector('#plOk');
        const update = async () => {
          const my = ++seq; const c = map.center(); ok.disabled = true;
          try {
            const d = await describe(c); if (my !== seq) return;
            here = { ...d, lat: c[0], lng: c[1] };
            host.querySelector('#plT').textContent = d.area ? `${d.area}, ${d.city}` : d.address;
            host.querySelector('#plS').textContent = `Pin code ${d.pincode}${d.km > 8 ? ' · Outside local vehicle areas; courier and logistics still work' : ''}`;
            const clash = other && samePlace({ lat: c[0], lng: c[1] }, other);
            host.querySelector('#plErr').textContent = clash ? `This is the same spot as the ${kind === 'pickup' ? 'drop' : 'pickup'}. Move the pin.` : '';
            ok.disabled = !!clash;
          } catch (e) { host.querySelector('#plErr').textContent = e.message; }
        };
        if (map) { map.onIdle(update); setTimeout(() => { map.resize(); update(); }, 60); }
        ok.onclick = () => { if (here) stepDetails({ ...seed, ...here, pincode: seed.pincode && !here.pincode ? seed.pincode : here.pincode }); };
      };
      // ---- step 3: what the driver needs ----
      const stepDetails = (p) => {
        if (map) { map.destroy(); map = null; }
        title.textContent = 'Add address details';
        const prev = place && place.lat && Math.abs(place.lat - p.lat) < 1e-4 ? place : p;
        const c = prev.contact || (kind === 'pickup' ? { name: me.name || '', phone: /^[6-9]\d{9}$/.test(me.mobile || '') ? me.mobile : '' } : { name: '', phone: '' });
        const goods = kind !== 'place';
        host.innerHTML = `<div class="pl-where">${icon('pin', 18)}<div class="grow"><b>${esc(p.area ? `${p.area}, ${p.city}` : p.address || 'Pinned location')}</b><small>Pin code ${esc(p.pincode || '—')}</small></div><button class="link" type="button" id="plRepin">Change pin</button></div>
          <form class="form-grid pl-form" id="plF" novalidate>
            <label class="field full">House, flat or shop number<input class="input" name="house" value="${esc(prev.house || '')}" placeholder="e.g. Shop 4, Sai Residency" autocomplete="address-line1" required></label>
            <label class="field full">Street and area<input class="input" name="street" value="${esc(prev.street || (p.address && !/^Near /.test(p.address) ? p.address : [p.area, p.city].filter(Boolean).join(', ')))}" autocomplete="address-line2"></label>
            ${goods ? `<label class="field">Floor<select class="select" name="floor">${FLOORS.map(([v, l]) => `<option value="${v}" ${String(prev.floor ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <fieldset class="field pl-lift"><legend>Lift for goods?</legend><div class="seg"><label><input type="radio" name="lift" value="yes" ${prev.lift === true ? 'checked' : ''}><span>Yes</span></label><label><input type="radio" name="lift" value="no" ${prev.lift === false ? 'checked' : ''}><span>No</span></label></div></fieldset>` : ''}
            <label class="field full">Landmark (optional)<input class="input" name="landmark" value="${esc(prev.landmark || '')}" placeholder="e.g. Opposite Metro pillar 112"></label>
            ${goods ? `<p class="pl-h full">${kind === 'pickup' ? 'Who hands it over' : 'Who receives it'}</p>
            <label class="field">Name <span class="req" aria-hidden="true"></span><input class="input" name="cname" value="${esc(c.name || '')}" autocomplete="name" required aria-required="true"></label>
            <label class="field">Mobile <span class="req" aria-hidden="true"></span><input class="input" name="cphone" value="${esc(c.phone || '')}" inputmode="numeric" maxlength="10" autocomplete="tel-national" required aria-required="true"></label>` : ''}
            <div class="full pl-save"><label class="row"><input type="checkbox" class="check" name="save" ${saveDefault ? 'checked' : ''}> Save this place</label><div class="pl-kinds" role="radiogroup" aria-label="Save as">${['Home', 'Office', 'Shop', 'Warehouse', 'Other'].map((k, i) => `<label class="chip-pick"><input type="radio" name="kind" value="${k}" ${i === (store.state.accountType === 'business' ? 2 : 0) ? 'checked' : ''}><span>${k}</span></label>`).join('')}</div></div>
            <p class="form-error full" id="plErr"></p>
          </form>`;
        foot.innerHTML = `<button class="btn btn-outline" id="plBack" type="button">Back</button><button class="btn btn-primary" id="plDone" type="button">${kind === 'place' ? 'Save place' : `Use this ${NOUN}`}</button>`;
        const f = host.querySelector('#plF');
        const syncSave = () => { host.querySelector('.pl-kinds').hidden = !f.save.checked && kind !== 'place'; };
        if (kind === 'place') { f.save.checked = true; f.save.closest('label').hidden = true; }
        f.save.addEventListener('change', syncSave); syncSave();
        host.querySelector('#plRepin').onclick = () => { point = [p.lat, p.lng]; stepPin(p); };
        foot.querySelector('#plBack').onclick = () => { point = [p.lat, p.lng]; stepPin(p); };
        foot.querySelector('#plDone').onclick = async () => {
          const err = host.querySelector('#plErr'); err.textContent = '';
          const house = f.house.value.trim();
          if (house.length < 2) { err.textContent = 'Add the house, flat or shop number so the driver can find the door.'; f.house.focus(); return; }
          const phone = goods ? f.cphone.value.trim() : '';
          // The driver needs someone to call at both ends.
          if (goods && f.cname.value.trim().length < 2) { err.textContent = `Add the name of the person who ${kind === 'pickup' ? 'hands it over' : 'receives it'}.`; f.cname.focus(); return; }
          if (goods && !/^[6-9]\d{9}$/.test(phone)) { err.textContent = 'Enter a 10-digit mobile number for this person.'; f.cphone.focus(); return; }
          const lift = goods ? (f.querySelector('[name=lift]:checked') || {}).value : undefined;
          const out = { label: p.area ? `${p.area}, ${p.city}` : `Pin ${p.pincode}`, area: p.area || '', city: p.city || '', pincode: p.pincode || '', lat: p.lat, lng: p.lng, house, street: f.street.value.trim(), floor: goods ? f.floor.value : '', lift: lift === 'yes' ? true : lift === 'no' ? false : null, landmark: f.landmark.value.trim(), contact: goods && (f.cname.value.trim() || phone) ? { name: f.cname.value.trim(), phone } : null };
          out.address = placeLine(out);
          if (f.save.checked) {
            try {
              const kindName = (f.querySelector('[name=kind]:checked') || {}).value || 'Other';
              const saved = await api('/hub/profile', { method: 'POST', body: { add_address: { label: kindName === 'Other' ? (out.area || 'Saved place') : kindName, line: [house, out.street].filter(Boolean).join(', '), city: out.city || 'India', pincode: out.pincode, lat: out.lat, lng: out.lng, house, street: out.street, floor: out.floor, lift: out.lift, landmark: out.landmark } } });
              store.set({ profile: { ...(store.state.profile || {}), ...saved } });
              toast('Place saved');
            } catch (x) { err.textContent = x.message; return; }
          }
          remember(out);
          place = out;
          close(out);
        };
        setTimeout(() => (prev.house ? f.querySelector('[name=landmark]') : f.house).focus(), 60);
      };
      // Editing an existing place opens on its details; otherwise start with search.
      if (place) stepDetails(place); else stepSearch();
    },
  });
  return result.finally(() => { if (map) map.destroy(); });
}
