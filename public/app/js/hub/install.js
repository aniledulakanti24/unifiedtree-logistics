// Install UT Log like an app: the browser's install prompt where it exists (Android, desktop
// Chrome and Edge), and Add to Home Screen steps on iPhone. Shown on phones, never more than
// once every two weeks, and never in the installed app itself.
import { esc, toast, modal } from '../core.js';
import { icon } from './icons.js';

let deferred = null;
const KEY = 'ut-install';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...v })); } catch (e) { /* private mode */ } };
export const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
const phone = () => matchMedia('(max-width: 900px)').matches;
export const canInstall = () => !installed() && (!!deferred || ios());

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('ut:installable')); });
window.addEventListener('appinstalled', () => { deferred = null; write({ done: true }); document.querySelector('.inst')?.remove(); toast('UT Log is on your home screen'); });

export async function install() {
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome !== 'accepted') write({ later: Date.now() });
    document.querySelector('.inst')?.remove();
    return;
  }
  if (ios()) {
    modal({
      title: 'Add UT Log to your home screen',
      body: `<ol class="inst-steps"><li><span>1</span>Tap <b>Share</b> ${icon('share', 16)} at the bottom of Safari.</li><li><span>2</span>Scroll and tap <b>Add to Home Screen</b>.</li><li><span>3</span>Tap <b>Add</b>. UT Log opens full screen, like an app.</li></ol>`,
      footer: '<button class="btn btn-primary btn-block" data-close>Got it</button>',
    });
    return;
  }
  toast('Use your browser menu and choose Install app or Add to home screen.');
}

// A small card above the bottom tabs, on phones only, after the person has used the app a little.
export function maybeOffer() {
  const s = read();
  const visits = (s.visits || 0) + 1;
  write({ visits });
  const show = () => {
    if (!phone() || !canInstall() || s.done || (s.later && Date.now() - s.later < 14 * 864e5) || visits < 2 || document.querySelector('.inst')) return;
    const el = document.createElement('div');
    el.className = 'inst';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Install UT Log');
    el.innerHTML = `<img src="icon-192.png" alt="" width="40" height="40"><div class="grow"><b>Get the UT Log app</b><small>Faster bookings, opens full screen, works on weak signal.</small></div><button class="btn btn-primary btn-sm" type="button" data-inst>${esc(ios() ? 'How' : 'Install')}</button><button class="icon-btn" type="button" data-later aria-label="Not now">${icon('x', 18)}</button>`;
    el.addEventListener('click', (e) => { if (e.target.closest('[data-inst]')) install(); if (e.target.closest('[data-later]')) { write({ later: Date.now() }); el.remove(); } });
    document.body.appendChild(el);
  };
  setTimeout(show, 2500);
  window.addEventListener('ut:installable', () => setTimeout(show, 500), { once: true });
}
