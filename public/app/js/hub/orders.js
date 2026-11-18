// Orders and Returns: the cross-service lists, and the parts each service workspace reuses.
import { api, esc, money, store, toast, modal, withBusy, dateTime, date, pager, formData } from '../core.js';
import { walletCheckout } from './wallet-checkout.js';
import { luggageAhead, receiverCard, strandedHtml, wireStranded } from './unique.js';
import { weightProofCard, addressCard } from './edge.js';
import { mergeBanner } from './more.js';
import { tile, scene } from './art.js';
import { statusPill, withFunds, refresh, downloadCsv, filterBtn, openFilters, countActive, SECTION_LABEL } from './ui.js';
import { popover } from './prefs.js';
import { openTracking, openClaim, openRate, printReceipt, printTicket, reschedule } from './tracking.js';
import { rebook } from './transport.js';
import { PAY_LABEL } from './checkout.js';
import { icon } from './icons.js';
import { ICON as BILL_ICON } from './bills.js';
import { tableTools, wireTableTools } from './tabletools.js';
import { dateRangeField, mountDateRange, fromQuery, toQuery, toApi } from './daterange.js';

const TABS = [['new', 'New'], ['assigned', 'Pickups'], ['transit', 'In Transit'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All']];
const SERVICES = [['vehicle', 'Vehicle', 'Bike, auto or van in your city', 'bike', 'green'], ['courier', 'Courier', 'Parcels by pincode', 'parcel', 'amber'], ['logistics', 'Logistics', 'Full trucks and contractors', 'truck', 'blue'], ['international', 'International', 'Ship to another country', 'globe', 'violet']];

export function addOrder() {
  modal({
    title: 'Add an order', wide: true,
    body: `<div class="svc-pick">${SERVICES.map(([k, l, d, icon, tone]) => `<a href="#/${k}/book" data-close>${tile(icon, tone).value}<b>${esc(l)}</b><small>${esc(d)}</small></a>`).join('')}</div>`,
  });
}

const canCancel = (x) => ['new', 'assigned'].includes(x.group) && !x.sample && x.status !== 'PAY_LATER';
export const ORDER_BULK = `<div class="bulkbar" id="bulk" hidden><span id="bulkN"></span><button class="btn btn-outline btn-sm" id="bExport" type="button">Export selected</button><button class="btn btn-danger btn-sm" id="bCancel" type="button">Cancel selected</button></div>`;
// Sales channels an order can come from (orders shipped from the Online stores inbox).
const CHANNEL = { amazon: ['Amazon', '#c77700'], flipkart: ['Flipkart', '#2874f0'], meesho: ['Meesho', '#9f2089'], myntra: ['Myntra', '#e72e5a'], ajio: ['AJIO', '#2c4152'], jiomart: ['JioMart', '#0078ad'], etsy: ['Etsy', '#d5541a'], ebay: ['eBay', '#c62a2f'], shopify: ['Shopify', '#4f7a34'], woocommerce: ['WooCommerce', '#7f54b3'], wix: ['Wix', '#0c6efc'], magento: ['Magento', '#d65a26'], custom: ['Website', '#0e7c66'] };
const chanOf = (x) => (x.source === 'website' ? CHANNEL[x.channel] || [String(x.reference || 'Website').split(' ')[0], '#0e7c66'] : null);
const chanTag = (x) => { const c = chanOf(x); return c ? `<span class="och" style="--ch:${c[1]}">${icon('cart', 11)}${esc(c[0])}</span>` : ''; };
const ROW_ICON = { vehicle: ['bike', 'green'], courier: ['parcel', 'amber'], logistics: ['truck', 'blue'], international: ['globe', 'blue'], travel: ['plane', 'blue'], rides: ['ride', 'amber'], recharge: ['phone', 'green'], bills: ['bill', 'amber'], business: ['briefcase', 'violet'], services: ['tools', 'violet'] };
const initialsOf = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const payChip = (x) => (x.pay_mode === 'cod' || x.cod_collect ? `<span class="opay opay--cod">${icon('cash', 12)}${x.cod_collect ? `Collect ${esc(money(x.cod_collect))}` : 'Pay on delivery'}</span>` : x.status === 'PAY_LATER' ? `<span class="opay opay--due">${icon('clock', 12)}Pay later</span>` : `<span class="opay">${icon('wallet', 12)}${esc(PAY_LABEL[x.pay_via] || 'Wallet')}</span>`);
export const orderTable = (r) => `<div class="table-wrap"><table class="orders orders--v2"><thead><tr><th><input type="checkbox" class="check" id="all" aria-label="Select all"></th><th>Order</th><th>Customer</th><th>Service</th><th>Amount</th><th>Route or account</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
      ${r.data.map((x) => { const who = (x.receiver && x.receiver.name) || x.contact_name || ''; const [ic, tone] = ROW_ICON[x.section] || ['receipt', 'blue']; return `<tr class="orow" data-open="${esc(x.id)}" tabindex="0" title="Open ${esc(x.id)}"><td><input type="checkbox" class="check" data-sel="${esc(x.id)}" aria-label="Select ${esc(x.id)}"></td>
        <td><div class="ocell">${tile(ic, tone).value}<span class="stack"><a class="link mono" href="#/my/orders/${esc(x.id)}">${esc(x.id)}</a><small class="muted">${esc(dateTime(x.at))}</small>${chanTag(x) || (x.reference ? `<small class="muted">Ref ${esc(x.reference)}</small>` : '')}</span></div></td>
        <td>${who ? `<div class="ocell"><span class="oav" aria-hidden="true">${esc(initialsOf(who))}</span><span class="stack"><b>${esc(who)}</b><small class="muted">${esc((x.receiver && x.receiver.phone) || x.contact_phone || '')}</small></span></div>` : '<span class="muted">—</span>'}</td>
        <td class="stack"><b>${esc(x.title)}</b><small class="muted">${x.weight ? `${esc(x.weight)} kg · ` : ''}${esc(x.provider)}</small></td>
        <td class="stack"><b translate="no">${esc(money(x.amount))}</b>${payChip(x)}</td>
        <td class="oroute">${esc(x.sub || '—')}</td><td>${statusPill(x)}</td>
        <td><div class="row row--nw">${x.booking_id && x.status !== 'CANCELLED' ? `<button class="btn btn-outline btn-sm" data-track="${esc(x.id)}" type="button">${icon('radar', 14)}Track</button>` : `<a class="btn btn-outline btn-sm" href="#/my/orders/${esc(x.id)}">View</a>`}<button class="icon-btn" data-more="${esc(x.id)}" type="button" aria-label="More actions for ${esc(x.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.400"/><circle cx="12" cy="12" r="1.400"/><circle cx="19" cy="12" r="1.400"/></svg></button></div></td></tr>`; }).join('')}
      </tbody></table></div><div id="pg"></div>`;
export const csvRows = (list) => [['Order ID', 'Date', 'Service', 'Provider', 'Route', 'Weight kg', 'Amount INR', 'Payment', 'Channel', 'Reference', 'Status'], ...list.map((x) => [x.id, x.at, x.title, x.provider, x.sub, x.weight || '', x.amount, x.pay_mode, (chanOf(x) || ['UT Log'])[0], x.reference || '', x.label])];
export function wireOrders(view, r, again) {
  const picked = () => [...view.querySelectorAll('[data-sel]:checked')].map((c) => r.data.find((x) => x.id === c.dataset.sel));
  const syncBulk = () => { const p = picked(); view.querySelector('#bulk').hidden = !p.length; view.querySelector('#bulkN').textContent = `${p.length} selected`; };
  view.onchange = (e) => { if (e.target.id === 'all') view.querySelectorAll('[data-sel]').forEach((c) => { c.checked = e.target.checked; }); if (e.target.id === 'all' || e.target.dataset.sel) syncBulk(); };
  view.querySelector('#bExport').addEventListener('click', () => downloadCsv('ut-log-orders-selected.csv', csvRows(picked())));
  view.querySelector('#bCancel').addEventListener('click', async () => {
    const ok = picked().filter(canCancel);
    if (!ok.length) { toast('None of the selected orders can be cancelled.', true); return; }
    const skipped = picked().length - ok.length;
    const yes = await modal({ title: `Cancel ${ok.length} ${ok.length === 1 ? 'order' : 'orders'}?`, body: `<p class="notop">Prepaid amounts go back to where they were paid from. ${skipped ? `${skipped} selected orders can no longer be cancelled and will be skipped.` : ''}</p>`, footer: '<button class="btn btn-outline" data-close>Keep orders</button><button class="btn btn-danger" id="y">Cancel orders</button>', onMount: (el, close) => el.querySelector('#y').addEventListener('click', () => close(true)) });
    if (!yes) return;
    const res = await Promise.allSettled(ok.map((x) => api('/hub/orders/cancel', { method: 'POST', body: { id: x.id, reason: 'Cancelled in bulk' } })));
    toast(`${res.filter((x) => x.status === 'fulfilled').length} orders cancelled`); refresh(); again();
  });
  view.onclick = (e) => {
    const t = e.target.closest('[data-track]');
    if (t) { openTracking(t.dataset.track); return; }
    const m = e.target.closest('[data-more]');
    if (m) { orderMenu(m, r.data.find((y) => y.id === m.dataset.more), again); return; }
    // Anywhere else on a row opens the order (checkboxes, links and buttons keep their own job).
    const row = e.target.closest('[data-open]');
    if (row && !e.target.closest('input, a, button, label')) location.hash = `#/my/orders/${row.dataset.open}`;
  };
  view.onkeydown = (e) => { const row = e.target.closest && e.target.closest('[data-open]'); if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = `#/my/orders/${row.dataset.open}`; } };
}

// All Orders is for transport only: vehicle, courier, logistics, international and online-store shipments.
// Trips, recharges and bills live in Travel & Bills and the wallet.
const TRANSPORT = ['vehicle', 'courier', 'logistics', 'international'];
// Service filter for All Orders, with links to that service's own pages.
const SERVICE_ROW = [['', 'All', 'columns'], ['vehicle', 'Vehicle', 'bike'], ['courier', 'Courier', 'parcel'], ['logistics', 'Logistics', 'truck'], ['international', 'International', 'globe'], ['website', 'Online stores', 'cart']];
function serviceRow(section, link, counts = null, pending = 0) {
  const total = counts ? TRANSPORT.reduce((t, k) => t + (counts[k] || 0), 0) : 0;
  const rows = SERVICE_ROW;
  return `<div class="ao-svc"><div class="ao-chips" role="group" aria-label="Service">${rows.map(([k, l, ic]) => { const n = k === 'website' ? pending : counts ? (k ? counts[k] || 0 : total) : null; return `<a class="ao-chip ${k === 'website' ? 'ao-chip--web' : ''}" href="${link({ section: k, page: 1 })}" aria-pressed="${k === section}">${icon(ic, 15)}${esc(l)}${n ? `<em>${n}</em>` : ''}</a>`; }).join('')}</div></div>`;
}
// Overview of the selected service: volume, flow and reliability (no money), and a status strip
// that filters the table. Pickup wording follows the service.
const PICKUP_WORD = { vehicle: 'Rider pickups', logistics: 'Truck pickups' };
function overviewPanel(section, o, stage, link) {
  const base = TRANSPORT.includes(section) ? `#/${section}` : '';
  const acts = base ? [['trend', 'Analytics', `${base}/analytics`], ['radar', 'Control', `${base}/tower`], ['sliders', 'Settings', `${base}/settings`]]
    : [['trend', 'Analytics', '#/dashboard'], ['radar', 'Control', '#/business/tracking']];
  const st = o.stages || {};
  const strip = [['new2', 'New', st.new], ['pickups', PICKUP_WORD[section] || 'Pickups', st.pickups], ['transit', 'In transit', st.transit], ['delivered', 'Delivered', st.delivered], ['lost', 'Lost or damaged', st.lost], ['returns', 'Returns', st.returns], ['cancelled', 'Cancelled', st.cancelled], ['', 'All', st.all]];
  const card = (label, value, note, href, tone = '') => `<a class="ov-card ${tone}" href="${href}"><small>${esc(label)}</small><b>${esc(value)}</b><em>${esc(note)}</em></a>`;
  const ot = o.on_time;
  return `<section class="ov-panel">
    <div class="ov-panel__h"><div><h2>${esc(section ? `${SECTION_LABEL[section] || section} overview` : 'All transport overview')}</h2><small>Selected dates and filters</small></div>
      <nav class="ov-acts" aria-label="Service pages">${acts.map(([ic, l, h]) => `<a class="btn btn-outline btn-sm" href="${h}">${icon(ic, 15)}${l}</a>`).join('')}</nav></div>
    <div class="ov-cards">
      ${card('Orders today', o.today || 0, `${o.yesterday || 0} yesterday`, link({ stage: '', group: 'all', page: 1 }))}
      ${card('Active now', o.active || 0, 'Booked or moving', link({ stage: 'transit', group: 'all', page: 1 }))}
      ${card('Completed', o.completed || 0, 'All time', link({ stage: 'delivered', group: 'all', page: 1 }))}
      ${card('On-time delivery', ot == null ? '—' : `${ot}%`, ot == null ? 'Shows after your first delivery' : `${o.on_time_n} of ${o.on_time_of} on time`, link({ stage: 'delivered', group: 'all', page: 1 }), ot == null ? '' : ot >= 90 ? 'ov-card--go' : ot >= 75 ? 'ov-card--caution' : 'ov-card--stop')}
    </div>
    <nav class="ov-strip" aria-label="Order status">${strip.map(([k, l, n]) => `<a href="${k === 'returns' ? '#/my/returns' : link({ stage: k, group: 'all', page: 1 })}" class="${k !== 'returns' && k === stage ? 'on' : ''} ${k === 'lost' && n ? 'warn' : ''}" ${k !== 'returns' && k === stage ? 'aria-current="true"' : ''}><b>${n || 0}</b><small>${esc(l)}</small></a>`).join('')}</nav>
  </section>`;
}
const CHANNEL_OPTS = [['', 'All channels'], ['direct', 'Booked in UT Log'], ['online', 'All online stores'], ...Object.entries(CHANNEL).map(([k, [l]]) => [k, l])];
const aoHead = (search, sub) => `<div class="page-head ao-head"><div class="ao-head__t"><h1>All Orders</h1><small>${esc(sub)}</small></div>
    <div class="ao-head__r"><form id="sf" class="ao-search" role="search">${icon('search', 16)}<input class="input" type="search" name="search" value="${esc(search)}" placeholder="Order ID, provider, route or reference" aria-label="Search orders"></form>
      <a class="btn btn-primary ao-new" id="add" href="#/new-order">${icon('plus', 16)}New order</a></div></div>`;
export async function renderOrders(view, { query }) {
  const group = query.get('group') || 'all';
  const range = fromQuery(query, 'last30');
  const search = query.get('search') || '';
  const scope = query.get('scope') || 'all';
  const section = query.get('section') || '';
  const pay = query.get('pay') || '';
  const channel = query.get('channel') || '';
  const stage = query.get('stage') || '';
  const page = Number(query.get('page')) || 1;
  const link = (patch) => { const q = new URLSearchParams({ group, search, scope, section, pay, channel, stage, ...toQuery(range), ...patch }); [...q.keys()].forEach((k) => { if (!q.get(k) || (k === 'scope' && q.get(k) === 'all')) q.delete(k); }); return `#/my/orders?${q}`; };
  // Online stores: orders from connected marketplaces and stores, waiting to be shipped.
  if (section === 'website') {
    const head = `${aoHead('', 'Orders from Amazon, Flipkart, your store and other channels')}${serviceRow(section, link)}`;
    const site = await import('./website.js');
    const out = await site.render(view, { query, head, tabLink: (t) => `#/my/orders?section=website&wtab=${t}` });
    const sf = view.querySelector('#sf');
    if (sf) sf.addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/my/orders?search=${encodeURIComponent(e.target.search.value)}`; });
    return out;
  }
  view.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const r = await api('/hub/orders', { query: { scope: section ? '' : scope === 'all' ? 'transport' : scope, section: TRANSPORT.includes(section) ? section : '', group, ...toApi(range), search, pay, channel, stage, page, per_page: 15 } });
  const sm = r.summary || {};
  const fields = [{ key: 'section', label: 'Service', options: [['', 'All services'], ...TRANSPORT.map((k) => [k, SECTION_LABEL[k] || k])] }, { key: 'channel', label: 'Channel', options: CHANNEL_OPTS }];
  const chips = [section && ['section', SECTION_LABEL[section] || section], channel && ['channel', (CHANNEL_OPTS.find(([k]) => k === channel) || ['', channel])[1]], search && ['search', `“${search}”`]].filter(Boolean);
  view.innerHTML = `
    ${aoHead(search, 'Every vehicle, courier, truck, international and online-store shipment')}
    ${serviceRow(section, link, r.sections, sm.website_pending)}
    ${overviewPanel(section, r.overview || {}, stage, link)}
    <div class="ao-bar">
      <div class="ao-tools">${filterBtn(countActive(fields, { section, pay, channel }))}${dateRangeField(range)}${tableTools()}<button class="btn btn-outline" id="csv" type="button">${icon('download', 15)}Export</button></div>
    </div>
    ${ORDER_BULK}
    <div class="ao-meta"><span>${r.meta.pagination.total} ${r.meta.pagination.total === 1 ? 'order' : 'orders'}</span>${chips.map(([k, l]) => `<a class="ao-fchip" href="${link({ [k]: '', page: 1 })}" aria-label="Remove filter ${esc(l)}">${esc(l)}<span aria-hidden="true">×</span></a>`).join('')}${chips.length > 1 ? `<a class="link small" href="${link({ section: '', pay: '', channel: '', search: '', page: 1 })}">Clear all</a>` : ''}</div>
    ${r.data.length ? orderTable(r) : `<div class="card">${vehicleEmpty(search || group !== 'all' || stage || chips.length ? 'No orders match these filters.' : 'Create your first order to see it here.')}</div>`}`;
  const pg = view.querySelector('#pg');
  if (pg) pg.appendChild(pager(r.meta, (p) => { location.hash = link({ page: p }); }));
  const again = () => renderOrders(view, { query });
  view.querySelector('#add').addEventListener('click', (e) => { if (section && ['vehicle', 'courier', 'logistics'].includes(section)) { e.preventDefault(); location.hash = `#/new-order?type=${section}`; } });
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, fields, { section, pay, channel }, (v) => { location.hash = link({ ...v, page: 1 }); }));
  mountDateRange(view, range, (v) => { location.hash = link({ ...toQuery(v), page: 1 }); });
  view.querySelector('#sf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = link({ search: e.target.search.value, page: 1 }); });
  view.querySelector('#csv').addEventListener('click', () => downloadCsv('ut-log-orders.csv', csvRows(r.data)));
  wireOrders(view, r, again);
  wireTableTools(view, 'orders');
  const mb = document.createElement('div'); mb.className = 'mg-wrap'; const top = view.querySelector('.page-head'); if (top) { top.after(mb); mergeBanner(mb, again); }
}
const vehicleEmpty = (text) => `<div class="empty-scene">${scene('orders').value}<p>${esc(text)}</p><a class="btn btn-primary" href="#/vehicle/book">Create order now</a></div>`;

const CANCEL_REASONS = ['Plans changed', 'Booked by mistake', 'Found a better price', 'Pickup is delayed', 'Other'];
export async function cancelOne(x, again) {
  const charge = ['flight', 'bus', 'train', 'hotel', 'stay'].includes(x.kind) && !x.flex;
  const reason = await modal({ title: 'Cancel this booking?', body: `<p class="notop">${charge ? `25% is charged on cancelling this trip. The rest goes back to ${!x.pay_via || x.pay_via === 'wallet' ? 'your wallet' : `your ${PAY_LABEL[x.pay_via]}`}.` : `Prepaid amounts go back to ${!x.pay_via || x.pay_via === 'wallet' ? 'your wallet right away' : `your ${PAY_LABEL[x.pay_via]}`}.`}</p><label class="field">Reason<select class="select" id="why">${CANCEL_REASONS.map((r) => `<option>${r}</option>`).join('')}</select></label>`, footer: '<button class="btn btn-outline" data-close>Keep booking</button><button class="btn btn-danger" id="y">Cancel booking</button>', onMount: (el, close) => el.querySelector('#y').addEventListener('click', () => close(el.querySelector('#why').value)) });
  if (!reason) return;
  try { await api('/hub/orders/cancel', { method: 'POST', body: { id: x.id, reason } }); toast('Booking cancelled'); refresh(); again(); } catch (e) { toast(e.message, true); }
}

function orderMenu(anchor, x, again) {
  const items = [
    ['view', 'View details', () => { location.hash = `#/my/orders/${x.id}`; }],
    ['receipt', 'Download receipt', () => printReceipt(x)],
    ['slip', 'Print packing slip', () => printSlip(x)],
    x.pnr && ['ticket', 'Download e-ticket', () => printTicket(x)],
    x.flex && !x.rescheduled && x.status !== 'CANCELLED' && ['resched', 'Change date free', () => reschedule(x, again)],
    x.form && ['again', 'Book again', () => rebook(x)],
    x.group === 'delivered' && ['return', 'Create return', () => createReturn(x.id, again)],
    x.group === 'delivered' && !x.rating && ['rate', 'Rate this service', () => openRate(x, again)],
    x.booking_id && ['transit', 'delivered'].includes(x.group) && !x.claim && ['claim', 'Report a problem', () => openClaim(x, again)],
    ['new', 'assigned'].includes(x.group) && !x.sample && x.status !== 'PAY_LATER' && ['cancel', 'Cancel booking', () => cancelOne(x, again)],
    x.bk_input && ['new', 'assigned'].includes(x.group) && !x.stranded && ['shield', 'Demo: partner cancels', async () => { try { await api('/hub/orders/simulate-failure', { method: 'POST', body: { id: x.id } }); toast('The partner cancelled. See what happens next.'); setTimeout(again, 400); } catch (e) { toast(e.message, true); } }],
    ['help', 'Get help', () => { location.hash = `#/support?new=1&ref=${encodeURIComponent(x.id)}`; }],
  ].filter(Boolean);
  popover(anchor, `<ul class="pop__list">${items.map(([k, l]) => `<li><button type="button" data-a="${k}"><span>${esc(l)}</span></button></li>`).join('')}</ul>`, (el, close) => {
    el.style.width = '200px';
    el.style.left = Math.max(12, anchor.getBoundingClientRect().right - 200) + 'px';
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-a]'); if (!b) return; close(); items.find((i) => i[0] === b.dataset.a)[2](); });
  });
}
function printSlip(x) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print.', true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(x.id)}</title><style>body{font:14px/1.5 Inter,Segoe UI,sans-serif;width:4in;margin:16px auto;padding:14px;border:1px solid #15211E}h1{font-size:20px;margin:0 0 6px;letter-spacing:.04em}hr{border:0;border-top:1px dashed #15211E;margin:10px 0}small{color:#555}</style><h1>${esc(x.id)}</h1><small>${esc(x.provider)} · ${esc(x.title)}</small><hr><b>From</b><br>${esc(x.contact_name || '')}<br>${esc(x.pickup_address || x.sub || '')}<hr><b>To</b><br>${esc((x.receiver && x.receiver.name) || '')}<br>${esc(x.drop_address || '')}<hr>Weight: ${esc(x.weight || '—')} kg<br>Payment: ${x.pay_mode === 'cod' ? 'Pay on delivery' : 'Prepaid'}<script>print()<\/script>`);
  w.document.close();
}

