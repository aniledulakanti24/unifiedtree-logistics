// Original two-tone clip-art icons and scene illustrations for the dashboard.
// Icons take their colours from --a and --b, so one drawing works on the dark
// sidebar, on tinted tiles and in forms.
import { raw } from '../core.js';

const A = (d) => `<path class="a" d="${d}"/>`;
const B = (d) => `<path class="b" d="${d}"/>`;
const S = (d) => `<path class="s" d="${d}"/>`;
const circA = (x, y, r) => `<circle class="a" cx="${x}" cy="${y}" r="${r}"/>`;
const circB = (x, y, r) => `<circle class="b" cx="${x}" cy="${y}" r="${r}"/>`;

const DUO = {
  home: A('M12 2.6 2.4 10.4a1 1 0 0 0 .63 1.78H4.6V20a1.5 1.5 0 0 0 1.5 1.5h11.8a1.5 1.5 0 0 0 1.5-1.5v-7.82h1.57a1 1 0 0 0 .63-1.78z') + B('M9.5 21.5v-6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6z'),
  dashboard: A('M3 21h18v-1.8H3z') + B('M4.5 12.5h3.4v5.2H4.5zM10.3 8.4h3.4v9.3h-3.4z') + A('M16.1 4.2h3.4v13.5h-3.4z'),
  bike: circA(5.5, 17, 3.6) + circA(18.5, 17, 3.6) + B('M4 11.3h6.2l2.3 3.5h3l2.3-5h-2.4V8h3.3c.6 0 1 .6.8 1.2l-2.8 6.9H11.700L9.400 13H5.200z') + B('M8 7.500h4.200v2H8z'),
  auto: B('M3 12.500V9.800C3 6.800 5.400 4.500 8.400 4.500h6.700c1.100 0 2.100.6 2.600 1.600l2.900 6.400z') + A('M5.400 10.300V9.500c0-1.500 1.200-2.700 2.700-2.700h3.200v3.500zM13.100 6.800h1.700c.5 0 .9.300 1.100.7l1.300 2.800h-4.100zM2.500 12.500h17.400l1.600 2.300V17h-1.300a2.700 2.700 0 0 0-5.200 0H9.300a2.700 2.700 0 0 0-5.200 0H2.500z') + circA(6.700, 17.600, 2.300) + circA(17.300, 17.600, 2.300) + circB(6.700, 17.600, .9) + circB(17.300, 17.600, .9),
  temple: A('M12 2.500 14 6h-4zM4 10.500h16L18.500 7h-13zM5.500 10.500h13V21h-13z') + B('M10 14a2 2 0 0 1 4 0v7h-4zM3 21h18v1.500H3z'),
  coin: circB(12, 12, 9.500) + circA(12, 12, 7) + B('M9.200 8.300h5.600M9.200 10.600h5.600M13.600 15.800 9.600 12h1.400a2.600 2.600 0 0 0 0-3.700'),
  van: A('M1.800 6.500A1.500 1.500 0 0 1 3.300 5h10.900v11.800H1.800z') + B('M14.200 8.500h3.900c.5 0 .9.200 1.200.6l2.700 3.500c.2.300.3.600.3 1v3.200h-8.100z') + circA(6.500, 18, 2.500) + circA(17.500, 18, 2.500),
  parcel: A('M12 2 3 6.300v11.400L12 22l9-4.300V6.300z') + B('M12 11.100 3.600 6.800 12 2.700l8.400 4.100zM8.300 4.800l8.300 4.200v3.300l-2.100 1V10.100L6.200 5.900z'),
  truck: A('M1.500 5.500h12.800v11.300H1.500z') + B('M14.300 9h4.200l3.500 3.900v3.900h-7.700z') + circA(6, 18, 2.600) + circA(17.700, 18, 2.600),
  globe: circA(12, 12, 10) + B('M12 2c-1.500 1.100-2.200 2.300-1.500 3.800.5 1.100 2.300.8 2.700 2 .4 1.300-1.800 1.900-3.300 1.900-1.900 0-3.900.6-3.900 2.300 0 1.900 2.500 2.100 3.400 3.300.7 1 .2 3 1.600 4.700 3.500-.2 8-2.700 9-8 .1-1.300-1.400-.7-2.600-1.400-.9-.6-.1-2.700-1.200-3.600C14.800 5.800 15.300 3 12 2z'),
  plane: A('M21.500 2.500c-1-1-2.700-.7-3.800.4l-3.400 3.400L4.700 3.600 3 5.300l7.800 4.600-3.600 3.800-3-.6L3 14.300l4 2.700 2.700 4 1.200-1.200-.6-3 3.800-3.600 4.600 7.800 1.700-1.700-2.700-9.600 3.400-3.400c1.100-1.100 1.400-2.800.4-3.800z') + B('m10.800 9.900 3.300 3.400-4.400 3.800-2.900-2.900z'),
  bus: A('M4 4.800A2.800 2.800 0 0 1 6.800 2h10.400A2.800 2.800 0 0 1 20 4.800V18H4z') + B('M6 5.500h12v6.300H6z') + circA(7.800, 15, 1.300) + `<circle class="b" cx="7.800" cy="15" r="1.300"/><circle class="b" cx="16.200" cy="15" r="1.300"/>` + A('M5.500 18h3.200v2.400a1 1 0 0 1-1 1H6.500a1 1 0 0 1-1-1zM15.300 18h3.200v2.400a1 1 0 0 1-1 1h-1.200a1 1 0 0 1-1-1z'),
  hotel: A('M4 3.500A1.500 1.500 0 0 1 5.500 2h13A1.500 1.500 0 0 1 20 3.500V22H4z') + B('M7 5.500h3v3H7zM14 5.500h3v3h-3zM7 11h3v3H7zM14 11h3v3h-3zM10 17h4v5h-4z'),
  bed: A('M2 5h2.200v8H22v7h-2.200v-2.800H4.200V20H2z') + B('M9.500 8h9A3.500 3.500 0 0 1 22 11.500V13H9.500z') + circB(6.600, 9.800, 2),
  ride: A('M4.500 11 6.300 5.700A2.500 2.500 0 0 1 8.700 4h6.600a2.500 2.500 0 0 1 2.400 1.700L19.500 11c1.400.3 2.500 1.500 2.500 3v4.500H2V14c0-1.500 1.100-2.700 2.500-3z') + B('M7 10.800 8.200 7a1 1 0 0 1 1-.7h5.600a1 1 0 0 1 1 .7l1.200 3.800z') + `<circle class="b" cx="6.300" cy="14.700" r="1.500"/><circle class="b" cx="17.700" cy="14.700" r="1.500"/>` + A('M4 18.500h3.200V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM16.800 18.500H20V20a1 1 0 0 1-1 1h-1.200a1 1 0 0 1-1-1z'),
  phone: A('M6 3.800A2.800 2.800 0 0 1 8.800 1h6.400A2.800 2.800 0 0 1 18 3.800v16.400a2.800 2.800 0 0 1-2.800 2.800H8.800A2.800 2.800 0 0 1 6 20.200z') + B('M8 4h8v14H8z') + `<path class="a" d="m12.800 6.500-3.300 5.200h2.200l-.6 3.800 3.400-5.300h-2.300z"/>`,
  fastag: A('M3 5.500A2.500 2.500 0 0 1 5.500 3h13A2.500 2.500 0 0 1 21 5.500v13a2.500 2.500 0 0 1-2.500 2.500h-13A2.500 2.500 0 0 1 3 18.500z') + B('M6.500 7h3v3h-3zM6.500 11.500h3v3h-3zM6.500 16h3v1.500h-3zM11.500 7h6v1.800h-6zM11.500 10.500h6v1.800h-6zM11.500 14h3.500v3.500h-3.500z'),
  bill: A('M5 2h14v20l-2.300-1.500L14.300 22 12 20.500 9.700 22l-2.400-1.500L5 22z') + B('M8 6.500h8v1.800H8zM8 10.500h8v1.800H8zM8 14.500h4.500v1.800H8z'),
  briefcase: A('M2.500 8.500A2 2 0 0 1 4.500 6.500h15a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z') + B('M8.500 6.500V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.500h-2V5h-3v1.500zM2.500 12.500h19v2h-19z') + circA(12, 13.500, 1.800),
  repeat: A('M17.500 2.500 22 6.500l-4.500 4V7.900H8a3 3 0 0 0-3 3v1.500H2.500v-1.500A5.500 5.500 0 0 1 8 5.300h9.500z') + B('M6.500 21.500 2 17.500l4.500-4v2.600H16a3 3 0 0 0 3-3v-1.500h2.500v1.500a5.500 5.500 0 0 1-5.500 5.600H6.500z'),
  wallet: A('M2.500 7A2.500 2.500 0 0 1 5 4.500h13.500V8H21a1 1 0 0 1 1 1v10.500a1 1 0 0 1-1 1H5A2.500 2.500 0 0 1 2.500 18z') + B('M15.500 12h6.500v4.500h-6.500a2.250 2.250 0 0 1 0-4.500z') + circA(16, 14.250, 1),
  list: A('M4 2h16a1.500 1.500 0 0 1 1.500 1.500v17A1.500 1.500 0 0 1 20 22H4a1.500 1.500 0 0 1-1.500-1.500v-17A1.500 1.500 0 0 1 4 2z') + B('M6 6h2.500v2.500H6zM10.500 6.300H18V8.300h-7.500zM6 11h2.500v2.500H6zM10.500 11.300H18v2h-7.500zM6 16h2.500v2.500H6zM10.500 16.300H18v2h-7.500z'),
  tools: A('M20.800 6.300 17.500 9.500l-3-3 3.200-3.300a5.500 5.500 0 0 0-7 7L3 18a2.100 2.100 0 0 0 3 3l7.800-7.700a5.500 5.500 0 0 0 7-7z') + circB(5, 19, 1),
  pin: A('M12 1.800a8 8 0 0 0-8 8c0 5.500 6.300 11.300 7.300 12.200a1 1 0 0 0 1.400 0c1-.9 7.300-6.700 7.300-12.200a8 8 0 0 0-8-8z') + circB(12, 9.800, 3.200),
  flag: A('M5 2h2v20H5z') + B('M7 3.500h12.500l-2.800 4.500 2.800 4.500H7z'),
  rupee: A('M6 3h12v2.200h-4.100c.8.700 1.300 1.600 1.600 2.600H18V10h-2.500c-.5 3-2.800 4.900-6 5.100l6.100 6H12.500L6 14.800V13h3.100c2.200 0 3.700-1.100 4.100-3H6V7.800h7.200C12.800 6.300 11.300 5.200 9.100 5.200H6z'),
  scale: A('M5 8.500h14l2.500 12a1 1 0 0 1-1 1.200h-17a1 1 0 0 1-1-1.200z') + circB(12, 6, 3.800) + `<circle class="a" cx="12" cy="6" r="1.400"/>`,
  ruler: A('M2 15.500 15.500 2 22 8.500 8.500 22z') + B('M7.500 11.500l2.300 2.300 1-1-2.300-2.300zM11 8l2.300 2.300 1-1L12 7zM14.500 4.500l2.300 2.300 1-1-2.300-2.300z'),
  box2: A('M3 7h18v13.500a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z') + B('M2 3.500h20V7H2zM9 11h6v2H9z'),
  cash: A('M1.500 6h21v12h-21z') + circB(12, 12, 3.300) + B('M4 8.500h2v2H4zM18 13.500h2v2h-2z'),
  user: circA(12, 7.500, 5) + B('M3 22c0-5 4-8.500 9-8.500s9 3.500 9 8.500z'),
  shield: A('M12 1.800 3.500 5v6.500c0 5 3.600 9.200 8.500 10.700 4.900-1.500 8.500-5.700 8.500-10.700V5z') + B('m10.800 15.700-3.700-3.600 1.500-1.500 2.200 2.100 4.700-4.700 1.500 1.500z'),
  bell: A('M12 2a7 7 0 0 0-7 7v4.500L3 17v1.500h18V17l-2-3.500V9a7 7 0 0 0-7-7z') + B('M9 19.500h6a3 3 0 0 1-6 0z'),
  bank: A('M12 1.800 2 7.500v2h20v-2z') + B('M4.500 10.500h3v7h-3zM10.500 10.500h3v7h-3zM16.500 10.500h3v7h-3z') + A('M2.500 18.500h19V22h-19z'),
  plug: A('M8 2h2.200v5.500H8zM13.800 2H16v5.500h-2.200z') + B('M5 7.500h14V12a7 7 0 0 1-14 0z') + A('M10.800 18h2.400v4h-2.400z'),
  help: circA(12, 12, 10) + `<path class="b" d="M12 5.800c-2.400 0-4.100 1.400-4.300 3.600h2.300c.1-1 .9-1.600 2-1.600 1 0 1.800.7 1.800 1.600 0 .8-.4 1.200-1.300 1.800-1.200.8-1.700 1.600-1.700 3v.5h2.300v-.3c0-.9.300-1.300 1.300-1.900 1.200-.8 1.800-1.800 1.800-3.200 0-2-1.800-3.500-4.200-3.500z"/><circle class="b" cx="12" cy="17.500" r="1.300"/>`,
  gift: A('M3 11h18v10.500H3z') + B('M2 7h20v4H2zM10.500 7h3v14.500h-3z') + B('M12 7C9 7 6.500 6 6.500 4c0-1.200 1-2 2.300-2C10.500 2 12 4 12 7zm0 0c3 0 5.500-1 5.500-3 0-1.200-1-2-2.300-2C13.500 2 12 4 12 7z'),
  team: circA(8.500, 8, 4) + B('M1.500 21c0-4.200 3-7 7-7s7 2.800 7 7z') + circA(17.500, 9, 3) + B('M17 21c0-2.700-.8-4.900-2.300-6.400.8-.4 1.800-.6 2.800-.6 3 0 5 2.200 5 5.500V21z'),
  doc: A('M5 2h9.500L20 7.500V22H5z') + B('M14 2.200V8h5.800zM8 11.500h8v1.800H8zM8 15.500h8v1.800H8z'),
  electric: A('M13.500 1.500 4.500 13.500h6.300l-1.300 9 9.500-12.800h-6.700z'),
  tv: A('M2 5h20v13H2z') + B('M4.200 7.200h15.600v8.600H4.200zM8 19.500h8V22H8z'),
  wifi: `<path class="a" d="M12 4.500c4 0 7.700 1.500 10.500 4.200l-2 2A12.500 12.500 0 0 0 12 7.400c-3.300 0-6.300 1.200-8.500 3.300l-2-2A15 15 0 0 1 12 4.500z"/><path class="b" d="M12 10.500c2.500 0 4.700 1 6.400 2.500l-2.100 2.100A6.300 6.300 0 0 0 12 13.400c-1.700 0-3.200.6-4.300 1.700L5.600 13a9.300 9.300 0 0 1 6.400-2.500z"/>` + circA(12, 18, 2.400),
  drop: A('M12 1.800c-1 1.400-7.500 8.500-7.500 13a7.500 7.500 0 0 0 15 0c0-4.500-6.500-11.600-7.500-13z') + B('M8 14.500c0 2.400 1.800 4.300 4.200 4.500v-2c-1.200-.2-2.200-1.200-2.200-2.500z'),
  flame: A('M12 1.800c.5 3.500-1.300 5-3 7-1.400 1.500-3 3.300-3 6.200a6 6 0 0 0 12 0c0-2.200-1-4.300-2-5.500-.2 1.200-.8 2-1.700 2.500.3-3.900-.6-7.600-2.300-10.200z') + B('M12 13c-1 1.300-2.200 2.200-2.200 4a2.200 2.200 0 0 0 4.400 0c0-1.500-1.200-2.700-2.200-4z'),
  card: A('M2 5.500h20v13H2z') + B('M2 8.500h20v3H2zM5 14.500h6v1.500H5z'),
  receipt: A('M5 2h14v20l-3.500-2-3.500 2-3.500-2L5 22z') + B('M8 7h8v1.800H8zM8 11h8v1.800H8z'),
  building: A('M4 2h11v20H4z') + B('M15 9h6v13h-6zM7 5.500h2V8H7zM11 5.500h2V8h-2zM7 10.500h2V13H7zM11 10.500h2V13h-2zM8 17h3v5H8z'),
  percent: A('M18.300 3.300l2.400 2.400L5.700 20.700l-2.400-2.400z') + circB(7, 7, 3.300) + circB(17, 17, 3.300),
  arrowdown: A('M12 3v13M6 11l6 6 6-6') ,
  whatsapp: A('M12 2a10 10 0 0 0-8.600 15L2 22l5.200-1.400A10 10 0 1 0 12 2z') + B('M8.700 7c-.5 0-1.200.500-1.200 1.800 0 3.300 4 7.700 7.500 7.700 1.400 0 2-.900 2-1.500 0-.300-.100-.500-.300-.600l-1.900-.900c-.300-.100-.500 0-.700.200l-.700.900c-1.500-.500-3-1.900-3.500-3.300l.800-.800c.200-.200.200-.500.100-.700l-.800-2.200c-.100-.400-.300-.600-.600-.600z'),
  radar: A('M12 2a10 10 0 1 0 10 10h-2.500A7.500 7.500 0 1 1 12 4.500z') + B('M12 7a5 5 0 1 0 5 5h-2.400A2.600 2.600 0 1 1 12 9.400z') + A('m12 12 8.500-8.500 1.300 1.300-8.500 8.500z'),
  headset: A('M12 2.500A9 9 0 0 0 3 11.500V17a3 3 0 0 0 3 3h1.500v-7.500H5.200v-1A6.800 6.800 0 0 1 12 4.700a6.800 6.800 0 0 1 6.800 6.800v1h-2.300V20H18a3 3 0 0 0 3-3v-5.500a9 9 0 0 0-9-9z') + B('M15 20.500h-3v1.800h3a3 3 0 0 0 3-2.800h-1.800a1.200 1.200 0 0 1-1.200 1z'),
  chat: A('M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a1 1 0 0 1-1-1z') + B('M7 8h10v1.800H7zM7 12h6.500v1.800H7z'),
  returnbox: A('M3 8l9-5 9 5v10l-9 4-9-4z') + B('M12.500 8.500 9 11.500l3.500 3v-2h1.800a1.700 1.700 0 0 1 0 3.400H12v1.800h2.300a3.500 3.500 0 0 0 0-7H12.500z'),
  calendar: A('M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z') + B('M5.200 9.500h13.600v10.300H5.200z') + A('M7 2h2v4H7zM15 2h2v4h-2zM8 12h2.500v2.500H8zM13.500 12H16v2.500h-2.500zM8 16h2.500v2.500H8z'),
  hospital: A('M3 3.500h18V22H3z') + B('M10.500 7h3v3h3v3h-3v3h-3v-3h-3v-3h3z'),
  school: A('M12 3 1.500 8.500 12 14l10.500-5.500z') + B('M5.500 12.500V17c1.800 1.700 4 2.500 6.500 2.500s4.700-.8 6.500-2.500v-4.500L12 16z'),
  heart: A('M12 21.500C5 16 2 12.300 2 8.300 2 5.200 4.400 3 7.200 3c1.900 0 3.700 1 4.800 2.700C13.100 4 14.900 3 16.800 3 19.600 3 22 5.200 22 8.300c0 4-3 7.700-10 13.200z'),
  train: A('M5 4.500A3 3 0 0 1 8 1.500h8a3 3 0 0 1 3 3V16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z') + B('M7.200 4.500h9.600v6H7.200z') + `<circle class="b" cx="8.800" cy="14.500" r="1.400"/><circle class="b" cx="15.200" cy="14.500" r="1.400"/>` + A('m7.500 19-2.500 3.500h2.400l1.300-2zM16.500 19l2.500 3.500h-2.400l-1.300-2z'),
};

