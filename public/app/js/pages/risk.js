// Delivery Health: RTO Control Tower, Delay Radar, Delivery Boost, automatic
// COD confirmation and the buyer blocklist.
import { api, html, raw, money, date, dateTime, esc, statusBadge, pager, emptyState, toast, refreshCounts, modal, formData } from '../core.js';

// ---- RTO Control Tower ------------------------------------------------------
export async function renderRto(view, { query }) {
  const level = query.get('level') || '';
  const page = Number(query.get('page')) || 1;
  const d = await api('/rto/overview', { query: { level, page, per_page: 15 } });
  const total = d.levels.reduce((s, l) => s + l.count, 0);
  view.innerHTML = html`
    <div class="page-head"><div><h1>RTO risk</h1><p>Score unshipped orders for return-to-origin risk and act before you ship.</p></div></div>
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat"><span class="stat__label">Your RTO rate</span><span class="stat__value">${d.rto_rate}%</span><span class="muted small">Delivered vs returned, all time</span></div>
      ${raw(d.levels.map((l) => `<a class="card stat" href="#/rto?level=${l.level}"><span class="stat__label">${l.level} risk</span><span class="stat__value">${l.count}</span><span class="muted small">${total ? Math.round((l.count / total) * 100) : 0}% of open orders</span></a>`).join(''))}
    </div>
    <div class="grid grid-3" style="margin-bottom:16px">
      <section class="card"><h2>Address quality (open orders)</h2>${raw(['Good', 'Average', 'Poor'].map((k) => `<div class="bar-row"><span>${k}</span><span class="bar"><i style="width:${total ? (d.address_quality[k] / total) * 100 : 0}%;background:${{ Good: 'var(--green)', Average: 'var(--amber)', Poor: 'var(--red)' }[k]}"></i></span><b>${d.address_quality[k]}</b></div>`).join(''))}</section>
      <section class="card span-2"><h2>Pincodes with returns</h2>${d.risky_pincodes.length ? raw(`<div class="table-wrap"><table><thead><tr><th>Pincode</th><th>City</th><th>Orders</th><th>RTO</th><th>RTO %</th><th></th></tr></thead><tbody>${d.risky_pincodes.map((p) => `<tr><td class="mono">${p.pincode}</td><td>${esc(p.city)}</td><td>${p.orders}</td><td>${p.rto}</td><td><b>${Math.round((p.rto / p.orders) * 100)}%</b></td><td><a class="link" href="#/pincodes?block=${p.pincode}">Block COD</a></td></tr>`).join('')}</tbody></table></div>`) : raw('<p class="muted">No returns yet.</p>')}</section>
    </div>
    <nav class="tabs">${raw(['', 'High', 'Medium', 'Low'].map((l) => `<a href="#/rto${l ? '?level=' + l : ''}" class="${l === level ? 'active' : ''}">${l || 'All open orders'}</a>`).join(''))}</nav>
    <div class="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Payment</th><th>Risk</th><th>Why</th><th>Actions</th></tr></thead><tbody id="rows">
    ${d.data.length ? raw(d.data.map((o) => html`<tr data-id="${o.id}" data-phone="${o.customer.phone}">
      <td class="stack"><a class="link" href="#/orders/view/${o.id}">${o.channel_order_id}</a><small class="muted">${date(o.created_at)}</small>${o.status === 'ON_HOLD' ? statusBadge('ON_HOLD') : ''}</td>
      <td class="stack"><b>${o.customer.name}</b><small class="muted">${o.customer.city}, ${o.customer.pincode}</small><small class="muted">Address: ${o.address_quality.label}</small></td>
      <td class="stack"><b>${money(o.total)}</b><small class="muted">${o.payment_method}${o.payment_method === 'COD' ? (o.verified ? ' · verified' : ' · unverified') : ''}</small>${o.payment_link ? raw('<small class="badge badge-blue">Prepaid link sent</small>') : ''}</td>
      <td class="stack">${statusBadge(o.risk.level)}<small class="muted">Score ${o.risk.score}/100</small></td>
      <td class="small">${o.risk.reasons.join(', ') || '—'}</td>
      <td><div class="row">${raw([
        o.payment_method === 'COD' && !o.verified && '<button class="btn btn-outline btn-sm" data-act="verify">Verify buyer</button>',
        o.payment_method === 'COD' && !o.payment_link && '<button class="btn btn-outline btn-sm" data-act="prepaid">Send prepaid link</button>',
        o.status === 'NEW' && '<button class="btn btn-outline btn-sm" data-act="hold">Hold</button>',
        o.status === 'ON_HOLD' && '<button class="btn btn-outline btn-sm" data-act="release">Release</button>',
        '<button class="btn btn-outline btn-sm" data-act="block">Block buyer</button>',
        '<button class="btn btn-danger btn-sm" data-act="cancel">Cancel</button>',
      ].filter(Boolean).join(''))}</div></td></tr>`).join('')) : raw(`<tr><td colspan="6">${emptyState('No open orders at this risk level.').value}</td></tr>`)}
    </tbody></table></div><div id="pager"></div>`;
  view.querySelector('#pager').appendChild(pager(d.meta, (p) => { location.hash = `#/rto?${level ? 'level=' + level + '&' : ''}page=${p}`; }));
  view.querySelector('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = Number(b.closest('tr').dataset.id);
    const calls = {
      verify: ['/orders/verify', { id }, 'Buyer verified'], prepaid: ['/orders/convert-prepaid', { id }, 'Prepaid payment link sent'],
      hold: ['/orders/hold', { ids: [id], reason: 'High RTO risk' }, 'Order put on hold'], release: ['/orders/release', { ids: [id] }, 'Order released'],
      cancel: ['/orders/cancel', { ids: [id] }, 'Order cancelled'],
      block: ['/settings/blocklist', { type: 'phone', value: b.closest('tr').dataset.phone, reason: 'Blocked from RTO Control Tower' }, 'Buyer blocked · their open orders are on hold'],
    };
    const [path, body, msg] = calls[b.dataset.act];
    try { await api(path, { method: 'POST', body }); toast(msg); refreshCounts(); renderRto(view, { query }); } catch (err) { toast(err.message, true); }
  });
}

