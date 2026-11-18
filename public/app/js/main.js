// App shell: auth gate, sidebar, hash router, top bar, command palette, preferences.
import { api, getToken, store, money, esc, refreshCounts } from './core.js';
// Pages load when first opened, not at start-up. lazy() stands in for a module namespace:
// calling X.render(...) imports the file once, then calls the real function.
const loaded = new Map();
function lazy(loader) {
  const load = () => { if (!loaded.has(loader)) loaded.set(loader, loader().catch((e) => { loaded.delete(loader); throw new Error('This page could not load. Check your connection and try again.'); })); return loaded.get(loader); };
  return new Proxy({}, { get: (_, key) => (key === 'load' ? load : (...args) => load().then((m) => m[key](...args))) });
}
const sellerHome = lazy(() => import('./pages/home.js'));
const orders = lazy(() => import('./pages/orders.js'));
const orderDetail = lazy(() => import('./pages/order-detail.js'));
const addOrder = lazy(() => import('./pages/add-order.js'));
const ndr = lazy(() => import('./pages/ndr.js'));
const returns = lazy(() => import('./pages/returns.js'));
const weight = lazy(() => import('./pages/weight.js'));
const analytics = lazy(() => import('./pages/analytics.js'));
const billing = lazy(() => import('./pages/billing.js'));
const tools = lazy(() => import('./pages/tools.js'));
const reports = lazy(() => import('./pages/reports.js'));
const settings = lazy(() => import('./pages/settings.js'));
const shipments = lazy(() => import('./pages/shipments.js'));
const manifests = lazy(() => import('./pages/manifests.js'));
const bulk = lazy(() => import('./pages/bulk.js'));
const exchanges = lazy(() => import('./pages/exchanges.js'));
const international = lazy(() => import('./pages/international.js'));
const risk = lazy(() => import('./pages/risk.js'));
const promise = lazy(() => import('./pages/promise.js'));
const rules = lazy(() => import('./pages/rules.js'));
const commerce = lazy(() => import('./pages/commerce.js'));
const account = lazy(() => import('./pages/account.js'));
import * as help from './pages/help.js';
const developers = lazy(() => import('./pages/developers.js'));
const support = lazy(() => import('./pages/support.js'));
const finance = lazy(() => import('./pages/finance.js'));
const dashboard = lazy(() => import('./hub/dashboard.js'));
const transport = lazy(() => import('./hub/transport.js'));
const wallet = lazy(() => import('./hub/wallet.js'));
const travel = lazy(() => import('./hub/travel.js'));
const pay = lazy(() => import('./hub/pay.js'));
import * as profile from './hub/profile.js';
const insights = lazy(() => import('./hub/insights.js'));
const business = lazy(() => import('./hub/business.js'));
const hubOrders = lazy(() => import('./hub/orders.js'));
const newOrder = lazy(() => import('./hub/neworder.js'));
const bookPay = lazy(() => import('./hub/bookpay.js'));
const hubWeight = lazy(() => import('./hub/weight.js'));
const hubHelp = lazy(() => import('./hub/help.js'));
const accessPage = lazy(() => import('./hub/access.js'));
const holidayPage = lazy(() => import('./hub/holidays.js'));
const intel = lazy(() => import('./hub/intel.js'));
const control = lazy(() => import('./hub/control.js'));
import { setupApp, maybeTour } from './hub/experience.js';
import { installSmoothScroll, watchView, resetScroll, progressStart, progressDone } from './hub/motion.js';
import { duo, scene, tile } from './hub/art.js';
import { addMoney } from './hub/ui.js';
import * as ws from './hub/workspace.js';
import { maybeOffer, install, canInstall } from './hub/install.js';
import { bootLanguage, askAccountType, askBusinessDetails, setAccountType, setTheme, getTheme } from './hub/prefs.js';
import { installPalette, openPalette } from './palette.js';

if (!getToken()) location.replace('/login/?next=' + encodeURIComponent('/app/' + location.hash));
bootLanguage();

