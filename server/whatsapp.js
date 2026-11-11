// WhatsApp Business Cloud API adapter. With WHATSAPP_TOKEN and WHATSAPP_PHONE_ID set it
// sends real messages; without them every send is simulated and nothing leaves the server.
// Business-initiated messages must use templates approved in Meta Business Manager, so
// create the templates below there with the same names and placeholders.
'use strict';
const crypto = require('crypto');

const TEMPLATES = {
  ut_booking_confirmed: 'Hi {{1}}, your booking {{2}} with {{3}} is confirmed. Track it here: {{4}}',
  ut_driver_assigned: 'Hi {{1}}, {{2}} is assigned to booking {{3}}. Track it here: {{4}}',
  ut_picked_up: 'Hi {{1}}, booking {{2}} has been picked up by {{3}}. Track it here: {{4}}',
  ut_out_for_delivery: 'Hi {{1}}, booking {{2}} is out for delivery. Please keep your OTP ready. Track it here: {{3}}',
  ut_delivered: 'Hi {{1}}, booking {{2}} has been delivered by {{3}}. Thank you for using UT Log.',
  ut_delayed: 'Hi {{1}}, booking {{2}} with {{3}} is running late. We are following it up. Track it here: {{4}}',
  ut_cancelled: 'Hi {{1}}, booking {{2}} has been cancelled.',
  ut_payment_due: 'Hi {{1}}, your {{2}} payment of {{3}} is due on {{4}}.',
  ut_wallet_low: 'Hi {{1}}, your UT Log wallet balance is low at {{2}}. Add money to keep prepaid bookings running.',
  ut_invoice_ready: 'Hi {{1}}, your consolidated GST invoice {{2}} for {{3}} is ready. Amount: {{4}}.',
};

const version = () => process.env.WHATSAPP_API_VERSION || 'v24.0';
const isLive = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
const status = () => ({ mode: isLive() ? 'live' : 'simulated', api_version: version(), webhook_ready: !!(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET) });
const toE164 = (n) => (/^[6-9]\d{9}$/.test(n) ? `91${n}` : String(n).replace(/\D/g, ''));
const render = (name, params) => TEMPLATES[name].replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? '');
const simId = () => `sim.${crypto.randomBytes(6).toString('hex')}`;

async function post(payload) {
  const res = await fetch(`https://graph.facebook.com/${version()}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }), signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `WhatsApp returned ${res.status}`);
  return data.messages && data.messages[0] && data.messages[0].id;
}
async function sendTemplate(to, name, params, lang = 'en') {
  if (!isLive()) return { id: simId(), mode: 'simulated' };
  const id = await post({ to: toE164(to), type: 'template', template: { name, language: { code: lang }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }] } });
  return { id, mode: 'live' };
}
// Free-form replies are only allowed within 24 hours of the customer's last message.
async function sendText(to, body, { simulate } = {}) {
  if (simulate || !isLive()) return { id: simId(), mode: 'simulated' };
  return { id: await post({ to: toE164(to), type: 'text', text: { body } }), mode: 'live' };
}
// Meta signs the raw body with the app secret.
function verifySignature(raw, header) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`);
  const got = Buffer.from(String(header));
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

module.exports = { TEMPLATES, status, render, sendTemplate, sendText, verifySignature, isLive };