// ---- order detail ----------------------------------------------------------------------------
// One page, three shapes: deliveries (timeline, route, partner), payments (receipt) and trips (ticket).
const STEPS = [['BOOKED', 'Booked'], ['ASSIGNED', 'Partner assigned'], ['PICKED_UP', 'Picked up'], ['IN_TRANSIT', 'In transit'], ['DELIVERED', 'Delivered']];
const STEP_OF = { BOOKED: 0, ASSIGNED: 1, ARRIVING: 1, PICKUP_SCHEDULED: 1, PICKED_UP: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 3, DELIVERED: 4, SUCCESS: 4 };
const SHIP = ['vehicle', 'courier', 'logistics', 'international'];
const TRIP = ['travel', 'rides'];
const KIND_ICON = { mobile: ['phone', 'green'], fastag: ['fastag', 'coral'], voucher: ['gift', 'rose'], gold: ['coin', 'amber'], transfer: ['rupee', 'green'], flight: ['plane', 'blue'], train: ['train', 'green'], bus: ['bus', 'coral'], hotel: ['hotel', 'violet'], stay: ['bed', 'rose'], ride: ['ride', 'amber'] };
const SEC_ICON = { vehicle: ['bike', 'green'], courier: ['parcel', 'amber'], logistics: ['truck', 'blue'], international: ['globe', 'blue'], travel: ['plane', 'blue'], rides: ['ride', 'amber'], recharge: ['phone', 'green'], bills: ['bill', 'amber'], business: ['briefcase', 'violet'] };
// Status by meaning: done = go green, moving = trust blue, waiting = caution amber, cancelled = stop red.
const toneOf = (x) => (x.status === 'CANCELLED' ? 'stop' : ['delivered'].includes(x.group) || ['SUCCESS', 'DELIVERED'].includes(x.status) ? 'go' : x.group === 'transit' || x.group === 'assigned' ? 'trust' : 'caution');
const copyBtn = (v, label) => `<button class="od-copy" type="button" data-copy="${esc(v)}" aria-label="Copy ${esc(label)}" title="Copy">${icon('file', 13)}</button>`;

