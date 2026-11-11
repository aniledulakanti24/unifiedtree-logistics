// Date range picker, like the CRM: presets with their dates on hover, plus a calendar for any range.
// A value is a preset key ('last30') or a custom range { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }.
import { esc } from '../core.js';
import { icon } from './icons.js';

export const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['thisweek', 'This Week'], ['lastweek', 'Last Week'], ['last7', 'Last 7 Days'], ['thismonth', 'This Month'], ['prevmonth', 'Previous Month'], ['last30', 'Last 30 Days'], ['thisq', 'This Quarter'], ['prevq', 'Previous Quarter'], ['fy', 'Current Fiscal Year'], ['prevfy', 'Previous Fiscal Year'], ['last365', 'Last 365 Days'], ['all', 'All time']];
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const add = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStart = () => { try { return Number(localStorage.getItem('ut-week-start')) === 1 ? 1 : 0; } catch (e) { return 0; } };
const short = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

// Turn a value into dates. Fiscal years follow India: 1 April to 31 March.
export function resolve(v) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (v && typeof v === 'object') { const a = parse(v.from); const b = parse(v.to); if (a && b) return { key: 'custom', label: `${short(a)} - ${short(b)}`, from: v.from, to: v.to, custom: true }; v = 'last30'; }
  const ws = weekStart(); const dow = (t.getDay() - ws + 7) % 7;
  const q0 = Math.floor(t.getMonth() / 3) * 3; const fyY = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  const R = {
    today: [t, t], yesterday: [add(t, -1), add(t, -1)], thisweek: [add(t, -dow), t], lastweek: [add(t, -dow - 7), add(t, -dow - 1)],
    last7: [add(t, -6), t], thismonth: [new Date(t.getFullYear(), t.getMonth(), 1), t], prevmonth: [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)],
    last30: [add(t, -29), t], thisq: [new Date(t.getFullYear(), q0, 1), t], prevq: [new Date(t.getFullYear(), q0 - 3, 1), new Date(t.getFullYear(), q0, 0)],
    fy: [new Date(fyY, 3, 1), new Date(fyY + 1, 2, 31)], prevfy: [new Date(fyY - 1, 3, 1), new Date(fyY, 2, 31)], last365: [add(t, -364), t], all: [null, null],
  };
  const key = R[v] ? v : 'last30';
  const [a, b] = R[key];
  return { key, label: PRESETS.find((p) => p[0] === key)[1], from: a ? ymd(a) : '', to: b ? ymd(b) : '', text: a ? `${short(a)} - ${short(b)}` : 'Every order' };
}
// Read the range from the address; old ?days= links still work.
export function fromQuery(query, def = 'last30') {
  if (query.get('from') && query.get('to')) return { from: query.get('from'), to: query.get('to') };
  if (query.get('range')) return query.get('range');
  if (query.has('days')) { const d = query.get('days'); return { '': 'all', 1: 'today', 7: 'last7', 30: 'last30', 365: 'last365' }[d] || (Number(d) > 0 ? { from: ymd(add(new Date(), -(Number(d) - 1))), to: ymd(new Date()) } : def); }
  return def;
}
export const toQuery = (v) => (v && typeof v === 'object' ? { range: '', from: v.from, to: v.to, days: '' } : { range: v, from: '', to: '', days: '' });
export const toApi = (v) => { const r = resolve(v); return { from: r.from, to: r.to }; };

export function dateRangeField(v) {
  const r = resolve(v);
  return `<div class="dr"><div class="dr-field"><button class="dr-main" type="button" aria-haspopup="listbox" aria-label="Date filter: ${esc(r.label)}">${icon('calendar', 16)}<span>${esc(r.custom ? 'Custom range' : r.label)}</span></button><button class="dr-pick" type="button" aria-label="Pick dates from a calendar" title="Pick dates">${icon('calendar', 16)}</button></div><span class="dr-text">${esc(r.custom ? r.label : r.text)}</span></div>`;
}