// Route table: first match wins; :params are passed to the page renderer.
const desk_ = lazy(() => import('./hub/desk.js'));
const bills = lazy(() => import('./hub/bills.js'));
import { icon } from './hub/icons.js';
import { openAsk } from './hub/ask.js';
import { popover } from './hub/prefs.js';
import { startTour } from './hub/experience.js';
const NEW_FLOW = ['vehicle', 'courier', 'logistics', 'international'];
const section = (key) => [
  [key, (v, p) => transport.render(v, { ...p, section: key, tab: 'dashboard' })],
  [`${key}/book`, (v, p) => (NEW_FLOW.includes(key) ? location.replace(`#/new-order?type=${key}`) : transport.render(v, { ...p, section: key, tab: 'book' }))],
  ...['orders', 'returns', 'cancellations', 'analytics', 'tower', 'settings'].map((tab) => [`${key}/${tab}`, (v, p) => transport.render(v, { ...p, section: key, tab })]),
];
const ROUTES = [
  ['home', dashboard.render],
  ['new-order', newOrder.render],
  ['book-pay', bookPay.render],
  ['workspace', ws.render],
  ['website', () => { location.replace('#/my/orders?section=website'); }],
  ...['vehicle', 'courier', 'logistics', 'international'].flatMap(section),
  ['courier/bulk', (v, p) => transport.render(v, { ...p, section: 'courier', tab: 'bulk' })],
  ['bookings', (v, { query }) => { location.replace(`#/my/orders?scope=all&days=${query.get('days') || ''}${query.get('search') ? `&search=${encodeURIComponent(query.get('search'))}` : ''}`); }],
  ...[['travel', ['dashboard', 'orders', 'cancellations', 'analytics', 'tower', 'settings']], ['services', ['dashboard', 'orders', 'returns', 'cancellations', 'analytics', 'tower', 'settings']], ['pay', ['dashboard', 'orders', 'analytics', 'tower']]].flatMap(([desk, tabs]) => tabs.map((tab) => [`${desk}/${tab}`, (v, p) => desk_.renderDeskPage(v, { ...p, desk, tab })])),
  ['travel/:kind', travel.render], ['rides', (v, p) => travel.render(v, { ...p, kind: 'rides' })],
  ['pay/mobile', pay.renderMobile], ['pay/fastag', pay.renderFastag], ['pay/bills', bills.renderBills], ['pay/send', bills.renderSend], ['pay/vouchers', bills.renderVouchers], ['pay/gold', bills.renderGold], ['pay/business', pay.renderBusiness], ['autopay', pay.renderAutopay],
  ['wallet', wallet.render], ['profile', profile.render], ['rewards', insights.renderRewards], ['insights', insights.renderInsights],
  ['my/orders', hubOrders.renderOrders], ['my/orders/:id', hubOrders.renderOrderDetail], ['my/returns', hubOrders.renderReturns], ['my/weight', hubWeight.render], ['help', hubHelp.renderHelp], ['feedback', hubHelp.renderFeedback],
  ['intel', intel.render], ['services/:kind', travel.render], ['business/spend', control.renderSpend], ['business/integrations', control.renderIntegrations],
  ['holidays', holidayPage.render], ['business/access', accessPage.render],
  ['business/tracking', business.renderTracking], ['business/whatsapp', business.renderWhatsApp], ['business/gst', business.renderGst], ['business/notifications', business.renderNotifications],
  // Seller tools.
  ['seller-home', sellerHome.render], ['dashboard', analytics.render],
  ['orders/add', addOrder.render], ['orders/view/:id', orderDetail.render], ['orders/:tab', orders.render], ['orders', orders.render],
  ['shipments', shipments.render], ['bulk', bulk.render], ['manifests', manifests.render],
  ['returns', returns.render], ['returns-policy', returns.renderPolicy], ['exchanges', exchanges.render],
  ['ndr', ndr.render], ['boost', risk.renderBoost], ['rto', risk.renderRto], ['cod-confirm', risk.renderCodConfirm], ['radar', risk.renderRadar], ['blocklist', risk.renderBlocklist],
  ['weight', weight.render], ['freeze', weight.renderFreeze],
  ['tools', tools.render], ['intl-quote', international.renderQuote], ['track', shipments.renderTrack], ['promise', promise.render],
  ['couriers', rules.renderCouriers], ['pincodes', rules.renderPincodes], ['tat', rules.renderTat], ['skus', rules.renderSkus],
  ['channels', commerce.renderChannels], ['billing', billing.render], ['cod', finance.renderCod], ['invoices', finance.renderInvoices], ['rate-card', commerce.renderRateCard],
  ['reports', reports.render], ['support', support.renderSupport], ['settings', settings.render], ['team', () => { location.replace('#/business/access'); }], ['kyc', account.renderKyc], ['vas', account.renderVas],
  ['tracking-page', account.renderTrackingPage], ['developers', developers.renderDevelopers], ['security', account.renderSecurity], ['activity', account.renderActivity],
  ['tutorials', help.renderTutorials], ['shortcuts', help.renderShortcuts], ['refer', commerce.renderRefer],
];

