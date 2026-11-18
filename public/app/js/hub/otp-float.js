// Floating OTP card: appears on every dashboard page when an active order needs an OTP
// (the pickup OTP while the driver is on the way, the delivery OTP as it arrives) and
// disappears on its own once the OTP is no longer needed. Corner card on desktop, bottom
// sheet on phones. Collapsing keeps a small pill; it never hides an OTP that is still needed.
import { api, esc, toast } from '../core.js';
import { icon } from './icons.js';
import { openTracking } from './tracking.js';

const POLL_MS = 15000;
const KEY = 'ut-otp-min';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const write = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } };
const VEH = { vehicle: 'bike', courier: 'parcel', logistics: 'truck', international: 'globe' };

export function installOtpFloat() {
  if (document.getElementById('otpFloat')) return;
  const el = document.createElement('aside');
  el.id = 'otpFloat'; el.className = 'otpf'; el.hidden = true;
  el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-label', 'OTP needed for an active order');
  document.body.appendChild(el);
  let list = []; let at = 0; let shown = '';

  const paint = () => {
    if (!list.length) {
      if (!el.hidden) { el.classList.add('otpf--out'); setTimeout(() => { if (!list.length) { el.hidden = true; el.classList.remove('otpf--out'); el.innerHTML = ''; } }, 260); }
      shown = ''; return;
    }
    at = Math.min(at, list.length - 1);
    const o = list[at];
    const min = read()[`${o.id}:${o.kind}`];
    const pick = o.kind === 'pickup';
    const sig = JSON.stringify([o.id, o.kind, o.otp, o.eta_min, o.label, min, at, list.length]);
    if (sig === shown && !el.hidden) return;
    const fresh = !shown || !shown.includes(`"${o.id}","${o.kind}"`);
    shown = sig;
    el.hidden = false;
    el.className = `otpf otpf--${pick ? 'pickup' : 'drop'} ${min ? 'otpf--min' : ''} ${fresh ? 'otpf--in' : ''}`;
    const digits = String(o.otp).split('').map((d) => `<b>${esc(d)}</b>`).join('');
    const when = o.eta_min != null && !pick ? (o.eta_min <= 1 ? 'Arriving now' : `Arriving in ${o.eta_min} min`) : o.status === 'ARRIVING' ? 'Driver is nearly at pickup' : 'Driver is on the way to pickup';
    if (min) {
      el.innerHTML = `<button class="otpf__pill" type="button" data-open aria-label="Show ${pick ? 'pickup' : 'delivery'} OTP"><span class="otpf__pulse"></span>${icon('shield', 15)}<span>${pick ? 'Pickup' : 'Delivery'} OTP</span><span class="otpf__pd">${digits}</span>${list.length > 1 ? `<em>+${list.length - 1}</em>` : ''}</button>`;
      return;
    }
    el.innerHTML = `<div class="otpf__card">
      <div class="otpf__h"><span class="otpf__tag"><span class="otpf__pulse"></span>${pick ? 'Pickup OTP needed' : 'Delivery OTP needed'}</span>
        ${list.length > 1 ? `<span class="otpf__nav"><button type="button" data-prev aria-label="Previous order">${icon('chevron', 14).replace('class="li"', 'class="li flip"')}</button><small>${at + 1} of ${list.length}</small><button type="button" data-next aria-label="Next order">${icon('chevron', 14)}</button></span>` : ''}
        <button class="otpf__x" type="button" data-min aria-label="Minimise">${icon('chevron', 16).replace('class="li"', 'class="li otpf__down"')}</button></div>
      <div class="otpf__otp" title="Copy OTP">${digits}<button type="button" class="otpf__copy" data-copy aria-label="Copy OTP">${icon('file', 15)}</button></div>
      <p class="otpf__say">Share it with <b>${esc(pick ? 'the driver at pickup' : o.share_with)}</b>${pick ? ' only once the parcel is loaded' : ' only after they receive it'}.</p>
      <div class="otpf__ord"><span class="otpf__ico">${icon(VEH[o.section] || 'truck', 18)}</span><div class="grow"><b>${esc(o.title)}</b><small>${esc(o.provider)}${o.from ? ` · ${esc(o.from)} → ${esc(o.to)}` : ''}</small></div></div>
      <div class="otpf__live">${icon('clock', 13)}<span>${esc(when)}</span></div>
      ${o.driver ? `<div class="otpf__drv"><span class="otpf__av">${esc(String(o.driver.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span><div class="grow"><b>${esc(o.driver.name)}</b><small>${esc(o.driver.vehicle_no || '')}${o.driver.rating ? ` · ★ ${esc(o.driver.rating)}` : ''}</small></div><button class="otpf__call" type="button" data-call aria-label="Call driver">${icon('phone', 16)}</button></div>` : ''}
      <div class="otpf__acts"><button class="btn btn-primary btn-sm" type="button" data-track>${icon('radar', 15)}Live tracking</button><a class="btn btn-outline btn-sm" href="#/my/orders/${esc(o.id)}">Order</a></div>
    </div>`;
  };

  el.addEventListener('click', async (e) => {
    const o = list[at]; if (!o) return;
    const k = `${o.id}:${o.kind}`;
    if (e.target.closest('[data-min]')) { const m = read(); m[k] = 1; write(m); paint(); return; }
    if (e.target.closest('[data-open]')) { const m = read(); delete m[k]; write(m); paint(); return; }
    if (e.target.closest('[data-next]')) { at = (at + 1) % list.length; paint(); return; }
    if (e.target.closest('[data-prev]')) { at = (at - 1 + list.length) % list.length; paint(); return; }
    if (e.target.closest('[data-track]')) { openTracking(o.id); return; }
    if (e.target.closest('[data-call]')) { toast(`Demo: calls go through a masked number, so ${o.driver.name} never sees yours.`); return; }
    if (e.target.closest('[data-copy], .otpf__otp')) { try { await navigator.clipboard.writeText(String(o.otp)); toast('OTP copied'); } catch (x) { toast(`OTP ${o.otp}`); } }
  });

  const load = async () => {
    if (document.hidden || !document.getElementById('view')) return;
    try {
      const r = await api('/hub/otp-orders');
      const before = list.map((x) => `${x.id}:${x.kind}`).join();
      list = r.data || [];
      // A new OTP opens the card again even if an older one was minimised.
      const m = read(); let changed = false;
      Object.keys(m).forEach((k) => { if (!list.some((x) => `${x.id}:${x.kind}` === k)) { delete m[k]; changed = true; } });
      if (changed) write(m);
      if (before !== list.map((x) => `${x.id}:${x.kind}`).join()) at = 0;
      paint();
    } catch (e) { /* signed out or offline: try again later */ }
  };
  load();
  setInterval(load, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  window.addEventListener('ut:refresh', load);
}
