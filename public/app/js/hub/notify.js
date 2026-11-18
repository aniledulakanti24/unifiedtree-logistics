// Order alerts on this device, like a native app: when a delivery changes stage (driver assigned,
// picked up, out for delivery, delivered), the phone shows a notification and buzzes. Uses the
// browser's notifications through the service worker; checks every 30 seconds while the app is open.
import { api } from '../core.js';

const KEY = 'ut-order-status';
const SHIP = ['vehicle', 'courier', 'logistics', 'international'];
let timer = null;
const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const alertsState = () => (!supported() ? 'unsupported' : Notification.permission); // granted | denied | default

async function show(title, body, url, tag) {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, data: { url }, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [60, 40, 60] });
  } catch (e) { try { new Notification(title, { body, tag, icon: 'icon-192.png' }); } catch (x) { /* not allowed */ } }
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
}

async function check() {
  let r;
  try { r = await api('/hub/orders', { query: { per_page: 30 } }); } catch (e) { return; }
  const raw = localStorage.getItem(KEY);
  let seen = {}; try { seen = JSON.parse(raw) || {}; } catch (e) { seen = {}; }
  const first = raw === null; // only the very first check just records what is there
  const next = {};
  for (const o of (r.data || []).filter((x) => SHIP.includes(x.section) && x.booking_id)) {
    const st = `${o.status}|${o.label || ''}`;
    next[o.id] = st;
    if (!first && seen[o.id] && seen[o.id] !== st && o.status !== 'CANCELLED') show(o.label || 'Order update', `${o.provider} · ${o.sub || o.title}`, `./#/my/orders/${o.id}`, o.id);
  }
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
}

export function startOrderAlerts() {
  if (timer || alertsState() !== 'granted') return;
  check(); timer = setInterval(check, 30000);
}
export async function askAlerts() {
  if (!supported()) return 'unsupported';
  const p = await Notification.requestPermission();
  if (p === 'granted') { startOrderAlerts(); show('Order alerts are on', 'We will tell you when your driver is assigned, picks up and delivers.', './#/my/orders', 'ut-alerts-on'); }
  return p;
}