function match(path) {
  for (const [pattern, render] of ROUTES) {
    const a = pattern.split('/');
    const b = path.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((seg, i) => (seg.startsWith(':') ? (params[seg.slice(1)] = decodeURIComponent(b[i])) : seg === b[i]))) return { render, params };
  }
  return null;
}

const view = document.getElementById('view');
const currentPath = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
let cleanup = null;

async function route() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const hit = match(path || 'home');
  if (!hit) { location.hash = '#/home'; return; }
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  highlightNav(path || 'home');
  closeMobileSide();
  const needs = moduleFor(path || 'home');
  if (needs && !can(needs)) { if (typeof cleanup === 'function') cleanup(); cleanup = null; view.innerHTML = `<div class="card"><div class="empty-scene">${scene('locked').value}<p>Your role does not include this page. Ask your account admin for access.</p></div></div>`; return; }
  const off = ws.blockedBy(path || 'home');
  if (off) { document.querySelectorAll('.pop').forEach((p) => p.remove()); ws.offScreen(view, off); document.title = 'Workspace · UT Log'; return; }
  document.querySelectorAll('.pop').forEach((p) => p.remove());
  view.innerHTML = '';
  view.onclick = null;
  view.onchange = null;
  view.focus({ preventScroll: true });
  resetScroll();
  progressStart();
  try {
    cleanup = await hit.render(view, { ...hit.params, query: new URLSearchParams(qs || '') });
    progressDone();
  } catch (err) {
    progressDone();
    if (err.message !== 'Session expired') view.innerHTML = `<div class="card empty"><p>${esc(err.message)}</p><button class="btn btn-outline" onclick="location.reload()">Retry</button></div>`;
  }
  document.title = (view.querySelector('h1') ? view.querySelector('h1').textContent + ' · ' : '') + 'UT Log';
}