export async function renderOrderDetail(view, { id }) {
  view.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  const x = await api('/hub/orders/show', { query: { id } });
  const t = x.tracking;
  const type = SHIP.includes(x.section) ? 'ship' : TRIP.includes(x.section) ? 'trip' : 'pay';
  const [ic, tone] = KIND_ICON[x.kind] || BILL_ICON[x.kind] || SEC_ICON[x.section] || ['receipt', 'blue'];
  const st = toneOf(x);
  const label = x.status === 'CANCELLED' ? 'Cancelled' : x.label || (st === 'go' ? 'Completed' : 'In progress');
  const row = (k, v, extra = '') => (v ? `<div><dt>${esc(k)}</dt><dd>${esc(v)}${extra}</dd></div>` : '');

  // Main action for this kind of order.
  const again = x.section === 'recharge' && x.kind === 'mobile' ? [`#/pay/mobile?number=${encodeURIComponent(x.sub || '')}`, 'Recharge again']
    : x.section === 'bills' && BILL_ICON[x.kind] ? [`#/pay/bills?cat=${encodeURIComponent(x.kind)}&account=${encodeURIComponent(x.sub || '')}&biller=${encodeURIComponent(x.provider || '')}`, 'Pay again'] : null;
  const primary = x.booking_id && x.status !== 'CANCELLED' && x.group !== 'delivered' ? '<button class="btn btn-primary" id="track" type="button">' + icon('radar', 16) + 'Live tracking</button>'
    : x.pnr ? '<button class="btn btn-primary" id="ticket" type="button">' + icon('ticket', 16) + 'E-ticket</button>'
      : '<button class="btn btn-primary" id="rcpt" type="button">' + icon('download', 16) + 'Receipt</button>';

  const hero = `<section class="card od-hero od-hero--${st}">
      <a class="od-back" href="#/my/orders">${icon('chevron', 15).replace('class="li"', 'class="li od-flip"')}All orders</a>
      <div class="od-hero__row">
        <span class="od-hero__ico">${tile(ic, tone).value}</span>
        <div class="grow"><h1>${esc(x.title)}</h1><p>${esc(x.provider)}${x.sub ? ` · ${esc(x.sub)}` : ''}</p>
          <div class="od-hero__meta"><span class="mono">${esc(x.id)}</span>${copyBtn(x.id, 'order ID')}<span class="dot">·</span>${esc(dateTime(x.at))}${x.reference ? `<span class="dot">·</span>${esc(x.reference)}` : ''}</div></div>
        <div class="od-hero__r"><span class="od-status od-status--${st}"><i></i>${esc(label)}</span><b class="od-amt" translate="no">${esc(money(x.amount))}</b><small>${x.pay_mode === 'cod' ? 'Pay on delivery' : `Paid by ${esc(PAY_LABEL[x.pay_via] || 'wallet')}`}</small></div>
      </div>
      <div class="od-acts">${primary}${x.section === 'travel' && ['flight', 'train', 'bus'].includes(x.kind) && x.status !== 'CANCELLED' ? `<button class="btn btn-outline" id="lug" type="button">${icon('parcel', 16)}Send luggage ahead</button>` : ''}${again ? `<a class="btn btn-outline" href="${again[0]}">${icon('repeat', 16)}${again[1]}</a>` : x.form ? `<button class="btn btn-outline" id="again" type="button">${icon('repeat', 16)}Book again</button>` : ''}<a class="btn btn-outline" href="#/support?new=1&ref=${encodeURIComponent(x.id)}">${icon('help', 16)}Get help</a><button class="btn btn-outline" id="more" type="button">More</button></div>
    </section>`;

  // Delivery progress, with the time of each step when we have it.
  const timeOf = (k) => { if (!t || !t.timeline) return ''; const e = t.timeline.find((ev) => ev.status === k || (k === 'ASSIGNED' && /assign|arriv/i.test(ev.label || ''))); return e ? dateTime(e.at) : ''; };
  const step = x.status === 'CANCELLED' ? -1 : STEP_OF[x.status] ?? 0;
  const progress = `<section class="card od-steps"><div class="od-steps__h"><h2 class="notop">Delivery progress</h2>${x.promised_by && x.group !== 'delivered' ? `<span class="od-eta">${icon('clock', 14)}Arrives by ${esc(dateTime(x.promised_by))}</span>` : ''}</div>
      <ol class="od-track" style="--done:${Math.max(0, step) / (STEPS.length - 1)}">${STEPS.map(([k, l], n) => `<li class="${n < step || (n === step && step === STEPS.length - 1) ? 'done' : n === step ? 'now' : ''}"><span class="od-track__dot">${n < step || (n === step && step === STEPS.length - 1) ? icon('check', 14) : n + 1}</span><b>${esc(l)}</b><small>${esc(timeOf(k))}</small></li>`).join('')}</ol></section>`;

  const route = (x.pickup_address || x.drop_address) ? `<section class="card"><h2 class="notop">Route</h2><div class="od-route">
      <div class="od-route__pt"><span class="od-pin od-pin--from">${icon('pin', 15)}</span><div><small>Pickup</small><b>${esc(x.pickup_address || x.sub || '')}</b>${x.contact_name || x.contact_phone ? `<span class="od-who">${icon('user', 13)}${esc([x.contact_name, x.contact_phone].filter(Boolean).join(' · '))}</span>` : ''}</div></div>
      <i class="od-route__line" aria-hidden="true"></i>
      <div class="od-route__pt"><span class="od-pin od-pin--to">${icon('map', 15)}</span><div><small>Drop</small><b>${esc(x.drop_address || '')}</b>${x.receiver ? `<span class="od-who">${icon('user', 13)}${esc([x.receiver.name, x.receiver.phone].filter(Boolean).join(' · '))}</span>` : ''}</div></div>
    </div></section>` : '';
  const d = t && t.driver;
  const partner = `<section class="card"><h2 class="notop">Partner</h2><div class="od-partner"><span class="od-av">${esc(String(x.provider || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span><div class="grow"><b>${esc(x.provider)}</b><small>${esc(x.provider_type || x.title)}</small></div><span class="vbadge2" title="Licence, GST and KYC checked by UT Log"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.400 9.300 8 11 4.600-1.700 8-6 8-11V5z"/><path d="m8.500 12 2.500 2.500 4.500-5" fill="none"/></svg>Verified</span></div>
      ${d && d.name ? `<dl class="od-kv">${row('Driver', d.name)}${row('Vehicle', d.vehicle_no)}${row('Rating', d.rating ? `★ ${d.rating}` : '')}${row('Pickup OTP', x.otp && x.group !== 'delivered' ? String(x.otp) : '')}</dl>` : ''}</section>`;
  const pkg = `<section class="card"><h2 class="notop">Package</h2><dl class="od-kv">${row('Service', x.title)}${row('Weight', x.weight ? `${x.weight} kg` : '')}${row('Contents', x.form && x.form.category)}${row('Declared value', x.declared ? money(x.declared) : '')}${row('Your reference', x.reference)}${row('Collect from buyer', x.cod_collect ? money(x.cod_collect) : '')}${row('Pickup scheduled', x.scheduled_for && dateTime(x.scheduled_for))}</dl></section>`;
  const activity = t && t.timeline && t.timeline.length ? `<section class="card"><h2 class="notop">Activity</h2><ol class="od-act">${[...t.timeline].reverse().map((e, i) => `<li class="${i === 0 ? 'now' : ''}"><i></i><div><b>${esc(e.label)}</b><small>${esc(dateTime(e.at))}</small></div></li>`).join('')}</ol></section>` : '';

  // Payments: a receipt, not a delivery.
  const isMobile = x.kind === 'mobile';
  const receipt = `<section class="card od-rcpt"><div class="od-rcpt__ok"><span>${icon(x.status === 'CANCELLED' ? 'x' : 'check', 22)}</span><div><b>${x.status === 'CANCELLED' ? 'Payment cancelled' : 'Payment successful'}</b><small>${esc(dateTime(x.at))}</small></div></div>
      <dl class="od-kv od-kv--rcpt">
        ${row(isMobile ? 'Mobile number' : x.section === 'bills' ? 'Account' : 'Paid to', x.sub)}
        ${row(isMobile ? 'Operator' : 'Biller', x.provider)}
        ${row('Plan', x.plan)}
        ${row(x.bbps_ref ? 'BBPS reference' : 'Operator reference', x.bbps_ref || x.operator_ref, x.bbps_ref || x.operator_ref ? copyBtn(x.bbps_ref || x.operator_ref, 'reference') : '')}
        ${row('Gift card code', x.voucher_code)}
        ${row('Transaction ID', x.id, copyBtn(x.id, 'transaction ID'))}
        ${row('Paid from', x.pay_mode === 'cod' ? 'Pay on delivery' : PAY_LABEL[x.pay_via] || 'UT Log wallet')}
      </dl></section>`;

  // Trips: a ticket.
  const ticket = x.legs && x.legs.length ? `<section class="card od-legs"><h2 class="notop">Connecting journey · change at ${esc(x.change_at || '')}</h2>${x.legs.map((l) => `<div class="od-ticket"><div class="od-ticket__l"><small>${esc(l.provider)} · ${esc(l.sub)}</small><b>${esc(l.title)}</b><span>${esc(l.date)} · ${esc(l.dep)} → ${esc(l.arr)}${l.next_day ? ' (+1 day)' : ''}</span></div><div class="od-ticket__r"><small>PNR</small><b class="mono">${esc(l.pnr)}</b>${copyBtn(l.pnr, 'PNR')}</div></div>`).join('')}</section>` : `<section class="card od-ticket"><div class="od-ticket__l"><small>${esc(x.provider)}</small><b>${esc(x.title)}</b><span>${esc(x.sub || '')}</span>${x.seats && x.seats.length ? `<em>Seats ${esc(x.seats.join(', '))}</em>` : ''}</div><div class="od-ticket__r">${x.pnr ? `<small>PNR</small><b class="mono">${esc(x.pnr)}</b>${copyBtn(x.pnr, 'PNR')}` : `<small>Booking</small><b class="mono">${esc(x.id)}</b>`}</div></section>`;

  const charges = `<section class="card od-charges"><h2 class="notop">Charges</h2><dl class="od-bill">
      ${(x.gross && x.gross !== x.amount) || x.fee || x.insurance ? `<div><dt>${SHIP.includes(x.section) || TRIP.includes(x.section) ? 'Fare' : 'Amount'}</dt><dd translate="no">${esc(money((x.gross || x.amount) - (x.fee || 0) - (x.insurance || 0)))}</dd></div>` : ''}
      ${x.fee ? `<div><dt>${x.pay_mode === 'cod' ? 'Pay on delivery fee' : 'Convenience fee'}</dt><dd translate="no">${esc(money(x.fee))}</dd></div>` : ''}
      ${x.insurance ? `<div><dt>Insurance</dt><dd translate="no">${esc(money(x.insurance))}</dd></div>` : ''}
      ${x.discount ? `<div class="save"><dt>Coupon ${esc(x.coupon || '')}</dt><dd translate="no">−${esc(money(x.discount))}</dd></div>` : ''}
      ${x.points_used ? `<div class="save"><dt>Reward points</dt><dd translate="no">−${esc(money(x.points_used))}</dd></div>` : ''}
      <div class="od-bill__t"><dt>${x.pay_mode === 'cod' ? 'To pay on delivery' : 'Total paid'}</dt><dd translate="no">${esc(money(x.amount))}</dd></div>
      ${x.refund ? `<div class="save"><dt>Refunded to ${esc(x.refund_to || 'wallet')}</dt><dd translate="no">${esc(money(x.refund))}</dd></div>` : ''}
    </dl>${x.cashback || x.earned ? `<div class="od-earn">${x.cashback ? `<span>${icon('tag', 14)}${esc(money(x.cashback))} cashback</span>` : ''}${x.earned ? `<span>${icon('star', 14)}${x.earned} points earned</span>` : ''}</div>` : ''}</section>`;
  const extras = `${x.return ? `<section class="card"><h2 class="notop">Return</h2><p class="notop"><span class="badge badge-amber">${esc(x.return.label)}</span></p><a class="link" href="#/my/returns">View return</a></section>` : ''}
    ${x.weight_case ? `<section class="card"><h2 class="notop">Weight check</h2><dl class="od-kv">${row('Declared', `${x.weight_case.declared} kg`)}${row('Charged', `${x.weight_case.charged} kg`)}</dl><a class="link" href="#/my/weight?tab=disputes">Review</a></section>` : ''}
    ${x.claim ? `<section class="card od-claim od-claim--${x.claim.status === 'APPROVED' ? 'ok' : x.claim.status === 'WITH_CARRIER' ? 'carrier' : 'wait'}"><h2 class="notop">${icon('shield', 16)}${esc(x.claim.type)} claim${x.claim.auto ? ' · filed for you' : ''}</h2>${x.claim.evidence ? `<p class="eg-evid notop">${icon('check', 14)}${esc(x.claim.evidence.kind)} attached · ${x.claim.evidence.seconds}s${x.claim.evidence.sealed ? ', box sealed at start' : ''} · seal ${esc(x.claim.evidence.seal)}</p>` : x.claim.source === 'receiver' ? '<p class="muted small notop">No unboxing video, so the insurer checks it by hand.</p>' : ''}<p class="notop">${x.claim.status === 'APPROVED' ? `${esc(x.claim.insurer || 'Insurer')} paid <b translate="no">${esc(money(x.claim.payout))}</b> to your wallet.` : x.claim.status === 'WITH_CARRIER' ? `Not insured, so it went to ${esc(x.claim.carrier)} under their own liability (up to <span translate="no">${esc(money(x.claim.carrier_limit || 0))}</span>). We follow it up for you.` : `${esc(x.claim.insurer || 'The insurer')} is checking the photos. Payout about <b translate="no">${esc(money(x.claim.payout))}</b>.`}</p>${x.claim.auto ? `<small class="muted">Filed automatically from the ${esc(x.claim.source)}${x.claim.note ? `: "${esc(x.claim.note)}"` : ''}.</small>` : ''}</section>` : ''}
    ${x.can_return ? '<button class="btn btn-outline btn-block" id="ret" type="button">Create return</button>' : ''}
    <section class="card od-help"><b>Need help with this order?</b><small>Quote ${esc(x.id)}. Most questions are answered within an hour.</small><a class="btn btn-outline btn-sm" href="#/support?new=1&ref=${encodeURIComponent(x.id)}">${icon('chat', 15)}Chat with support</a></section>`;

  const freight = x.freight ? '<section class="card od-freight" id="odFreight"><div class="skeleton" style="height:140px"></div></section>' : '';
  const rx = x.booking_id && !['delivered', 'cancelled'].includes(x.group) && x.status !== 'CANCELLED' ? '<section class="card od-rx" id="odRx"><div class="skeleton" style="height:90px"></div></section>' : '';
  const main = type === 'ship' ? `${strandedHtml(x)}${x.status === 'CANCELLED' ? '' : progress}${rx}${freight}${route}<div class="od-two">${partner}${pkg}</div><div class="${x.drop_address ? 'od-two eg-two' : ''}"><section class="card eg-odcard" id="odWp"><div class="skeleton" style="height:120px"></div></section>${x.drop_address ? '<section class="card eg-odcard" id="odAddr"><div class="skeleton" style="height:120px"></div></section>' : ''}</div>${activity}`
    : type === 'trip' ? `${ticket}${route}${activity}`
      : receipt;
  view.innerHTML = `<div class="od">${hero}${x.sample ? '<p class="od-sample">This is a sample order from your account history.</p>' : ''}
    <div class="dash dash--even od-grid"><div class="dash__main od-main">${main}</div><aside class="dash__side">${charges}${extras}</aside></div></div>`;

  const redo = () => renderOrderDetail(view, { id });
  const on = (sel, fn) => { const el = view.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('#track', () => openTracking(id));
  on('#ticket', () => printTicket(x));
  on('#rcpt', () => printReceipt(x));
  on('#again', () => rebook(x));
  on('#more', (e) => orderMenu(e.currentTarget, x, redo));
  on('#ret', () => createReturn(id, redo));
  if (x.freight) freightCard(view.querySelector('#odFreight'), x, redo);
  if (view.querySelector('#odRx')) receiverCard(view.querySelector('#odRx'), x, redo);
  if (view.querySelector('#odWp')) weightProofCard(view.querySelector('#odWp'), x);
  if (view.querySelector('#odAddr')) addressCard(view.querySelector('#odAddr'), x);
  wireStranded(view, x, redo);
  on('#lug', () => luggageAhead(x, redo));
  view.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } catch (e) { toast(b.dataset.copy); } }));
}

