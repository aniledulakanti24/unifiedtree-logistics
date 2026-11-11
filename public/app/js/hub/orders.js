// Orders and Returns: the cross-service lists, and the parts each service workspace reuses.
import { api, esc, money, toast, modal, withBusy, dateTime, date, pager, formData } from '../core.js';
import { tile, scene } from './art.js';
import { statusPill, withFunds, refresh, downloadCsv, filterBtn, openFilters, countActive, SECTION_LABEL } from './ui.js';
import { popover } from './prefs.js';
import { openTracking, openClaim, openRate, printReceipt, printTicket, reschedule } from './tracking.js';
import { rebook } from './transport.js';
import { PAY_LABEL } from './checkout.js';
import { tableTools, wireTableTools } from './tabletools.js';

const TABS = [['new', 'New'], ['assigned', 'Pickups'], ['transit', 'In Transit'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All']];
const RANGES = [['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['', 'All time']];
const SERVICES = [['vehicle', 'Vehicle', 'Bike, auto or van in your city', 'bike', 'green'], ['courier', 'Courier', 'Parcels by pincode', 'parcel', 'amber'], ['logistics', 'Logistics', 'Full trucks and contractors', 'truck', 'blue'], ['international', 'International', 'Ship to another country', 'globe', 'violet']];

export function addOrder() {
  modal({
    title: 'Add an order', wide: true,
    body: `<div class="svc-pick">${SERVICES.map(([k, l, d, icon, tone]) => `<a href="#/${k}/book" data-close>${tile(icon, tone).value}<b>${esc(l)}</b><small>${esc(d)}</small></a>`).join('')}</div>`,
  });
}

const canCancel = (x) => ['new', 'assigned'].includes(x.group) && !x.sample && x.status !== 'PAY_LATER';
export const ORDER_BULK = `<div class="bulkbar" id="bulk" hidden><span id="bulkN"></span><button class="btn btn-outline btn-sm" id="bExport" type="button">Export selected</button><button class="btn btn-danger btn-sm" id="bCancel" type="button">Cancel selected</button></div>`;
export const orderTable = (r) => `<div class="table-wrap"><table class="orders"><thead><tr><th><input type="checkbox" class="check" id="all" aria-label="Select all"></th><th>Order details</th><th>Customer details</th><th>Package details</th><th>Payment</th><th>Route or account</th><th>Status</th><th>Action</th></tr></thead><tbody>
      ${r.data.map((x) => `<tr><td><input type="checkbox" class="check" data-sel="${esc(x.id)}" aria-label="Select ${esc(x.id)}"></td>
        <td class="stack"><a class="link mono" href="#/my/orders/${esc(x.id)}">${esc(x.id)}</a><small class="muted">${esc(dateTime(x.at))}</small>${x.reference ? `<small class="muted">Ref ${esc(x.reference)}</small>` : ''}</td>
        <td class="stack"><b>${esc((x.receiver && x.receiver.name) || x.contact_name || '—')}</b><small class="muted">${esc((x.receiver && x.receiver.phone) || x.contact_phone || '')}</small></td>
        <td class="stack"><b>${esc(x.title)}</b><small class="muted">${x.weight ? `${esc(x.weight)} kg · ` : ''}${esc(x.provider)}</small></td>
        <td class="stack"><b translate="no">${esc(money(x.amount))}</b><small class="muted">${x.pay_mode === 'cod' ? 'Pay on delivery' : PAY_LABEL[x.pay_via] || 'Prepaid'}</small></td>
        <td>${esc(x.sub || '—')}</td><td>${statusPill(x)}</td>
        <td><div class="row row--nw">${x.booking_id && x.status !== 'CANCELLED' ? `<button class="btn btn-outline btn-sm" data-track="${esc(x.id)}" type="button">Track</button>` : `<a class="btn btn-outline btn-sm" href="#/my/orders/${esc(x.id)}">View</a>`}<button class="icon-btn" data-more="${esc(x.id)}" type="button" aria-label="More actions for ${esc(x.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.400"/><circle cx="12" cy="12" r="1.400"/><circle cx="19" cy="12" r="1.400"/></svg></button></div></td></tr>`).join('')}
      </tbody></table></div><div id="pg"></div>`;
export const csvRows = (list) => [['Order ID', 'Date', 'Service', 'Provider', 'Route', 'Weight kg', 'Amount INR', 'Payment', 'Status'], ...list.map((x) => [x.id, x.at, x.title, x.provider, x.sub, x.weight || '', x.amount, x.pay_mode, x.label])];
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
    if (m) orderMenu(m, r.data.find((y) => y.id === m.dataset.more), again);
  };
}

export async function renderOrders(view, { query }) {
  const group = query.get('group') || 'all';
  const days = query.get('days') == null ? '30' : query.get('days');
  const search = query.get('search') || '';
  const scope = query.get('scope') || 'all';
  const section = query.get('section') || '';
  const pay = query.get('pay') || '';
  const page = Number(query.get('page')) || 1;
  const link = (patch) => { const q = new URLSearchParams({ group, days, search, scope, section, pay, ...patch }); [...q.keys()].forEach((k) => { if (!q.get(k) && k !== 'days') q.delete(k); }); return `#/my/orders?${q}`; };
  view.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const r = await api('/hub/orders', { query: { scope: scope === 'all' ? '' : scope, section, group, days, search, pay, page, per_page: 15 } });
  const fields = [{ key: 'days', label: 'Date', def: '30', options: RANGES }, ...(scope !== 'intl' ? [{ key: 'section', label: 'Service', options: [['', 'All services'], ...(scope === 'all' ? Object.entries(SECTION_LABEL) : ['vehicle', 'courier', 'logistics'].map((k) => [k, SECTION_LABEL[k]]))] }] : []), { key: 'pay', label: 'Payment', options: [['', 'All payments'], ['prepaid', 'Prepaid'], ['cod', 'Pay on delivery']] }];
  view.innerHTML = `
    <div class="page-head orders-head"><div class="row"><h1>All Orders</h1><select class="select scope" id="scope" aria-label="Domestic or international"><option value="domestic" ${scope === 'domestic' ? 'selected' : ''}>Domestic</option><option value="intl" ${scope === 'intl' ? 'selected' : ''}>International</option><option value="all" ${scope === 'all' ? 'selected' : ''}>All services</option></select></div>
      <form id="sf" class="orders-search"><input class="input" type="search" name="search" value="${esc(search)}" placeholder="Search by order ID, provider or route" aria-label="Search orders"></form>
      <button class="btn btn-primary" id="add" type="button">+ Add Order</button></div>
    <nav class="tabs tabs--line">${TABS.map(([k, l]) => `<a href="${link({ group: k, page: 1 })}" class="${k === group ? 'active' : ''}">${l}<span class="count">${r.counts[k] || 0}</span></a>`).join('')}</nav>
    <div class="toolbar">${filterBtn(countActive(fields, { days, section, pay }))}<span class="spacer"></span>${tableTools()}<button class="btn btn-outline" id="csv" type="button">Export</button></div>
    ${ORDER_BULK}
    <p class="muted small">${r.meta.pagination.total} orders</p>
    ${r.data.length ? orderTable(r) : `<div class="card">${vehicleEmpty(search || group !== 'all' ? 'No orders match these filters.' : 'Create your first order to see it here.')}</div>`}`;
  const pg = view.querySelector('#pg');
  if (pg) pg.appendChild(pager(r.meta, (p) => { location.hash = link({ page: p }); }));
  const again = () => renderOrders(view, { query });
  view.querySelector('#add').addEventListener('click', addOrder);
  view.querySelector('#scope').addEventListener('change', (e) => { location.hash = link({ scope: e.target.value, section: '', page: 1 }); });
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, fields, { days, section, pay }, (v) => { location.hash = link({ ...v, page: 1 }); }));
  view.querySelector('#sf').addEventListener('submit', (e) => { e.preventDefault(); location.hash = link({ search: e.target.search.value, page: 1 }); });
  view.querySelector('#csv').addEventListener('click', () => downloadCsv('ut-log-orders.csv', csvRows(r.data)));
  wireOrders(view, r, again);
  wireTableTools(view, 'orders');
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
const STEPS = [['BOOKED', 'Booked'], ['ASSIGNED', 'Assigned'], ['PICKED_UP', 'Picked up'], ['IN_TRANSIT', 'In transit'], ['DELIVERED', 'Delivered']];
const STEP_OF = { BOOKED: 0, ASSIGNED: 1, ARRIVING: 1, PICKUP_SCHEDULED: 1, PICKED_UP: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 3, DELIVERED: 4, SUCCESS: 4 };
export async function renderOrderDetail(view, { id }) {
  view.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  const x = await api('/hub/orders/show', { query: { id } });
  const step = STEP_OF[x.status] ?? 0;
  const kv = (k, v) => (v ? `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>` : '');
  const t = x.tracking;
  view.innerHTML = `
    <div class="page-head"><div><a class="link small" href="#/my/orders">← All orders</a><h1 class="mono">${esc(x.id)}</h1><p>${esc(x.title)} with ${esc(x.provider)} · ${esc(dateTime(x.at))}</p></div>
      <div class="row">${statusPill(x)}${x.booking_id && x.status !== 'CANCELLED' ? `<button class="btn btn-primary" id="track" type="button">Live tracking</button>` : ''}<button class="btn btn-outline" id="more" type="button">More</button></div></div>
    ${x.status === 'CANCELLED' ? '' : `<section class="card stepper" style="--done:${step / (STEPS.length - 1)}"><i class="stepper__line"></i>${STEPS.map(([, l], n) => `<div class="step ${n <= step ? 'on' : ''}"><span>${n < step || (n === step && step === STEPS.length - 1) ? '✓' : n + 1}</span><small>${esc(l)}</small></div>`).join('')}</section>`}
    <div class="dash dash--even">
      <div class="dash__main">
        <section class="card"><h2>Shipment</h2><dl class="kv">${kv('Route', x.sub)}${kv('Provider', x.provider)}${kv('Service', x.title)}${kv('Weight', x.weight ? `${x.weight} kg` : '')}${kv('Reference', x.reference)}${kv('Pickup scheduled', x.scheduled_for && dateTime(x.scheduled_for))}${kv('Promised by', x.promised_by && date(x.promised_by))}</dl></section>
        <section class="card"><h2>Addresses and contacts</h2><dl class="kv">${kv('Sender', [x.contact_name, x.contact_phone].filter(Boolean).join(' · '))}${kv('Pickup', x.pickup_address)}${kv('Receiver', x.receiver && [x.receiver.name, x.receiver.phone].filter(Boolean).join(' · '))}${kv('Drop', x.drop_address)}</dl>${x.sample ? '<p class="muted small">This is a sample order.</p>' : ''}</section>
        ${t ? `<section class="card"><h2>Timeline</h2><ol class="timeline">${t.timeline.map((e) => `<li><b>${esc(e.label)}</b><small class="muted block">${esc(dateTime(e.at))}</small></li>`).join('')}</ol></section>` : ''}
      </div>
      <aside class="dash__side">
        <section class="card"><h2>Charges</h2><dl class="break">${x.gross && x.gross !== x.amount ? `<div><dt>Service charge</dt><dd translate="no">${esc(money(x.gross))}</dd></div>` : ''}${x.discount ? `<div><dt>Coupon ${esc(x.coupon)}</dt><dd translate="no">−${esc(money(x.discount))}</dd></div>` : ''}${x.points_used ? `<div><dt>Reward points</dt><dd translate="no">−${esc(money(x.points_used))}</dd></div>` : ''}<div class="break__t"><dt>${x.pay_mode === 'cod' ? 'Pay on delivery' : x.pay_detail ? `Paid with ${esc(x.pay_detail)}` : `Paid by ${PAY_LABEL[x.pay_via] || 'wallet'}`}</dt><dd translate="no">${esc(money(x.amount))}</dd></div></dl></section>
        ${x.return ? `<section class="card"><h2>Return</h2><p class="notop"><span class="badge badge-amber">${esc(x.return.label)}</span></p><a class="link" href="#/my/returns">View return</a></section>` : ''}
        ${x.weight_case ? `<section class="card"><h2>Weight check</h2><dl class="break"><div><dt>Declared</dt><dd>${x.weight_case.declared} kg</dd></div><div><dt>Charged</dt><dd>${x.weight_case.charged} kg</dd></div></dl><a class="link" href="#/my/weight?tab=disputes">Review</a></section>` : ''}
        ${x.claim ? `<section class="card"><h2>Claim</h2><p class="notop">${esc(x.claim.type)}: ${x.claim.status === 'APPROVED' ? `paid ${esc(money(x.claim.payout))}` : 'in review'}</p></section>` : ''}
        ${x.can_return ? '<button class="btn btn-outline btn-block" id="ret" type="button">Create return</button>' : ''}
      </aside>
    </div>`;
  const again = () => renderOrderDetail(view, { id });
  const tr = view.querySelector('#track');
  if (tr) tr.addEventListener('click', () => openTracking(id));
  view.querySelector('#more').addEventListener('click', (e) => orderMenu(e.currentTarget, x, again));
  const ret = view.querySelector('#ret');
  if (ret) ret.addEventListener('click', () => createReturn(id, again));
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
export async function renderReturns(view, { query, desk, base = '#/my/returns' }) {
  const group = query.get('group') || 'all';
  const search = query.get('search') || '';
  const page = Number(query.get('page')) || 1;
  view.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const r = await api('/hub/returns', { query: { desk, group, search, page, per_page: 15 } });
  const link = (patch) => { const q = new URLSearchParams({ group, search, ...patch }); if (!q.get('search')) q.delete('search'); return `${base}?${q}`; };
  const rfields = [{ key: 'type', label: 'Type', options: [['', 'All'], ['return', 'Return'], ['exchange', 'Exchange']] }, { key: 'reason', label: 'Reason', options: [['', 'All reasons'], ...r.reason_list.map((x) => [x, x])] }];
  r.data = r.data.filter((x) => (!rf.type || x.type === rf.type) && (!rf.reason || x.reason === rf.reason));
  view.innerHTML = `
    ${desk ? `<div class="desk-bar"><span class="spacer"></span><button class="btn btn-primary" id="new" type="button" ${r.eligible.length ? '' : 'disabled'}>+ Create return</button></div>` : `<div class="page-head"><div class="row head-t">${tile('repeat', 'coral').value}<div><h1>All Returns</h1><p>Reverse pickups and exchanges across every service.</p></div></div><button class="btn btn-primary" id="new" type="button" ${r.eligible.length ? '' : 'disabled'}>+ Create return</button></div>`}
    <div class="grid grid-4"><div class="card stat"><span class="stat__label">Requested</span><span class="stat__value">${r.counts.requested}</span></div><div class="card stat"><span class="stat__label">In progress</span><span class="stat__value">${r.counts.progress}</span></div><div class="card stat"><span class="stat__label">Completed</span><span class="stat__value">${r.counts.completed}</span></div><div class="card stat"><span class="stat__label">Return rate</span><span class="stat__value">${r.return_rate}%</span><span class="muted small">Of delivered orders</span></div></div>
    <div class="dash dash--even">
      <section><div class="tab-row"><nav class="tabs">${RTABS.map(([k, l]) => `<a href="${link({ group: k, page: 1 })}" class="${k === group ? 'active' : ''}">${l}<span class="count">${r.counts[k] || 0}</span></a>`).join('')}</nav>${filterBtn(countActive(rfields, rf))}</div>
        ${r.data.length ? `<div class="returns">${r.data.map((x) => `<article class="card ret"><div class="ret__h"><div><b class="mono">${esc(x.id)}</b><small class="muted block">Order <a class="link" href="#/my/orders/${esc(x.order_id)}">${esc(x.order_id)}</a> · ${esc(dateTime(x.at))}</small></div><span class="badge ${x.group === 'completed' ? 'badge-green' : x.group === 'closed' ? '' : 'badge-amber'}">${esc(x.label)}</span></div>
          <p class="notop"><b>${esc(x.type === 'exchange' ? 'Exchange' : 'Return')}</b> · ${esc(x.reason)}${x.note ? ` · ${esc(x.note)}` : ''}</p><small class="muted">${esc(x.provider)} · ${esc(x.sub)} · Reverse shipping <span translate="no">${esc(money(x.fee))}</span></small>
          ${x.group === 'progress' ? `<span class="hbar__t mt-s"><i style="width:${Math.round(x.progress * 100)}%"></i></span>` : ''}
          <div class="row mt-s">${x.status === 'REQUESTED' ? `<button class="btn btn-primary btn-sm" data-ok="${esc(x.id)}" type="button">Approve</button><button class="btn btn-outline btn-sm" data-no="${esc(x.id)}" type="button">Reject</button>` : ''}${['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED'].includes(x.status) ? `<button class="btn btn-danger btn-sm" data-cancel="${esc(x.id)}" type="button">Cancel</button>` : ''}<button class="link" data-tl="${esc(x.id)}" type="button">Timeline</button></div></article>`).join('')}</div><div id="pg"></div>` : `<div class="card"><div class="empty-scene">${scene('returns').value}<p>${group === 'all' ? 'No returns yet.' : 'Nothing here right now.'}</p></div></div>`}</section>
      <aside class="dash__side"><section class="card"><h2>Why parcels come back</h2>${r.reasons.length ? hbarsCount(r.reasons) : '<p class="muted notop">Reasons appear after your first return.</p>'}</section>
        ${desk ? '' : `<section class="card"><h2>Return policy</h2><form class="form-grid" id="pf"><label class="field full">Return window (days)<input class="input" name="window_days" inputmode="numeric" value="${r.policy.window_days}"></label><label class="row full"><input type="checkbox" class="check" name="auto_approve" ${r.policy.auto_approve ? 'checked' : ''}> Approve requests automatically</label><p class="form-error full" id="pErr"></p><div class="full"><button class="btn btn-outline" type="submit">Save policy</button></div></form></section>`}</aside>
    </div>`;
  const pg = view.querySelector('#pg');
  if (pg) pg.appendChild(pager(r.meta, (p) => { location.hash = link({ page: p }); }));
  const again = () => renderReturns(view, { query, desk, base });
  view.querySelector('#new').addEventListener('click', () => createReturn(null, again, desk));
  const pf = view.querySelector('#pf');
  if (pf) pf.addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; try { await api('/hub/returns/policy', { method: 'POST', body: { window_days: f.window_days.value, auto_approve: f.auto_approve.checked } }); toast('Policy saved'); } catch (x) { view.querySelector('#pErr').textContent = x.message; } });
  view.onclick = async (e) => {
    const flt = e.target.closest('#flt');
    if (flt) { openFilters(flt, rfields, rf, (v) => { Object.assign(rf, v); again(); }); return; }
    const ok = e.target.closest('[data-ok]'); const no = e.target.closest('[data-no]'); const ca = e.target.closest('[data-cancel]'); const tl = e.target.closest('[data-tl]');
    try {
      if (ok) { await withFunds(() => api('/hub/returns/approve', { method: 'POST', body: { id: ok.dataset.ok } })); toast('Return approved'); refresh(); again(); }
      if (ca) { await api('/hub/returns/cancel', { method: 'POST', body: { id: ca.dataset.cancel } }); toast('Return cancelled'); refresh(); again(); }
      if (no) rejectReturn(no.dataset.no, again);
      if (tl) { const x = r.data.find((y) => y.id === tl.dataset.tl); modal({ title: `Timeline · ${x.id}`, body: `<ol class="timeline">${x.timeline.map((t) => `<li><b>${esc(t.label)}</b><small class="muted block">${esc(dateTime(t.at))}</small></li>`).join('')}</ol>` }); }
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
