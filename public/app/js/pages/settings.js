// Settings: profile, pickup addresses and sales channels.
import { api, html, raw, esc, store, formData, toast, withBusy, modal } from '../core.js';

export async function render(view) {
  const [user, pickup] = await Promise.all([api('/auth/login/user'), api('/settings/company/pickup')]);
  view.innerHTML = html`
    <div class="page-head"><div><h1>Company &amp; pickup</h1></div></div>
    <div class="grid grid-2">
      <form class="card" id="profileForm"><h2>Profile</h2><div class="form-grid">
        <label class="field">Name<input class="input" name="name" value="${user.name || ''}"></label>
        <label class="field">Email<input class="input" name="email" type="email" value="${user.email || ''}"></label>
        <label class="field">Mobile<input class="input" value="${user.mobile || '—'}" disabled></label>
        <label class="field">Plan<input class="input" value="${user.plan}" disabled></label>
        <div class="full row"><button class="btn btn-primary">Save profile</button></div>
      </div></form>
      <section class="card"><h2>More settings</h2><div class="grid">
        ${raw([['#/team', 'Team & roles', 'Invite ops, finance and support'], ['#/channels', 'Sales channels', 'Connect stores and marketplaces'], ['#/kyc', 'KYC & agreements', 'PAN, GSTIN and bank details'],
          ['#/couriers', 'Courier & rules', 'Priority, pincodes, holidays, SKUs'], ['#/returns-policy', 'Return policy', 'Window, exchanges and photo rules'], ['#/vas', 'Buyer notifications', 'WhatsApp, SMS and email updates'],
          ['#/tracking-page', 'Tracking page', 'Branding, product picks and ratings'], ['#/developers', 'API & webhooks', 'Keys, webhooks and API reference'], ['#/security', 'Security', 'Two-factor login, sessions, API keys']]
          .map(([href, t, s]) => `<a class="action-item" href="${href}"><span class="stack"><b style="min-width:auto;color:inherit;font-size:14px">${t}</b><small class="muted">${s}</small></span><span class="spacer"></span>→</a>`).join(''))}
      </div></section>
      <section class="card span-2"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">Pickup addresses</h2><span class="spacer"></span><button class="btn btn-outline btn-sm" id="addPickup">+ Add address</button></div>
        <div class="grid grid-3" id="pickups">${raw(pickupCards(pickup.data))}</div></section>
    </div>`;

  view.querySelector('#profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(e.submitter, async () => {
      try {
        await api('/me', { method: 'POST', body: formData(e.target) });
        store.set({ user: await api('/auth/login/user') });
        toast('Profile saved');
      } catch (err) { toast(err.message, true); }
    });
  });
  view.querySelector('#addPickup').addEventListener('click', async () => {
    const added = await modal({
      title: 'Add pickup address',
      body: `<form class="form-grid" id="pickupForm">
        <label class="field">Nickname<input class="input" name="nickname" required></label>
        <label class="field">Phone<input class="input" name="phone" inputmode="numeric" maxlength="10" required></label>
        <label class="field full">Address<input class="input" name="address" required></label>
        <label class="field">City<input class="input" name="city" required></label>
        <label class="field">Pincode<input class="input" name="pincode" inputmode="numeric" maxlength="6" required></label>
        <label class="field">State<input class="input" name="state"></label></form><p class="form-error" id="pErr"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="pGo">Save address</button>',
      onMount: (el, close) => el.querySelector('#pGo').addEventListener('click', async () => {
        try { close(await api('/settings/company/pickup', { method: 'POST', body: formData(el.querySelector('#pickupForm')) })); }
        catch (err) { el.querySelector('#pErr').textContent = err.message; }
      }),
    });
    if (added) { toast('Pickup address added'); render(view); }
  });
}

const pickupCards = (list) => list.map((p) => `<div class="action-item" style="align-items:flex-start"><span class="stack"><b style="font-size:14px;color:inherit;min-width:auto">${esc(p.nickname)} ${p.is_primary ? '<span class="badge badge-purple">Primary</span>' : ''}</b>
  <small class="muted">${esc(p.address)}, ${esc(p.city)} ${esc(p.pincode)}</small><small class="muted">${esc(p.phone)}</small></span></div>`).join('');
