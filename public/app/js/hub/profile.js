// "Your account" panel, the My profile page, and notifications.
import { api, esc, money, store, toast, logout, getCurrency, withBusy, formData, dateTime, modal } from '../core.js';
import { openPlacePicker, floorText } from './places.js';

function downloadJson(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
import { duo, tile } from './art.js';
import { icon } from './icons.js';
import { mountInstruments } from './instruments.js';
import { installApp } from './experience.js';
import { LANGUAGES, getLanguage, getTheme, setTheme, setAccountType, askBusinessDetails, openLanguageMenu, openCurrencyMenu } from './prefs.js';

// ---- summary (profile score + bell) --------------------------------------------------
export async function refreshSummary() {
  try {
    const s = await api('/hub/summary');
    store.set({ summary: s, score: { value: s.profile_score, total: s.profile_total } });
    const dot = document.getElementById('bellDot');
    if (dot) dot.hidden = !(s.low_accounts.length || s.wallet_balance < 1000 || s.alerts_triggered.length || s.upcoming.some((u) => u.days <= 5));
  } catch (e) {}
}

// ---- identity helpers ----------------------------------------------------------------------
const AV_COLORS = ['#a23b72', '#0e7c66', '#2a5f8f', '#8a5a00', '#5a48c7', '#b8322f', '#137a4b'];
export const initialsOf = (name) => String(name || 'U').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const colorOf = (name) => { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; };
export function whoAmI() {
  const { profile: p = {}, user = {}, accountType } = store.state;
  const name = p.name || user.name || user.email || user.mobile || 'Your account';
  const owner = !user.role || user.role === 'owner';
  const role = owner ? (accountType === 'business' ? 'Account owner' : 'Personal account') : (user.role_name || user.role);
  const org = accountType === 'business' ? `${p.company || 'Your business'} · Business` : 'UT Log · Personal';
  return { p, user, name, owner, role, org, business: accountType === 'business' };
}
const avatar = (name, cls = '') => `<span class="pf-av ${cls}" style="background:${colorOf(name)}">${esc(initialsOf(name))}</span>`;

// ---- "Your account" panel (CRM style) ---------------------------------------------------------
const CHEV = icon('chevron', 16).replace('class="li"', 'class="li acc-chev"');
const row = ([i, t, s, h]) => `<a class="acc-row" href="${h}"><span class="acc-ico">${icon(i, 18)}</span><span class="grow"><b>${esc(t)}</b><small>${esc(s)}</small></span>${CHEV}</a>`;
const ACCOUNT_ROWS = [
  ['dashboard', 'Workspace', 'Choose the services you see', '#/workspace'],
  ['map', 'Saved addresses', 'Pickup and drop places', '#/profile?tab=addresses'],
  ['card', 'Payment methods', 'UPI, cards, banks and wallets', '#/profile?tab=payments'],
  ['bell', 'Notifications', 'What you hear about, and where', '#/profile?tab=notifications'],
  ['shield', 'Security', 'Two-step sign-in, password, devices', '#/profile?tab=security'],
  ['users', 'Safety', 'Trusted contacts for live trips', '#/profile?tab=safety'],
  ['file', 'Privacy & data', 'Consents, download, delete account', '#/profile?tab=privacy'],
  ['clock', 'Activity log', 'Every change, by everyone', '#/activity'],
];
const BUSINESS_ROWS = [
  ['users', 'Users & roles', 'Add people and set what they can do', '#/business/access'],
  ['rupee', 'Spending controls', 'Limits and approvals', '#/business/spend'],
  ['building', 'Business details', 'Company, GSTIN, PAN and IEC', '#/profile?tab=business'],
  ['file', 'KYC & agreements', 'Verification documents', '#/kyc'],
  ['plug', 'Connected apps', 'Providers, accounting and stores', '#/business/integrations'],
  ['code', 'Developers', 'API keys and webhooks', '#/developers'],
];
export function openDrawer() {
  if (document.querySelector('.drawer-wrap')) return;
  const me = whoAmI();
  const langName = () => (LANGUAGES.find((l) => l[0] === getLanguage()) || LANGUAGES[0])[1];
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = `<aside class="drawer acc" role="dialog" aria-modal="true" aria-labelledby="accT">
    <header class="acc-head"><div class="grow"><h2 id="accT">Your account</h2><small>Profile, settings and preferences</small></div><button class="icon-btn" data-x aria-label="Close">${icon('x', 18)}</button></header>
    <div class="acc-body">
      <section class="acc-card">
        <div class="acc-me">${avatar(me.name, 'pf-av--lg')}<div class="grow"><b>${esc(me.name)}</b><small>${esc(me.role)}</small><small>${esc(me.org)}</small></div></div>
        ${me.owner ? `<div class="seg seg--full acc-type" role="group" aria-label="Account type"><button type="button" data-a="personal" aria-pressed="${!me.business}">Personal</button><button type="button" data-a="business" aria-pressed="${me.business}">Business</button></div>` : ''}
        <a class="acc-view" href="#/profile">${icon('user', 18)}<span class="grow">View my profile</span>${CHEV}</a>
      </section>
      <p class="acc-label">Account</p>${ACCOUNT_ROWS.map(row).join('')}
      ${me.business && me.owner ? `<p class="acc-label">Business</p>${BUSINESS_ROWS.map(row).join('')}` : ''}
      <p class="acc-label">Preferences</p>
      <button class="acc-row" id="pLang" type="button"><span class="acc-ico">${icon('globe', 18)}</span><span class="grow"><b>Language</b><small id="pLangV" translate="no">${esc(langName())}</small></span>${CHEV}</button>
      <button class="acc-row" id="pCur" type="button"><span class="acc-ico">${icon('rupee', 18)}</span><span class="grow"><b>Currency</b><small id="pCurV" translate="no">${esc(getCurrency())}</small></span>${CHEV}</button>
      ${row(['calendar', 'Number and date format', 'How dates, times and weeks look', '#/profile?tab=format'])}
      ${row(['phone', 'Mobile app', 'Install UT Log on your phone or computer', '#/profile?tab=app'])}
    </div>
    <footer class="acc-foot"><div class="seg" role="group" aria-label="Theme"><button type="button" data-th="light" aria-pressed="${getTheme() === 'light'}">${icon('sun', 15)}Light</button><button type="button" data-th="dark" aria-pressed="${getTheme() === 'dark'}">${icon('moon', 15)}Dark</button></div><button class="acc-logout" id="lo" type="button">${icon('logout', 17)}Log out</button></footer>
  </aside>`;
  const prev = document.activeElement;
  const onCur = () => { const v = wrap.querySelector('#pCurV'); if (v) v.textContent = getCurrency(); };
  const onLang = () => { const v = wrap.querySelector('#pLangV'); if (v) v.textContent = langName(); };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', key); window.removeEventListener('ut:currency', onCur); window.removeEventListener('ut:language', onLang); if (prev && prev.focus) prev.focus(); };
  const key = (e) => { if (e.key === 'Escape' && !document.querySelector('.pop')) close(); };
  window.addEventListener('ut:currency', onCur);
  window.addEventListener('ut:language', onLang);
  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap || e.target.closest('[data-x]') || e.target.closest('a')) { close(); return; }
    const t = e.target.closest('[data-th]');
    if (t) { setTheme(t.dataset.th); wrap.querySelectorAll('[data-th]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); return; }
    const a = e.target.closest('[data-a]');
    if (a && a.dataset.a !== store.state.accountType) { try { await setAccountType(a.dataset.a); toast(`Switched to ${a.dataset.a} account`); close(); if (a.dataset.a === 'business' && !(store.state.profile || {}).business_address) askBusinessDetails(); window.dispatchEvent(new CustomEvent('ut:account')); } catch (x) { toast(x.message, true); } return; }
    if (e.target.closest('#pLang')) { openLanguageMenu(e.target.closest('#pLang')); return; }
    if (e.target.closest('#pCur')) { openCurrencyMenu(e.target.closest('#pCur')); return; }
    if (e.target.closest('#lo')) logout();
  });
  document.addEventListener('keydown', key);
  document.getElementById('modalRoot').appendChild(wrap);
  wrap.querySelector('[data-x]').focus();
}

