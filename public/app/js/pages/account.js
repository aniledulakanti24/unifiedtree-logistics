// Account: KYC & agreements, buyer notifications (VAS), tracking page
// branding, security (2FA, sessions, API keys) and the activity log.
import { api, html, raw, date, dateTime, esc, statusBadge, toast, formData, modal, pager, emptyState } from '../core.js';

const post = (path, body) => api(path, { method: 'POST', body });

export async function renderKyc(view) {
  const d = await api('/kyc');
  const k = d.kyc;
  view.innerHTML = html`
    <div class="page-head"><div><h1>KYC & agreements</h1><p>Complete KYC to receive COD payouts and print GST invoices.</p></div></div>
    <div class="grid grid-2">
      ${k ? raw(html`<section class="card"><div class="row"><h2 style="margin:0">Business KYC</h2>${statusBadge(k.status)}</div>
          <div class="stack" style="margin-top:12px"><span>${k.business_type}</span><span>PAN <b class="mono">${k.pan}</b></span><span>GSTIN <b class="mono">${k.gstin || '—'}</b></span>
          <span>Bank ${k.account_no} · ${k.ifsc}</span><span class="muted small">Verified ${dateTime(k.at)}</span></div></section>`)
        : raw(html`<form class="card" id="kf"><h2>Business KYC</h2><div class="form-grid">
          <label class="field full">Business type<select class="select" name="business_type">${raw(['Individual', 'Proprietorship', 'Partnership', 'Private Limited', 'LLP'].map((t) => `<option>${t}</option>`).join(''))}</select></label>
          <label class="field">PAN<input class="input mono" name="pan" maxlength="10" style="text-transform:uppercase" placeholder="ABCDE1234F"></label>
          <label class="field">GSTIN (optional)<input class="input mono" name="gstin" maxlength="15" style="text-transform:uppercase"></label>
          <label class="field">Bank account number<input class="input mono" name="account_no" inputmode="numeric" autocomplete="off"></label>
          <label class="field">IFSC<input class="input mono" name="ifsc" maxlength="11" style="text-transform:uppercase"></label>
          <div class="full"><button class="btn btn-primary">Verify KYC</button></div></div></form>`)}
      <section class="card"><h2>Agreements</h2><div class="grid">${raw(d.agreements.map((a) => `<div class="action-item" data-id="${a.id}"><span class="stack"><b style="color:inherit;font-size:14px;min-width:auto">${esc(a.title)}</b>
        <small class="muted">${a.accepted_at ? 'Accepted ' + dateTime(a.accepted_at) : 'Not accepted'}</small></span><span class="spacer"></span>${a.accepted_at ? '<span class="badge badge-green">Accepted</span>' : '<button class="btn btn-primary btn-sm">Review & accept</button>'}</div>`).join(''))}</div></section>
    </div>`;
  const kf = view.querySelector('#kf');
  if (kf) kf.addEventListener('submit', async (e) => { e.preventDefault(); try { await post('/kyc', formData(kf)); toast('KYC verified'); renderKyc(view); } catch (err) { toast(err.message, true); } });
  view.querySelector('.grid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id] button');
    if (!b) return;
    const a = d.agreements.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
    const ok = await modal({ title: a.title, body: '<p style="margin:0" class="muted">Placeholder agreement text — replace with your own terms before going live.</p><label class="row"><input type="checkbox" class="check" id="agree"> I have read and agree</label>',
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="acc">Accept</button>',
      onMount: (el, close) => el.querySelector('#acc').addEventListener('click', () => { if (el.querySelector('#agree').checked) close(true); else toast('Tick the box to accept', true); }) });
    if (ok) { await post('/agreements/accept', { id: a.id }); toast('Agreement accepted'); renderKyc(view); }
  });
}

