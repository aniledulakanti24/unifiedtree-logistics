// Every service is its own workspace: Dashboard, New, Orders, Returns and Cancellations.
import { api, esc, money, store, dateTime, pager } from '../core.js';
import { tile, scene } from './art.js';
import { filterBtn, openFilters, countActive, downloadCsv, statusPill, hbars, bars, emptyScene } from './ui.js';
import { orderTable, ORDER_BULK, wireOrders, csvRows, renderReturns, cancelOne } from './orders.js';
import { analyticsTab, towerTab, settingsTab } from './desk-more.js';
import { tableTools, wireTableTools } from './tabletools.js';
import { dateRangeField, mountDateRange, fromQuery, toQuery, toApi } from './daterange.js';

const shipping = (scheduled, assigned) => [['all', 'All'], ['new', 'New'], ['scheduled', scheduled], ['assigned', assigned], ['transit', 'In Transit'], ['delivered', 'Delivered'], ['lost', 'Lost/Damaged']];
const trip = (upcoming, done) => [['all', 'All'], ['new', upcoming], ['delivered', done]];
const stay = (done) => [['all', 'All'], ['new', 'Reserved'], ['paylater', 'Pay at Property'], ['delivered', done]];
const job = (a, b, c, d, e) => [['all', 'All'], ['new', a], ['scheduled', b], ['assigned', c], ['transit', d], ['delivered', e]];
const paid = (done) => [['all', 'All'], ['delivered', done], ['new', 'Pending']];
const SUBS = {
  vehicle: [['two', 'Two-wheeler', shipping('Rider Scheduled', 'Rider Assigned')], ['three', 'Three-wheeler', shipping('Driver Scheduled', 'Driver Assigned')], ['mini', 'Mini truck', shipping('Truck Scheduled', 'Truck Assigned')]],
  courier: [['small', 'Under 5 kg'], ['parcel', '5 to 30 kg'], ['heavy', '30 kg and above']],
  logistics: [['ftl', 'Full truck'], ['ptl', 'Part load', shipping('Space Booked', 'Carrier Assigned')]],
  international: [['express', 'Express'], ['air', 'Air freight', shipping('Cargo Scheduled', 'Airline Assigned')], ['sea', 'Sea freight', shipping('Container Scheduled', 'Vessel Assigned')]],
  services: [['movers', 'Packers & Movers', job('Requested', 'Survey Scheduled', 'Crew Assigned', 'Moving', 'Moved')], ['warehouse', 'Warehousing', job('Requested', 'Slot Booked', 'Space Assigned', 'In Storage', 'Released')], ['coldchain', 'Cold Chain', job('Requested', 'Scheduled', 'Reefer Assigned', 'In Transit', 'Delivered')], ['customs', 'Customs', job('Filed', 'Documents Due', 'Broker Assigned', 'Under Clearance', 'Cleared')], ['rental', 'Vehicle Rental', job('Requested', 'Scheduled', 'Driver Assigned', 'On Hire', 'Returned')], ['packaging', 'Packaging', job('Ordered', 'Scheduled', 'Packing', 'Out for Delivery', 'Delivered')]],
  travel: [['flights', 'Flights', trip('Upcoming', 'Flown')], ['trains', 'Trains', trip('Upcoming', 'Completed')], ['buses', 'Buses', trip('Upcoming', 'Completed')], ['hotels', 'Hotels', stay('Stayed')], ['stays', 'Accommodation', stay('Stayed')], ['rides', 'Local Rides', [['all', 'All'], ['new', 'Booked'], ['paylater', 'Pay Driver'], ['assigned', 'Driver Assigned'], ['transit', 'On Trip'], ['delivered', 'Completed']]]],
  pay: [['mobile', 'Mobile', paid('Recharged')], ['fastag', 'FASTag', paid('Topped Up')], ['bills', 'Bills', paid('Paid')], ['transfer', 'Send Money', paid('Sent')], ['voucher', 'Vouchers', paid('Issued')], ['gold', 'Gold & Silver', paid('Bought')], ['business', 'Business', paid('Paid')]],
};
export const subPills = (c, sub, href) => (c.subs ? `<nav class="tabs tabs--sub" aria-label="Sub-services">${[['', 'All'], ...c.subs].map(([k, l]) => `<a href="${href(k)}" class="${k === sub ? 'active' : ''}">${esc(l)}</a>`).join('')}</nav>` : '');
export const DESKS = {
  vehicle: { noun: 'vehicle', title: 'Vehicle Transport', icon: 'bike', tone: 'green', dash: '#/vehicle', base: '#/vehicle', book: '#/vehicle/book', bookLabel: 'New booking', stages: shipping('Rider Scheduled', 'Rider Assigned'), returns: true, cancels: true },
  courier: { noun: 'courier', title: 'Courier Transport', icon: 'parcel', tone: 'amber', dash: '#/courier', base: '#/courier', book: '#/courier/book', bookLabel: 'New shipment', stages: shipping('Pickup Scheduled', 'Courier Assigned'), returns: true, cancels: true, extra: [['bulk', 'Bulk booking', '#/courier/bulk']] },
  logistics: { noun: 'logistics', title: 'Logistics Transport', icon: 'truck', tone: 'blue', dash: '#/logistics', base: '#/logistics', book: '#/logistics/book', bookLabel: 'New load', stages: shipping('Load Scheduled', 'Truck Assigned'), returns: true, cancels: true },
  international: { noun: 'international', title: 'International', icon: 'globe', tone: 'violet', dash: '#/international', base: '#/international', book: '#/international/book', bookLabel: 'New shipment', stages: shipping('Pickup Scheduled', 'Carrier Assigned'), returns: true, cancels: true },
  services: { noun: 'service', title: 'More Services', icon: 'building', tone: 'violet', intro: 'Movers, warehousing, cold chain, customs, rental and packaging.', dash: '#/services/dashboard', base: '#/services', book: '#/services/movers', bookLabel: 'Book a service', stages: [['all', 'All'], ['new', 'Requested'], ['scheduled', 'Scheduled'], ['assigned', 'Assigned'], ['transit', 'In Progress'], ['delivered', 'Completed']], returns: true, cancels: true },
  travel: { noun: 'travel', title: 'Travel & Stay', icon: 'plane', tone: 'blue', intro: 'Flights, trains, buses, hotels, stays and local rides.', dash: '#/travel/dashboard', base: '#/travel', book: '#/travel/flights', bookLabel: 'Book', stages: [['all', 'All'], ['new', 'Confirmed'], ['paylater', 'Pay Later'], ['assigned', 'Driver Assigned'], ['transit', 'In Progress'], ['delivered', 'Completed']], returns: false, cancels: true },
  pay: { noun: 'payment', title: 'Recharge & Bills', icon: 'phone', tone: 'green', intro: 'Every recharge, bill and payment, by UPI, card or wallet.', dash: '#/pay/dashboard', base: '#/pay', book: '#/pay/mobile', bookLabel: 'Recharge & pay', stages: [['all', 'All'], ['delivered', 'Successful'], ['new', 'Pending']], returns: false, cancels: false },
};
for (const [k, c] of Object.entries(DESKS)) { c.subs = SUBS[k]; c.transport = ['vehicle', 'courier', 'logistics', 'international'].includes(k); c.alerts = c.transport || k === 'services'; c.settings = k !== 'pay'; }
const can = (m) => { const p = store.state.user && store.state.user.permissions; return !p || (p[m] || 'none') !== 'none'; };
const I = {
  support: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.500"/><rect x="17" y="14" width="4" height="6" rx="1.500"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M4 20h16"/></svg>',
};