// ---- notifications -----------------------------------------------------------------------
export async function openNotifications(anchor) {
  document.querySelectorAll('.pop').forEach((p) => p.remove());
  const s = await api('/hub/summary');
  let feed = null;
  if (store.state.accountType === 'business') { try { feed = await api('/hub/biz/notifications', { query: { per_page: 8 } }); } catch (e) { feed = null; } }
  const items = feed ? feed.data.map((n) => [n.icon, n.title, `${n.body} · ${dateTime(n.at)}`, n.link || '#/business/notifications']) : [
    s.wallet_balance < 1000 && ['wallet', `Wallet is low: ${money(s.wallet_balance)}`, 'Add money for prepaid bookings', '#/wallet'],
    ...s.alerts_triggered.map((a) => ['bell', `Price drop: ${a.from} → ${a.to}`, `Now ${money(a.current)}`, '#/travel/flights']),
    ...s.upcoming.filter((u) => u.days <= 5).map((u) => ['bill', `${u.provider} due in ${u.days} days`, `${money(u.amount)} · ${u.auto ? 'Auto-pay on' : 'Pay it yourself'}`, '#/autopay']),
    ...s.low_accounts.map((a) => ['fastag', `FASTag ${a.label} is low`, `${money(a.balance)} left`, '#/pay/fastag']),
    ...s.recent.slice(0, 5).map((r) => ['list', `${r.title} · ${r.provider}`, `${r.label} · ${dateTime(r.at)}`, '#/my/orders?scope=all&days=']),
  ].filter(Boolean);
  const el = document.createElement('div');
  el.className = 'pop pop--wide';
  el.innerHTML = `<h2 class="pop__title">Notifications${feed ? ' <a class="link" href="#/business/notifications">View all</a>' : ''}</h2><div class="pop__feed">${items.length ? items.map(([i, t, d, h]) => `<a class="drow" href="${h}">${duo(i).value}<span><b>${esc(t)}</b><small>${esc(d)}</small></span></a>`).join('') : '<p class="pop__none">You are all caught up.</p>'}</div>`;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  el.style.top = r.bottom + 8 + 'px';
  el.style.left = Math.max(12, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 12)) + 'px';
  const off = (e) => { if (!el.contains(e.target) || e.target.closest('a')) { el.remove(); document.removeEventListener('mousedown', off); } };
  setTimeout(() => document.addEventListener('mousedown', off));
  el.addEventListener('click', (e) => { if (e.target.closest('a')) el.remove(); });
}

