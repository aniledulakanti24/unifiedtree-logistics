// Returns: reverse shipments, the buyer-portal approval queue, creating a
// return (quantity, QC, pickup address, refund mode) and the return policy.
import { api, html, raw, date, dateTime, esc, statusBadge, pager, emptyState, loadingRows, modal, toast, refreshCounts } from '../core.js';

const REQ = { REQUESTED: ['Needs review', 'badge-amber'], APPROVED: ['Approved', 'badge-green'], REJECTED: ['Rejected', 'badge-red'] };

export async function render(view, { query }) {
  const page = Number(query.get('page')) || 1;
  const tab = query.get('tab') === 'requests' ? 'requests' : 'returns';
  view.innerHTML = html`
    <div class="page-head"><div><h1>Returns</h1><p>Reverse pickups from your buyers back to your warehouse.</p></div>
      <div class="row"><a class="btn btn-outline" href="/returns/" target="_blank" rel="noopener">Open buyer portal</a><button class="btn btn-primary" id="newReturn">+ Create return</button></div></div>
    <nav class="tabs"><a href="#/returns" class="${tab === 'returns' ? 'active' : ''}">Returns</a><a href="#/returns?tab=requests" class="${tab === 'requests' ? 'active' : ''}">Buyer requests<span class="count" id="reqCount">·</span></a></nav>
    <div class="table-wrap"><table><thead id="head"></thead><tbody id="rows">${loadingRows(9, 4)}</tbody></table></div><div id="pager"></div>`;

  const reqs = await api('/returns/requests', { query: { per_page: 200 } });
  view.querySelector('#reqCount').textContent = reqs.data.filter((r) => r.status === 'REQUESTED').length;
  if (tab === 'requests') {
    view.querySelector('#head').innerHTML = '<tr><th>Request</th><th>Order</th><th>Buyer</th><th>Type</th><th>Item</th><th>Reason</th><th>Photos</th><th>Received</th><th>Status</th><th></th></tr>';
    view.querySelector('#rows').innerHTML = reqs.data.length ? reqs.data.map((r) => html`<tr data-id="${r.id}">
      <td class="mono">${r.id}</td><td><a class="link" href="#/orders/view/${r.order_id}">${r.channel_order_id}</a></td><td>${r.customer}</td>
      <td>${statusBadge(r.type)}</td><td class="stack"><span>${r.product} × ${r.qty}</span>${r.new_sku ? raw(`<small class="muted">Wants ${esc(r.new_sku)}</small>`) : ''}</td>
      <td class="stack"><span>${r.reason}</span>${r.comment ? raw(`<small class="muted">"${esc(r.comment)}"</small>`) : ''}</td><td>${r.photos}</td><td>${dateTime(r.created_at)}</td>
      <td class="stack">${raw(`<span class="badge ${REQ[r.status][1]}">${REQ[r.status][0]}</span>`)}${r.note ? raw(`<small class="muted">${esc(r.note)}</small>`) : ''}</td>
      <td>${r.status === 'REQUESTED' ? raw('<div class="row"><button class="btn btn-primary btn-sm" data-act="approve">Approve</button><button class="btn btn-danger btn-sm" data-act="reject">Reject</button></div>') : ''}</td></tr>`).join('')
      : `<tr><td colspan="10">${emptyState('No buyer requests yet. Share the returns portal link with your buyers.').value}</td></tr>`;
    view.querySelector('#rows').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const id = b.closest('tr').dataset.id;
      let note = '';
      if (b.dataset.act === 'reject') {
        note = await modal({ title: 'Reject request', body: '<label class="field">Reason shown to the buyer<input class="input" id="rn" placeholder="e.g. Item was used / outside policy"></label>',
          footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-danger" id="go">Reject</button>',
          onMount: (el, close) => el.querySelector('#go').addEventListener('click', () => close(el.querySelector('#rn').value.trim() || null)) });
        if (!note) return;
      }
      try { await api('/returns/requests/decide', { method: 'POST', body: { id, action: b.dataset.act, note } }); toast(b.dataset.act === 'approve' ? 'Approved · reverse pickup created' : 'Request rejected'); refreshCounts(); render(view, { query }); }
      catch (err) { toast(err.message, true); }
    });
  } else {
    const res = await api('/orders/returns/new-return', { query: { page, per_page: 15 } });
    view.querySelector('#head').innerHTML = '<tr><th>Return ID</th><th>Order</th><th>Buyer</th><th>Type</th><th>Product</th><th>Reason</th><th>QC</th><th>Source</th><th>Created</th><th>Status</th></tr>';
    view.querySelector('#rows').innerHTML = res.data.length ? res.data.map((r) => html`<tr>
      <td class="mono">R${r.id}</td><td><a class="link" href="#/orders/view/${r.order_id}">${r.channel_order_id}</a></td><td>${r.customer}</td><td>${statusBadge(r.type)}</td>
      <td class="stack"><span>${r.product}</span><small class="muted">${r.sku || ''}${r.qty ? ' · qty ' + r.qty : ''}</small></td>
      <td>${r.reason}</td><td>${r.qc ? raw('<span class="badge badge-blue">QC</span>') : '—'}</td><td class="small">${r.source || 'Seller'}</td><td>${date(r.created_at)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')
      : `<tr><td colspan="10">${emptyState('No returns yet.').value}</td></tr>`;
    view.querySelector('#pager').appendChild(pager(res.meta, (p) => { location.hash = '#/returns?page=' + p; }));
  }

  async function create(prefill) {
    const [delivered, reasons] = await Promise.all([api('/orders/processing', { query: { tab: 'delivered', per_page: 200, from: '2000-01-01' } }), api('/orders/return_reason')]);
    if (!delivered.data.length) { toast('You need a delivered order to create a return.', true); return; }
    const byId = new Map(delivered.data.map((o) => [String(o.id), o]));
    const made = await modal({
      title: 'Create return', wide: true,
      body: `<div class="form-grid">
        <label class="field full">Delivered order<select class="select" id="rOrder">${delivered.data.map((o) => `<option value="${o.id}" ${String(o.id) === String(prefill) ? 'selected' : ''}>${esc(o.channel_order_id)} · ${esc(o.customer.name)} · ${esc(o.products[0].name)}</option>`).join('')}</select></label>
        <label class="field">Quantity to return<input class="input" id="rQty" type="number" min="1" value="1"></label>
        <label class="field">Reason<select class="select" id="rReason">${reasons.data.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
        <label class="field full">Pickup address<input class="input" id="rAddr"></label>
        <label class="field">Refund mode<select class="select" id="rRefund"><option>Original payment</option><option>Store credit</option><option>Bank transfer</option></select></label>
        <label class="row" style="align-self:end"><input type="checkbox" class="check" id="rQc" checked> Quality check at pickup</label></div>
        <p class="muted small" style="margin:0">With QC, the courier checks the item matches, tags are intact and there's no damage before picking it up.</p><p class="form-error" id="rErr"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="rGo">Create return</button>',
      onMount: (el, close) => {
        const fill = () => { const o = byId.get(el.querySelector('#rOrder').value); el.querySelector('#rAddr').value = `${o.customer.address}, ${o.customer.city} ${o.customer.pincode}`; el.querySelector('#rQty').max = o.products[0].qty; el.querySelector('#rQty').value = o.products[0].qty; };
        el.querySelector('#rOrder').addEventListener('change', fill);
        fill();
        el.querySelector('#rGo').addEventListener('click', async () => {
          const v = (s) => el.querySelector(s).value;
          try { close(await api('/orders/returns/create', { method: 'POST', body: { order_id: v('#rOrder'), qty: v('#rQty'), reason: v('#rReason'), pickup_address: v('#rAddr'), refund_mode: v('#rRefund'), qc: el.querySelector('#rQc').checked } })); }
          catch (err) { el.querySelector('#rErr').textContent = err.message; }
        });
      },
    });
    if (made) { toast(`Return R${made.id} created · pickup will be scheduled`); location.hash = '#/returns'; render(view, { query: new URLSearchParams() }); }
  }
  view.querySelector('#newReturn').addEventListener('click', () => create());
  if (query.get('create')) create(query.get('create'));
}

