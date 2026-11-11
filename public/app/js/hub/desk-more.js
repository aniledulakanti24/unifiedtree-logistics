// Service workspace sub-sections: Analytics, Control Tower and Settings, each with its own tabs.
import { api, esc, money, toast, dateTime, withBusy } from '../core.js';
import { tile, scene } from './art.js';
import { filterBtn, openFilters, countActive, downloadCsv, hbars, bars } from './ui.js';
import { openTracking } from './tracking.js';
import { cancelOne } from './orders.js';
import { DESKS, subPills } from './desk.js';

const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['', 'All time']];
const DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M4 20h16"/></svg>';
const empty = (text) => `<div class="empty-scene">${scene('orders').value}<p>${esc(text)}</p></div>`;
const table = (head, rows) => `<div class="table-wrap"><table class="orders"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// ---- analytics ---------------------------------------------------------------------------
const VIEWS = [['overview', 'Overview'], ['partners', 'Partners'], ['routes', 'Routes'], ['payments', 'Payments']];
export async function analyticsTab(body, key, query) {
  const c = DESKS[key];
  const view = query.get('view') || 'overview';
  const days = query.get('days') == null ? '30' : query.get('days');
  const sub = query.get('sub') || '';
  const pay = query.get('pay') || '';
  const link = (patch) => { const q = new URLSearchParams({ view, days, sub, pay, ...patch }); [...q.keys()].forEach((k) => { if (!q.get(k) && k !== 'days') q.delete(k); }); return `${c.base}/analytics?${q}`; };
  body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const d = await api('/hub/desk/analytics', { query: { desk: key, days, sub, pay } });
  const fields = [{ key: 'pay', label: 'Payment', options: [['', 'All payments'], ['prepaid', 'Prepaid'], ['cod', 'Pay on delivery']] }];
  const partnerRows = d.providers.map((p) => [p.name, p.orders, money(p.spend), p.delivered, p.cancelled, `${p.success}%`]);
  const routeRows = d.routes.map((r) => [r.name, r.orders, money(r.spend)]);
  const payRows = d.payments.map((p) => [p.name, p.orders, money(p.amount)]);
  const panes = {
    overview: () => `<div class="grid grid-4"><div class="card stat"><span class="stat__label">Orders</span><span class="stat__value">${d.orders}</span></div><div class="card stat"><span class="stat__label">Spend</span><span class="stat__value" translate="no">${esc(money(d.spend))}</span></div><div class="card stat"><span class="stat__label">Average order</span><span class="stat__value" translate="no">${esc(money(d.average))}</span></div><div class="card stat"><span class="stat__label">Completed</span><span class="stat__value">${d.success}%</span><span class="muted small">${d.cancel_rate}% cancelled</span></div></div><section class="card mt-s"><h2>Daily spend, last ${d.series.length} days</h2><div id="anBars"></div></section>`,
    partners: () => (d.providers.length ? `<div class="dash dash--even"><section class="card">${table(['Partner', 'Orders', 'Spend', 'Completed', 'Cancelled', 'Success'], partnerRows)}</section><aside class="dash__side"><section class="card"><h2>Spend by partner</h2>${hbars(d.providers.map((p) => ({ name: p.name, amount: p.spend })))}</section></aside></div>` : empty('No partner data in this period.')),
    routes: () => (d.routes.length ? `<section class="card">${table(['Route or reference', 'Orders', 'Spend'], routeRows)}</section>` : empty('No routes in this period.')),
    payments: () => (d.orders ? `<div class="dash dash--even"><section class="card">${table(['Method', 'Orders', 'Amount'], payRows)}</section><aside class="dash__side"><section class="card"><h2>Amount by method</h2>${hbars(d.payments)}</section></aside></div>` : empty('No payments in this period.')),
  };
  body.innerHTML = `<div class="desk-bar"><span class="spacer"></span><button class="btn btn-soft" id="csv" type="button">${DOWNLOAD}Download Report</button><select class="select desk-days" id="days" aria-label="Date range">${RANGES.map(([v, l]) => `<option value="${v}" ${v === days ? 'selected' : ''}>${l}</option>`).join('')}</select>${filterBtn(countActive(fields, { pay }))}</div>
    ${subPills(c, sub, (k) => link({ sub: k }))}
    <nav class="tabs tabs--line">${VIEWS.map(([k, l]) => `<a href="${link({ view: k })}" class="${k === view ? 'active' : ''}">${l}</a>`).join('')}</nav>
    ${(panes[view] || panes.overview)()}`;
  const chart = body.querySelector('#anBars');
  if (chart) bars(chart, d.series, 'Daily spend');
  body.querySelector('#days').addEventListener('change', (e) => { location.hash = link({ days: e.target.value }); });
  body.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, fields, { pay }, (v) => { location.hash = link(v); }));
  body.querySelector('#csv').addEventListener('click', () => {
    const head = view === 'routes' ? [['Route', 'Orders', 'Spend INR'], ...d.routes.map((r) => [r.name, r.orders, r.spend])] : view === 'payments' ? [['Method', 'Orders', 'Amount INR'], ...d.payments.map((p) => [p.name, p.orders, p.amount])] : [['Partner', 'Orders', 'Spend INR', 'Completed', 'Cancelled', 'Success %'], ...d.providers.map((p) => [p.name, p.orders, p.spend, p.delivered, p.cancelled, p.success])];
    downloadCsv(`ut-log-${key}-${view}.csv`, head);
  });
}

// ---- control tower -----------------------------------------------------------------------
const towerFilter = {};
export async function towerTab(body, key, query) {
  const c = DESKS[key];
  body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const d = await api('/hub/desk/tower', { query: { desk: key } });
  const active = d.sections.find((s) => s.key === query.get('view')) || d.sections[0];
  const f = towerFilter[key] || (towerFilter[key] = { provider: '' });
  const providers = [...new Set(d.sections.flatMap((s) => s.items.map((i) => i.provider)).filter(Boolean))];
  const fields = [{ key: 'provider', label: 'Partner', options: [['', 'All partners'], ...providers.map((p) => [p, p])] }];
  const items = active.items.filter((i) => !f.provider || i.provider === f.provider);
  const total = d.sections.reduce((t, s) => t + s.items.length, 0);
  const action = (i) => (i.action === 'track' ? `<button class="btn btn-outline btn-sm" data-track="${esc(i.id)}" type="button">Track</button>` : i.action === 'cancel' ? `<button class="btn btn-outline btn-sm" data-cancel="${esc(i.id)}" type="button">Cancel</button>` : `<a class="btn btn-outline btn-sm" href="${esc(i.href)}">${esc(i.cta || 'View')}</a>`);
  body.innerHTML = `<div class="tower-head ${total ? 'tower-head--warn' : ''}">${tile(total ? 'bell' : 'radar', total ? 'amber' : 'green').value}<div class="grow"><b>${total ? `${total} ${total === 1 ? 'item needs' : 'items need'} attention` : 'Everything is on track'}</b><small>${esc(d.note)}</small></div>${c.settings ? `<a class="link" href="${c.base}/settings?view=alerts">Change limits</a>` : ''}${filterBtn(countActive(fields, f))}</div>
    <nav class="tabs tabs--line">${d.sections.map((s) => `<a href="${c.base}/tower?view=${s.key}" class="${s.key === active.key ? 'active' : ''}">${esc(s.label)}<span class="count">${s.items.length}</span></a>`).join('')}</nav>
    ${items.length ? `<section class="card"><ul class="feed">${items.map((i) => `<li><div class="feed__t"><b>${esc(i.title)}</b><small>${esc([i.provider, i.sub].filter(Boolean).join(' · '))}</small><small class="tower-note">${esc(i.note)}</small></div><div class="feed__r">${i.amount != null ? `<b translate="no">${esc(money(i.amount))}</b>` : ''}${i.at ? `<small>${esc(dateTime(i.at))}</small>` : ''}</div>${action(i)}</li>`).join('')}</ul></section>` : `<div class="empty-scene empty-scene--tall">${scene('orders').value}<p>${esc(active.empty)}</p></div>`}`;
  const again = () => towerTab(body, key, query);
  body.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, fields, f, (v) => { f.provider = v.provider; again(); }));
  body.onclick = (e) => {
    const t = e.target.closest('[data-track]'); if (t) { openTracking(t.dataset.track); return; }
    const x = e.target.closest('[data-cancel]'); if (x) cancelOne(active.items.find((i) => i.id === x.dataset.cancel), again);
  };
}

// ---- settings ----------------------------------------------------------------------------
const SORTS = [['best', 'Recommended'], ['fast', 'Fastest first'], ['low', 'Lowest price first'], ['rating', 'Top rated first']];
export async function settingsTab(body, key, query, partners = []) {
  const c = DESKS[key];
  const transport = !!c.transport;
  const tabs = [['defaults', 'Booking defaults'], ...(transport ? [['partners', 'Partners']] : []), ...(c.alerts ? [['alerts', 'Alert limits']] : [])];
  const view = tabs.some(([k]) => k === query.get('view')) ? query.get('view') : 'defaults';
  body.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const s = await api('/hub/desk/settings', { query: { desk: key } });
  const all = [...new Set([...partners, ...s.seen, ...s.blocked])].sort();
  const panes = {
    defaults: () => `<div class="form-grid"><label class="field">Sort results by<select class="select" name="sort">${SORTS.map(([v, l]) => `<option value="${v}" ${v === s.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${transport ? `<label class="field">Default payment<select class="select" name="pay_mode"><option value="prepaid" ${s.pay_mode === 'prepaid' ? 'selected' : ''}>Pay online</option><option value="cod" ${s.pay_mode === 'cod' ? 'selected' : ''}>Pay on delivery</option></select></label><label class="field full">Default pickup<input class="input" name="pickup" maxlength="80" value="${esc(s.pickup)}" placeholder="Area or pin code filled in on every new booking"></label>` : ''}</div>`,
    partners: () => `<p class="muted notop">Switch off a partner to hide it from your ${esc(c.noun)} results. Partners you have seen in a search appear here.</p><ul class="toggles">${all.map((p) => `<li><b>${esc(p)}</b><label class="switch"><input type="checkbox" data-partner="${esc(p)}" ${s.blocked.includes(p) ? '' : 'checked'} aria-label="Use ${esc(p)}"><i></i></label></li>`).join('')}</ul>`,
    alerts: () => `<p class="muted notop">These limits decide what appears in Control Tower.</p><div class="form-grid"><label class="field">Mark as delayed after (hours past promise)<input class="input" name="delay_hours" inputmode="numeric" value="${s.delay_hours}"></label><label class="field">Mark as stuck after (hours without pickup)<input class="input" name="stuck_hours" inputmode="numeric" value="${s.stuck_hours}"></label></div>`,
  };
  body.innerHTML = `<nav class="tabs tabs--line">${tabs.map(([k, l]) => `<a href="${c.base}/settings?view=${k}" class="${k === view ? 'active' : ''}">${l}</a>`).join('')}</nav>
    <section class="card settings-card"><form id="sf" novalidate>${panes[view]()}<p class="form-error" id="err"></p><button class="btn btn-primary" id="save" type="submit">Save changes</button></form></section>`;
  const form = body.querySelector('#sf');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const patch = Object.fromEntries(new FormData(form));
    if (view === 'partners') patch.blocked = [...form.querySelectorAll('[data-partner]')].filter((x) => !x.checked).map((x) => x.dataset.partner);
    withBusy(body.querySelector('#save'), async () => {
      try { await api('/hub/desk/settings', { method: 'POST', query: { desk: key }, body: patch }); body.querySelector('#err').textContent = ''; toast('Settings saved'); window.dispatchEvent(new CustomEvent('ut:desk-settings', { detail: key })); }
      catch (x) { body.querySelector('#err').textContent = x.message; }
    });
  });
}