// ---- My profile page (CRM card grid) ------------------------------------------------------------
const save = async (patch) => { const p = await api('/hub/profile', { method: 'POST', body: patch }); store.set({ profile: p, accountType: p.account_type, score: { value: p.score, total: p.score_total } }); return p; };
const field = (name, label, value, attrs = '') => `<label class="field">${esc(label)}<input class="input" name="${name}" value="${esc(value || '')}" ${attrs}></label>`;
const footer = (label = 'Save') => `<p class="form-error full"></p><div class="full"><button class="btn btn-primary" type="submit">${label}</button></div>`;
const card = (id, title, sub, body, wide) => `<section class="card pf-card ${wide ? 'pf-card--wide' : ''}" id="pf-${id}"><div class="card-h"><div><h2>${esc(title)}</h2>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div><div class="pf-body">${body}</div></section>`;
function formSave(root, build, again, ok = 'Saved') {
  const form = root.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); const err = form.querySelector('.form-error');
    err.textContent = '';
    await withBusy(btn, async () => { try { await save(build(formData(form))); toast(ok); if (again) again(); } catch (x) { err.textContent = x.message; } });
  });
}
const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
const FORMATS = [['en-IN', 'English (India) · 12,34,567.5 · 11 Nov 2026'], ['en-US', 'English (US) · 1,234,567.5 · Nov 11, 2026'], ['en-GB', 'English (UK) · 1,234,567.5 · 11 Nov 2026'], ['hi-IN', 'Hindi (India) · 12,34,567.5'], ['de-DE', 'German · 1.234.567,5 · 11.11.2026'], ['fr-FR', 'French · 1 234 567,5 · 11/11/2026'], ['ar-AE', 'Arabic (UAE) · 1,234,567.5'], ['ja-JP', 'Japanese · 1,234,567.5 · 2026/11/11']];
const NOTES = [['bookings', 'Booking updates', 'Pickup, delivery and cancellations'], ['wallet', 'Wallet activity', 'Money in, money out and low balance'], ['autopay', 'Auto-pay', 'Before and after each automatic payment'], ['offers', 'Offers', 'Discounts from providers'], ['whatsapp', 'WhatsApp', 'Send updates on WhatsApp'], ['sms', 'SMS', 'Send updates by SMS'], ['email', 'Email', 'Send updates by email']];

