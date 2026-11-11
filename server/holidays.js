// Delivery partner holiday rules. National dates follow the central government list where
// confirmed; confirm festivals against the official list each year and edit them here.
// Partner operating rules are demo assumptions until partners share their real calendars.
'use strict';

const NATIONAL = [['2026-08-15', 'Independence Day'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-11-08', 'Diwali'], ['2026-11-24', 'Guru Nanak Jayanti'], ['2026-12-25', 'Christmas'], ['2027-01-26', 'Republic Day'], ['2027-03-26', 'Good Friday'], ['2027-08-15', 'Independence Day'], ['2027-10-02', 'Gandhi Jayanti'], ['2027-10-29', 'Diwali'], ['2027-12-25', 'Christmas']];
// name, group, status on national holidays, status on Sundays
const PARTNERS = [
  ['Rapido', 'Delivery apps', 'limited', null], ['Porter', 'Delivery apps', 'limited', null], ['Uber', 'Delivery apps', 'limited', null], ['Borzo', 'Delivery apps', 'limited', null],
  ['Blue Dart', 'Couriers', 'limited', 'limited'], ['Delhivery', 'Couriers', 'limited', 'limited'], ['DTDC', 'Couriers', 'limited', 'limited'], ['Xpressbees', 'Couriers', 'limited', 'limited'], ['Ecom Express', 'Couriers', 'limited', 'limited'], ['Shadowfax', 'Couriers', 'limited', null], ['Ekart', 'Couriers', 'limited', 'limited'], ['India Post', 'Couriers', 'closed', 'closed'], ['Gati', 'Couriers', 'closed', 'closed'], ['Coastal Cargo', 'Couriers', 'closed', 'closed'],
  ['Safexpress', 'Heavy surface', 'closed', 'closed'], ['TCI Express', 'Heavy surface', 'closed', 'closed'], ['Xpressbees Cargo', 'Heavy surface', 'closed', 'closed'], ['Blue Dart Surfaceline', 'Heavy surface', 'closed', 'closed'],
  ['BlackBuck', 'Third-party logistics', 'limited', null], ['Mahindra Logistics', 'Third-party logistics', 'limited', 'limited'], ['TCI Freight', 'Third-party logistics', 'limited', 'limited'],
  ['Deccan Haulage Contractors', 'Contractors and owners', 'closed', 'closed'], ['Salim Cargo Movers', 'Contractors and owners', 'limited', null], ['Highway Freightlines', 'Contractors and owners', 'limited', null], ['Ravi Transport', 'Contractors and owners', 'limited', null], ['Zip Riders Co-op', 'Contractors and owners', 'limited', null],
  ['DHL Express', 'International', 'limited', 'limited'], ['FedEx International', 'International', 'limited', 'limited'], ['UPS Worldwide', 'International', 'limited', 'limited'], ['Aramex', 'International', 'limited', 'limited'],
];
const ALL = 'All partners';
const nationalOn = (date) => { const n = NATIONAL.find((x) => x[0] === date); return n ? n[1] : null; };
const isSunday = (date) => new Date(`${date}T00:00:00`).getDay() === 0;

// A partner's status on a date, or null when it runs normally. Your own entries win.
function statusOn(custom, provider, date) {
  const own = (custom || []).find((c) => c.date === date && (c.provider === provider || c.provider === ALL));
  if (own) return { status: own.status, name: own.name, custom: true };
  const p = PARTNERS.find((x) => x[0] === provider);
  if (!p) return null;
  const nat = nationalOn(date);
  if (nat && p[2]) return { status: p[2], name: nat };
  if (isSunday(date) && p[3]) return { status: p[3], name: 'Sunday' };
  return null;
}
function dayView(custom, date) {
  const closed = []; const limited = [];
  PARTNERS.forEach(([name]) => { const s = statusOn(custom, name, date); if (s) (s.status === 'closed' ? closed : limited).push(name); });
  const own = (custom || []).filter((c) => c.date === date);
  const nat = nationalOn(date);
  return { date, national: nat, sunday: isSunday(date), custom: own, closed, limited };
}
module.exports = { ALL, PARTNERS, statusOn, dayView, nationalOn };
