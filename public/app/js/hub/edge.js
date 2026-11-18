// Arrival cab-share, split-pay groups, weight proof, address check, return pooling and travel policy,
// plus the order-page cards for weight proof and address confidence.
import { api, esc, money, toast, withBusy, dateTime, date } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { payWithApproval } from './wallet-checkout.js';

const head = (ic, tone, title, intro, right = '') => `<div class="page-head ph-hero"><div class="row head-t">${tile(ic, tone).value}<div><h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div><div class="row">${right}</div></div>`;
const stat = (label, value) => `<div class="card stat"><span class="stat__label">${esc(label)}</span><span class="stat__value" translate="no">${esc(value)}</span></div>`;
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const left = (iso) => { const ms = Date.parse(iso) - Date.now(); if (ms <= 0) return 'time is up'; const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h ? `${h} h ${m} min left` : `${m} min left`; };
const full = (path) => location.origin + path;
async function copy(textValue) { try { await navigator.clipboard.writeText(textValue); toast('Link copied'); } catch { toast('Copy did not work. Long-press the link to copy it.', true); } }
const wa = (phone, msg) => `https://wa.me/91${encodeURIComponent(phone || '')}?text=${encodeURIComponent(msg)}`;

// ---- 1. arrival cab-share --------------------------------------------------------------------------
export async function renderCabShare(view) {
  let d = await api('/hub/cabshare'); let q = null; let seats = 1;
  const draw = () => {
    view.innerHTML = `${head('ride', 'amber', 'Arrival cab-share', 'Getting off a train or flight? Share one cab with other travellers going your way and split the fare.')}
      <div class="dash dash--even"><div class="dash__main">
        <section class="card eg-form"><h2 class="notop">Where are you arriving?</h2>
          <form id="csF" class="form-grid" novalidate>
            <label class="field full">Your arrival<select class="select" name="arrival_id"><option value="">Type the station or airport instead</option>${d.arrivals.map((a) => `<option value="${esc(a.id)}">${esc(a.title)} · ${esc(a.provider)}${a.sub ? ` · ${esc(a.sub)}` : ''}</option>`).join('')}</select></label>
            <label class="field" id="csHub">Station or airport<input class="input" name="hub" placeholder="e.g. Bengaluru railway station"></label>
            <label class="field">Going to (area)<input class="input" name="drop" placeholder="e.g. Koramangala" required></label>
            <div class="field full"><span>Seats</span><div class="seg" id="csSeats">${[1, 2, 3].map((n) => `<button type="button" aria-pressed="${n === seats}" data-seats="${n}">${n} ${n === 1 ? 'seat' : 'seats'}</button>`).join('')}</div></div>
            <p class="form-error full" id="csErr"></p>
            <div class="full"><button class="btn btn-primary" type="submit">${icon('users', 16)}Find co-riders</button></div>
          </form></section>
        <div id="csQ"></div>
        <section class="card"><h2 class="notop">Your shared rides</h2>${d.rides.length ? `<ul class="eg-list">${d.rides.map(rideRow).join('')}</ul>` : '<p class="muted notop">No shared rides yet.</p>'}</section>
      </div><aside class="dash__side"><section class="card eg-how"><b>How it works</b><ol><li>We look for people on the same arrival heading near your area.</li><li>You pay the solo fare now, as a hold.</li><li>When riders match, the unused part comes back to your wallet within a minute.</li><li>Nobody to share with? You ride alone at the solo fare, nothing extra.</li></ol></section>
        <section class="card eg-how"><b>Safety</b><ul class="eg-ticks"><li>${icon('shield', 14)}Verified UT Log travellers only</li><li>${icon('phone', 14)}Numbers stay hidden</li><li>${icon('key', 14)}Ride OTP and live trip sharing</li></ul></section></aside></div>`;
    const f = view.querySelector('#csF'); const hubBox = view.querySelector('#csHub');
    const sync = () => { hubBox.hidden = !!f.arrival_id.value; }; sync();
    if (d.arrivals[0]) { f.arrival_id.value = d.arrivals[0].id; sync(); }
    f.arrival_id.addEventListener('change', sync);
    view.querySelector('#csSeats').onclick = (e) => { const b = e.target.closest('[data-seats]'); if (!b) return; seats = Number(b.dataset.seats); view.querySelectorAll('#csSeats button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); };
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const err = view.querySelector('#csErr'); err.textContent = '';
      try { q = await api('/hub/cabshare/quote', { method: 'POST', body: { arrival_id: f.arrival_id.value, hub: f.hub.value, drop: f.drop.value, seats } }); showQuote(); } catch (x) { err.textContent = x.message; }
    });
    if (q) showQuote();
  };
  const rideRow = (c) => `<li class="eg-ride eg-ride--${c.status.toLowerCase()}">${tile('ride', c.status === 'MATCHED' ? 'green' : 'amber').value}<div class="grow"><b>${esc(c.hub)} → ${esc(c.drop)}</b>
      <small>${c.status === 'MATCHING' ? `${icon('clock', 12)}Matching riders… you hold ${esc(money(c.held))}` : c.status === 'MATCHED' ? `${c.riders} riders · you paid ${esc(money(c.paid))} · ${esc(money(c.refund))} back to wallet` : `No co-riders · solo fare ${esc(money(c.paid))}`}</small>
      ${c.cab ? `<div class="eg-cab"><span>${icon('pin', 13)}${esc(c.cab.meet)}</span><span>${icon('user', 13)}${esc(c.cab.driver)} · ${esc(c.cab.model)} · ${esc(c.cab.vehicle)}</span><span>${icon('key', 13)}OTP <b>${c.cab.otp}</b></span></div>` : ''}</div>
      <span class="badge ${c.status === 'MATCHED' ? 'badge-green' : c.status === 'MATCHING' ? 'badge-amber' : 'badge-gray'}">${c.status === 'MATCHED' ? 'Matched' : c.status === 'MATCHING' ? 'Matching' : 'Solo'}</span></li>`;
  const showQuote = () => {
    const el = view.querySelector('#csQ');
    el.innerHTML = `<section class="card eg-quote"><div class="eg-vs"><div class="eg-vs__a"><small>Cab alone</small><b translate="no">${esc(money(q.solo))}</b><span>${q.km} km</span></div><span class="eg-vs__arrow">${icon('chevron', 18)}</span>
        <div class="eg-vs__b"><small>Shared, about</small><b translate="no">${esc(money(q.est_share))}</b><span>${q.save ? `You save about ${esc(money(q.save))}` : 'Nobody to share with yet'}</span></div></div>
      <div class="eg-mates">${q.others ? `<p class="notop"><b>${q.others} other traveller${q.others > 1 ? 's' : ''}</b> on this arrival ${q.others > 1 ? 'are' : 'is'} heading your way:</p><ul>${q.mates.map((m) => `<li><span class="in-av in-av--${m.name.length % 5}">${esc(initials(m.name))}</span><div><b>${esc(m.name)}</b><small>${esc(m.to)} · ${m.bags} bag${m.bags > 1 ? 's' : ''}</small></div></li>`).join('')}</ul>` : '<p class="notop muted">No one else is heading your way yet. If someone joins before you land, you share; otherwise you ride alone at the solo fare.</p>'}</div>
      <p class="muted small">You pay ${esc(money(q.solo))} now as a hold. When riders match, ${q.save ? `about ${esc(money(q.save))}` : 'the unused part'} comes back to your wallet.</p>
      <button class="btn btn-primary" id="csGo" type="button">${icon('check', 16)}Join for ${esc(money(q.solo))} hold</button></section>`;
    const go = el.querySelector('#csGo');
    go.addEventListener('click', () => withBusy(go, async () => {
      const r = await payWithApproval({ path: '/hub/cabshare/join', body: { quote_id: q.id }, total: q.solo, info: { title: `Shared cab · ${q.hub} → ${q.drop}`, payee: 'UT Log Cab-share', icon: 'ride', tone: 'amber' } });
      if (!r) return; toast('Joined. We are matching riders.'); q = null; d = await api('/hub/cabshare'); draw();
    }));
  };
  draw();
  const timer = setInterval(async () => { if (!d.rides.some((c) => c.status === 'MATCHING') || !document.body.contains(view)) return; d = await api('/hub/cabshare'); if (!d.rides.some((c) => c.status === 'MATCHING')) { toast('Riders matched. Your refund is in the wallet.'); draw(); } }, 8000);
  return () => clearInterval(timer);
}