export async function render(view, { query }) {
  view.innerHTML = '<div class="skeleton" style="height:160px;margin-bottom:12px"></div><div class="skeleton" style="height:300px"></div>';
  const [p, sec] = await Promise.all([api('/hub/profile'), api('/security').catch(() => null)]);
  store.set({ profile: p, score: { value: p.score, total: p.score_total } });
  const me = whoAmI();
  const business = p.account_type === 'business';
  const again = () => render(view, { query });
  const steps = [['Name', !!p.name], ['Email', !!p.email], ['Mobile', !!p.mobile], ['Address', p.addresses.length > 0], ['Payout account', !!(p.upi || p.bank.account)], business ? ['GSTIN', !!p.gstin] : ['Date of birth', !!p.dob], ['Account type', !!p.account_type]];
  const missing = steps.filter(([, ok]) => !ok).map(([l]) => l);
  const kv = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="muted">Not added</span>'}</dd></div>`;
  view.innerHTML = `
    <div class="page-head"><div><h1>My profile</h1><p>How you appear to providers and your team</p></div><div class="row"><a class="btn btn-outline" href="#/activity">${icon('clock', 16)}Activity log</a><button class="btn btn-outline" id="dl" type="button">${icon('download', 16)}Download my data</button></div></div>
    <div class="pf-grid">
      <section class="card pf-card pf-id" id="pf-identity">
        <div class="pf-who">${avatar(me.name, 'pf-av--xl')}<div class="grow"><b>${esc(me.name)}</b><small>${esc(me.role)}</small><span class="badge ${business ? 'badge-blue' : 'badge-green'}">${business ? 'Business account' : 'Personal account'}</span></div></div>
        <dl class="pf-kv">${kv('Mobile', p.mobile && `+91 ${p.mobile}`)}${kv('Email', p.email)}${business ? kv('Company', p.company) : ''}${kv('Sign-in', sec && sec.has_password ? 'Email and password' : 'One-time code to your mobile')}</dl>
        <div class="pf-score"><div class="row"><small>Profile ${p.score} of ${p.score_total} complete</small><span class="spacer"></span>${missing.length ? `<small class="muted">Next: ${esc(missing[0])}</small>` : '<small class="tone-good">All done</small>'}</div><span class="gs-bar"><i style="width:${(p.score / p.score_total) * 100}%"></i></span></div>
      </section>
      ${card('app', 'Mobile app', 'Put UT Log on your phone or computer, with its own icon and window.', `<p class="notop">In your browser menu, choose <b>Install app</b> or <b>Add to Home screen</b>. On Android, use Chrome.</p><p class="muted small">It is the same UT Log, not a separate store app.</p><button class="btn btn-outline" id="inst" type="button">${icon('phone', 16)}Install app</button>`)}
      ${card('details', 'Your details', 'Used on bookings, tickets and receipts.', `<form class="form-grid" novalidate>${field('name', 'Full name *', p.name, 'autocomplete="name"')}${field('email', 'Email', p.email, 'type="email" autocomplete="email"')}${field('mobile', 'Mobile number', p.mobile, 'inputmode="numeric" maxlength="10"')}${field('dob', 'Date of birth', p.dob, 'type="date"')}${footer()}</form>`)}
      ${business ? card('business', 'Business details', 'Used on invoices and for B2B freight.', `<form class="form-grid" novalidate>${field('company', 'Company name', p.company)}${field('industry', 'Industry', p.industry)}${field('gstin', 'GSTIN', p.gstin, 'maxlength="15" style="text-transform:uppercase"')}${field('pan', 'PAN', p.pan, 'maxlength="10" style="text-transform:uppercase"')}${field('iec', 'Import Export Code', p.iec)}${field('employees', 'Team size', p.employees)}<label class="field full">Business address<textarea class="input" name="ba_line" rows="2" placeholder="Building, street, area">${esc((p.business_address || {}).line || '')}</textarea><small class="muted">Used as the pickup address when you book.</small></label>${field('ba_city', 'City', (p.business_address || {}).city)}${field('ba_pincode', 'Pin code', (p.business_address || {}).pincode, 'inputmode="numeric" maxlength="6"')}${footer()}</form>`) : ''}
      ${card('format', 'My number and date format', 'Only for you. Changes how amounts, dates and times look.', `<form class="form-grid" id="fmtF" novalidate><label class="field full">Number and date format<select class="select" name="loc">${FORMATS.map(([v, l]) => `<option value="${v}" ${read('ut-date-locale', 'en-IN') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label class="field">Clock<select class="select" name="clock"><option value="12" ${read('ut-clock', '12') === '12' ? 'selected' : ''}>12-hour (3:30 pm)</option><option value="24" ${read('ut-clock', '12') === '24' ? 'selected' : ''}>24-hour (15:30)</option></select></label><label class="field">Week starts on<select class="select" name="week"><option value="0" ${read('ut-week-start', '0') === '0' ? 'selected' : ''}>Sunday</option><option value="1" ${read('ut-week-start', '0') === '1' ? 'selected' : ''}>Monday</option></select></label><p class="muted small full notop" id="fmtEx">Looks like: ${esc(dateTime(new Date().toISOString()))}</p></form>`)}
      ${card('alerts', 'Language and look', 'Applies across the app.', `<div class="pf-list"><button class="acc-row" id="pfLang" type="button"><span class="acc-ico">${icon('globe', 18)}</span><span class="grow"><b>Language</b><small translate="no">${esc((LANGUAGES.find((l) => l[0] === getLanguage()) || LANGUAGES[0])[1])}</small></span>${CHEV}</button><button class="acc-row" id="pfCur" type="button"><span class="acc-ico">${icon('rupee', 18)}</span><span class="grow"><b>Currency</b><small translate="no">${esc(getCurrency())}</small></span>${CHEV}</button><div class="acc-row acc-row--static"><span class="acc-ico">${icon('sun', 18)}</span><span class="grow"><b>Theme</b></span><div class="seg" role="group" aria-label="Theme"><button type="button" data-th="light" aria-pressed="${getTheme() === 'light'}">Light</button><button type="button" data-th="dark" aria-pressed="${getTheme() === 'dark'}">Dark</button></div></div></div>`)}
      ${card('addresses', 'Saved addresses', 'Pick them in one tap when you book.', `${p.addresses.length ? `<ul class="addr">${p.addresses.map((a) => `<li>${tile('pin', 'plain').value}<div class="grow"><b>${esc(a.label)}</b><small class="muted block">${esc(a.line)}, ${esc(a.city)} ${esc(a.pincode)}</small>${a.lat ? `<small class="pf-pinned">${icon('pin', 13)}Pinned on map${a.floor ? ` · ${esc(floorText(a.floor))}` : ''}${a.lift === true ? ' · lift' : a.lift === false ? ' · no lift' : ''}</small>` : ''}</div><button class="btn btn-outline btn-sm" data-rm="${esc(a.id)}" type="button">Remove</button></li>`).join('')}</ul>` : '<p class="muted notop">No saved addresses yet.</p>'}<button class="btn btn-primary btn-sm pf-addmap" type="button" data-addmap>${icon('pin', 16)}Add a place on the map</button><details class="pf-add"><summary>Or type an address</summary><form class="form-grid mt-s" novalidate>${field('label', 'Label', '', 'placeholder="Home, Office, Warehouse"')}${field('city', 'City', '')}<label class="field full">Address<textarea class="input" name="line" rows="2"></textarea></label>${field('pincode', 'Pin code', '', 'inputmode="numeric" maxlength="6"')}${footer('Add address')}</form></details>`)}
      ${card('notifications', 'Notifications', business ? 'For you. Team alerts live in Business notifications.' : 'Choose what you hear about, and where.', `<ul class="toggles">${NOTES.map(([k, t, d]) => `<li><div><b>${esc(t)}</b><small class="muted block">${esc(d)}</small></div><label class="switch"><input type="checkbox" data-n="${k}" ${p.notifications[k] ? 'checked' : ''} aria-label="${esc(t)}"><i></i></label></li>`).join('')}</ul>${business ? '<a class="link" href="#/business/notifications">Business notifications →</a>' : ''}`)}
      ${card('payments', 'Payment methods', 'Saved for faster checkout. Cards keep only the last 4 digits.', `<div id="ins"></div><h3 class="pf-sub">Withdrawal account</h3><p class="muted small notop">Money you withdraw from your wallet goes here.</p><form class="form-grid" id="wdF" novalidate>${field('upi', 'UPI ID', p.upi, 'placeholder="name@bank"')}${field('holder', 'Account holder', p.bank.holder)}${field('account', 'Account number', p.bank.account, 'inputmode="numeric"')}${field('ifsc', 'IFSC', p.bank.ifsc, 'maxlength="11" style="text-transform:uppercase"')}${footer()}</form>`, true)}
      ${sec ? card('security', 'Two-step sign-in', sec.has_password ? 'After your password, enter a code sent to your mobile or email.' : 'Built into how you sign in.', sec.has_password ? `<div class="pf-status"><span class="badge ${sec.twofa ? 'badge-green' : ''}">${sec.twofa ? 'On' : 'Off'}</span><span class="grow muted small">${sec.twofa ? 'A code is asked for every email sign-in.' : 'Recommended for business accounts.'}</span><button class="btn ${sec.twofa ? 'btn-outline' : 'btn-primary'}" id="tf" type="button">${sec.twofa ? 'Turn off' : 'Turn on'}</button></div>` : '<p class="notop">You sign in with a one-time code sent to your mobile, so every sign-in is already two-step. Nothing to set up.</p>') : ''}
      ${sec ? card('password', 'Password', sec.has_password ? 'At least 8 characters, with a number.' : 'Not used for your account.', sec.has_password ? `<form class="form-grid" id="pwF" novalidate><label class="field full">Current password<input class="input" type="password" name="current" autocomplete="current-password"></label><label class="field">New password<input class="input" type="password" name="next" autocomplete="new-password"></label><label class="field">Confirm new password<input class="input" type="password" name="again" autocomplete="new-password"></label><p class="form-error full"></p><div class="full"><button class="btn btn-primary" type="submit">Change password</button></div></form>` : `<p class="notop">You sign in with a one-time code to <b>+91 ${esc(String(p.mobile || '').replace(/^(\d{2})\d{4}/, '$1••••'))}</b>. There is no password to remember or leak.</p>`) : ''}
      ${sec ? card('devices', 'Where you are signed in', `${sec.sessions.length} ${sec.sessions.length === 1 ? 'device' : 'devices'}`, `<ul class="feed">${[...sec.sessions].sort((a, b) => Number(b.current) - Number(a.current)).slice(0, 5).map((s) => `<li><span class="acc-ico">${icon(s.current ? 'phone' : 'columns', 18)}</span><div class="feed__t"><b>${esc(s.device)}</b><small>Session ${esc(s.id)}…</small></div>${s.current ? '<span class="badge badge-green">This device</span>' : ''}</li>`).join('')}</ul>${sec.sessions.length > 5 ? `<p class="muted small">And ${sec.sessions.length - 5} more.</p>` : ''}${sec.sessions.length > 1 ? '<button class="btn btn-outline mt-s" id="revoke" type="button">Sign out other devices</button>' : ''}`) : ''}
      ${card('safety', 'Safety', 'People who get your live trip in one tap.', safetyBody(p))}
      ${card('data', 'Privacy & data', 'What we use, why, and your controls.', privacyBody(p), true)}
    </div>`;
  // Forms
  const sectionOf = (id) => view.querySelector(`#pf-${id}`);
  formSave(sectionOf('details'), (d) => d, again);
  if (business) formSave(sectionOf('business'), ({ ba_line, ba_city, ba_pincode, ...d }) => ({ ...d, business_address: { line: ba_line, city: ba_city, pincode: ba_pincode } }), again);
  formSave(sectionOf('addresses'), (d) => ({ add_address: d }), again, 'Address added');
  formSave(sectionOf('payments').querySelector('#wdF').parentElement, (d) => ({ upi: d.upi, bank: { holder: d.holder, account: d.account, ifsc: d.ifsc } }), again);
  mountInstruments(view.querySelector('#ins'));
  sectionOf('addresses').addEventListener('click', async (e) => { if (e.target.closest('[data-addmap]')) { const pl = await openPlacePicker({ kind: 'place', saveDefault: true }); if (pl) again(); return; } const b = e.target.closest('[data-rm]'); if (b) { await save({ remove_address: b.dataset.rm }); toast('Address removed'); again(); } });
  sectionOf('notifications').addEventListener('change', async (e) => { const k = e.target.dataset.n; if (k) { await save({ notifications: { [k]: e.target.checked } }); toast('Saved'); } });
  // Format
  view.querySelector('#fmtF').addEventListener('change', (e) => {
    const map = { loc: 'ut-date-locale', clock: 'ut-clock', week: 'ut-week-start' };
    try { localStorage.setItem(map[e.target.name], e.target.value); } catch (x) {}
    view.querySelector('#fmtEx').textContent = `Looks like: ${dateTime(new Date().toISOString())}`;
    toast('Format saved');
  });
  // Language, currency, theme
  view.querySelector('#pfLang').addEventListener('click', (e) => openLanguageMenu(e.currentTarget));
  view.querySelector('#pfCur').addEventListener('click', (e) => openCurrencyMenu(e.currentTarget));
  sectionOf('alerts').addEventListener('click', (e) => { const t = e.target.closest('[data-th]'); if (t) { setTheme(t.dataset.th); sectionOf('alerts').querySelectorAll('[data-th]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); } });
  view.querySelector('#inst').addEventListener('click', installApp);
  // Security
  const tf = view.querySelector('#tf');
  if (tf) tf.addEventListener('click', () => (sec.twofa ? turnOff2fa(again) : turnOn2fa(again)));
  const pw = view.querySelector('#pwF');
  if (pw) pw.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = formData(pw); const err = pw.querySelector('.form-error'); err.textContent = '';
    if (d.next !== d.again) { err.textContent = 'The new passwords do not match.'; return; }
    await withBusy(pw.querySelector('[type=submit]'), async () => { try { await api('/me/password', { method: 'POST', body: { current: d.current, next: d.next } }); toast('Password changed'); pw.reset(); } catch (x) { err.textContent = x.message; } });
  });
  const rv = view.querySelector('#revoke');
  if (rv) rv.addEventListener('click', async () => { const r = await api('/security/sessions/revoke-others', { method: 'POST', body: {} }); toast(`Signed out ${r.revoked || 'other'} ${r.revoked === 1 ? 'device' : 'devices'}`); again(); });
  // Data
  const dl = () => downloadMyData(p);
  view.querySelector('#dl').addEventListener('click', dl);
  view.querySelector('#dl2').addEventListener('click', dl);
  view.querySelector('#lo').addEventListener('click', logout);
  // Safety: trusted contacts (up to 3).
  const sf = sectionOf('safety');
  sf.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm-tc]');
    if (rm) { const list = (p.trusted || []).filter((_, i) => String(i) !== rm.dataset.rmTc); try { await save({ trusted: list }); toast('Contact removed'); again(); } catch (x) { toast(x.message, true); } }
  });
  const tcF = sf.querySelector('form');
  if (tcF) tcF.addEventListener('submit', async (e) => {
    e.preventDefault(); const d = formData(tcF); const err = tcF.querySelector('.form-error'); err.textContent = '';
    await withBusy(tcF.querySelector('[type=submit]'), async () => { try { await save({ trusted: [...(p.trusted || []), { name: d.tc_name, phone: d.tc_phone, relation: d.tc_rel }] }); toast('Trusted contact added'); again(); } catch (x) { err.textContent = x.message; } });
  });
  // Privacy: each switch is saved at once and logged with its time.
  const pv = sectionOf('data');
  pv.addEventListener('change', async (e) => {
    const k = e.target.dataset.consent; if (!k) return;
    try { await save({ consents: { [k]: e.target.checked } }); toast(e.target.checked ? 'Consent given' : 'Consent withdrawn'); again(); } catch (x) { e.target.checked = !e.target.checked; toast(x.message, true); }
  });
  pv.addEventListener('click', async (e) => {
    if (e.target.closest('#delAcc')) deleteAccount(again);
    if (e.target.closest('#undoDel')) { await api('/hub/account/delete/cancel', { method: 'POST', body: {} }); toast('Deletion cancelled. Your account stays.'); again(); }
  });
  // Deep links from the account panel: scroll to the section and highlight it.
  const tab = query.get('tab');
  const target = tab && sectionOf({ details: 'details', business: 'business', addresses: 'addresses', payments: 'payments', notifications: 'notifications', security: 'security', format: 'format', app: 'app', safety: 'safety', privacy: 'data', data: 'data' }[tab] || tab);
  if (target) { setTimeout(() => { target.scrollIntoView({ block: 'start', behavior: 'smooth' }); target.classList.add('pf-flash'); setTimeout(() => target.classList.remove('pf-flash'), 1600); }, 80); }
}

