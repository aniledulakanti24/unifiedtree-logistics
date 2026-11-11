// Overview: the CRM-style dashboard. Numbers are compared with the period before.
import { api, esc, money, store, dateTime, date } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { bars, hbars, statusPill, SECTION_ICON } from './ui.js';
import { smartAction } from '../palette.js';
import { applyWidgets, customise } from './experience.js';

const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const SERVICES = [
  ['Ship & move', [['Vehicle', 'bike', '#/vehicle/book', 'green'], ['Courier', 'parcel', '#/courier/book', 'amber'], ['Logistics', 'truck', '#/logistics/book', 'blue'], ['International', 'globe', '#/international/book', 'violet'], ['Movers', 'building', '#/services/movers', 'coral']]],
  ['Travel', [['Flights', 'plane', '#/travel/flights', 'blue'], ['Trains', 'train', '#/travel/trains', 'green'], ['Buses', 'bus', '#/travel/buses', 'coral'], ['Hotels', 'hotel', '#/travel/hotels', 'violet'], ['Rides', 'ride', '#/rides', 'amber']]],
  ['Pay', [['Mobile', 'phone', '#/pay/mobile', 'green'], ['FASTag', 'fastag', '#/pay/fastag', 'coral'], ['Bills', 'bill', '#/pay/bills', 'blue'], ['Send money', 'rupee', '#/pay/send', 'violet'], ['Wallet', 'wallet', '#/wallet', 'amber']]],
];
const HINTS = ['5 kg from 560034 to 400053', '200 kg from Koramangala to Whitefield', 'flight from Bengaluru to Delhi', 'hotel in Goa', 'recharge 9876543210'];
// Original illustration: a helper bot with chat bubbles and service badges. Motion is CSS, off for reduced motion.
const BOT = `<svg class="hero__bot" viewBox="0 0 340 230" aria-hidden="true">
  <defs>
    <linearGradient id="botShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6ebe5"/></linearGradient>
    <linearGradient id="botVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16403a"/><stop offset="1" stop-color="#0a1f1b"/></linearGradient>
    <radialGradient id="botHalo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="170" cy="112" r="108" fill="url(#botHalo)"/>
  <ellipse cx="170" cy="118" rx="132" ry="58" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.500" stroke-dasharray="3 7"/>
  <ellipse cx="170" cy="212" rx="54" ry="7" fill="rgba(0,0,0,.22)"/>

  <g class="bot-bubble-l">
    <path d="M44 24h62a14 14 0 0 1 14 14v8a14 14 0 0 1-14 14h-6l4 12-16-12H44a14 14 0 0 1-14-14v-8a14 14 0 0 1 14-14z" fill="#fff"/>
    <circle class="bot-dot" cx="58" cy="42" r="4.500" fill="#0e7c66"/><circle class="bot-dot" cx="75" cy="42" r="4.500" fill="#0e7c66"/><circle class="bot-dot" cx="92" cy="42" r="4.500" fill="#0e7c66"/>
  </g>
  <g class="bot-bubble-r">
    <path d="M246 14h52a14 14 0 0 1 14 14v6a14 14 0 0 1-14 14h-36l-16 10 4-10a14 14 0 0 1-18-14v-6a14 14 0 0 1 14-14z" fill="#fff"/>
    <path d="M246 31l5 5 9-10" stroke="#0e7c66" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="268" y="25" width="32" height="5" rx="2.500" fill="#cbe9e1"/><rect x="268" y="34" width="22" height="5" rx="2.500" fill="#cbe9e1"/>
  </g>

  <g class="bot-badge"><circle cx="52" cy="116" r="19" fill="rgba(0,0,0,.18)" transform="translate(0 3)"/><circle cx="52" cy="116" r="19" fill="#fff"/><path transform="translate(40 104)" d="M7 4h10M7 9h10M15 20 8 13h2.500a4.500 4.500 0 0 0 0-9" stroke="#0e7c66" stroke-width="2.200" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g class="bot-badge"><circle cx="78" cy="180" r="19" fill="rgba(0,0,0,.18)" transform="translate(0 3)"/><circle cx="78" cy="180" r="19" fill="#fff"/><path transform="translate(66 168)" d="M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10" stroke="#e29a00" stroke-width="2.200" fill="#fff4d6" stroke-linejoin="round"/></g>
  <g class="bot-badge"><circle cx="298" cy="104" r="19" fill="rgba(0,0,0,.18)" transform="translate(0 3)"/><circle cx="298" cy="104" r="19" fill="#fff"/><path transform="translate(286 92)" d="M21 15.500v-2l-8-5V3.500a1.500 1.500 0 0 0-3 0V8.500l-8 5v2l8-2.500V18l-2 1.500V21l3.500-1 3.500 1v-1.500L13 18v-5z" fill="#2a78d6"/></g>
  <g class="bot-badge"><circle cx="280" cy="176" r="19" fill="rgba(0,0,0,.18)" transform="translate(0 3)"/><circle cx="280" cy="176" r="19" fill="#fff"/><path transform="translate(268 164)" d="M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z" fill="#ff6b4a"/><circle cx="280" cy="173.500" r="2.800" fill="#fff"/></g>

  <g class="bot-float">
    <g class="bot-wave"><path d="M134 150 110 124" stroke="url(#botShell)" stroke-width="15" stroke-linecap="round"/><circle cx="106" cy="119" r="10" fill="#fff"/></g>
    <path d="M206 150l18 26" stroke="#d6ebe5" stroke-width="15" stroke-linecap="round"/><circle cx="227" cy="180" r="10" fill="#fff"/>
    <rect x="128" y="128" width="84" height="68" rx="28" fill="url(#botShell)"/>
    <rect x="147" y="143" width="46" height="30" rx="10" fill="url(#botVisor)"/>
    <g class="bot-voice" fill="#7ff0d0"><rect x="156" y="154" width="4" height="8" rx="2"/><rect x="163" y="150" width="4" height="16" rx="2"/><rect x="170" y="152" width="4" height="12" rx="2"/><rect x="177" y="148" width="4" height="20" rx="2"/><rect x="184" y="153" width="4" height="10" rx="2"/></g>
    <rect x="158" y="120" width="24" height="12" rx="5" fill="#b9d9d0"/>
    <rect x="100" y="68" width="18" height="34" rx="9" fill="#2db596"/><rect x="222" y="68" width="18" height="34" rx="9" fill="#2db596"/>
    <rect x="110" y="40" width="120" height="86" rx="40" fill="url(#botShell)"/>
    <path d="M132 52c10-6 22-8 34-8" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".9"/>
    <rect x="124" y="60" width="92" height="48" rx="24" fill="url(#botVisor)"/>
    <circle cx="153" cy="83" r="13" fill="#7ff0d0" opacity=".18"/><circle cx="187" cy="83" r="13" fill="#7ff0d0" opacity=".18"/>
    <ellipse class="bot-eye" cx="153" cy="83" rx="7.500" ry="9" fill="#7ff0d0"/><ellipse class="bot-eye" cx="187" cy="83" rx="7.500" ry="9" fill="#7ff0d0"/>
    <circle cx="156" cy="79" r="2.200" fill="#fff"/><circle cx="190" cy="79" r="2.200" fill="#fff"/>
    <path d="M162 97q8 6 16 0" stroke="#7ff0d0" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="134" cy="114" r="5.500" fill="#ff9b85" opacity=".55"/><circle cx="206" cy="114" r="5.500" fill="#ff9b85" opacity=".55"/>
    <path d="M170 40V24" stroke="#d6ebe5" stroke-width="5" stroke-linecap="round"/>
    <circle class="bot-glow" cx="170" cy="18" r="15" fill="#f5b301" opacity=".28"/>
    <circle cx="170" cy="18" r="8" fill="#f5b301"/>
  </g>
</svg>`;
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
const UP = '<svg class="li" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 16 6-6 4 4 6-6M15 8h5v5"/></svg>';
const DOWN = '<svg class="li" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 8 6 6 4-4 6 6M15 16h5v-5"/></svg>';

