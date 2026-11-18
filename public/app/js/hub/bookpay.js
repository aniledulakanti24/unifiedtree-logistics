// Travel & Bills: one place for travel bookings, recharges, bills and money services.
// Icon cards open the existing pages; search filters every card at once.
import { api, esc, money, store } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';
import { addMoney } from './ui.js';
import { modOn } from './workspace.js';
import { ICON } from './bills.js';
import { getCatalog } from './pay.js';

const T = (label, ico, tone, href, find = '') => ({ label, ico, tone, href, find });
const SECTIONS = [
  { key: 'travel', mod: 'travel', title: 'Travel', sub: 'Tickets and stays, compared across providers', items: [
    T('Flights', 'plane', 'blue', '#/travel/flights', 'air airline plane'), T('Trains', 'train', 'green', '#/travel/trains', 'rail irctc'), T('Buses', 'bus', 'coral', '#/travel/buses', 'coach'),
    T('Hotels', 'hotel', 'violet', '#/travel/hotels', 'room'), T('Homestays & PG', 'bed', 'rose', '#/travel/stays', 'apartment hostel accommodation'), T('Local rides', 'ride', 'amber', '#/rides', 'cab taxi auto'),
  ] },
  { key: 'recharge', mod: 'pay', title: 'Recharge', sub: 'Prepaid, tags and travel cards', items: [
    T('Mobile', 'phone', 'green', '#/pay/mobile', 'prepaid recharge jio airtel vi'), T('FASTag', 'fastag', 'coral', '#/pay/fastag', 'toll'), T('DTH', 'tv', 'blue', '#/pay/bills?cat=dth', 'tata play dish'),
    T('Metro card', 'train', 'violet', '#/pay/bills?cat=metro', 'metro'), T('NCMC', 'card', 'blue', '#/pay/bills?cat=ncmc', 'national common mobility'), T('Google Play', 'gift', 'green', '#/pay/bills?cat=play', 'play store'),
  ] },
  { key: 'bills', mod: 'pay', title: 'Pay bills', sub: '41 bill types, with reminders and auto-pay', all: '#/pay/bills', items: [
    T('Electricity', 'electric', 'amber', '#/pay/bills?cat=electricity', 'power bescom'), T('Water', 'drop', 'blue', '#/pay/bills?cat=water'), T('Piped gas', 'flame', 'coral', '#/pay/bills?cat=gas'),
    T('Book cylinder', 'flame', 'amber', '#/pay/bills?cat=lpg', 'lpg indane hp bharat'), T('Broadband', 'wifi', 'violet', '#/pay/bills?cat=broadband', 'internet wifi'), T('Postpaid', 'phone', 'green', '#/pay/bills?cat=postpaid'),
    T('Credit card', 'card', 'blue', '#/pay/bills?cat=credit', 'cc bill'), T('Loan EMI', 'bank', 'violet', '#/pay/bills?cat=loan', 'emi'), T('Insurance', 'shield', 'green', '#/pay/bills?cat=insurance', 'lic premium'),
    T('Rent', 'building', 'rose', '#/pay/bills?cat=rent', 'house rent'), T('Education fee', 'school', 'blue', '#/pay/bills?cat=education', 'school college'), T('Municipal tax', 'doc', 'amber', '#/pay/bills?cat=tax', 'property tax'),
  ] },
  { key: 'money', mod: 'pay', title: 'Money & more', sub: 'Send, save and gift', items: [
    T('Send money', 'rupee', 'green', '#/pay/send', 'upi transfer bank'), T('Gold & silver', 'coin', 'amber', '#/pay/gold', 'digital gold'), T('Gift vouchers', 'gift', 'rose', '#/pay/vouchers', 'gift card amazon'),
    T('Auto-pay', 'repeat', 'blue', '#/autopay', 'standing instruction mandate'), { ...T('Business payments', 'briefcase', 'violet', '#/pay/business', 'vendor gst tax'), biz: true },
  ] },
];
const QUICK = [
  ['Book a flight', 'Every airline, one price list', 'plane', 'blue', '#/travel/flights', 'travel'],
  ['Recharge a mobile', 'Plans for every operator', 'phone', 'green', '#/pay/mobile', 'pay'],
  ['Pay a bill', 'Electricity, gas, credit cards…', 'bill', 'amber', '#/pay/bills', 'pay'],
  ['Book a hotel', 'Stays at every budget', 'hotel', 'violet', '#/travel/hotels', 'travel'],
];