// ---- 2. split-pay groups ---------------------------------------------------------------------------
export async function renderSplitPay(view) {
  let d = await api('/hub/splitpay');
  const rows = [{ name: '', phone: '' }, { name: '', phone: '' }];
  const draw = () => {
    view.innerHTML = `${head('team', 'violet', 'Split-pay group booking', 'Book for the group, pay only your share. Everyone else pays by link, and it books once all have paid.')}
      <div class="dash dash--even"><div class="dash__main">
        <section class="card"><h2 class="notop">New group booking</h2><form id="spF" class="form-grid" novalidate>
          <label class="field">What is it<input class="input" name="title" placeholder="e.g. Goa trip flights" value="Goa trip flights"></label>
          <label class="field">Type<select class="select" name="kind">${[['flight', 'Flights'], ['train', 'Train tickets'], ['bus', 'Bus tickets'], ['stay', 'Stay'], ['ride', 'Cab'], ['other', 'Something else']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <label class="field">Total amount (₹)<input class="input" name="total" inputmode="numeric" value="18000"></label>
          <label class="field">Everyone pays within<select class="select" name="hours"><option value="2">2 hours</option><option value="6" selected>6 hours</option><option value="24">24 hours</option><option value="48">48 hours</option></select></label>
          <div class="field full"><span>Who is coming (you are added)</span><div id="spRows" class="eg-rows"></div><button class="btn btn-ghost btn-sm" type="button" id="spAdd">${icon('plus', 15)}Add a person</button></div>
          <div class="full eg-split" id="spPrev"></div>
          <p class="form-error full" id="spErr"></p>
          <div class="full"><button class="btn btn-primary" type="submit" id="spGo">${icon('rupee', 16)}Pay my share and send links</button></div></form></section>
        ${d.data.length ? d.data.map(groupCard).join('') : ''}
      </div><aside class="dash__side"><section class="card eg-how"><b>Why it is safe</b><ol><li>Nobody fronts money for anyone.</li><li>The booking is made only after everyone has paid.</li><li>If someone does not pay in time, everyone who paid is refunded in full.</li></ol></section></aside></div>`;
    const f = view.querySelector('#spF');
    const paint = () => {
      view.querySelector('#spRows').innerHTML = rows.map((r, n) => `<div class="eg-row"><span class="in-av in-av--${n % 5}">${esc(initials(r.name) || n + 1)}</span><input class="input" data-n="${n}" data-k="name" placeholder="Name" value="${esc(r.name)}"><input class="input" data-n="${n}" data-k="phone" inputmode="numeric" maxlength="10" placeholder="Mobile" value="${esc(r.phone)}"><button class="btn btn-ghost btn-sm" type="button" data-rm="${n}" aria-label="Remove">${icon('x', 15)}</button></div>`).join('');
      prev();
    };
    const prev = () => { const total = Math.round(Number(f.total.value) || 0); const n = rows.length + 1; const each = Math.floor(total / n); const mine = total - each * rows.length;
      view.querySelector('#spPrev').innerHTML = total ? `<div><small>Split ${n} ways</small><b translate="no">${esc(money(each))} each</b></div><div><small>You pay now</small><b translate="no">${esc(money(mine))}</b></div><div><small>Others pay by link</small><b translate="no">${esc(money(each * rows.length))}</b></div>` : ''; };
    paint();
    f.addEventListener('input', (e) => { const t = e.target; if (t.dataset.k) { rows[t.dataset.n][t.dataset.k] = t.value; return prev(); } prev(); });
    view.querySelector('#spAdd').onclick = () => { if (rows.length >= 11) return; rows.push({ name: '', phone: '' }); paint(); };
    view.querySelector('#spRows').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b && rows.length > 1) { rows.splice(Number(b.dataset.rm), 1); paint(); } };
    f.addEventListener('submit', (e) => { e.preventDefault(); const go = view.querySelector('#spGo'); withBusy(go, async () => {
      const err = view.querySelector('#spErr'); err.textContent = '';
      const body = { title: f.title.value, kind: f.kind.value, total: f.total.value, hours: f.hours.value, members: rows };
      try {
        const chk = await api('/hub/splitpay/create', { method: 'POST', body: { ...body, dry_run: true } });
        const r = await payWithApproval({ path: '/hub/splitpay/create', body, total: chk.amount, info: { title: `Your share · ${body.title}`, payee: 'Split-pay group', icon: 'team', tone: 'violet' } });
        if (!r) return; toast('Your share is paid. Now share the links.'); rows.splice(0, rows.length, { name: '', phone: '' }); d = await api('/hub/splitpay'); draw();
      } catch (x) { err.textContent = x.message; }
    }); });
    view.querySelectorAll('[data-g]').forEach((card) => card.addEventListener('click', (e) => groupAction(e, d.data.find((g) => g.id === card.dataset.g))));
  };
  const groupCard = (g) => {
    const paid = g.members.filter((m) => m.paid_at).length; const pct = Math.round((paid / g.members.length) * 100);
    const tone = g.status === 'CONFIRMED' ? 'green' : g.status === 'COLLECTING' ? 'amber' : 'gray';
    return `<section class="card eg-group" data-g="${esc(g.id)}"><div class="eg-group__h"><div><h2 class="notop">${esc(g.title)}</h2><small class="muted">${esc(money(g.total))} · ${g.members.length} people · ${g.status === 'COLLECTING' ? esc(left(g.deadline)) : esc(dateTime(g.at))}</small></div>
      <span class="badge badge-${tone}">${{ COLLECTING: 'Collecting', CONFIRMED: 'Booked', EXPIRED: 'Refunded', CANCELLED: 'Cancelled' }[g.status]}</span></div>
      <div class="eg-prog"><i style="width:${pct}%"></i></div><small class="muted">${paid} of ${g.members.length} paid</small>
      <ul class="eg-members">${g.members.map((m, n) => `<li class="${m.paid_at ? 'is-paid' : ''}"><span class="in-av in-av--${n % 5}">${esc(initials(m.name))}</span><div class="grow"><b>${esc(m.name)}${m.organiser ? ' (you)' : ''}</b><small>${esc(money(m.share))} · ${m.paid_at ? `paid${m.via ? ` by ${esc(m.via)}` : ''}` : 'waiting'}${m.refunded ? ' · refunded' : ''}</small></div>
        ${!m.paid_at && m.link && g.status === 'COLLECTING' ? `<button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(full(m.link))}">${icon('copy', 14)}Link</button><a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${esc(wa(m.phone, `Hi ${m.name}, your share for ${g.title} is ₹${m.share}. Pay here: ${full(m.link)}`))}">${icon('whatsapp', 14)}Send</a>` : m.paid_at ? icon('check', 16) : ''}</li>`).join('')}</ul>
      ${g.status === 'COLLECTING' ? `<div class="row"><button class="btn btn-outline btn-sm" type="button" data-act="sim">${icon('sparkle', 14)}Next person pays (demo)</button><button class="btn btn-ghost btn-sm" type="button" data-act="remind">${icon('bell', 14)}Remind all</button><span class="spacer"></span><button class="btn btn-ghost btn-sm" type="button" data-act="cancel">Cancel and refund</button></div>` : g.record_id ? `<a class="link" href="#/my/orders/${esc(g.record_id)}">View booking</a>` : ''}</section>`;
  };
  const groupAction = async (e, g) => {
    const c = e.target.closest('[data-copy]'); if (c) return copy(c.dataset.copy);
    const b = e.target.closest('[data-act]'); if (!b) return;
    try {
      if (b.dataset.act === 'sim') { const r = await api('/hub/splitpay/simulate', { method: 'POST', body: { id: g.id } }); toast(r.status === 'CONFIRMED' ? 'Everyone paid. It is booked.' : 'Payment received'); }
      if (b.dataset.act === 'remind') { const r = await api('/hub/splitpay/remind', { method: 'POST', body: { id: g.id } }); toast(`Reminder sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'} on WhatsApp (demo)`); return; }
      if (b.dataset.act === 'cancel') { await api('/hub/splitpay/cancel', { method: 'POST', body: { id: g.id } }); toast('Cancelled. Your share is back in the wallet.'); }
      d = await api('/hub/splitpay'); draw();
    } catch (x) { toast(x.message, true); }
  };
  draw();
}

