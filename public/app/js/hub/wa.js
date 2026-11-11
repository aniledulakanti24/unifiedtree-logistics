// WhatsApp: shared inbox, broadcasts and templates.
import { api, esc, toast, dateTime, formData } from '../core.js';
import { tile } from './art.js';
import { filterBtn, openFilters, countActive } from './ui.js';

export const waTabs = (active) => `<nav class="tabs tabs--line">${[['auto', 'Automations'], ['inbox', 'Inbox'], ['broadcast', 'Broadcasts'], ['templates', 'Templates']].map(([k, l]) => `<a href="#/business/whatsapp${k === 'auto' ? '' : `?tab=${k}`}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
const head = () => `<div class="page-head"><div class="row head-t">${tile('whatsapp', 'green').value}<div><h1>WhatsApp Automation</h1><p>Talk to customers and send updates from one place.</p></div></div></div>`;
const mask = (n) => `${String(n).slice(0, 2)}••••${String(n).slice(-3)}`;

export async function renderTab(view, tab) {
  view.innerHTML = `${head()}${waTabs(tab)}<div id="body"><div class="skeleton" style="height:240px"></div></div>`;
  const body = view.querySelector('#body');
  if (tab === 'inbox') return inbox(body);
  if (tab === 'broadcast') return broadcast(body);
  return templates(body);
}

const inf = { kind: '' };
const IF = [{ key: 'kind', label: 'Show', options: [['', 'All conversations'], ['replied', 'Customer replied'], ['optout', 'Opted out']] }];
async function inbox(body) {
  let current = null; let alive = true; let timer = 0;
  async function draw() {
    const d = await api('/hub/biz/whatsapp/inbox');
    if (!alive) return;
    const list = d.threads.filter((t) => (inf.kind === 'replied' ? t.messages.some((m) => m.direction === 'in') : inf.kind === 'optout' ? t.opted_out : true));
    if (!current && list[0]) current = list[0].to;
    const th = d.threads.find((t) => t.to === current);
    const typed = body.querySelector('#msg') ? body.querySelector('#msg').value : '';
    body.innerHTML = `<div class="inbox"><aside class="card inbox__l"><div class="section-head"><h2 class="notop">Conversations</h2>${filterBtn(countActive(IF, inf))}</div>${list.length ? `<ul>${list.map((t) => `<li><button type="button" data-t="${esc(t.to)}" class="${t.to === current ? 'on' : ''}"><b>${esc(mask(t.to))}</b><small>${esc(t.last.body.slice(0, 44))}</small></button></li>`).join('')}</ul>` : '<p class="muted">No conversations yet. They start when an automation sends a message.</p>'}</aside>
      <section class="card inbox__r">${th ? `<div class="card__head"><h2 class="notop">${esc(mask(th.to))}</h2>${th.opted_out ? '<span class="badge badge-red">Opted out</span>' : ''}</div><div class="wa-phone__chat inbox__chat" id="chat">${th.messages.map((m) => `<div class="bubble ${m.direction === 'in' ? '' : 'me'}">${esc(m.body)}<small class="block muted">${esc(dateTime(m.at))}</small></div>`).join('')}</div><form class="wa-phone__in" id="rf"><input class="input" id="msg" value="${esc(typed)}" placeholder="Type a reply" aria-label="Reply" autocomplete="off" ${th.opted_out ? 'disabled' : ''}><button class="btn btn-primary btn-sm" type="submit" ${th.opted_out ? 'disabled' : ''}>Send</button></form>` : '<p class="muted notop">Pick a conversation.</p>'}</section></div>`;
    const c = body.querySelector('#chat'); if (c) c.scrollTop = c.scrollHeight;
    const rf = body.querySelector('#rf');
    if (rf) rf.addEventListener('submit', async (e) => { e.preventDefault(); const i = body.querySelector('#msg'); if (!i.value.trim()) return; try { await api('/hub/biz/whatsapp/reply', { method: 'POST', body: { to: current, text: i.value } }); i.value = ''; draw(); } catch (x) { toast(x.message, true); } });
  }
  body.onclick = (e) => { const f = e.target.closest('#flt'); if (f) { openFilters(f, IF, inf, (v) => { inf.kind = v.kind; draw(); }); return; } const b = e.target.closest('[data-t]'); if (b) { current = b.dataset.t; draw(); } };
  await draw();
  const tick = async () => { if (!alive) return; if (document.activeElement && document.activeElement.id !== 'msg') { try { await draw(); } catch (e) { /* retried */ } } timer = setTimeout(tick, 6000); };
  timer = setTimeout(tick, 6000);
  return () => { alive = false; clearTimeout(timer); };
}