const RAIL = {
  dashboard: '<rect x="3" y="3" width="8" height="8" rx="1.500"/><rect x="13" y="3" width="8" height="5" rx="1.500"/><rect x="13" y="10" width="8" height="11" rx="1.500"/><rect x="3" y="13" width="8" height="8" rx="1.500"/>',
  book: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  orders: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  returns: '<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',
  cancellations: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  tower: '<path d="M12 12v9M8 21h8"/><circle cx="12" cy="9" r="2.500"/><path d="M7 14a7 7 0 0 1 0-10M17 14a7 7 0 0 0 0-10"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  bulk: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
};
export function deskTabs(key, active) {
  const c = DESKS[key];
  const list = [['dashboard', 'Overview', c.dash], ['book', c.transport ? 'New' : c.bookLabel.split(' ')[0], c.book], ['orders', 'Orders', `${c.base}/orders`], ...(c.returns && can('returns') ? [['returns', 'Returns', `${c.base}/returns`]] : []), ...(c.cancels ? [['cancellations', 'Cancelled', `${c.base}/cancellations`]] : []), ['analytics', 'Analytics', `${c.base}/analytics`], ['tower', 'Control', `${c.base}/tower`], ...(c.settings ? [['settings', 'Settings', `${c.base}/settings`]] : []), ...(c.extra ? [['bulk', 'Bulk', c.extra[0][2]]] : [])];
  return `<nav class="desk-rail" aria-label="${esc(c.title)} sections"><div>${list.map(([k, l, h]) => `<a href="${h}" class="${k === active ? 'active' : ''}" ${k === active ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${RAIL[k]}</svg><span>${esc(l)}</span></a>`).join('')}</div></nav>`;
}

export async function renderDeskPage(view, { desk, tab, query }) {
  const c = DESKS[desk];
  view.innerHTML = `<div class="page-head"><div class="row head-t">${tile(c.icon, c.tone).value}<div><h1>${esc(c.title)}</h1><p>${esc(c.intro)}</p></div></div></div>${deskTabs(desk, tab)}<div id="body"></div>`;
  return renderDeskBody(view.querySelector('#body'), desk, tab, query);
}

export function renderDeskBody(body, desk, tab, query, partners) {
  if (tab === 'orders') return ordersTab(body, desk, query);
  if (tab === 'returns') return renderReturns(body, { query, desk, base: `${DESKS[desk].base}/returns` });
  if (tab === 'cancellations') return cancellationsTab(body, desk, query);
  if (tab === 'analytics') return analyticsTab(body, desk, query);
  if (tab === 'tower') return towerTab(body, desk, query);
  if (tab === 'settings') return settingsTab(body, desk, query, partners);
  return dashboardTab(body, desk, partners);
}

// ---- dashboard ------------------------------------------------------------------------------
async function dashboardTab(body, key, partners) {
  body.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const c = DESKS[key];
  const d = await api('/hub/desk', { query: { desk: key } });
  const flow = [...c.stages.filter(([k]) => k !== 'all').map(([k, l]) => [l, d.stages[k], `${c.base}/orders?stage=${k}&days=`]), ...(c.returns ? [['Returns', d.returns, `${c.base}/returns`]] : []), ...(c.cancels ? [['Cancellations', d.stages.cancelled, `${c.base}/cancellations`]] : [])];
  body.innerHTML = `
    <div class="grid grid-4">
      <a class="card stat" href="${c.base}/orders?days=1"><span class="stat__label">Orders today</span><span class="stat__value">${d.today}</span><span class="muted small">${d.yesterday} yesterday</span></a>
      <a class="card stat" href="${c.base}/orders?days="><span class="stat__label">Active now</span><span class="stat__value">${d.active}</span><span class="muted small">Booked or moving</span></a>
      <a class="card stat" href="${c.base}/orders?stage=delivered&days="><span class="stat__label">Completed</span><span class="stat__value">${d.delivered}</span><span class="muted small">All time</span></a>
      <div class="card stat"><span class="stat__label">Spend, 30 days</span><span class="stat__value" translate="no">${esc(money(d.spend_30))}</span><span class="muted small">${esc(money(d.spend_today))} today</span></div>
    </div>
    <div class="flow" style="--n:${flow.length}">${flow.map(([l, n, h]) => `<a href="${h}"><b>${n}</b><small>${esc(l)}</small></a>`).join('')}</div>
    <div class="dash dash--even">
      <div class="dash__main">
        <section class="card"><div class="card__head"><h2>Recent orders</h2><a class="link" href="${c.base}/orders?days=">View all</a></div>
          ${d.recent.length ? `<ul class="feed">${d.recent.map((r) => `<li>${tile(c.icon, c.tone).value}<div class="feed__t"><b>${esc(r.title)}</b><small>${esc(r.provider)} · ${esc(r.sub || '')}</small></div><div class="feed__r"><b translate="no">${esc(money(r.amount))}</b><small>${esc(dateTime(r.at))}</small></div>${statusPill(r)}</li>`).join('')}</ul>` : emptyScene(`Make your first ${c.noun} order.`, { href: c.book, label: 'Create order now' })}
        </section>
        <section class="card"><h2>Daily spend, last 14 days</h2><div id="deskBars"></div></section>
      </div>
      <aside class="dash__side">
        <section class="card"><h2>Top providers, 30 days</h2>${d.providers.length ? hbars(d.providers) : '<p class="muted notop">Your providers appear after your first order.</p>'}</section>
        ${partners ? `<section class="card"><h2>Partners</h2><div class="chips chips--static">${partners.map((p) => `<span class="chip">${esc(p)}</span>`).join('')}</div></section>` : ''}
      </aside>
    </div>`;
  bars(body.querySelector('#deskBars'), d.series, 'Daily spend');
}

// ---- shared toolbar -------------------------------------------------------------------------
const toolbar = ({ search, range, count, placeholder, tools }) => `<div class="desk-bar"><form id="sf" class="orders-search"><input class="input" type="search" name="search" value="${esc(search)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></form><span class="spacer"></span>${tools ? tableTools() : ''}
  <a class="btn btn-soft btn-icon" href="#/help" title="Support" aria-label="Support">${I.support}</a><button class="btn btn-soft" id="csv" type="button" title="Download report">${I.download}<span class="bl">Download Report</span></button>
  ${dateRangeField(range)}${count == null ? '' : filterBtn(count)}</div>`;
async function everyRow(params) {
  const out = []; let page = 1; let last = 1;
  do { const x = await api('/hub/orders', { query: { ...params, page, per_page: 200 } }); out.push(...x.data); last = x.meta.pagination.total_pages; page += 1; } while (page <= last);
  return out;
}

// ---- orders ---------------------------------------------------------------------------------
async function ordersTab(body, key, query) {
  const c = DESKS[key];
  const stage = query.get('stage') || 'all';
  const range = fromQuery(query, 'last30');
  const search = query.get('search') || '';
  const pay = query.get('pay') || '';
  const sub = query.get('sub') || '';
  const page = Number(query.get('page')) || 1;
  const stages = ((c.subs || []).find(([k]) => k === sub) || [])[2] || c.stages;
  const link = (patch) => { const q = new URLSearchParams({ stage, search, pay, sub, ...toQuery(range), ...patch }); [...q.keys()].forEach((k) => { if (!q.get(k)) q.delete(k); }); return `${c.base}/orders?${q}`; };
  body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const params = { desk: key, sub, stage, ...toApi(range), search, pay };
  const r = await api('/hub/orders', { query: { ...params, page, per_page: 15 } });
  const fields = [{ key: 'pay', label: 'Payment', options: [['', 'All payments'], ['prepaid', 'Prepaid'], ['cod', 'Pay on delivery']] }];
  const fresh = stage === 'all' && !search && !pay && !sub && !r.stages.all;
  body.innerHTML = `${toolbar({ search, range, count: countActive(fields, { pay }), placeholder: 'Search by order ID, provider or route', tools: true })}
    ${subPills(c, sub, (k) => link({ sub: k, stage: 'all', page: 1 }))}
    <nav class="tabs tabs--line">${stages.map(([k, l]) => `<a href="${link({ stage: k, page: 1 })}" class="${k === stage ? 'active' : ''}">${esc(l)}<span class="count">${r.stages[k] || 0}</span></a>`).join('')}</nav>
    ${ORDER_BULK}
    ${r.data.length ? orderTable(r) : `<div class="empty-scene empty-scene--tall">${scene('orders').value}<p>${fresh ? `Make your first ${esc(c.noun)} order.` : 'No orders match these filters.'}</p><a class="btn btn-primary" href="${c.book}">Create order now</a></div>`}`;
  const pg = body.querySelector('#pg');
  if (pg) pg.appendChild(pager(r.meta, (p) => { location.hash = link({ page: p }); }));
  const again = () => ordersTab(body, key, query);
  body.querySelector('#sf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = link({ search: e.target.search.value, page: 1 }); });
  mountDateRange(body, range, (v) => { location.hash = link({ ...toQuery(v), page: 1 }); });
  body.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, fields, { pay }, (v) => { location.hash = link({ ...v, page: 1 }); }));
  body.querySelector('#csv').addEventListener('click', async () => downloadCsv(`ut-log-${key}-orders.csv`, csvRows(await everyRow(params))));
  wireOrders(body, r, again);
  wireTableTools(body, 'orders');
}