// ---- 3. weight proof -------------------------------------------------------------------------------
// The pickup photo: the parcel on the rider's scale, with the reading, time and place stamped on it.
export function scalePhoto(p, small) {
  return `<svg class="eg-photo${small ? ' eg-photo--sm' : ''}" viewBox="0 0 240 170" role="img" aria-label="Pickup photo: ${p.kg} kilograms on the scale">
    <defs><linearGradient id="egBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a46"/><stop offset="1" stop-color="#1c2624"/></linearGradient><linearGradient id="egBox" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a868"/><stop offset="1" stop-color="#a87436"/></linearGradient></defs>
    <rect width="240" height="170" fill="url(#egBg)"/><rect x="0" y="118" width="240" height="52" fill="#2b3633"/>
    <rect x="58" y="112" width="124" height="16" rx="4" fill="#cfd6d4"/><rect x="88" y="128" width="64" height="20" rx="3" fill="#9aa5a2"/>
    <rect x="98" y="131" width="44" height="13" rx="2" fill="#0d1a12"/><text x="120" y="141.5" font-family="monospace" font-size="10" fill="#5dff9a" text-anchor="middle">${esc(p.kg.toFixed(2))} kg</text>
    <polygon points="72,62 168,62 176,112 64,112" fill="url(#egBox)"/><polygon points="72,62 120,48 168,62 120,74" fill="#e8bd83"/><rect x="113" y="54" width="14" height="58" fill="#c79a5c" opacity=".7"/>
    <rect x="80" y="80" width="34" height="20" rx="2" fill="#fff" opacity=".85"/><rect x="84" y="85" width="22" height="2" fill="#333"/><rect x="84" y="90" width="16" height="2" fill="#333"/>
    <rect x="0" y="0" width="240" height="18" fill="rgba(0,0,0,.45)"/><text x="6" y="12.5" font-family="monospace" font-size="8.5" fill="#fff">${esc(dateTime(p.at))} · ${esc(p.gps)}</text>
    <text x="234" y="164" font-family="monospace" font-size="7.5" fill="#cfe" text-anchor="end">seal ${esc(p.seal)}</text></svg>`;
}
export async function renderWeightProof(view) {
  let d = await api('/hub/weightproof');
  const draw = () => {
    view.innerHTML = `${head('scale', 'green', 'Weight proof', 'Every parcel is photographed on a calibrated scale at pickup. If a courier charges more weight later, the photo answers it.')}
      <div class="grid grid-4 eg-kpis">${stat('Orders with proof', d.data.length)}${stat('Disputes rejected', d.won)}${stat('Disputes accepted', d.lost)}${stat('Extra charges stopped', money(d.saved))}</div>
      <div class="dash dash--even"><div class="dash__main"><section class="card"><h2 class="notop">Pickup photos</h2><div class="eg-proofs">${d.data.slice(0, 12).map((r) => `<article class="eg-proof">${scalePhoto(r.proof, true)}<div class="eg-proof__t"><b>${esc(r.title)}</b><small>${esc(r.provider)} · <a class="link" href="#/my/orders/${esc(r.id)}">${esc(r.id)}</a></small>
          <dl><div><dt>On scale</dt><dd>${r.proof.kg} kg</dd></div><div><dt>Declared</dt><dd>${r.proof.declared} kg</dd></div><div><dt>Box</dt><dd>${r.proof.dims.join(' × ')} cm</dd></div></dl>
          <button class="btn btn-outline btn-sm" type="button" data-dispute="${esc(r.id)}">${icon('alert', 14)}Courier disputes it (demo)</button></div></article>`).join('') || '<p class="muted">No parcels yet.</p>'}</div></section></div>
        <aside class="dash__side"><section class="card"><h2 class="notop">Disputes</h2>${d.disputes.length ? `<ul class="eg-list eg-list--tight">${d.disputes.map((x) => `<li>${tile(x.outcome === 'REJECTED' ? 'shield' : 'scale', x.outcome === 'REJECTED' ? 'green' : 'amber').value}<div class="grow"><b>${esc(x.carrier)} said ${x.claimed} kg</b><small>${esc(x.reason)}</small></div><span class="badge ${x.outcome === 'REJECTED' ? 'badge-green' : 'badge-amber'}">${x.outcome === 'REJECTED' ? `Saved ${esc(money(x.extra))}` : 'Accepted'}</span></li>`).join('')}</ul>` : '<p class="muted notop">No weight disputes. When a courier re-weighs a parcel and asks for more, it shows here with our answer.</p>'}</section>
          <section class="card eg-how"><b>What the rider captures</b><ul class="eg-ticks"><li>${icon('scale', 14)}Reading on a scale calibrated in the last 30 days</li><li>${icon('pin', 14)}Time and GPS stamped on the photo</li><li>${icon('key', 14)}A tamper seal, so the photo cannot be swapped</li></ul></section></aside></div>`;
    view.onclick = async (e) => { const b = e.target.closest('[data-dispute]'); if (!b) return; await withBusy(b, async () => { const r = await api('/hub/weightproof/dispute', { method: 'POST', body: { id: b.dataset.dispute } }); toast(r.outcome === 'REJECTED' ? `Rejected with the pickup photo. ${money(r.extra)} saved.` : 'Their reading is within 5%, so it stands.', r.outcome !== 'REJECTED'); d = await api('/hub/weightproof'); draw(); }); };
  };
  draw();
}
export async function weightProofCard(el, x) {
  if (!el) return;
  try {
    const d = await api('/hub/weightproof', { query: { id: x.id } }); const p = d.proof; const last = d.disputes[0];
    el.innerHTML = `<h2 class="notop">${icon('scale', 16)} Weight proof</h2><div class="eg-wp">${scalePhoto(p, true)}<dl class="od-kv"><div><dt>On the scale</dt><dd>${p.kg} kg</dd></div><div><dt>You declared</dt><dd>${p.declared} kg</dd></div><div><dt>Weighed by</dt><dd>${esc(p.rider)}, ${esc(dateTime(p.at))}</dd></div><div><dt>Seal</dt><dd class="mono">${esc(p.seal)}</dd></div></dl></div>
      ${last ? `<p class="small notop ${last.outcome === 'REJECTED' ? 'eg-good' : 'muted'}">${esc(last.reason)}</p>` : '<p class="muted small notop">If the courier charges more weight later, this photo answers it for you.</p>'}`;
  } catch { el.remove(); }
}