// Each icon has its own small hover motion: planes take off, vehicles drive, bills flicker.
const ANIM = { plane: 'fly', train: 'drive', bus: 'drive', ride: 'drive', fastag: 'drive', electric: 'zap', flame: 'flicker', drop: 'drip', wifi: 'pulse', phone: 'ring', tv: 'pulse', coin: 'spin', gift: 'bounce', rupee: 'bounce', repeat: 'spin', hotel: 'bounce', bed: 'bounce' };
const SEC_ICON = { travel: ['plane', 'blue'], recharge: ['phone', 'green'], bills: ['bill', 'amber'], money: ['rupee', 'violet'] };
// Header illustration: a plane on a dashed route, with a paid bill, a phone and a coin floating by.
const SCENE = `<svg class="bp-scene" viewBox="0 0 320 170" aria-hidden="true">
  <defs>
    <linearGradient id="bpCoin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe082"/><stop offset=".55" stop-color="#f5b301"/><stop offset="1" stop-color="#c98a00"/></linearGradient>
    <linearGradient id="bpPhone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4a43"/><stop offset="1" stop-color="#0c2420"/></linearGradient>
    <linearGradient id="bpTrail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7FD6BF" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></linearGradient>
    <radialGradient id="bpGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="bpSoft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#04110f" flood-opacity=".35"/></filter>
  </defs>

  <g class="bp-cloud bp-cloud--a" fill="#fff" opacity=".1"><ellipse cx="70" cy="30" rx="26" ry="9"/><ellipse cx="86" cy="24" rx="16" ry="10"/><ellipse cx="58" cy="26" rx="12" ry="7"/></g>
  <g class="bp-cloud bp-cloud--b" fill="#fff" opacity=".08"><ellipse cx="236" cy="18" rx="22" ry="7"/><ellipse cx="248" cy="13" rx="13" ry="8"/></g>

  <path d="M18 140 C 90 40, 200 30, 300 62" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.600" stroke-linecap="round" class="bp-dash"/>
  <path d="M18 140 C 90 40, 200 30, 300 62" fill="none" stroke="url(#bpTrail)" stroke-width="2.600" stroke-linecap="round" pathLength="100" class="bp-trail"/>

  <g class="bp-pin"><circle class="bp-ring" cx="18" cy="140" r="5" fill="none" stroke="#7FD6BF" stroke-width="1.600"/><circle cx="18" cy="140" r="5" fill="#7FD6BF" stroke="#0e5c4d" stroke-width="2"/></g>
  <g class="bp-pin"><circle class="bp-ring bp-ring--late" cx="300" cy="62" r="5" fill="none" stroke="#F5B301" stroke-width="1.600"/><circle cx="300" cy="62" r="5" fill="#F5B301" stroke="#0e5c4d" stroke-width="2"/></g>

  <g class="bp-scene__plane">
    <circle r="16" fill="url(#bpGlow)"/>
    <path d="M17 0c0-1.400-1.300-2.200-2.600-2.200H5.600L-3.600-12.600h-3.400l4.800 10.400h-7.400l-3-3.600h-2.600l1.800 5.800-1.800 5.800h2.600l3-3.600h7.400l-4.800 10.400h3.400L5.600 2.200h8.800C15.700 2.200 17 1.400 17 0z" fill="#fff" filter="url(#bpSoft)"/>
  </g>

  <g class="bp-float bp-float--d"><circle cx="60" cy="62" r="17" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)" stroke-width="1.400"/><path d="M53 54.500h14M53 60.500h14M62.500 71l-8-8h3.500a5.500 5.500 0 0 0 0-11" transform="translate(0 2)" stroke="#fff" stroke-width="2.200" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>

  <g class="bp-float bp-float--b" filter="url(#bpSoft)">
    <rect x="94" y="84" width="40" height="64" rx="9" fill="url(#bpPhone)" stroke="#7FD6BF" stroke-width="1.800"/>
    <rect x="108" y="88" width="12" height="3" rx="1.500" fill="#7FD6BF" opacity=".6"/>
    <rect x="99" y="95" width="30" height="44" rx="4" fill="#123832"/>
    <text x="114" y="108" text-anchor="middle" font-size="7" font-weight="700" fill="#cdeee4" font-family="Inter, sans-serif">₹299</text>
    <rect x="103" y="114" width="22" height="4" rx="2" fill="rgba(255,255,255,.12)"/>
    <rect class="bp-fill" x="103" y="114" width="22" height="4" rx="2" fill="#7FD6BF"/>
    <g class="bp-done"><circle cx="114" cy="128" r="6" fill="#2fb37a"/><path d="m111 128 2 2 4-4.500" stroke="#fff" stroke-width="1.800" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
  </g>
  <g fill="none" stroke="#7FD6BF" stroke-width="2" stroke-linecap="round"><path class="bp-wave bp-wave--1" d="M140 104a9 9 0 0 1 0 14"/><path class="bp-wave bp-wave--2" d="M146 98a17 17 0 0 1 0 26"/><path class="bp-wave bp-wave--3" d="M152 92a25 25 0 0 1 0 38"/></g>

  <g class="bp-float bp-float--a" filter="url(#bpSoft)">
    <path d="M194 90a6 6 0 0 1 6-6h52a6 6 0 0 1 6 6v54l-5.300-3.500-5.300 3.500-5.300-3.500-5.300 3.500-5.300-3.500-5.300 3.500-5.300-3.500-5.300 3.500-5.300-3.500-5.300 3.500-5.300-3.500z" fill="#fff"/>
    <rect x="202" y="94" width="18" height="18" rx="5" fill="#fff4d6"/><path d="M208.500 99.500l2.500-2v12" stroke="#c27200" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="224" y="96" width="26" height="5" rx="2.500" fill="#cfe7df"/><rect x="224" y="105" width="18" height="4" rx="2" fill="#e6f2ee"/>
    <rect x="202" y="118" width="48" height="4" rx="2" fill="#e6f2ee"/><rect x="202" y="126" width="34" height="4" rx="2" fill="#e6f2ee"/>
    <g class="bp-stamp"><circle cx="246" cy="132" r="10" fill="#2fb37a"/><path class="bp-tick" d="m241 132 3.500 3.500 6.500-7" stroke="#fff" stroke-width="2.400" fill="none" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/></g>
  </g>

  <g class="bp-float bp-float--c"><g class="bp-coin" filter="url(#bpSoft)"><circle cx="280" cy="122" r="16" fill="url(#bpCoin)"/><circle cx="280" cy="122" r="11.500" fill="none" stroke="#fff3c4" stroke-width="1.600" opacity=".9"/><path d="M274.500 115.500h11M274.500 120h11M281.500 129.500l-6-6h2.500a4 4 0 0 0 0-8" stroke="#7a4d00" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path class="bp-coin__shine" d="M268 112l6 0-10 20h-4z" fill="#fff" opacity=".35"/></g></g>

  <g fill="#fff"><path class="bp-star bp-star--1" d="M168 18l1.600 4.400 4.400 1.600-4.400 1.600-1.600 4.400-1.600-4.400-4.400-1.600 4.400-1.600z"/><path class="bp-star bp-star--2" d="M30 84l1.200 3.300 3.300 1.200-3.300 1.200-1.200 3.300-1.200-3.300-3.300-1.200 3.300-1.200z"/><path class="bp-star bp-star--3" d="M306 120l1.200 3.300 3.300 1.200-3.300 1.200-1.200 3.300-1.200-3.300-3.300-1.200 3.300-1.200z"/></g>
</svg>`;

