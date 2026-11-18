// How payments are approved: wallet PIN, payment password, a one-time code to the mobile, or this
// device's fingerprint / face lock (WebAuthn). The person picks one in My profile → Security;
// checkout asks for that one and always offers another way.
import { api, esc, money, toast, modal, withBusy } from '../core.js';
import { icon } from './icons.js';

export const METHOD = {
  pin: { label: 'Wallet PIN', sub: '4 digits, like UPI', ico: 'grid' },
  password: { label: 'Payment password', sub: 'Letters and numbers', ico: 'key' },
  otp: { label: 'One-time code', sub: 'Sent to your mobile each time', ico: 'chat' },
  device: { label: 'Fingerprint or face', sub: "This device's screen lock", ico: 'shield' },
};
export const SKIP = [[0, 'Always ask'], [100, 'Under ₹100'], [200, 'Under ₹200'], [500, 'Under ₹500']];

// ---- this device's screen lock (WebAuthn) -------------------------------------------------------
export const deviceOk = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
export const deviceName = () => { const ua = navigator.userAgent; return /Android/.test(ua) ? 'Android phone' : /iPhone|iPad/.test(ua) ? 'iPhone or iPad' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'This device'; };
export async function registerDevice(name) {
  const cred = await navigator.credentials.create({ publicKey: { challenge: rand(32), rp: { name: 'UT Log' }, user: { id: rand(16), name: name || 'UT Log', displayName: name || 'UT Log' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
  const key = cred.response.getPublicKey ? cred.response.getPublicKey() : null;
  if (!key) throw new Error('This browser cannot share the device key. Update it, or use PIN or OTP.');
  return { id: b64(cred.rawId), public_key: b64(key), alg: cred.response.getPublicKeyAlgorithm ? cred.response.getPublicKeyAlgorithm() : -7 };
}
// Signs the server's challenge; the server checks the signature with the key saved when adding.
export async function checkDevice(challenge, id) {
  const a = await navigator.credentials.get({ publicKey: { challenge: unb64(challenge), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60000 } });
  return { credential_id: b64(a.rawId), client_data: b64(a.response.clientDataJSON), authenticator_data: b64(a.response.authenticatorData), signature: b64(a.response.signature) };
}

// ---- settings card: pick the method and set it up ----------------------------------------------------
export async function mountPayApproval(el) {
  if (!el) return;
  let a;
  try { a = await api('/hub/wallet/auth'); } catch (e) { el.innerHTML = `<p class="muted notop">${esc(e.message)}</p>`; return; }
  const ready = { pin: a.pin_set, password: a.password_set, otp: !!a.mobile, device: !!a.device };
  const setupLabel = { pin: a.pin_set ? 'Change' : 'Set PIN', password: a.password_set ? 'Change' : 'Set password', otp: '', device: a.device ? 'Remove' : 'Add this device' };
  const detail = { pin: a.pin_set ? 'Set' : 'Not set yet', password: a.password_set ? 'Set' : 'Not set yet', otp: a.mobile ? `Sent to ${a.mobile}` : 'Add a mobile number first', device: a.device ? `${a.device.label} · added` : deviceOk() ? 'Not added yet' : 'Not supported in this browser' };
  el.innerHTML = `<p class="muted small notop">Every wallet and credit payment needs your approval. Pick the way you prefer; checkout always lets you use another way.</p>
    <div class="pa-grid" role="radiogroup" aria-label="Approve payments with">${Object.entries(METHOD).map(([k, m]) => `<div class="pa ${a.method === k ? 'on' : ''} ${ready[k] ? '' : 'is-unset'}"><label class="pa__pick"><input type="radio" name="pa" value="${k}" ${a.method === k ? 'checked' : ''} ${ready[k] ? '' : 'disabled'}><span class="pa__ico">${icon(m.ico, 20)}</span><span class="grow"><b>${m.label}</b><small>${esc(detail[k])}</small></span>${a.method === k ? '<em class="pa__on">In use</em>' : ''}</label>${setupLabel[k] && (k !== 'device' || deviceOk() || a.device) ? `<button class="link pa__set" type="button" data-setup="${k}">${setupLabel[k]}</button>` : ''}</div>`).join('')}</div>
    <label class="field pa-skip">Skip approval for small payments<select class="select" id="paSkip">${SKIP.map(([v, l]) => `<option value="${v}" ${a.skip_under === v ? 'selected' : ''}>${l}</option>`).join('')}</select><small class="muted">Like UPI Lite: small payments go through without asking. Credit payments are always approved.</small></label>
    ${a.locked_until ? `<p class="callout">Approvals are locked after too many wrong tries, until ${esc(new Date(a.locked_until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))}.</p>` : ''}`;
  const again = () => mountPayApproval(el);
  el.onchange = async (e) => {
    try {
      if (e.target.name === 'pa') { await api('/hub/wallet/auth/method', { method: 'POST', body: { method: e.target.value } }); toast(`Payments are now approved with: ${METHOD[e.target.value].label}`); }
      if (e.target.id === 'paSkip') { await api('/hub/wallet/auth/method', { method: 'POST', body: { skip_under: Number(e.target.value) } }); toast(Number(e.target.value) ? `No approval needed under ₹${e.target.value}` : 'Every payment will ask for approval'); }
      again();
    } catch (x) { toast(x.message, true); again(); }
  };
  el.onclick = async (e) => {
    const b = e.target.closest('[data-setup]'); if (!b) return;
    const k = b.dataset.setup;
    if (k === 'device') {
      if (a.device) { await api('/hub/wallet/device/remove', { method: 'POST' }); toast('This device was removed'); return again(); }
      return withBusy(b, async () => {
        try { const d = await registerDevice(deviceName()); await api('/hub/wallet/device', { method: 'POST', body: { credential_id: d.id, public_key: d.public_key, alg: d.alg, label: deviceName() } }); await api('/hub/wallet/auth/method', { method: 'POST', body: { method: 'device' } }); toast('Fingerprint or face approval is on'); again(); }
        catch (x) { toast(x.name === 'NotAllowedError' ? 'The device check was cancelled.' : x.message || 'This device could not be added.', true); }
      });
    }
    if (k === 'pin') return modal({
      title: a.pin_set ? 'Change wallet PIN' : 'Set a wallet PIN',
      body: `<form class="form-grid" id="pnF" novalidate>${a.pin_set ? '<label class="field full">Current PIN<input class="input" type="password" name="current" inputmode="numeric" maxlength="4" autocomplete="off"></label>' : ''}<label class="field">New PIN<input class="input" type="password" name="pin" inputmode="numeric" maxlength="4" autocomplete="off"></label><label class="field">Repeat<input class="input" type="password" name="again" inputmode="numeric" maxlength="4" autocomplete="off"></label></form><p class="muted small">Avoid 1234 or repeated digits.</p><p class="form-error" id="pnE"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="pnGo">Save</button>',
      onMount(m, close) { m.querySelector('#pnGo').addEventListener('click', async () => { const f = m.querySelector('#pnF'); if (f.pin.value !== f.again.value) { m.querySelector('#pnE').textContent = 'The PINs do not match.'; return; } try { await api('/hub/wallet/pin', { method: 'POST', body: { pin: f.pin.value, current: f.current ? f.current.value : undefined } }); close(true); toast('Wallet PIN saved'); again(); } catch (x) { m.querySelector('#pnE').textContent = x.message; } }); },
    });
    if (k === 'password') return modal({
      title: a.password_set ? 'Change payment password' : 'Set a payment password',
      body: `<form class="form-grid" id="pwP" novalidate>${a.password_set ? '<label class="field full">Current password<input class="input" type="password" name="current" autocomplete="off"></label>' : ''}<label class="field">New password<input class="input" type="password" name="password" autocomplete="new-password"></label><label class="field">Repeat<input class="input" type="password" name="again" autocomplete="new-password"></label></form><p class="muted small">At least 6 characters, with a letter and a number. This is separate from your sign-in.</p><p class="form-error" id="pwE"></p>`,
      footer: '<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="pwGo">Save</button>',
      onMount(m, close) { m.querySelector('#pwGo').addEventListener('click', async () => { const f = m.querySelector('#pwP'); if (f.password.value !== f.again.value) { m.querySelector('#pwE').textContent = 'The passwords do not match.'; return; } try { await api('/hub/wallet/password', { method: 'POST', body: { password: f.password.value, current: f.current ? f.current.value : undefined } }); close(true); toast('Payment password saved'); again(); } catch (x) { m.querySelector('#pwE').textContent = x.message; } }); },
    });
  };
}
export const moneyText = (n) => money(n);
