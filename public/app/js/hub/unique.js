// Features only an aggregator can offer: carbon report, luggage ahead, relay delivery, receiver
// choices, never-stranded rebooking, sharing a truck and booking by chat or voice.
import { api, esc, money, store, toast, modal, withBusy, dateTime, date } from '../core.js';
import { tile, vehicleImg } from './art.js';
import { icon } from './icons.js';
import { downloadCsv, refresh } from './ui.js';
import { walletCheckout, payWithApproval } from './wallet-checkout.js';

const head = (ic, tone, title, intro, right = '') => `<div class="page-head ph-hero"><div class="row head-t">${tile(ic, tone).value}<div><h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div><div class="row">${right}</div></div>`;
const kgOf = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)} t` : `${Math.round(n * 10) / 10} kg`);
const MODE = { local: 'City vehicles', intercity: 'Vans between cities', ftl: 'Full trucks', ptl: 'Part loads', parcel: 'Courier', air: 'Air', ship: 'Sea', plane: 'Air' };
let META = null;
const meta = async () => (META = META || await api('/public/booking/meta'));

// ---- 7. carbon report -----------------------------------------------------------------------------
export async function renderCarbon(view, { query } = {}) {
  view.innerHTML = '<div class="skeleton" style="height:280px"></div>';
  const month = query && query.get('month');
  const d = await api('/hub/carbon', { query: { month } });
  const max = Math.max(1, ...Object.values(d.by_mode)); const tmax = Math.max(1, ...d.trend.map((x) => x.co2));
  view.innerHTML = `${head('leaf', 'green', 'Carbon report', 'Emissions from every shipment, ready for your BRSR filing.', `<select class="select" id="cbM" aria-label="Month">${d.months.map((m) => `<option value="${m}" ${m === d.month ? 'selected' : ''}>${new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>`).join('')}</select><button class="btn btn-outline" id="cbCsv" type="button">${icon('download', 16)}CSV</button><button class="btn btn-primary" id="cbPrint" type="button">${icon('file', 16)}BRSR report</button>`)}
    <div class="cb-kpis">${[['Emissions', kgOf(d.total_kg) + ' CO₂e', `${d.shipments} shipment${d.shipments === 1 ? '' : 's'}`], ['Freight moved', `${d.tonne_km.toLocaleString('en-IN')} tonne-km`, 'Weight × distance'], ['Intensity', `${d.per_tkm} kg / tonne-km`, `${d.per_lakh} kg per ₹1 lakh spent`], ['Could have saved', kgOf(d.could_save_kg), 'By picking the greenest option each time']].map(([k, v, s]) => `<div class="card cb-kpi"><small>${k}</small><b>${esc(v)}</b><span>${esc(s)}</span></div>`).join('')}</div>
    <div class="dash dash--even"><div class="dash__main">
      <section class="card"><div class="card__head"><h2>By how it moved</h2></div>${Object.keys(d.by_mode).length ? `<ul class="cb-bars">${Object.entries(d.by_mode).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<li><span>${esc(MODE[m] || m)}</span><i style="--w:${Math.round((v / max) * 100)}%"></i><b>${esc(kgOf(v))}</b></li>`).join('')}</ul>` : '<p class="muted notop">No shipments this month.</p>'}</section>
      <section class="card"><div class="card__head"><h2>Last six months</h2></div><div class="cb-trend">${d.trend.map((t) => `<div><i style="--h:${Math.round((t.co2 / tmax) * 100)}%" title="${esc(kgOf(t.co2))}"></i><small>${new Date(t.month + '-01').toLocaleDateString('en-IN', { month: 'short' })}</small></div>`).join('')}</div></section>
      <section class="card"><div class="card__head"><h2>Shipments</h2></div>${d.rows.length ? `<div class="table-wrap"><table class="cb-t"><thead><tr><th>Date</th><th>Shipment</th><th>How</th><th>Tonne-km</th><th>CO₂e</th></tr></thead><tbody>${d.rows.map((r) => `<tr><td>${esc(date(r.at))}</td><td><a class="link" href="#/my/orders/${esc(r.id)}">${esc(r.title)}</a><small class="muted block">${esc(r.provider)} · ${esc(r.sub || '')}</small></td><td>${esc(MODE[r.mode] || r.mode)}</td><td>${r.tkm}</td><td><b>${esc(kgOf(r.co2))}</b>${r.estimated ? '<small class="muted block">estimated</small>' : r.best != null && r.best < r.co2 ? `<small class="muted block">greenest ${esc(kgOf(r.best))}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted notop">Nothing shipped this month.</p>'}</section>
    </div><aside class="dash__side"><section class="card cb-brsr"><span class="badge badge-green">BRSR ready</span><h2>${esc(d.brsr.tco2e)} tCO₂e</h2><dl class="od-kv"><div><dt>Disclosure</dt><dd>${esc(d.brsr.principle)}</dd></div><div><dt>Category</dt><dd>${esc(d.brsr.category)}</dd></div><div><dt>Method</dt><dd>${esc(d.brsr.method)}</dd></div></dl><p class="muted small">Factors are indicative averages. A live report uses each carrier's own figures; have your sustainability team check them before filing.</p></section>
      <section class="card"><b>Cut emissions</b><p class="muted small notop">Sort by <b>Greenest</b> when you book, share a truck, or use a full truck for big loads instead of several vans.</p><a class="btn btn-outline btn-sm" href="#/new-order">Book greener</a></section></aside></div>`;
  view.querySelector('#cbM').addEventListener('change', (e) => { location.hash = `#/business/carbon?month=${e.target.value}`; });
  view.querySelector('#cbCsv').addEventListener('click', () => downloadCsv(`carbon-${d.month}.csv`, [['Date', 'Order', 'Shipment', 'Provider', 'Mode', 'Weight kg', 'Distance km', 'Tonne-km', 'kg CO2e', 'Estimated'], ...d.rows.map((r) => [String(r.at).slice(0, 10), r.id, r.title, r.provider, MODE[r.mode] || r.mode, r.kg, r.km, r.tkm, r.co2, r.estimated ? 'yes' : 'no'])]));
  view.querySelector('#cbPrint').addEventListener('click', () => {
    const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to open the report.', true); return; }
    const p = store.state.profile || {};
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Scope 3 transport emissions ${esc(d.month)}</title><style>body{font:13px/1.5 Inter,Segoe UI,sans-serif;color:#15211E;max-width:820px;margin:24px auto;padding:24px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #CDD5D2;padding:6px 8px;text-align:left}th{background:#F1F4F3}.k{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.k div{border:1px solid #CDD5D2;border-radius:8px;padding:10px}.k b{display:block;font-size:17px}small{color:#5b6b66}</style>
      <h1>Scope 3 · Upstream transportation and distribution</h1><small>${esc(p.company || p.name || 'Your company')} · ${esc(new Date(d.month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }))} · prepared with UT Log</small>
      <div class="k"><div><small>Emissions</small><b>${esc(d.brsr.tco2e)} tCO₂e</b></div><div><small>Freight moved</small><b>${d.tonne_km} t-km</b></div><div><small>Intensity</small><b>${d.per_tkm} kg/t-km</b></div><div><small>Shipments</small><b>${d.shipments}</b></div></div>
      <p><b>Disclosure:</b> ${esc(d.brsr.principle)}<br><b>Category:</b> ${esc(d.brsr.category)}<br><b>Method:</b> ${esc(d.brsr.method)}</p>
      <table><tr><th>Mode</th><th>Factor (kg CO₂e / t-km)</th><th>Emissions</th></tr>${Object.entries(d.by_mode).map(([m, v]) => `<tr><td>${esc(MODE[m] || m)}</td><td>${d.brsr.factors[m] ?? '—'}</td><td>${esc(kgOf(v))}</td></tr>`).join('')}</table>
      <table><tr><th>Date</th><th>Order</th><th>Provider</th><th>t-km</th><th>kg CO₂e</th></tr>${d.rows.map((r) => `<tr><td>${esc(String(r.at).slice(0, 10))}</td><td>${esc(r.id)}</td><td>${esc(r.provider)}</td><td>${r.tkm}</td><td>${r.co2}${r.estimated ? ' (est.)' : ''}</td></tr>`).join('')}</table>
      <small>Demo report. Factors are indicative; confirm with your sustainability team before filing.</small><script>print()<\/script>`);
    w.document.close();
  });
}

// ---- 5. luggage ahead -------------------------------------------------------------------------------
export function luggageAhead(trip, done) {
  const p = store.state.profile || {}; const home = (p.addresses || [])[0] || {};
  modal({
    title: 'Send your luggage ahead',
    body: `<div class="lg-hero">${tile('parcel', 'amber').value}<div><b>Travel light on ${esc(trip.title)}</b><small>A courier collects your bags at home and delivers them to your hotel before you arrive. One payment, from your wallet.</small></div></div>
      <form class="form-grid" id="lgF" novalidate>
        <label class="field"><span class="req">Home pin code</span><input class="input" name="from_pin" inputmode="numeric" maxlength="6" value="${esc(home.pincode || '')}"></label>
        <label class="field"><span class="req">Hotel pin code</span><input class="input" name="to_pin" inputmode="numeric" maxlength="6" placeholder="e.g. 400053"></label>
        <label class="field full"><span class="req">Home address</span><input class="input" name="from_addr" value="${esc(home.line ? `${home.line}, ${home.city || ''}` : '')}"></label>
        <label class="field full"><span class="req">Hotel name and address</span><input class="input" name="to_addr" placeholder="Hotel, street, area"></label>
        <label class="field">Bags<select class="select" name="bags">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field">Weight per bag<select class="select" name="kg_per_bag">${[10, 15, 20, 25, 32].map((n) => `<option value="${n}" ${n === 20 ? 'selected' : ''}>Up to ${n} kg</option>`).join('')}</select></label>
      </form><div id="lgOut"></div><p class="form-error" id="lgE"></p>`,
    footer: '<button class="btn btn-outline" data-close>Not now</button><button class="btn btn-primary" id="lgGo">See prices</button>',
    onMount(el, close) {
      const f = el.querySelector('#lgF'); const out = el.querySelector('#lgOut'); const go = el.querySelector('#lgGo'); let q = null; let pick = null;
      go.addEventListener('click', () => withBusy(go, async () => {
        el.querySelector('#lgE').textContent = '';
        const d = Object.fromEntries(new FormData(f).entries());
        if (!q) {
          try { q = await api('/hub/luggage/quote', { method: 'POST', body: { trip_id: trip.id, ...d } }); } catch (x) { el.querySelector('#lgE').textContent = x.message; return; }
          pick = q.options[0].id;
          out.innerHTML = `<p class="muted small">Your trip starts ${esc(dateTime(q.trip.starts))}. These arrive before you do:</p><div class="lg-opts">${q.options.map((o) => `<label class="lg-opt"><input type="radio" name="lgo" value="${o.id}" ${o.id === pick ? 'checked' : ''}><span class="grow"><b>${esc(o.provider)}</b><small>Arrives ${esc(dateTime(o.eta))}${o.in_time ? '' : ' · may be after you'}</small></span><b translate="no">${esc(money(o.total))}</b></label>`).join('')}</div>`;
          out.addEventListener('change', (e) => { if (e.target.name === 'lgo') pick = e.target.value; });
          go.textContent = 'Pay and book'; return;
        }
        if (String(d.from_addr || '').length < 8 || String(d.to_addr || '').length < 8) { el.querySelector('#lgE').textContent = 'Enter the home and hotel addresses.'; return; }
        const o = q.options.find((x) => x.id === pick);
        const run = (x) => api('/hub/transport/book', { method: 'POST', body: { ...x, quote_id: q.quote_id, option_id: o.id, pay_mode: 'prepaid', contact: { name: p.name || 'Traveller', phone: p.mobile }, pickup_address: d.from_addr, drop_address: `${d.to_addr} (hold for guest ${p.name || ''})` } });
        el.closest('.modal-backdrop').hidden = true;
        const r = await walletCheckout({ amount: o.total, run, info: { title: 'Luggage ahead', payee: o.provider, sub: `${q.bags} bag${q.bags > 1 ? 's' : ''} · ${q.route.from} → ${q.route.to}`, icon: 'parcel', tone: 'amber', baseLabel: 'Courier', refLabel: 'Booking reference' } });
        el.closest('.modal-backdrop').hidden = false;
        if (r) { close(true); toast('Your bags are booked to go ahead'); refresh(); if (done) done(); }
      }));
    },
  });
}

// ---- 4. relay delivery -------------------------------------------------------------------------------
export async function renderRelay(view) {
  const m = await meta();
  const CITY = { bengaluru: 'Bengaluru', mumbai: 'Mumbai', delhi: 'Delhi NCR', hyderabad: 'Hyderabad', chennai: 'Chennai', pune: 'Pune' };
  const areasOf = (key) => m.areas.filter((a) => a.endsWith(`, ${CITY[key]}`)).map((a) => a.split(',')[0]);
  let city = 'bengaluru'; let from = 'Pune'; let hubArea = ''; let drops = [{ area: '', kg: 40 }, { area: '', kg: 25 }];
  const draw = () => {
    const ar = areasOf(city); hubArea = ar.includes(hubArea) ? hubArea : ar[0];
    const used = drops.map((d) => d.area);
    view.innerHTML = `<div class="rl">
      <section class="rl-hero">
        <div class="rl-hero__t"><span class="sh-pill">${icon('sparkle', 13)}Only on UT Log</span><h1>Relay delivery</h1><p>One truck to a city hub, then bikes and autos fan out to every drop. One booking, one payment, one tracking page.</p></div>
        <div class="rl-flow" aria-hidden="true"><span class="rl-flow__n"><img src="${vehicleImg('truck14')}" alt=""><small>Truck</small></span><i></i><span class="rl-flow__hub">${icon('home', 20)}<small>Hub</small></span><i></i><span class="rl-flow__fan"><img src="${vehicleImg('bike')}" alt=""><img src="${vehicleImg('auto')}" alt=""><img src="${vehicleImg('bike')}" alt=""><small>Drops</small></span></div>
      </section>
      <div class="rl-grid"><div class="rl-main">
        <section class="card rl-route">
          <div class="rl-stage"><span class="rl-dot rl-dot--a">1</span><div class="grow"><b>Pickup</b><label class="rl-in">${icon('pin', 16)}<input class="input" id="rlFrom" value="${esc(from)}" placeholder="City, area or pin code"></label></div></div>
          <div class="rl-stage"><span class="rl-dot rl-dot--b">2</span><div class="grow"><b>Hub · where the truck hands over</b><div class="rl-two"><label class="rl-in">${icon('map', 16)}<select class="select" id="rlCity">${Object.entries(CITY).map(([k, v]) => `<option value="${k}" ${k === city ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="rl-in">${icon('home', 16)}<select class="select" id="rlHub">${ar.map((a) => `<option ${a === hubArea ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label></div></div></div>
          <div class="rl-stage rl-stage--last"><span class="rl-dot rl-dot--c">3</span><div class="grow"><b>Drops in ${esc(CITY[city])} <small>${drops.length} of 12</small></b>
            <div class="rl-drops2">${drops.map((d, i) => `<div class="rl-d ${d.area ? 'is-set' : ''}"><span class="rl-d__n">${i + 1}</span><select class="select" data-di="${i}" data-k="area" aria-label="Drop ${i + 1} area"><option value="">Pick an area</option>${ar.map((a) => `<option ${a === d.area ? 'selected' : ''} ${a !== d.area && used.includes(a) ? 'disabled' : ''}>${esc(a)}</option>`).join('')}</select>
              <div class="rl-kg"><button type="button" data-step="${i}" data-by="-5" aria-label="Less">−</button><input class="input" data-di="${i}" data-k="kg" inputmode="numeric" value="${d.kg}" aria-label="Weight in kg"><span>kg</span><button type="button" data-step="${i}" data-by="5" aria-label="More">+</button></div>
              ${drops.length > 2 ? `<button class="icon-btn" type="button" data-rm="${i}" aria-label="Remove drop">${icon('x', 15)}</button>` : '<span></span>'}</div>`).join('')}</div>
            ${drops.length < 12 ? '<button class="rl-add" type="button" id="rlAdd">+ Add a drop</button>' : ''}</div></div>
          <p class="form-error" id="rlE"></p>
          <div class="rl-foot"><small>${drops.reduce((t, d) => t + (Number(d.kg) || 0), 0)} kg in total · ${drops.filter((d) => d.area).length} of ${drops.length} drops set</small><button class="btn btn-primary rl-go" id="rlGo" type="button">${icon('route', 17)}Plan the relay</button></div>
        </section>
        <div id="rlOut"></div></div>
        <aside class="rl-side"><section class="card rl-how2"><b>How a relay works</b>${[['truck', 'blue', 'Truck to the hub', 'A full truck or part load takes everything to the hub.'], ['home', 'violet', 'Handover', 'Bikes and autos leave the hub an hour after it arrives.'], ['bike', 'green', 'Every drop', 'One rider per drop. If one cancels, a backup takes over.']].map(([ic, tone, t, d]) => `<div class="rl-how2__i">${tile(ic, tone).value}<span><strong>${t}</strong><small>${d}</small></span></div>`).join('')}</section></aside>
      </div></div>`;
    const keep = () => { from = view.querySelector('#rlFrom').value; };
    view.querySelector('#rlCity').addEventListener('change', (e) => { keep(); city = e.target.value; drops = drops.map((d) => ({ ...d, area: '' })); draw(); });
    view.querySelector('#rlHub').addEventListener('change', (e) => { hubArea = e.target.value; });
    view.querySelectorAll('[data-di]').forEach((x) => x.addEventListener('change', () => { keep(); drops[x.dataset.di][x.dataset.k] = x.dataset.k === 'kg' ? Math.max(1, Number(x.value) || 1) : x.value; draw(); }));
    view.querySelectorAll('[data-step]').forEach((x) => x.addEventListener('click', () => { keep(); const d = drops[x.dataset.step]; d.kg = Math.max(1, Math.min(750, (Number(d.kg) || 0) + Number(x.dataset.by))); draw(); }));
    view.querySelectorAll('[data-rm]').forEach((x) => x.addEventListener('click', () => { keep(); drops.splice(Number(x.dataset.rm), 1); draw(); }));
    const add = view.querySelector('#rlAdd'); if (add) add.addEventListener('click', () => { keep(); drops.push({ area: '', kg: 20 }); draw(); });
    const go = view.querySelector('#rlGo');
    go.addEventListener('click', () => withBusy(go, async () => {
      keep(); view.querySelector('#rlE').textContent = '';
      let q; try { q = await api('/hub/relay/quote', { method: 'POST', body: { from_place: from, hub_city: city, hub_area: hubArea, drops } }); } catch (x) { view.querySelector('#rlE').textContent = x.message; return; }
      const out = view.querySelector('#rlOut');
      out.innerHTML = `<section class="card rl-plan"><div class="card__head"><h2>Your relay · ${q.legs.length} legs</h2><b translate="no">${esc(money(q.total))}</b></div>
        <ol class="rl-legs">${q.legs.map((l) => `<li class="rl-leg rl-leg--${l.kind}"><span class="rl-leg__ico"><img src="${vehicleImg(l.kind === 'trunk' ? 'truck14' : /auto/i.test(l.title) ? 'auto' : /mini|truck/i.test(l.title) ? 'mini' : 'bike')}" alt="" width="52" height="34"></span><div class="grow"><b>${l.kind === 'trunk' ? 'Truck to hub' : `Drop ${l.leg - 1} · ${esc(l.to)}`}</b><small>${esc(l.provider)} · ${esc(l.title)}${l.kg ? ` · ${l.kg} kg` : ''} · arrives ${esc(dateTime(l.eta))}</small></div><b translate="no">${esc(money(l.total))}</b></li>${l.kind === 'trunk' ? `<li class="rl-hand">${icon('repeat', 14)}Handover at ${esc(q.hub)} · ${esc(dateTime(q.handover_at))}</li>` : ''}`).join('')}</ol>
        <button class="btn btn-primary btn-block" id="rlBook" type="button">Book all ${q.legs.length} legs · <span translate="no">${esc(money(q.total))}</span></button></section>`;
      out.querySelector('#rlBook').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
        try { const r = await payWithApproval({ path: '/hub/relay/book', body: { plan_id: q.plan_id, pickup_address: from }, total: q.total, info: { title: `Relay delivery · ${q.legs.length} legs`, payee: 'Truck and city partners', icon: 'truck', tone: 'blue', baseLabel: 'Freight' } }); if (!r) return; toast(`Relay booked: ${r.legs.length} legs`); refresh(); location.hash = '#/my/orders'; } catch (x) { if (!x.quiet) toast(x.message, true); }
      }));
      out.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }));
  };
  draw();
}

// ---- 6. share a truck --------------------------------------------------------------------------------
export async function renderShare(view) {
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const truck = vehicleImg('truck14');
  view.innerHTML = `<div class="sh">
    <section class="sh-hero">
      <div class="sh-hero__t"><span class="sh-pill">${icon('sparkle', 13)}Only on UT Log</span><h1>Share a truck</h1><p>Going between cities? Split a dedicated truck with another business on the same route and pay only for your space.</p>
        <ul class="sh-perks"><li>${icon('rupee', 15)}Up to 45% cheaper than a part load</li><li>${icon('truck', 15)}Dedicated truck, no hub transfers</li><li>${icon('shield', 15)}Never more than the part-load price</li></ul></div>
      <div class="sh-hero__art" aria-hidden="true"><img src="${truck}" alt="" width="260" height="170"><div class="sh-load"><i class="sh-load__them" style="--w:52%">Partner</i><i class="sh-load__you" style="--w:40%">You</i></div></div>
    </section>
    <form class="card sh-search" id="shF" novalidate>
      <label class="sh-f"><span>From</span><input class="input" name="from_place" value="Pune" placeholder="City or pin code"></label>
      <button class="sh-swap" type="button" id="shSwap" aria-label="Swap from and to"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg></button>
      <label class="sh-f"><span>To</span><input class="input" name="to_place" value="Bengaluru" placeholder="City or pin code"></label>
      <label class="sh-f sh-f--sm"><span>Your load</span><div class="sh-kg"><input class="input" name="weight" inputmode="numeric" value="800"><em>kg</em></div></label>
      <label class="sh-f sh-f--sm"><span>Pickup</span><input class="input" type="date" name="date" value="${tomorrow}" min="${tomorrow}"></label>
      <button class="btn btn-primary sh-go" id="shGo" type="submit">${icon('search', 17)}Find a truck</button>
    </form>
    <p class="form-error" id="shE"></p>
    <div id="shOut"><ol class="sh-steps">${[['1', 'Join or start', 'Join a business already loading, or start a share and pay the part-load price now.'], ['2', 'We fill the truck', 'The truck leaves once it is at least 91% full, so everyone pays only for their space.'], ['3', 'Pay less, or nothing extra', 'Shared? The difference comes back to your wallet. Not shared? It goes as a part load at the price you paid.']].map(([n, t, d]) => `<li><b>${n}</b><span><strong>${t}</strong><small>${d}</small></span></li>`).join('')}</ol></div>
  </div>`;
  const f = view.querySelector('#shF'); const out = view.querySelector('#shOut');
  view.querySelector('#shSwap').addEventListener('click', () => { const x = f.from_place.value; f.from_place.value = f.to_place.value; f.to_place.value = x; });
  const body = () => ({ from_place: f.from_place.value, to_place: f.to_place.value, weight: Number(f.weight.value), date: new Date(f.date.value + 'T09:00:00').toISOString() });
  const bar = (yours, theirs, cap) => `<div class="sh-fill" title="${Math.round(((yours + theirs) / cap) * 100)}% full"><i class="sh-fill__them" style="width:${(theirs / cap) * 100}%"></i><i class="sh-fill__you" style="width:${(yours / cap) * 100}%"></i></div>`;
  f.addEventListener('submit', (e) => { e.preventDefault(); const go = view.querySelector('#shGo'); withBusy(go, async () => {
    view.querySelector('#shE').textContent = '';
    let q; try { q = await api('/hub/pool/quote', { method: 'POST', body: body() }); } catch (x) { view.querySelector('#shE').textContent = x.message; return; }
    const pct = Math.round((q.saving / q.part_load.total) * 100);
    out.innerHTML = `<section class="sh-compare">
        <div class="sh-cmp sh-cmp--old"><small>Part load</small><b translate="no">${esc(money(q.part_load.total))}</b><span>Shared space, goes through hubs</span></div>
        <div class="sh-vs">vs</div>
        <div class="sh-cmp sh-cmp--new"><span class="sh-save">Save ${pct}%</span><small>Shared truck</small><b translate="no">${esc(money(q.share))}</b><span>${esc(q.truck.title)} · dedicated, door to door</span></div>
      </section>
      <p class="sh-route">${icon('map', 14)}${esc(q.from)} → ${esc(q.to)} · ${q.km} km · your ${q.weight} kg in a ${(q.truck.capacity / 1000).toFixed(0)} t truck</p>
      <section class="card sh-sec"><div class="sh-sec__h"><h2>Businesses loading now</h2><small>Join and the truck is full enough to leave</small></div>
        ${q.open.length ? `<ul class="sh-open">${q.open.map((o) => `<li class="sh-o"><span class="sh-av">${esc(o.company.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>
          <div class="sh-o__m"><b>${esc(o.company)}</b><small>★ ${o.rating} · ${(o.kg / 1000).toFixed(1)} t already paid · leaves ${esc(dateTime(o.leaves))}</small>${bar(q.weight, o.kg, q.truck.capacity)}<small class="sh-o__legend"><i class="them"></i>Their load <i class="you"></i>Yours · ${o.fill}% full</small></div>
          <div class="sh-o__r"><b translate="no">${esc(money(o.share))}</b><small class="pos">You save ${esc(money(q.part_load.total - o.share))}</small><button class="btn btn-primary" type="button" data-join="${esc(o.id)}" data-amt="${o.share}">Join this truck</button></div></li>`).join('')}</ul>` : '<p class="muted notop">No one is loading on this route that day yet. Start a share below.</p>'}</section>
      <section class="card sh-sec sh-new"><div class="sh-new__ico">${tile('truck', 'green').value}</div><div class="grow"><h2>Start a share</h2><p>Pay <b translate="no">${esc(money(q.part_load.total))}</b> now. When a business joins, you pay <b translate="no">${esc(money(q.share))}</b> and <b translate="no">${esc(money(q.saving))}</b> comes back to your wallet. If no one joins in time, it goes as a part load. You never pay more.</p></div><button class="btn btn-outline" type="button" id="shStart" data-amt="${q.part_load.total}">Start a share</button></section>`;
    out.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }); });
  out.addEventListener('click', (e) => {
    const b = e.target.closest('[data-join], #shStart'); if (!b) return;
    withBusy(b, async () => {
      try {
        const r = await payWithApproval({ path: '/hub/pool/join', body: { ...body(), pool_id: b.dataset.join || undefined }, total: Number(b.dataset.amt), info: { title: b.dataset.join ? 'Shared truck' : 'Shared truck · part-load price', payee: 'Truck partner', icon: 'truck', tone: 'green', baseLabel: 'Freight' } });
        if (!r) return;
        toast(r.matched ? `Truck shared · you saved ${money(r.saved)}` : `Looking for a partner until ${new Date(r.decide_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
        refresh(); location.hash = `#/my/orders/${r.id}`;
      } catch (x) { if (!x.quiet) toast(x.message, true); }
    });
  });
}

// ---- 8. book by chat or voice --------------------------------------------------------------------------
const LANGS = [['en-IN', 'English'], ['hi-IN', 'हिन्दी'], ['te-IN', 'తెలుగు'], ['ta-IN', 'தமிழ்'], ['kn-IN', 'ಕನ್ನಡ']];
const SAMPLES = ['Kal subah 10 baje Koramangala se Whitefield 40 kilo', 'Send 2 tonnes from Pune to Hyderabad tomorrow 6pm', 'రేపు హైదరాబాద్ నుంచి చెన్నై కి 200 కిలో', 'நாளை சென்னை இருந்து பெங்களூர் க்கு 15 கிலோ'];
export async function renderChatBook(view) {
  const p = store.state.profile || {};
  const TRY = [['English', SAMPLES[1]], ['Hinglish', SAMPLES[0]], ['తెలుగు', SAMPLES[2]], ['தமிழ்', SAMPLES[3]]];
  view.innerHTML = `<div class="cbk">
    <section class="cbk-hero"><div><span class="sh-pill">${icon('sparkle', 13)}Only on UT Log</span><h1>Book by chat</h1><p>Type or say it the way you would to a person. We read the places, the weight and the time, compare every partner and give you three prices.</p></div>
      <div class="cbk-langs" role="radiogroup" aria-label="Voice language">${LANGS.map(([v, l], i) => `<button type="button" role="radio" data-lang="${v}" aria-checked="${i === 0}">${l}</button>`).join('')}</div></section>
    <div class="cbk-grid"><section class="card cb-phone cbk-phone"><div class="cb-top">${tile('chat', 'green').value}<div><b>UT Log</b><small>${icon('check', 11)}Replies instantly · compares every partner</small></div></div>
      <div class="cb-chat" id="cbChat" aria-live="polite"><div class="bubble">Hi ${esc((p.name || '').split(' ')[0] || 'there')}! Tell me what to send, from where to where, and the weight. Tap an example below to try it.</div>
        <div class="cbk-try">${TRY.map(([l, s2], i) => `<button type="button" data-s="${SAMPLES.indexOf(s2)}"><small>${esc(l)}</small><span>${esc(s2)}</span></button>`).join('')}</div></div>
      <form class="cb-in cbk-in" id="cbF"><button class="cbk-mic" type="button" id="cbMic" aria-label="Speak your booking">${icon('mic', 20)}</button><input class="input" id="cbT" placeholder="e.g. 20 kg from Koramangala to Whitefield now" autocomplete="off" aria-label="Message"><button class="btn btn-primary cbk-send" type="submit" aria-label="Send">${icon('send', 17)}</button></form></section>
      <aside class="cbk-side"><section class="card cbk-how"><b>What it understands</b>${[['pin', 'Places', 'Areas, cities and pin codes: "Koramangala", "Hyderabad", "560034"'], ['scale', 'Weight', '"40 kilo", "2 tonnes", "200 किलो"'], ['calendar', 'Time', '"now", "kal subah 10 baje", "tomorrow 6pm", "రేపు"'], ['chat', 'Languages', 'English, Hindi, Telugu, Tamil, Kannada, and mixes like Hinglish']].map(([ic, t, d]) => `<div class="rl-how2__i">${tile(ic, 'green').value}<span><strong>${t}</strong><small>${esc(d)}</small></span></div>`).join('')}</section>
        <section class="card cbk-wa">${tile('whatsapp', 'green').value}<div><b>Also on WhatsApp</b><small>Once your WhatsApp Business number is connected, customers book the same way there and pay with one link.</small><a class="link" href="#/business/whatsapp">WhatsApp settings</a></div></section></aside></div></div>`;
  let lang = 'en-IN';
  view.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; view.querySelectorAll('[data-lang]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }));
  const chat = view.querySelector('#cbChat'); const input = view.querySelector('#cbT');
  const say = (html, me) => { const tr = chat.querySelector('.cbk-try'); if (tr) tr.remove(); chat.insertAdjacentHTML('beforeend', `<div class="bubble ${me ? 'me' : ''}">${html}</div>`); chat.scrollTop = chat.scrollHeight; return chat.lastElementChild; };
  async function handle(textIn) {
    say(esc(textIn), true);
    const wait = say('<i class="cb-dots"><b></b><b></b><b></b></i>');
    let r; try { r = await api('/hub/chat/parse', { method: 'POST', body: { text: textIn } }); } catch (x) { wait.innerHTML = esc(x.message); return; }
    if (r.missing.length) { wait.innerHTML = `I got ${[r.from_label && `from <b>${esc(r.from_label)}</b>`, r.to_label && `to <b>${esc(r.to_label)}</b>`, r.weight && `<b>${r.weight} kg</b>`].filter(Boolean).join(', ') || 'that'}. Please add the ${r.missing.join(', ')}.`; return; }
    let q;
    try { q = await api('/hub/transport/quote', { method: 'POST', body: { section: r.section, segment: store.state.accountType === 'business' ? 'b2b' : 'b2c', from_place: r.from, to_place: r.to, weight: r.weight, pieces: 1, pickup_at: r.pickup_at || undefined } }); }
    catch (x) { wait.innerHTML = esc(x.message); return; }
    if (!q.options || !q.options.length) { wait.innerHTML = 'No partner can carry that on this route. Try another weight or date.'; return; }
    const top = q.options.slice(0, 3);
    wait.innerHTML = `<div class="cbk-sum"><span>${icon('pin', 13)}${esc(r.from_label)}</span><span>${icon('chevron', 12)}</span><span>${icon('map', 13)}${esc(r.to_label)}</span><span>${icon('scale', 13)}${r.weight} kg</span><span>${icon('clock', 13)}${r.pickup_at ? esc(dateTime(r.pickup_at)) : 'Now'}</span></div>Here are the best ${top.length}:<div class="cb-opts">${top.map((o, i) => `<button type="button" class="cb-opt" data-o="${o.id}">${i === 0 ? '<em>Best</em>' : ''}<b>${esc(o.provider)}</b><small>${esc(o.title)} · ${o.eta_pickup_min || o.pickup_within_min ? `${o.eta_pickup_min || o.pickup_within_min} min to pickup` : `by ${esc(date(o.eta))}`}</small><span translate="no">${esc(money(o.total))}</span></button>`).join('')}</div>`;
    wait.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', async () => {
      const o = top.find((x) => x.id === b.dataset.o);
      const run = (x) => api('/hub/transport/book', { method: 'POST', body: { ...x, quote_id: q.quote_id, option_id: o.id, pay_mode: 'prepaid', contact: { name: p.name || 'Customer', phone: p.mobile }, pickup_address: r.from, drop_address: r.to } });
      const res = await walletCheckout({ amount: o.total, run, info: { title: o.title, payee: o.provider, sub: `${r.from_label} → ${r.to_label}`, icon: 'truck', tone: 'green', baseLabel: 'Fare', refLabel: 'Booking reference' } });
      if (res) { say(`${icon('check', 14)} Booked with <b>${esc(o.provider)}</b> for <b translate="no">${esc(money(res.amount))}</b>. <a class="link" href="#/my/orders/${esc(res.id)}">Track it here</a>.`); refresh(); }
    }));
  }
  view.querySelector('#cbF').addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; handle(t); });
  chat.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) handle(SAMPLES[Number(b.dataset.s)]); });
  // Voice: the browser's own speech recognition, in the chosen language.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = view.querySelector('#cbMic');
  if (!SR) { mic.disabled = true; mic.title = 'Voice needs Chrome or Edge'; return; }
  mic.addEventListener('click', () => {
    const rec = new SR(); rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1;
    mic.classList.add('on'); input.placeholder = 'Listening…';
    rec.onresult = (e) => { input.placeholder = 'Type a message'; handle(e.results[0][0].transcript); };
    rec.onerror = (e) => { toast(e.error === 'not-allowed' ? 'Allow the microphone to speak your booking.' : 'Could not hear that. Try again.', true); };
    rec.onend = () => { mic.classList.remove('on'); input.placeholder = 'e.g. 20 kg from Koramangala to Whitefield now'; };
    rec.start();
  });
}