// ---- sidebar -----------------------------------------------------------------
const NAV = [
  { key: 'home', label: 'Dashboard', icon: 'dashboard', path: '#/home' },
  { group: 'Book & pay' },
  { key: 'pay', label: 'Travel & Bills', icon: 'ticket', path: '#/book-pay', mod: 'travel', anyOf: ['travel', 'pay'], match: '^(book-pay|travel/|rides|pay/|autopay|recharge)', alts: [['travel', '#/book-pay'], ['recharge', '#/book-pay'], ['autopay', '#/book-pay'], ['bizpay', '#/book-pay']] },
  { key: 'wallet', label: 'Wallet', icon: 'wallet', path: '#/wallet', mod: 'wallet', match: '^(wallet|rewards|insights)', alts: [['wallet', '#/wallet'], ['rewards', '#/rewards'], ['insights', '#/insights']] },
  { group: 'Manage' },
  { key: 'my-orders', label: 'All Orders', icon: 'box2', path: '#/my/orders', mod: 'orders', match: '^(my/orders|bookings|new-order|vehicle|courier|logistics|international|services/)' },
  { key: 'my-returns', label: 'All Returns', icon: 'returnbox', path: '#/my/returns', mod: 'returns', match: '^my/returns' },
  { key: 'my-weight', label: 'Weight Management', icon: 'scale', path: '#/my/weight', mod: 'weight', match: '^my/weight' },
  { key: 'intel', label: 'Courier Intelligence', icon: 'radar', path: '#/intel', mod: 'orders', match: '^intel' },
  { key: 'holidays', label: 'Partner Holidays', icon: 'calendar', path: '#/holidays', mod: 'holidays', match: '^holidays' },
  { group: 'Business', business: true },
  { key: 'b-track', label: 'Live Tracking', icon: 'radar', path: '#/business/tracking', mod: 'tracking', business: true, match: '^business/tracking' },
  { key: 'b-wa', label: 'WhatsApp', icon: 'whatsapp', path: '#/business/whatsapp', mod: 'whatsapp', business: true, match: '^business/whatsapp' },
  { key: 'b-gst', label: 'Single GST', icon: 'receipt', path: '#/business/gst', mod: 'gst', business: true, match: '^business/gst' },
];
// Reachable from a tab or the profile menu, and still found by search.
const SUB_PAGES = [['Flights', '#/travel/flights'], ['Trains', '#/travel/trains'], ['Buses', '#/travel/buses'], ['Hotels', '#/travel/hotels'], ['Accommodation', '#/travel/stays'], ['Local rides', '#/rides'], ['Mobile recharge', '#/pay/mobile'], ['FASTag', '#/pay/fastag'], ['Saved payment methods', '#/profile?tab=payments'], ['Brand vouchers and gift cards', '#/pay/vouchers'], ['Gold and silver', '#/pay/gold'], ['Car insurance', '#/pay/bills?cat=car_ins'], ['Bike insurance', '#/pay/bills?cat=bike_ins'], ['Check motor policy expiry', '#/pay/bills?cat=policycheck'], ['EV recharge', '#/pay/bills?cat=ev'], ['Rent via credit card', '#/pay/bills?cat=rentcc'], ['Book gas cylinder', '#/pay/bills?cat=lpg'], ['File ITR', '#/pay/bills?cat=itr'], ['Regular payments', '#/pay/send?repeat=1'], ['Bills & recharges', '#/pay/bills'], ['Send money', '#/pay/send'], ['DTH recharge', '#/pay/bills?cat=dth'], ['Metro card', '#/pay/bills?cat=metro'], ['Credit card bill', '#/pay/bills?cat=credit'], ['Rent', '#/pay/bills?cat=rent'], ['Education fees', '#/pay/bills?cat=education'], ['Traffic challan', '#/pay/bills?cat=challan'], ['Auto-pay', '#/autopay'], ['Business payments', '#/pay/business'], ['Rewards', '#/rewards'], ['Insights', '#/insights'], ['Notifications', '#/business/notifications'], ['Access Control', '#/business/access'], ['Spending Controls', '#/business/spend'], ['Integrations', '#/business/integrations'], ['My profile', '#/profile'], ['Help & Support', '#/help'], ['Feedback', '#/feedback']];
store.state.hubPages = [...NAV.filter((n) => n.path).map((n) => ({ label: n.label, group: 'UT Log', path: n.path })), ...SUB_PAGES.map(([label, path]) => ({ label, group: 'UT Log', path }))];
// Access checks for the interface. The server enforces the same rules.
const can = (mod, level = 'view') => { const p = store.state.user && store.state.user.permissions; if (!p || !mod) return true; return level === 'view' ? (p[mod] || 'none') !== 'none' : p[mod] === 'manage'; };
const isOwner = () => !store.state.user || !store.state.user.role || store.state.user.role === 'owner';
const moduleFor = (path) => { const exact = [[/^autopay/, 'autopay'], [/^pay\/business/, 'bizpay'], [/^rewards/, 'rewards'], [/^insights/, 'insights']].find(([re]) => re.test(path)); if (exact) return exact[1]; if (/^business\/(access|spend|integrations)|^team/.test(path)) return null; const n = NAV.find((x) => x.match && new RegExp(x.match).test(path)); if (n && n.owner) return null; if (n) return n.mod; if (/^business\/notifications/.test(path)) return 'notifications'; if (/^help|^support/.test(path)) return 'support'; if (/^feedback/.test(path)) return 'feedback'; return null; };