function fmt(k) {
  if (k.value == null) return '—';
  if (k.fmt === 'money') return money(k.value);
  if (k.fmt === 'pct') return `${k.value}%`;
  return Number(k.value).toLocaleString('en-IN');
}
function delta(k) {
  if (k.delta == null || (k.delta === 0 && !k.value)) return '';
  const up = k.delta > 0;
  const cls = k.tone === 'neutral' || k.delta === 0 ? '' : (up === (k.tone === 'up') ? 'good' : 'bad');
  return `<span class="stat-delta ${cls}">${k.delta === 0 ? '' : up ? UP : DOWN}${Math.abs(k.delta)}${k.unit === 'pts' ? ' pts' : '%'}</span>`;
}
// Smooth trend line. Monotone, so it never dips below zero or overshoots a peak.
let sparkId = 0;
function spark(values) {
  if (!values || values.filter((v) => v > 0).length < 3) return '';
  const w = 200; const h = 48; const top = 8; const bottom = 4;
  const max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, top + (1 - v / max) * (h - top - bottom)]);
  const n = pts.length; const dx = pts[1][0] - pts[0][0];
  const sl = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx);
  const m = pts.map((_, i) => (i === 0 ? sl[0] : i === n - 1 ? sl[n - 2] : sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / sl[i]; const b = m[i + 1] / sl[i]; const t = a * a + b * b;
    if (t > 9) { const k = 3 / Math.sqrt(t); m[i] = k * a * sl[i]; m[i + 1] = k * b * sl[i]; }
  }
  const f = (x) => x.toFixed(1);
  let d = `M0 ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) { const [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1]; d += ` C${f(x0 + dx / 3)} ${f(y0 + (m[i] * dx) / 3)} ${f(x1 - dx / 3)} ${f(y1 - (m[i + 1] * dx) / 3)} ${f(x1)} ${f(y1)}`; }
  const id = `sg${++sparkId}`;
  return `<div class="stat-spark"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a78d6" stop-opacity=".2"/><stop offset="1" stop-color="#2a78d6" stop-opacity="0"/></linearGradient></defs><path class="a" fill="url(#${id})" d="${d} L${w} ${h} L0 ${h}Z"/><path class="l" d="${d}" vector-effect="non-scaling-stroke"/></svg></div>`;
}
const kpiCard = (k) => `<a class="card kpi-card" href="${esc(k.href)}"><div class="stat-top"><span class="stat-ico">${icon(k.icon, 16)}</span><span>${esc(k.label)}</span></div><div class="stat-mid"><span class="stat-value" translate="no">${esc(fmt(k))}</span>${delta(k)}</div><span class="stat-note">${esc(k.note || '')}</span>${k.bar != null ? `<span class="stat-bar stat-bar--${k.barTone}" role="img" aria-label="${k.bar}%"><i style="width:${Math.max(2, k.bar)}%"></i></span>` : spark(k.spark)}</a>`;
const TONE_ICON = { bad: 'alert', warn: 'alert', info: 'info', good: 'check' };

