// Small flat clipart for the Wallet page. Original drawings; the moving parts carry classes
// that crm.css animates (and stops for people who prefer reduced motion).
const svg = (body, cls = '', vb = '0 0 120 100') => `<svg class="wa ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const shadow = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="4" fill="#0f2925" opacity=".08"/>`;

export const ART = {
  // A green wallet with coins popping out of it.
  wallet: svg(`${shadow(60, 92, 40)}
    <g class="wa-coin wa-coin--1"><circle cx="46" cy="24" r="11" fill="#f5b301"/><circle cx="46" cy="24" r="7.5" fill="none" stroke="#ffe08a" stroke-width="2"/><path d="M42.5 20.5h7M42.5 23.5h7M46.5 29.5l-4-4h1.8a2.8 2.8 0 0 0 0-5.6" stroke="#8a5a00" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
    <g class="wa-coin wa-coin--2"><circle cx="70" cy="16" r="9" fill="#ffc933"/><circle cx="70" cy="16" r="6" fill="none" stroke="#fff1bf" stroke-width="1.8"/></g>
    <rect x="18" y="34" width="80" height="54" rx="12" fill="#0e7c66"/>
    <rect x="18" y="34" width="80" height="16" rx="8" fill="#12957a"/>
    <path d="M24 38h56l8-10H32z" fill="#f2fbf7" opacity=".95"/>
    <rect x="72" y="54" width="32" height="20" rx="8" fill="#0b5f4f"/><circle cx="83" cy="64" r="4.5" fill="#f5b301"/>
    <path d="M26 80h30" stroke="#7FD6BF" stroke-width="3" stroke-linecap="round" opacity=".7"/>`),

  // A piggy bank with a coin dropping in.
  in: svg(`${shadow(60, 92, 36)}
    <g class="wa-drop"><circle cx="62" cy="14" r="8" fill="#f5b301"/><circle cx="62" cy="14" r="5" fill="none" stroke="#ffe08a" stroke-width="1.6"/></g>
    <rect x="54" y="30" width="16" height="4" rx="2" fill="#c2577f"/>
    <ellipse cx="60" cy="58" rx="38" ry="27" fill="#f48fb1"/>
    <ellipse cx="50" cy="49" rx="14" ry="8" fill="#fbc6d8" opacity=".8"/>
    <circle cx="96" cy="58" r="10" fill="#f06292"/><circle cx="93" cy="56" r="1.8" fill="#8a2f52"/><circle cx="99" cy="56" r="1.8" fill="#8a2f52"/>
    <path d="M36 36l8 10h-12z" fill="#f06292"/>
    <circle cx="80" cy="48" r="3" fill="#2d2a32"/>
    <rect x="34" y="78" width="10" height="12" rx="4" fill="#f06292"/><rect x="72" y="78" width="10" height="12" rx="4" fill="#f06292"/>
    <path d="M22 56c-8-2-8-10-2-10" stroke="#f06292" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="wa-arrow" d="M14 20v16m-6-6 6 6 6-6" stroke="#2fb37a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),

  // A shopping bag with a receipt sliding out.
  out: svg(`${shadow(60, 92, 34)}
    <g class="wa-receipt"><path d="M66 10h28v34l-4.6-3-4.6 3-4.6-3-4.6 3-4.6-3-5 3z" fill="#fff" stroke="#e1e8e5" stroke-width="1.5"/><rect x="71" y="17" width="16" height="3" rx="1.5" fill="#cfe7df"/><rect x="71" y="24" width="12" height="3" rx="1.5" fill="#e6f2ee"/><rect x="71" y="31" width="18" height="3" rx="1.5" fill="#e6f2ee"/></g>
    <path d="M26 38h60l6 50H20z" fill="#2a78d6"/>
    <path d="M26 38h60l2 10H24z" fill="#1f63b8"/>
    <path d="M42 46V34a14 14 0 0 1 28 0v12" stroke="#0b2347" stroke-width="4" fill="none" stroke-linecap="round"/>
    <rect x="36" y="58" width="40" height="18" rx="6" fill="#9cc4ff" opacity=".45"/>
    <path d="M48 67h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <path class="wa-arrow wa-arrow--up" d="M104 40V22m-6 6 6-6 6 6" stroke="#eb6834" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),

  // A trophy with sparkles.
  points: svg(`${shadow(60, 92, 30)}
    <path class="wa-spark" d="M22 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#f5b301"/>
    <path class="wa-spark wa-spark--2" d="M98 14l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#a99cf5"/>
    <path class="wa-spark wa-spark--3" d="M102 58l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#f5b301"/>
    <path d="M38 22h44v18a22 22 0 0 1-44 0z" fill="#f5b301"/>
    <path d="M38 26H26a10 10 0 0 0 12 16M82 26h12a10 10 0 0 1-12 16" stroke="#f5b301" stroke-width="5" fill="none"/>
    <path d="M46 24v14a14 14 0 0 0 6 12" stroke="#ffe08a" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>
    <rect x="54" y="60" width="12" height="14" fill="#c98a00"/>
    <rect x="40" y="74" width="40" height="12" rx="4" fill="#6250d6"/>
    <path d="M60 30l3.200 6.500 7 1-5.100 5 1.200 7-6.300-3.300-6.300 3.300 1.200-7-5.100-5 7-1z" fill="#fff6d1"/>`),

  // A battery charging with a bolt, for auto top-up.
  auto: svg(`<rect x="22" y="30" width="70" height="40" rx="10" fill="#e3f5ee" stroke="#0e7c66" stroke-width="4"/>
    <rect x="92" y="42" width="8" height="16" rx="3" fill="#0e7c66"/>
    <rect class="wa-charge" x="28" y="36" width="58" height="28" rx="6" fill="#2fb37a"/>
    <path class="wa-bolt" d="M60 34 48 54h10l-4 14 14-22H58z" fill="#f5b301" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`, 'wa--sm'),

  // How payment works: wallet, cash hand-off and a refund arrow.
  prepaid: svg(`<rect x="14" y="26" width="72" height="50" rx="12" fill="#0e7c66"/><rect x="14" y="26" width="72" height="14" rx="7" fill="#12957a"/><rect x="64" y="44" width="28" height="18" rx="7" fill="#0b5f4f"/><circle cx="74" cy="53" r="4" fill="#f5b301"/>`, 'wa--xs', '0 0 100 100'),
  cod: svg(`<rect x="12" y="30" width="76" height="42" rx="8" fill="#2fb37a"/><rect x="18" y="36" width="64" height="30" rx="5" fill="none" stroke="#e3f5ee" stroke-width="2"/><circle cx="50" cy="51" r="10" fill="#e3f5ee"/><path d="M46 47h8M46 51h8M50.5 57l-4-4h1.8a2.6 2.6 0 0 0 0-5.200" stroke="#0b7a62" stroke-width="1.8" fill="none" stroke-linecap="round"/>`, 'wa--xs', '0 0 100 100'),
  refund: svg(`<circle cx="50" cy="50" r="34" fill="#e6f0fb"/><path d="M34 46a18 18 0 1 1 4 18" stroke="#2a78d6" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M26 40l8 8 8-9" stroke="#2a78d6" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="54" cy="50" r="8" fill="#f5b301"/>`, 'wa--xs', '0 0 100 100'),

  // A gift box with a bouncing lid, for coupons.
  gift: svg(`${shadow(60, 92, 32)}
    <rect x="28" y="46" width="64" height="42" rx="6" fill="#d14f82"/>
    <rect x="54" y="46" width="12" height="42" fill="#f5b301"/>
    <g class="wa-lid"><rect x="22" y="34" width="76" height="16" rx="5" fill="#e86a9a"/><rect x="54" y="34" width="12" height="16" fill="#ffc933"/>
      <path d="M60 34c-10-14-26-10-20-2 4 5 14 3 20 2zM60 34c10-14 26-10 20-2-4 5-14 3-20 2z" fill="#f5b301"/></g>
    <path class="wa-spark" d="M100 20l1.600 4 4 1.600-4 1.600-1.600 4-1.600-4-4-1.600 4-1.600z" fill="#f5b301"/>
    <path class="wa-spark wa-spark--2" d="M18 24l1.200 3 3 1.200-3 1.200-1.200 3-1.200-3-3-1.200 3-1.200z" fill="#a99cf5"/>`),

  // A medal for membership tiers; the ribbon colour follows the tier.
  medal: (tone = '#9aa7a2', face = '#d9e1de') => svg(`<path d="M34 6h16l10 26-10 6z" fill="#2a78d6"/><path d="M66 6H50l-10 26 10 6z" fill="#eb6834"/>
    <circle cx="50" cy="60" r="28" fill="${tone}"/><circle cx="50" cy="60" r="21" fill="${face}"/>
    <path d="M50 46l4.200 8.600 9.400 1.400-6.800 6.600 1.600 9.300-8.400-4.400-8.400 4.400 1.600-9.300-6.800-6.600 9.400-1.400z" fill="${tone}"/>`, 'wa--xs', '0 0 100 100'),

  // Nothing to show yet.
  empty: svg(`${shadow(60, 92, 34)}<rect x="26" y="34" width="68" height="48" rx="12" fill="#e3f5ee" stroke="#bfe3d6" stroke-width="2"/><rect x="26" y="34" width="68" height="14" rx="7" fill="#cfeee3"/><rect x="72" y="52" width="26" height="16" rx="6" fill="#bfe3d6"/><path class="wa-spark" d="M60 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#f5b301"/>`),
};
