// Business module pages: live tracking, WhatsApp automation, Single GST, notifications.
import { api, esc, money, moneyIn, store, toast, withBusy, dateTime, date, pager, formData } from '../core.js';
import { tile, duo } from './art.js';
import { emptyScene, statusPill, downloadCsv, filterBtn, openFilters, countActive } from './ui.js';
import { createMap, mapProvider } from './maps.js';
import { openTracking } from './tracking.js';
import { waTabs, renderTab } from './wa.js';

const gate = (view) => { if (store.state.accountType === 'business') return false; view.innerHTML = `<div class="card">${emptyScene('This is part of a Business account. Switch using the Personal / Business control at the top.', null, 'carton')}</div>`; return true; };
const head = (icon, tone, title, intro, right = '') => `<div class="page-head"><div class="row head-t">${tile(icon, tone).value}<div><h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div><div class="row">${right}</div></div>`;

// ---- live tracking -------------------------------------------------------------------
export async function renderTracking(view) {
  if (gate(view)) return undefined;
  view.innerHTML = `${head('radar', 'blue', 'Live Tracking', 'Every active shipment on one map.', '<a class="btn btn-primary" href="#/courier/book">+ New shipment</a>')}
    <div class="grid grid-4" id="kpis"></div>
    <div class="fleet"><section class="card fleet__list"><div class="fleet__filter chips" id="filter" role="group" aria-label="Filter shipments"></div><ul class="fleet__rows" id="rows"></ul></section>
    <section class="fleet__map map-host"><div id="fleetMap"></div><p class="fleet__note" id="mapNote"></p></section></div>`;
  let filter = 'active'; let data = []; let map = null; let timer = 0; let alive = true; let fitted = false;
  const pins = new Map();
  const rows = view.querySelector('#rows');
  const tf = { section: '', provider: '' };
  const tFields = () => [{ key: 'section', label: 'Service', options: [['', 'All services'], ['vehicle', 'Vehicle'], ['courier', 'Courier'], ['logistics', 'Logistics'], ['international', 'International']] }, { key: 'provider', label: 'Partner', options: [['', 'All partners'], ...[...new Set(data.map((s) => s.provider))].map((p) => [p, p])] }];
  const shown = () => data.filter((s) => (filter === 'active' ? s.group !== 'delivered' : filter === 'late' ? s.late : s.group === 'delivered') && (!tf.section || s.section === tf.section) && (!tf.provider || s.provider === tf.provider));
  const etaText = (s) => (s.group === 'delivered' ? 'Delivered' : s.remaining_min < 90 ? `${s.remaining_min} min` : date(s.promised_by));
  function paint(stats) {
    view.querySelector('#kpis').innerHTML = [['Active', stats.active], ['Moving now', stats.moving], ['Running late', stats.late], ['Delivered', stats.delivered]].map(([l, v]) => `<div class="card stat"><span class="stat__label">${l}</span><span class="stat__value">${v}</span></div>`).join('');
    view.querySelector('#filter').innerHTML = [['active', 'Active'], ['late', 'Late'], ['delivered', 'Delivered']].map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join('') + filterBtn(countActive(tFields(), tf));
    const list = shown();
    rows.innerHTML = list.length ? list.map((s) => `<li><button type="button" class="ship" data-s="${esc(s.id)}"><span class="ship__t"><b>${esc(s.provider)}</b><small>${esc(s.sub)}</small><small class="mono">${esc(s.id)}</small></span><span class="ship__r"><b>${esc(etaText(s))}</b>${s.late ? '<span class="badge badge-red">Late</span>' : statusPill(s)}</span><span class="ship__bar"><i style="width:${Math.round(s.progress * 100)}%"></i></span></button></li>`).join('') : `<li>${emptyScene(filter === 'active' ? 'No active shipments. Book one to watch it here.' : 'Nothing here right now.', filter === 'active' ? { href: '#/vehicle/book', label: 'Create booking' } : null, 'carton')}</li>`;
  }
  function drawPins() {
    if (!map) return;
    const live = new Set();
    const points = [];
    shown().forEach((s) => {
      if (!s.position) return;
      live.add(s.id);
      points.push(s.from_pt, s.to_pt);
      const kind = s.late ? 'late' : 'moving';
      if (!pins.has(s.id)) pins.set(s.id, { a: map.marker(s.from_pt, 'pickup'), z: map.marker(s.to_pt, 'drop'), l: map.line(s.from_pt, s.to_pt), m: map.marker(s.position, kind, () => openTracking(s.id)) });
      else pins.get(s.id).m.move(s.position, kind);
    });
    pins.forEach((p, id) => { if (!live.has(id)) { p.a.remove(); p.z.remove(); p.l.remove(); p.m.remove(); pins.delete(id); } });
    if (!fitted && points.length) { map.fit(points); fitted = true; }
  }
  async function load() {
    if (!alive) return;
    try { const r = await api('/hub/biz/shipments'); if (!alive) return; data = r.data; paint(r.stats); drawPins(); } catch (e) { if (alive) toast(e.message, true); }
    if (alive) timer = setTimeout(load, 4000);
  }
  const statsNow = () => ({ active: data.filter((s) => s.group !== 'delivered').length, moving: data.filter((s) => s.group === 'transit').length, late: data.filter((s) => s.late).length, delivered: data.filter((s) => s.group === 'delivered').length });
  view.querySelector('#filter').addEventListener('click', (e) => { const flt = e.target.closest('#flt'); if (flt) { openFilters(flt, tFields(), tf, (v) => { Object.assign(tf, v); fitted = false; paint(statsNow()); drawPins(); }); return; } const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; fitted = false; paint({ active: data.filter((s) => s.group !== 'delivered').length, moving: data.filter((s) => s.group === 'transit').length, late: data.filter((s) => s.late).length, delivered: data.filter((s) => s.group === 'delivered').length }); drawPins(); } });
  rows.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) openTracking(b.dataset.s); });
  try {
    map = await createMap(view.querySelector('#fleetMap'));
    view.querySelector('#mapNote').textContent = (await mapProvider()) === 'google' ? '' : 'Preview map. Add a Google Maps key to switch to Google.';
  } catch (e) { view.querySelector('#mapNote').textContent = e.message; }
  load();
  return () => { alive = false; clearTimeout(timer); if (map) map.destroy(); };
}