// Named icon. Colour comes from the surrounding --a / --b.
export const duo = (name, cls = '') => raw(`<svg class="duo ${cls}" viewBox="0 0 24 24" aria-hidden="true">${DUO[name] || DUO.parcel}</svg>`);
// A soft coloured tile holding an icon. Tones: green, amber, blue, coral, violet, rose.
export const tile = (name, tone = 'green') => raw(`<span class="tile tile--${tone}">${duo(name).value}</span>`);

const person = (x, y, skin, hair, top) => `
  <circle cx="${x}" cy="${y}" r="21" fill="${skin}"/>
  <path d="M${x - 22} ${y - 2}c-2-20 12-30 26-27 13 2 21 14 18 27-5-9-13-14-22-14-10 0-17 6-22 14z" fill="${hair}"/>
  <path d="M${x - 44} ${y + 96}c0-42 18-66 44-66s44 24 44 66z" fill="${top}"/>
  <rect x="${x - 8}" y="${y + 16}" width="16" height="18" rx="6" fill="${skin}"/>`;

const SCENES = {
  // Saver with rising bars and coins, for the wallet card.
  wallet: `<svg class="scene" viewBox="0 0 340 200" aria-hidden="true">
    <circle cx="150" cy="100" r="88" fill="var(--scene-1)"/>
    ${person(120, 86, '#F4C9A4', '#15332C', '#0E7C66')}
    <circle cx="111" cy="86" r="8" fill="none" stroke="#15332C" stroke-width="2.500"/><circle cx="131" cy="86" r="8" fill="none" stroke="#15332C" stroke-width="2.500"/><path d="M119 86h4" stroke="#15332C" stroke-width="2.500"/>
    <path d="M112 100c5 5 12 5 17 0" fill="none" stroke="#15332C" stroke-width="2.500" stroke-linecap="round"/>
    <g fill="var(--scene-card)" stroke="#15332C" stroke-width="3"><rect x="202" y="136" width="24" height="46" rx="4"/><rect x="234" y="108" width="24" height="74" rx="4"/><rect x="266" y="82" width="24" height="100" rx="4"/></g>
    <rect x="298" y="50" width="24" height="132" rx="4" fill="#0E7C66" stroke="#15332C" stroke-width="3"/>
    <path d="M196 124l46-36 28-14 40-52" fill="none" stroke="#F5B301" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M294 22h17v17" fill="none" stroke="#F5B301" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <g font-family="Inter,sans-serif" font-weight="800" font-size="16" text-anchor="middle"><circle cx="196" cy="44" r="14" fill="#F5B301" stroke="#15332C" stroke-width="3"/><text x="196" y="50" fill="#15332C">₹</text></g>
    <path d="M40 182h290" stroke="#15332C" stroke-width="3" stroke-linecap="round"/></svg>`,
  // Person handing a parcel at a door, for empty lists.
  delivery: `<svg class="scene" viewBox="0 0 320 220" aria-hidden="true">
    <ellipse cx="160" cy="206" rx="130" ry="10" fill="var(--scene-1)"/>
    <rect x="196" y="28" width="86" height="178" rx="4" fill="#0E7C66"/><rect x="206" y="38" width="66" height="168" fill="#BFE6DA"/>
    ${person(236, 84, '#8D5B3E', '#15332C', '#0E7C66')}
    <rect x="208" y="176" width="20" height="30" fill="#15332C"/><rect x="244" y="176" width="20" height="30" fill="#15332C"/><rect x="204" y="130" width="64" height="52" fill="#0E7C66"/>
    ${person(86, 68, '#F4C9A4', '#2B1B12', '#EB6834')}
    <path d="M58 158h58l6 48h-22l-12-30-12 30H54z" fill="#15332C"/>
    <g><rect x="124" y="108" width="62" height="46" rx="3" fill="#F5B301"/><path d="M124 122h62" stroke="#B37F00" stroke-width="2"/><rect x="148" y="108" width="14" height="46" fill="#FFD976"/></g></svg>`,
  // Open carton and thinking person, for empty search results.
  carton: `<svg class="scene" viewBox="0 0 280 200" aria-hidden="true">
    <ellipse cx="140" cy="176" rx="124" ry="20" fill="var(--scene-1)"/>
    <path d="M42 96l58-26 58 26-58 26z" fill="#15332C"/><path d="M42 96v56l58 28v-58z" fill="#0E7C66"/><path d="M158 96v56l-58 28v-58z" fill="#0A5F4E"/>
    <path d="M42 96 22 70l58-24 20 24zM158 96l20-26-58-24-20 24z" fill="#3DA88F"/>
    ${person(214, 62, '#F4C9A4', '#15332C', '#5A6B66')}
    <path d="M186 150h56l4 28h-22l-10-16-10 16h-22z" fill="#15332C"/></svg>`,
  // Clipboard and stacked parcels, for empty order lists.
  orders: `<svg class="scene" viewBox="0 0 300 200" aria-hidden="true"><ellipse cx="150" cy="182" rx="130" ry="12" fill="var(--scene-1)"/>
    <rect x="52" y="30" width="104" height="146" rx="10" fill="#0E7C66"/><rect x="62" y="44" width="84" height="122" rx="4" fill="var(--scene-card)"/><rect x="82" y="22" width="44" height="20" rx="6" fill="#15332C"/>
    <g fill="#BFE6DA"><rect x="74" y="62" width="60" height="8" rx="4"/><rect x="74" y="84" width="60" height="8" rx="4"/><rect x="74" y="106" width="42" height="8" rx="4"/></g><path d="m76 132 8 8 16-16" fill="none" stroke="#EDA100" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="176" y="118" width="68" height="60" rx="4" fill="#F5B301"/><rect x="202" y="118" width="16" height="60" fill="#FFD976"/><rect x="186" y="70" width="48" height="48" rx="4" fill="#EB6834"/><rect x="203" y="70" width="14" height="48" fill="#F7A583"/></svg>`,
  // Parcel on a return arrow, for empty returns.
  returns: `<svg class="scene" viewBox="0 0 300 200" aria-hidden="true"><ellipse cx="150" cy="182" rx="130" ry="12" fill="var(--scene-1)"/>
    <path d="M78 96a74 74 0 0 1 132-40" fill="none" stroke="#0E7C66" stroke-width="12" stroke-linecap="round"/><path d="m194 28 20 34-40 6z" fill="#0E7C66"/>
    <path d="M222 104a74 74 0 0 1-132 40" fill="none" stroke="#EDA100" stroke-width="12" stroke-linecap="round"/><path d="m106 172-20-34 40-6z" fill="#EDA100"/>
    <path d="m150 66 42 20v42l-42 20-42-20V86z" fill="#F5B301"/><path d="m150 106 42-20v42l-42 20z" fill="#C47A00"/><path d="m108 86 42 20 42-20-42-20z" fill="#FFD976"/></svg>`,
  // Support agent with headset, for the help page.
  support: `<svg class="scene" viewBox="0 0 280 200" aria-hidden="true"><circle cx="140" cy="100" r="88" fill="rgba(255,255,255,.1)"/>${person(140, 78, '#F4C9A4', '#15332C', '#F5B301')}
    <path d="M114 78a26 26 0 0 1 52 0" fill="none" stroke="#fff" stroke-width="6"/><rect x="106" y="72" width="12" height="22" rx="5" fill="#fff"/><rect x="162" y="72" width="12" height="22" rx="5" fill="#fff"/><path d="M168 94c0 12-8 16-20 16" fill="none" stroke="#fff" stroke-width="4"/>
    <g><rect x="196" y="34" width="66" height="44" rx="10" fill="#fff"/><path d="m210 76-4 16 18-16z" fill="#fff"/><circle cx="214" cy="56" r="5" fill="#0E7C66"/><circle cx="229" cy="56" r="5" fill="#0E7C66"/><circle cx="244" cy="56" r="5" fill="#0E7C66"/></g></svg>`,
  // Padlock, for pages a role cannot open.
  locked: `<svg class="scene" viewBox="0 0 240 180" aria-hidden="true"><ellipse cx="120" cy="164" rx="100" ry="10" fill="var(--scene-1)"/><path d="M84 80V58a36 36 0 0 1 72 0v22" fill="none" stroke="#15332C" stroke-width="12"/><rect x="62" y="78" width="116" height="82" rx="12" fill="#0E7C66"/><circle cx="120" cy="112" r="12" fill="#F5B301"/><rect x="114" y="116" width="12" height="26" rx="4" fill="#F5B301"/></svg>`,
  // Home scene for "Personal".
  personal: `<svg class="scene" viewBox="0 0 120 110" aria-hidden="true">
    <path d="M60 8 10 50h12v54h76V50h12z" fill="#3DA88F" stroke="#15332C" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="60" cy="52" r="14" fill="#F4C9A4" stroke="#15332C" stroke-width="3"/><path d="M36 104c0-20 10-32 24-32s24 12 24 32z" fill="#EB6834" stroke="#15332C" stroke-width="3"/></svg>`,
  // Desk scene for "Business".
  business: `<svg class="scene" viewBox="0 0 120 110" aria-hidden="true">
    <rect x="46" y="10" width="62" height="42" rx="3" fill="#15332C"/><rect x="52" y="16" width="50" height="30" fill="#BFE6DA"/><rect x="72" y="52" width="10" height="12" fill="#15332C"/>
    <path d="M6 64h110v8H6z" fill="#F5B301" stroke="#15332C" stroke-width="3"/><rect x="12" y="72" width="32" height="32" fill="#FFE2A8" stroke="#15332C" stroke-width="3"/><path d="M12 88h32" stroke="#15332C" stroke-width="3"/><path d="M100 72v32" stroke="#15332C" stroke-width="4"/>
    <path d="M20 64V46" stroke="#15332C" stroke-width="3"/><circle cx="20" cy="38" r="10" fill="#3DA88F" stroke="#15332C" stroke-width="3"/></svg>`,
};
export const scene = (name) => raw(SCENES[name] || '');
// Vehicle pictures already in the project. Air and ship use the plane and ship art.
// Realistic transparent PNGs in /assets/vehicles-png. Parcels, planes and ships stay as drawings.
const PNG = { bike: 'scooter', scooter: 'scooter', bike2: 'bike', auto: 'auto', mini: 'mini', pickup8: 'mini', truck14: 'truck14', truck19: 'truck14', container32: 'container32', trailer40: 'trailer40' };
export const vehicleImg = (key) => {
  if (PNG[key]) return `/assets/vehicles-png/${PNG[key]}.png`;
  const file = { parcel: 'parcel', ptl: 'ptl', air: 'plane', plane: 'plane', ship: 'ship' }[key] || key;
  return `/assets/vehicles/${file}.svg`;
};
