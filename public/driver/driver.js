// UT Partner app: sign-up, go online, take a trip step by step, earnings and payouts.
const token = (() => { try { return localStorage.getItem('ut_token'); } catch (e) { return null; } })();
const $ = (s, r = document) => r.querySelector(s);
const screen = $('#screen');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const fmtTime = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const fmtDay = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
let state = null; let meta = null; let poll = null; let offerTimer = null; let shown = null; let map = null;

async function api(path, body) {
  const res = await fetch(`/v1${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { signIn(); throw new Error('Please sign in.'); }
  if (!res.ok) throw new Error(data.message || 'Something went wrong. Try again.');
  return data;
}
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
// Browsers only allow vibration after the person has touched the page.
const vibrate = (p) => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) { /* not supported */ } };
const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn.isConnected) btn.disabled = false; } };

// ---- sign in -------------------------------------------------------------------------
function signIn() {
  stopPoll(); $('#tabs').hidden = true;
  screen.innerHTML = `<section class="hero-d"><div class="hero-d__art" aria-hidden="true">${ART}</div><h1>Drive and deliver with UT Log</h1><p>Take bike, 3-wheeler and truck trips near you. See what you earn before you accept. Get paid to UPI.</p>
    <a class="dbtn dbtn--primary dbtn--block" href="/login/?next=${encodeURIComponent('/driver/')}">Sign in with your mobile number</a><p class="fine">New here? The same step creates your account.</p></section>`;
}
const ART = '<svg viewBox="0 0 220 120"><path d="M10 104h200" stroke="#c8d8d2" stroke-width="2"/><rect x="40" y="52" width="86" height="40" rx="6" fill="#0e7c66"/><path d="M126 62h30l18 18v12h-48z" fill="#16a085"/><circle cx="66" cy="96" r="10" fill="#0f2925"/><circle cx="152" cy="96" r="10" fill="#0f2925"/><circle cx="66" cy="96" r="4" fill="#fff"/><circle cx="152" cy="96" r="4" fill="#fff"/><path d="M136 66h14l10 12h-24z" fill="#e2f3ef"/><rect x="54" y="62" width="30" height="20" rx="3" fill="#ffb38f"/><path d="M60 72h18" stroke="#0f2925" stroke-width="2"/><g fill="#57c39f"><circle cx="186" cy="40" r="10"/><circle cx="196" cy="50" r="8"/></g><path d="M190 56v48" stroke="#2f4a3f" stroke-width="4"/></svg>';

// ---- sign-up -------------------------------------------------------------------------
async function signUp(suggest) {
  $('#tabs').hidden = true;
  meta = meta || await fetch('/v1/public/booking/meta').then((r) => r.json());
  const v = { name: suggest.name || '', phone: /^[6-9]\d{9}$/.test(suggest.phone || '') ? suggest.phone : '', city: 'bengaluru', vehicle: 'bike', vehicle_no: '', dl: '', upi: '', docs: {}, consent: false };
  let step = 0;
  const STEPS = ['You', 'Vehicle', 'Documents', 'Payout'];
  const draw = () => {
    const bar = `<ol class="steps">${STEPS.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'on' : ''}"><span>${i < step ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>`;
    const body = [
      () => `<h1>Become a UT partner</h1><p class="sub">Takes about 3 minutes. Keep your driving licence and vehicle RC handy.</p>
        <label class="f">Full name, as on your licence<input name="name" value="${esc(v.name)}" autocomplete="name"></label>
        <label class="f">Mobile number<input name="phone" value="${esc(v.phone)}" inputmode="numeric" maxlength="10" autocomplete="tel-national"></label>
        <label class="f">City you drive in<select name="city">${meta.cities.map((c) => `<option value="${c.key}" ${c.key === v.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`,
      () => `<h1>Your vehicle</h1><p class="sub">You get trips that fit this vehicle.</p>
        <div class="vgrid" role="radiogroup" aria-label="Vehicle type">${meta.vehicles.slice(0, 6).map((x) => `<label class="vcard"><input type="radio" name="vehicle" value="${x.key}" ${x.key === v.vehicle ? 'checked' : ''}><span><b>${esc(x.name)}</b><small>Up to ${x.kg >= 1000 ? `${x.kg / 1000} t` : `${x.kg} kg`}</small></span></label>`).join('')}</div>
        <label class="f">Vehicle number, as on the RC<input name="vehicle_no" value="${esc(v.vehicle_no)}" placeholder="KA 05 MN 4821" autocapitalize="characters"></label>`,
      () => `<h1>Documents</h1><p class="sub">We check these before your first trip. Photos stay private.</p>
        <label class="f">Driving licence number<input name="dl" value="${esc(v.dl)}" placeholder="KA0520190012345" autocapitalize="characters" maxlength="18"></label>
        <div class="docs">${[['dl', 'Licence photo', 'Front side'], ['rc', 'RC photo', 'Vehicle registration'], ['selfie', 'Selfie', 'To match your licence']].map(([k, t, s]) => `<label class="doc ${v.docs[k] ? 'ok' : ''}"><input type="file" accept="image/*" ${k === 'selfie' ? 'capture="user"' : 'capture="environment"'} data-doc="${k}"><span class="doc__ico">${v.docs[k] ? '✓' : '+'}</span><b>${t}</b><small>${v.docs[k] ? 'Added' : s}</small></label>`).join('')}</div>
        <label class="chk"><input type="checkbox" name="consent" ${v.consent ? 'checked' : ''}> I agree to a background and licence check.</label>`,
      () => `<h1>Where should we pay you?</h1><p class="sub">Earnings go to your UPI ID. You can add it later too.</p>
        <label class="f">UPI ID<input name="upi" value="${esc(v.upi)}" placeholder="name@okbank" autocomplete="off"></label>
        <div class="note">You keep ${100 - 18}% of every fare. UT Log's 18% covers bookings, payments and insurance. Payouts are instant to UPI.</div>`,
    ][step]();
    screen.innerHTML = `<section class="card-d onb">${bar}<form id="onb" novalidate>${body}<p class="err" id="err"></p>
      <div class="row-d">${step ? '<button class="dbtn" type="button" id="back">Back</button>' : '<a class="dbtn" href="/">Not now</a>'}<button class="dbtn dbtn--primary dbtn--grow" type="submit">${step === 3 ? 'Submit' : 'Continue'}</button></div></form></section>`;
    const f = $('#onb');
    f.addEventListener('change', (e) => {
      const d = e.target.dataset.doc;
      if (d && e.target.files[0]) { v.docs[d] = true; $('#err').textContent = ''; const card = e.target.closest('.doc'); card.classList.add('ok'); card.querySelector('.doc__ico').textContent = '✓'; card.querySelector('small').textContent = 'Added'; }
    });
    const back = $('#back'); if (back) back.onclick = () => { read(f); step--; draw(); };
    f.onsubmit = async (e) => {
      e.preventDefault(); read(f); const err = $('#err'); err.textContent = '';
      const problem = check(step);
      if (problem) { err.textContent = problem; return; }
      if (step < 3) { step++; draw(); return; }
      await busy(f.querySelector('[type=submit]'), async () => { state = await api('/partner/signup', v); screen.innerHTML = `<section class="card-d done-d"><div class="big-ok">✓</div><h1>You're verified, ${esc(state.profile.name.split(' ')[0])}</h1><p class="sub">Go online to start getting trips in ${esc(state.profile.city_name)}.</p><a class="dbtn dbtn--primary dbtn--block" href="#home" id="start">Start earning</a></section>`; vibrate(60); $('#start').onclick = (ev) => { ev.preventDefault(); route(); }; });
    };
  };
  const read = (f) => { ['name', 'phone', 'city', 'vehicle_no', 'dl', 'upi'].forEach((k) => { if (f[k]) v[k] = f[k].value.trim(); }); const r = f.querySelector('[name=vehicle]:checked'); if (r) v.vehicle = r.value; if (f.consent) v.consent = f.consent.checked; };
  const check = (s) => {
    if (s === 0) { if (v.name.length < 2) return 'Enter your full name.'; if (!/^[6-9]\d{9}$/.test(v.phone)) return 'Enter a 10-digit mobile number.'; }
    if (s === 1 && !/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{3,4}$/i.test(v.vehicle_no)) return 'Enter the vehicle number as on the RC, like KA 05 MN 4821.';
    if (s === 2) { if (!/^[A-Z]{2}\d{13}$/i.test(v.dl.replace(/[\s-]/g, ''))) return 'Enter the 15-character licence number, like KA0520190012345.'; if (!v.docs.dl || !v.docs.rc || !v.docs.selfie) return 'Add the licence photo, RC photo and a selfie.'; if (!v.consent) return 'Agree to the background check to continue.'; }
    if (s === 3 && v.upi && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(v.upi)) return 'Enter a UPI ID like name@bank, or leave it blank.';
    return '';
  };
  draw();
}

// ---- trips (home) ----------------------------------------------------------------------
function stopPoll() { clearInterval(poll); poll = null; clearInterval(offerTimer); offerTimer = null; }
function topState() { const t = $('#topState'); t.hidden = !state; if (state) { t.textContent = state.active ? 'On a trip' : state.online ? 'Online' : 'Offline'; t.className = `dtop__state ${state.active ? 'trip' : state.online ? 'on' : ''}`; } }
function home() {
  stopPoll(); topState();
  if (state.active) return trip();
  const s = state.stats; const on = state.online;
  screen.innerHTML = `<section class="online ${on ? 'is-on' : ''}"><button class="toggle" id="tog" type="button" aria-pressed="${on}"><span class="toggle__knob"></span><b>${on ? 'You are online' : 'Go online'}</b><small>${on ? 'Looking for trips near you…' : `Get ${esc(state.profile.vehicle_name)} trips in ${esc(state.profile.city_name)}`}</small></button>${on ? '<div class="radar" aria-hidden="true"><i></i><i></i><i></i></div>' : ''}</section>
    <section class="kpis-d"><div><small>Today</small><b>${rupee(s.today)}</b><span>${s.trips_today} trip${s.trips_today === 1 ? '' : 's'}</span></div><div><small>This week</small><b>${rupee(s.week)}</b><span>${s.trips} in total</span></div><div><small>Rating</small><b>${s.rating.toFixed(1)} ★</b><span>${s.acceptance}% accepted</span></div></section>
    <section class="card-d tips"><h2>Earn more</h2><ul><li><b>Accept quickly.</b> Offers last 30 seconds and go to the next partner after that.</li><li><b>Peak hours</b> are 8–11 am and 5–9 pm, when most shops ship.</li><li><b>Always collect the OTP</b> at pickup and drop. It protects you and the customer.</li></ul></section>`;
  $('#tog').onclick = async (e) => busy(e.currentTarget, async () => { state = await api('/partner/online', { online: !state.online }); vibrate(30); home(); });
  if (on) { checkOffers(); poll = setInterval(checkOffers, 4000); }
}
async function checkOffers() {
  if ($('.offer')) return;
  try {
    const { offers } = await api('/partner/offers');
    const o = offers.find((x) => x.id !== shown);
    if (o && !$('.offer')) showOffer(o);
  } catch (e) { /* try again on the next tick */ }
}
function showOffer(o) {
  shown = o.id; vibrate([120, 80, 120]);
  const total = 30; let left = total;
  const host = $('#sheet');
  host.innerHTML = `<div class="sheet-bg"></div><section class="offer" role="dialog" aria-label="New trip offer">
    <div class="offer__top"><span class="tag-d ${o.kind === 'customer' ? 'tag-d--live' : ''}">${o.kind === 'customer' ? 'Customer booking' : 'Sample trip'}</span><span class="ring" style="--p:1"><b id="left">${total}</b></span></div>
    <p class="offer__earn">${rupee(o.earn)}<small>you earn${o.fare ? ` · fare ${rupee(o.fare)}` : ''}</small></p>
    <ol class="route-d"><li><i class="dot dot--a"></i><div><b>${esc(o.pickup.area)}</b><small>${o.to_pickup_min} min away · pickup</small></div></li><li><i class="dot dot--b"></i><div><b>${esc(o.drop.area)}</b><small>${o.km ? `${Number(o.km).toFixed(1)} km trip` : 'Drop'}</small></div></li></ol>
    <p class="offer__meta">${esc(o.vehicle_name)} · ${esc(o.load)}</p>
    <div class="row-d"><button class="dbtn" id="dec" type="button">Decline</button><button class="dbtn dbtn--primary dbtn--grow" id="acc" type="button">Accept trip</button></div></section>`;
  const ring = host.querySelector('.ring');
  const close = () => { clearInterval(offerTimer); offerTimer = null; host.innerHTML = ''; };
  offerTimer = setInterval(() => { left--; ring.style.setProperty('--p', left / total); host.querySelector('#left').textContent = left; if (left <= 0) { close(); api('/partner/decline', { id: o.id }).catch(() => {}); } }, 1000);
  host.querySelector('#dec').onclick = () => { close(); api('/partner/decline', { id: o.id }).then((s) => { state = s; }).catch(() => {}); };
  host.querySelector('#acc').onclick = (e) => busy(e.currentTarget, async () => { state = await api('/partner/accept', { id: o.id }); close(); vibrate(60); toast('Trip accepted. Head to the pickup.'); trip(); });
}

// ---- the active trip ---------------------------------------------------------------------
const navUrl = (pt, label) => (pt ? `https://www.google.com/maps/dir/?api=1&destination=${pt[0]},${pt[1]}&travelmode=driving` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`);
function trip() {
  stopPoll(); topState();
  const a = state.active;
  const toDrop = a.stage === 'to_drop';
  const stop = toDrop ? a.drop : a.pickup;
  const step = { to_pickup: 0, at_pickup: 1, to_drop: 2 }[a.stage];
  const action = { to_pickup: ['arrived', 'I have reached the pickup'], at_pickup: ['pickup', 'Start trip'], to_drop: ['deliver', 'Complete delivery'] }[a.stage];
  const needOtp = a.stage !== 'to_pickup';
  screen.innerHTML = `<section class="trip">
    <div class="trip__map" id="tmap"></div>
    <div class="card-d trip__card">
      <ol class="tsteps">${['Go to pickup', 'Collect goods', 'Deliver'].map((t, i) => `<li class="${i < step ? 'done' : i === step ? 'on' : ''}">${t}</li>`).join('')}</ol>
      <p class="trip__kind">${toDrop ? 'Drop' : 'Pickup'} · ${esc(a.kind === 'customer' ? `Customer booking via ${a.provider || 'UT Log'}` : 'Sample trip')}</p>
      <h1>${esc(stop.area)}</h1>
      <p class="trip__addr">${esc(stop.address || stop.area)}</p>
      ${stop.contact ? `<div class="contact"><div><b>${esc(stop.contact.name)}</b><small>${esc(stop.contact.phone)} · calls are masked</small></div><a class="dbtn dbtn--sm" href="tel:+910000000000" aria-label="Call ${esc(stop.contact.name)}">Call</a></div>` : ''}
      <a class="dbtn dbtn--block nav-btn" href="${esc(navUrl(stop.pt, `${stop.area} ${stop.city || ''}`))}" target="_blank" rel="noopener">Navigate in Google Maps</a>
      <form id="stepF" novalidate>
        ${needOtp ? `<label class="f otp">Ask the ${a.stage === 'at_pickup' ? 'sender' : 'receiver'} for the 4-digit OTP<input name="otp" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="••••"></label>${a.sample_otp ? `<p class="fine">Sandbox trip: the OTP is ${a.stage === 'at_pickup' ? a.sample_otp.pickup : a.sample_otp.delivery}.</p>` : ''}` : ''}
        <p class="err" id="err"></p>
        <button class="dbtn dbtn--primary dbtn--block dbtn--lg" type="submit">${action[1]}</button>
      </form>
      <div class="trip__foot"><span>${rupee(a.earn)} on completion</span><button class="sos-d" id="sosD" type="button">Safety</button>${a.stage !== 'to_drop' ? '<button class="linkd" id="rel" type="button">Can\'t do this trip</button>' : '<a class="linkd" href="/app/#/help">Need help?</a>'}</div>
    </div></section>`;
  drawMap(a);
  // Safety for partners: emergency number, 24-hour partner support, report a problem.
  $('#sosD').onclick = () => {
    const host = $('#sheet');
    host.innerHTML = `<div class="sheet-bg" data-x></div><section class="offer" role="dialog" aria-label="Safety"><h2>Safety</h2>
      <a class="dbtn dbtn--block sos-call" href="tel:112">Call 112 · emergency services</a>
      <a class="dbtn dbtn--block" href="tel:+918000000000">Call UT partner support (24 hours)</a>
      <button class="dbtn dbtn--block" type="button" id="rep">Report an unsafe pickup or customer</button>
      <p class="fine">Trip ${esc(a.id)} · support can see this trip while you are on it.</p>
      <button class="dbtn dbtn--block" type="button" data-x>Close</button></section>`;
    host.onclick = (e) => {
      if (e.target.closest('[data-x]')) host.innerHTML = '';
      if (e.target.closest('#rep')) { host.innerHTML = ''; toast('Reported. Partner support will call you within 5 minutes (sandbox).'); }
    };
  };
  const f = $('#stepF');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]'); const err = $('#err');
    err.textContent = ''; btn.disabled = true;
    try {
      const r = await api('/partner/trip', { action: action[0], otp: f.otp ? f.otp.value.trim() : '' });
      state = r; vibrate(40);
      if (r.completed) celebrate(r.completed); else trip();
    } catch (x) { err.textContent = x.message; btn.disabled = false; if (f.otp) f.otp.select(); vibrate([40, 40, 40]); }
  };
  const rel = $('#rel');
  if (rel) rel.onclick = (e) => { if (!confirm('Hand this trip back? It goes to the next partner and counts against your acceptance rate.')) return; busy(e.currentTarget, async () => { state = await api('/partner/trip', { action: 'release' }); toast('Trip handed back.'); home(); }); };
}
function drawMap(a) {
  if (map) { map.remove(); map = null; }
  const el = $('#tmap'); const L = window.L;
  const pts = [a.pickup.pt, a.drop.pt].filter(Boolean);
  if (!L || !pts.length) { el.classList.add('trip__map--none'); el.innerHTML = '<span>Map preview unavailable. Use Navigate.</span>'; return; }
  map = L.map(el, { zoomControl: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  if (a.pickup.pt) L.circleMarker(a.pickup.pt, { radius: 9, color: '#fff', weight: 3, fillColor: '#0e7c66', fillOpacity: 1 }).addTo(map).bindTooltip('Pickup');
  if (a.drop.pt) L.circleMarker(a.drop.pt, { radius: 9, color: '#fff', weight: 3, fillColor: '#eda100', fillOpacity: 1 }).addTo(map).bindTooltip('Drop');
  if (pts.length === 2) { L.polyline(pts, { color: '#0e7c66', weight: 4, opacity: 0.6, dashArray: '6 8' }).addTo(map); map.fitBounds(pts, { padding: [36, 36] }); } else map.setView(pts[0], 14);
}
function celebrate(c) {
  topState();
  screen.innerHTML = `<section class="card-d done-d"><div class="big-ok">✓</div><h1>Delivered</h1><p class="earned">+${rupee(c.earn)}</p><p class="sub">${esc(c.from)} → ${esc(c.to)}. Added to your balance.</p><a class="dbtn dbtn--primary dbtn--block" href="#home" id="again">Find the next trip</a><a class="dbtn dbtn--block" href="#earnings">See earnings</a></section>`;
  vibrate([60, 40, 120]);
  // Already on #home, so the link would not fire a route change: go straight back to Trips.
  $('#again').onclick = (e) => { e.preventDefault(); home(); };
}

// ---- earnings ------------------------------------------------------------------------------
async function earnings() {
  stopPoll(); topState();
  screen.innerHTML = '<div class="skel"></div>';
  const e = await api('/partner/earnings');
  const max = Math.max(1, ...e.days.map((d) => d.earn));
  screen.innerHTML = `<section class="card-d earn-hero"><small>This week</small><b>${rupee(e.week)}</b><div class="bars" role="img" aria-label="Earnings for the last 7 days">${e.days.map((d) => `<div class="bar"><i style="height:${Math.max(4, (d.earn / max) * 100)}%" title="${rupee(d.earn)}"></i><span>${new Date(d.day).toLocaleDateString('en-IN', { weekday: 'narrow' })}</span></div>`).join('')}</div></section>
    <section class="card-d payout"><div><small>Ready to pay out</small><b>${rupee(e.balance)}</b><span>${e.upi ? `To ${esc(e.upi)}` : 'Add a UPI ID in Account'}</span></div><button class="dbtn dbtn--primary" id="pay" type="button" ${e.balance >= 1 && e.upi ? '' : 'disabled'}>Pay out now</button></section>
    <section class="card-d"><h2>Trips</h2>${e.trips.length ? `<ul class="list-d">${e.trips.map((t) => `<li><div><b>${esc(t.from)} → ${esc(t.to)}</b><small>${fmtDay(t.at)}, ${fmtTime(t.at)}${t.km ? ` · ${Number(t.km).toFixed(1)} km` : ''}${t.kind === 'sample' ? ' · sample' : ''}</small></div><b>${rupee(t.earn)}</b></li>`).join('')}</ul>` : '<p class="sub">No trips yet. Go online to get your first one.</p>'}</section>
    ${e.payouts.length ? `<section class="card-d"><h2>Payouts</h2><ul class="list-d">${e.payouts.map((p) => `<li><div><b>${esc(p.upi)}</b><small>${fmtDay(p.at)}, ${fmtTime(p.at)} · ${esc(p.status)}</small></div><b>${rupee(p.amount)}</b></li>`).join('')}</ul></section>` : ''}
    <p class="fine center">You keep ${Math.round((1 - e.commission) * 100)}% of each fare.</p>`;
  const pay = $('#pay');
  pay.onclick = () => busy(pay, async () => { const r = await api('/partner/payout', {}); state = r; toast(`${rupee(r.payout.amount)} sent to ${r.payout.upi}`); earnings(); });
}

// ---- account -------------------------------------------------------------------------------
function account() {
  stopPoll(); topState();
  const p = state.profile;
  screen.innerHTML = `<section class="card-d me"><span class="av">${esc(p.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span><div><b>${esc(p.name)}</b><small>Partner since ${fmtDay(p.joined_at)} · ${state.stats.rating.toFixed(1)} ★</small></div><span class="tag-d tag-d--live">Verified</span></section>
    <section class="card-d"><h2>Vehicle</h2><dl class="dl"><dt>Type</dt><dd>${esc(p.vehicle_name)}</dd><dt>Number</dt><dd class="mono">${esc(p.vehicle_no)}</dd><dt>City</dt><dd>${esc(p.city_name)}</dd></dl></section>
    <section class="card-d"><h2>Documents</h2><ul class="list-d">${[['Driving licence', p.dl], ['Vehicle RC', 'Photo checked'], ['Selfie', 'Matched']].map(([t, s]) => `<li><div><b>${t}</b><small class="mono">${esc(s)}</small></div><span class="ok-d">✓ Verified</span></li>`).join('')}</ul></section>
    <section class="card-d"><h2>Payout</h2><form id="upiF" class="row-d" novalidate><label class="f grow">UPI ID<input name="upi" value="${esc(p.upi || '')}" placeholder="name@okbank"></label><button class="dbtn" type="submit">Save</button></form></section>
    <section class="card-d links-d"><a href="/app/#/help">Help and support</a><a href="/app/">Open the customer app</a><button type="button" id="out">Sign out</button></section>`;
  $('#upiF').onsubmit = (e) => { e.preventDefault(); busy(e.target.querySelector('button'), async () => { state = await api('/partner/profile', { upi: e.target.upi.value.trim() }); toast('UPI ID saved'); }); };
  $('#out').onclick = () => { try { localStorage.removeItem('ut_token'); } catch (x) { /* ignore */ } location.href = '/login/?next=%2Fdriver%2F'; };
}

// ---- router --------------------------------------------------------------------------------
async function route() {
  if (!token) return signIn();
  if (!state) {
    try { state = await api('/partner/me'); } catch (e) { if (e.message !== 'Please sign in.') screen.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    if (!state.profile) return signUp(state.suggest || {});
  }
  if (!state.profile) return signUp({});
  $('#tabs').hidden = false;
  const tab = (location.hash || '#home').slice(1).split('?')[0];
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab || (tab === 'trip' && a.dataset.tab === 'home')));
  if (map && tab !== 'home') { map.remove(); map = null; }
  try { if (tab === 'earnings') await earnings(); else if (tab === 'account') account(); else home(); } catch (e) { toast(e.message, true); }
  screen.focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => { if (state && state.profile && !state.active && location.hash === '#home') { api('/partner/me').then((s) => { state = s; route(); }).catch(() => route()); } else route(); });
route();