// ---- WhatsApp automation ---------------------------------------------------------------
const RECIPIENT = [['sender', 'Sender'], ['receiver', 'Receiver'], ['both', 'Both'], ['ops', 'Operations']];
const fill = (body) => body.replace(/\{\{1\}\}/g, 'Priya').replace(/\{\{2\}\}/g, 'BK12AB').replace(/\{\{3\}\}/g, 'Blue Dart').replace(/\{\{4\}\}/g, 'utlog.in/track');
const mask = (n) => (n ? `${String(n).slice(0, 2)}••••${String(n).slice(-3)}` : '');
export async function renderWhatsApp(view, { query }) {
  if (gate(view)) return undefined;
  const waTab = query && query.get('tab');
  if (['inbox', 'broadcast', 'templates'].includes(waTab)) return renderTab(view, waTab);
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  let timer = 0; let alive = true;
  let preview = null;
  const lf = { direction: '', status: '' };
  const LF = [{ key: 'direction', label: 'Direction', options: [['', 'All messages'], ['out', 'Sent'], ['in', 'Customer replies']] }, { key: 'status', label: 'Status', options: [['', 'Any'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['failed', 'Failed']] }];
  async function load(full) {
    const d = await api('/hub/biz/whatsapp');
    if (!alive) return;
    if (full) {
      const live = d.status.mode === 'live';
      preview = preview || d.rules[0].body;
      view.innerHTML = `${head('whatsapp', 'green', 'WhatsApp Automation', 'Send booking updates automatically, and let customers reply.', `<span class="badge ${live ? 'badge-green' : 'badge-amber'}">${live ? 'Connected' : 'Demo mode'}</span>`)}${waTabs('auto')}
        ${live ? '' : '<p class="callout mb">Demo mode: messages are recorded below, but none are sent. Add your WhatsApp Business API details on the server to go live. Setup steps are in the README.</p>'}
        <div class="grid grid-4" id="waStats"></div>
        <div class="dash dash--even">
          <div class="dash__main">
            <section class="card"><div class="card__head"><h2>Automations</h2><span class="muted small">Receivers only get messages if you confirm their consent when booking.</span></div>
              <ul class="wa-rules">${d.rules.map((r) => `<li data-e="${esc(r.event)}" tabindex="0"><div class="grow"><b>${esc(r.label)}</b><small class="muted block mono">${esc(r.template)}</small></div><select class="select" data-to aria-label="Who receives ${esc(r.label)}">${RECIPIENT.map(([v, l]) => `<option value="${v}" ${v === r.to ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="switch"><input type="checkbox" data-on ${r.enabled ? 'checked' : ''} aria-label="${esc(r.label)}"><i></i></label></li>`).join('')}</ul></section>
            <section class="card"><div class="card__head"><h2>Message log</h2><span id="waFH"></span></div><div id="waLog"></div></section>
          </div>
          <aside class="dash__side">
            <section class="card wa-phone-card"><h2>Preview and test</h2><div class="wa-phone"><div class="wa-phone__top">${duo('whatsapp', 'sm').value}<b>UT Log</b></div><div class="wa-phone__chat" id="waChat"><div class="bubble">${esc(fill(preview))}</div></div>
              <form class="wa-phone__in" id="simF"><input class="input" name="text" placeholder="Reply as customer: TRACK" aria-label="Customer reply" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">Send</button></form></div>
              <label class="field mt">Customer's number<input class="input" id="simFrom" inputmode="numeric" maxlength="10" placeholder="10-digit number"></label><p class="muted small notop">Try TRACK, RESCHEDULE or STOP. Use a sender or receiver number from a booking.</p><p class="form-error" id="simErr"></p></section>
            <section class="card"><h2>Settings</h2><form id="opsF" class="form-grid"><label class="field full">Operations number<input class="input" name="ops" inputmode="numeric" maxlength="10" value="${esc(d.ops)}"></label><p class="form-error full" id="opsErr"></p><div class="full"><button class="btn btn-outline" type="submit">Save</button></div></form>
              <hr class="rule"><form id="testF" class="form-grid"><label class="field full">Send a test message to<input class="input" name="to" inputmode="numeric" maxlength="10"></label><p class="form-error full" id="testErr"></p><div class="full"><button class="btn btn-outline" type="submit">Send test</button></div></form></section>
          </aside></div>`;
      bind();
    }
    view.querySelector('#waStats').innerHTML = [['Sent', d.stats.sent], ['Read', d.stats.read], ['Customer replies', d.stats.inbound], ['Opted out', d.opted_out]].map(([l, v]) => `<div class="card stat"><span class="stat__label">${l}</span><span class="stat__value">${v}</span></div>`).join('');
    view.querySelector('#waFH').innerHTML = filterBtn(countActive(LF, lf), 'waF');
    view.querySelector('#waF').onclick = (e) => openFilters(e.currentTarget, LF, lf, (v) => { Object.assign(lf, v); load(false); });
    const logs = d.log.filter((m) => (!lf.direction || m.direction === lf.direction) && (!lf.status || m.status === lf.status));
    view.querySelector('#waLog').innerHTML = logs.length ? `<ul class="wa-log">${logs.map((m) => `<li class="${m.direction === 'in' ? 'in' : ''}"><div class="grow"><small class="muted">${m.direction === 'in' ? 'From' : 'To'} ${esc(mask(m.to))} · ${esc(dateTime(m.at))}</small><p>${esc(m.body)}</p>${m.error ? `<small class="form-error">${esc(m.error)}</small>` : ''}</div><span class="badge ${m.status === 'failed' ? 'badge-red' : m.status === 'read' ? 'badge-green' : ''}">${esc(m.status)}</span></li>`).join('')}</ul>` : '<p class="muted notop">Messages appear here as bookings move.</p>';
  }
  function bind() {
    const rules = view.querySelector('.wa-rules');
    const saveRule = async (li, patch) => { try { await api('/hub/biz/whatsapp/rule', { method: 'POST', body: { event: li.dataset.e, ...patch } }); toast('Automation saved'); } catch (e) { toast(e.message, true); load(true); } };
    rules.addEventListener('change', (e) => { const li = e.target.closest('[data-e]'); if (e.target.dataset.on != null) saveRule(li, { enabled: e.target.checked }); if (e.target.dataset.to != null) saveRule(li, { to: e.target.value }); });
    const chat = view.querySelector('#waChat');
    const tpls = {}; api('/hub/biz/whatsapp').then((d) => d.rules.forEach((r) => { tpls[r.event] = r.body; }));
    rules.addEventListener('click', (e) => { if (e.target.closest('select, .switch')) return; const li = e.target.closest('[data-e]'); if (li && tpls[li.dataset.e]) { preview = tpls[li.dataset.e]; chat.innerHTML = `<div class="bubble">${esc(fill(preview))}</div>`; } });
    view.querySelector('#simF').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = view.querySelector('#simErr'); err.textContent = '';
      const t = e.target.text.value.trim();
      try {
        const r = await api('/hub/biz/whatsapp/simulate', { method: 'POST', body: { from: view.querySelector('#simFrom').value, text: t } });
        chat.insertAdjacentHTML('beforeend', `<div class="bubble me">${esc(t)}</div><div class="bubble">${esc(r.reply)}</div>`);
        chat.scrollTop = chat.scrollHeight; e.target.text.value = ''; load(false);
      } catch (x) { err.textContent = x.message; }
    });
    view.querySelector('#opsF').addEventListener('submit', async (e) => { e.preventDefault(); const err = view.querySelector('#opsErr'); err.textContent = ''; try { await api('/hub/biz/whatsapp/settings', { method: 'POST', body: formData(e.target) }); toast('Saved'); } catch (x) { err.textContent = x.message; } });
    view.querySelector('#testF').addEventListener('submit', async (e) => { e.preventDefault(); const err = view.querySelector('#testErr'); err.textContent = ''; try { const r = await api('/hub/biz/whatsapp/test', { method: 'POST', body: formData(e.target) }); toast(r.status === 'failed' ? `Could not send: ${r.error}` : r.mode === 'live' ? 'Test message sent' : 'Test recorded. Demo mode sends nothing.', r.status === 'failed'); load(false); } catch (x) { err.textContent = x.message; } });
  }
  await load(true);
  const tick = async () => { if (!alive) return; try { await load(false); } catch (e) { /* retried next tick */ } timer = setTimeout(tick, 4000); };
  timer = setTimeout(tick, 4000);
  return () => { alive = false; clearTimeout(timer); };
}

// ---- Single GST ------------------------------------------------------------------------
const inr = (n) => moneyIn(n, 'INR');
const inr2 = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthName = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const gf = { provider: '', itc: '' };
export async function renderGst(view, { query }) {
  if (gate(view)) return;
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const g = await api('/hub/biz/gst', { query: { month: query.get('month') } });
  const GF = [{ key: 'provider', label: 'Provider', options: [['', 'All providers'], ...[...new Set(g.lines.map((l) => l.provider))].map((p) => [p, p])] }, { key: 'itc', label: 'Input credit', options: [['', 'Any'], ['yes', 'Likely'], ['no', 'Not available']] }];
  const shownLines = g.lines.filter((l) => (!gf.provider || l.provider === gf.provider) && (!gf.itc || (gf.itc === 'yes') === l.itc));
  view.innerHTML = `${head('receipt', 'amber', 'Single GST', 'One GSTIN and one monthly invoice for every provider you use.', `<select class="select scope" id="mon" aria-label="Month">${g.months.map((m) => `<option value="${m}" ${m === g.month ? 'selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select>`)}
    <section class="gst-hero"><div><small>Consolidated invoice</small><b class="mono">${esc(g.invoice_no)}</b><p>${g.lines.length} services from ${g.providers} ${g.providers === 1 ? 'provider' : 'providers'} · ${esc(monthName(g.month))}</p></div>
      <div class="gst-hero__a"><button class="btn btn-primary" id="dl" ${g.ready && g.lines.length ? '' : 'disabled'}>Download invoice</button><button class="btn btn-outline" id="csv" ${g.lines.length ? '' : 'disabled'}>Export for GST filing</button><button class="btn btn-outline" id="share" ${g.ready ? '' : 'disabled'}>Send on WhatsApp</button></div></section>
    <div class="grid grid-4"><div class="card stat"><span class="stat__label">Taxable value</span><span class="stat__value" translate="no">${esc(inr(g.taxable))}</span></div><div class="card stat"><span class="stat__label">${g.inter_state ? 'IGST' : 'CGST + SGST'}</span><span class="stat__value" translate="no">${esc(inr(g.tax))}</span><span class="muted small">${g.inter_state ? 'Inter-state supply' : g.buyer.gstin ? 'Same-state supply' : 'Add GSTIN to confirm'}</span></div><div class="card stat"><span class="stat__label">Input credit likely</span><span class="stat__value" translate="no">${esc(inr(g.itc_eligible))}</span><span class="muted small">Check with your adviser</span></div><div class="card stat"><span class="stat__label">Invoice total</span><span class="stat__value" translate="no">${esc(inr(g.total))}</span></div></div>
    <div class="dash dash--even">
      <div class="dash__main">
        <section class="card"><h2>Tax summary by service code</h2>${g.hsn.length ? `<div class="table-wrap"><table><thead><tr><th>SAC</th><th>Service</th><th>Items</th><th>Rate</th><th>Taxable</th><th>Tax</th><th>Credit</th></tr></thead><tbody>${g.hsn.map((h) => `<tr><td class="mono">${esc(h.sac)}</td><td>${esc(h.desc)}</td><td>${h.count}</td><td>${h.rate}%</td><td translate="no">${esc(inr2(h.taxable))}</td><td translate="no">${esc(inr2(h.tax))}</td><td>${h.itc ? '<span class="badge badge-green">Likely</span>' : '<span class="badge">No</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted notop">No taxable services this month.</p>'}</section>
        <section class="card"><div class="card__head"><h2>Line items</h2>${filterBtn(countActive(GF, gf))}</div>${shownLines.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Service</th><th>Provider</th><th>SAC</th><th>Taxable</th><th>Tax</th><th>Total</th></tr></thead><tbody>${shownLines.map((l) => `<tr><td class="nowrap">${esc(date(l.at))}</td><td>${esc(l.title)}</td><td>${esc(l.provider)}</td><td class="mono">${esc(l.sac)}</td><td translate="no">${esc(inr2(l.taxable))}</td><td translate="no">${esc(inr2(l.tax))}<small class="muted block">${l.rate}%</small></td><td translate="no"><b>${esc(inr2(l.total))}</b></td></tr>`).join('')}</tbody></table></div>` : emptyScene('No bookings this month yet.', { href: '#/courier/book', label: 'Create booking' }, 'carton')}</section>
        ${g.excluded.length ? `<section class="card"><h2>Not on this invoice</h2><p class="muted notop">Bills, FASTag top-ups and business payments are pass-through payments, so they stay out of the GST invoice.</p><ul class="feed">${g.excluded.map((x) => `<li><div class="feed__t"><b>${esc(x.title)}</b><small>${esc(x.provider)}</small></div><b translate="no">${esc(inr(x.amount))}</b></li>`).join('')}</ul></section>` : ''}
      </div>
      <aside class="dash__side"><section class="card"><h2>GST details</h2><form class="form-grid" id="gf" novalidate><label class="field full">GSTIN<input class="input" name="gstin" maxlength="15" style="text-transform:uppercase" value="${esc(g.settings.gstin || '')}"></label><label class="field full">Legal name<input class="input" name="legal_name" value="${esc(g.settings.legal_name || g.settings.company || '')}"></label><label class="field full">Billing address<textarea class="input" name="address" rows="2">${esc(g.settings.address || '')}</textarea></label><p class="form-error full" id="gErr"></p><div class="full"><button class="btn btn-primary" type="submit">Save GST details</button></div></form></section>
      <section class="card"><h2>Before you file</h2><ul class="plain-list"><li>Rates here are indicative, set in the server's GST rules.</li><li>This is a demo document, not a legal tax invoice.</li><li>Have your tax adviser confirm input credit.</li></ul></section></aside>
    </div>`;
  const again = () => renderGst(view, { query });
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, GF, gf, (v) => { Object.assign(gf, v); again(); }));
  view.querySelector('#mon').addEventListener('change', (e) => { location.hash = `#/business/gst?month=${e.target.value}`; });
  view.querySelector('#gf').addEventListener('submit', async (e) => { e.preventDefault(); const btn = e.target.querySelector('[type=submit]'); await withBusy(btn, async () => { try { await api('/hub/biz/gst/settings', { method: 'POST', body: formData(e.target) }); toast('GST details saved'); again(); } catch (x) { view.querySelector('#gErr').textContent = x.message; } }); });
  view.querySelector('#csv').addEventListener('click', () => downloadCsv(`ut-log-gst-${g.month}.csv`, [['Invoice', 'Date', 'Booking', 'Provider', 'Service', 'SAC', 'Rate %', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'ITC likely'], ...g.lines.map((l) => [g.invoice_no, l.at.slice(0, 10), l.id, l.provider, l.title, l.sac, l.rate, l.taxable, l.cgst, l.sgst, l.igst, l.total, l.itc ? 'Yes' : 'No'])]));
  view.querySelector('#share').addEventListener('click', async () => { try { await api('/hub/biz/gst/share', { method: 'POST', body: { month: g.month } }); toast('Invoice sent to your operations number'); } catch (x) { toast(x.message, true); } });
  view.querySelector('#dl').addEventListener('click', () => printInvoice(g));
}
function printInvoice(g) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to open the invoice.', true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(g.invoice_no)}</title><style>body{font:13px/1.5 Inter,Segoe UI,sans-serif;color:#15211E;max-width:820px;margin:32px auto;padding:0 20px}h1{font-size:20px;margin:0}.g{display:flex;justify-content:space-between;gap:24px;margin:16px 0}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:6px 8px;border-bottom:1px solid #E1E6E4;text-align:left}th{background:#F5F7F6}.r{text-align:right}.t td{font-weight:700;border-bottom:0}small{color:#66736F}.demo{padding:8px 10px;background:#FDF1DC;border-radius:6px}</style>
    <h1>Consolidated GST statement</h1><small>${esc(g.invoice_no)} · ${esc(monthName(g.month))}</small><p class="demo">Demo document. Not a tax invoice and not valid for input tax credit.</p>
    <div class="g"><div><b>Supplier</b><br>${esc(g.supplier.name)}<br>GSTIN: ${esc(g.supplier.gstin || 'Not configured')}<br>${esc(g.supplier.state)}</div><div><b>Billed to</b><br>${esc(g.buyer.legal_name)}<br>GSTIN: ${esc(g.buyer.gstin)}<br>${esc(g.buyer.address)}<br>${esc(g.buyer.state)}</div></div>
    <table><tr><th>Date</th><th>Service</th><th>Provider</th><th>SAC</th><th>Rate</th><th class="r">Taxable</th><th class="r">Tax</th><th class="r">Total</th></tr>${g.lines.map((l) => `<tr><td>${esc(l.at.slice(0, 10))}</td><td>${esc(l.title)}</td><td>${esc(l.provider)}</td><td>${esc(l.sac)}</td><td>${l.rate}%</td><td class="r">${inr2(l.taxable)}</td><td class="r">${inr2(l.tax)}</td><td class="r">${inr2(l.total)}</td></tr>`).join('')}<tr class="t"><td colspan="5">Total</td><td class="r">${inr2(g.taxable)}</td><td class="r">${inr2(g.tax)}</td><td class="r">${inr2(g.total)}</td></tr></table>
    <p>${g.inter_state ? `IGST: ${inr2(g.igst)}` : `CGST: ${inr2(g.cgst)} · SGST: ${inr2(g.sgst)}`}</p><script>print()<\/script>`);
  w.document.close();
}

// ---- notification centre -----------------------------------------------------------------
const nf = { state: '', event: '' };
export async function renderNotifications(view, { query }) {
  if (gate(view)) return;
  const page = Number(query.get('page')) || 1;
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const n = await api('/hub/biz/notifications', { query: { page, per_page: 20 } });
  const browserState = 'Notification' in window ? Notification.permission : 'unsupported';
  const NF = [{ key: 'state', label: 'Show', options: [['', 'All'], ['unread', 'Unread only']] }, { key: 'event', label: 'Type', options: [['', 'All types'], ...n.prefs.map((p) => [p.event, p.label])] }];
  n.data = n.data.filter((x) => (!nf.state || !x.read) && (!nf.event || x.event === nf.event));
  view.innerHTML = `${head('bell', 'coral', 'Notifications', 'Every update in one place, and how you want to hear about it.', `${filterBtn(countActive(NF, nf))}<button class="btn btn-outline" id="all" ${n.unread ? '' : 'disabled'}>Mark all as read</button>`)}
    <div class="dash dash--even"><section class="card">${n.data.length ? `<ul class="notes">${n.data.map((x) => `<li class="${x.read ? '' : 'unread'}"><a href="${esc(x.link || '#/business/notifications')}" data-id="${esc(x.id)}">${tile(x.icon, x.tone).value}<div class="grow"><b>${esc(x.title)}</b><small>${esc(x.body)}${x.via && x.via.length ? ` · Also by ${esc(x.via.join(' and ').toUpperCase())} (demo)` : ''}</small></div><small class="muted nowrap">${esc(dateTime(x.at))}</small></a></li>`).join('')}</ul><div id="pg"></div>` : emptyScene('No notifications yet. They appear as bookings move.', null, 'carton')}</section>
    <aside class="dash__side"><section class="card"><h2>Browser alerts</h2><p class="muted notop">${browserState === 'granted' ? 'On for this browser.' : browserState === 'denied' ? 'Blocked. Allow notifications in your browser settings.' : browserState === 'unsupported' ? 'Not supported in this browser.' : 'Get alerts even when this tab is in the background.'}</p>${browserState === 'default' ? '<button class="btn btn-primary" id="askB">Turn on browser alerts</button>' : ''}</section>
    <section class="card"><h2>Channels</h2><div class="table-wrap"><table class="prefs"><thead><tr><th>Event</th><th>App</th><th>Browser</th><th>WhatsApp</th><th>SMS</th><th>Email</th></tr></thead><tbody>${n.prefs.map((p) => `<tr><td>${esc(p.label)}</td>${['inapp', 'browser', 'whatsapp', 'sms', 'email'].map((c) => `<td>${p[c] == null ? '—' : `<input type="checkbox" class="check" data-ev="${esc(p.event)}" data-ch="${c}" ${p[c] ? 'checked' : ''} aria-label="${esc(p.label)} by ${c}">`}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section></aside></div>`;
  const pg = view.querySelector('#pg');
  if (pg) pg.appendChild(pager(n.meta, (p) => { location.hash = `#/business/notifications?page=${p}`; }));
  const fresh = () => window.dispatchEvent(new CustomEvent('ut:notes'));
  view.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, NF, nf, (v) => { Object.assign(nf, v); renderNotifications(view, { query }); }));
  view.querySelector('#all').addEventListener('click', async () => { await api('/hub/biz/notifications/read', { method: 'POST', body: { all: true } }); fresh(); renderNotifications(view, { query }); });
  view.onchange = (async (e) => { if (!e.target.dataset.ev) return; try { await api('/hub/biz/notifications/prefs', { method: 'POST', body: { event: e.target.dataset.ev, channel: e.target.dataset.ch, value: e.target.checked } }); toast('Saved'); } catch (x) { toast(x.message, true); } });
  view.querySelectorAll('[data-id]').forEach((a) => a.addEventListener('click', () => { api('/hub/biz/notifications/read', { method: 'POST', body: { id: a.dataset.id } }).then(fresh).catch(() => {}); }));
  const ask = view.querySelector('#askB');
  if (ask) ask.addEventListener('click', async () => { await Notification.requestPermission(); renderNotifications(view, { query }); });
}