// ---- 9 + 1. on the order page: receiver choices and never-stranded ---------------------------------
export async function receiverCard(el, x, redo) {
  if (!el) return;
  let d; try { d = await api('/hub/orders/receiver', { query: { id: x.id } }); } catch (e) { el.remove(); return; }
  const pr = d.prefs || {}; const req = (d.requests || []).find((q) => q.status === 'pending');
  const chosen = [pr.slot && `${icon('calendar', 14)}Slot: ${esc(date(pr.slot.date))}, ${esc(pr.slot.slot)}`, pr.leave && (pr.leave.type === 'locker' ? `${icon('box2', 14)}Leave at ${esc(pr.leave.locker)}` : `${icon('user', 14)}Leave with ${esc(pr.leave.name)}, ${esc(pr.leave.flat)}`), pr.note && pr.note.text && `${icon('chat', 14)}"${esc(pr.note.text)}"`].filter(Boolean);
  el.innerHTML = `<div class="od-steps__h"><h2 class="notop">Receiver's choices</h2>${d.linked ? '<span class="badge badge-green">Link shared</span>' : ''}</div>
    <p class="muted small notop">Send the receiver a link. They can pick a delivery slot, leave it with a neighbour or a locker, or add instructions, whichever partner delivers. An address change comes to you to approve.</p>
    ${chosen.length ? `<ul class="rx-list">${chosen.map((c) => `<li>${c}</li>`).join('')}</ul>` : ''}
    ${req ? `<div class="rx-req"><div><b>New address requested</b><small>${esc(req.address)}</small><small>Re-route fee <b translate="no">${esc(money(req.fee))}</b>, paid by you if you approve.</small></div><div class="row"><button class="btn btn-outline btn-sm" type="button" data-rx="no">Decline</button><button class="btn btn-primary btn-sm" type="button" data-rx="yes">Approve and pay</button></div></div>` : ''}
    <button class="btn btn-outline btn-sm" type="button" data-rx="link">${icon('share', 15)}${d.linked ? 'Share the link again' : 'Send the receiver a link'}</button>`;
  el.onclick = async (e) => {
    const b = e.target.closest('[data-rx]'); if (!b) return;
    if (b.dataset.rx === 'link') {
      const r = await api('/hub/orders/receiver-link', { method: 'POST', body: { id: x.id } }); const url = location.origin + r.url;
      if (navigator.share) { try { await navigator.share({ title: 'Choose how you receive your delivery', url }); redo(); return; } catch (er) { if (er.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(url); toast('Link copied. Send it to the receiver.'); } catch (er) { toast(url); }
      redo(); return;
    }
    if (b.dataset.rx === 'no') { await api('/hub/orders/receiver-request', { method: 'POST', body: { id: x.id, request_id: req.id, approve: false } }); toast('Request declined'); redo(); return; }
    const r = await payWithApproval({ path: '/hub/orders/receiver-request', body: { id: x.id, request_id: req.id, approve: true }, total: req.fee, info: { title: 'Re-route to the new address', payee: x.provider, icon: 'map', tone: 'blue', baseLabel: 'Re-route fee' } });
    if (r) { toast('Re-routed to the new address'); redo(); }
  };
}
// A partner cancelled: what happened, and the choice when only a dearer partner is free.
export function strandedHtml(x) {
  const rb = (x.rebooked || []).slice(-1)[0];
  if (x.stranded) return `<section class="card st-card st-card--ask"><span class="st-ico">${icon('alert', 20)}</span><div class="grow"><b>${esc(x.stranded.from)} ${esc(x.stranded.why)}</b><small><b>${esc(x.stranded.offer.provider)}</b> can take it now for <b translate="no">${esc(money(x.stranded.extra))}</b> more. Or cancel for a full refund. You decide; we never charge the difference without asking.</small></div><div class="row"><button class="btn btn-outline btn-sm" type="button" data-st="cancel">Cancel and refund</button><button class="btn btn-primary btn-sm" type="button" data-st="ok">Pay ${esc(money(x.stranded.extra))} more</button></div></section>`;
  if (rb) return `<section class="card st-card"><span class="st-ico st-ico--ok">${icon('shield', 20)}</span><div class="grow"><b>Never stranded: ${esc(rb.to)} took over</b><small>${esc(rb.from)} ${esc(rb.why)}, so we booked ${esc(rb.to)} straight away at the same price or less${rb.saved ? `, and refunded the ${esc(money(rb.saved))} difference` : ''}. Nothing for you to do.</small></div></section>`;
  return '';
}
export function wireStranded(view, x, redo) {
  view.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.st === 'cancel') { await api('/hub/orders/stranded', { method: 'POST', body: { id: x.id, choice: 'cancel' } }); toast('Cancelled and refunded'); refresh(); redo(); return; }
    const r = await payWithApproval({ path: '/hub/orders/stranded', body: { id: x.id, choice: 'accept' }, total: x.stranded.extra, info: { title: `Backup partner · ${x.stranded.offer.provider}`, payee: x.stranded.offer.provider, icon: 'shield', tone: 'blue', baseLabel: 'Difference' } });
    if (r) { toast(`${r.provider} is on the way`); refresh(); redo(); }
  }));
}
