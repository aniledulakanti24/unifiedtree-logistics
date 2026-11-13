// Workspace: each account picks a focus, and only those services show in the sidebar, the New
// menu, search and the Overview. Everything else stays one click away on this page.
import { api, esc, store, toast, modal } from '../core.js';
import { icon } from './icons.js';

// Services that can be switched on or off. Overview, All Orders, Wallet, Help and Settings are always on.
export const MODULES = [
  { key: 'vehicle', group: 'Ship & deliver', label: 'Vehicle Transport', icon: 'bike', desc: 'Bikes, 3-wheelers and mini trucks across the city.', re: /^vehicle/, nav: ['vehicle'] },
  { key: 'courier', group: 'Ship & deliver', label: 'Courier', icon: 'parcel', desc: 'Parcels to any pin code, compared across couriers.', re: /^courier/, nav: ['courier'] },
  { key: 'logistics', group: 'Ship & deliver', label: 'Logistics (truck loads)', icon: 'truck', desc: 'Part and full truck loads between cities.', re: /^logistics/, nav: ['logistics'] },
  { key: 'international', group: 'Ship & deliver', label: 'International', icon: 'globe', desc: 'Export parcels and cargo, with customs help.', re: /^(international|intl-quote)/, nav: ['international'] },
  { key: 'services', group: 'Ship & deliver', label: 'Movers & warehousing', icon: 'building', desc: 'Home and office moves, storage and packing.', re: /^services\//, nav: ['services'] },
  { key: 'returns', group: 'Manage', label: 'Returns', icon: 'returnbox', desc: 'Return requests, pickups and refunds.', re: /^(my\/returns|returns-policy)/, nav: ['my-returns'] },
  { key: 'seller', group: 'Manage', label: 'Seller tools', icon: 'tools', desc: 'Failed deliveries, RTO, weight disputes, COD and channels.', business: true, re: /^(seller-home|my\/weight|intel|holidays|dashboard|reports|orders|shipments|bulk|manifests|tools|ndr|radar|boost|rto|cod-confirm|returns$|returns\/|exchanges|weight|billing|cod$|invoices|rate-card|couriers|pincodes|tat|skus|freeze|promise|blocklist|channels)/, nav: ['my-weight', 'intel', 'holidays', 'seller'] },
  { key: 'business', group: 'Manage', label: 'Business tools', icon: 'radar', desc: 'Live fleet tracking, WhatsApp updates and single GST invoice.', business: true, re: /^business\/(tracking|whatsapp|gst)/, nav: ['b-track', 'b-wa', 'b-gst'] },
  { key: 'travel', group: 'Book & pay', label: 'Travel & Stay', icon: 'plane', desc: 'Flights, trains, buses, hotels and local rides.', re: /^(travel\/|rides)/, nav: ['travel'] },
  { key: 'pay', group: 'Book & pay', label: 'Recharge & Bills', icon: 'phone', desc: 'Mobile, FASTag, utility bills, gold and vouchers.', re: /^(pay\/|autopay|recharge)/, nav: ['pay'] },
];
// Ready-made focuses. "deliver" is the one UT Log leads with.
export const FOCUS = [
  { key: 'deliver', label: 'Deliver across the city', icon: 'bike', note: 'Recommended', desc: 'Compare bikes, 3-wheelers, mini trucks and couriers, then book the best one.', on: ['vehicle', 'courier', 'returns', 'business'] },
  { key: 'sell', label: 'Ship online orders', icon: 'parcel', desc: 'For online sellers: courier shipping, failed deliveries, returns and COD.', on: ['courier', 'vehicle', 'returns', 'seller', 'business'] },
  { key: 'freight', label: 'Move freight', icon: 'truck', desc: 'Truck loads between cities, exports and fleet tracking.', on: ['logistics', 'vehicle', 'international', 'returns', 'business'] },
  { key: 'everyday', label: 'Everyday payments & travel', icon: 'phone', desc: 'Recharges, bills, travel bookings and the odd bike delivery.', on: ['vehicle', 'travel', 'pay'] },
  { key: 'all', label: 'Everything', icon: 'dashboard', desc: 'Every UT Log service in the sidebar.', on: MODULES.map((m) => m.key) },
];
const isBusiness = () => store.state.accountType === 'business';
const isOwner = () => !store.state.user || !store.state.user.role || store.state.user.role === 'owner';
const relevant = (m) => !m.business || isBusiness();

export const workspace = () => (store.state.profile && store.state.profile.workspace) || null;
// With no profile loaded yet, show everything rather than flash an empty sidebar.
export const modOn = (key) => { const w = workspace(); return !w || !key || w.on.includes(key); };
export const moduleOfPath = (path) => { const p = String(path || '').replace(/^#\/?/, '').split('?')[0]; const m = MODULES.find((x) => x.re.test(p)); return m ? m.key : null; };
export const pathOn = (path) => modOn(moduleOfPath(path));
// The switched-off service that blocks this page, if any.
export const blockedBy = (path) => { const k = moduleOfPath(path); const m = k && MODULES.find((x) => x.key === k); return m && relevant(m) && !modOn(k) ? k : null; };
const NAV_MOD = Object.fromEntries(MODULES.flatMap((m) => m.nav.map((n) => [n, m.key])));
export const navOn = (navKey) => modOn(NAV_MOD[navKey]);
export const focusOf = (w = workspace()) => (w && FOCUS.find((f) => f.key === w.focus)) || null;
export const focusLabel = (w = workspace()) => { const f = focusOf(w); return f ? f.label : 'Custom'; };
export const hiddenCount = () => { const w = workspace(); return w ? MODULES.filter((m) => relevant(m) && !w.on.includes(m.key)).length : 0; };

async function save(ws) {
  const p = await api('/hub/profile', { method: 'POST', body: { workspace: ws } });
  store.set({ profile: { ...(store.state.profile || {}), ...p } });
  return p.workspace;
}
export async function turnOn(key) {
  const w = workspace() || { on: [] };
  return save({ focus: 'custom', on: [...new Set([...w.on, key])] });
}

// Shown in place of a page whose service is switched off.
export function offScreen(view, key) {
  const m = MODULES.find((x) => x.key === key);
  view.innerHTML = `<div class="ws-off card"><span class="ws-off__ico">${icon(m.icon, 28)}</span><h1>${esc(m.label)} isn't in your workspace</h1><p>${esc(m.desc)} ${isOwner() ? 'Add it and it appears in your sidebar straight away.' : 'Ask your account owner to add it to the workspace.'}</p>
    <div class="row ws-off__go">${isOwner() ? `<button class="btn btn-primary" id="wsAdd" type="button">${icon('plus', 16)}Add ${esc(m.label)}</button>` : ''}<a class="btn btn-outline" href="#/workspace">See all services</a><a class="link" href="#/home">Back to Overview</a></div></div>`;
  const b = view.querySelector('#wsAdd');
  if (b) b.addEventListener('click', async () => { b.disabled = true; try { await turnOn(key); toast(`${m.label} added to your workspace`); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { b.disabled = false; toast(e.message, true); } });
}

// ---- the Workspace page ------------------------------------------------------------------
export async function render(view) {
  if (!store.state.profile || !store.state.profile.workspace) { const p = await api('/hub/profile'); store.set({ profile: p }); }
  const draw = () => {
    const w = workspace();
    const owner = isOwner();
    const mods = MODULES.filter(relevant);
    const groups = [...new Set(mods.map((m) => m.group))];
    view.innerHTML = `<div class="ws">
      <div class="ov-head"><div><h1>Workspace</h1><p>Pick what you use. Everything else stays out of the way, and you can add it back any time.</p></div></div>
      ${owner ? '' : '<p class="callout">Your account owner chooses the workspace. You can see it here.</p>'}
      <section class="card ws-sec"><div class="card-h"><div><h2>What do you mostly do?</h2><small>Sets your sidebar, New menu, search and Overview.</small></div></div>
        <div class="ws-focus" role="radiogroup" aria-label="Workspace focus">${FOCUS.map((f) => { const on = w.focus === f.key; const list = f.on.map((k) => MODULES.find((m) => m.key === k)).filter(relevant); return `<button class="ws-card ${on ? 'on' : ''}" type="button" role="radio" aria-checked="${on}" data-focus="${f.key}" ${owner ? '' : 'disabled'}><span class="ws-card__top"><span class="ws-card__ico">${icon(f.icon, 20)}</span>${f.note ? `<i class="ws-tag">${esc(f.note)}</i>` : ''}${on ? `<span class="ws-tick">${icon('check', 18)}</span>` : ''}</span><b>${esc(f.label)}</b><small>${esc(f.desc)}</small><span class="ws-chips">${f.key === 'all' ? `<em>All ${list.length} services</em>` : list.map((m) => `<em>${esc(m.label.replace(/ \(.*\)/, ''))}</em>`).join('')}</span></button>`; }).join('')}</div>
        ${w.focus === 'custom' ? '<p class="ws-custom">You picked your own mix of services below.</p>' : ''}</section>
      <div class="ws-grid">
        <section class="card ws-sec"><div class="card-h"><div><h2>Services</h2><small>${w.on.filter((k) => mods.some((m) => m.key === k)).length} of ${mods.length} switched on</small></div></div>
          ${groups.map((g) => `<p class="ws-group">${esc(g)}</p><ul class="ws-list">${mods.filter((m) => m.group === g).map((m) => `<li><span class="ws-ico">${icon(m.icon, 18)}</span><span class="grow"><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></span><label class="switch" title="${w.on.includes(m.key) ? 'Switch off' : 'Switch on'}"><input type="checkbox" data-mod="${m.key}" ${w.on.includes(m.key) ? 'checked' : ''} ${owner ? '' : 'disabled'} aria-label="${esc(m.label)}"><i></i></label></li>`).join('')}</ul>`).join('')}
        </section>
        <aside class="card ws-sec ws-preview"><div class="card-h"><div><h2>Your sidebar</h2><small>What everyone on this account sees</small></div></div>
          <ul class="ws-side"><li>${icon('dashboard', 16)}Overview</li>${mods.filter((m) => w.on.includes(m.key)).map((m) => `<li class="on">${icon(m.icon, 16)}${esc(m.label)}</li>`).join('')}<li>${icon('box', 16)}All Orders</li><li>${icon('wallet', 16)}Wallet</li></ul>
          <p class="muted small">Always there: Overview, All Orders, Wallet, Help and Settings. Your role can still limit what each person opens.</p></aside>
      </div></div>`;
  };
  draw();
  view.onclick = async (e) => {
    const b = e.target.closest('[data-focus]');
    if (!b || !isOwner() || b.classList.contains('on')) return;
    try { await save({ focus: b.dataset.focus }); toast(`Workspace set to ${FOCUS.find((f) => f.key === b.dataset.focus).label}`); draw(); } catch (x) { toast(x.message, true); }
  };
  view.onchange = async (e) => {
    const c = e.target.closest('[data-mod]');
    if (!c) return;
    const w = workspace();
    const on = c.checked ? [...new Set([...w.on, c.dataset.mod])] : w.on.filter((k) => k !== c.dataset.mod);
    try { await save({ focus: 'custom', on }); const f = FOCUS.find((x) => x.on.length === on.length && x.on.every((k) => on.includes(k))); if (f) await save({ focus: f.key }); draw(); }
    catch (x) { c.checked = !c.checked; toast(x.message, true); }
  };
}

// First run: what will you do most? Business accounts default to "Ship online orders" only if they say so.
export function askFocus() {
  let pick = 'deliver';
  return modal({
    title: 'What will you do most on UT Log?',
    body: `<p class="muted notop">We'll show just those services. You can add others any time from Workspace.</p>
      <div class="ws-focus ws-focus--modal" role="radiogroup" aria-label="Workspace focus">${FOCUS.map((f) => `<button class="ws-card ${f.key === pick ? 'on' : ''}" type="button" role="radio" aria-checked="${f.key === pick}" data-focus="${f.key}"><span class="ws-card__top"><span class="ws-card__ico">${icon(f.icon, 20)}</span>${f.note ? `<i class="ws-tag">${esc(f.note)}</i>` : ''}</span><b>${esc(f.label)}</b><small>${esc(f.desc)}</small></button>`).join('')}</div>`,
    footer: '<button class="btn btn-primary btn-block" id="wsGo" type="button">Continue</button>',
    onMount(el, close) {
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-focus]'); if (!b) return; pick = b.dataset.focus; el.querySelectorAll('[data-focus]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); });
      el.querySelector('#wsGo').addEventListener('click', async () => { try { await save({ focus: pick }); } catch (e) { /* keep the default */ } close(pick); });
    },
  });
}
