// Courier & Rules: courier priority, pincode rules, delivery times & holidays,
// SKU catalog & SKU rules. Every rule feeds the rates engine used by Ship now.
import { api, html, raw, date, esc, toast, formData, modal, emptyState } from '../core.js';

const post = (path, body) => api(path, { method: 'POST', body });
async function save(fn, msg, again) { try { await fn(); toast(msg); again(); } catch (err) { toast(err.message, true); } }

// ---- courier priority ---------------------------------------------------------
export async function renderCouriers(view) {
  const d = await api('/settings/courier');
  const byId = new Map(d.couriers.map((c) => [c.id, c]));
  const MODES = [['recommended', 'Recommended', 'Balances price, speed and delivery rating'], ['cheapest', 'Cheapest', 'Lowest rate first'],
    ['fastest', 'Fastest', 'Quickest delivery first'], ['custom', 'Custom order', 'Your own ranking below']];
  view.innerHTML = html`
    <div class="page-head"><div><h1>Courier priority</h1><p>Decide which courier is picked first when you ship, and switch couriers off.</p></div></div>
    <section class="card" style="margin-bottom:16px"><h2>Priority mode</h2><div class="grid grid-4" id="modes">
      ${raw(MODES.map(([k, t, s]) => `<label class="rate-row ${d.mode === k ? 'recommended' : ''}" style="grid-template-columns:auto 1fr"><input type="radio" name="mode" value="${k}" ${d.mode === k ? 'checked' : ''}><span class="stack"><b>${t}</b><small class="muted">${s}</small></span></label>`).join(''))}
    </div></section>
    <section class="card"><h2>Couriers ${d.mode === 'custom' ? raw('<small class="muted">· use the arrows to rank</small>') : ''}</h2><div class="grid" id="list">
      ${raw(d.order.map((id, i) => { const c = byId.get(id); return `<div class="action-item" data-id="${id}">
        ${d.mode === 'custom' ? `<span class="row"><button class="icon-btn" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button><button class="icon-btn" data-move="1" ${i === d.order.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button></span><b>${i + 1}</b>` : ''}
        <span class="stack"><b style="color:inherit;font-size:14px;min-width:auto">${esc(c.name)}</b><small class="muted">${c.days}-day base TAT · ${c.shipments} shipments · ${c.delivery_rate == null ? 'no history' : c.delivery_rate + '% delivered'}</small></span>
        <span class="spacer"></span><label class="row"><input type="checkbox" class="check" data-toggle ${d.enabled[id] !== false ? 'checked' : ''}> Enabled</label></div>`; }).join(''))}
    </div></section>`;
  const again = () => renderCouriers(view);
  view.querySelector('#modes').addEventListener('change', (e) => save(() => post('/settings/courier', { mode: e.target.value }), 'Priority mode saved', again));
  view.querySelector('#list').addEventListener('change', (e) => {
    if (!e.target.hasAttribute('data-toggle')) return;
    const enabled = Object.fromEntries([...view.querySelectorAll('[data-toggle]')].map((c) => [c.closest('[data-id]').dataset.id, c.checked]));
    save(() => post('/settings/courier', { enabled }), 'Courier list saved', again);
  });
  view.querySelector('#list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-move]');
    if (!b) return;
    const order = [...d.order];
    const i = order.indexOf(Number(b.closest('[data-id]').dataset.id));
    const j = i + Number(b.dataset.move);
    [order[i], order[j]] = [order[j], order[i]];
    save(() => post('/settings/courier', { order }), 'Ranking saved', again);
  });
}