export async function render(view) {
  const days = read('ut-ov-days', 30);
  view.innerHTML = '<div class="skeleton" style="height:120px;margin-bottom:14px"></div><div class="kpis">' + '<div class="skeleton" style="height:140px"></div>'.repeat(8) + '</div>';
  const d = await api('/hub/overview', { query: { days } });
  const p = store.state.profile || {};
  const who = p.account_type === 'business' && p.company ? p.company : (p.name || 'Your account');
  const first = (p.name || '').split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const gsHidden = read('ut-gs-hide', false);
  const nextStep = d.start.steps.find((s) => !s.done);
  view.innerHTML = `
    <div class="ov-head"><div><h1>Overview</h1><p>${esc(who)} · ${esc(today)}</p></div>
      <div class="ov-tools"><select class="select" id="per" aria-label="Period">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([v, l]) => `<option value="${v}" ${v === d.days ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn btn-outline" id="print" type="button">${icon('printer', 16)}Print or PDF</button><button class="btn btn-primary" id="custom" type="button">${icon('sliders', 16)}Customize</button></div></div>
    ${nextStep && !gsHidden ? `<section class="card gs-card"><span class="gs-ico">${icon('rocket', 20)}</span><div class="gs-main"><b>Getting started: ${d.start.done} of ${d.start.total} done</b><small>Next: ${esc(nextStep.label)}.</small><div class="gs-bar"><i style="width:${(d.start.done / d.start.total) * 100}%"></i></div></div><a class="btn btn-primary" href="${esc(nextStep.href)}">Continue</a><button class="btn" id="gsHide" type="button">Hide</button>
      <div class="gs-steps">${d.start.steps.map((s) => `<a href="${esc(s.href)}" class="${s.done ? 'done' : ''}">${s.done ? icon('check', 14) : ''}${esc(s.label)}</a>`).join('')}</div></section>` : ''}
    <section class="hero" data-w="ask">
      <i class="hero__orb hero__orb--a"></i><i class="hero__orb hero__orb--b"></i>
      <div class="hero__main">
        <p class="hero__k">${esc(greeting())}${first ? `, ${esc(first)}` : ''}</p>
        <h1>What do you need today?</h1>
        <form class="hero__search" id="smart" role="search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.900 5.600L19.500 10l-5.600 1.900L12 17.500l-1.900-5.600L4.500 10l5.600-1.400z"/></svg><input id="smartQ" autocomplete="off" aria-label="Tell us what you need" placeholder="Try: ${esc(HINTS[0])}"><button class="btn" type="submit">Go</button></form>
        <p class="hero__err" id="smartErr" role="status"></p>
        <div class="hero__chips">${HINTS.slice(1).map((h) => `<button type="button" data-hint="${esc(h)}">${esc(h)}</button>`).join('')}</div>
      </div>
      ${BOT}
    </section>
    <p class="ov-note">Compared with the ${d.days} days before. Active orders, wallet and to-dos always show today's position.</p>
    <div class="kpis" data-w="kpi">${d.kpis.map(kpiCard).join('')}</div>
    <div class="ov-2">
      <section class="card" data-w="insights"><div class="card-h"><div><h2>What the numbers say</h2><small>Last ${d.days} days, from your records</small></div><a class="link" href="#/insights">View all</a></div>
        ${d.insights.length ? `<ul class="ins-list">${d.insights.map((i) => `<li class="tone-${i.tone}">${icon(TONE_ICON[i.tone], 17)}<a href="${esc(i.href)}">${esc(i.text)}</a></li>`).join('')}</ul>` : `<div class="ov-empty">${icon('check', 26)}Nothing unusual. Everything is on track.</div>`}</section>
      <section class="card" data-w="attention"><div class="card-h"><h2>Needs attention</h2></div>
        ${d.attention.length ? `<ul class="att-list">${d.attention.map((a) => `<li><a href="${esc(a.href)}"><span class="ico">${icon(a.icon === 'returnbox' ? 'returnbox' : a.icon, 16)}</span><span class="grow"><b>${a.count}</b>${esc(a.text)}</span>${icon('chevron', 16).replace('class="li"', 'class="li chev"')}</a></li>`).join('')}</ul>` : `<div class="ov-empty">${icon('check', 26)}Nothing needs you right now.</div>`}</section>
    </div>
    <div class="ov-2">
      <section class="card" data-w="todo"><div class="card-h"><div><h2>What to do first</h2><small>Ranked by urgency, using fixed rules</small></div></div>
        ${d.todo.length ? `<ul class="todo-list">${d.todo.map((t) => `<li><a href="${esc(t.href)}"><span class="ico">${icon(t.icon, 16)}</span><span class="grow"><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></span>${icon('chevron', 16).replace('class="li"', 'class="li chev"')}</a></li>`).join('')}</ul>` : `<div class="ov-empty">${icon('check', 26)}You are all caught up.</div>`}</section>
      <section class="card" data-w="services"><div class="card-h"><div><h2>Book or pay</h2><small>Every service in one place</small></div></div>
        ${SERVICES.map(([g, list]) => `<div class="ov-svc-group"><small>${esc(g)}</small><div class="ov-svc">${list.map(([l, i, h, t]) => `<a href="${h}">${tile(i, t).value}<span>${esc(l)}</span></a>`).join('')}</div></div>`).join('')}</section>
    </div>
    <div class="ov-2">
      <section class="card" data-w="charts"><div class="card-h"><div><h2>Daily spend</h2><small>Last ${d.series.length} days</small></div><a class="link" href="#/insights">Insights</a></div><div id="spendBars"></div></section>
      <section class="card" data-w="mix"><div class="card-h"><div><h2>Spend by service</h2><small>Last ${d.days} days</small></div></div>${d.by_service.length ? hbars(d.by_service) : '<div class="ov-empty">Spend appears after your first booking.</div>'}</section>
    </div>
    <div class="ov-2">
      <section class="card" data-w="recent"><div class="card-h"><h2>Recent activity</h2><a class="link" href="#/my/orders?scope=all&days=">View all</a></div>
        ${d.recent.length ? `<ul class="feed">${d.recent.map((r) => `<li>${tile(SECTION_ICON[r.section] || 'parcel', 'green').value}<div class="feed__t"><b>${esc(r.title)}</b><small>${esc(r.provider)} · ${esc(r.sub || '')}</small></div><div class="feed__r"><b translate="no">${esc(money(r.amount))}</b><small>${esc(dateTime(r.at))}</small></div>${statusPill(r)}</li>`).join('')}</ul>` : '<div class="ov-empty">Nothing here yet.</div>'}</section>
      <section class="card" data-w="upcoming"><div class="card-h"><h2>Coming up</h2><a class="link" href="#/autopay">Manage</a></div>
        ${d.upcoming.length ? `<ul class="feed">${d.upcoming.map((u) => `<li><div class="feed__t"><b>${esc(u.provider)}</b><small>${u.auto ? 'Auto-pay' : 'Reminder'} · ${esc(date(u.due))}</small></div><div class="feed__r"><b translate="no">${esc(money(u.amount))}</b><small>${u.days ? `In ${u.days} day${u.days > 1 ? 's' : ''}` : 'Today'}</small></div></li>`).join('')}</ul>` : '<div class="ov-empty">Connect a bill or mobile number in Auto-pay to see due dates here.</div>'}</section>
    </div>`;
  bars(view.querySelector('#spendBars'), d.series, 'Daily spend');
  applyWidgets(view);
  view.querySelector('#per').addEventListener('change', (e) => { write('ut-ov-days', Number(e.target.value)); render(view); });
  view.querySelector('#print').addEventListener('click', () => window.print());
  view.querySelector('#custom').addEventListener('click', () => customise(view));
  const hide = view.querySelector('#gsHide');
  if (hide) hide.addEventListener('click', () => { write('ut-gs-hide', true); hide.closest('.gs-card').remove(); });
  const q = view.querySelector('#smartQ'); const err = view.querySelector('#smartErr');
  const go = (text) => { const a = smartAction(text); if (a) location.hash = a.path; else err.textContent = 'Try a weight and route, like "5 kg from 560034 to 400053", or "hotel in Goa".'; };
  view.querySelector('#smart').addEventListener('submit', (e) => { e.preventDefault(); go(q.value); });
  view.querySelector('.hero__chips').addEventListener('click', (e) => { const b = e.target.closest('[data-hint]'); if (b) { q.value = b.dataset.hint; go(b.dataset.hint); } });
  // Rotating example, paused while the box is in use.
  let n = 0;
  const timer = setInterval(() => { if (document.activeElement !== q && !q.value) { n = (n + 1) % HINTS.length; q.placeholder = `Try: ${HINTS[n]}`; } }, 3200);
  return () => clearInterval(timer);
}