function turnOn2fa(done) {
  modal({
    title: 'Turn on two-step sign-in',
    body: '<p class="notop" id="tfMsg">We will send a code to confirm.</p><label class="field">Code<input class="input" id="tfCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><p class="form-error" id="tfErr"></p>',
    footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="tfGo">Confirm</button>',
    async onMount(el, close) {
      try { const r = await api('/security/2fa/start', { method: 'POST', body: {} }); el.querySelector('#tfMsg').textContent = `Enter the code sent to ${r.sent_to}.${r.dev_otp ? ` Sandbox code: ${r.dev_otp}` : ''}`; } catch (x) { el.querySelector('#tfErr').textContent = x.message; }
      el.querySelector('#tfGo').addEventListener('click', async () => { try { await api('/security/2fa/confirm', { method: 'POST', body: { otp: el.querySelector('#tfCode').value } }); toast('Two-step sign-in is on'); close(); done(); } catch (x) { el.querySelector('#tfErr').textContent = x.message; } });
    },
  });
}
async function turnOff2fa(done) {
  const yes = await modal({ title: 'Turn off two-step sign-in?', body: '<p class="notop">Email sign-in will only ask for your password.</p>', footer: '<button class="btn btn-outline" data-close>Keep it on</button><button class="btn btn-danger" id="y">Turn off</button>', onMount: (el, close) => el.querySelector('#y').addEventListener('click', () => close(true)) });
  if (!yes) return;
  await api('/security/2fa/disable', { method: 'POST', body: {} }); toast('Two-step sign-in is off'); done();
}
async function downloadMyData(p) {
  const [orders, methods] = await Promise.all([api('/hub/orders', { query: { per_page: 200, days: '' } }).catch(() => ({ data: [] })), api('/hub/checkout/methods').catch(() => ({ instruments: [] }))]);
  const { apps, score, score_total, ...profile } = p;
  downloadJson(`ut-log-my-data-${new Date().toISOString().slice(0, 10)}.json`, { exported_at: new Date().toISOString(), profile, payment_methods: methods.instruments, orders: orders.data });
  toast('Your data is downloading');
}