// ---- returns ----------------------------------------------------------------------------------
const RTABS = [['all', 'All'], ['requested', 'Requested'], ['progress', 'In progress'], ['completed', 'Completed'], ['closed', 'Closed']];
async function createReturn(orderId, done, desk) {
  const d = await api('/hub/returns', { query: { desk, per_page: 1 } });
  if (!d.eligible.length) { toast('No delivered orders can be returned right now.', true); return; }
  if (orderId && !d.eligible.some((o) => o.id === orderId)) { toast('This order cannot be returned. It may already have a return.', true); return; }
  modal({
    title: 'Create a return',
    body: `<form class="form-grid" id="rf" novalidate><label class="field full">Order<select class="select" name="order_id">${d.eligible.map((o) => `<option value="${esc(o.id)}" data-fee="${o.fee}" ${o.id === orderId ? 'selected' : ''}>${esc(o.id)} · ${esc(o.title)} · ${esc(o.sub)}</option>`).join('')}</select></label>
      <div class="field full"><span>Type</span><div class="pay2"><label class="pay"><input type="radio" name="type" value="return" checked><span><b>Return</b><small>Bring the parcel back</small></span></label><label class="pay"><input type="radio" name="type" value="exchange"><span><b>Exchange</b><small>Bring back and resend</small></span></label></div></div>
      <label class="field full">Reason<select class="select" name="reason">${d.reason_list.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label><label class="field full">Notes (optional)<textarea class="input" name="note" rows="2"></textarea></label></form>
      <p class="callout" id="fee"></p><p class="form-error" id="err"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Create return</button>',
    onMount(el, close) {
      const f = el.querySelector('#rf');
      const fee = () => { el.querySelector('#fee').textContent = `Reverse shipping: ${money(f.order_id.selectedOptions[0].dataset.fee)}, charged to your wallet when the return is approved.`; };
      f.order_id.addEventListener('change', fee); fee();
      const go = el.querySelector('#go');
      go.addEventListener('click', () => withBusy(go, async () => { try { const r = await api('/hub/returns', { method: 'POST', body: formData(f) }); close(r); toast(`Return ${r.id} created`); done(); } catch (e) { el.querySelector('#err').textContent = e.message; } }));
    },
  });
}

const rf = { type: '', reason: '' };
// Return progress, by meaning: waiting = amber, moving = blue, done = green, closed = grey.
const RSTEPS = ['Requested', 'Approved', 'Picked up', 'On the way back', 'Received'];
const RSTEP_OF = { REQUESTED: 0, APPROVED: 1, PICKUP_SCHEDULED: 1, PICKED_UP: 2, IN_TRANSIT: 3, RECEIVED: 4 };
const RTONE = { requested: 'caution', progress: 'trust', completed: 'go', closed: 'muted' };
function returnCard(x) {
  const step = RSTEP_OF[x.status];
  const tone = RTONE[x.group] || 'muted';
  const ex = x.type === 'exchange';
  return `<article class="rc rc--${tone}">
    <div class="rc__h">${tile(ex ? 'repeat' : 'returnbox', ex ? 'violet' : 'coral').value}
      <div class="grow"><div class="rc__id"><b class="mono">${esc(x.id)}</b><span class="rc__type rc__type--${ex ? 'ex' : 'ret'}">${ex ? 'Exchange' : 'Return'}</span></div>
        <small>Order <a class="link mono" href="#/my/orders/${esc(x.order_id)}">${esc(x.order_id)}</a> · ${esc(dateTime(x.at))}</small></div>
      <span class="rc__st rc__st--${tone}"><i></i>${esc(x.label)}</span></div>
    <div class="rc__body">
      <span class="rc__reason">${icon('info', 13)}${esc(x.reason)}</span>${x.note ? `<span class="rc__note">“${esc(x.note)}”</span>` : ''}
      <div class="rc__meta"><span>${icon('truck', 13)}${esc(x.provider || '—')}</span><span>${icon('map', 13)}${esc(x.sub || '—')}</span><span translate="no">${icon('wallet', 13)}Reverse shipping ${esc(money(x.fee))}</span></div>
      ${step != null ? `<ol class="rc__steps" style="--done:${step / (RSTEPS.length - 1)}">${RSTEPS.map((l, n) => `<li class="${n < step || step === RSTEPS.length - 1 ? 'done' : n === step ? 'now' : ''}"><i></i><small>${esc(l)}</small></li>`).join('')}</ol>` : ''}
      ${x.reject_note ? `<p class="rc__rej">${icon('x', 14)}Rejected: ${esc(x.reject_note)}</p>` : ''}
    </div>
    <div class="rc__acts">${x.status === 'REQUESTED' ? `<button class="btn btn-primary btn-sm" data-ok="${esc(x.id)}" type="button">${icon('check', 14)}Approve</button><button class="btn btn-outline btn-sm" data-no="${esc(x.id)}" type="button">Reject</button>` : ''}${['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED'].includes(x.status) ? `<button class="btn btn-ghost btn-sm rc__cancel" data-cancel="${esc(x.id)}" type="button">Cancel return</button>` : ''}<span class="spacer"></span><button class="btn btn-ghost btn-sm" data-tl="${esc(x.id)}" type="button">${icon('clock', 14)}Timeline</button></div>
  </article>`;
}
export async function renderReturns(view, { query, desk, base = '#/my/returns' }) {
  const group = query.get('group') || 'all';
  const search = query.get('search') || '';
  const page = Number(query.get('page')) || 1;
  view.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const r = await api('/hub/returns', { query: { desk, group, search, page, per_page: 15 } });
  const link = (patch) => { const q = new URLSearchParams({ group, search, ...patch }); if (!q.get('search')) q.delete('search'); return `${base}?${q}`; };
  const rfields = [{ key: 'type', label: 'Type', options: [['', 'All'], ['return', 'Return'], ['exchange', 'Exchange']] }, { key: 'reason', label: 'Reason', options: [['', 'All reasons'], ...r.reason_list.map((x) => [x, x])] }];
  r.data = r.data.filter((x) => (!rf.type || x.type === rf.type) && (!rf.reason || x.reason === rf.reason));
  const c = r.counts;
  const rate = r.return_rate;
  const card = (label, value, note, href, tone = '') => `<a class="ov-card ${tone}" href="${href}"><small>${esc(label)}</small><b>${esc(value)}</b><em>${esc(note)}</em></a>`;
  const strip = [['requested', 'Waiting approval'], ['progress', 'In progress'], ['completed', 'Completed'], ['closed', 'Closed'], ['all', 'All']];
  const newBtn = `<button class="btn btn-primary ao-new" id="new" type="button" ${r.eligible.length ? '' : 'disabled'}>${icon('plus', 16)}Create return</button>`;
  view.innerHTML = `
    ${desk ? `<div class="desk-bar"><span class="spacer"></span>${newBtn}</div>` : `<div class="page-head ao-head"><div class="ao-head__t"><h1>All Returns</h1><small>Reverse pickups and exchanges for your delivered shipments</small></div>
      <div class="ao-head__r"><form id="rsf" class="ao-search" role="search">${icon('search', 16)}<input class="input" type="search" name="search" value="${esc(search)}" placeholder="Return ID, order ID or reason" aria-label="Search returns"></form>${newBtn}</div></div>`}
    <section class="ov-panel">
      <div class="ov-panel__h"><div><h2>Returns overview</h2><small>${r.eligible.length} delivered ${r.eligible.length === 1 ? 'order can' : 'orders can'} still be returned · ${r.policy.window_days}-day window</small></div>
        <nav class="ov-acts">${filterBtn(countActive(rfields, rf))}</nav></div>
      <div class="ov-cards">
        ${card('Waiting for you', c.requested, c.requested ? 'Approve or reject' : 'Nothing to review', link({ group: 'requested', page: 1 }), c.requested ? 'ov-card--caution' : '')}
        ${card('On the way back', c.progress, 'Approved and moving', link({ group: 'progress', page: 1 }))}
        ${card('Completed', c.completed, 'Received back', link({ group: 'completed', page: 1 }))}
        ${card('Return rate', `${rate}%`, rate <= 5 ? 'Healthy · of delivered orders' : 'Of delivered orders', link({ group: 'all', page: 1 }), rate <= 5 ? 'ov-card--go' : rate <= 10 ? 'ov-card--caution' : 'ov-card--stop')}
      </div>
      <nav class="ov-strip ov-strip--5" aria-label="Return status">${strip.map(([k, l]) => `<a href="${link({ group: k, page: 1 })}" class="${k === group ? 'on' : ''}" ${k === group ? 'aria-current="true"' : ''}><b>${c[k] || 0}</b><small>${esc(l)}</small></a>`).join('')}</nav>
    </section>
    <div class="rt-grid">
      <section class="rt-main">
        ${r.data.length ? `<div class="rc-list">${r.data.map(returnCard).join('')}</div><div id="pg"></div>` : c.all && group !== 'all' ? `<div class="card rt-empty rt-empty--sm">${icon('check', 26)}<p>Nothing ${esc((strip.find(([k]) => k === group) || [, ''])[1].toLowerCase())} right now.</p><a class="link" href="${link({ group: 'all', page: 1 })}">See all returns</a></div>` : `
          <div class="card rt-empty"><div class="rt-empty__art">${scene('returns').value}</div>
            <h2>No returns yet</h2><p class="muted">When a receiver sends something back, create a return here. We book the reverse pickup and track it until it reaches you.</p>
            <ol class="rt-how"><li><span>1</span><b>Create a return</b><small>Pick a delivered order and the reason</small></li><li><span>2</span><b>Approve it</b><small>Reverse shipping is charged to your wallet</small></li><li><span>3</span><b>We pick it up</b><small>Track it back to your address</small></li></ol>
            ${r.eligible.length ? `<button class="btn btn-primary" id="new2" type="button">${icon('plus', 16)}Create your first return</button>` : ''}</div>`}
      </section>
      <aside class="rt-side">
        <section class="card"><h2 class="notop">Why parcels come back</h2>${r.reasons.length ? hbarsCount(r.reasons) : `<div class="rt-hint">${icon('trend', 18)}<p>Reasons show up here after your first return, so you can spot packing or address problems early.</p></div>`}</section>
        ${desk ? '' : `<section class="card rt-pol"><h2 class="notop">Return policy</h2><form id="pf">
          <span class="rt-pol__l">Return window</span>
          <div class="rt-seg" role="radiogroup" aria-label="Return window">${[7, 15, 30].map((d) => `<label><input type="radio" name="wd" value="${d}" ${r.policy.window_days === d ? 'checked' : ''}><span>${d} days</span></label>`).join('')}<label><input type="radio" name="wd" value="custom" ${[7, 15, 30].includes(r.policy.window_days) ? '' : 'checked'}><span>Custom</span></label></div>
          <label class="field rt-custom" ${[7, 15, 30].includes(r.policy.window_days) ? 'hidden' : ''}>Days<input class="input" name="window_days" inputmode="numeric" value="${r.policy.window_days}"></label>
          <label class="rt-switch"><span><b>Approve automatically</b><small>Skip the review step for new requests</small></span><span class="switch"><input type="checkbox" name="auto_approve" ${r.policy.auto_approve ? 'checked' : ''} aria-label="Approve returns automatically"><i></i></span></label>
          <p class="form-error" id="pErr"></p><button class="btn btn-outline btn-sm" type="submit">Save policy</button></form></section>`}
      </aside>
    </div>`;
  const pg = view.querySelector('#pg');
  if (pg) pg.appendChild(pager(r.meta, (p) => { location.hash = link({ page: p }); }));
  const again = () => renderReturns(view, { query, desk, base });
  view.querySelector('#new').addEventListener('click', () => createReturn(null, again, desk));
  const n2 = view.querySelector('#new2'); if (n2) n2.addEventListener('click', () => createReturn(null, again, desk));
  const sf = view.querySelector('#rsf'); if (sf) sf.addEventListener('submit', (e) => { e.preventDefault(); location.hash = link({ search: e.target.search.value, page: 1 }); });
  const pf = view.querySelector('#pf');
  if (pf) {
    pf.addEventListener('change', (e) => { if (e.target.name === 'wd') { const custom = e.target.value === 'custom'; pf.querySelector('.rt-custom').hidden = !custom; if (!custom) pf.window_days.value = e.target.value; } });
    pf.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/hub/returns/policy', { method: 'POST', body: { window_days: pf.window_days.value, auto_approve: pf.auto_approve.checked } }); toast('Return policy saved'); again(); } catch (x) { view.querySelector('#pErr').textContent = x.message; } });
  }
  view.onclick = async (e) => {
    const flt = e.target.closest('#flt');
    if (flt) { openFilters(flt, rfields, rf, (v) => { Object.assign(rf, v); again(); }); return; }
    const ok = e.target.closest('[data-ok]'); const no = e.target.closest('[data-no]'); const ca = e.target.closest('[data-cancel]'); const tl = e.target.closest('[data-tl]');
    try {
      if (ok) { await withFunds(() => api('/hub/returns/approve', { method: 'POST', body: { id: ok.dataset.ok } })); toast('Return approved. Reverse pickup booked.'); refresh(); again(); }
      if (ca) { await api('/hub/returns/cancel', { method: 'POST', body: { id: ca.dataset.cancel } }); toast('Return cancelled'); refresh(); again(); }
      if (no) rejectReturn(no.dataset.no, again);
      if (tl) { const x = r.data.find((y) => y.id === tl.dataset.tl); modal({ title: `Timeline · ${x.id}`, body: `<ol class="od-act">${x.timeline.map((t, i) => `<li class="${i === 0 ? 'now' : ''}"><i></i><div><b>${esc(t.label)}</b><small class="block">${esc(dateTime(t.at))}</small></div></li>`).join('')}</ol>` }); }
    } catch (x) { if (!x.quiet) toast(x.message, true); }
  };
}
const hbarsCount = (rows) => { const max = Math.max(...rows.map((r) => r.amount)); return `<div class="hbars">${rows.map((r) => `<div class="hbar hbar--wide"><span class="hbar__l">${esc(r.name)}</span><span class="hbar__t"><i style="width:${(r.amount / max) * 100}%"></i></span><b>${r.amount}</b></div>`).join('')}</div>`; };
function rejectReturn(id, done) {
  modal({
    title: 'Reject this return',
    body: '<label class="field">Reason shown to the customer<textarea class="input" id="n" rows="3"></textarea></label><p class="form-error" id="e"></p>',
    footer: '<button class="btn btn-outline" data-close>Back</button><button class="btn btn-danger" id="y">Reject return</button>',
    onMount: (el, close) => el.querySelector('#y').addEventListener('click', async () => { try { await api('/hub/returns/reject', { method: 'POST', body: { id, note: el.querySelector('#n').value } }); close(true); toast('Return rejected'); done(); } catch (x) { el.querySelector('#e').textContent = x.message; } }),
  });
}

// ---- truck paperwork --------------------------------------------------------------------------
// Consignment note (LR), e-way bill, proof of delivery and detention, in one card on the order.
async function freightCard(el, x, redo) {
  if (!el) return;
  let f;
  try { f = await api('/hub/freight', { query: { id: x.id } }); } catch (e) { el.remove(); return; }
  const dt = f.detention; const e = f.ewb; const pod = f.pod;
  const ewbLive = e && e.status === 'ACTIVE';
  const left = ewbLive ? Math.max(0, Date.parse(e.valid_until) - Date.now()) : 0;
  const doc = (ic, title, sub, state, actions) => `<li class="fd"><span class="fd__ico fd__ico--${state}">${icon(ic, 18)}</span><div class="grow"><b>${title}</b><small>${sub}</small></div><div class="fd__a">${actions}</div></li>`;
  const wait = (m) => (m == null ? 'not yet' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);
  el.innerHTML = `<div class="od-steps__h"><h2 class="notop">Freight documents</h2><span class="badge">${esc(f.vehicle || 'Truck')} · ${esc(f.vehicle_no || '')}</span></div>
    <ul class="fd-list">
      ${doc('file', `Consignment note <span class="mono">${esc(f.lr)}</span>`, 'The lorry receipt for this load. The driver carries it; the receiver signs it at delivery.', 'ok', '<button class="btn btn-outline btn-sm" type="button" data-fd="lr">View &amp; print</button>')}
      ${doc('receipt', ewbLive ? `E-way bill <span class="mono">${esc(e.no)}</span>` : 'E-way bill', ewbLive ? `Valid until ${esc(dateTime(e.valid_until))} · ${Math.max(1, Math.round(left / 864e5))} day${Math.max(1, Math.round(left / 864e5)) === 1 ? '' : 's'} left · ${e.part_b ? `vehicle ${esc(e.vehicle_no)}` : 'vehicle not added yet'}` : e && e.status === 'CANCELLED' ? 'Cancelled. Generate a new one before the truck moves.' : f.needs_ewb ? '<b class="neg">Needed:</b> goods worth over ₹50,000 need an e-way bill before the truck moves.' : 'Needed when the goods are worth over ₹50,000. Generate one any time.', ewbLive ? 'ok' : f.needs_ewb ? 'warn' : 'off',
        ewbLive ? '<button class="btn btn-outline btn-sm" type="button" data-fd="ewbprint">Print</button><button class="link" type="button" data-fd="ewbcancel">Cancel</button>' : '<button class="btn btn-primary btn-sm" type="button" data-fd="ewb">Generate</button>')}
      ${doc('check', 'Proof of delivery', pod ? `Received by ${esc(pod.receiver_name)} · ${esc(dateTime(pod.at))}${pod.shortage || pod.damage ? ` · <b class="neg">${[pod.shortage && 'shortage', pod.damage && 'damage'].filter(Boolean).join(' and ')} noted</b>` : ''}` : 'Upload the signed LR or a photo at delivery. It settles the trip and any claim.', pod ? 'ok' : 'off', pod ? '<button class="btn btn-outline btn-sm" type="button" data-fd="podview">View</button>' : '<button class="btn btn-outline btn-sm" type="button" data-fd="pod">Upload</button>')}
      ${doc('clock', `Detention (waiting) charges${dt.paid ? ' · paid' : dt.due ? ' · due' : dt.charge ? ' · estimate' : ''}`, `${dt.free_hours} hours free at each end, then ₹${dt.rate_per_hour} an hour. ${dt.loading_mins == null ? 'Loading has not started yet.' : `Loading took ${wait(dt.loading_mins)}${dt.unloading_mins == null ? ', unloading not yet.' : `, unloading ${wait(dt.unloading_mins)}.`}`}`, dt.paid ? 'ok' : dt.charge ? 'warn' : 'ok', `<b class="fd__amt ${dt.charge && !dt.paid ? 'neg' : ''}" translate="no">${dt.charge ? esc(money(dt.charge)) : '₹0'}</b>${dt.due ? '<button class="btn btn-primary btn-sm" type="button" data-fd="detpay">Pay</button>' : ''}`)}
    </ul>`;
  el.onclick = async (ev) => {
    const b = ev.target.closest('[data-fd]'); if (!b) return;
    const k = b.dataset.fd;
    if (k === 'lr') return printLr(x, f);
    if (k === 'detpay') { const run = (ex) => api('/hub/freight/detention/pay', { method: 'POST', body: { id: x.id, ...ex } }); const r = await walletCheckout({ amount: dt.due, run, info: { title: 'Detention charges', payee: x.provider, sub: `${dt.chargeable_hours} hour${dt.chargeable_hours === 1 ? '' : 's'} over the free time`, icon: 'clock', tone: 'amber', baseLabel: 'Detention', credit: store.state.accountType === 'business', refLabel: 'Order ID' } }); if (r) { toast('Detention paid'); redo(); } return; }
    if (k === 'ewbprint') return printEwb(x, f);
    if (k === 'podview') return modal({ title: 'Proof of delivery', body: `${pod.photo ? `<img class="pod-img" src="${pod.photo}" alt="Proof of delivery photo">` : '<p class="muted notop">No photo was attached.</p>'}<dl class="od-kv">${[['Received by', pod.receiver_name], ['At', dateTime(pod.at)], ['Remarks', pod.remarks || 'None'], ['Shortage', pod.shortage ? 'Yes' : 'No'], ['Damage', pod.damage ? 'Yes' : 'No']].map(([a, v]) => `<div><dt>${a}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`, footer: '<button class="btn btn-primary" data-close>Done</button>' });
    if (k === 'ewbcancel') { try { await api('/hub/freight/ewaybill/cancel', { method: 'POST', body: { id: x.id } }); toast('E-way bill cancelled'); redo(); } catch (er) { toast(er.message, true); } return; }
    if (k === 'ewb') return modal({
      title: 'Generate e-way bill',
      body: `<p class="muted notop">Part A is your invoice; Part B is the truck, filled in from this booking (${esc(f.vehicle_no || 'vehicle pending')}). Valid for ${Math.max(1, Math.ceil((f.km || 300) / 200))} day${Math.ceil((f.km || 300) / 200) > 1 ? 's' : ''} for ${f.km || '—'} km.</p>
        <form class="form-grid" id="ewF" novalidate><label class="field"><span class="req">Invoice number</span><input class="input" name="invoice_no" maxlength="16" placeholder="INV/2026/0142"></label><label class="field"><span class="req">Invoice value (₹)</span><input class="input" name="invoice_value" inputmode="numeric" value="${f.value || ''}"></label>
        <label class="field"><span class="req">HSN code</span><input class="input" name="hsn" inputmode="numeric" maxlength="8" placeholder="e.g. 8471"></label><label class="field">Receiver GSTIN<input class="input" name="to_gstin" maxlength="15" placeholder="Leave blank if unregistered"></label></form>
        <p class="callout">Demo: this mimics the government e-way bill system. Going live needs GSP access with your GSTIN.</p><p class="form-error" id="ewE"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="ewGo">Generate</button>',
      onMount(m, close) { m.querySelector('#ewGo').addEventListener('click', () => withBusy(m.querySelector('#ewGo'), async () => { try { const r = await api('/hub/freight/ewaybill', { method: 'POST', body: { id: x.id, ...formData(m.querySelector('#ewF')) } }); close(true); toast(`E-way bill ${r.no} generated`); redo(); } catch (er) { m.querySelector('#ewE').textContent = er.message; } })); },
    });
    if (k === 'pod') return modal({
      title: 'Upload proof of delivery',
      body: `<form class="form-grid" id="pdF" novalidate><label class="field full"><span class="req">Received by</span><input class="input" name="receiver_name" value="${esc((x.receiver && x.receiver.name) || (x.places && x.places.drop && x.places.drop.contact && x.places.drop.contact.name) || '')}"></label>
        <label class="field full">Photo of the signed LR<input class="input" type="file" name="photo" accept="image/*" capture="environment"></label>
        <label class="field full">Remarks<input class="input" name="remarks" placeholder="e.g. 2 cartons wet, rest fine"></label>
        <label class="row"><input type="checkbox" class="check" name="shortage"> Shortage</label><label class="row"><input type="checkbox" class="check" name="damage"> Damage</label></form><p class="form-error" id="pdE"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="pdGo">Save</button>',
      onMount(m, close) {
        m.querySelector('#pdGo').addEventListener('click', () => withBusy(m.querySelector('#pdGo'), async () => {
          const fm = m.querySelector('#pdF'); const file = fm.photo.files[0];
          let photo = null;
          // Phone photos are shrunk to about 900 px so the upload stays small.
          if (file) photo = await new Promise((ok) => { const img = new Image(); img.onload = () => { const k2 = Math.min(1, 900 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k2; c.height = img.height * k2; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.7)); URL.revokeObjectURL(img.src); }; img.onerror = () => ok(null); img.src = URL.createObjectURL(file); });
          try { await api('/hub/freight/pod', { method: 'POST', body: { id: x.id, receiver_name: fm.receiver_name.value, remarks: fm.remarks.value, shortage: fm.shortage.checked, damage: fm.damage.checked, photo } }); close(true); toast('Proof of delivery saved'); redo(); } catch (er) { m.querySelector('#pdE').textContent = er.message; }
        }));
      },
    });
  };
}
const docStyle = '<style>body{font:13px/1.5 Inter,Segoe UI,sans-serif;color:#15211E;max-width:760px;margin:24px auto;padding:24px;border:1px solid #CDD5D2;border-radius:10px}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #CDD5D2;padding:6px 8px;text-align:left;vertical-align:top}th{background:#F1F4F3;width:32%}.no{font:700 20px monospace;letter-spacing:.08em}.demo{padding:6px 10px;background:#FDF1DC;border-radius:6px}.sig{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px}.sig div{border-top:1px solid #15211E;padding-top:6px}</style>';
function printLr(x, f) {
  const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to open the document.', true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>LR ${esc(f.lr)}</title>${docStyle}<h1>Consignment note (lorry receipt)</h1><div class="no">${esc(f.lr)}</div><p class="demo">Demo document from UT Log. Not valid for transport.</p>
    <table><tr><th>Carrier</th><td>${esc(x.provider)}</td></tr><tr><th>Vehicle</th><td>${esc(f.vehicle || '')} · ${esc(f.vehicle_no || '')}</td></tr><tr><th>Consignor (from)</th><td>${esc(x.contact_name || '')}<br>${esc(x.pickup_address || '')}</td></tr><tr><th>Consignee (to)</th><td>${esc((x.receiver && x.receiver.name) || (x.places && x.places.drop && x.places.drop.contact && x.places.drop.contact.name) || '')}<br>${esc(x.drop_address || '')}</td></tr>
    <tr><th>Goods</th><td>${esc((x.form && x.form.category) || 'General goods')} · ${esc(String(x.weight || ''))} kg${x.form && x.form.pieces > 1 ? ` · ${x.form.pieces} pieces` : ''}</td></tr><tr><th>Declared value</th><td>${x.declared ? esc(money(x.declared)) : 'Not declared'}</td></tr><tr><th>Freight</th><td>${esc(money(x.amount))} · paid (${esc(PAY_LABEL[x.pay_via] || 'wallet')})</td></tr><tr><th>E-way bill</th><td>${f.ewb && f.ewb.status === 'ACTIVE' ? esc(f.ewb.no) : 'Not generated'}</td></tr><tr><th>Booked</th><td>${esc(dateTime(x.at))} · order ${esc(x.id)}</td></tr></table>
    <div class="sig"><div>Driver's signature</div><div>Receiver's signature and stamp</div></div><script>print()<\/script>`);
  w.document.close();
}
function printEwb(x, f) {
  const e = f.ewb; const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to open the document.', true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>E-way bill ${esc(e.no)}</title>${docStyle}<h1>E-way bill</h1><div class="no">${esc(e.no)}</div><p class="demo">Demo document. Mimics the format of the government e-way bill.</p>
    <table><tr><th>Generated</th><td>${esc(dateTime(e.at))}</td></tr><tr><th>Valid until</th><td>${esc(dateTime(e.valid_until))}</td></tr><tr><th>Approx. distance</th><td>${e.km} km</td></tr><tr><th>Invoice</th><td>${esc(e.invoice_no)} · ${esc(money(e.invoice_value))}</td></tr><tr><th>HSN</th><td>${esc(e.hsn)}</td></tr><tr><th>Receiver GSTIN</th><td>${esc(e.to_gstin || 'URP (unregistered)')}</td></tr><tr><th>From</th><td>${esc(x.pickup_address || '')}</td></tr><tr><th>To</th><td>${esc(x.drop_address || '')}</td></tr><tr><th>Part B · vehicle</th><td>${esc(e.vehicle_no || 'Pending')} · road</td></tr><tr><th>Transporter</th><td>${esc(x.provider)} · LR ${esc(f.lr)}</td></tr></table><script>print()<\/script>`);
  w.document.close();
}