async function broadcast(body) {
  const d = await api('/hub/biz/whatsapp/templates');
  const ok = d.custom.filter((t) => t.status === 'APPROVED');
  body.innerHTML = `<div class="dash dash--even"><section class="card"><h2>New broadcast</h2><p class="muted notop">Goes only to receivers who agreed to messages, and never to anyone who opted out.</p>${ok.length ? `<form id="bf" class="form-grid"><label class="field full">Template<select class="select" name="template">${ok.map((t) => `<option>${esc(t.name)}</option>`).join('')}</select></label><p class="form-error full" id="e"></p><div class="full"><button class="btn btn-primary" type="submit">Send broadcast</button></div></form>` : '<p class="callout">Create a template and wait for it to be approved first. <a class="link" href="#/business/whatsapp?tab=templates">Open templates</a></p>'}</section>
    <section class="card"><h2>Good to know</h2><ul class="plain-list"><li>Meta charges per delivered template message.</li><li>Marketing messages need clear customer consent.</li><li>Replying STOP always turns messages off.</li></ul></section></div>`;
  const f = body.querySelector('#bf');
  if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await api('/hub/biz/whatsapp/broadcast', { method: 'POST', body: formData(f) }); toast(`Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`); } catch (x) { body.querySelector('#e').textContent = x.message; } });
}

const tf = { status: '' };
const TF = [{ key: 'status', label: 'Status', options: [['', 'All'], ['APPROVED', 'Approved'], ['PENDING', 'Waiting']] }];
async function templates(body) {
  const d = await api('/hub/biz/whatsapp/templates');
  const again = () => templates(body);
  const all = [...d.custom, ...d.builtin].filter((t) => !tf.status || t.status === tf.status);
  body.innerHTML = `<div class="dash dash--even"><section class="card"><div class="card__head"><h2>Templates</h2>${filterBtn(countActive(TF, tf))}</div><ul class="feed">${all.map((t) => `<li><div class="feed__t wrap"><b class="mono">${esc(t.name)}</b><small>${esc(t.body)}</small></div><span class="badge ${t.status === 'APPROVED' ? 'badge-green' : 'badge-amber'}">${t.status === 'APPROVED' ? 'Approved' : 'Waiting'}</span></li>`).join('')}</ul></section>
    <section class="card"><h2>New template</h2><form id="tf" class="form-grid" novalidate><label class="field full">Name<input class="input" name="name" placeholder="festive_offer"></label><label class="field full">Category<select class="select" name="category"><option value="utility">Utility</option><option value="marketing">Marketing</option></select></label><label class="field full">Message<textarea class="input" name="body" rows="4" placeholder="Hi {{1}}, ..."></textarea></label><p class="muted small full notop">Use {{1}} for the customer's name. In demo mode approval takes 30 seconds; Meta reviews real templates.</p><p class="form-error full" id="e"></p><div class="full"><button class="btn btn-primary" type="submit">Submit for approval</button></div></form></section></div>`;
  body.querySelector('#tf').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/hub/biz/whatsapp/templates', { method: 'POST', body: formData(e.target) }); toast('Submitted for approval'); again(); } catch (x) { body.querySelector('#e').textContent = x.message; } });
  body.onclick = (e) => { const f = e.target.closest('#flt'); if (f) openFilters(f, TF, tf, (v) => { tf.status = v.status; again(); }); };
}