// ---- Delay Radar --------------------------------------------------------------
export async function renderRadar(view) {
  const d = await api('/radar');
  const max = Math.max(1, ...d.by_reason.map((x) => x.count), ...d.by_courier.map((x) => x.count));
  const bars = (list) => list.length ? list.map((x) => `<div class="bar-row"><span>${esc(x.name)}</span><span class="bar"><i style="width:${(x.count / max) * 100}%;background:var(--red)"></i></span><b>${x.count}</b></div>`).join('') : '<p class="muted">None.</p>';
  view.innerHTML = html`
    <div class="page-head"><div><h1>Delay Radar</h1><p>Shipments that have missed, or are about to miss, their expected delivery date.</p></div></div>
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card stat"><span class="stat__label">Active shipments</span><span class="stat__value">${d.active}</span></div>
      <div class="card stat"><span class="stat__label">Delayed</span><span class="stat__value" style="color:var(--red)">${d.delayed}</span></div>
      <div class="card stat"><span class="stat__label">On-time rate</span><span class="stat__value">${d.on_time_rate}%</span></div>
      <section class="card"><h2>By reason</h2>${raw(bars(d.by_reason))}</section>
      <section class="card span-2"><h2>By courier</h2>${raw(bars(d.by_courier))}</section>
    </div>
    <div class="table-wrap"><table><thead><tr><th>AWB</th><th>Order</th><th>Courier</th><th>Destination</th><th>Expected</th><th>Late by</th><th>Reason</th><th></th></tr></thead><tbody id="rows">
    ${d.data.length ? raw(d.data.map((s) => html`<tr data-id="${s.id}"><td class="mono">${s.awb}</td><td><a class="link" href="#/orders/view/${s.id}">${s.channel_order_id}</a></td><td>${s.courier}</td><td>${s.city}</td>
      <td>${date(s.edd)}</td><td><b style="color:var(--red)">${s.days_late} day${s.days_late === 1 ? '' : 's'}</b></td><td>${s.reason}</td>
      <td><button class="btn btn-outline btn-sm" data-esc>Escalate</button></td></tr>`).join('')) : raw(`<tr><td colspan="8">${emptyState('No delayed shipments. 🎉').value}</td></tr>`)}
    </tbody></table></div>`;
  view.querySelector('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-esc]');
    if (!b) return;
    try { const r = await api('/radar/escalate', { method: 'POST', body: { id: Number(b.closest('tr').dataset.id) } }); b.outerHTML = `<span class="badge badge-blue">${esc(r.ticket)}</span>`; toast('Escalated to the courier'); }
    catch (err) { toast(err.message, true); }
  });
}