// ---- 4. address check ------------------------------------------------------------------------------
const ring = (score, grade) => `<div class="eg-ring eg-ring--${grade}" style="--p:${score}"><b>${score}</b><small>${grade === 'strong' ? 'Strong' : grade === 'okay' ? 'Okay' : 'Weak'}</small></div>`;
const checksHtml = (r) => `<ul class="eg-checks">${r.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}">${icon(c.ok ? 'check' : 'x', 14)}<div><b>${esc(c.label)}</b>${c.ok ? '' : `<small>${esc(c.tip)}</small>`}</div></li>`).join('')}</ul>`;
export async function renderAddressCheck(view) {
  let list = await api('/hub/address'); let last = null;
  const draw = () => {
    view.innerHTML = `${head('pin', 'blue', 'Address check', 'Score an address before you ship. Weak ones go to the buyer on WhatsApp to confirm, so fewer parcels come back.')}
      <div class="dash dash--even"><div class="dash__main"><section class="card"><form id="adF" class="form-grid" novalidate>
        <label class="field full">Delivery address<textarea class="input" name="address" rows="3" placeholder="Flat, building, street, area, city">${esc(last ? last.address : 'House 12, Indiranagar, Bengaluru 560038')}</textarea></label>
        <label class="field">Buyer's mobile<input class="input" name="phone" inputmode="numeric" maxlength="10" placeholder="10 digits" value="${esc(last ? last.phone || '' : '')}"></label>
        <label class="field">Buyer's name<input class="input" name="name" placeholder="Optional" value="${esc(last ? last.name || '' : '')}"></label>
        <p class="form-error full" id="adErr"></p>
        <div class="full row"><button class="btn btn-primary" type="submit">${icon('search', 16)}Check address</button></div></form></section>
        ${last ? `<section class="card eg-score">${ring(last.score, last.grade)}<div class="grow"><h2 class="notop">${last.grade === 'strong' ? 'Good to ship' : last.grade === 'okay' ? 'Probably fine, could be better' : 'Likely to fail delivery'}</h2>
          <p class="muted small notop">Return-to-seller risk: <b>${esc(last.rto_risk)}</b> · ${last.pin_fail_rate}% of deliveries to this pin code needed a second attempt</p>${checksHtml(last)}
          ${last.grade !== 'strong' ? `<button class="btn btn-primary btn-sm" id="adAsk" type="button">${icon('whatsapp', 15)}Ask the buyer to confirm</button>` : ''}</div></section>` : ''}
        <section class="card"><h2 class="notop">Sent to buyers</h2>${list.data.length ? `<ul class="eg-list">${list.data.map((c) => `<li>${tile('pin', c.status === 'SENT' ? 'amber' : 'green').value}<div class="grow"><b>${esc(c.name)} · ${esc(c.address)}</b><small>${c.status === 'SENT' ? 'Waiting for the buyer' : `${c.status === 'UPDATED' ? 'Buyer corrected it' : 'Buyer confirmed'}${c.landmark ? ` · landmark: ${esc(c.landmark)}` : ''}`} · score ${c.before}${c.after != null ? ` → <b>${c.after}</b>` : ''}</small></div>
          ${c.status === 'SENT' ? `<button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(full(c.link))}">${icon('copy', 14)}Link</button><button class="btn btn-outline btn-sm" type="button" data-sim="${esc(c.id)}">Buyer replies (demo)</button>` : `<span class="badge badge-green">${c.status === 'UPDATED' ? 'Updated' : 'Confirmed'}</span>`}</li>`).join('')}</ul>` : '<p class="muted notop">Nothing sent yet.</p>'}</section></div>
      <aside class="dash__side"><section class="card eg-how"><b>What we check</b><ul class="eg-ticks"><li>${icon('home', 14)}House or flat number</li><li>${icon('route', 14)}Street or area</li><li>${icon('pin', 14)}A landmark</li><li>${icon('map', 14)}Pin code and its delivery history</li><li>${icon('phone', 14)}A reachable phone</li></ul></section></aside></div>`;
    const f = view.querySelector('#adF');
    f.addEventListener('submit', async (e) => { e.preventDefault(); try { last = { ...(await api('/hub/address/check', { method: 'POST', body: { address: f.address.value, phone: f.phone.value } })), phone: f.phone.value, name: f.name.value }; draw(); } catch (x) { view.querySelector('#adErr').textContent = x.message; } });
    const ask = view.querySelector('#adAsk');
    if (ask) ask.onclick = () => withBusy(ask, async () => { try { const c = await api('/hub/address/confirm', { method: 'POST', body: { address: last.address, phone: last.phone, name: last.name } }); window.open(wa(c.phone, `Hi ${c.name}, please confirm your delivery address so your parcel reaches you: ${full(c.link)}`), '_blank', 'noopener'); list = await api('/hub/address'); draw(); toast('Link created. Send it on WhatsApp.'); } catch (x) { toast(x.message, true); } });
    view.onclick = async (e) => {
      const c = e.target.closest('[data-copy]'); if (c) return copy(c.dataset.copy);
      const s = e.target.closest('[data-sim]'); if (s) { await api('/hub/address/simulate', { method: 'POST', body: { id: s.dataset.sim } }); toast('The buyer confirmed and added a landmark'); list = await api('/hub/address'); draw(); }
    };
  };
  draw();
}
export async function addressCard(el, x) {
  if (!el || !x.drop_address) { if (el) el.remove(); return; }
  try {
    const r = await api('/hub/address/check', { method: 'POST', body: { address: x.drop_address, phone: x.receiver && x.receiver.phone } });
    el.innerHTML = `<h2 class="notop">${icon('pin', 16)} Address confidence</h2><div class="eg-score eg-score--sm">${ring(r.score, r.grade)}<div class="grow"><small class="muted">Return risk <b>${esc(r.rto_risk)}</b></small>${checksHtml({ checks: r.checks.filter((c) => !c.ok).slice(0, 2) })}${r.grade === 'strong' ? '<small class="eg-good">The address looks complete.</small>' : '<a class="link small" href="#/address-check">Ask the buyer to confirm</a>'}</div></div>`;
  } catch { el.remove(); }
}

// ---- 5. return pooling -----------------------------------------------------------------------------
export async function renderReturnPool(view) {
  let d = await api('/hub/returnpool');
  const draw = () => {
    const can = d.groups.reduce((t, g) => t + g.saving, 0);
    view.innerHTML = `${head('returnbox', 'coral', 'Return pooling', 'Returns from the same area come back together in one pickup, not one trip each.', `<button class="btn btn-outline" id="rpSim" type="button">${icon('plus', 15)}Add sample returns</button>`)}
      <div class="grid grid-4 eg-kpis">${stat('Returns waiting', d.waiting)}${stat('Areas', d.groups.length)}${stat('Can save now', money(can))}${stat('Saved so far', money(d.saved_total))}</div>
      <div class="dash dash--even"><div class="dash__main">${d.groups.length ? d.groups.map((g) => `<section class="card eg-pool${g.urgent ? ' is-urgent' : ''}"><div class="eg-group__h"><div><h2 class="notop">${esc(g.area)} <small class="muted">${esc(g.pin)}</small></h2><small class="muted">${g.count} return${g.count > 1 ? 's' : ''} · oldest ${esc(date(g.oldest))} · ship by ${esc(date(g.ship_by))}</small></div>${g.urgent ? '<span class="badge badge-amber">Ship today</span>' : g.saving ? `<span class="badge badge-green">Save ${esc(money(g.saving))}</span>` : ''}</div>
          <ul class="eg-items">${g.items.map((it) => `<li>${icon('returnbox', 14)}<span class="grow">${esc(it.item)} <small class="muted">· ${esc(it.buyer)} · ${it.kg} kg</small></span><small class="mono muted">${esc(it.id)}</small></li>`).join('')}</ul>
          <div class="eg-bars"><div><small>One pickup each</small><i style="--w:100%"></i><b translate="no">${esc(money(g.separate))}</b></div><div class="is-pool"><small>Pooled</small><i style="--w:${Math.round((g.pooled / g.separate) * 100)}%"></i><b translate="no">${esc(money(g.pooled))}</b></div></div>
          <button class="btn btn-primary btn-sm" type="button" data-ship="${esc(g.area)}" data-amt="${g.pooled}">${icon('truck', 15)}Pick up together · ${esc(money(g.pooled))}</button></section>`).join('') : `<section class="card ph-empty">${tile('returnbox', 'coral').value}<h2>No returns waiting</h2><p class="muted">When buyers return items, they wait here by area and come back together.</p></section>`}
        ${d.shipped.length ? `<section class="card"><h2 class="notop">Pooled pickups</h2><ul class="eg-list eg-list--tight">${d.shipped.map((s) => `<li>${tile('truck', 'green').value}<div class="grow"><b>${esc(s.area)} · ${s.count} returns</b><small>${esc(dateTime(s.at))} · paid ${esc(money(s.amount))} instead of ${esc(money(s.separate))}</small></div><a class="link small" href="#/my/orders/${esc(s.record_id)}">Track</a></li>`).join('')}</ul></section>` : ''}</div>
      <aside class="dash__side"><section class="card"><h2 class="notop">Automatic pooling</h2><form id="rpF" class="form-grid">
        <label class="eg-toggle full"><span class="switch"><input type="checkbox" name="enabled" ${d.settings.enabled ? 'checked' : ''}><i></i></span><span>Pool returns by area</span></label>
        <label class="field full">Weekly pickup day<select class="select" name="day">${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((x) => `<option ${x === d.settings.day ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field full">Never hold a return longer than<select class="select" name="max_wait">${[2, 3, 4, 5, 7].map((n) => `<option value="${n}" ${n === d.settings.max_wait ? 'selected' : ''}>${n} days</option>`).join('')}</select></label>
        <div class="full"><button class="btn btn-outline btn-sm" type="submit">Save</button></div></form>
        <p class="muted small">Buyers are refunded as soon as the courier collects the return, so pooling never delays their money.</p></section></aside></div>`;
    view.querySelector('#rpF').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; d = await api('/hub/returnpool/settings', { method: 'POST', body: { enabled: f.enabled.checked, day: f.day.value, max_wait: f.max_wait.value } }); toast('Saved'); draw(); });
    view.querySelector('#rpSim').onclick = async () => { d = await api('/hub/returnpool/simulate', { method: 'POST', body: {} }); toast('3 sample returns added'); draw(); };
    view.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
      const r = await payWithApproval({ path: '/hub/returnpool/ship', body: { area: b.dataset.ship }, total: Number(b.dataset.amt), info: { title: `Pooled returns · ${b.dataset.ship}`, payee: 'Delhivery', icon: 'returnbox', tone: 'coral' } });
      if (!r) return; toast(`Pickup booked. You saved ${money(r.saving)}.`); d = await api('/hub/returnpool'); draw();
    })));
  };
  draw();
}

