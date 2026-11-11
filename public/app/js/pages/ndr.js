// NDR (non-delivery reports): failed deliveries waiting for the seller to
// choose re-attempt or return-to-origin.
import { api, html, raw, money, dateTime, pager, emptyState, loadingRows, modal, toast, refreshCounts, esc } from '../core.js';

export async function render(view, { query }) {
  const status = query.get('status') === 'actioned' ? 'actioned' : 'unsuccessful';
  const page = Number(query.get('page')) || 1;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Failed deliveries</h1><p>Act within 24 hours so the courier can re-attempt before the shipment returns.</p></div></div>
    <nav class="tabs"><a href="#/ndr" class="${status === 'unsuccessful' ? 'active' : ''}">Action required</a><a href="#/ndr?status=actioned" class="${status === 'actioned' ? 'active' : ''}">Action taken</a></nav>
    <div class="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Courier / AWB</th><th>Reason</th><th>Attempts</th><th>Payment</th><th>${status === 'actioned' ? 'Your action' : 'Action'}</th></tr></thead>
    <tbody id="rows">${loadingRows(7, 4)}</tbody></table></div><div id="pager"></div>`;

  const res = await api('/shipments/ndr/list', { query: { status, page, per_page: 15 } });
  const rows = view.querySelector('#rows');
  rows.innerHTML = res.data.length ? res.data.map((n) => html`<tr data-id="${n.order_id}">
    <td class="stack"><a class="link" href="#/orders/view/${n.order_id}">${n.channel_order_id}</a><small class="muted">Raised ${dateTime(n.raised_at)}</small></td>
    <td class="stack"><b>${n.customer.name}</b><small class="muted">${n.customer.phone}</small><small class="muted">${n.customer.city}, ${n.customer.pincode}</small></td>
    <td class="stack"><b>${n.courier}</b><small class="mono muted">${n.awb}</small></td>
    <td><span class="badge badge-red">${n.reason}</span></td>
    <td>${n.attempts}</td>
    <td class="stack"><b>${money(n.total)}</b><small class="muted">${n.payment_method}</small></td>
    <td>${n.action ? raw(`<span class="badge ${n.action === 'rto' ? 'badge-red' : 'badge-blue'}">${n.action === 'rto' ? 'Return to origin' : 'Re-attempt'}</span>`)
      : raw('<div class="row"><button class="btn btn-primary btn-sm" data-act="reattempt">Re-attempt</button><button class="btn btn-danger btn-sm" data-act="rto">RTO</button></div>')}</td>
  </tr>`).join('') : `<tr><td colspan="7">${emptyState(status === 'unsuccessful' ? 'No failed deliveries need action. Nice!' : 'No actions taken yet.').value}</td></tr>`;
  view.querySelector('#pager').appendChild(pager(res.meta, (p) => { location.hash = `#/ndr?status=${status}&page=${p}`; }));

  rows.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = Number(b.closest('tr').dataset.id);
    const rto = b.dataset.act === 'rto';
    const result = await modal({
      title: rto ? 'Return to origin?' : 'Request re-attempt',
      body: rto ? '<p style="margin:0">The shipment will be returned to your pickup address. RTO freight applies.</p>'
        : '<label class="field">Note for the courier (address landmark, preferred time)<textarea class="input" id="ndrNote" rows="3" maxlength="200"></textarea></label>',
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn ${rto ? 'btn-danger' : 'btn-primary'}" id="ndrGo">${rto ? 'Mark RTO' : 'Request re-attempt'}</button>`,
      onMount: (el, close) => el.querySelector('#ndrGo').addEventListener('click', () => close({ comment: (el.querySelector('#ndrNote') || {}).value || '' })),
    });
    if (!result) return;
    try {
      await api('/shipments/ndr/action', { method: 'POST', body: { order_id: id, action: b.dataset.act, comment: result.comment } });
      toast(rto ? 'Marked for return to origin' : 'Re-attempt requested');
      refreshCounts();
      render(view, { query });
    } catch (err) { toast(err.message, true); }
  });
}