// ---- pincode rules ------------------------------------------------------------
export async function renderPincodes(view, { query }) {
  const d = await api('/settings/pincode');
  const list = (name, rows, fmt) => rows.length ? rows.map((r, i) => `<div class="action-item"><span>${fmt(r)}</span><span class="spacer"></span><button class="btn btn-outline btn-sm" data-remove="${name}" data-index="${i}">Remove</button></div>`).join('') : '<p class="muted">No rules yet.</p>';
  view.innerHTML = html`
    <div class="page-head"><div><h1>Pincode rules</h1><p>Block risky pincodes, add buffer days, and correct zone mapping.</p></div></div>
    <section class="card" style="margin-bottom:16px"><h2>Check a pincode</h2><form class="row" id="chk"><input class="input" name="pincode" inputmode="numeric" maxlength="6" placeholder="6-digit pincode" style="max-width:180px"><button class="btn btn-outline">Check serviceability</button></form><div id="chkOut" style="margin-top:12px"></div></section>
    <div class="grid grid-3">
      <section class="card"><h2>Blocked pincodes</h2>
        <form class="grid" id="blk"><input class="input" name="pincodes" placeholder="Pincodes, comma separated" value="${query.get('block') || ''}">
          <div class="row"><select class="select" name="scope" style="width:auto"><option value="cod" ${query.get('block') ? raw('selected') : ''}>COD only</option><option value="all">All orders</option></select><input class="input" name="reason" placeholder="Reason (optional)" style="flex:1"></div>
          <button class="btn btn-primary">Block</button></form>
        <div class="grid" style="margin-top:12px">${raw(list('blocked', d.blocked, (r) => `<b class="mono">${r.pincode}</b> · ${r.scope === 'cod' ? 'COD blocked' : 'All blocked'}${r.reason ? ` <small class="muted">${esc(r.reason)}</small>` : ''}`))}</div></section>
      <section class="card"><h2>Delivery padding</h2><p class="muted small">Adds days to the promised delivery date for slow areas.</p>
        <form class="grid" id="pad"><input class="input" name="pincodes" placeholder="Pincodes, comma separated"><div class="row"><input class="input" name="days" type="number" min="1" max="10" value="1" style="width:90px"><span class="muted">extra days</span></div><button class="btn btn-primary">Add padding</button></form>
        <div class="grid" style="margin-top:12px">${raw(list('padding', d.padding, (r) => `<b class="mono">${r.pincode}</b> · +${r.days} day${r.days > 1 ? 's' : ''}`))}</div></section>
      <section class="card"><h2>Zone mapping</h2><p class="muted small">Override the pricing zone for a pincode prefix.</p>
        <form class="grid" id="zn"><input class="input" name="prefix" inputmode="numeric" maxlength="6" placeholder="Prefix, e.g. 7820"><select class="select" name="zone">${raw(d.zones_list.map((z, i) => `<option value="${i}">${esc(z)}</option>`).join(''))}</select><button class="btn btn-primary">Map zone</button></form>
        <div class="grid" style="margin-top:12px">${raw(list('zones', d.zones, (r) => `<b class="mono">${r.prefix}*</b> → ${esc(d.zones_list[r.zone])}`))}</div></section>
    </div>`;
  const again = () => renderPincodes(view, { query: new URLSearchParams() });
  view.querySelector('#blk').addEventListener('submit', (e) => { e.preventDefault(); save(() => post('/settings/pincode', { list: 'blocked', ...formData(e.target) }), 'Pincodes blocked', again); });
  view.querySelector('#pad').addEventListener('submit', (e) => { e.preventDefault(); save(() => post('/settings/pincode', { list: 'padding', ...formData(e.target) }), 'Padding added', again); });
  view.querySelector('#zn').addEventListener('submit', (e) => { e.preventDefault(); save(() => post('/settings/pincode', { list: 'zones', ...formData(e.target) }), 'Zone mapped', again); });
  view.querySelector('.grid-3').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (b) save(() => post('/settings/pincode', { list: b.dataset.remove, action: 'remove', index: b.dataset.index }), 'Rule removed', again);
  });
  view.querySelector('#chk').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = view.querySelector('#chkOut');
    try {
      const r = await api('/pincode/check', { query: formData(e.target) });
      const line = (label, x) => `<div class="action-item"><b style="min-width:80px;color:inherit;font-size:14px">${label}</b>${x.serviceable ? `<span class="badge badge-green">Serviceable</span><span>${x.couriers} couriers · fastest ${x.fastest_days} days · ${esc(x.zone)}</span>` : `<span class="badge badge-red">Not serviceable</span><span class="small">${esc(x.reason)}</span>`}</div>`;
      out.innerHTML = `<div class="grid">${line('Prepaid', r.prepaid)}${line('COD', r.cod)}</div>`;
    } catch (err) { out.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
  });
}