// ---- Delivery Boost ---------------------------------------------------------
export async function renderBoost(view) {
  const d = await api('/boost');
  const s = d.settings;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Delivery Boost</h1><p>We contact buyers of failed deliveries by IVR call or WhatsApp, confirm a new slot and request the re-attempt for you.</p></div></div>
    <div class="grid grid-3" style="margin-bottom:16px">
      <section class="card"><h2>Settings</h2>
        <label class="row" style="margin-bottom:10px"><input type="checkbox" class="check" id="bEnabled" ${s.enabled ? raw('checked') : ''}> <b>Delivery Boost on</b></label>
        <label class="row"><input type="checkbox" class="check" id="bIvr" ${s.channels.ivr ? raw('checked') : ''}> IVR call</label>
        <label class="row"><input type="checkbox" class="check" id="bWa" ${s.channels.whatsapp ? raw('checked') : ''}> WhatsApp</label>
        <p class="muted small">${money(s.price_per_ndr)} per failed delivery handled, from your wallet.</p></section>
      <div class="card stat"><span class="stat__label">Waiting for action</span><span class="stat__value">${d.pending}</span>
        <button class="btn btn-primary" id="bRun" ${d.pending && s.enabled ? '' : raw('disabled')}>Contact ${d.pending} buyer${d.pending === 1 ? '' : 's'} now</button></div>
      <div class="card stat"><span class="stat__label">Rescued by Boost</span><span class="stat__value">${d.stats.rescued}<span class="muted" style="font-size:16px"> / ${d.stats.contacted}</span></span>
        <span class="muted small">${d.stats.contacted ? Math.round((d.stats.rescued / d.stats.contacted) * 100) : 0}% re-delivery rate · ${d.stats.rto} returned</span></div>
    </div>
    <section class="card"><h2>Recent outcomes</h2>${d.log.length ? raw(`<div class="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Outcome</th><th>Note</th><th>When</th></tr></thead><tbody>${d.log.map((l) => `<tr><td><a class="link" href="#/orders/view/${l.order_id}">${esc(l.channel_order_id)}</a></td><td>${esc(l.customer)}</td>
      <td><span class="badge ${l.outcome === 'reattempt' ? 'badge-green' : 'badge-red'}">${l.outcome === 'reattempt' ? 'Re-attempt' : 'RTO'}</span></td><td class="small">${esc(l.note)}</td><td>${dateTime(l.at)}</td></tr>`).join('')}</tbody></table></div>`) : raw('<p class="muted">No buyers contacted yet.</p>')}</section>`;
  const save = async (patch) => { try { await api('/boost/settings', { method: 'POST', body: patch }); toast('Saved'); renderBoost(view); } catch (err) { toast(err.message, true); renderBoost(view); } };
  view.querySelector('#bEnabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  ['#bIvr', '#bWa'].forEach((sel) => view.querySelector(sel).addEventListener('change', () => save({ channels: { ivr: view.querySelector('#bIvr').checked, whatsapp: view.querySelector('#bWa').checked } })));
  view.querySelector('#bRun').addEventListener('click', async () => {
    const ok = await modal({ title: 'Run Delivery Boost', body: `<p style="margin:0">Contact ${d.pending} buyers for ${money(d.pending * s.price_per_ndr)} from your wallet?</p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Contact buyers</button>',
      onMount: (el, close) => el.querySelector('#go').addEventListener('click', () => close(true)) });
    if (!ok) return;
    try { const r = await api('/boost/run', { method: 'POST' }); toast(`${r.rescued} of ${r.processed} deliveries rescued`); refreshCounts(); renderBoost(view); }
    catch (err) { toast(err.message, true); }
  });
}