const sideNav = document.getElementById('sideNav');
const substripEl = document.getElementById('substrip');
const segOf = (p) => (p || '').replace(/^#\/?/, '').split(/[/?]/)[0];
const stationStrip = document.getElementById('stationstrip');
let badges = {};

const pageBadge = (c) => (c.badge && badges[c.badge]) || 0;
const isBusiness = () => store.state.accountType === 'business';

// Live counts and favourites in the sidebar (favourites are kept in this browser).
let navCounts = {};
const COUNT_OF = { 'my-orders': 'orders', 'my-returns': 'returns', pay: 'pay' };
const readFavs = () => { try { return JSON.parse(localStorage.getItem('ut-favs')) || []; } catch (e) { return []; } };
const ICON_OF = { box2: 'box', returnbox: 'returnbox' };
function navLink(n, fav) {
  const c = navCounts[COUNT_OF[n.key]];
  const on = readFavs().includes(n.key);
  return `<a class="nav__item" href="${esc(n.path)}" data-path="${esc(n.path)}" ${n.match ? `data-match="${esc(n.match)}"` : ''} title="${esc(n.label)}">${icon(ICON_OF[n.icon] || n.icon, 17)}<span>${esc(n.label)}</span>${c ? `<i class="nav-count">${c}</i>` : ''}${n.key && n.key !== 'seller' && !fav ? `<button class="nav-fav ${on ? 'on' : ''}" type="button" data-fav="${esc(n.key)}" aria-label="${on ? 'Remove from' : 'Add to'} favourites">${icon('star', 14)}</button>` : ''}</a>`;
}
async function loadCounts() { try { navCounts = await api('/hub/nav-counts'); renderNav(); } catch (e) { /* counts are optional */ } }
function renderNav() {
  const { menu } = store.state;
  // A section with tabs stays in the sidebar if the role can open any one of them.
  const resolved = NAV.map((n) => { const hit = n.alts && n.alts.find(([m]) => can(m)); return hit ? { ...n, mod: hit[0], path: hit[1] } : n; });
  const visible = resolved.filter((n) => (!n.business || isBusiness()) && (!n.owner || isOwner()) && (!n.mod || can(n.mod)) && (n.group || (n.anyOf ? n.anyOf.some((m) => ws.modOn(m)) : ws.navOn(n.key))));
  // Drop group headings with nothing under them.
  const items = visible.filter((n, i) => !n.group || (visible[i + 1] && !visible[i + 1].group));
  const favs = readFavs().map((k) => visible.find((n) => n.key === k)).filter(Boolean);
  let out = (favs.length ? `<p class="nav__group">Favourites</p>${favs.map((n) => navLink(n, true)).join('')}` : '') + items.map((n) => (n.group ? `<p class="nav__group">${esc(n.group)}</p>` : navLink(n))).join('');
  if (isBusiness() && ws.navOn('seller') && can('seller_ship') && (menu || []).some((m) => m.children && !m.account)) out += navLink({ key: 'seller', label: 'Seller Tools', icon: 'tools', path: '#/seller-home' }).replace('data-path=', 'data-seller="1" data-path=');
  const more = ws.hiddenCount();
  if (more && isOwner()) out += `<a class="nav__item nav__more" href="#/workspace" data-path="#/workspace" title="Add services">${icon('plus', 17)}<span>Add services</span><i class="nav-count nav-count--soft">${more}</i></a>`;
  sideNav.innerHTML = out;
  document.getElementById('walletPill').hidden = !can('wallet');
  highlightNav(currentPath());
}

function highlightNav(path) {
  const seg = segOf(path);
  const full = '#/' + path;
  const stations = (store.state.menu || []).filter((m) => m.children && !m.account);
  const station = stations.find((m) => (m.children || []).some((c) => segOf(c.path) === seg));
  sideNav.querySelectorAll('a[data-path]').forEach((a) => {
    const on = a.dataset.seller ? !!station : a.dataset.match ? new RegExp(a.dataset.match).test(path) : a.dataset.path === full;
    a.classList.toggle('active', on);
    if (on) { a.setAttribute('aria-current', 'page'); a.scrollIntoView({ block: 'nearest' }); } else a.removeAttribute('aria-current');
  });
  stationStrip.innerHTML = station ? stations.map((m) => `<a href="${esc(m.children[0].path)}" class="${m === station ? 'active' : ''}">${esc(m.label)}</a>`).join('') : '';
  stationStrip.hidden = !station;
  substripEl.innerHTML = station ? station.children.map((c) => {
    const on = segOf(c.path) === seg;
    const n = pageBadge(c);
    return `<a href="${esc(c.path)}" class="${on ? 'active' : ''}" ${on ? 'aria-current="page"' : ''}>${esc(c.label)}${n ? `<i class="badge-count">${n}</i>` : ''}</a>`;
  }).join('') : '';
  substripEl.hidden = !station;
}

function renderUser({ user, counts, profile: p }) {
  if (user || p) {
    const me = profile.whoAmI();
    const pb = document.getElementById('profileBtn');
    pb.textContent = profile.initialsOf(me.name); pb.style.background = profile.colorOf(me.name);
    const av = document.getElementById('sideMeAv');
    av.textContent = profile.initialsOf(me.name); av.style.background = profile.colorOf(me.name);
    document.getElementById('sideMeName').textContent = me.name;
    document.getElementById('sideMeSub').textContent = me.role;
  }
  if (counts && counts.wallet_balance != null) document.getElementById('walletBalance').textContent = money(counts.wallet_balance);
}
let navSig = '';
const ALL_PAGES = store.state.hubPages;
store.subscribe((s) => { const w = s.profile && s.profile.workspace; store.state.hubPages = ALL_PAGES.filter((p) => ws.pathOn(p.path)); const sig = JSON.stringify([s.accountType, s.user && s.user.permissions, (s.menu || []).length, w && w.on]); if (sig !== navSig) { navSig = sig; renderNav(); } renderUser(s); });
renderNav();
renderUser(store.state);

// ---- top bar -----------------------------------------------------------------
const root = document.documentElement;
const sideEl = document.getElementById('side');
const scrim = document.getElementById('sideScrim');
function closeMobileSide() { sideEl.classList.remove('open'); scrim.hidden = true; }
document.getElementById('menuBtn').addEventListener('click', () => {
  if (matchMedia('(max-width: 900px)').matches) { const on = sideEl.classList.toggle('open'); scrim.hidden = !on; return; }
  const rail = root.dataset.side !== 'rail';
  if (rail) root.dataset.side = 'rail'; else delete root.dataset.side;
  try { localStorage.setItem('ut-side', rail ? 'rail' : 'full'); } catch (e) {}
});
scrim.addEventListener('click', closeMobileSide);
document.getElementById('findBtn').addEventListener('click', openPalette);
sideNav.addEventListener('click', (e) => {
  const f = e.target.closest('[data-fav]');
  if (!f) return;
  e.preventDefault(); e.stopPropagation();
  const favs = readFavs(); const k = f.dataset.fav;
  const next = favs.includes(k) ? favs.filter((x) => x !== k) : [...favs, k].slice(-6);
  try { localStorage.setItem('ut-favs', JSON.stringify(next)); } catch (x) {}
  renderNav();
});
document.getElementById('askBtn').addEventListener('click', openAsk);
const NEW_ITEMS = [
  ['Ship', [['parcel', 'amber', 'Send a parcel', 'Courier by pincode', '#/new-order?type=courier', 'booking'], ['bike', 'green', 'Book a vehicle', 'Bike, auto or van in town', '#/new-order?type=vehicle', 'booking'], ['truck', 'blue', 'Truck load', 'Full trucks between cities', '#/new-order?type=logistics', 'booking'], ['globe', 'violet', 'International', 'Ship abroad', '#/international/book', 'booking'], ['building', 'rose', 'Movers & storage', 'Packers, warehousing', '#/services/movers', 'booking']]],
  ['Travel', [['plane', 'blue', 'Flight', 'Every airline', '#/travel/flights', 'travel'], ['train', 'green', 'Train', 'Tickets and PNR', '#/travel/trains', 'travel'], ['hotel', 'violet', 'Hotel', 'Rooms and stays', '#/travel/hotels', 'travel'], ['ride', 'amber', 'Local ride', 'Cab, auto, bike', '#/rides', 'travel']]],
  ['Pay', [['phone', 'green', 'Recharge', 'Mobile and DTH', '#/pay/mobile', 'recharge'], ['bill', 'amber', 'Pay a bill', '41 bill types', '#/book-pay', 'recharge'], ['fastag', 'coral', 'FASTag', 'Top up a tag', '#/pay/fastag', 'recharge'], ['rupee', 'blue', 'Send money', 'UPI or bank', '#/pay/send', 'recharge']]],
];
// Big tiles across the top of the menu: the things people start most.
const NEW_TOP = [['parcel', 'amber', 'Send parcel', '#/new-order?type=courier', 'booking'], ['bike', 'green', 'Vehicle', '#/new-order?type=vehicle', 'booking'], ['truck', 'blue', 'Truck load', '#/new-order?type=logistics', 'booking'], ['cart', 'green', 'Store orders', '#/my/orders?section=website', 'booking'], ['radar', 'blue', 'Track', '#/my/orders?scope=all&group=transit', 'booking']];
const NEW_FOOT = [['returnbox', 'Start a return', '#/my/returns', 'returns'], ['receipt', 'All orders', '#/my/orders', 'booking']];
document.getElementById('newBtn').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const top = NEW_TOP.filter((x) => can(x[4]) && ws.pathOn(x[3]));
  const topPaths = top.map((x) => x[3]);
  const groups = NEW_ITEMS.map(([g, list]) => [g, list.filter((x) => can(x[5]) && ws.pathOn(x[4]) && !topPaths.includes(x[4]))]).filter(([, l]) => l.length);
  const foot = NEW_FOOT.filter((x) => can(x[3]));
  btn.setAttribute('aria-expanded', 'true');
  popover(btn, `<div class="qa qa--new">
    <div class="qa-h"><div><b>Create new</b><small>Ship, book or pay in one tap</small></div><kbd title="Keyboard shortcut">N</kbd></div>
    <label class="qa-find">${icon('search', 15)}<input type="search" id="qaFind" placeholder="Find an action, e.g. flight or truck" aria-label="Find an action" autocomplete="off"></label>
    ${top.length ? `<div class="qa-top" data-sec>${top.map(([i, tone, t, h]) => `<a class="qa-t" href="${h}" data-find="${esc(t.toLowerCase())}">${tile(i, tone).value}<span>${esc(t)}</span></a>`).join('')}</div>` : ''}
    ${groups.map(([g, l]) => `<div data-sec><p class="qa-g">${g}</p><div class="qa-grid">${l.map(([i, tone, t, sub, h]) => `<a class="qa-c" href="${h}" data-find="${esc(`${t} ${sub} ${g}`.toLowerCase())}">${tile(i, tone).value}<span><b>${esc(t)}</b><small>${esc(sub)}</small></span>${icon('chevron', 14)}</a>`).join('')}</div></div>`).join('')}
    <p class="qa-none" id="qaNone" hidden>No action matches. Try the search on the dashboard.</p>
    <div class="qa-foot">${can('wallet') ? `<button type="button" class="qa-money" data-add-money>${icon('wallet', 15)}Add money</button>` : ''}${foot.map(([i, t, h]) => `<a href="${h}">${icon(i, 15)}${esc(t)}</a>`).join('')}</div></div>`, (el, close) => {
    const done = () => { btn.setAttribute('aria-expanded', 'false'); close(); };
    el.addEventListener('click', (x) => { if (x.target.closest('a')) done(); if (x.target.closest('[data-add-money]')) { done(); addMoney().then((ok) => { if (ok) route(); }); } });
    // Type to narrow the list; Enter opens the first match.
    const find = el.querySelector('#qaFind');
    find.addEventListener('input', () => {
      const q = find.value.trim().toLowerCase();
      el.querySelectorAll('[data-find]').forEach((a) => { a.hidden = !!q && !a.dataset.find.includes(q); });
      el.querySelectorAll('[data-sec]').forEach((s) => { s.hidden = ![...s.querySelectorAll('[data-find]')].some((a) => !a.hidden); });
      el.querySelector('#qaNone').hidden = !q || [...el.querySelectorAll('[data-find]')].some((a) => !a.hidden);
    });
    find.addEventListener('keydown', (x) => { if (x.key === 'Enter') { const first = [...el.querySelectorAll('[data-find]')].find((a) => !a.hidden); if (first) { x.preventDefault(); first.click(); } } });
    setTimeout(() => find.focus({ preventScroll: true }), 30);
  });
  // The popover closes itself on outside clicks too: reset the button once it is gone.
  const watch = setInterval(() => { if (!document.querySelector('.qa--new')) { btn.setAttribute('aria-expanded', 'false'); clearInterval(watch); } }, 300);
});
document.getElementById('helpBtn').addEventListener('click', (e) => {
  popover(e.currentTarget, `<div class="menu-list"><a href="#/help">${icon('help', 16)}Help centre</a><a href="#/support?new=1">${icon('chat', 16)}Contact support</a>${canInstall() ? `<button type="button" data-install>${icon('phone', 16)}Install the app</button>` : ''}<a href="#/shortcuts">${icon('keyboard', 16)}Keyboard shortcuts<small>?</small></a><button type="button" data-tour>${icon('rocket', 16)}Take the tour</button><div class="menu-sep"></div><a href="#/feedback">${icon('star', 16)}Send feedback</a></div>`, (el, close) => {
    el.addEventListener('click', (x) => { if (x.target.closest('a')) close(); if (x.target.closest('[data-install]')) { close(); install(); } if (x.target.closest('[data-tour]')) { close(); location.hash = '#/home'; setTimeout(startTour, 900); } });
  });
});
document.getElementById('profileBtn').addEventListener('click', profile.openDrawer);
document.getElementById('sideMe').addEventListener('click', profile.openDrawer);
// "Add a gift card" links anywhere open Add money on the Gift card tab.
document.addEventListener('click', (e) => { if (e.target.closest('[data-gc]')) addMoney(1000, null, 'giftcard'); });
document.getElementById('walletAdd').addEventListener('click', () => addMoney().then((ok) => { if (ok) route(); }));
document.getElementById('bellBtn').addEventListener('click', (e) => profile.openNotifications(e.currentTarget));
window.addEventListener('ut:account', () => route());
window.addEventListener('ut:currency', () => { renderUser(store.state); route(); });
window.addEventListener('ut:refresh', () => { profile.refreshSummary(); loadCounts(); });
setInterval(loadCounts, 30000);

