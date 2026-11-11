// Courier Intelligence: pincode performance, auto-allocation rules, failed deliveries.
import { api, esc, toast, modal, withBusy, dateTime, formData } from '../core.js';
import { tile } from './art.js';
import { filterBtn, openFilters, countActive, emptyScene } from './ui.js';

const state = { pin: '560034', min: '' };
const NF = { status: '' };
const NFIELDS = [{ key: 'status', label: 'Status', options: [['', 'All'], ['ACTION', 'Action needed'], ['REATTEMPT', 'Reattempt booked'], ['RETURNING', 'Returning']] }];
const STATUS = { ACTION: ['badge-amber', 'Action needed'], REATTEMPT: ['badge-blue', 'Reattempt booked'], RETURNING: ['', 'Returning'] };

export async function render(view, { query }) {
  const tab = ['pincode', 'rules', 'ndr'].includes(query.get('tab')) ? query.get('tab') : 'pincode';
  view.innerHTML = `<div class="page-head"><div class="row head-t">${tile('radar', 'blue').value}<div><h1>Courier Intelligence</h1><p>See which courier performs best for each pin code, and act on failed deliveries.</p></div></div></div>
    <nav class="tabs tabs--line">${[['pincode', 'Pincode performance'], ['rules', 'Auto-allocation'], ['ndr', 'Failed deliveries']].map(([k, l]) => `<a href="#/intel?tab=${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav><div id="body"></div>`;
  const body = view.querySelector('#body');
  if (tab === 'pincode') return pincode(body);
  if (tab === 'rules') return rules(body);
  return ndr(body);
}

async function pincode(body) {
  const FIELDS = [{ key: 'min', label: 'Minimum delivery success', options: [['', 'Any'], ['90', '90% and above'], ['95', '95% and above']] }];
  const draw = async () => {
    const d = await api('/hub/intel', { query: { pin: state.pin } });
    const rows = d.rows.filter((r) => !state.min || r.delivered >= Number(state.min));
    const best = d.rows[0];
    body.innerHTML = `<section class="card"><form id="pf" class="intel-f"><label class="field">Delivery pin code<input class="input" name="pin" inputmode="numeric" maxlength="6" value="${esc(state.pin)}"></label><button class="btn btn-primary" type="submit">Check</button>${filterBtn(countActive(FIELDS, state))}<span class="spacer"></span><div class="intel-best"><small>Best for ${esc(d.pin)}</small><b>${esc(best.courier)}</b><span>${best.delivered}% delivered · ${best.days} days</span></div></form><p class="form-error" id="e"></p></section>
      <div class="table-wrap mt"><table><thead><tr><th>Courier</th><th>Score</th><th>Delivered</th><th>Average days</th><th>Failed attempts</th><th>Returned</th><th>Shipments</th><th>Trend</th></tr></thead><tbody>${rows.map((r, n) => `<tr><td><b>${esc(r.courier)}</b>${n === 0 && !state.min ? ' <span class="badge badge-green">Best</span>' : ''}</td><td><span class="score-bar"><i style="width:${r.score}%"></i></span> ${r.score}</td><td>${r.delivered}%</td><td>${r.days}</td><td>${r.ndr}%</td><td>${r.rto}%</td><td>${r.shipments.toLocaleString()}</td><td class="${r.trend >= 0 ? 'pos' : 'neg'}">${r.trend >= 0 ? '+' : ''}${r.trend}%</td></tr>`).join('')}</tbody></table></div><p class="muted small">Sample statistics. Real figures come from your shipments once couriers are connected.</p>`;
    body.querySelector('#pf').addEventListener('submit', async (e) => { e.preventDefault(); const prev = state.pin; state.pin = e.target.pin.value; try { await draw(); } catch (x) { state.pin = prev; body.querySelector('#e').textContent = x.message; } });
    body.querySelector('#flt').addEventListener('click', (e) => openFilters(e.currentTarget, FIELDS, state, (v) => { state.min = v.min; draw(); }));
  };
  await draw();
}