// ---- cancellations --------------------------------------------------------------------------
const refundOf = (x) => (x.refund != null ? x.refund : x.pay_mode === 'prepaid' ? x.amount : 0);
async function cancellationsTab(body, key, query) {
  const c = DESKS[key];
  const show = query.get('show') === 'open' ? 'open' : 'cancelled';
  const range = fromQuery(query, 'all');
  const search = query.get('search') || '';
  const sub = query.get('sub') || '';
  const page = Number(query.get('page')) || 1;
  const link = (patch) => { const q = new URLSearchParams({ show, search, sub, ...toQuery(range), ...patch }); [...q.keys()].forEach((k) => { if (!q.get(k)) q.delete(k); }); return `${c.base}/cancellations?${q}`; };
  body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const params = { desk: key, sub, stage: show === 'open' ? 'cancellable' : 'cancelled', ...toApi(range), search };
  const r = await api('/hub/orders', { query: { ...params, page, per_page: 15 } });
  const idCell = (x) => `<td class="stack"><a class="link mono" href="#/my/orders/${esc(x.id)}">${esc(x.id)}</a><small class="muted">Booked ${esc(dateTime(x.at))}</small></td><td class="stack"><b>${esc(x.title)}</b><small class="muted">${esc(x.provider)}</small></td>`;
  const table = show === 'open'
    ? `<div class="table-wrap"><table class="orders"><thead><tr><th>Order details</th><th>Service</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${r.data.map((x) => `<tr>${idCell(x)}<td translate="no"><b>${esc(money(x.amount))}</b></td><td>${statusPill(x)}</td><td><button class="btn btn-outline btn-sm" data-cancel="${esc(x.id)}" type="button">Cancel</button></td></tr>`).join('')}</tbody></table></div><div id="pg"></div>`
    : `<div class="table-wrap"><table class="orders"><thead><tr><th>Order details</th><th>Service</th><th>Cancelled on</th><th>Reason</th><th>Refund</th></tr></thead><tbody>${r.data.map((x) => `<tr>${idCell(x)}<td>${x.cancelled_at ? esc(dateTime(x.cancelled_at)) : '—'}</td><td>${esc(x.cancel_reason || 'Not recorded')}</td><td class="stack"><b translate="no">${esc(money(refundOf(x)))}</b><small class="muted">${x.pay_mode === 'cod' ? 'Nothing was charged' : `${refundOf(x) < x.amount ? 'After charge' : 'Full refund'} to ${esc(x.refund_to || 'Wallet')}`}</small></td></tr>`).join('')}</tbody></table></div><div id="pg"></div>`;
  body.innerHTML = `<div class="grid grid-3"><div class="card stat"><span class="stat__label">Cancelled</span><span class="stat__value">${r.stages.cancelled}</span></div><div class="card stat"><span class="stat__label">Refunded</span><span class="stat__value" translate="no">${esc(money(r.refunded))}</span></div><div class="card stat"><span class="stat__label">Cancellation rate</span><span class="stat__value">${r.cancel_rate}%</span><span class="muted small">Of ${esc(c.noun)} orders</span></div></div>
    ${toolbar({ search, range, placeholder: 'Search by order ID, provider or route' })}
    ${subPills(c, sub, (k) => link({ sub: k, page: 1 }))}
    <nav class="tabs tabs--line"><a href="${link({ show: 'cancelled', page: 1 })}" class="${show === 'cancelled' ? 'active' : ''}">Cancelled<span class="count">${r.stages.cancelled}</span></a><a href="${link({ show: 'open', page: 1 })}" class="${show === 'open' ? 'active' : ''}">Can still be cancelled<span class="count">${r.stages.cancellable}</span></a></nav>
    ${r.data.length ? table : `<div class="empty-scene empty-scene--tall">${scene('returns').value}<p>${show === 'open' ? 'No open orders can be cancelled right now.' : 'Nothing has been cancelled in this period.'}</p></div>`}`;
  const pg = body.querySelector('#pg');
  if (pg) pg.appendChild(pager(r.meta, (p) => { location.hash = link({ page: p }); }));
  const again = () => cancellationsTab(body, key, query);
  body.querySelector('#sf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = link({ search: e.target.search.value, page: 1 }); });
  mountDateRange(body, range, (v) => { location.hash = link({ ...toQuery(v), page: 1 }); });
  body.querySelector('#csv').addEventListener('click', async () => { const rows = await everyRow(params); downloadCsv(`ut-log-${key}-cancellations.csv`, [['Order ID', 'Booked', 'Cancelled', 'Service', 'Provider', 'Reason', 'Amount INR', 'Refund INR'], ...rows.map((x) => [x.id, x.at, x.cancelled_at || '', x.title, x.provider, x.cancel_reason || '', x.amount, refundOf(x)])]); });
  body.onclick = (e) => { const b = e.target.closest('[data-cancel]'); if (b) cancelOne(r.data.find((x) => x.id === b.dataset.cancel), again); };
}