// Business accounts: new-notification badge, toasts and browser alerts.
const bellCount = document.getElementById('bellCount');
let lastNote = null;
async function pollNotes() {
  if (store.state.accountType !== 'business' || !can('notifications')) { bellCount.hidden = true; return; }
  try {
    const n = await api('/hub/biz/notifications', { query: { per_page: 5 } });
    bellCount.hidden = !n.unread;
    bellCount.textContent = n.unread > 99 ? '99+' : n.unread;
    document.getElementById('bellDot').hidden = true;
    const newest = n.data[0];
    if (lastNote !== null && newest && newest.id !== lastNote) {
      const fresh = n.data.slice(0, n.data.findIndex((x) => x.id === lastNote) + 1 || 1).filter((x) => x.id !== lastNote);
      toast(newest.title);
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) fresh.filter((x) => x.browser).forEach((x) => new Notification(x.title, { body: x.body, icon: '/assets/favicon.svg', tag: x.id }));
    }
    lastNote = newest ? newest.id : '';
  } catch (e) { /* retried on the next tick */ }
}
setInterval(pollNotes, 8000);
window.addEventListener('ut:notes', pollNotes);

setupApp();
document.getElementById('mMenu').addEventListener('click', () => { const on = sideEl.classList.toggle('open'); scrim.hidden = !on; });
installPalette();
installSmoothScroll();
watchView(view);
help.installShortcuts();
window.addEventListener('hashchange', route);