// ---- delivery times (S2D) and holidays ----------------------------------------
export async function renderTat(view) {
  const d = await api('/settings/tat');
  const courierName = (id) => (d.couriers.find((c) => c.id === Number(id)) || {}).name || '—';
  view.innerHTML = html`
    <div class="page-head"><div><h1>Delivery time & holidays</h1><p>Ship-to-delivery (S2D) promises by zone, and days when pickups don't happen.</p></div>
      <span class="badge badge-blue">Next pickup: ${date(d.next_pickup)}</span></div>
    <div class="grid grid-3">
      <form class="card" id="s2d"><h2>S2D by zone (days)</h2><div class="table-wrap"><table><thead><tr><th>Zone</th><th>Min</th><th>Max</th></tr></thead><tbody>
        ${raw(d.s2d.map((z, i) => `<tr><td>${esc(d.zones_list[i])}</td><td><input class="input" type="number" min="0" max="20" name="min${i}" value="${z.min}" style="width:70px"></td><td><input class="input" type="number" min="0" max="20" name="max${i}" value="${z.max}" style="width:70px"></td></tr>`).join(''))}
        </tbody></table></div><button class="btn btn-primary" style="margin-top:12px">Save S2D</button></form>
      <section class="card"><h2>Pickup holidays (all couriers)</h2>
        <form class="grid" id="bo"><input class="input" type="date" name="date"><input class="input" name="note" placeholder="e.g. Diwali"><button class="btn btn-primary">Add holiday</button></form>
        <div class="grid" style="margin-top:12px">${raw(d.blackout.length ? d.blackout.map((b, i) => `<div class="action-item"><span><b>${date(b.date)}</b> <small class="muted">${esc(b.note)}</small></span><span class="spacer"></span><button class="btn btn-outline btn-sm" data-remove="blackout" data-index="${i}">Remove</button></div>`).join('') : '<p class="muted">None.</p>')}</div></section>
      <section class="card"><h2>Courier holidays</h2>
        <form class="grid" id="cbo"><select class="select" name="courier_id">${raw(d.couriers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''))}</select><input class="input" type="date" name="date"><input class="input" name="note" placeholder="Reason"><button class="btn btn-primary">Add courier holiday</button></form>
        <div class="grid" style="margin-top:12px">${raw(d.courier_blackout.length ? d.courier_blackout.map((b, i) => `<div class="action-item"><span class="stack"><b style="color:inherit;font-size:14px;min-width:auto">${esc(courierName(b.courier_id))}</b><small class="muted">${date(b.date)} · ${esc(b.note)}</small></span><span class="spacer"></span><button class="btn btn-outline btn-sm" data-remove="courier_blackout" data-index="${i}">Remove</button></div>`).join('') : '<p class="muted">None.</p>')}</div></section>
    </div>`;
  const again = () => renderTat(view);
  view.querySelector('#s2d').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    save(() => post('/settings/tat', { s2d: d.s2d.map((_, i) => ({ min: f['min' + i], max: f['max' + i] })) }), 'S2D saved', again);
  });
  view.querySelector('#bo').addEventListener('submit', (e) => { e.preventDefault(); save(() => post('/settings/tat', { list: 'blackout', ...formData(e.target) }), 'Holiday added', again); });
  view.querySelector('#cbo').addEventListener('submit', (e) => { e.preventDefault(); save(() => post('/settings/tat', { list: 'courier_blackout', ...formData(e.target) }), 'Courier holiday added', again); });
  view.querySelector('.grid-3').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]');
    if (b) save(() => post('/settings/tat', { list: b.dataset.remove, action: 'remove', index: b.dataset.index }), 'Removed', again);
  });
}