export async function render(view) {
  const business = store.state.accountType === 'business';
  const secs = SECTIONS.filter((s) => modOn(s.mod)).map((s) => ({ ...s, items: s.items.filter((i) => !i.biz || business) }));
  const quick = QUICK.filter((q) => modOn(q[5]));
  let n = 0;
  const card = (i, k) => `<a class="bp-tile" href="${i.href}" style="--i:${k == null ? n++ : k}" data-anim="${ANIM[i.ico] || 'pop'}" data-find="${esc(`${i.label} ${i.find || ''}`.toLowerCase())}"><span class="bp-tile__ico">${tile(i.ico, i.tone).value}</span><span class="bp-tile__l">${esc(i.label)}</span></a>`;
  view.innerHTML = `<div class="bp">
    <div class="bp-hero"><i class="bp-hero__orb"></i><div class="bp-hero__t"><span class="bp-hero__k">${icon('sparkle', 14)}One wallet for everything</span><h1>Travel & Bills</h1><p>Book tickets and stays, recharge, pay bills and send money. Everything is paid from one wallet.</p>
      <label class="bp-search">${icon('search', 18)}<input id="bpFind" type="search" placeholder="Search: flight, electricity, FASTag…" aria-label="Search travel, recharges and bills" autocomplete="off"></label></div>${SCENE}</div>
    ${quick.length ? `<div class="bp-quick">${quick.map(([t, s, ic, tone, h], k) => `<a class="bp-q bp-q--${tone}" href="${h}" style="--i:${k}" data-anim="${ANIM[ic] || 'pop'}" data-find="${esc(t.toLowerCase())}">${tile(ic, tone).value}<span><b>${esc(t)}</b><small>${esc(s)}</small></span><i class="bp-q__go">${icon('chevron', 16)}</i></a>`).join('')}</div>` : ''}
    <div class="bp-grid"><div class="bp-main">
      ${secs.map((s) => `<section class="card bp-sec" data-sec="${s.key}"><div class="bp-sec__h"><div class="bp-sec__t">${tile(...SEC_ICON[s.key]).value}<div><h2>${esc(s.title)}</h2><small>${esc(s.sub)}</small></div></div>${s.all ? '<button class="link" type="button" data-allbills aria-expanded="false">Show all bill types</button>' : ''}</div><div class="bp-tiles" ${s.all ? 'data-pop' : ''}>${s.items.map((i) => card(i)).join('')}</div>${s.all ? '<div class="bp-all" hidden></div>' : ''}</section>`).join('')}
      <p class="bp-none muted" hidden>Nothing matches that. Try "bill", "recharge" or "hotel".</p>
      ${secs.length < SECTIONS.length ? '<p class="muted small">Some services are switched off. Add them in <a class="link" href="#/workspace">Workspace</a>.</p>' : ''}
    </div><aside class="bp-side" id="bpSide"><div class="skeleton" style="height:180px"></div></aside></div></div>`;
  // Search hides cards and empty sections as you type.
  const find = view.querySelector('#bpFind');
  let expanded = false;
  const showBills = () => {
    const sec = view.querySelector('[data-sec="bills"]'); if (!sec) return;
    const q = find.value.trim();
    sec.querySelector('[data-pop]').hidden = expanded || !!q;
    sec.querySelector('.bp-all').hidden = !(expanded || q);
    const b = sec.querySelector('[data-allbills]'); b.setAttribute('aria-expanded', String(expanded)); b.textContent = expanded ? 'Show popular only' : `Show all ${sec.querySelectorAll('.bp-all .bp-tile').length || ''} bill types`.replace('  ', ' ');
  };
  view.addEventListener('click', (e) => { if (e.target.closest('[data-allbills]')) { expanded = !expanded; find.dispatchEvent(new Event('input')); if (expanded) view.querySelector('[data-sec="bills"]').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
  // Every bill type, grouped as on the bills page. Search looks through all of them.
  if (view.querySelector('[data-sec="bills"]')) {
    getCatalog().then((c) => {
      const groups = [...new Set(Object.values(c.billers).map((v) => v.group))];
      view.querySelector('.bp-all').innerHTML = groups.map((g) => `<div class="bp-grp"><p class="bp-grp__h">${esc(g)}</p><div class="bp-tiles">${Object.entries(c.billers).filter(([, v]) => v.group === g).map(([k, v], j) => card({ label: v.label, ico: (ICON[k] || ['bill'])[0], tone: (ICON[k] || [, 'blue'])[1], href: `#/pay/bills?cat=${k}`, find: `${v.group} ${v.list.join(' ')}` }, j)).join('')}</div></div>`).join('');
      showBills(); if (find.value) find.dispatchEvent(new Event('input'));
    }).catch(() => { const b = view.querySelector('[data-allbills]'); if (b) b.outerHTML = '<a class="link" href="#/pay/bills">All bill types</a>'; });
  }
  find.addEventListener('input', () => {
    const q = find.value.trim().toLowerCase(); let any = false;
    showBills();
    view.querySelectorAll('.bp-sec').forEach((sec) => {
      const all = sec.querySelector('.bp-all');
      // With a search, the bills section looks through every bill type instead of the popular few.
      const pool = all && (q || expanded) ? all : sec.querySelector('.bp-tiles');
      let n = 0;
      sec.querySelectorAll('.bp-tile').forEach((t) => { t.hidden = false; });
      pool.querySelectorAll('.bp-tile').forEach((t) => { const hit = !q || t.dataset.find.includes(q); t.hidden = !hit; if (hit) n++; });
      if (all) all.querySelectorAll('.bp-grp').forEach((g) => { g.hidden = ![...g.querySelectorAll('.bp-tile')].some((t) => !t.hidden); });
      sec.hidden = !n; if (n) any = true;
    });
    view.querySelector('.bp-quick')?.toggleAttribute('hidden', !!q);
    view.querySelector('.bp-none').hidden = any;
  });
  side(view.querySelector('#bpSide'));
}

// Side panel: wallet, saved bills and offers.
async function side(el) {
  const bal = store.state.counts && store.state.counts.wallet_balance;
  let home = { saved: [], offers: [] };
  if (modOn('pay')) { try { home = await api('/hub/bill/home'); } catch (e) { /* panel still shows the wallet */ } }
  el.innerHTML = `<section class="bp-wallet"><i class="bp-wallet__shine" aria-hidden="true"></i><div class="bp-wallet__top"><span class="bp-wallet__ico">${icon('wallet', 20)}</span><span class="bp-wallet__brand">UT Log wallet</span></div><div class="bp-wallet__bal"><small>Balance</small><b translate="no">${bal != null ? esc(money(bal)) : '—'}</b></div><button class="btn btn-sm bp-wallet__add" type="button" id="bpAdd">${icon('plus', 15)}Add money</button></section>
    ${home.saved && home.saved.length ? `<section class="card bp-panel"><div class="bp-sec__h"><h2>Your bills</h2><a class="link" href="#/pay/bills">Manage</a></div><ul class="bp-list">${home.saved.slice(0, 4).map((s) => `<li><a href="#/pay/bills?cat=${esc(s.cat)}">${icon('bill', 18)}<span class="grow"><b>${esc(s.nickname || s.label || s.cat)}</b><small>${esc(s.provider || '')}</small></span>${icon('chevron', 14)}</a></li>`).join('')}</ul></section>` : ''}
    ${home.offers && home.offers.length ? `<section class="card bp-panel"><div class="bp-sec__h"><h2>Offers for you</h2></div><ul class="bp-list">${home.offers.slice(0, 3).map((o) => `<li><a href="#/pay/bills?cat=${esc(o.cat)}"><span class="bp-offer">${esc(o.id)}</span><span class="grow"><b>${esc(o.title || o.label)}</b><small>${esc(o.text || o.label || '')}</small></span>${icon('chevron', 14)}</a></li>`).join('')}</ul></section>` : ''}
    <section class="card bp-panel bp-help"><b>Why one wallet?</b><small>Refunds, cashback and gift cards all land in the same balance, so every booking and bill is paid in one tap.</small></section>`;
  el.querySelector('#bpAdd').addEventListener('click', async () => { if (await addMoney()) location.reload(); });
}