// ---- 7. travel policy ------------------------------------------------------------------------------
const CLASSES = [['SL', 'Sleeper'], ['3E', '3A Economy'], ['3A', 'AC 3 tier'], ['2A', 'AC 2 tier'], ['1A', 'AC first'], ['CC', 'Chair car'], ['EC', 'Executive chair'], ['2S', 'Second sitting']];
export async function renderPolicy(view) {
  let p = await api('/hub/policy');
  const draw = () => {
    const pend = p.requests.filter((r) => r.status === 'PENDING');
    view.innerHTML = `${head('briefcase', 'violet', 'Travel policy', 'Set the rules once. Bookings outside them wait for an approver before anyone pays.')}
      <div class="grid grid-4 eg-kpis">${stat('Policy', p.enabled ? 'On' : 'Off')}${stat('Waiting for you', pend.length)}${stat('Approved', p.requests.filter((r) => r.status === 'APPROVED').length)}${stat('Spend stopped', money(p.saved))}</div>
      <div class="dash dash--even"><div class="dash__main">
        ${pend.length ? `<section class="card eg-pend"><h2 class="notop">Waiting for approval</h2><ul class="eg-list">${pend.map((r) => `<li>${tile({ flight: 'plane', train: 'train', bus: 'bus', hotel: 'hotel', stay: 'bed', ride: 'ride' }[r.kind] || 'briefcase', 'violet').value}<div class="grow"><b>${esc(r.title)} · ${esc(money(r.amount))}</b><small>${esc(r.provider)}${r.sub ? ` · ${esc(r.sub)}` : ''} · asked by ${esc(r.by)}, ${esc(dateTime(r.at))}</small>
          <ul class="eg-why">${r.violations.map((v) => `<li>${icon('alert', 13)}${esc(v)}</li>`).join('')}</ul><small>Reason: “${esc(r.reason)}”</small></div><div class="eg-dec"><button class="btn btn-primary btn-sm" type="button" data-dec="${esc(r.id)}" data-ok="1">${icon('check', 14)}Approve</button><button class="btn btn-outline btn-sm" type="button" data-dec="${esc(r.id)}">Decline</button></div></li>`).join('')}</ul></section>` : ''}
        <section class="card"><h2 class="notop">Rules</h2><form id="tpF" class="form-grid" novalidate>
          <label class="eg-toggle full"><span class="switch"><input type="checkbox" name="enabled" ${p.enabled ? 'checked' : ''}><i></i></span><span><b>Apply the policy to every booking</b></span></label>
          <label class="field">Flight cabin<select class="select" name="flight_cabin"><option value="economy" ${p.flight_cabin === 'economy' ? 'selected' : ''}>Economy only</option><option value="any" ${p.flight_cabin === 'any' ? 'selected' : ''}>Any cabin</option></select></label>
          <label class="field">Flight up to (₹)<input class="input" name="flight_max" inputmode="numeric" value="${p.flight_max}"></label>
          <label class="field">Book flights at least (days ahead)<input class="input" name="advance_days" inputmode="numeric" value="${p.advance_days}"></label>
          <label class="field">Stay up to (₹ a night)<input class="input" name="hotel_night_max" inputmode="numeric" value="${p.hotel_night_max}"></label>
          <label class="field">Bus up to (₹)<input class="input" name="bus_max" inputmode="numeric" value="${p.bus_max}"></label>
          <label class="field">Cab or auto up to (₹)<input class="input" name="ride_max" inputmode="numeric" value="${p.ride_max}"></label>
          <div class="field full"><span>Train classes allowed</span><div class="eg-chips">${CLASSES.map(([k, l]) => `<label class="eg-chip"><input type="checkbox" name="tc" value="${k}" ${p.train_classes.includes(k) ? 'checked' : ''}><span>${k} · ${l}</span></label>`).join('')}</div></div>
          <label class="field">Approver<input class="input" name="approver" value="${esc(p.approver)}"></label>
          <div class="full"><button class="btn btn-primary" type="submit">Save rules</button></div></form></section>
        <section class="card"><h2 class="notop">History</h2>${p.requests.filter((r) => r.status !== 'PENDING').length ? `<ul class="eg-list eg-list--tight">${p.requests.filter((r) => r.status !== 'PENDING').map((r) => `<li><div class="grow"><b>${esc(r.title)} · ${esc(money(r.amount))}</b><small>${esc(r.by)} · ${esc(dateTime(r.decided_at))}${r.used ? ' · booked' : ''}</small></div><span class="badge ${r.status === 'APPROVED' ? 'badge-green' : 'badge-red'}">${r.status === 'APPROVED' ? 'Approved' : 'Declined'}</span></li>`).join('')}</ul>` : '<p class="muted notop">No decisions yet.</p>'}</section></div>
      <aside class="dash__side"><section class="card eg-how"><b>How it works</b><ol><li>Someone books a flight, train, stay or cab.</li><li>If it breaks a rule, the booking stops before payment and they say why it is needed.</li><li>${esc(p.approver)} approves or declines here.</li><li>Approved: they book the same trip again within 24 hours and it goes through.</li></ol></section></aside></div>`;
    view.querySelector('#tpF').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target;
      p = { ...p, ...(await api('/hub/policy', { method: 'POST', body: { enabled: f.enabled.checked, flight_cabin: f.flight_cabin.value, flight_max: f.flight_max.value, advance_days: f.advance_days.value, hotel_night_max: f.hotel_night_max.value, bus_max: f.bus_max.value, ride_max: f.ride_max.value, approver: f.approver.value, train_classes: [...f.querySelectorAll('[name=tc]:checked')].map((c) => c.value) } })) }; toast(p.enabled ? 'Policy is on' : 'Saved. The policy is off.'); draw(); });
    view.onclick = async (e) => { const b = e.target.closest('[data-dec]'); if (!b) return; await api('/hub/policy/decide', { method: 'POST', body: { id: b.dataset.dec, approve: !!b.dataset.ok } }); toast(b.dataset.ok ? 'Approved. They can book it now.' : 'Declined'); p = await api('/hub/policy'); draw(); };
  };
  draw();
}
// Shown inside the booking dialog when a booking breaks the policy.
export function policyBlock(el, pol, onSent) {
  el.innerHTML = `<div class="eg-block"><b>${icon('briefcase', 15)}Outside your travel policy</b><ul class="eg-why">${pol.violations.map((v) => `<li>${icon('alert', 13)}${esc(v)}</li>`).join('')}</ul>
    ${pol.pending ? '<p class="small notop">Already sent for approval. Once approved, confirm again and it goes through.</p>' : `<label class="field">Why is this needed?<input class="input" id="egWhy" placeholder="e.g. Client meeting at 9 am"></label><button class="btn btn-primary btn-sm" type="button" id="egAsk">Ask for approval</button>`}
    <a class="link small" href="#/travel-policy">See the policy</a></div>`;
  // Following a link to the policy closes the booking dialog first.
  el.addEventListener('click', (e) => { if (!e.target.closest('a[href^="#/travel-policy"]')) return; const box = el.closest('dialog, .modal'); const x = box && box.querySelector('[data-close]'); if (x) x.click(); });
  const b = el.querySelector('#egAsk');
  if (b) b.onclick = () => withBusy(b, async () => { try { await api('/hub/policy/request', { method: 'POST', body: { offer: pol.offer, violations: pol.violations, reason: el.querySelector('#egWhy').value } }); el.innerHTML = `<div class="eg-block eg-block--ok"><b>${icon('check', 15)}Sent for approval</b><p class="small notop">Once it is approved in Travel policy, confirm this booking again and it goes through.</p><a class="link small" href="#/travel-policy">Open Travel policy</a></div>`; if (onSent) onSent(); } catch (x) { toast(x.message, true); } });
}
