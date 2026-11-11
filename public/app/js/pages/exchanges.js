// Exchanges: reverse pickup of the delivered item + a new forward shipment,
// one order or many at once.
import { api, html, raw, date, esc, statusBadge, pager, emptyState, loadingRows, modal, toast, refreshCounts } from '../core.js';

export async function render(view, { query }) {
  const page = Number(query.get('page')) || 1;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Exchanges</h1><p>Pick up the delivered item and ship a replacement, linked to the original order.</p></div>
      <button class="btn btn-primary" id="newEx">+ Create exchange</button></div>
    <div class="table-wrap"><table><thead><tr><th>Exchange</th><th>Original order</th><th>Buyer</th><th>Returning</th><th>Replacement</th><th>Reason</th><th>Reverse pickup</th><th>Created</th></tr></thead>
    <tbody id="rows">${loadingRows(8, 3)}</tbody></table></div><div id="pager"></div>`;
  const res = await api('/orders/returns/new-return', { query: { type: 'EXCHANGE', page, per_page: 15 } });
  view.querySelector('#rows').innerHTML = res.data.length ? res.data.map((r) => html`<tr>
    <td class="mono">X${r.id}</td><td><a class="link" href="#/orders/view/${r.order_id}">${r.channel_order_id}</a></td><td>${r.customer}</td>
    <td class="stack"><span>${r.product}</span><small class="muted">${r.sku}</small></td>
    <td class="stack"><a class="link" href="#/orders/view/${r.exchange_order_id}">New order</a><small class="muted">${r.new_sku}</small></td>
    <td>${r.reason}</td><td>${statusBadge(r.status)}</td><td>${date(r.created_at)}</td></tr>`).join('')
    : `<tr><td colspan="8">${emptyState('No exchanges yet.').value}</td></tr>`;
  view.querySelector('#pager').appendChild(pager(res.meta, (p) => { location.hash = '#/exchanges?page=' + p; }));
  view.querySelector('#newEx').addEventListener('click', () => create(view));
  if (query.get('create')) create(view, query.get('create'));
}

async function create(view, prefill) {
  const [delivered, reasons, skus] = await Promise.all([
    api('/orders/processing', { query: { tab: 'delivered', per_page: 200, from: '2000-01-01' } }), api('/orders/return_reason'), api('/skus'),
  ]);
  if (!delivered.data.length) { toast('You need a delivered order to create an exchange.', true); return; }
  const done = await modal({
    title: 'Create exchange', wide: true,
    body: `<p class="muted small" style="margin:0">Select one or more delivered orders. Each gets a reverse pickup with quality check and a free replacement shipment.</p>
      <div class="table-wrap" style="max-height:260px;overflow:auto"><table><tbody>${delivered.data.map((o) => `<tr><td><input type="checkbox" class="check exOrder" value="${o.id}" ${String(o.id) === String(prefill) ? 'checked' : ''} aria-label="Select ${esc(o.channel_order_id)}"></td>
        <td>${esc(o.channel_order_id)}</td><td>${esc(o.customer.name)}</td><td>${esc(o.products[0].name)}</td><td class="muted">${date(o.created_at)}</td></tr>`).join('')}</tbody></table></div>
      <div class="form-grid"><label class="field">Reason<select class="select" id="exReason">${reasons.data.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
        <label class="field">Replacement SKU<select class="select" id="exSku"><option value="">Same as original</option>${skus.data.map((s) => `<option value="${esc(s.sku)}">${esc(s.name)} (${esc(s.sku)})</option>`).join('')}</select></label>
        <label class="field full">Note (size/colour etc.)<input class="input" id="exNote" maxlength="120" placeholder="e.g. Replace size M with L"></label></div>
      <p class="form-error" id="exErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="exGo">Create exchange</button>',
    onMount: (el, close) => el.querySelector('#exGo').addEventListener('click', async () => {
      const ids = [...el.querySelectorAll('.exOrder:checked')].map((c) => Number(c.value));
      try { close(await api('/orders/exchange/create', { method: 'POST', body: { order_ids: ids, reason: el.querySelector('#exReason').value, new_sku: el.querySelector('#exSku').value, note: el.querySelector('#exNote').value } })); }
      catch (err) { el.querySelector('#exErr').textContent = err.message; }
    }),
  });
  if (done) {
    toast(`${done.created.length} exchange${done.created.length > 1 ? 's' : ''} created${done.failed.length ? `, ${done.failed.length} skipped` : ''} · replacements are in New orders`);
    refreshCounts();
    location.hash = '#/exchanges';
    render(view, { query: new URLSearchParams() });
  }
}
