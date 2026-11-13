// UPI hand-off on phones: open the customer's UPI app with the amount filled in, the way
// Indian checkouts do, instead of waiting on a collect request.
import { esc, money } from '../core.js';

export const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
// Sandbox payee. A live setup would use the merchant VPA from the payment gateway.
const PAYEE = { pa: 'utlog.sandbox@upi', pn: 'UT Log' };
const SCHEME = { 'Google Pay': 'tez://upi/pay', PhonePe: 'phonepe://pay', Paytm: 'paytmmp://pay', 'Amazon Pay': 'upi://pay', BHIM: 'upi://pay' };

export function intentUrl(app, { amount, ref }) {
  // Encoded by hand: Android UPI apps read "+" literally, so spaces must be %20.
  const q = Object.entries({ ...PAYEE, am: Number(amount).toFixed(2), cu: 'INR', tr: ref, tn: `UT Log ${ref}` }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${SCHEME[app] || 'upi://pay'}?${q}`;
}

// The waiting screen for a UPI payment on a phone: one big button that opens the app.
export function intentPanel({ app, amount, ref }) {
  const name = SCHEME[app] ? app : 'your UPI app';
  return `<div class="gateway upi-go"><b translate="no">${esc(money(amount))}</b>
    <a class="btn btn-primary btn-block upi-go__btn" href="${esc(intentUrl(app, { amount, ref }))}">Open ${esc(name)} to pay</a>
    <p>Your UPI app opens with the amount filled in. Approve it there, then come back here.</p>
    <small class="muted mono">${esc(ref)}</small></div>`;
}