// ---- automatic COD confirmation -----------------------------------------------
export async function renderCodConfirm(view) {
  const d = await api('/cod-confirm');
  const s = d.settings;
  const RES = { CONFIRMED: ['Confirmed', 'badge-green'], CANCELLED: ['Buyer cancelled', 'badge-red'], NO_RESPONSE: ['No reply', 'badge-amber'] };
  view.innerHTML = html`
    <div class="page-head"><div><h1>COD confirmation</h1><p>Before you ship, buyers confirm their COD order by WhatsApp or IVR. Unconfirmed orders are held or cancelled automatically.</p></div></div>
    <div class="grid grid-4" style="margin-bottom:16px">
      <section class="card"><h2>Settings</h2>
        <label class="row" style="margin-bottom:8px"><input type="checkbox" class="check" id="cEnabled" ${s.enabled ? raw('checked') : ''}> <b>Confirm every new COD order</b></label>
        <label class="row"><input type="checkbox" class="check" id="cWa" ${s.channels.whatsapp ? raw('checked') : ''}> WhatsApp</label>
        <label class="row"><input type="checkbox" class="check" id="cIvr" ${s.channels.ivr ? raw('checked') : ''}> IVR call</label>
        <label class="field" style="margin-top:10px">If the buyer doesn't reply<select class="select" id="cAct"><option value="hold" ${s.no_response_action === 'hold' ? raw('selected') : ''}>Put the order on hold</option><option value="cancel" ${s.no_response_action === 'cancel' ? raw('selected') : ''}>Cancel the order</option></select></label>
        <p class="muted small">₹${s.price_per_message} per message, from your wallet.</p></section>
      <div class="card stat highlight"><span class="stat__label">Waiting to be sent</span><span class="stat__value">${d.unconfirmed}</span>
        <button class="btn btn-primary" id="cRun" ${s.enabled ? '' : raw('disabled')}>Send & process replies</button></div>
      <div class="card stat"><span class="stat__label">Confirmed</span><span class="stat__value" style="color:var(--green)">${d.stats.confirmed}</span><span class="muted small">of ${d.stats.sent} sent</span></div>
      <div class="card stat"><span class="stat__label">Stopped before shipping</span><span class="stat__value" style="color:var(--red)">${d.stats.cancelled + d.stats.no_response}</span><span class="muted small">${d.stats.cancelled} cancelled · ${d.stats.no_response} no reply</span></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Amount</th><th>Risk</th><th>Sent via</th><th>Result</th><th>Order status</th></tr></thead><tbody>
    ${d.data.length ? raw(d.data.map((x) => html`<tr><td><a class="link" href="#/orders/view/${x.id}">${x.channel_order_id}</a></td><td>${x.customer}</td><td>${money(x.total)}</td><td>${statusBadge(x.risk)}</td>
      <td class="small">${x.via} · ${dateTime(x.at)}</td><td>${x.result ? raw(`<span class="badge ${RES[x.result][1]}">${RES[x.result][0]}</span>`) : raw('<span class="badge badge-blue">Awaiting reply</span>')}</td><td>${statusBadge(x.status)}</td></tr>`).join(''))
      : raw(`<tr><td colspan="7">${emptyState('No confirmations sent yet. Turn it on and press Send.').value}</td></tr>`)}
    </tbody></table></div>`;
  const save = async (patch) => { try { await api('/cod-confirm/settings', { method: 'POST', body: patch }); toast('Saved'); } catch (err) { toast(err.message, true); } renderCodConfirm(view); };
  view.querySelector('#cEnabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  ['#cWa', '#cIvr'].forEach((sel) => view.querySelector(sel).addEventListener('change', () => save({ channels: { whatsapp: view.querySelector('#cWa').checked, ivr: view.querySelector('#cIvr').checked } })));
  view.querySelector('#cAct').addEventListener('change', (e) => save({ no_response_action: e.target.value }));
  view.querySelector('#cRun').addEventListener('click', async () => {
    try { const r = await api('/cod-confirm/run', { method: 'POST' }); toast(`${r.confirmed} confirmed · ${r.cancelled} cancelled · ${r.no_response} no reply`); refreshCounts(); renderCodConfirm(view); }
    catch (err) { toast(err.message, true); }
  });
}

// ---- buyer blocklist -----------------------------------------------------------
export async function renderBlocklist(view) {
  const d = await api('/settings/blocklist');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Buyer blocklist</h1><p>Orders from blocked buyers or pincodes are put on hold automatically and scored high risk.</p></div></div>
    <div class="grid" style="grid-template-columns:minmax(0,360px) minmax(0,1fr)">
      <form class="card" id="bf"><h2>Block a buyer</h2><div class="grid">
        <label class="field">Block by<select class="select" name="type"><option value="phone">Phone number</option><option value="email">Email</option><option value="pincode">Pincode</option></select></label>
        <label class="field">Value<input class="input mono" name="value" placeholder="9876543210"></label>
        <label class="field">Reason<input class="input" name="reason" placeholder="e.g. Refused 3 COD deliveries"></label>
        <button class="btn btn-primary">Add to blocklist</button></div></form>
      <section class="card"><h2>Blocked (${d.data.length})</h2>
        ${d.data.length ? raw(d.data.map((b) => `<div class="action-item" style="margin-bottom:8px" data-type="${b.type}" data-value="${esc(b.value)}"><span class="badge badge-red">${b.type}</span><b class="mono" style="color:inherit;font-size:13px;min-width:auto">${esc(b.value)}</b>
          <span class="muted small">${esc(b.reason || '')} · ${date(b.at)}</span><span class="spacer"></span><button class="btn btn-outline btn-sm">Unblock</button></div>`).join('')) : emptyState('Nobody is blocked.')}
        ${d.open_orders_affected ? raw(`<p class="muted small">${d.open_orders_affected} open order(s) match your blocklist.</p>`) : ''}</section>
    </div>`;
  view.querySelector('#bf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api('/settings/blocklist', { method: 'POST', body: formData(e.target) }); toast(`Blocked${r.held ? ` · ${r.held} open order(s) put on hold` : ''}`); refreshCounts(); renderBlocklist(view); }
    catch (err) { toast(err.message, true); }
  });
  view.querySelector('.grid').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-type]');
    if (!row || e.target.tagName !== 'BUTTON') return;
    await api('/settings/blocklist', { method: 'POST', body: { action: 'remove', type: row.dataset.type, value: row.dataset.value } });
    toast('Unblocked');
    renderBlocklist(view);
  });
}
