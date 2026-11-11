// Support tickets: list, conversation thread, new ticket.
import { api, html, raw, esc, dateTime, statusBadge, toast, formData, modal, pager, emptyState, refreshCounts } from '../core.js';

const CATEGORIES = ['Shipment delay', 'Pickup issue', 'COD remittance', 'Weight dispute', 'Billing', 'Other'];
const STATUS = { OPEN: ['Open', 'badge-blue'], AWAITING_YOU: ['Waiting for you', 'badge-amber'], RESOLVED: ['Resolved', 'badge-green'] };
const badge = (s) => `<span class="badge ${STATUS[s][1]}">${STATUS[s][0]}</span>`;

export async function renderSupport(view, { query }) {
  const id = query.get('id');
  if (id) return renderThread(view, Number(id));
  const status = query.get('status') || '';
  const page = Number(query.get('page')) || 1;
  const d = await api('/tickets', { query: { status, page, per_page: 15 } });
  view.innerHTML = html`
    <div class="page-head"><div><h1>Support</h1><p>Raise issues against an order or AWB and follow them here.</p></div><button class="btn btn-primary" id="newT">+ New ticket</button></div>
    <nav class="tabs">${raw([['', 'All'], ['AWAITING_YOU', 'Waiting for you'], ['OPEN', 'Open'], ['RESOLVED', 'Resolved']].map(([k, l]) => `<a href="#/support${k ? '?status=' + k : ''}" class="${k === status ? 'active' : ''}">${l}</a>`).join(''))}</nav>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Subject</th><th>Category</th><th>Reference</th><th>Last update</th><th>Reply due</th><th>Status</th></tr></thead><tbody>
    ${d.data.length ? raw(d.data.map((t) => `<tr><td class="mono">${t.id}</td><td><a class="link" href="#/support?id=${t.id}">${esc(t.subject)}</a><br><small class="muted">${esc(t.last.from)}: ${esc(t.last.text.slice(0, 70))}${t.last.text.length > 70 ? '…' : ''}</small></td>
      <td>${esc(t.category)}</td><td class="mono">${esc(t.ref || '—')}</td><td>${dateTime(t.last.at)}</td><td>${t.status === 'RESOLVED' ? '—' : dateTime(t.due_by)}</td><td>${badge(t.status)}</td></tr>`).join(''))
      : raw(`<tr><td colspan="7">${emptyState('No tickets here.').value}</td></tr>`)}
    </tbody></table></div><div id="pager"></div>`;
  view.querySelector('#pager').appendChild(pager(d.meta, (p) => { location.hash = `#/support?${status ? 'status=' + status + '&' : ''}page=${p}`; }));
  view.querySelector('#newT').addEventListener('click', () => newTicket(query.get('ref')));
  if (query.get('new')) newTicket(query.get('ref'), query.get('category'));
}

async function newTicket(ref = '', category = 'Shipment delay') {
  const r = await modal({
    title: 'New support ticket', wide: true,
    body: `<form class="form-grid" id="nf"><label class="field">Category<select class="select" name="category">${CATEGORIES.map((c) => `<option ${c === category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Order ID or AWB (optional)<input class="input mono" name="ref" value="${esc(ref || '')}"></label>
      <label class="field full">Subject<input class="input" name="subject" maxlength="120"></label>
      <label class="field full">Describe the issue<textarea class="input" name="message" rows="5" maxlength="2000"></textarea></label></form><p class="form-error" id="nErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="nGo">Create ticket</button>',
    onMount: (el, close) => el.querySelector('#nGo').addEventListener('click', async () => {
      try { close(await api('/tickets', { method: 'POST', body: formData(el.querySelector('#nf')) })); } catch (err) { el.querySelector('#nErr').textContent = err.message; }
    }),
  });
  if (r) { toast(`Ticket #${r.id} created`); location.hash = '#/support?id=' + r.id; }
}

async function renderThread(view, id) {
  const t = await api('/tickets/show', { query: { id } });
  refreshCounts();
  view.innerHTML = html`
    <div class="page-head"><div><a class="link small" href="#/support">← All tickets</a><h1 style="margin-top:6px">#${t.id} · ${t.subject}</h1>
      <p>${t.category}${t.ref ? ' · ' + t.ref : ''} · opened ${dateTime(t.created_at)}</p></div>
      <div class="row">${raw(badge(t.status))}${t.status !== 'RESOLVED' ? raw('<button class="btn btn-outline" id="close">Mark resolved</button>') : ''}</div></div>
    <section class="card" style="max-width:820px">
      <div class="thread" id="thread">${raw(t.messages.map((m) => `<div class="msg ${m.from === 'UT Support' ? 'theirs' : 'mine'}"><b class="small">${esc(m.from)}</b><div>${esc(m.text)}</div><small>${dateTime(m.at)}</small></div>`).join(''))}</div>
      ${t.status !== 'RESOLVED' ? raw(`<form class="row" id="reply" style="margin-top:14px"><textarea class="input" name="message" rows="2" placeholder="Write a reply…" style="flex:1"></textarea><button class="btn btn-primary">Send</button></form>`) : raw('<p class="muted">This ticket is resolved. Open a new one if you need more help.</p>')}
    </section>`;
  const th = view.querySelector('#thread');
  th.scrollTop = th.scrollHeight;
  const again = () => renderThread(view, id);
  const close = view.querySelector('#close');
  if (close) close.addEventListener('click', async () => { await api('/tickets/close', { method: 'POST', body: { id } }); toast('Ticket resolved'); again(); });
  const reply = view.querySelector('#reply');
  if (reply) reply.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/tickets/reply', { method: 'POST', body: { id, message: e.target.message.value } }); again(); } catch (err) { toast(err.message, true); }
  });
}
