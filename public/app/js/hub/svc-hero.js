// The header every Travel & Bills service shares: a back button to Travel & Bills, the service's
// own colour and animated icon, a few promises it keeps, and the offer that applies to it.
import { esc, toast } from '../core.js';
import { tile } from './art.js';
import { icon } from './icons.js';

// How each icon moves in the header illustration.
const MOTION = { plane: 'fly', train: 'drive', bus: 'drive', ride: 'drive', fastag: 'drive', truck: 'drive', bike: 'drive', electric: 'zap', flame: 'flicker', drop: 'drip', wifi: 'pulse', tv: 'pulse', phone: 'ring', coin: 'spin', repeat: 'spin', gift: 'bounce', rupee: 'bounce', hotel: 'bounce', bed: 'bounce', building: 'bounce' };
export const BADGES = {
  travel: ['Best price across providers', 'Instant e-ticket', 'Free cancellation on many'],
  stay: ['Verified properties', 'Pay from wallet', 'Instant confirmation'],
  ride: ['Compare 4 ride apps', 'Upfront fares', 'Live driver tracking'],
  pay: ['Instant confirmation', 'Bharat BillPay secured', 'Paid from your wallet'],
  money: ['Instant transfer', 'No hidden charges', 'PIN protected'],
  service: ['Verified partners', 'Upfront quotes', 'Pay from wallet'],
};

/**
 * opts: { icon, tone, title, intro, back: [label, href], badges: [], offer: { code, text }, action: html }
 */
export function svcHero({ icon: ic, tone = 'green', title, intro, back = ['Travel & Bills', '#/book-pay'], badges = BADGES.pay, offer = null, action = '' }) {
  return `<section class="svh svh--${esc(tone)}">
    <i class="svh__glow" aria-hidden="true"></i>
    <div class="svh__bar"><a class="svh__back" href="${esc(back[1])}">${icon('chevron', 16).replace('class="li"', 'class="li svh__flip"')}${esc(back[0])}</a>${action ? `<div class="svh__act">${action}</div>` : ''}</div>
    <div class="svh__row">
      <div class="svh__t"><h1>${esc(title)}</h1><p>${esc(intro)}</p>
        ${badges.length ? `<ul class="svh__badges">${badges.map((b) => `<li>${icon('check', 13)}${esc(b)}</li>`).join('')}</ul>` : ''}
        ${offer ? `<button type="button" class="svh__offer" data-copy-code="${esc(offer.code)}" title="Copy the code">${icon('tag', 15)}<span><b>${esc(offer.code)}</b> ${esc(offer.text)}</span><em>Copy</em></button>` : ''}</div>
      <div class="svh__art" data-motion="${MOTION[ic] || 'pop'}" aria-hidden="true">
        <i class="svh__orbit"></i><i class="svh__orbit svh__orbit--2"></i>
        <i class="svh__dot svh__dot--a"></i><i class="svh__dot svh__dot--b"></i><i class="svh__dot svh__dot--c"></i>
        <span class="svh__badge">${tile(ic, tone).value}</span>
      </div>
    </div>
  </section>`;
}

// Copy an offer code from any header.
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy-code]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copyCode); toast(`${b.dataset.copyCode} copied. Use it at checkout.`); } catch (x) { toast(`Use code ${b.dataset.copyCode} at checkout.`); }
});
