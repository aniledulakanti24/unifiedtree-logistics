// API client, app store and small DOM helpers shared by every page.

// ---- auth + API ------------------------------------------------------------
const TOKEN_KEY = 'ut_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };

export function logout() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('ut-USER'); localStorage.removeItem('ut-account'); sessionStorage.clear(); } catch (e) {}
  location.href = '/login/';
}

export async function api(path, { method = 'GET', query, body } = {}) {
  const url = new URL('/v1' + path, location.origin);
  if (query) Object.entries(query).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v); });
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + getToken(), ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.message || 'Something went wrong'); err.status = res.status; err.data = data; throw err; }
  return data;
}

// ---- store -----------------------------------------------------------------
// The user lives in localStorage and the menu in sessionStorage, so a reload
// paints the shell instantly and refreshes them in the background.
const listeners = new Set();
export const store = {
  state: {
    user: readJSON(localStorage, 'ut-USER'),
    menu: readJSON(sessionStorage, 'menuItems') || [],
    counts: null,
  },
  set(patch) {
    Object.assign(this.state, patch);
    if (patch.user) writeJSON(localStorage, 'ut-USER', patch.user);
    if (patch.menu) writeJSON(sessionStorage, 'menuItems', patch.menu);
    listeners.forEach((fn) => fn(this.state));
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
// Refreshes navigation badges and the wallet chip after any state-changing action.
export async function refreshCounts() {
  store.set({ counts: await api('/homepage/order-count-details') });
}
function readJSON(storage, key) { try { return JSON.parse(storage.getItem(key)); } catch (e) { return null; } }
function writeJSON(storage, key, v) { try { storage.setItem(key, JSON.stringify(v)); } catch (e) {} }

// ---- formatting ------------------------------------------------------------
// Amounts are stored in INR and shown in the viewer's chosen currency.
// Indicative demo rates (units of the currency per ₹1). Swap for a live FX feed before launch.
export const CURRENCIES = {
  INR: { name: 'Indian Rupee', symbol: '₹', rate: 1, locale: 'en-IN' }, USD: { name: 'US Dollar', symbol: '$', rate: 0.0118, locale: 'en-US' }, EUR: { name: 'Euro', symbol: '€', rate: 0.0102, locale: 'de-DE' }, GBP: { name: 'British Pound', symbol: '£', rate: 0.0089, locale: 'en-GB' },
  AED: { name: 'UAE Dirham', symbol: 'AED', rate: 0.0433, locale: 'en-AE' }, SAR: { name: 'Saudi Riyal', symbol: 'SAR', rate: 0.0443, locale: 'en-SA' }, SGD: { name: 'Singapore Dollar', symbol: 'S$', rate: 0.0153, locale: 'en-SG' }, AUD: { name: 'Australian Dollar', symbol: 'A$', rate: 0.0181, locale: 'en-AU' },
  CAD: { name: 'Canadian Dollar', symbol: 'C$', rate: 0.0164, locale: 'en-CA' }, JPY: { name: 'Japanese Yen', symbol: '¥', rate: 1.78, locale: 'ja-JP' }, CNY: { name: 'Chinese Yuan', symbol: '¥', rate: 0.0843, locale: 'zh-CN' }, MYR: { name: 'Malaysian Ringgit', symbol: 'RM', rate: 0.0496, locale: 'ms-MY' },
  THB: { name: 'Thai Baht', symbol: '฿', rate: 0.381, locale: 'th-TH' }, ZAR: { name: 'South African Rand', symbol: 'R', rate: 0.208, locale: 'en-ZA' }, NPR: { name: 'Nepalese Rupee', symbol: 'Rs', rate: 1.6, locale: 'en-NP' }, LKR: { name: 'Sri Lankan Rupee', symbol: 'Rs', rate: 3.55, locale: 'en-LK' },
};
let currency = (() => { try { const c = localStorage.getItem('ut-currency'); return CURRENCIES[c] ? c : 'INR'; } catch (e) { return 'INR'; } })();
export const getCurrency = () => currency;
export function setCurrency(code) {
  if (!CURRENCIES[code]) return;
  currency = code;
  try { localStorage.setItem('ut-currency', code); } catch (e) {}
  window.dispatchEvent(new CustomEvent('ut:currency'));
}
export const moneyIn = (n, code) => {
  const c = CURRENCIES[code];
  const v = (Number(n) || 0) * c.rate;
  return new Intl.NumberFormat(c.locale, { style: 'currency', currency: code, maximumFractionDigits: code === 'INR' || code === 'JPY' ? 0 : 2, minimumFractionDigits: 0 }).format(v);
};
export const money = (n) => moneyIn(n, currency);
// INR entry fields show this hint when another currency is selected.
export const inrHint = (n) => (currency === 'INR' || !(Number(n) > 0) ? '' : '≈ ' + money(n));
// Format and clock come from My profile → Number and date format.
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
export const date = (iso) => iso ? new Date(iso).toLocaleDateString(pref('ut-date-locale', 'en-IN'), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (iso) => iso ? new Date(iso).toLocaleString(pref('ut-date-locale', 'en-IN'), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: pref('ut-clock', '12') !== '24' }) : '—';
export const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
export const daysAgo = (n) => isoDay(Date.now() - n * 86400000);
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tagged template that escapes interpolations unless wrapped with raw().
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    const v = values[i - 1];
    if (v === false || v == null) return out + s;
    const str = v && v.__raw ? v.value : Array.isArray(v) ? v.map((x) => (x && x.__raw ? x.value : esc(x))).join('') : esc(v);
    return out + str + s;
  });
}
export const raw = (value) => ({ __raw: true, value });