// Boot: load user, menu and profile (cached copies already painted), then route.
// Fade the start-up tree away once the first page is on screen.
// After start-up, quietly fetch the pages this workspace uses most, unless the user saves data.
function prefetch() {
  const c = navigator.connection;
  if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
  const by = { vehicle: [transport, desk_], courier: [transport, desk_], logistics: [transport, desk_], international: [transport, desk_], travel: [travel], pay: [pay, bills], returns: [hubOrders] };
  const list = [dashboard, hubOrders, wallet, ...new Set(((store.state.profile && store.state.profile.workspace && store.state.profile.workspace.on) || []).flatMap((k) => by[k] || []))];
  // Idle time when there is some; never more than 2 s late on a busy phone.
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
  const go = () => { const next = list.shift(); if (next) next.load().catch(() => {}).finally(() => idle(go)); };
  setTimeout(() => idle(go), 1500);
}
const bootDone = () => { const b = document.getElementById('boot'); if (!b || b.classList.contains('done')) return; b.classList.add('done'); setTimeout(() => b.remove(), 450); };
setTimeout(bootDone, 8000);
const fixMenu = (data) => { data.forEach((m) => (m.children || []).forEach((c) => { if (c.path === '#/home') c.path = '#/seller-home'; })); return data; };
(async () => {
  try {
    const [user, menu, p] = await Promise.all([api('/auth/login/user'), api('/settings/menuv2'), api('/hub/profile'), refreshCounts()]);
    store.set({ user, menu: fixMenu(menu.data), profile: p, accountType: p.account_type, score: { value: p.score, total: p.score_total } });
    if (p.theme && p.theme !== getTheme()) setTheme(p.theme, false);
    profile.refreshSummary();
    pollNotes();
    loadCounts();
    await route();
    bootDone();
    import('./hub/otp-float.js').then((m) => m.installOtpFloat()).catch(() => {}); // floating OTP card for active orders
    prefetch();
    maybeOffer();
    if (!p.account_type && user.role === 'owner') {
      const type = await askAccountType();
      await setAccountType(type || 'personal');
      if (type === 'business') await askBusinessDetails();
      await ws.askFocus();
      await route();
    }
    if (user.role === 'owner') maybeTour();
  } catch (err) { bootDone(); if (err.message !== 'Session expired') route(); }
})();
