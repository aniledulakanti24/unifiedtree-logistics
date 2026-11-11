// Personal preferences: language, currency, theme and account type. Each is stored
// in this browser for an instant first paint, and saved to the profile as well.
import { api, esc, store, CURRENCIES, getCurrency, setCurrency, toast, modal } from '../core.js';
import { scene } from './art.js';

export const LANGUAGES = [
  ['en', 'English', 'English'], ['hi', 'Hindi', 'हिन्दी'], ['te', 'Telugu', 'తెలుగు'], ['ta', 'Tamil', 'தமிழ்'], ['kn', 'Kannada', 'ಕನ್ನಡ'], ['ml', 'Malayalam', 'മലയാളം'], ['mr', 'Marathi', 'मराठी'], ['bn', 'Bengali', 'বাংলা'], ['gu', 'Gujarati', 'ગુજરાતી'], ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'], ['or', 'Odia', 'ଓଡ଼ିଆ'], ['ur', 'Urdu', 'اردو'],
  ['ar', 'Arabic', 'العربية'], ['fr', 'French', 'Français'], ['es', 'Spanish', 'Español'], ['de', 'German', 'Deutsch'], ['pt', 'Portuguese', 'Português'], ['it', 'Italian', 'Italiano'], ['nl', 'Dutch', 'Nederlands'], ['ru', 'Russian', 'Русский'], ['tr', 'Turkish', 'Türkçe'], ['id', 'Indonesian', 'Bahasa Indonesia'], ['ms', 'Malay', 'Bahasa Melayu'], ['th', 'Thai', 'ไทย'], ['vi', 'Vietnamese', 'Tiếng Việt'], ['ja', 'Japanese', '日本語'], ['ko', 'Korean', '한국어'], ['zh-CN', 'Chinese', '简体中文'],
];
const RTL = ['ar', 'ur'];

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const save = (patch) => api('/hub/profile', { method: 'POST', body: patch }).catch(() => {});

// ---- theme --------------------------------------------------------------------------
export const getTheme = () => read('ut-theme', 'light');
export function setTheme(t, persist = true) {
  write('ut-theme', t);
  document.documentElement.dataset.theme = t;
  if (persist) save({ theme: t });
}

// ---- language: same approach as the Unifiedtree CRM, via Google's page translator ----
export const getLanguage = () => read('ut-language', 'en');
function setCookie(value) {
  const exp = value ? '' : '; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  document.cookie = `googtrans=${value}; path=/${exp}`;
  if (location.hostname.includes('.')) document.cookie = `googtrans=${value}; path=/; domain=${location.hostname}${exp}`;
}
export function setLanguage(code) {
  write('ut-language', code);
  setCookie(code === 'en' ? '' : `/en/${code}`);
  save({ language: code }).finally(() => location.reload());
}
export function bootLanguage() {
  const lang = getLanguage();
  if (RTL.includes(lang)) document.documentElement.dir = 'rtl';
  if (lang === 'en') return;
  setCookie(`/en/${lang}`);
  window.googleTranslateElementInit = () => new window.google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'gtHost');
  const s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  s.onerror = () => toast('The translation service could not be reached. Showing English.', true);
  document.head.appendChild(s);
}

// ---- account type ---------------------------------------------------------------------
export const getAccountType = () => store.state.accountType || read('ut-account', '');
export async function setAccountType(type) {
  write('ut-account', type);
  store.set({ accountType: type });
  await api('/hub/profile', { method: 'POST', body: { account_type: type } });
}
// First-run question: what will you mostly use the platform for?
export function askAccountType() {
  return modal({
    title: 'Welcome to UT Log',
    body: `<p class="center lead notop">What will you mostly use UT Log for?</p>
      <div class="pick2">
        <button class="pick" type="button" data-t="personal" aria-pressed="false">${scene('personal').value}<b>Personal use</b><small>Send parcels, book travel, recharge and pay bills</small></button>
        <button class="pick" type="button" data-t="business" aria-pressed="false">${scene('business').value}<b>Business use</b><small>Freight, GST invoices, vendor payments and seller tools</small></button>
      </div>`,
    footer: '<button class="btn btn-primary btn-block" id="ptGo" disabled>Proceed</button>',
    onMount(el, close) {
      let pick = null;
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; pick = b.dataset.t; el.querySelectorAll('[data-t]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); el.querySelector('#ptGo').disabled = false; });
      el.querySelector('#ptGo').addEventListener('click', () => close(pick));
    },
  });
}

// ---- pop-over menus for language and currency ------------------------------------------
export function popover(anchor, html, onMount) {
  document.querySelectorAll('.pop').forEach((p) => p.remove());
  const el = document.createElement('div');
  el.className = 'pop';
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  el.style.top = r.bottom + 8 + 'px';
  el.style.left = Math.max(12, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 12)) + 'px';
  const off = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  function close() { el.remove(); document.removeEventListener('mousedown', off); document.removeEventListener('keydown', key); anchor.focus(); }
  setTimeout(() => { document.addEventListener('mousedown', off); document.addEventListener('keydown', key); });
  onMount(el, close);
}
function listPopover(anchor, { placeholder, rows, note, onPick }) {
  popover(anchor, `<div class="pop__search"><input class="input" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></div><ul class="pop__list" role="listbox"></ul>${note ? `<p class="pop__note">${esc(note)}</p>` : ''}`, (el, close) => {
    const list = el.querySelector('ul');
    const input = el.querySelector('input');
    const paint = () => {
      const q = input.value.trim().toLowerCase();
      const hits = rows.filter((r) => `${r.label} ${r.side} ${r.key}`.toLowerCase().includes(q));
      list.innerHTML = hits.length ? hits.map((r) => `<li><button type="button" role="option" aria-selected="${r.active}" data-k="${esc(r.key)}" ${r.notranslate ? 'translate="no"' : ''}><span>${esc(r.label)}</span><small>${esc(r.side)}</small></button></li>`).join('') : '<li class="pop__none">No matches</li>';
    };
    input.addEventListener('input', paint);
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { close(); onPick(b.dataset.k); } });
    paint();
    input.focus();
  });
}
export function openLanguageMenu(anchor) {
  const cur = getLanguage();
  listPopover(anchor, { placeholder: 'Search languages', rows: LANGUAGES.map(([key, label, side]) => ({ key, label, side, active: key === cur, notranslate: true })), note: 'Translated by Google, so page text is sent to Google. Translations can contain mistakes.', onPick: setLanguage });
}
export function openCurrencyMenu(anchor) {
  const cur = getCurrency();
  listPopover(anchor, { placeholder: 'Search currencies', rows: Object.entries(CURRENCIES).map(([key, c]) => ({ key, label: `${key} · ${c.name}`, side: c.symbol, active: key === cur, notranslate: true })), note: 'Your wallet is held in INR. Other currencies are shown at indicative rates and can differ from what a provider charges.', onPick: (k) => { setCurrency(k); save({ currency: k }); } });
}