const STATUS_LABEL = {
  NEW: ['New', 'purple'], READY_TO_SHIP: ['Ready to ship', 'blue'], PICKUP_SCHEDULED: ['Pickup scheduled', 'blue'],
  IN_TRANSIT: ['In transit', 'amber'], DELIVERED: ['Delivered', 'green'], RTO: ['RTO', 'red'], CANCELLED: ['Cancelled', ''],
  RETURN_PENDING: ['Pickup pending', 'amber'], RETURN_PICKED: ['Picked up', 'blue'], RETURN_DELIVERED: ['Received', 'green'],
  ACTION_REQUIRED: ['Action required', 'red'], ACCEPTED: ['Accepted', 'green'], DISPUTE_RAISED: ['Disputed', 'amber'], READY: ['Ready', 'green'],
  ON_HOLD: ['On hold', 'amber'], RESOLVED_FROZEN: ['Closed · weight frozen', 'green'], FROZEN: ['Frozen', 'green'], UNDER_REVIEW: ['Under review', 'amber'],
  LIVE: ['Live', 'green'], PENDING: ['Pending', 'amber'], APPROVED: ['Approved', 'green'], REJECTED: ['Rejected', 'red'], INVITED: ['Invited', 'blue'],
  REWARDED: ['Rewarded', 'green'], SCHEDULED: ['Scheduled', 'blue'], VERIFIED: ['Verified', 'green'], Processing: ['Processing', 'blue'],
  High: ['High risk', 'red'], Medium: ['Medium risk', 'amber'], Low: ['Low risk', 'green'], EXCHANGE: ['Exchange', 'purple'], RETURN: ['Return', ''],
};
export const statusBadge = (s) => { const [label, tone] = STATUS_LABEL[s] || [s, '']; return raw(`<span class="badge ${tone ? 'badge-' + tone : ''}">${esc(label)}</span>`); };

// ---- icons -----------------------------------------------------------------
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  return: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
};
export const icon = (name) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);

// ---- feedback --------------------------------------------------------------
let toastTimer;
export function toast(message, isError) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// Opens a modal; resolves with the value passed to close(), or null.
export function modal({ title, body, footer, wide, onMount }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head"><h2 style="margin:0">${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x').value}</button></div>
      <div class="modal__body">${body}</div>${footer ? `<div class="modal__foot">${footer}</div>` : ''}</div>`;
    const prevFocus = document.activeElement;
    const close = (value = null) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (prevFocus) prevFocus.focus();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    const first = wrap.querySelector('input, select, textarea, .modal__foot .btn-primary');
    if (first) first.focus();
    if (onMount) onMount(wrap.querySelector('.modal'), close);
  });
}

export async function withBusy(btn, fn) {
  btn.classList.add('is-loading');
  btn.disabled = true;
  try { return await fn(); } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
}

export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---- reusable table + pager ------------------------------------------------
export function pager(meta, onPage) {
  const p = (meta && meta.pagination) || { current_page: 1, total_pages: 1, total: 0, per_page: 15 };
  const start = p.total ? (p.current_page - 1) * p.per_page + 1 : 0;
  const end = Math.min(p.total, p.current_page * p.per_page);
  const el = document.createElement('div');
  el.className = 'pager';
  el.innerHTML = `<span>${start}–${end} of ${p.total}</span>
    <button class="btn btn-outline btn-sm" data-p="${p.current_page - 1}" ${p.current_page <= 1 ? 'disabled' : ''}>Previous</button>
    <button class="btn btn-outline btn-sm" data-p="${p.current_page + 1}" ${p.current_page >= p.total_pages ? 'disabled' : ''}>Next</button>`;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && !b.disabled) onPage(Number(b.dataset.p)); });
  return el;
}

export const emptyState = (text, iconName = 'inbox') => raw(`<div class="empty">${icon(iconName).value}<p>${esc(text)}</p></div>`);
export const loadingRows = (cols, rows = 5) => raw(Array.from({ length: rows }, () => `<tr>${'<td><div class="skeleton"></div></td>'.repeat(cols)}</tr>`).join(''));