// ---- safety and privacy cards ---------------------------------------------------------------
function safetyBody(p) {
  const list = p.trusted || [];
  return `${list.length ? `<ul class="addr">${list.map((c, i) => `<li><span class="pf-av pf-av--sm" style="background:${colorOf(c.name)}">${esc(initialsOf(c.name))}</span><div class="grow"><b>${esc(c.name)}</b><small class="muted block">${esc(c.relation || 'Trusted contact')} · ${esc(c.phone)}</small></div><button class="btn btn-outline btn-sm" type="button" data-rm-tc="${i}">Remove</button></li>`).join('')}</ul>` : '<p class="notop muted">No trusted contacts yet. In an emergency, the Safety button on a live trip sends them your trip and location.</p>'}
    ${list.length < 3 ? `<form class="form-grid mt-s" novalidate><label class="field">Name<input class="input" name="tc_name" autocomplete="off"></label><label class="field">Mobile<input class="input" name="tc_phone" inputmode="numeric" maxlength="10"></label><label class="field">Relation (optional)<input class="input" name="tc_rel" placeholder="Brother, colleague"></label><p class="form-error full"></p><div class="full"><button class="btn btn-primary" type="submit">Add trusted contact</button></div></form>` : ''}
    <p class="muted small">On every live trip: Share live trip, and Safety with 112, your contacts and the UT safety team.</p>`;
}
const PURPOSES = [
  ['location', 'Location for pickups', 'Find you on the map and fill in pickup addresses. Only while you book.'],
  ['personalise', 'Personalised suggestions', 'Use your past bookings to suggest routes and partners.'],
  ['analytics', 'Product analytics', 'Anonymous usage counts that help us fix what is slow or confusing.'],
];
function privacyBody(p) {
  const c = { location: true, analytics: false, personalise: false, ...(p.consents || {}) };
  const del = p.deletion;
  return `${del ? `<div class="pv-del" role="alert"><b>Your account will be deleted on ${esc(new Date(del.purge_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}.</b><span>Until then you can change your mind.</span><button class="btn btn-outline btn-sm" id="undoDel" type="button">Keep my account</button></div>` : ''}
    <div class="pv-grid"><div>
      <p class="pv-h">What you allow</p>
      <ul class="pv-list">${PURPOSES.map(([k, t, d]) => `<li><div class="grow"><b>${t}</b><small>${d}</small></div><label class="switch"><input type="checkbox" data-consent="${k}" ${c[k] ? 'checked' : ''} aria-label="${t}"><i></i></label></li>`).join('')}
        <li><div class="grow"><b>Needed to run your bookings</b><small>Name, mobile, addresses and payments are shared only with the partner doing the job.</small></div><span class="pv-req">Always on</span></li></ul>
      ${(p.consent_log || []).length ? `<details class="pv-log"><summary>Consent history (${p.consent_log.length})</summary><ul>${p.consent_log.slice(0, 8).map((x) => `<li>${x.granted ? 'Gave' : 'Withdrew'} consent for ${esc((PURPOSES.find((q) => q[0] === x.purpose) || [, x.purpose])[1].toLowerCase())} · ${esc(new Date(x.at).toLocaleString())}</li>`).join('')}</ul></details>` : ''}
    </div><div>
      <p class="pv-h">Your rights</p>
      <div class="pv-acts"><button class="btn btn-outline" id="dl2" type="button">${icon('download', 16)}Download my data</button><a class="btn btn-outline" href="#/activity">${icon('clock', 16)}Activity log</a><a class="btn btn-outline" href="#/support?new=1&topic=privacy">${icon('chat', 16)}Ask the privacy team</a></div>
      <p class="muted small">We keep GST invoices for 8 years because the law requires it. Everything else is erased when you delete your account.</p>
      <div class="pv-acts">${del ? '' : `<button class="btn btn-outline pv-danger" id="delAcc" type="button">Delete my account</button>`}<button class="btn btn-outline pf-out" id="lo" type="button">${icon('logout', 16)}Log out</button></div>
    </div></div>`;
}
function deleteAccount(done) {
  modal({
    title: 'Delete your UT Log account?',
    body: `<p class="notop">Your profile, saved places, payment methods and order history are erased after 7 days. You can cancel any time before then.</p>
      <ul class="pv-bul"><li>Withdraw your wallet balance first. Anything left is refunded to your last payment method.</li><li>Open bookings must be finished or cancelled.</li><li>GST invoices are kept for 8 years, as the law requires.</li></ul>
      <label class="field">Why are you leaving? (optional)<input class="input" id="delWhy"></label>
      <label class="field">Type DELETE to confirm<input class="input" id="delOk" autocomplete="off" autocapitalize="characters"></label><p class="form-error" id="delErr"></p>`,
    footer: '<button class="btn btn-outline" data-close>Keep my account</button><button class="btn btn-danger" id="delGo">Delete in 7 days</button>',
    onMount(el, close) {
      el.querySelector('#delGo').addEventListener('click', async () => {
        try { await api('/hub/account/delete', { method: 'POST', body: { confirm: el.querySelector('#delOk').value, reason: el.querySelector('#delWhy').value } }); toast('Deletion scheduled. You can cancel it for 7 days.'); close(); done(); }
        catch (x) { el.querySelector('#delErr').textContent = x.message; }
      });
    },
  });
}