async function rules(body) {
  const d = await api('/hub/alloc');
  const again = () => rules(body);
  body.innerHTML = `<div class="dash dash--even"><section class="card"><h2>Your rules</h2><p class="muted notop">The first matching rule puts that courier at the top of your results.</p>${d.rules.length ? `<ul class="feed">${d.rules.map((r) => `<li><div class="feed__t"><b>${esc(r.courier)}</b><small>${r.min_kg} to ${r.max_kg} kg</small></div><button class="btn btn-danger btn-sm" data-rm="${esc(r.id)}" type="button">Remove</button></li>`).join('')}</ul>` : '<p class="muted">No rules yet.</p>'}</section>
    <section class="card"><h2>Add a rule</h2><form class="form-grid" id="rf" novalidate><label class="field">From (kg)<input class="input" name="min_kg" inputmode="decimal" value="0"></label><label class="field">Up to (kg)<input class="input" name="max_kg" inputmode="decimal"></label><label class="field full">Prefer courier<select class="select" name="courier">${d.couriers.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label><p class="form-error full" id="e"></p><div class="full"><button class="btn btn-primary" type="submit">Add rule</button></div></form></section></div>`;
  body.querySelector('#rf').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/hub/alloc', { method: 'POST', body: formData(e.target) }); toast('Rule added'); again(); } catch (x) { body.querySelector('#e').textContent = x.message; } });
  body.onclick = async (e) => { const b = e.target.closest('[data-rm]'); if (b) { await api('/hub/alloc/remove', { method: 'POST', body: { id: b.dataset.rm } }); toast('Rule removed'); again(); } };
}

async function ndr(body) {
  const d = await api('/hub/ndr');
  const again = () => ndr(body);
  const list = d.data.filter((c) => !NF.status || c.status === NF.status);
  body.innerHTML = `<div class="toolbar">${filterBtn(countActive(NFIELDS, NF))}</div>${list.length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Why it failed</th><th>Attempts</th><th>Status</th><th>Action</th></tr></thead><tbody>${list.map((c) => `<tr><td class="stack"><b>${esc(c.provider)}</b><small class="muted">${esc(c.sub)} · ${esc(dateTime(c.at))}</small></td><td>${esc(c.reason)}</td><td>${c.attempts}</td><td><span class="badge ${STATUS[c.status][0]}">${STATUS[c.status][1]}</span>${c.date ? `<small class="muted block">On ${esc(c.date)}</small>` : ''}</td><td>${c.status === 'ACTION' ? `<div class="row row--nw"><button class="btn btn-primary btn-sm" data-a="reattempt" data-id="${esc(c.id)}" type="button">Reattempt</button><button class="btn btn-outline btn-sm" data-a="address" data-id="${esc(c.id)}" type="button">Change address</button><button class="btn btn-danger btn-sm" data-a="return" data-id="${esc(c.id)}" type="button">Return</button></div>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${emptyScene('No failed deliveries.', null, 'carton')}</div>`}`;
  body.onclick = async (e) => {
    const flt = e.target.closest('#flt');
    if (flt) { openFilters(flt, NFIELDS, NF, (v) => { NF.status = v.status; again(); }); return; }
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const { a, id } = b.dataset;
    if (a === 'return') { try { await api('/hub/ndr/action', { method: 'POST', body: { id, action: 'return' } }); toast('Marked for return'); again(); } catch (x) { toast(x.message, true); } return; }
    modal({
      title: a === 'reattempt' ? 'Book another attempt' : 'Correct the address',
      body: `${a === 'reattempt' ? '<label class="field">Delivery date<input class="input" type="date" id="v"></label>' : '<label class="field">Full address<textarea class="input" id="v" rows="3"></textarea></label>'}<p class="form-error" id="e"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="y">Confirm</button>',
      onMount(el, close) { const go = el.querySelector('#y'); go.addEventListener('click', () => withBusy(go, async () => { const v = el.querySelector('#v').value; try { await api('/hub/ndr/action', { method: 'POST', body: { id, action: a, date: v, address: v } }); close(true); toast('Delivery updated'); again(); } catch (x) { el.querySelector('#e').textContent = x.message; } })); },
    });
  };
}
