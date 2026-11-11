// First-run tour, dashboard customising, and the installable app.
import { modal, toast } from '../core.js';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// ---- guided tour ------------------------------------------------------------------
const STEPS = [
  ['#newBtn', 'Start anything here', 'Book a vehicle, ship a parcel, buy a ticket or pay a bill.'],
  ['#askBtn', 'Ask a question', 'Ask about your spend, orders on the way, bills or returns.'],
  ['.kpis', 'Your numbers at a glance', 'Each card compares with the period before. Click one for the detail.'],
  ['#walletPill', 'One wallet for everything', 'Or pay by UPI, card, EMI, netbanking and more at checkout.'],
  ['#sideNav', 'Your workspace', 'Star a page to pin it under Favourites.'],
  ['#sideMe, #profileBtn', 'Your account', 'Profile, saved payment methods, language and currency.'],
];
export function startTour() {
  if (document.querySelector('.tour')) return;
  const visible = (sel) => [...document.querySelectorAll(sel)].find((el) => el.getBoundingClientRect().width > 0);
  const steps = STEPS.filter(([s]) => visible(s));
  if (!steps.length) return;
  let n = 0;
  const wrap = document.createElement('div');
  wrap.className = 'tour';
  wrap.innerHTML = '<div class="tour__spot"></div><div class="tour__card" role="dialog" aria-modal="true" aria-label="Quick tour"></div>';
  document.body.appendChild(wrap);
  const spot = wrap.firstChild; const card = wrap.lastChild;
  const end = () => { wrap.remove(); write('ut-tour', 'done'); document.removeEventListener('keydown', key); removeEventListener('resize', draw); };
  const key = (e) => { if (e.key === 'Escape') end(); };
  function draw() {
    const [sel, title, text] = steps[n];
    const el = visible(sel);
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height + pad * 2, innerHeight - r.top)}px` });
    card.innerHTML = `<small>${n + 1} of ${steps.length}</small><b>${title}</b><p>${text}</p><div class="row"><button class="link" data-skip type="button">Skip</button><span class="spacer"></span><button class="btn btn-primary btn-sm" data-next type="button">${n === steps.length - 1 ? 'Done' : 'Next'}</button></div>`;
    const below = r.bottom + 190 < innerHeight;
    card.style.top = `${below ? r.bottom + 14 : Math.max(12, r.top - 190)}px`;
    card.style.left = `${Math.max(12, Math.min(r.left, innerWidth - 332))}px`;
    card.querySelector('[data-next]').focus();
  }
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-skip]')) end(); if (e.target.closest('[data-next]')) { if (++n >= steps.length) end(); else draw(); } });
  document.addEventListener('keydown', key);
  addEventListener('resize', draw);
  draw();
}
export const maybeTour = () => { if (read('ut-tour', '') !== 'done' && location.hash.startsWith('#/home')) setTimeout(startTour, 900); };

// ---- dashboard widgets ------------------------------------------------------------------
const WIDGETS = [['ask', 'Quick booking bar'], ['kpi', 'Key numbers'], ['insights', 'What the numbers say'], ['attention', 'Needs attention'], ['todo', 'What to do first'], ['services', 'Book or pay'], ['charts', 'Daily spend'], ['mix', 'Spend by service'], ['recent', 'Recent activity'], ['upcoming', 'Coming up']];
const hidden = () => read('ut-widgets', []);
export function applyWidgets(view) { const h = hidden(); view.querySelectorAll('[data-w]').forEach((el) => { el.hidden = h.includes(el.dataset.w); }); }
export function customise(view) {
  const h = hidden();
  modal({
    title: 'Customise your dashboard',
    body: `<ul class="toggles">${WIDGETS.map(([k, l]) => `<li><b>${l}</b><label class="switch"><input type="checkbox" data-k="${k}" ${h.includes(k) ? '' : 'checked'} aria-label="${l}"><i></i></label></li>`).join('')}</ul>`,
    footer: '<button class="btn btn-primary" data-close>Done</button>',
    onMount(el) { el.addEventListener('change', (e) => { const k = e.target.dataset.k; if (!k) return; const next = hidden().filter((x) => x !== k); if (!e.target.checked) next.push(k); write('ut-widgets', next); applyWidgets(view); }); },
  });
}

// ---- installable app -----------------------------------------------------------------------
let installEvent = null;
export function setupApp() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });
}
export async function installApp() {
  if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; return; }
  toast('In your browser menu, choose Install app or Add to Home screen.');
}
