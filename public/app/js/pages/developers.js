// API & webhooks: webhook endpoints, delivery log, and API reference.
import { api, html, raw, esc, dateTime, toast, modal, emptyState } from '../core.js';

const ENDPOINTS = [
  ['GET', '/v1/orders/processing?tab=new', 'List orders by tab (new, readytoship, intransit, delivered, rto, all) with filters and paging'],
  ['GET', '/v1/orders/show?id={id}', 'One order with risk score and timeline'],
  ['POST', '/v1/orders/create', 'Create an order (customer, product, weight, payment_method)'],
  ['GET', '/v1/orders/rates?id={id}', 'Courier rates for an order after your rules'],
  ['POST', '/v1/orders/ship', 'Book shipments: { order_ids, courier_id }'],
  ['POST', '/v1/orders/pickup', 'Schedule pickup: { order_ids }'],
  ['POST', '/v1/orders/cancel', 'Cancel: { ids }'],
  ['GET', '/v1/shipments/all', 'Shipments by AWB with status and EDD'],
  ['POST', '/v1/tracking/bulk', 'Track up to 100 AWBs: { awbs }'],
  ['GET', '/v1/courier/serviceability?pickup_postcode=&delivery_postcode=&weight=', 'Quote a lane'],
  ['GET', '/v1/shipments/ndr/list', 'Failed deliveries waiting for action'],
  ['POST', '/v1/shipments/ndr/action', 'Re-attempt or RTO: { order_id, action }'],
  ['GET', '/v1/cod/reconciliation', 'COD expected vs remitted, per AWB'],
];

export async function renderDevelopers(view) {
  const d = await api('/webhooks');
  view.innerHTML = html`
    <div class="page-head"><div><h1>API & webhooks</h1><p>Connect your ERP, store or helpdesk. Create API keys in <a class="link" href="#/security">Security</a>.</p></div>
      <button class="btn btn-primary" id="addHook">+ Add webhook</button></div>
    <div class="grid grid-2">
      <section class="card"><h2>Webhook endpoints</h2>
        ${d.data.length ? raw(d.data.map((h) => `<div class="action-item" data-id="${h.id}" style="margin-bottom:8px;align-items:flex-start"><span class="stack" style="min-width:0"><b class="mono" style="color:inherit;font-size:12.5px;min-width:auto;word-break:break-all">${esc(h.url)}</b>
          <small class="muted">${h.events.map(esc).join(', ')}</small><small class="muted mono">Secret ${esc(h.secret_hint)}</small></span><span class="spacer"></span>
          <button class="btn btn-outline btn-sm" data-test>Send test</button><button class="btn btn-danger btn-sm" data-del>Delete</button></div>`).join('')) : emptyState('No webhooks yet.')}
        <h3 style="margin-top:16px">Verifying deliveries</h3>
        <p class="muted small">Each POST carries <span class="mono">X-UT-Event</span> and <span class="mono">X-UT-Signature: sha256=&lt;hex&gt;</span>, the HMAC-SHA256 of the raw body with your webhook secret.</p>
        <pre class="code">const sig = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
if ('sha256=' + sig !== req.headers['x-ut-signature']) return res.sendStatus(401);</pre></section>
      <section class="card"><div class="row"><h2 style="margin:0">Recent deliveries</h2><span class="spacer"></span><button class="btn btn-outline btn-sm" id="refresh">Refresh</button></div>
        ${d.log.length ? raw(`<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>When</th><th>Event</th><th>Result</th></tr></thead><tbody>${d.log.map((l) => `<tr><td>${dateTime(l.at)}</td><td class="mono">${esc(l.event)}</td>
          <td><span class="badge ${l.status === 'DELIVERED' ? 'badge-green' : l.status === 'PENDING' ? 'badge-amber' : 'badge-red'}">${esc(l.status)}${l.code ? ' ' + l.code : ''}</span>${l.error ? `<small class="muted"> ${esc(l.error)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`) : raw('<p class="muted">Deliveries appear here when events fire.</p>')}</section>
      <section class="card span-2"><h2>API reference</h2>
        <p class="muted small">Send <span class="mono">Authorization: Bearer utk_…</span> with an API key. Responses are JSON; lists return <span class="mono">{ data, meta: { pagination } }</span>.</p>
        ${raw(ENDPOINTS.map(([m, p, desc]) => `<div class="endpoint"><span class="method ${m === 'POST' ? 'post' : ''}">${m}</span><span class="mono">${esc(p)}</span><span class="spacer"></span><span class="muted small">${esc(desc)}</span></div>`).join(''))}
        <pre class="code">curl ${esc(location.origin)}/v1/orders/processing?tab=new \\
  -H "Authorization: Bearer utk_your_key"</pre></section>
    </div>`;
  const again = () => renderDevelopers(view);
  view.querySelector('#refresh').addEventListener('click', again);
  view.querySelector('.grid').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.hasAttribute('data-test')) { await api('/webhooks/test', { method: 'POST', body: { id } }); toast('Test sent — refresh in a few seconds'); setTimeout(again, 1500); }
    if (e.target.hasAttribute('data-del')) { await api('/webhooks/delete', { method: 'POST', body: { id } }); toast('Webhook deleted'); again(); }
  });
  view.querySelector('#addHook').addEventListener('click', async () => {
    const r = await modal({
      title: 'Add webhook', wide: true,
      body: `<label class="field">Endpoint URL<input class="input mono" id="wu" placeholder="https://example.com/hooks/ut"></label>
        <div><span class="field">Events</span><div class="grid grid-2" style="margin-top:6px">${d.events.map((ev) => `<label class="row"><input type="checkbox" class="check" value="${ev}" checked> <span class="mono small">${ev}</span></label>`).join('')}</div></div><p class="form-error" id="wErr"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="wGo">Add webhook</button>',
      onMount: (el, close) => el.querySelector('#wGo').addEventListener('click', async () => {
        try { close(await api('/webhooks', { method: 'POST', body: { url: el.querySelector('#wu').value.trim(), events: [...el.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value) } })); }
        catch (err) { el.querySelector('#wErr').textContent = err.message; }
      }),
    });
    if (!r) return;
    await modal({ title: 'Save your signing secret', body: `<p style="margin:0">Use this to verify deliveries. It won't be shown again.</p><input class="input mono" readonly value="${esc(r.secret)}" onclick="this.select()">`, footer: '<button class="btn btn-primary" data-close>Done</button>' });
    again();
  });
}