export async function renderVas(view) {
  const d = await api('/vas');
  const CH = [['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'Email']];
  view.innerHTML = html`
    <div class="page-head"><div><h1>Buyer notifications</h1><p>Keep buyers updated automatically. Charged per message from your wallet.</p></div></div>
    <div class="grid grid-3" style="margin-bottom:16px">${raw(CH.map(([k, l]) => `<div class="card stat"><span class="stat__label">${l} sent (30 days)</span><span class="stat__value">${d.usage[k]}</span><span class="muted small">₹${d.prices[k]} per message</span></div>`).join(''))}</div>
    <form class="card" id="vf"><div class="table-wrap"><table><thead><tr><th>Event</th>${raw(CH.map(([, l]) => `<th>${l}</th>`).join(''))}</tr></thead><tbody>
      ${raw(d.events.map((ev) => `<tr><td>${esc(ev)}</td>${CH.map(([k]) => `<td><input type="checkbox" class="check" data-ev="${esc(ev)}" data-ch="${k}" ${d.matrix[ev][k] ? 'checked' : ''} aria-label="${esc(ev)} via ${k}"></td>`).join('')}</tr>`).join(''))}
    </tbody></table></div><button class="btn btn-primary" style="margin-top:12px">Save notifications</button></form>`;
  view.querySelector('#vf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const matrix = {};
    view.querySelectorAll('[data-ev]').forEach((c) => { (matrix[c.dataset.ev] = matrix[c.dataset.ev] || {})[c.dataset.ch] = c.checked; });
    try { await post('/vas', { matrix }); toast('Notifications saved'); } catch (err) { toast(err.message, true); }
  });
}

export async function renderTrackingPage(view) {
  const tp = await api('/settings/tracking-page');
  const sample = await api('/shipments/all', { query: { from: '2000-01-01', per_page: 1 } });
  const awb = sample.data[0] && sample.data[0].awb;
  const r = tp.ratings;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Tracking page</h1><p>A branded page your buyers see when they track an order — with your product picks and a delivery rating.</p></div>
      ${awb ? raw(`<a class="btn btn-outline" href="/track/?awb=${esc(awb)}" target="_blank" rel="noopener">Open live preview</a>`) : ''}</div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <form class="card" id="tf"><div class="form-grid">
        <label class="field">Brand name<input class="input" name="brand_name" value="${tp.brand_name}"></label>
        <label class="field">Brand colour<input class="input" name="color" type="color" value="${tp.color}" style="height:42px;padding:4px"></label>
        <label class="field">Support phone<input class="input" name="support_phone" inputmode="numeric" maxlength="10" value="${tp.support_phone}"></label>
        <label class="field">Support email<input class="input" name="support_email" type="email" value="${tp.support_email}"></label>
        <label class="field full">Banner message<input class="input" name="banner" value="${tp.banner}"></label>
        <label class="field full">Store URL (for product links)<input class="input" name="store_url" placeholder="https://mystore.com" value="${tp.store_url}"></label>
        <div class="full"><span class="field">Recommend up to 4 products</span><div class="grid grid-2" style="margin-top:6px">
          ${raw(tp.skus.map((s) => `<label class="row"><input type="checkbox" class="check" data-sku="${esc(s.sku)}" ${tp.recommendations.includes(s.sku) ? 'checked' : ''}> ${esc(s.name)} <span class="muted small">₹${s.price}</span></label>`).join(''))}</div></div>
        <label class="row full"><input type="checkbox" class="check" name="show_products" ${tp.show_products ? raw('checked') : ''}> Show the ordered items</label>
        <label class="row full"><input type="checkbox" class="check" name="rating_enabled" ${tp.rating_enabled ? raw('checked') : ''}> Ask buyers to rate the delivery once it's delivered</label>
        <div class="full"><button class="btn btn-primary">Save</button></div></div></form>
      <section class="card"><h2>Delivery ratings</h2>
        <div class="stat"><span class="stat__value">${r.average == null ? '—' : r.average}<span class="muted" style="font-size:14px"> / 5</span></span><span class="muted small">${r.count} rating${r.count === 1 ? '' : 's'}</span></div>
        ${r.recent.length ? raw(r.recent.map((x) => `<div class="action-item" style="margin-top:8px;align-items:flex-start"><span class="stack"><span class="stars">${'★'.repeat(x.rating)}${'☆'.repeat(5 - x.rating)}</span><small class="muted">${esc(x.order_id)} · ${date(x.at)}</small>${x.comment ? `<span class="small">"${esc(x.comment)}"</span>` : ''}</span></div>`).join('')) : raw('<p class="muted small">Ratings appear here after buyers rate delivered orders.</p>')}</section>
    </div>`;
  view.querySelector('#tf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await post('/settings/tracking-page', { ...formData(f), show_products: f.show_products.checked, rating_enabled: f.rating_enabled.checked,
        recommendations: [...f.querySelectorAll('[data-sku]:checked')].map((c) => c.dataset.sku) });
      toast('Tracking page saved');
      renderTrackingPage(view);
    } catch (err) { toast(err.message, true); }
  });
}

export async function renderSecurity(view) {
  const d = await api('/security');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Security</h1></div></div>
    <div class="grid grid-2">
      <section class="card"><h2>Two-factor login</h2><p class="muted">Ask for a one-time code after your password when logging in with email.</p>
        ${d.twofa ? raw('<div class="row"><span class="badge badge-green">On</span><button class="btn btn-danger btn-sm" id="off">Turn off</button></div>') : raw('<button class="btn btn-primary" id="on">Turn on</button>')}
        ${d.has_password ? '' : raw('<p class="muted small">Only applies once you log in with email and password.</p>')}</section>
      <section class="card"><h2>Active sessions</h2>${raw(d.sessions.map((s) => `<div class="action-item"><span>${esc(s.device)}</span><span class="spacer"></span><small class="mono muted">${esc(s.id)}…</small>${s.current ? '<span class="badge badge-purple">Current</span>' : ''}</div>`).join(''))}
        ${d.sessions.length > 1 ? raw('<button class="btn btn-outline btn-sm" id="revokeOthers" style="margin-top:10px">Sign out other devices</button>') : ''}</section>
      <section class="card span-2"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">API keys</h2><span class="spacer"></span><button class="btn btn-outline btn-sm" id="newKey">+ New key</button></div>
        ${d.api_keys.length ? raw(d.api_keys.map((k) => `<div class="action-item" data-id="${k.id}"><span class="stack"><b style="color:inherit;font-size:14px;min-width:auto">${esc(k.name)}</b><small class="mono muted">${esc(k.prefix)} · created ${date(k.created_at)}</small></span><span class="spacer"></span><button class="btn btn-danger btn-sm">Revoke</button></div>`).join('')) : raw('<p class="muted">No API keys. Create one to push orders from your own systems.</p>')}</section>
    </div>`;
  const again = () => renderSecurity(view);
  const on = (sel, fn) => { const el = view.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('#on', async () => {
    try {
      const s = await post('/security/2fa/start');
      const ok = await modal({ title: 'Turn on two-factor login', body: `<p style="margin:0">Enter the code sent to ${esc(s.sent_to)}.${s.dev_otp ? ` <span class="muted">(dev code: ${esc(s.dev_otp)})</span>` : ''}</p><input class="input mono" id="code" inputmode="numeric" maxlength="6"><p class="form-error" id="e"></p>`,
        footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Confirm</button>',
        onMount: (el, close) => el.querySelector('#go').addEventListener('click', async () => { try { close(await post('/security/2fa/confirm', { otp: el.querySelector('#code').value })); } catch (err) { el.querySelector('#e').textContent = err.message; } }) });
      if (ok) { toast('Two-factor login is on'); again(); }
    } catch (err) { toast(err.message, true); }
  });
  on('#off', async () => { await post('/security/2fa/disable'); toast('Two-factor login is off'); again(); });
  on('#revokeOthers', async () => { const r = await post('/security/sessions/revoke-others'); toast(`Signed out ${r.revoked} other session${r.revoked === 1 ? '' : 's'}`); again(); });
  on('#newKey', async () => {
    const name = await modal({ title: 'New API key', body: '<label class="field">Name<input class="input" id="kn" placeholder="e.g. Warehouse ERP"></label>',
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Create</button>', onMount: (el, close) => el.querySelector('#go').addEventListener('click', () => close(el.querySelector('#kn').value)) });
    if (!name) return;
    try {
      const k = await post('/security/api-keys', { name });
      await modal({ title: 'Copy your key now', body: `<p style="margin:0">This is the only time the full key is shown.</p><input class="input mono" readonly value="${esc(k.secret)}" onclick="this.select()">`, footer: '<button class="btn btn-primary" data-close>Done</button>' });
      again();
    } catch (err) { toast(err.message, true); }
  });
  view.querySelectorAll('[data-id] .btn-danger').forEach((b) => b.addEventListener('click', async () => { await post('/security/api-keys/revoke', { id: b.closest('[data-id]').dataset.id }); toast('Key revoked'); again(); }));
}

export async function renderActivity(view, { query }) {
  const page = Number(query.get('page')) || 1;
  const d = await api('/activity', { query: { page, per_page: 25 } });
  view.innerHTML = html`
    <div class="page-head"><div><h1>Activity log</h1><p>Every change made in your account, newest first.</p></div><a class="btn btn-outline" href="#/reports?type=activity">Export</a></div>
    <div class="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>By</th></tr></thead><tbody>
    ${d.data.length ? raw(d.data.map((a) => html`<tr><td>${dateTime(a.at)}</td><td>${a.label}</td><td>${a.by}</td></tr>`).join('')) : raw(`<tr><td colspan="3">${emptyState('No activity yet.').value}</td></tr>`)}
    </tbody></table></div><div id="pager"></div>`;
  view.querySelector('#pager').appendChild(pager(d.meta, (p) => { location.hash = '#/activity?page=' + p; }));
}