// ---- SKU catalog + SKU rules ----------------------------------------------------
export async function renderSkus(view) {
  const d = await api('/skus');
  const cname = (id) => (d.couriers.find((c) => c.id === id) || {}).name;
  const ruleOf = (sku) => d.rules.find((r) => r.sku === sku);
  view.innerHTML = html`
    <div class="page-head"><div><h1>SKU catalog & rules</h1><p>Saved weights and sizes fill new orders automatically; SKU rules steer which couriers and pincodes a product can use.</p></div>
      <button class="btn btn-primary" id="addSku">+ Add SKU</button></div>
    <div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Weight · size</th><th>Courier rules</th><th></th></tr></thead><tbody id="rows">
    ${raw(d.data.map((s) => { const r = ruleOf(s.sku); return html`<tr data-sku="${s.sku}"><td><b>${s.name}</b><br><small class="muted">${s.category} · HSN ${s.hsn || '—'}</small></td><td class="mono">${s.sku}</td><td>₹${s.price}</td>
      <td>${s.weight} kg · ${s.length}×${s.breadth}×${s.height}</td>
      <td class="small">${r ? raw([r.preferred.length && `Prefer: ${r.preferred.map(cname).map(esc).join(', ')}`, r.blocked.length && `Block: ${r.blocked.map(cname).map(esc).join(', ')}`].filter(Boolean).join('<br>')) : raw('<span class="muted">Default</span>')}</td>
      <td><div class="row"><button class="btn btn-outline btn-sm" data-act="edit">Edit</button><button class="btn btn-outline btn-sm" data-act="rules">Couriers</button><button class="btn btn-danger btn-sm" data-act="delete">Delete</button></div></td></tr>`; }).join(''))}
    </tbody></table></div>
    <section class="card"><h2>SKU × pincode blocks</h2><p class="muted small">Stop a product shipping to specific pincodes (e.g. liquids to remote areas).</p>
      <form class="row" id="spf"><select class="select" name="sku" style="width:auto">${raw(d.data.map((s) => `<option value="${esc(s.sku)}">${esc(s.sku)}</option>`).join(''))}</select><input class="input" name="pincode" inputmode="numeric" maxlength="6" placeholder="Pincode" style="max-width:150px"><button class="btn btn-primary">Block</button></form>
      <div class="grid" style="margin-top:12px" id="spl">${raw(d.pincode_map.length ? d.pincode_map.map((m, i) => `<div class="action-item"><span><b class="mono">${esc(m.sku)}</b> ✕ <b class="mono">${m.pincode}</b></span><span class="spacer"></span><button class="btn btn-outline btn-sm" data-index="${i}">Remove</button></div>`).join('') : '<p class="muted">None.</p>')}</div></section>`;
  const again = () => renderSkus(view);
  const skuForm = (s = {}) => modal({
    title: s.sku ? `Edit ${s.sku}` : 'Add SKU',
    body: `<form class="form-grid" id="sf"><label class="field full">Product name<input class="input" name="name" value="${esc(s.name || '')}"></label>
      <label class="field">SKU<input class="input" name="sku" value="${esc(s.sku || '')}" ${s.sku ? 'readonly' : ''}></label><label class="field">Category<input class="input" name="category" value="${esc(s.category || '')}"></label>
      <label class="field">Price (₹)<input class="input" name="price" value="${s.price || ''}"></label><label class="field">HSN<input class="input" name="hsn" value="${esc(s.hsn || '')}"></label>
      <label class="field">Weight (kg)<input class="input" name="weight" value="${s.weight || ''}"></label><label class="field">Length (cm)<input class="input" name="length" value="${s.length || ''}"></label>
      <label class="field">Breadth (cm)<input class="input" name="breadth" value="${s.breadth || ''}"></label><label class="field">Height (cm)<input class="input" name="height" value="${s.height || ''}"></label></form><p class="form-error" id="sErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="sGo">Save</button>',
    onMount: (el, close) => el.querySelector('#sGo').addEventListener('click', async () => {
      try { close(await post('/skus', formData(el.querySelector('#sf')))); } catch (err) { el.querySelector('#sErr').textContent = err.message; }
    }),
  });
  view.querySelector('#addSku').addEventListener('click', async () => { if (await skuForm()) { toast('SKU saved'); again(); } });
  view.querySelector('#rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const s = d.data.find((x) => x.sku === b.closest('tr').dataset.sku);
    if (b.dataset.act === 'edit') { if (await skuForm(s)) { toast('SKU saved'); again(); } return; }
    if (b.dataset.act === 'delete') { save(() => post('/skus/delete', { sku: s.sku }), 'SKU deleted', again); return; }
    const r = ruleOf(s.sku) || { preferred: [], blocked: [] };
    const res = await modal({
      title: `Courier rules · ${s.sku}`,
      body: `<div class="table-wrap"><table><thead><tr><th>Courier</th><th>Prefer</th><th>Block</th></tr></thead><tbody>${d.couriers.map((c) => `<tr><td>${esc(c.name)}</td>
        <td><input type="checkbox" class="check" data-pref="${c.id}" ${r.preferred.includes(c.id) ? 'checked' : ''}></td><td><input type="checkbox" class="check" data-block="${c.id}" ${r.blocked.includes(c.id) ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>
        <p class="muted small" style="margin:0">Preferred couriers are the only ones offered when available. Leave all unticked for default behaviour.</p><p class="form-error" id="rErr"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="rGo">Save rules</button>',
      onMount: (el, close) => el.querySelector('#rGo').addEventListener('click', async () => {
        const ids = (attr) => [...el.querySelectorAll(`[${attr}]:checked`)].map((x) => Number(x.getAttribute(attr)));
        try { close(await post('/settings/sku-rules', { sku: s.sku, preferred: ids('data-pref'), blocked: ids('data-block') })); } catch (err) { el.querySelector('#rErr').textContent = err.message; }
      }),
    });
    if (res) { toast('SKU rules saved'); again(); }
  });
  view.querySelector('#spf').addEventListener('submit', (e) => { e.preventDefault(); save(() => post('/settings/sku-pincode', formData(e.target)), 'SKU blocked for pincode', again); });
  view.querySelector('#spl').addEventListener('click', (e) => { const b = e.target.closest('[data-index]'); if (b) save(() => post('/settings/sku-pincode', { action: 'remove', index: b.dataset.index }), 'Removed', again); });
}
