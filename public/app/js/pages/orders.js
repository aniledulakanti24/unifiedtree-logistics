// Orders: status tabs (incl. Duplicate / On Hold), Domestic vs International,
// search, date range, filters, RTO-risk badges, bulk actions and paging.
// Filter state lives in the URL hash so a view can be bookmarked or shared.
import { api, html, raw, money, date, esc, statusBadge, pager, emptyState, loadingRows, toast, modal, daysAgo, isoDay, refreshCounts, icon } from '../core.js';
import { shipOrders } from './ship-modal.js';
import { printDocs } from './manifests.js';

const TABS = [['new', 'New'], ['duplicate', 'Duplicate'], ['onhold', 'On Hold'], ['readytoship', 'Ready To Ship'], ['pickup', 'Pickups & Manifests'],
  ['intransit', 'In Transit'], ['delivered', 'Delivered'], ['rto', 'RTO'], ['all', 'All']];
let filterOptions = null;

export async function render(view, { tab = 'new', query }) {
  if (!TABS.some(([k]) => k === tab)) { location.hash = '#/orders/new'; return; }
  const state = {
    search: query.get('search') || '', payment_method: query.get('payment_method') || '', channel_id: query.get('channel_id') || '',
    pickup_address_id: query.get('pickup_address_id') || '', risk: query.get('risk') || '', is_international: query.get('is_international') === '1' ? '1' : '',
    from: query.get('from') || daysAgo(29), to: query.get('to') || isoDay(Date.now()),
    page: Number(query.get('page')) || 1, per_page: Number(query.get('per_page')) || 15,
  };
  const filtersOpen = !!(state.payment_method || state.channel_id || state.pickup_address_id || state.risk);
  filterOptions = filterOptions || await api('/orders/processingordersfilters');
  const opt = (list, val) => list.map((o) => `<option value="${esc(o.id ?? o)}" ${String(o.id ?? o) === val ? 'selected' : ''}>${esc(o.name ?? o)}</option>`).join('');

  view.innerHTML = html`
    <div class="page-head"><div class="row"><h1>Orders</h1>
        <div class="seg" id="scope"><button aria-pressed="${!state.is_international}" data-intl="">Domestic</button><button aria-pressed="${!!state.is_international}" data-intl="1">International</button></div></div>
      <div class="row"><a class="btn btn-outline" href="#/channels">Sync orders</a><a class="btn btn-outline" href="#/bulk">Bulk upload</a><a class="btn btn-primary" href="#/orders/add">+ Add order</a></div></div>
    <nav class="tabs" id="tabs">${raw(TABS.map(([k, label]) => `<a href="#/orders/${k}${state.is_international ? '?is_international=1' : ''}" class="${k === tab ? 'active' : ''}">${label}<span class="count" data-count="${k}">·</span></a>`).join(''))}</nav>
    <form class="toolbar" id="toolbar">
      <input class="input" type="search" name="search" placeholder="Search order ID, AWB, buyer, phone, SKU" value="${state.search}">
      <input class="input" type="date" name="from" value="${state.from}" aria-label="From date">
      <span class="muted">to</span>
      <input class="input" type="date" name="to" value="${state.to}" aria-label="To date">
      <button class="btn btn-outline" type="button" id="moreFilters">${icon('filter')} More filters</button>
      <span class="spacer"></span>
      <button class="btn btn-outline btn-sm" type="button" id="exportBtn">${icon('download')} Export</button>
    </form>
    <div class="filters-panel" id="filtersPanel" ${filtersOpen ? '' : raw('hidden')}>
      <label class="field">Payment<select class="select" name="payment_method"><option value="">All</option>${raw(opt(filterOptions.payment_methods, state.payment_method))}</select></label>
      <label class="field">Channel<select class="select" name="channel_id"><option value="">All</option>${raw(opt(filterOptions.channels, state.channel_id))}</select></label>
      <label class="field">Pickup address<select class="select" name="pickup_address_id"><option value="">All</option>${raw(opt(filterOptions.pickup_addresses, state.pickup_address_id))}</select></label>
      <label class="field">RTO risk<select class="select" name="risk"><option value="">All</option>${raw(opt(filterOptions.risk_levels, state.risk))}</select></label>
      <div class="row" style="align-items:end"><button class="btn btn-outline" type="button" id="clearFilters">Clear</button></div>
    </div>
    <div class="bulkbar" id="bulkbar" hidden><span id="bulkCount"></span><span class="spacer"></span><span class="row" id="bulkActions"></span></div>
    <div class="table-wrap"><table>
      <thead><tr><th><input type="checkbox" class="check" id="checkAll" aria-label="Select all"></th><th>Order details</th><th>Customer details</th><th>Product details</th><th>Package details</th><th>Payment</th><th>Pickup address</th><th>Status</th><th>Action</th></tr></thead>
      <tbody id="rows">${loadingRows(9)}</tbody>
    </table></div>
    <div id="pager"></div>`;

  const toolbar = view.querySelector('#toolbar');
  const panel = view.querySelector('#filtersPanel');
  const go = (patch) => {
    const next = { ...state, ...patch };
    const qs = new URLSearchParams(Object.entries(next).filter(([k, v]) => v && !(k === 'page' && v === 1) && !(k === 'per_page' && v === 15)));
    location.hash = `#/orders/${tab}?${qs}`;
  };
  const readFilters = () => ({
    search: toolbar.search.value.trim(), from: toolbar.from.value, to: toolbar.to.value,
    ...Object.fromEntries(['payment_method', 'channel_id', 'pickup_address_id', 'risk'].map((k) => [k, panel.querySelector(`[name=${k}]`).value])),
  });
  toolbar.addEventListener('submit', (e) => { e.preventDefault(); go({ ...readFilters(), page: 1 }); });
  toolbar.addEventListener('change', (e) => { if (e.target.type !== 'search') go({ ...readFilters(), page: 1 }); });
  panel.addEventListener('change', () => go({ ...readFilters(), page: 1 }));
  view.querySelector('#scope').addEventListener('click', (e) => { const b = e.target.closest('[data-intl]'); if (b) go({ is_international: b.dataset.intl, page: 1 }); });
  view.querySelector('#moreFilters').addEventListener('click', () => { panel.hidden = !panel.hidden; });
  view.querySelector('#clearFilters').addEventListener('click', () => go({ payment_method: '', channel_id: '', pickup_address_id: '', risk: '', page: 1 }));
  view.querySelector('#exportBtn').addEventListener('click', () => { location.hash = '#/reports?type=' + (['new', 'all', 'duplicate', 'onhold'].includes(tab) ? 'orders' : 'shipments'); });

  const res = await api('/orders/processing', { query: { tab, ...state } });
  Object.entries(res.counts).forEach(([k, n]) => { const el = view.querySelector(`[data-count="${k}"]`); if (el) el.textContent = n; });
  const byId = new Map(res.data.map((o) => [o.id, o]));
  const pickups = new Map(filterOptions.pickup_addresses.map((p) => [p.id, p.name]));
  const rowsEl = view.querySelector('#rows');

  if (!res.data.length) {
    rowsEl.innerHTML = `<tr><td colspan="9">${emptyState(state.search ? 'No orders match your search.' : tab === 'duplicate' ? 'No duplicate orders found.' : 'No orders here for the selected dates.').value}</td></tr>`;
  } else {
    rowsEl.innerHTML = res.data.map((o) => html`<tr data-id="${o.id}">
      <td><input type="checkbox" class="check rowCheck" value="${o.id}" aria-label="Select order ${o.channel_order_id}"></td>
      <td class="stack"><a class="link" href="#/orders/view/${o.id}">${o.channel_order_id}</a><small class="muted">${date(o.created_at)}</small><small class="muted">${o.channel}</small>
        ${o.type === 'EXCHANGE' ? statusBadge('EXCHANGE') : ''}${o.duplicate ? raw('<small class="badge badge-amber">Possible duplicate</small>') : ''}</td>
      <td class="stack"><b>${o.customer.name}</b><small class="muted">${o.customer.phone}</small><small class="muted">${o.customer.city}, ${o.customer.pincode}${o.is_international ? ', ' + o.customer.country : ''}</small>
        ${['NEW', 'ON_HOLD'].includes(o.status) && o.address_quality.label !== 'Good' ? raw(`<small class="badge ${o.address_quality.label === 'Poor' ? 'badge-red' : 'badge-amber'}">Address: ${o.address_quality.label}</small>`) : ''}</td>
      <td class="stack"><b>${o.products[0].name}</b><small class="muted">SKU ${o.products[0].sku || '—'} · Qty ${o.products[0].qty}</small></td>
      <td class="stack"><b>${o.package.weight} kg</b><small class="muted">${o.package.length}×${o.package.breadth}×${o.package.height} cm</small></td>
      <td class="stack"><b>${money(o.total)}</b>${statusBadge(o.payment_method)}${o.payment_method === 'COD' && !o.verified ? raw('<small class="badge badge-amber">Unverified</small>') : ''}
        ${['NEW', 'ON_HOLD'].includes(o.status) && !o.is_international ? raw(`<span title="${esc(o.risk.reasons.join(', ') || 'No risk signals')}">${statusBadge(o.risk.level).value}</span>`) : ''}</td>
      <td class="stack"><small>${pickups.get(o.pickup_address_id) || '—'}</small></td>
      <td class="stack">${statusBadge(o.status)}${o.awb ? raw(`<small class="mono muted">${esc(o.awb)}</small><small class="muted">${esc(o.courier)}</small>`) : ''}${o.hold_reason ? raw(`<small class="muted">${esc(o.hold_reason)}</small>`) : ''}</td>
      <td>${raw(actionFor(o))}</td>
    </tr>`).join('');
  }
  view.querySelector('#pager').appendChild(pager(res.meta, (page) => go({ page })));

  // ---- selection + bulk actions -------------------------------------------
  const selected = () => [...view.querySelectorAll('.rowCheck:checked')].map((c) => byId.get(Number(c.value)));
  const every = (sel, statuses) => sel.length && sel.every((o) => statuses.includes(o.status));
  function syncBulk() {
    const sel = selected();
    view.querySelector('#bulkbar').hidden = !sel.length;
    view.querySelector('#bulkCount').textContent = `${sel.length} selected`;
    const shipped = sel.length && sel.every((o) => o.awb);
    view.querySelector('#bulkActions').innerHTML = [
      every(sel, ['NEW']) && '<button class="btn btn-primary btn-sm" data-bulk="ship">Ship now</button>',
      every(sel, ['NEW']) && '<button class="btn btn-outline btn-sm" data-bulk="hold">Put on hold</button>',
      every(sel, ['ON_HOLD']) && '<button class="btn btn-primary btn-sm" data-bulk="release">Release</button>',
      every(sel, ['READY_TO_SHIP']) && '<button class="btn btn-primary btn-sm" data-bulk="pickup">Schedule pickup</button>',
      shipped && '<button class="btn btn-outline btn-sm" data-bulk="label">Print labels</button>',
      every(sel, ['PICKUP_SCHEDULED']) && '<button class="btn btn-outline btn-sm" data-bulk="manifest">Print manifest</button>',
      '<button class="btn btn-outline btn-sm" data-bulk="invoice">Invoices</button>',
      every(sel, ['NEW', 'READY_TO_SHIP', 'ON_HOLD']) && '<button class="btn btn-danger btn-sm" data-bulk="cancel">Cancel</button>',
    ].filter(Boolean).join('');
    view.querySelector('#checkAll').checked = sel.length && sel.length === res.data.length;
  }
  view.querySelector('#checkAll').addEventListener('change', (e) => { view.querySelectorAll('.rowCheck').forEach((c) => { c.checked = e.target.checked; }); syncBulk(); });
  rowsEl.addEventListener('change', (e) => { if (e.target.classList.contains('rowCheck')) syncBulk(); });

  const reload = () => render(view, { tab, query });
  async function runAction(kind, orders) {
    const ids = orders.map((o) => o.id);
    try {
      if (kind === 'ship') { if (await shipOrders(orders)) reload(); return; }
      if (['label', 'manifest', 'invoice'].includes(kind)) { await printDocs(kind, ids); return; }
      if (kind === 'pickup') {
        const r = await api('/orders/pickup', { method: 'POST', body: { order_ids: ids } });
        toast(`Pickup on ${date(r.pickup_date)} · manifest ${r.manifest_id}`);
      }
      if (kind === 'hold') {
        const reason = await modal({ title: 'Put on hold', body: '<label class="field">Reason (visible to your team)<input class="input" id="holdReason" placeholder="e.g. Waiting for buyer confirmation"></label>',
          footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="holdGo">Put on hold</button>',
          onMount: (el, close) => el.querySelector('#holdGo').addEventListener('click', () => close(el.querySelector('#holdReason').value || 'Held by seller')) });
        if (!reason) return;
        await api('/orders/hold', { method: 'POST', body: { ids, reason } });
        toast('Orders put on hold');
      }
      if (kind === 'release') { await api('/orders/release', { method: 'POST', body: { ids } }); toast('Orders released to New'); }
      if (kind === 'cancel') {
        const ok = await modal({ title: 'Cancel orders?', body: `<p style="margin:0">Cancel ${ids.length} order${ids.length > 1 ? 's' : ''}? Freight already charged is refunded to your wallet.</p>`,
          footer: '<button class="btn btn-outline" data-close>Keep</button><button class="btn btn-danger" id="confirmCancel">Cancel orders</button>',
          onMount: (el, close) => el.querySelector('#confirmCancel').addEventListener('click', () => close(true)) });
        if (!ok) return;
        await api('/orders/cancel', { method: 'POST', body: { ids } });
        toast('Orders cancelled');
      }
      if (kind === 'verify') { await api('/orders/verify', { method: 'POST', body: { id: ids[0] } }); toast('Order marked as verified'); }
      refreshCounts();
      reload();
    } catch (err) { toast(err.message, true); }
  }
  view.querySelector('#bulkActions').addEventListener('click', (e) => { const b = e.target.closest('[data-bulk]'); if (b) runAction(b.dataset.bulk, selected()); });
  rowsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) runAction(b.dataset.act, [byId.get(Number(b.closest('tr').dataset.id))]);
  });
}

function actionFor(o) {
  if (o.status === 'NEW') {
    return '<div class="row">' + (o.payment_method === 'COD' && !o.verified ? '<button class="btn btn-outline btn-sm" data-act="verify">Verify</button>' : '') + '<button class="btn btn-primary btn-sm" data-act="ship">Ship now</button></div>';
  }
  if (o.status === 'ON_HOLD') return '<button class="btn btn-primary btn-sm" data-act="release">Release</button>';
  if (o.status === 'READY_TO_SHIP') return '<div class="row"><button class="btn btn-primary btn-sm" data-act="pickup">Schedule pickup</button><button class="btn btn-outline btn-sm" data-act="label">Label</button></div>';
  if (o.status === 'PICKUP_SCHEDULED') return '<div class="row"><button class="btn btn-outline btn-sm" data-act="label">Label</button><button class="btn btn-outline btn-sm" data-act="manifest">Manifest</button></div>';
  return `<a class="btn btn-outline btn-sm" href="#/orders/view/${o.id}">View</a>`;
}
