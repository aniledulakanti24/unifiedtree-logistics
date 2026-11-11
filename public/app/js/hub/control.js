// Spending controls and the integrations / go-live page.
import { api, esc, money, toast, dateTime } from '../core.js';
import { tile } from './art.js';
import { filterBtn, openFilters, countActive } from './ui.js';

const sf = { status: '' };
const SF = [{ key: 'status', label: 'Status', options: [['', 'All'], ['PENDING', 'Waiting'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']] }];
const BADGE = { PENDING: 'badge-amber', APPROVED: 'badge-green', REJECTED: 'badge-red' };
export async function renderSpend(view) {
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const d = await api('/hub/spend');
  const again = () => renderSpend(view);
  const reqs = d.requests.filter((r) => !sf.status || r.status === sf.status);
  const limits = (key, rule) => `<div class="row row--nw" data-key="${esc(key)}"><input class="input lim" data-l="monthly" inputmode="numeric" value="${rule ? rule.monthly || '' : ''}" placeholder="Monthly" aria-label="Monthly limit"><input class="input lim" data-l="per_txn" inputmode="numeric" value="${rule ? rule.per_txn || '' : ''}" placeholder="Per payment" aria-label="Per payment limit"></div>`;
  view.innerHTML = `<div class="page-head"><div class="row head-t">${tile('rupee', 'amber').value}<div><h1>Spending Controls</h1><p>Set limits per person. Anything above a limit needs your approval.</p></div></div></div>
    <div class="dash dash--even"><section class="card"><h2>Limits (₹)</h2><div class="table-wrap"><table><thead><tr><th>Person</th><th>Spent this month</th><th>Limits</th></tr></thead><tbody><tr><td><b>Everyone else</b><small class="muted block">Default for the team</small></td><td>—</td><td>${limits('*', d.default_rule)}</td></tr>${d.members.map((m) => `<tr><td><b>${esc(m.name)}</b>${m.allowance ? `<small class="muted block">Approved to spend ${esc(money(m.allowance))}</small>` : ''}</td><td translate="no">${esc(money(m.used))}</td><td>${limits(m.key, m.rule)}</td></tr>`).join('')}</tbody></table></div>${d.members.length ? '' : '<p class="muted small">Invite people in Access Control to set limits for each person.</p>'}</section>
    <section class="card"><div class="card__head"><h2>Approval requests</h2>${filterBtn(countActive(SF, sf))}</div>${reqs.length ? `<ul class="feed">${reqs.map((r) => `<li><div class="feed__t"><b>${esc(r.name)} · <span translate="no">${esc(money(r.amount))}</span></b><small>${esc(r.note)} · ${esc(dateTime(r.at))}</small></div>${r.status === 'PENDING' ? `<div class="row row--nw"><button class="btn btn-primary btn-sm" data-ok="${esc(r.id)}" type="button">Approve</button><button class="btn btn-outline btn-sm" data-no="${esc(r.id)}" type="button">Reject</button></div>` : `<span class="badge ${BADGE[r.status]}">${r.status === 'APPROVED' ? 'Approved' : 'Rejected'}</span>`}</li>`).join('')}</ul>` : '<p class="muted notop">No requests.</p>'}</section></div>`;
  view.onchange = async (e) => { const row = e.target.closest('[data-key]'); if (!row) return; const v = (l) => row.querySelector(`[data-l="${l}"]`).value; try { await api('/hub/spend/rule', { method: 'POST', body: { key: row.dataset.key, monthly: v('monthly'), per_txn: v('per_txn') } }); toast('Limit saved'); } catch (x) { toast(x.message, true); } };
  view.onclick = async (e) => {
    const flt = e.target.closest('#flt'); if (flt) { openFilters(flt, SF, sf, (v) => { sf.status = v.status; again(); }); return; }
    const ok = e.target.closest('[data-ok]'); const no = e.target.closest('[data-no]');
    if (ok || no) { try { await api('/hub/spend/decide', { method: 'POST', body: { id: (ok || no).dataset[ok ? 'ok' : 'no'], approve: !!ok } }); toast(ok ? 'Approved' : 'Rejected'); again(); } catch (x) { toast(x.message, true); } }
  };
}

const inf = { group: '' };
export async function renderIntegrations(view) {
  view.innerHTML = '<div class="skeleton" style="height:260px"></div>';
  const [d, prof] = await Promise.all([api('/hub/integrations'), api('/hub/profile')]);
  const again = () => renderIntegrations(view);
  const IF = [{ key: 'group', label: 'Category', options: [['', 'All'], ...[...new Set(d.list.map((x) => x.group))].map((g) => [g, g])] }];
  const done = d.checklist.filter((c) => c.done).length;
  view.innerHTML = `<div class="page-head"><div class="row head-t">${tile('plug', 'green').value}<div><h1>Integrations</h1><p>Every provider connection, and what is left before going live.</p></div></div>${filterBtn(countActive(IF, inf))}</div>
    <p class="callout mb">Every connection here is a sandbox. It behaves like the real service, but no real provider is connected and no money moves.</p>
    <div class="dash dash--even"><div class="ints">${d.list.filter((x) => !inf.group || x.group === inf.group).map((x) => `<article class="card int" data-k="${x.key}"><div class="row"><div class="grow"><b>${esc(x.name)}</b><small class="muted block">${esc(x.detail)}</small></div><label class="switch"><input type="checkbox" data-c ${x.connected ? 'checked' : ''} aria-label="Connect ${esc(x.name)}"><i></i></label></div><div class="row mt-s"><span class="badge badge-amber">${x.mode}</span>${x.latency ? `<small class="muted">${x.latency} ms</small>` : ''}<span class="spacer"></span><button class="link" data-t type="button">Test connection</button></div></article>`).join('')}</div>
    <aside class="dash__side"><section class="card"><h2>Connected apps</h2><ul class="toggles">${prof.apps.map((a) => `<li><div><b>${esc(a.name)}</b><small class="muted block">${esc(a.group)}</small></div><label class="switch"><input type="checkbox" data-app="${a.key}" ${a.connected ? 'checked' : ''} aria-label="${esc(a.name)}"><i></i></label></li>`).join('')}</ul></section><section class="card"><h2>Go-live checklist</h2><p class="muted notop">${done} of ${d.checklist.length} done</p><span class="hbar__t"><i style="width:${(done / d.checklist.length) * 100}%"></i></span><ul class="checks">${d.checklist.map((c) => `<li class="${c.done ? 'ok' : ''}"><i>${c.done ? '✓' : ''}</i><div><b>${esc(c.label)}</b><small class="muted block">${esc(c.note)}</small></div></li>`).join('')}</ul></section></aside></div>`;
  view.onchange = async (e) => { if (e.target.dataset.app) { await api('/hub/profile', { method: 'POST', body: { connected: { [e.target.dataset.app]: e.target.checked } } }); toast(e.target.checked ? 'Connected' : 'Disconnected'); return; } if (e.target.dataset.c == null) return; await api('/hub/integrations/connect', { method: 'POST', body: { key: e.target.closest('[data-k]').dataset.k, connected: e.target.checked } }); toast(e.target.checked ? 'Sandbox connected' : 'Disconnected'); };
  view.onclick = async (e) => {
    const flt = e.target.closest('#flt'); if (flt) { openFilters(flt, IF, inf, (v) => { inf.group = v.group; again(); }); return; }
    const t = e.target.closest('[data-t]');
    if (t) { const r = await api('/hub/integrations/test', { method: 'POST', body: { key: t.closest('[data-k]').dataset.k } }); toast(`Sandbox responded in ${r.latency} ms`); again(); }
  };
}
