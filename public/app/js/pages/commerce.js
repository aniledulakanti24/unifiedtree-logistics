// Commerce: sales channels, rate card & coupons, refer & earn.
import { api, html, raw, money, date, dateTime, esc, statusBadge, toast, formData, modal, refreshCounts, emptyState } from '../core.js';

const post = (path, body) => api(path, { method: 'POST', body });
async function run(fn, msg, again) { try { const r = await fn(); if (msg) toast(typeof msg === 'function' ? msg(r) : msg); refreshCounts(); again(); return r; } catch (err) { toast(err.message, true); return null; } }
const FIELD_LABEL = { store_url: 'Store URL', api_key: 'API access token', seller_id: 'Seller ID', handle: 'Shop handle' };

// ---- channels ---------------------------------------------------------------
export async function renderChannels(view) {
  const d = await api('/channels');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Channels</h1><p>Connect your stores and marketplaces to import orders automatically.</p></div></div>
    <div class="grid grid-3" id="list">${raw(d.data.map((c) => `<section class="card" data-key="${c.key}"><div class="row"><h2 style="margin:0">${esc(c.name)}</h2><span class="spacer"></span>
      ${c.connection ? '<span class="badge badge-green">Connected</span>' : '<span class="badge">Not connected</span>'}</div>
      ${c.connection ? `<p class="muted small">${esc(c.connection.store)}<br>Connected ${date(c.connection.connected_at)} · ${c.connection.imported} orders imported${c.connection.last_sync ? ' · last sync ' + dateTime(c.connection.last_sync) : ''}</p>
        <div class="row"><button class="btn btn-primary btn-sm" data-act="sync">Sync now</button><button class="btn btn-danger btn-sm" data-act="disconnect">Disconnect</button></div>`
        : `<p class="muted small">${c.needs.length ? 'Needs: ' + c.needs.map((n) => FIELD_LABEL[n]).join(', ') : 'Push orders with an API key.'}</p><button class="btn btn-outline btn-sm" data-act="connect">Connect</button>`}
    </section>`).join(''))}</div>`;
  const again = () => renderChannels(view);
  view.querySelector('#list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const key = b.closest('[data-key]').dataset.key;
    const c = d.data.find((x) => x.key === key);
    if (b.dataset.act === 'sync') return run(() => post('/channels/sync', { key }), (r) => `${r.imported} new order${r.imported > 1 ? 's' : ''} imported from ${c.name}`, again);
    if (b.dataset.act === 'disconnect') return run(() => post('/channels/disconnect', { key }), `${c.name} disconnected`, again);
    if (!c.needs.length) { location.hash = '#/developers'; return; }
    const ok = await modal({
      title: `Connect ${c.name}`,
      body: `<form class="grid" id="cf">${c.needs.map((n) => `<label class="field">${FIELD_LABEL[n]}<input class="input" name="${n}" ${n === 'api_key' ? 'type="password" autocomplete="off"' : ''} placeholder="${n === 'store_url' ? 'https://mystore.com' : ''}"></label>`).join('')}</form><p class="form-error" id="cErr"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="cGo">Connect</button>',
      onMount: (el, close) => el.querySelector('#cGo').addEventListener('click', async () => {
        try { close(await post('/channels/connect', { key, ...formData(el.querySelector('#cf')) })); } catch (err) { el.querySelector('#cErr').textContent = err.message; }
      }),
    });
    if (ok) { toast(`${c.name} connected`); again(); }
  });
}

// ---- rate card + coupons (pay as you go) -------------------------------------
export async function renderRateCard(view) {
  const d = await api('/rate-card');
  view.innerHTML = html`
    <div class="page-head"><div><h1>Rate card & coupons</h1><p>Pay as you go — no subscription. Rates include GST; final price depends on weight, zone and your courier rules.</p></div>
      <a class="btn btn-outline" href="#/tools">Rate calculator</a></div>
    <section class="card" style="margin-bottom:16px"><h2>Forward shipping · first 500 g</h2>
      <div class="table-wrap"><table><thead><tr><th>Courier</th>${raw(d.zones.map((z) => `<th>${esc(z)}</th>`).join(''))}<th>Each extra 500 g</th><th>COD charge</th><th>Base TAT</th></tr></thead><tbody>
      ${raw(d.couriers.map((c) => `<tr><td><b>${esc(c.name)}</b></td>${c.first_500g.map((r) => `<td>${money(r)}</td>`).join('')}<td>${money(c.additional_500g)}</td><td class="small">${esc(c.cod)}</td><td>${c.days} days</td></tr>`).join(''))}
      </tbody></table></div><p class="muted small">Chargeable weight is the higher of dead weight and volumetric weight (L×B×H ÷ 5000).</p></section>
    <section class="card"><h2>Coupons</h2>
      <form class="row" id="cp"><input class="input" name="code" placeholder="Enter coupon code" style="max-width:220px;text-transform:uppercase"><button class="btn btn-primary">Apply</button></form>
      <div class="grid" style="margin-top:12px">${raw(d.coupons.map((c) => `<div class="action-item"><b class="mono" style="color:inherit;font-size:14px;min-width:110px">${c.code}</b><span>${esc(c.title)}</span><span class="spacer"></span>${c.used ? '<span class="badge badge-green">Used</span>' : ''}</div>`).join(''))}</div></section>`;
  view.querySelector('#cp').addEventListener('submit', (e) => { e.preventDefault(); run(() => post('/coupons/apply', formData(e.target)), (r) => `${money(r.credited)} added to your wallet`, () => renderRateCard(view)); });
}

// ---- refer & earn ---------------------------------------------------------------
export async function renderRefer(view) {
  const d = await api('/refer');
  const link = location.origin + d.link;
  view.innerHTML = html`
    <div class="page-head"><div><h1>Refer & earn</h1><p>Earn ${money(d.reward_per_referral)} in shipping credit for every seller who ships their first 10 orders.</p></div></div>
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card stat"><span class="stat__label">Your code</span><span class="stat__value mono">${d.code}</span></div>
      <div class="card stat"><span class="stat__label">Invited</span><span class="stat__value">${d.data.length}</span></div>
      <div class="card stat"><span class="stat__label">Earned</span><span class="stat__value">${money(d.earned)}</span></div>
    </div>
    <div class="grid grid-2">
      <section class="card"><h2>Share your link</h2><div class="row"><input class="input mono" value="${link}" readonly id="lnk" style="flex:1"><button class="btn btn-outline" id="copy">Copy</button></div>
        <form class="row" id="inv" style="margin-top:12px"><input class="input" name="contact" placeholder="Friend's mobile or email" style="flex:1"><button class="btn btn-primary">Invite</button></form></section>
      <section class="card"><h2>Your referrals</h2>${d.data.length ? raw(d.data.map((r) => `<div class="action-item"><span>${esc(r.contact)}</span><span class="spacer"></span><small class="muted">${date(r.at)}</small>${statusBadge(r.status).value}</div>`).join('')) : emptyState('No referrals yet.')}</section>
    </div>`;
  view.querySelector('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { view.querySelector('#lnk').select(); } });
  view.querySelector('#inv').addEventListener('submit', (e) => { e.preventDefault(); run(() => post('/refer/invite', formData(e.target)), 'Invite recorded', () => renderRefer(view)); });
}