// Opens the preset list or the calendar under the field. onChange gets the new value.
export function mountDateRange(root, v, onChange, { allowAll = true } = {}) {
  const box = root.querySelector('.dr');
  if (!box) return;
  const close = () => { box.querySelectorAll('.dr-pop').forEach((p) => p.remove()); box.querySelector('.dr-field').classList.remove('open'); document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc_); };
  const off = (e) => { if (!box.contains(e.target)) close(); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  const place = (pop) => { box.appendChild(pop); const r = pop.getBoundingClientRect(); if (r.right > innerWidth - 8) pop.classList.add('flip'); box.querySelector('.dr-field').classList.add('open'); setTimeout(() => { document.addEventListener('mousedown', off); document.addEventListener('keydown', esc_); }); };
  box.querySelector('.dr-main').addEventListener('click', () => {
    if (box.querySelector('.dr-pop')) { close(); return; }
    const cur = resolve(v).key;
    const pop = document.createElement('div');
    pop.className = 'dr-pop dr-list'; pop.setAttribute('role', 'listbox');
    pop.innerHTML = PRESETS.filter(([k]) => allowAll || k !== 'all').map(([k, l]) => { const x = resolve(k); return `<button class="dr-opt ${k === cur ? 'on' : ''}" type="button" role="option" aria-selected="${k === cur}" data-k="${k}"><span>${esc(l)}</span><span class="dr-opt-range">${esc(x.text)}</span></button>`; }).join('');
    pop.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { close(); onChange(b.dataset.k); } });
    place(pop);
    const on = pop.querySelector('.on'); if (on) { on.scrollIntoView({ block: 'nearest' }); on.focus(); }
  });
  box.querySelector('.dr-pick').addEventListener('click', () => {
    if (box.querySelector('.dr-pop')) { close(); return; }
    const r = resolve(v);
    let start = parse(r.from); let end = parse(r.to);
    let view = new Date((end || new Date()).getFullYear(), (end || new Date()).getMonth(), 1);
    const pop = document.createElement('div');
    pop.className = 'dr-pop dr-cal-pop';
    const ws = weekStart(); const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = ymd(new Date());
    const draw = () => {
      const first = (view.getDay() - ws + 7) % 7; const s = start && ymd(start); const e = end && ymd(end);
      const cells = Array.from({ length: 42 }, (_, i) => add(view, i - first));
      pop.innerHTML = `<div class="dr-head"><small class="${!start || end ? 'on' : ''}">${start ? short(start) : 'Select Start Date'}</small><span>→</span><small class="${start && !end ? 'on' : ''}">${end ? short(end) : 'Select End Date'}</small></div>
        <div class="dr-steps"><span class="dr-step"><button class="dr-nav" data-m="-1" type="button" aria-label="Previous month">‹</button><b class="dr-month">${view.toLocaleDateString('en-GB', { month: 'long' })}</b><button class="dr-nav" data-m="1" type="button" aria-label="Next month">›</button></span><span class="dr-step"><button class="dr-nav" data-y="-1" type="button" aria-label="Previous year">‹</button><b>${view.getFullYear()}</b><button class="dr-nav" data-y="1" type="button" aria-label="Next year">›</button></span></div>
        <div class="dr-grid">${[...names.slice(ws), ...names.slice(0, ws)].map((n) => `<span class="dr-dow">${n}</span>`).join('')}${cells.map((d) => { const k = ymd(d); const cls = [d.getMonth() !== view.getMonth() && 'out', k === today && 'now', (k === s || k === e) && 'end', s && e && k > s && k < e && 'mid'].filter(Boolean).join(' '); return `<button class="dr-day ${cls}" type="button" data-d="${k}" aria-label="${short(d)}">${d.getDate()}</button>`; }).join('')}</div>
        <div class="dr-foot"><button class="btn btn-sm" data-cancel type="button">Cancel</button><button class="btn btn-primary btn-sm" data-ok type="button" ${start && end ? '' : 'disabled'}>OK</button></div>`;
    };
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = e.target.closest('[data-m]'); const y = e.target.closest('[data-y]'); const d = e.target.closest('[data-d]');
      if (m) { view = new Date(view.getFullYear(), view.getMonth() + Number(m.dataset.m), 1); draw(); return; }
      if (y) { view = new Date(view.getFullYear() + Number(y.dataset.y), view.getMonth(), 1); draw(); return; }
      if (d) { const day = parse(d.dataset.d); if (!start || end) { start = day; end = null; } else if (day < start) { end = start; start = day; } else end = day; draw(); return; }
      if (e.target.closest('[data-cancel]')) { close(); return; }
      if (e.target.closest('[data-ok]') && start && end) { close(); onChange({ from: ymd(start), to: ymd(end) }); }
    });
    // A fresh pick starts with no dates selected, like the CRM.
    start = null; end = null; draw();
    place(pop);
  });
}
