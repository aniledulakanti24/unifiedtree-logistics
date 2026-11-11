// Command palette: jump to any page or search orders from one box.
// Opens from the top bar, with "/" or with Ctrl/Cmd + K.
import { store, esc } from './core.js';

let closeOpen = null;

// Plain-language search: "5 kg from 560034 to 400053", "flight to Delhi", "hotel in Goa".
const COUNTRIES = ['united states', 'usa', 'united kingdom', 'uk', 'united arab emirates', 'uae', 'dubai', 'singapore', 'australia', 'canada', 'germany'];
const COUNTRY_NAME = { usa: 'United States', uk: 'United Kingdom', uae: 'United Arab Emirates', dubai: 'United Arab Emirates' };
const title = (t) => t.trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
export function smartAction(raw) {
  const q = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 3) return null;
  const enc = encodeURIComponent;
  const hit = (label, path) => ({ label, group: 'Smart search', path });
  let m = q.match(/\b(bk[0-9a-z]{6,})\b/);
  if (m) return hit(`Find booking ${m[1].toUpperCase()}`, `#/bookings?days=&search=${m[1].toUpperCase()}`);
  m = q.match(/\b([6-9]\d{9})\b/);
  if (m) return hit(`Recharge ${m[1]}`, `#/pay/mobile?number=${m[1]}`);
  if (/fastag|toll/.test(q)) return hit('Recharge FASTag', '#/pay/fastag');
  if (/\b(packers?|movers?|shifting|relocat)/.test(q)) return hit('Packers & Movers', '#/services/movers');
  if (/\b(how much|capacity|can carry|weight limit)\b/.test(q)) return hit('Check what each vehicle can carry', '#/my/weight');
  if (/\breturn(s)?\b/.test(q)) return hit('Open returns', '#/my/returns');
  if (/\b(help|support|complaint)\b/.test(q)) return hit('Open Help & Support', '#/help');
  m = q.match(/\b(electricity|dth|broadband|water|gas|insurance|loan|credit card)\b.*bill|\bpay\b.*\b(electricity|dth|broadband|water|gas)\b/);
  if (m) return hit(`Pay ${m[1] || m[2]} bill`, `#/pay/bills?cat=${(m[1] || m[2]).split(' ')[0]}`);
  m = q.match(/(?:hotel|hotels|stay|room)s?\s+(?:in|at)\s+(.+)/);
  if (m) return hit(`Hotels in ${title(m[1])}`, `#/travel/hotels?city=${enc(title(m[1]))}`);
  const route = q.match(/from\s+(.+?)\s+to\s+(.+?)$/) || q.match(/\bto\s+(.+)$/);
  const from = route && route.length === 3 ? route[1] : '';
  const to = route ? route[route.length - 1] : '';
  const travel = [[/\b(flight|flights|fly)\b/, 'flights', 'Flights'], [/\b(train|trains)\b/, 'trains', 'Trains'], [/\b(bus|buses)\b/, 'buses', 'Buses']].find(([re]) => re.test(q));
  if (travel) return hit(`${travel[2]}${from ? ` from ${title(from)}` : ''}${to ? ` to ${title(to)}` : ''}`, `#/travel/${travel[1]}?${from ? `from=${enc(title(from))}&` : ''}${to ? `to=${enc(title(to))}` : ''}`);
  if (/\b(cab|ride|auto|taxi)\b/.test(q) && from && to) return hit(`Rides from ${title(from)} to ${title(to)}`, `#/rides?from=${enc(title(from))}&to=${enc(title(to))}`);
  const w = q.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|ton|tons|tonne|tonnes)\b/);
  if (w && from && to) {
    const kg = Number(w[1]) * (/^t/.test(w[2]) ? 1000 : 1);
    const clean = (t) => t.replace(/\d+(?:\.\d+)?\s*(kg|kgs|ton|tons)\b/, '').trim();
    const a = clean(from); const z = clean(to);
    if (COUNTRIES.includes(z)) return hit(`Ship ${kg} kg to ${title(COUNTRY_NAME[z] || z)}`, `#/international/book?from=${enc(a)}&country=${enc(COUNTRY_NAME[z] || title(z))}&weight=${kg}`);
    const pins = /^\d{6}$/.test(a) && /^\d{6}$/.test(z);
    const section = pins ? 'courier' : kg > 750 ? 'logistics' : 'vehicle';
    return hit(`Book ${kg} kg from ${title(a)} to ${title(z)}`, `#/${section}/book?from=${enc(pins ? a : title(a))}&to=${enc(pins ? z : title(z))}&weight=${kg}`);
  }
  return null;
}

function entries(query) {
  const q = query.trim().toLowerCase();
  const pages = [...(store.state.hubPages || []), { label: 'My profile', group: 'UT Log', path: '#/profile' }, { label: 'Add a new order', group: 'Ship', path: '#/orders/add' }];
  store.state.menu.forEach((m) => (m.children || []).forEach((c) => pages.push({ label: c.label, group: m.label, path: c.path })));
  const hits = q ? pages.filter((p) => `${p.label} ${p.group}`.toLowerCase().includes(q)) : pages;
  const search = q ? [{ label: `Search bookings for "${query.trim()}"`, group: 'Bookings', path: '#/bookings?days=&search=' + encodeURIComponent(query.trim()) }, { label: `Search seller orders for "${query.trim()}"`, group: 'Orders', path: '#/orders/all?search=' + encodeURIComponent(query.trim()) }] : [];
  // Page matches come first; with none, the order search is the first result.
  const smart = smartAction(query);
  return [...(smart ? [smart] : []), ...(hits.length ? [...hits, ...search] : search)];
}

export function openPalette() {
  if (closeOpen) return;
  const previous = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop palette-backdrop';
  wrap.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Find anything">
    <input class="palette__input" type="text" role="combobox" aria-expanded="true" aria-controls="paletteList" aria-autocomplete="list" placeholder="Try: 5 kg from 560034 to 400053, flight to Delhi, or a booking ID" autocomplete="off">
    <ul class="palette__list" id="paletteList" role="listbox"></ul>
    <p class="palette__hint"><kbd>↑</kbd><kbd>↓</kbd> to move <kbd>Enter</kbd> to open <kbd>Esc</kbd> to close</p>
  </div>`;
  document.getElementById('modalRoot').appendChild(wrap);
  const input = wrap.querySelector('input');
  const list = wrap.querySelector('ul');
  let items = [];
  let index = 0;

  function paint() {
    list.innerHTML = items.length
      ? items.map((it, i) => `<li role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === index}"><span>${esc(it.label)}</span><small>${esc(it.group)}</small></li>`).join('')
      : '<li class="palette__none">Type an order ID, AWB, phone or SKU to search orders.</li>';
    if (items.length) {
      input.setAttribute('aria-activedescendant', 'pal-' + index);
      list.children[index].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function refresh() { items = entries(input.value); index = 0; paint(); }
  function close() {
    wrap.remove();
    closeOpen = null;
    if (previous && previous.focus) previous.focus();
  }
  function go(item) {
    close();
    if (item) location.hash = item.path;
  }

  closeOpen = close;
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); index = (index + 1) % items.length; paint(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); index = (index - 1 + items.length) % items.length; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) go(items[Number(li.dataset.i)]);
  });
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  refresh();
  input.focus();
}

export function installPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (closeOpen) closeOpen(); else openPalette();
    }
  });
}