// Return policy for the buyer portal.
export async function renderPolicy(view) {
  const p = await api('/settings/returns-policy');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Return policy</h1><p>Rules for the buyer self-serve returns portal.</p></div>
      <div class="row"><input class="input mono" readonly value="${location.origin}/returns/" style="width:260px"><a class="btn btn-outline" href="/returns/" target="_blank" rel="noopener">Preview</a></div></div>
    <form class="card" id="pf" style="max-width:680px"><div class="form-grid">
      <label class="field">Return window (days after delivery)<input class="input" name="window_days" type="number" min="1" max="90" value="${p.window_days}"></label><span></span>
      <label class="row full"><input type="checkbox" class="check" name="allow_exchange" ${p.allow_exchange ? raw('checked') : ''}> Let buyers ask for an exchange instead of a return</label>
      <label class="row full"><input type="checkbox" class="check" name="auto_approve" ${p.auto_approve ? raw('checked') : ''}> Approve requests automatically (skip review)</label>
      <div class="full"><span class="field">Require photos for these reasons</span><div class="grid grid-2" style="margin-top:6px">
        ${raw(p.reasons.map((r) => `<label class="row"><input type="checkbox" class="check" data-reason="${esc(r)}" ${p.photos_required_for.includes(r) ? 'checked' : ''}> ${esc(r)}</label>`).join(''))}</div></div>
      <div class="full"><button class="btn btn-primary">Save policy</button></div></div></form>`;
  view.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/settings/returns-policy', { method: 'POST', body: { window_days: f.window_days.value, allow_exchange: f.allow_exchange.checked, auto_approve: f.auto_approve.checked,
        photos_required_for: [...f.querySelectorAll('[data-reason]:checked')].map((c) => c.dataset.reason) } });
      toast('Return policy saved');
    } catch (err) { toast(err.message, true); }
  });
}
