// Delivery partner holiday calendar.
import { api, esc, toast, modal, withBusy, date, formData } from '../core.js';
import { tile } from './art.js';
import { filterBtn, openFilters, countActive } from './ui.js';

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const label = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const shift = (m, n) => { const d = new Date(`${m}-01T00:00:00`); d.setMonth(d.getMonth() + n); return ym(d); };
const today = () => { const d = new Date(); return `${ym(d)}-${String(d.getDate()).padStart(2, '0')}`; };
const f = { partner: '', group: '', status: '' };

export async function render(view, { query }) {
  const month = /^\d{4}-\d{2}$/.test(query.get('month') || '') ? query.get('month') : ym(new Date());
  view.innerHTML = '<div class="skeleton" style="height:360px"></div>';
  const d = await api('/hub/holidays', { query: { month } });
  const groups = [...new Set(d.partners.map((p) => p.group))];
  const fields = [{ key: 'group', label: 'Partner type', options: [['', 'All types'], ...groups.map((g) => [g, g])] }, { key: 'partner', label: 'Partner', options: [['', 'All partners'], ...d.partners.filter((p) => !f.group || p.group === f.group).map((p) => [p.name, p.name])] }, { key: 'status', label: 'Status', options: [['', 'Closed or limited'], ['closed', 'Closed only'], ['limited', 'Limited only']] }];
  const inGroup = (n) => (!f.group || d.partners.find((p) => p.name === n).group === f.group) && (!f.partner || n === f.partner);
  const view2 = (x) => ({ ...x, closed: f.status === 'limited' ? [] : x.closed.filter(inGroup), limited: f.status === 'closed' ? [] : x.limited.filter(inGroup) });
  const days = d.days.map(view2);
  const weekStart = (() => { try { return Number(localStorage.getItem('ut-week-start')) === 1 ? 1 : 0; } catch (e) { return 0; } })();
  const first = (new Date(`${month}-01T00:00:00`).getDay() - weekStart + 7) % 7;
  const now = today();
  let selected = days.find((x) => x.date === now) || days.find((x) => x.national || x.custom.length) || days[0];
  view.innerHTML = `
    <div class="page-head"><div class="row head-t">${tile('calendar', 'coral').value}<div><h1>Partner Holidays</h1><p>When delivery partners are closed or running reduced service.</p></div></div>
      <div class="row">${filterBtn(countActive(fields, f))}<button class="btn btn-outline" id="ics" type="button">Export calendar</button><button class="btn btn-primary" id="add" type="button">+ Add closure</button></div></div>
    <div class="hol">
      <section class="card"><div class="hol__nav"><a class="icon-btn" href="#/holidays?month=${shift(month, -1)}" aria-label="Previous month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></a><h2 class="notop">${esc(label(month))}</h2><a class="icon-btn" href="#/holidays?month=${shift(month, 1)}" aria-label="Next month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a><a class="btn btn-outline btn-sm" href="#/holidays">Today</a><span class="spacer"></span><span class="hol__key"><i class="k-closed"></i>Closed<i class="k-limited"></i>Limited</span></div>
        <div class="cal cal--h">${[...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].slice(weekStart), ...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].slice(0, weekStart)].map((x) => `<span>${x}</span>`).join('')}</div>
        <div class="cal" id="cal">${'<span class="cal__pad"></span>'.repeat(first)}${days.map((x) => { const title = x.custom[0] ? x.custom[0].name : x.national; return `<button type="button" class="day ${x.date === now ? 'today' : ''} ${title ? 'hol-day' : ''}" data-d="${x.date}" aria-pressed="${x.date === selected.date}"><b>${Number(x.date.slice(8))}</b>${title ? `<small>${esc(title)}</small>` : x.sunday ? '<small class="muted">Sunday</small>' : ''}<span class="day__dots">${x.closed.length ? `<i class="k-closed">${x.closed.length}</i>` : ''}${x.limited.length ? `<i class="k-limited">${x.limited.length}</i>` : ''}</span></button>`; }).join('')}</div></section>
      <aside class="dash__side"><section class="card" id="detail"></section>
        <section class="card"><h2>Coming up</h2><ul class="feed">${d.upcoming.map((u) => `<li><span class="up__d"><b>${Number(u.date.slice(8))}</b><small>${new Date(`${u.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</small></span><div class="feed__t"><b>${esc(u.name)}</b><small>${u.closed} closed · ${u.limited} limited</small></div></li>`).join('')}</ul></section>
        <p class="muted small">Partner schedules are sample data until partners share their real calendars. Festival dates can vary by state.</p></aside></div>`;
  const detail = view.querySelector('#detail');
  function paint() {
    const x = selected;
    const list = (title, names, cls) => (names.length ? `<h3 class="hol__h"><i class="${cls}"></i>${title} (${names.length})</h3><div class="chips chips--static">${names.map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>` : '');
    detail.innerHTML = `<h2 class="notop">${esc(date(x.date))}</h2>${x.national ? `<p class="notop"><b>${esc(x.national)}</b></p>` : ''}${x.custom.map((c) => `<div class="hol__own"><div><b>${esc(c.name)}</b><small class="muted block">${esc(c.provider)} · ${c.status === 'closed' ? 'Closed' : 'Limited'}</small></div><button class="btn btn-danger btn-sm" data-rm="${esc(c.id)}" type="button">Remove</button></div>`).join('')}${list('Closed', x.closed, 'k-closed')}${list('Limited service', x.limited, 'k-limited')}${!x.closed.length && !x.limited.length ? '<p class="muted notop">All partners running normally.</p>' : ''}`;
  }
  paint();
  const again = () => render(view, { query });
  view.onclick = async (e) => {
    const b = e.target.closest('[data-d]');
    if (b) { selected = days.find((x) => x.date === b.dataset.d); view.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paint(); return; }
    const flt = e.target.closest('#flt');
    if (flt) { openFilters(flt, fields, f, (v) => { Object.assign(f, v); again(); }); return; }
    if (e.target.closest('#add')) { addClosure(d, selected.date, again); return; }
    if (e.target.closest('#ics')) { exportIcs(d); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { try { await api('/hub/holidays/remove', { method: 'POST', body: { id: rm.dataset.rm } }); toast('Closure removed'); again(); } catch (x) { toast(x.message, true); } }
  };
}
function addClosure(d, day, done) {
  modal({
    title: 'Add a partner closure',
    body: `<form class="form-grid" id="f" novalidate><label class="field full">Partner<select class="select" name="provider"><option>All partners</option>${d.partners.map((p) => `<option>${esc(p.name)}</option>`).join('')}</select></label><label class="field">From<input class="input" type="date" name="date" value="${day}"></label><label class="field">To (optional)<input class="input" type="date" name="end_date"></label><label class="field full">Reason<input class="input" name="name" placeholder="e.g. Local festival, hub maintenance"></label><label class="field full">Status<select class="select" name="status"><option value="closed">Closed</option><option value="limited">Limited service</option></select></label></form><p class="muted small notop">Closed partners are hidden from booking results for pickups on these dates.</p><p class="form-error" id="e"></p>`,
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="go">Add closure</button>',
    onMount(el, close) { const go = el.querySelector('#go'); go.addEventListener('click', () => withBusy(go, async () => { try { await api('/hub/holidays', { method: 'POST', body: formData(el.querySelector('#f')) }); close(true); toast('Closure added'); done(); } catch (x) { el.querySelector('#e').textContent = x.message; } })); },
  });
}
function exportIcs(d) {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const safe = (s) => String(s).replace(/([,;\\])/g, '\\$1');
  const events = d.days.filter((x) => x.national || x.custom.length).map((x) => { const c = x.date.replace(/-/g, ''); return `BEGIN:VEVENT\r\nUID:${c}@utlog\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${c}\r\nSUMMARY:${safe(x.custom[0] ? x.custom[0].name : x.national)}\r\nDESCRIPTION:${x.closed.length} partners closed\\, ${x.limited.length} limited\r\nEND:VEVENT`; }).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//UT Log//Holidays//EN\r\n${events}\r\nEND:VCALENDAR\r\n`], { type: 'text/calendar' }));
  a.download = `ut-log-holidays-${d.month}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
