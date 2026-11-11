// In-app live tracking, problem reports, ratings and printable receipts.
import { api, esc, money, moneyIn, store, toast, modal, withBusy, dateTime, date, formData } from '../core.js';
import { duo, scene } from './art.js';
import { refresh } from './ui.js';
import { createMap } from './maps.js';

const PATH = 'M28 122 C80 34 132 142 196 86 S296 26 334 44';

export function openTracking(id) {
  if (document.querySelector('.drawer-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = `<aside class="drawer drawer--wide" role="dialog" aria-modal="true" aria-label="Live tracking">
    <header class="drawer__h"><div><h2 class="notop">Live tracking</h2><small class="muted mono">${esc(id)}</small></div><button class="icon-btn" data-x aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></header>
    <div class="drawer__b">
      <div class="trk-map"><svg viewBox="0 0 360 160" role="img" aria-label="Route progress">
        <g class="trk-blocks">${[[14, 14, 70, 40], [100, 12, 60, 30], [176, 16, 44, 34], [244, 88, 90, 54], [150, 112, 72, 36], [46, 136, 76, 18]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>`).join('')}</g>
        <path class="trk-base" d="${PATH}"/><path class="trk-done" id="tDone" d="${PATH}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
        <circle class="trk-a" cx="28" cy="122" r="6"/><circle class="trk-b" cx="334" cy="44" r="6"/>
        <g id="tDot"><circle class="trk-pulse" r="11"/><circle class="trk-dot" r="6"/></g></svg></div>
      <div id="tBody"><div class="skeleton" style="height:180px"></div></div>
    </div></aside>`;
  document.getElementById('modalRoot').appendChild(wrap);
  const done = wrap.querySelector('#tDone'); const dot = wrap.querySelector('#tDot'); const body = wrap.querySelector('#tBody');
  const len = done.getTotalLength();
  let shown = 0; let goal = 0; let raf = 0; let timer = 0; let open = true;
  let map = null; let mover = null;
  // Business accounts get the real route on a map.
  async function showMap(t) {
    const host = wrap.querySelector('.trk-map');
    host.innerHTML = '<div class="map-host trk-real"></div>';
    map = await createMap(host.firstChild);
    map.line(t.from_pt, t.to_pt); map.marker(t.from_pt, 'pickup'); map.marker(t.to_pt, 'drop');
    map.fit([t.from_pt, t.to_pt]);
    mover = map.marker(t.from_pt, 'moving');
    setTimeout(() => map && map.resize(), 80);
  }
  const place = (p) => { const pt = done.getPointAtLength(len * p); dot.setAttribute('transform', `translate(${pt.x} ${pt.y})`); done.setAttribute('stroke-dashoffset', String(1 - p)); };
  const glide = () => { shown += (goal - shown) * 0.08; if (Math.abs(goal - shown) < 0.001) { shown = goal; place(shown); raf = 0; return; } place(shown); raf = requestAnimationFrame(glide); };
  place(0);
  async function load() {
    try {
      const r = await api('/hub/orders/track', { query: { id } });
      if (!open) return;
      const t = r.tracking;
      if (!t) { body.innerHTML = '<p class="muted">Tracking has ended for this booking.</p>'; return; }
      goal = t.progress;
      if (!map && store.state.accountType === 'business' && t.from_pt && t.to_pt) { cancelAnimationFrame(raf); raf = 0; try { await showMap(t); } catch (e) { map = null; } if (!open) return; }
      if (mover) mover.move([t.from_pt[0] + (t.to_pt[0] - t.from_pt[0]) * goal, t.from_pt[1] + (t.to_pt[1] - t.from_pt[1]) * goal]);
      else if (!raf) raf = requestAnimationFrame(glide);
      const mins = t.remaining_min;
      const eta = t.status === 'DELIVERED' ? 'Delivered' : mins < 90 ? `${mins} min away` : `By ${date(t.promised_by)}`;
      const otp = t.otp ? (t.otp.pickup ? ['Pickup OTP', t.otp.pickup] : ['Delivery OTP', t.otp.delivery]) : null;
      body.innerHTML = `<div class="trk-head"><div><b>${esc(t.label)}</b><small>${esc(r.provider)} · ${esc(r.sub)}</small></div><span class="trk-eta">${esc(eta)}</span></div>
        ${t.driver ? `<div class="trk-driver">${duo('user').value}<div><b>${esc(t.driver.name)}</b><small>${esc(t.driver.vehicle_no)} · Rated ${esc(t.driver.rating)}</small></div><span class="spacer"></span><button class="btn btn-outline btn-sm" id="dChat" type="button">Chat</button><button class="btn btn-outline btn-sm" id="dCall" type="button">Call</button></div>` : ''}
        ${otp ? `<div class="trk-otp"><small>${esc(otp[0])}</small><b class="mono" translate="no">${esc(otp[1])}</b><small>Share only when the rider is with you.</small></div>` : ''}
        <h2 class="mt">Timeline</h2><ol class="timeline">${t.timeline.map((e) => `<li><b>${esc(e.label)}</b><small class="muted block">${esc(dateTime(e.at))}</small></li>`).join('')}</ol>
        ${r.proof ? `<section class="pod"><h2 class="notop">Proof of delivery</h2><div class="pod__img">${scene('delivery').value}</div><dl class="break"><div><dt>Received by</dt><dd>${esc(r.proof.received_by)}</dd></div><div><dt>OTP</dt><dd>Verified</dd></div><div><dt>Delivered</dt><dd>${esc(dateTime(r.proof.at))}</dd></div></dl><svg class="sign" viewBox="0 0 200 50" role="img" aria-label="Receiver signature"><path d="M6 34c14-26 22-26 22-8 0 14 8 10 16-4 6-10 12-8 10 2-2 12 10 8 20-4s16-8 12 4c-2 8 10 4 20-2s14-2 28-2 30-6 58-8"/></svg><small class="muted">Sample proof in this demo.</small></section>` : ''}<button class="btn btn-outline btn-block" id="share" type="button">Copy tracking link</button><p class="muted small">Demo clock: journeys run faster than real time.</p>`;
      body.querySelector('#share').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}/track/?id=${t.id}`); toast('Tracking link copied'); } catch (e) { toast(`${location.origin}/track/?id=${t.id}`); } });
      const dChat = body.querySelector('#dChat'); if (dChat) dChat.addEventListener('click', () => driverChat(r));
      const dCall = body.querySelector('#dCall'); if (dCall) dCall.addEventListener('click', async () => { const c = await api('/hub/orders/call', { method: 'POST', body: { id } }); toast(`Connecting through private number ${c.masked} (demo)`); });
      if (t.status !== 'DELIVERED') timer = setTimeout(load, 4000);
    } catch (e) { if (open) body.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
  }
  const prev = document.activeElement;
  const close = () => { open = false; clearTimeout(timer); cancelAnimationFrame(raf); if (map) map.destroy(); wrap.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
  document.addEventListener('keydown', key);
  wrap.querySelector('[data-x]').focus();
  load();
}

function driverChat(r) {
  let chat = r.chat || [];
  modal({
    title: 'Chat with driver',
    body: '<div class="wa-phone__chat" id="c"></div><form class="wa-phone__in" id="f"><input class="input" id="m" placeholder="Type a message" aria-label="Message" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">Send</button></form><p class="muted small notop">Demo: replies are automated.</p>',
    onMount(el) {
      const box = el.querySelector('#c');
      const draw = () => { box.innerHTML = chat.map((m) => `<div class="bubble ${m.from === 'you' ? 'me' : ''}">${esc(m.text)}</div>`).join(''); box.scrollTop = box.scrollHeight; };
      draw();
      el.querySelector('#f').addEventListener('submit', async (e) => { e.preventDefault(); const i = el.querySelector('#m'); if (!i.value.trim()) return; try { const d = await api('/hub/orders/chat', { method: 'POST', body: { id: r.id, text: i.value } }); chat = d.chat; r.chat = chat; i.value = ''; draw(); } catch (x) { toast(x.message, true); } });
    },
  });
}

export function reschedule(r, done) {
  modal({
    title: 'Change travel date',
    body: '<label class="field">New date<input class="input" type="date" id="d"></label><p class="muted small notop">Flexible protection covers one free change.</p><p class="form-error" id="e"></p>',
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="y">Change date</button>',
    onMount: (el, close) => el.querySelector('#y').addEventListener('click', async () => { try { await api('/hub/orders/reschedule', { method: 'POST', body: { id: r.id, date: el.querySelector('#d').value } }); close(true); toast('Date changed'); done(); } catch (x) { el.querySelector('#e').textContent = x.message; } }),
  });
}

export function printTicket(r) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to open the ticket.', true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>E-ticket ${esc(r.pnr)}</title><style>body{font:14px/1.5 Inter,Segoe UI,sans-serif;color:#15211E;max-width:560px;margin:32px auto;padding:20px;border:1px solid #CDD5D2;border-radius:12px}h1{font-size:20px;margin:0}.p{font:700 26px monospace;letter-spacing:.14em;margin:12px 0}small{color:#66736F}.demo{padding:8px 10px;background:#FDF1DC;border-radius:6px}</style><h1>${esc(r.title)}</h1><small>${esc(r.provider)} · ${esc(r.sub || '')}</small><p class="demo">Demo ticket. Not valid for travel.</p><small>PNR</small><div class="p">${esc(r.pnr)}</div><p><b>Passenger:</b> ${esc(r.traveller || '')}<br><b>Seats:</b> ${esc((r.seats || []).join(', ') || 'Assigned at check-in')}<br><b>Add-ons:</b> ${esc((r.addons || []).join(', ') || 'None')}<br><b>Flexible protection:</b> ${r.flex ? 'Yes' : 'No'}</p><script>print()<\/script>`);
  w.document.close();
}

export function openClaim(rec, done) {
  modal({
    title: 'Report a problem',
    body: `<p class="muted notop">${esc(rec.title)} with ${esc(rec.provider)} · ${esc(rec.id)}</p>
      <form class="form-grid" id="clf" novalidate><label class="field full">What went wrong?<select class="select" name="type"><option value="damaged">Parcel damaged</option><option value="lost">Parcel lost</option><option value="delayed">Delivery delayed</option><option value="other">Something else</option></select></label>
      <label class="field full">Details<textarea class="input" name="note" rows="3" placeholder="What happened, and when?"></textarea></label></form>
      <p class="callout">${rec.declared ? `Insured for ${esc(money(rec.declared))}. Lost or damaged claims pay to your wallet.` : 'This booking has no insurance, so the provider reviews your claim.'}</p><p class="form-error" id="clErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="clGo">Submit</button>',
    onMount(el, close) {
      const go = el.querySelector('#clGo');
      go.addEventListener('click', () => withBusy(go, async () => {
        try { const r = await api('/hub/orders/claim', { method: 'POST', body: { id: rec.id, ...formData(el.querySelector('#clf')) } }); close(true); toast(r.claim.payout ? `Claim approved. ${money(r.claim.payout)} added to your wallet.` : 'Claim submitted for review'); refresh(); done(); }
        catch (e) { el.querySelector('#clErr').textContent = e.message; }
      }));
    },
  });
}

export function openRate(rec, done) {
  let stars = 0;
  modal({
    title: `Rate ${rec.provider}`,
    body: `<div class="rate-stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-s="${n}" aria-label="${n} star${n > 1 ? 's' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.500 3 6.100 6.700 1-4.900 4.700 1.200 6.700-6-3.200-6 3.200 1.200-6.700L2.300 9.600l6.700-1z"/></svg></button>`).join('')}</div>
      <label class="field">Review (optional)<textarea class="input" id="rv" rows="3"></textarea></label><p class="form-error" id="rtErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Later</button><button class="btn btn-primary" id="rtGo">Submit</button>',
    onMount(el, close) {
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; stars = Number(b.dataset.s); el.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', Number(x.dataset.s) <= stars)); });
      const go = el.querySelector('#rtGo');
      go.addEventListener('click', () => withBusy(go, async () => {
        try { await api('/hub/orders/rate', { method: 'POST', body: { id: rec.id, stars, review: el.querySelector('#rv').value } }); close(true); toast('Thanks for your rating'); done(); }
        catch (e) { el.querySelector('#rtErr').textContent = e.message; }
      }));
    },
  });
}

// A printable receipt. Provider invoices come from the provider once integrated.
export function printReceipt(r) {
  const p = store.state.profile || {};
  const inr = (n) => moneyIn(n, 'INR');
  const gross = r.gross || r.amount;
  const taxable = Math.round(gross / 1.18);
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to open the receipt.', true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Receipt ${esc(r.id)}</title><style>body{font:14px/1.5 Inter,Segoe UI,sans-serif;color:#15211E;max-width:640px;margin:40px auto;padding:0 20px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px 0;border-bottom:1px solid #E1E6E4}td:last-child{text-align:right}.t td{font-weight:700;border-bottom:0}small{color:#66736F}</style>
    <h1>UT Log booking receipt</h1><small>Demo document, not a tax invoice. ${esc(r.id)} · ${esc(dateTime(r.at))}</small>
    <p><b>Billed to:</b> ${esc(p.company || p.name || p.mobile || '')}${p.gstin ? `<br>GSTIN ${esc(p.gstin)}` : ''}</p>
    <p><b>Service by:</b> ${esc(r.provider)}<br>${esc(r.title)} · ${esc(r.sub || '')}</p>
    <table><tr><td>Taxable value</td><td>${inr(taxable)}</td></tr><tr><td>GST (18%, indicative)</td><td>${inr(gross - taxable)}</td></tr>${r.discount ? `<tr><td>Coupon ${esc(r.coupon)}</td><td>−${inr(r.discount)}</td></tr>` : ''}${r.points_used ? `<tr><td>Reward points</td><td>−${inr(r.points_used)}</td></tr>` : ''}<tr class="t"><td>${r.pay_mode === 'cod' ? 'To pay on delivery' : 'Paid from wallet'}</td><td>${inr(r.amount)}</td></tr></table>
    <small>UT Log connects you with the service provider and keeps this record.</small><script>print()<\/script>`);
  w.document.close();
}
