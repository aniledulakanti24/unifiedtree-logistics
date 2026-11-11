// Public booking engine: local on-demand vehicles (two-wheeler to trailer),
// national parcel + B2B freight (air, part-truck, full-truck), international
// express/air/sea. Quotes are filtered by weight, volume and deadline, then
// ranked by the customer's priority. Bookings get a driver/carrier and a
// simulated live journey; local agencies and drivers can join the network.
'use strict';
const crypto = require('crypto');

// ---- geography (demo data) ---------------------------------------------------
// Local cities with localities [name, lat, lng].
const CITIES = {
  bengaluru: { name: 'Bengaluru', localities: [['Koramangala', 12.935, 77.624], ['Indiranagar', 12.971, 77.641], ['Whitefield', 12.970, 77.750], ['Electronic City', 12.845, 77.660], ['Hebbal', 13.035, 77.597], ['Jayanagar', 12.925, 77.583], ['Yeshwanthpur', 13.028, 77.540], ['HSR Layout', 12.912, 77.645], ['MG Road', 12.975, 77.606], ['Peenya Industrial Area', 13.030, 77.520]] },
  mumbai: { name: 'Mumbai', localities: [['Andheri West', 19.136, 72.827], ['Bandra', 19.060, 72.836], ['Powai', 19.118, 72.906], ['Lower Parel', 18.995, 72.830], ['Vashi', 19.077, 72.998], ['Thane', 19.218, 72.978], ['Bhiwandi', 19.296, 73.063], ['Borivali', 19.231, 72.857], ['Colaba', 18.907, 72.815]] },
  delhi: { name: 'Delhi NCR', localities: [['Connaught Place', 28.632, 77.219], ['Saket', 28.524, 77.206], ['Dwarka', 28.592, 77.046], ['Gurugram Cyber City', 28.495, 77.089], ['Noida Sector 18', 28.570, 77.321], ['Okhla Industrial Area', 28.531, 77.271], ['Rohini', 28.736, 77.113], ['Karol Bagh', 28.651, 77.190]] },
  hyderabad: { name: 'Hyderabad', localities: [['HITEC City', 17.447, 78.376], ['Banjara Hills', 17.416, 78.438], ['Secunderabad', 17.440, 78.498], ['Gachibowli', 17.440, 78.348], ['Kukatpally', 17.494, 78.399], ['LB Nagar', 17.346, 78.552], ['Charminar', 17.361, 78.474]] },
  chennai: { name: 'Chennai', localities: [['T Nagar', 13.042, 80.234], ['Anna Nagar', 13.085, 80.210], ['Guindy', 13.007, 80.220], ['Velachery', 12.978, 80.221], ['Sholinganallur', 12.901, 80.228], ['Ambattur Industrial Estate', 13.098, 80.162], ['Tambaram', 12.925, 80.127]] },
  pune: { name: 'Pune', localities: [['Hinjewadi', 18.591, 73.739], ['Kothrud', 18.507, 73.807], ['Viman Nagar', 18.567, 73.914], ['Hadapsar', 18.509, 73.926], ['Chakan MIDC', 18.761, 73.863], ['Shivajinagar', 18.531, 73.848], ['Wakad', 18.599, 73.765]] },
};
// Pincode -> approximate coordinates: metro 3-digit prefixes, then 2-digit regions.
const PIN3 = { 560: [12.97, 77.59, 'Bengaluru'], 400: [19.08, 72.88, 'Mumbai'], 110: [28.61, 77.21, 'Delhi'], 500: [17.39, 78.49, 'Hyderabad'], 600: [13.08, 80.27, 'Chennai'],
  411: [18.52, 73.86, 'Pune'], 700: [22.57, 88.36, 'Kolkata'], 380: [23.02, 72.57, 'Ahmedabad'], 302: [26.91, 75.79, 'Jaipur'], 226: [26.85, 80.95, 'Lucknow'], 682: [9.93, 76.27, 'Kochi'], 452: [22.72, 75.86, 'Indore'] };
const PIN2 = { 11: [28.6, 77.2], 12: [29.0, 76.1], 13: [29.4, 76.4], 14: [30.9, 75.8], 15: [30.7, 76.7], 16: [30.7, 76.8], 17: [31.1, 77.2], 18: [32.7, 74.9], 19: [34.1, 74.8],
  20: [27.2, 78.0], 21: [25.4, 81.8], 22: [26.8, 80.9], 23: [26.4, 80.3], 24: [28.4, 79.4], 25: [29.0, 77.7], 26: [26.8, 83.4], 27: [25.3, 83.0], 28: [27.9, 78.1],
  30: [26.9, 75.8], 31: [27.0, 74.2], 32: [24.6, 73.7], 33: [26.3, 73.0], 34: [28.0, 73.3], 36: [22.3, 70.8], 37: [23.2, 69.7], 38: [23.0, 72.6], 39: [21.2, 72.8],
  40: [19.1, 72.9], 41: [18.5, 73.9], 42: [20.0, 73.8], 43: [19.9, 75.3], 44: [21.1, 79.1], 45: [22.7, 75.9], 46: [23.2, 77.4], 47: [26.2, 78.2], 48: [23.2, 79.9], 49: [21.3, 81.6],
  50: [17.4, 78.5], 51: [16.5, 80.6], 52: [16.3, 80.4], 53: [17.7, 83.3], 56: [12.97, 77.6], 57: [12.3, 76.6], 58: [15.4, 75.1], 59: [15.9, 74.5],
  60: [13.08, 80.27], 61: [10.8, 78.7], 62: [9.9, 78.1], 63: [11.0, 77.0], 64: [11.0, 76.96], 67: [11.3, 75.8], 68: [9.9, 76.3], 69: [8.5, 76.9],
  70: [22.57, 88.36], 71: [22.6, 88.3], 72: [22.4, 87.3], 73: [26.7, 88.4], 74: [23.4, 88.5], 75: [20.3, 85.8], 76: [19.3, 84.8], 77: [21.5, 84.0], 78: [26.1, 91.7], 79: [25.6, 93.9],
  80: [25.6, 85.1], 81: [25.2, 86.9], 82: [24.8, 85.0], 83: [23.3, 85.3], 84: [26.1, 85.4], 85: [25.0, 87.2] };
const COUNTRY_GROUP = { 'United Arab Emirates': 1, Singapore: 1, 'United Kingdom': 2, Germany: 2, 'United States': 3, Canada: 3, Australia: 3 };

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function pinPoint(pin) {
  if (!/^\d{6}$/.test(pin)) return null;
  const p3 = PIN3[pin.slice(0, 3)];
  if (p3) return { lat: p3[0], lng: p3[1], city: p3[2] };
  const p2 = PIN2[pin.slice(0, 2)];
  return p2 ? { lat: p2[0], lng: p2[1], city: null } : null;
}
// Pin codes for the local areas (demo data), so a pin code inside a city can get local vehicles.
const AREA_PINS = {
  bengaluru: { Koramangala: '560034', Indiranagar: '560038', Whitefield: '560066', 'Electronic City': '560100', Hebbal: '560024', Jayanagar: '560041', Yeshwanthpur: '560022', 'HSR Layout': '560102', 'MG Road': '560001', 'Peenya Industrial Area': '560058' },
  mumbai: { 'Andheri West': '400058', Bandra: '400050', Powai: '400076', 'Lower Parel': '400013', Vashi: '400703', Thane: '400601', Bhiwandi: '421302', Borivali: '400092', Colaba: '400005' },
  delhi: { 'Connaught Place': '110001', Saket: '110017', Dwarka: '110075', 'Gurugram Cyber City': '122002', 'Noida Sector 18': '201301', 'Okhla Industrial Area': '110020', Rohini: '110085', 'Karol Bagh': '110005' },
  hyderabad: { 'HITEC City': '500081', 'Banjara Hills': '500034', Secunderabad: '500003', Gachibowli: '500032', Kukatpally: '500072', 'LB Nagar': '500074', Charminar: '500002' },
  chennai: { 'T Nagar': '600017', 'Anna Nagar': '600040', Guindy: '600032', Velachery: '600042', Sholinganallur: '600119', 'Ambattur Industrial Estate': '600058', Tambaram: '600045' },
  pune: { Hinjewadi: '411057', Kothrud: '411038', 'Viman Nagar': '411014', Hadapsar: '411028', 'Chakan MIDC': '410501', Shivajinagar: '411005', Wakad: '411057' },
};
// Central area per city: stands in for a city name, or a city pin code we have no area for.
const CITY_HUB = { bengaluru: 'MG Road', mumbai: 'Lower Parel', delhi: 'Connaught Place', hyderabad: 'Secunderabad', chennai: 'T Nagar', pune: 'Shivajinagar' };
const CITY_BY_PIN3 = { 560: 'bengaluru', 400: 'mumbai', 110: 'delhi', 500: 'hyderabad', 600: 'chennai', 411: 'pune' };

// Text from the search box: a pin code, an area ("Koramangala, Bengaluru") or a city.
function resolvePlace(text) {
  const t = String(text || '').trim();
  const area = (cityKey, name, pin) => ({ cityKey, area: name, pin: pin || AREA_PINS[cityKey][name] });
  if (/^\d{6}$/.test(t)) {
    for (const [cityKey, pins] of Object.entries(AREA_PINS)) {
      const name = Object.keys(pins).find((n) => pins[n] === t);
      if (name) return area(cityKey, name);
    }
    const cityKey = CITY_BY_PIN3[t.slice(0, 3)];
    if (cityKey) return area(cityKey, CITY_HUB[cityKey], t);
    return pinPoint(t) ? { cityKey: null, area: null, pin: t } : null;
  }
  const name = t.split(',')[0].trim().toLowerCase();
  if (!name) return null;
  for (const [cityKey, c] of Object.entries(CITIES)) {
    const hit = c.localities.find((l) => l[0].toLowerCase() === name);
    if (hit) return area(cityKey, hit[0]);
    if (cityKey === name || c.name.toLowerCase() === name) return area(cityKey, CITY_HUB[cityKey]);
  }
  return null;
}
// Same city means local vehicles; anything else is a national or international route.
function resolveRoute(b) {
  const notFound = (t) => new Error(`We couldn't find "${String(t || '').trim().slice(0, 40)}". Enter a 6-digit pin code or pick an area from the list.`);
  if (!String(b.from_place || '').trim()) throw new Error('Enter the pickup location or pin code.');
  const a = resolvePlace(b.from_place);
  if (!a) throw notFound(b.from_place);
  if (b.country) return { service: 'international', from_pincode: a.pin, country: b.country };
  if (!String(b.to_place || '').trim()) throw new Error('Enter the drop location or pin code.');
  const z = resolvePlace(b.to_place);
  if (!z) throw notFound(b.to_place);
  if (a.pin === z.pin || (a.cityKey && a.cityKey === z.cityKey && a.area === z.area)) throw new Error('Pickup and drop are in the same area. Enter a more exact area or a different pin code.');
  if (a.cityKey && a.cityKey === z.cityKey) return { service: 'local', city: a.cityKey, from: a.area, to: z.area };
  return { service: 'national', from_pincode: a.pin, to_pincode: z.pin };
}

// ---- vehicles + modes ------------------------------------------------------------
// capacity kg, volume m3, base fare, per km, city speed km/h, highway km/day, pickup ETA min
const VEHICLES = [
  { key: 'bike', name: 'Two-wheeler', kg: 20, m3: 0.06, base: 40, per_km: 8, speed: 24, eta: 8, use: 'Documents, food, small parcels' },
  { key: 'auto', name: 'Three-wheeler cargo', kg: 500, m3: 2.5, base: 120, per_km: 16, speed: 20, eta: 12, use: 'Cartons, appliances, shop restock' },
  { key: 'mini', name: 'Mini truck · 7 ft', kg: 750, m3: 4.5, base: 280, per_km: 22, speed: 22, eta: 20, per_km_ftl: 18, use: 'Small house shift, furniture, B2B drops' },
  { key: 'pickup8', name: 'Pickup · 8 ft', kg: 1250, m3: 6.5, base: 450, per_km: 28, speed: 22, eta: 25, per_km_ftl: 24, use: 'Bulk stock, 1 BHK move, construction material' },
  { key: 'truck14', name: 'Truck · 14 ft', kg: 3500, m3: 18, base: 1200, per_km: 40, speed: 20, eta: 45, per_km_ftl: 38, use: '2–3 BHK move, warehouse transfers' },
  { key: 'truck19', name: 'Truck · 19 ft', kg: 9000, m3: 30, base: 2200, per_km: 55, speed: 18, eta: 60, per_km_ftl: 52, use: 'Pallets, FMCG distribution, machinery' },
  { key: 'container32', name: 'Container · 32 ft multi-axle', kg: 16000, m3: 55, base: 4500, per_km: 85, speed: 16, eta: 120, per_km_ftl: 78, use: 'Full loads, inter-city freight' },
  { key: 'trailer40', name: 'Trailer · 40 ft', kg: 25000, m3: 70, base: 7000, per_km: 110, speed: 14, eta: 180, per_km_ftl: 98, use: 'Heavy industrial cargo, steel, project loads' },
];
const HIGHWAY_KM_PER_DAY = 450;

// Local providers: name, kind, vehicles, price multiplier, rating, pickup ETA adjustment, weight
// limit. Demo data: the independent owners are fictional, and the prices, ratings and availability
// shown for every provider are simulated. Registered partners are added at runtime.
const SEED_PARTNERS = [
  ['Porter', 'Delivery app', ['bike', 'auto', 'mini', 'pickup8', 'truck14'], 1.0, 4.5, 0],
  ['Rapido', 'Delivery app', ['bike'], 0.9, 4.3, -3, 10],
  ['Uber', 'Delivery app', ['bike', 'auto', 'mini'], 1.05, 4.4, -1],
  ['Borzo', 'Delivery app', ['bike', 'auto'], 0.95, 4.1, 2],
  ['BlackBuck', 'Third-party logistics', ['mini', 'pickup8', 'truck14', 'truck19', 'container32'], 0.95, 4.2, 15],
  ['Deccan Haulage Contractors', 'Contractor', ['mini', 'pickup8', 'truck14', 'truck19', 'container32', 'trailer40'], 0.9, 4.1, 20],
  ['Ravi Transport', 'Independent vehicle', ['auto', 'mini', 'pickup8'], 0.88, 4.4, 6],
  ['Salim Cargo Movers', 'Independent vehicle', ['mini', 'pickup8', 'truck14', 'truck19'], 0.93, 4.3, 10],
  ['Zip Riders Co-op', 'Independent vehicle', ['bike', 'auto'], 0.86, 4.2, 2],
  ['Highway Freightlines', 'Independent vehicle', ['truck19', 'container32', 'trailer40'], 0.92, 4.5, 30],
];
// How many of this provider's vehicles are free nearby right now (simulated, changes every 10
// minutes). Null for a pickup scheduled more than an hour ahead, where it can't be known yet.
function freeNearby(cityKey, provider, vehicle, pickupAt) {
  if (pickupAt > Date.now() + 3600000) return null;
  const n = crypto.createHash('md5').update(`${cityKey}|${provider}|${vehicle}|${Math.floor(Date.now() / 600000)}`).digest()[0];
  return ['Porter', 'Rapido', 'Uber', 'BlackBuck'].includes(provider) ? 1 + (n % 5) : n % 6;
}
// Part-truck carriers and full-truck providers (third-party logistics and contractors). Demo rates.
const PTL_PROVIDERS = [['Delhivery', 1, 4.3], ['Gati', 0.96, 4.1], ['Safexpress', 1.06, 4.4], ['TCI Express', 1.02, 4.2], ['Xpressbees Cargo', 0.94, 4.0], ['Blue Dart Surfaceline', 1.18, 4.5]];
const FTL_PROVIDERS = [['Salim Cargo Movers', 'Independent vehicle', 1, 4.4], ['Highway Freightlines', 'Independent vehicle', 0.97, 4.5], ['BlackBuck', 'Third-party logistics', 0.95, 4.2], ['Mahindra Logistics', 'Third-party logistics', 1.08, 4.5], ['TCI Freight', 'Third-party logistics', 1.04, 4.3], ['Deccan Haulage Contractors', 'Contractor', 0.9, 4.1]];
const DRIVERS = ['Ravi K.', 'Imran S.', 'Suresh P.', 'Anil M.', 'Joseph D.', 'Harpreet S.', 'Manoj T.', 'Venkat R.', 'Salim A.', 'Deepak N.'];
const STATE_CODE = { bengaluru: 'KA', mumbai: 'MH', delhi: 'DL', hyderabad: 'TS', chennai: 'TN', pune: 'MH' };

module.exports = function register(routes, { send, authUser }, ctx) {
  const { rates, defaultSettings, INTL_COURIERS, COUNTRIES, iso } = ctx;
  const bad = (res, message) => send(res, 400, { message });
  const publicDb = { settings: defaultSettings() };
  const partners = require('./store').track('partners', []);    // registered partners (agencies, contractors, drivers)
  const bookings = require('./store').track('bookings', new Map());
  const quotes = new Map(); // quote id -> { input, options, expires }
  const hits = new Map();
  const limited = (req, max = 40) => {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    const l = (hits.get(ip) || []).filter((t) => now - t < 60000);
    l.push(now);
    hits.set(ip, l);
    return l.length > max;
  };

  const providersFor = (cityKey, vehicleKey) => [
    ...SEED_PARTNERS.filter((p) => p[2].includes(vehicleKey)).map(([name, type, , mult, rating, etaAdj, maxKg]) => ({ name, type, kind: type === 'Delivery app' ? 'app' : 'independent', mult, rating, etaAdj, maxKg, verified: true })),
    ...partners.filter((p) => p.status === 'ACTIVE' && p.city === cityKey && p.vehicles.includes(vehicleKey))
      .map((p) => ({ name: p.business_name, type: p.partner_type, kind: 'independent', mult: 0.96, rating: p.rating, etaAdj: 3, verified: false, partner_id: p.id, joined: true })),
  ];
  const niceKg = (kg) => (kg >= 1000 ? kg / 1000 + ' t' : kg + ' kg');
  // Couriers collect in a daily run: today until 5 pm, otherwise tomorrow.
  const courierPickup = () => (new Date().getHours() < 17 ? { availability: 'Pickup today', pickup_within_min: 240 } : { availability: 'Pickup tomorrow', pickup_within_min: 960 });

  // ---- quote ---------------------------------------------------------------------
  function parseInput(b) {
    const service = ['local', 'national', 'international'].includes(b.service) ? b.service : null;
    if (!service) throw new Error('Choose local, national or international.');
    const segment = b.segment === 'b2b' ? 'b2b' : 'b2c';
    const pieces = Math.max(1, Math.min(500, Math.floor(Number(b.pieces) || 1)));
    const weight = Number(b.weight);
    if (!(weight > 0 && weight <= 40000)) throw new Error('Enter the total weight (up to 40,000 kg).');
    const dims = ['length', 'breadth', 'height'].map((k) => Number(b[k]) || 0);
    const volumeM3 = dims.every((d) => d > 0) ? (dims[0] * dims[1] * dims[2] * pieces) / 1e6 : 0;
    const priority = ['fastest', 'cheapest', 'best'].includes(b.priority) ? b.priority : 'best';
    const pickupAt = b.pickup_at ? Date.parse(b.pickup_at) : Date.now();
    if (Number.isNaN(pickupAt) || pickupAt < Date.now() - 5 * 60000) throw new Error('Pick a pickup time from now onwards.');
    const deliverBy = b.deliver_by ? Date.parse(b.deliver_by) : null;
    if (deliverBy && (Number.isNaN(deliverBy) || deliverBy <= pickupAt)) throw new Error('"Deliver by" must be after the pickup time.');
    const declared = Math.max(0, Number(b.declared_value) || 0);
    const input = { service, segment, pieces, weight, volumeM3, dims, priority, pickupAt, deliverBy, declared, helpers: Math.max(0, Math.min(4, Math.floor(Number(b.helpers) || 0))),
      category: String(b.category || 'General goods').slice(0, 40) };
    if (service === 'local') {
      const city = CITIES[b.city];
      if (!city) throw new Error('Pick a city.');
      const from = city.localities.find((l) => l[0] === b.from);
      const to = city.localities.find((l) => l[0] === b.to);
      if (!from || !to) throw new Error('Pick pickup and drop areas.');
      if (from === to) throw new Error('Pickup and drop are the same area.');
      Object.assign(input, { cityKey: b.city, city: city.name, from: from[0], to: to[0], fromPt: [from[1], from[2]], toPt: [to[1], to[2]],
        distanceKm: +(haversine([from[1], from[2]], [to[1], to[2]]) * 1.35).toFixed(1) });
    } else if (service === 'national') {
      const a = pinPoint(String(b.from_pincode || ''));
      const z = pinPoint(String(b.to_pincode || ''));
      if (!a || !z) throw new Error('Enter valid 6-digit pickup and delivery pincodes.');
      Object.assign(input, { fromPin: b.from_pincode, toPin: b.to_pincode, from: a.city || 'Pincode ' + b.from_pincode, to: z.city || 'Pincode ' + b.to_pincode,
        distanceKm: Math.max(15, Math.round(haversine([a.lat, a.lng], [z.lat, z.lng]) * 1.25)) });
    } else {
      if (!COUNTRIES[b.country]) throw new Error('Pick a destination country.');
      if (!pinPoint(String(b.from_pincode || ''))) throw new Error('Enter a valid 6-digit pickup pincode.');
      Object.assign(input, { fromPin: b.from_pincode, country: b.country, from: pinPoint(b.from_pincode).city || 'Pincode ' + b.from_pincode, to: b.country });
    }
    return input;
  }

  const hours = (h) => h * 3600000;
  function buildOptions(i) {
    const out = [];
    const chargeable = Math.max(i.weight, i.volumeM3 * 250); // road freight volumetric: 250 kg per m3
    const insurance = i.declared ? Math.round(Math.max(30, i.declared * 0.002)) : 0;
    let unavailable = 0;
    const add = (o) => out.push({ ...o, insurance, total: Math.round(o.price + insurance) });
    const addCouriers = (q, note) => q.data.forEach((c) => add({ mode: 'parcel', vehicle: 'parcel', kind: 'courier', title: 'Courier parcel', provider: c.courier_name, provider_type: 'Courier service', verified: true, rating: c.rating,
      capacity: 'Up to 30 kg per piece', max_kg: 30, ...courierPickup(), price: c.rate * i.pieces, eta: i.pickupAt + hours(24 * (c.etd_days + 0.5)), days: c.etd_days, segment: 'both', note }));

    if (i.service === 'local') {
      for (const v of VEHICLES) {
        if (v.kg < i.weight || (i.volumeM3 && v.m3 < i.volumeM3)) continue;
        if (v.kg > Math.max(1000, i.weight * 6)) continue; // don't offer a trailer for a parcel
        const tripMin = Math.round((i.distanceKm / v.speed) * 60) + 10 + (v.kg > 1000 ? 20 : 0); // + loading time
        for (const p of providersFor(i.cityKey, v.key)) {
          if (p.maxKg && p.maxKg < i.weight) continue;
          const free = p.joined ? 1 : freeNearby(i.cityKey, p.name, v.key, i.pickupAt);
          if (free === 0) { unavailable++; continue; }
          const night = new Date(i.pickupAt).getHours() >= 22 || new Date(i.pickupAt).getHours() < 6;
          const fare = (v.base + v.per_km * i.distanceKm) * p.mult * (night ? 1.2 : 1) + i.helpers * (v.kg > 1000 ? 350 : 200);
          const pickupMin = Math.max(5, v.eta + p.etaAdj);
          const start = Math.max(i.pickupAt, Date.now() + pickupMin * 60000);
          add({ mode: 'local', vehicle: v.key, kind: p.kind, title: v.name, provider: p.name, provider_type: p.type, verified: p.verified, partner_id: p.partner_id || null,
            rating: p.rating, capacity: `${niceKg(p.maxKg || v.kg)} · ${v.m3} m³`, max_kg: p.maxKg || v.kg, availability: free === null ? 'Scheduled pickup' : `${free} free nearby`, pickup_within_min: pickupMin, price: Math.round(fare * 1.18),
            eta_pickup_min: pickupMin, trip_min: tripMin, eta: start + tripMin * 60000, segment: 'both', note: v.use + (night ? ' · night charge 20%' : '') });
        }
      }
      // Courier services also work within a city: slower than a vehicle, usually cheaper.
      if (i.weight / i.pieces <= 30) {
        try {
          addCouriers(rates(publicDb, { pickup: AREA_PINS[i.cityKey][i.from], drop: AREA_PINS[i.cityKey][i.to], weight: i.weight / i.pieces, cod: false, amount: i.declared || 1000 }), 'Door to door, same-city courier');
        } catch (err) { /* no courier on this lane; vehicles still apply */ }
      }
    }

    if (i.service === 'national') {
      const days = (km, perDay) => Math.max(1, Math.ceil(km / perDay));
      // B2C / small business parcels through couriers (≤ 30 kg per piece).
      if (i.weight / i.pieces <= 30) {
        try {
          const q = rates(publicDb, { pickup: i.fromPin, drop: i.toPin, weight: i.weight / i.pieces, cod: false, amount: i.declared || 1000 });
          addCouriers(q, `${q.zone} zone · door to door`);
        } catch (err) { /* lane not served by couriers; freight options still apply */ }
      }
      // Air cargo express (B2B, from 10 kg).
      if (i.weight >= 10 && i.weight <= 3000) {
        const kg = Math.max(25, chargeable);
        add({ mode: 'air', vehicle: 'air', kind: 'courier', title: 'Air cargo express', provider: 'Blue Dart', provider_type: 'Courier service', verified: true, rating: 4.5,
          capacity: 'Up to 3 t · min. 25 kg billed', max_kg: 3000, availability: 'Next flight out', pickup_within_min: 240, price: Math.round((900 + kg * (70 + i.distanceKm * 0.02)) * 1.18), eta: i.pickupAt + hours(24 * (1 + (i.distanceKm > 1500 ? 1 : 0)) + 12),
          days: 1 + (i.distanceKm > 1500 ? 1 : 0), segment: 'b2b', note: 'Airport to door, next-flight-out' });
      }
      // Part truck load (PTL) for 30 kg – 3 t.
      if (i.weight >= 30 && i.weight <= 3000) {
        const kg = Math.max(50, chargeable);
        const d = days(i.distanceKm, 350) + 1;
        PTL_PROVIDERS.forEach(([provider, mult, rating], n) => add({ mode: 'ptl', vehicle: 'ptl', kind: 'courier', title: 'Heavy surface · part truck', provider, provider_type: 'Courier service', verified: true, rating,
          capacity: 'Up to 3 t · shared truck, 50 kg minimum', max_kg: 3000, availability: 'Pickup tomorrow', pickup_within_min: 1440, price: Math.round(Math.max(1500, kg * (6 + i.distanceKm * 0.0045)) * 1.18 * mult), eta: i.pickupAt + hours(24 * (d + (n % 2))), days: d + (n % 2), segment: 'b2b', note: 'Palletised, hub to hub with door pickup and delivery' }));
      }
      // Full truck load (FTL) by vehicle class.
      for (const v of VEHICLES.filter((x) => x.per_km_ftl && x.kg >= i.weight && (!i.volumeM3 || x.m3 >= i.volumeM3))) {
        if (i.weight < 300 && v.kg > 1500) continue;
        if (v.kg > Math.max(1500, i.weight * 6)) continue;
        const d = days(i.distanceKm, HIGHWAY_KM_PER_DAY);
        FTL_PROVIDERS.forEach(([provider, provider_type, mult, rating], n) => add({ mode: 'ftl', vehicle: v.key, kind: 'independent', title: `Full truck · ${v.name}`, provider, provider_type, verified: true,
          rating, capacity: `${niceKg(v.kg)} · ${v.m3} m³ · dedicated`, max_kg: v.kg, availability: `Truck in ${4 + n * 2} hours`, pickup_within_min: 240 + n * 120, price: Math.round((Math.max(3000, v.per_km_ftl * i.distanceKm) + 400 * Math.ceil(i.distanceKm / 300)) * 1.18 * mult),
          eta: i.pickupAt + hours(4 + n * 2 + 24 * d), days: d, segment: 'b2b', note: 'Dedicated vehicle, no transhipment · tolls included' }));
      }
    }

    if (i.service === 'international') {
      const g = COUNTRY_GROUP[i.country] || 3;
      if (i.weight / i.pieces <= 30) {
        INTL_COURIERS.forEach((c) => {
          const slabs = Math.max(1, Math.ceil((i.weight / i.pieces) / 0.5));
          const price = Math.round((c.base + (slabs - 1) * c.perHalf) * (COUNTRIES[i.country] || 1.4) * 1.18) * i.pieces;
          add({ mode: 'intl_express', vehicle: 'plane', kind: 'courier', title: 'International express', provider: c.name, provider_type: 'Courier service', verified: true, rating: 4.3,
            capacity: 'Up to 30 kg per piece', max_kg: 30, ...courierPickup(), price, eta: i.pickupAt + hours(24 * c.days), days: c.days, segment: 'both', note: 'Door to door, duties paid by receiver' });
        });
      }
      if (i.weight >= 45) {
        const kg = Math.max(45, Math.max(i.weight, i.volumeM3 * 167));
        [['GlobalAir Cargo', 1, 4.4, 0], ['DHL Global Forwarding', 1.12, 4.6, -1], ['DB Schenker', 1.06, 4.4, 0], ['Kuehne + Nagel', 1.09, 4.5, 1]].forEach(([provider, mult, rating, dd]) => add({ mode: 'air_freight', vehicle: 'plane', title: 'Air freight', kind: 'freight', provider, provider_type: 'Freight forwarder', verified: true, rating,
          capacity: 'Up to 5 t · min. 45 kg billed', max_kg: 5000, availability: 'Pickup in 2 days', pickup_within_min: 2880, price: Math.round((6500 + kg * (180 + g * 45)) * 1.18 * mult), eta: i.pickupAt + hours(24 * (4 + g + dd)), days: 4 + g + dd, segment: 'b2b', note: 'Airport to airport + customs clearance at origin' }));
      }
      if (i.weight >= 200) {
        const cbm = Math.max(1, i.volumeM3 || i.weight / 400);
        [['OceanLink Freight', 1, 4.2, 0], ['Maersk', 1.1, 4.5, -2], ['CMA CGM', 1.04, 4.3, 1]].forEach(([provider, mult, rating, dd]) => add({ mode: 'sea_freight', vehicle: 'ship', title: 'Sea freight (LCL)', kind: 'freight', provider, provider_type: 'Freight forwarder', verified: true, rating,
          capacity: 'Up to 40 t · shared container, billed per m³', max_kg: 40000, availability: 'Pickup in 2 days', pickup_within_min: 2880, price: Math.round((12000 + cbm * (3500 + g * 1800)) * 1.18 * mult), eta: i.pickupAt + hours(24 * (18 + g * 7 + dd)), days: 18 + g * 7 + dd, segment: 'b2b', note: 'Port to port, ICD pickup in India' }));
      }
    }

    // B2C customers don't see B2B-only freight unless the load needs it.
    let list = out.filter((o) => i.segment === 'b2b' || o.segment !== 'b2b' || i.weight > 30);
    const missed = i.deliverBy ? list.filter((o) => o.eta > i.deliverBy) : [];
    if (i.deliverBy) list = list.filter((o) => o.eta <= i.deliverBy);
    // Every provider gets its own row: the customer makes the choice.
    if (!list.length) return { options: [], missed: missed.length, unavailable };
    const minP = Math.min(...list.map((o) => o.total));
    const minT = Math.min(...list.map((o) => o.eta));
    const score = (o) => (o.total / minP) * 0.55 + ((o.eta - i.pickupAt) / Math.max(1, minT - i.pickupAt)) * 0.35 - o.rating * 0.05;
    list.sort(i.priority === 'fastest' ? (a, b) => a.eta - b.eta || a.total - b.total : i.priority === 'cheapest' ? (a, b) => a.total - b.total || a.eta - b.eta : (a, b) => score(a) - score(b));
    list.forEach((o, n) => {
      o.id = crypto.randomBytes(5).toString('hex');
      o.tags = [n === 0 && 'Recommended', o.total === minP && 'Cheapest', o.eta === minT && 'Fastest'].filter(Boolean);
      o.eta = iso(o.eta);
    });
    return { options: list, missed: missed.length, unavailable };
  }

  routes['GET /v1/public/booking/meta'] = async (req, res) => send(res, 200, {
    cities: Object.entries(CITIES).map(([key, c]) => ({ key, name: c.name, localities: c.localities.map((l) => l[0]) })),
    areas: Object.values(CITIES).flatMap((c) => c.localities.map((l) => `${l[0]}, ${c.name}`)),
    area_points: Object.fromEntries(Object.values(CITIES).flatMap((c) => c.localities.map((l) => [`${l[0]}, ${c.name}`, [l[1], l[2]]]))),
    pin_points: { ...PIN2, ...PIN3 },
    pin_cities: Object.fromEntries(Object.entries(CITY_BY_PIN3).map(([pin, key]) => [pin, CITIES[key].name])),
    country_points: { 'United States': [39, -98], 'United Kingdom': [54, -2], 'United Arab Emirates': [24, 54], Singapore: [1.35, 103.8], Australia: [-25, 134], Canada: [56, -106], Germany: [51, 10] },
    countries: Object.keys(COUNTRIES),
    vehicles: VEHICLES.map(({ key, name, kg, m3, use }) => ({ key, name, kg, m3, use })),
    categories: ['Documents', 'Parcel / e-commerce', 'Food & groceries', 'Electronics', 'Furniture & household', 'Industrial / machinery', 'Construction material', 'Pharma (non-cold)', 'FMCG / retail stock'],
    partners: SEED_PARTNERS.length + partners.filter((p) => p.status === 'ACTIVE').length,
  });

  routes['POST /v1/public/booking/quote'] = async (req, res, body) => {
    if (limited(req)) return send(res, 429, { message: 'Too many requests. Try again in a minute.' });
    let input;
    let resolved = null; // what the homepage search worked out, so it can open the booking page
    try {
      if (body.from_place != null) resolved = resolveRoute(body);
      input = parseInput({ ...body, ...resolved });
    } catch (err) { return bad(res, err.message); }
    const { options, missed, unavailable } = buildOptions(input);
    if (!authUser(req)) return send(res, 200, { locked: true, count: options.length, resolved });
    const id = crypto.randomBytes(8).toString('hex');
    quotes.set(id, { input, options, expires: Date.now() + 20 * 60000 });
    for (const [k, q] of quotes) if (q.expires < Date.now()) quotes.delete(k);
    send(res, 200, {
      quote_id: id, valid_minutes: 20, resolved,
      route: { service: input.service, from: input.from, to: input.to, city: input.city || null, distance_km: input.distanceKm || null },
      load: { weight: input.weight, pieces: input.pieces, volume_m3: +input.volumeM3.toFixed(2) },
      options, hidden_by_deadline: missed, unavailable_now: unavailable,
      message: options.length ? null : unavailable ? 'Every vehicle for this load is busy right now. Try again in a few minutes or schedule the pickup for later.' : missed ? `No option can deliver by your deadline — ${missed} option(s) are available with a later delivery time.` : 'No service fits this load. Try splitting it or choosing a larger vehicle.',
    });
  };

  // ---- booking + live tracking --------------------------------------------------
  // Demo clock: journeys play out faster so tracking can be watched.
  const SPEED = { local: 20, national: 2000, international: 2000 };
  // A courier booked inside a city runs on the courier timeline, not the on-demand one.
  const onDemand = (b) => b.option.mode === 'local';
  const speedOf = (b) => SPEED[onDemand(b) ? 'local' : 'national'];
  function stagesFor(b) {
    if (onDemand(b)) {
      return [['BOOKED', 'Booking confirmed', 0], ['ASSIGNED', `Driver assigned · ${b.driver.name}`, 0.5], ['ARRIVING', 'Driver on the way to pickup', 1],
        ['PICKED_UP', 'Picked up', b.option.eta_pickup_min], ['IN_TRANSIT', 'On the way to drop', b.option.eta_pickup_min + 2], ['DELIVERED', 'Delivered', b.option.eta_pickup_min + b.option.trip_min]];
    }
    const total = (Date.parse(b.option.eta) - b.pickup_at) / 60000;
    const air = /air|plane/.test(b.option.mode + b.option.vehicle);
    return [['BOOKED', 'Booking confirmed', 0], ['PICKUP_SCHEDULED', 'Pickup scheduled', 30], ['PICKED_UP', 'Picked up from sender', total * 0.08],
      ['IN_TRANSIT', air ? 'Departed origin airport' : 'In transit · origin hub', total * 0.2], ['IN_TRANSIT', b.service === 'international' ? 'Customs cleared at destination' : 'Reached destination hub', total * 0.75],
      ['OUT_FOR_DELIVERY', 'Out for delivery', total * 0.9], ['DELIVERED', 'Delivered', total]];
  }
  function trackingView(b) {
    const elapsedMin = ((Date.now() - b.created_at) / 60000) * speedOf(b);
    const startOffset = Math.max(0, (b.pickup_at - b.created_at) / 60000);
    const stages = stagesFor(b);
    // Each step is stamped with the real moment it happened in the sped-up demo, so no date lands in the future.
    const timeline = stages.filter(([, , at], n) => n === 0 || elapsedMin >= at + startOffset)
      .map(([status, label, at], n) => ({ status, label, at: iso(b.created_at + ((at + (n ? startOffset : 0)) / speedOf(b)) * 60000) }));
    const current = timeline[timeline.length - 1];
    const tripStart = stages.find((s) => s[0] === 'PICKED_UP')[2] + startOffset;
    const tripEnd = stages[stages.length - 1][2] + startOffset;
    const progress = Math.max(0, Math.min(1, (elapsedMin - tripStart) / Math.max(1, tripEnd - tripStart)));
    const remainingMin = Math.max(0, tripEnd - elapsedMin);
    return {
      id: b.id, status: current.status, label: current.label, service: b.service, segment: b.segment, created_at: iso(b.created_at),
      route: b.route, option: { title: b.option.title, provider: b.option.provider, provider_type: b.option.provider_type, capacity: b.option.capacity },
      driver: onDemand(b) && ['ASSIGNED', 'ARRIVING', 'PICKED_UP', 'IN_TRANSIT'].includes(current.status) ? b.driver : null,
      // Pickup OTP until the parcel is collected, then the delivery OTP.
      otp: onDemand(b) && current.status !== 'DELIVERED' ? (['BOOKED', 'ASSIGNED', 'ARRIVING'].includes(current.status) ? { pickup: b.pickup_otp } : { delivery: b.delivery_otp }) : null,
      progress: +progress.toFixed(3), remaining_min: current.status === 'DELIVERED' ? 0 : Math.round(remainingMin), promised_by: b.option.eta,
      timeline: timeline.reverse(), demo_speed: speedOf(b), total: b.option.total, from_pt: b.from_pt, to_pt: b.to_pt,
    };
  }

  routes['POST /v1/public/booking/book'] = async (req, res, body) => {
    if (limited(req, 15)) return send(res, 429, { message: 'Too many bookings. Try again in a minute.' });
    if (!authUser(req)) return send(res, 401, { message: 'Please sign in to book.' });
    const q = quotes.get(String(body.quote_id || ''));
    if (!q || q.expires < Date.now()) return bad(res, 'This quote has expired. Please get a fresh quote.');
    const option = q.options.find((o) => o.id === body.option_id);
    if (!option) return bad(res, 'Pick one of the quoted options.');
    const c = body.contact || {};
    if (!String(c.name || '').trim() || !/^[6-9]\d{9}$/.test(c.phone || '')) return bad(res, 'Enter your name and a 10-digit mobile number.');
    const pickupAddr = String(body.pickup_address || '').trim();
    const dropAddr = String(body.drop_address || '').trim();
    if (pickupAddr.length < 8 || dropAddr.length < 8) return bad(res, 'Enter full pickup and drop addresses (house/building, street).');
    if (q.input.segment === 'b2b' && body.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(body.gstin).toUpperCase())) return bad(res, 'Enter a valid GSTIN or leave it blank.');
    const { id, total } = createBooking(q, option, body);
    send(res, 200, { id, tracking_url: `/track/?id=${id}`, total });
  };

  // Shared by the public booking page and the dashboard.
  function createBooking(q, option, body) {
    const c = body.contact || {};
    const pickupAddr = String(body.pickup_address || '').trim();
    const dropAddr = String(body.drop_address || '').trim();
    const i = q.input;
    const id = 'BK' + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomBytes(1).toString('hex').toUpperCase();
    const drv = DRIVERS[crypto.randomInt(0, DRIVERS.length)];
    const b = {
      id, service: i.service, segment: i.segment, created_at: Date.now(), pickup_at: i.pickupAt, option,
      route: { from: i.from, to: i.to, city: i.city || null, distance_km: i.distanceKm || null, pickup_address: pickupAddr.slice(0, 200), drop_address: dropAddr.slice(0, 200) },
      from_pt: i.fromPt || null, to_pt: i.toPt || null,
      contact: { name: String(c.name).slice(0, 60), phone: c.phone, company: String(body.company || '').slice(0, 80), gstin: String(body.gstin || '').toUpperCase() },
      load: { weight: i.weight, pieces: i.pieces, category: i.category, helpers: i.helpers },
      driver: { name: drv, phone: '+91 9' + String(crypto.randomInt(1e8, 1e9 - 1)).slice(0, 4) + ' ••••••', vehicle_no: `${STATE_CODE[i.cityKey] || 'KA'} ${String(crypto.randomInt(1, 60)).padStart(2, '0')} ${String.fromCharCode(65 + crypto.randomInt(0, 26))}${String.fromCharCode(65 + crypto.randomInt(0, 26))} ••${crypto.randomInt(10, 99)}`, rating: (4.3 + crypto.randomInt(0, 7) / 10).toFixed(1) },
      pickup_otp: String(crypto.randomInt(1000, 9999)), delivery_otp: String(crypto.randomInt(1000, 9999)),
    };
    bookings.set(id, b);
    if (option.partner_id) { const p = partners.find((x) => x.id === option.partner_id); if (p) p.jobs++; }
    return { id, total: option.total };
  }

  routes['GET /v1/public/booking/track'] = async (req, res, body, url) => {
    const b = bookings.get(String(url.searchParams.get('id') || '').trim().toUpperCase());
    if (!b) return send(res, 404, { message: 'We could not find that booking ID.' });
    send(res, 200, trackingView(b));
  };

  // ---- partner network (agencies, contractors, drivers) --------------------------
  routes['POST /v1/public/partners'] = async (req, res, body) => {
    if (limited(req, 10)) return send(res, 429, { message: 'Too many requests. Try again in a minute.' });
    const types = ['Individual driver', 'Fleet owner', 'Transport agency', 'Contractor'];
    if (!String(body.business_name || '').trim()) return bad(res, 'Enter your name or business name.');
    if (!types.includes(body.partner_type)) return bad(res, 'Pick what kind of partner you are.');
    if (!CITIES[body.city]) return bad(res, 'Pick the city you operate in.');
    const vehicles = (body.vehicles || []).filter((v) => VEHICLES.some((x) => x.key === v));
    if (!vehicles.length) return bad(res, 'Pick at least one vehicle type.');
    if (!/^[6-9]\d{9}$/.test(body.phone || '')) return bad(res, 'Enter a 10-digit mobile number.');
    if (body.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(body.gstin).toUpperCase())) return bad(res, 'Enter a valid GSTIN or leave it blank.');
    const fleet = Math.max(1, Math.min(5000, Math.floor(Number(body.fleet_size) || 1)));
    if (partners.some((p) => p.phone === body.phone)) return send(res, 409, { message: 'This number is already registered.' });
    const p = { id: 'PT' + (partners.length + 101), business_name: String(body.business_name).trim().slice(0, 60), partner_type: body.partner_type, city: body.city, vehicles, fleet,
      phone: body.phone, gstin: String(body.gstin || '').toUpperCase(), status: 'ACTIVE', rating: 4.5, jobs: 0, joined_at: iso(Date.now()) };
    partners.push(p);
    send(res, 200, { id: p.id, status: p.status, message: `You're live in ${CITIES[p.city].name}. New bookings for your vehicles will include you.` });
  };
  routes['GET /v1/public/partners/stats'] = async (req, res) => send(res, 200, {
    partners: SEED_PARTNERS.length + partners.length,
    by_city: Object.entries(CITIES).map(([k, c]) => ({ city: c.name, partners: SEED_PARTNERS.length + partners.filter((p) => p.city === k).length })),
    recent: partners.slice(-5).reverse().map((p) => ({ name: p.business_name, type: p.partner_type, city: CITIES[p.city].name, vehicles: p.vehicles.length })),
  });

  // What the dashboard API builds on.
  const trackById = (id) => { const b = bookings.get(id); return b ? trackingView(b) : null; };
  const areaPoint = (cityKey, area) => { const l = CITIES[cityKey] && CITIES[cityKey].localities.find((x) => x[0] === area); return l ? [l[1], l[2]] : null; };
  // Closest serviceable area to a map point, with a pin code even outside those areas.
  function nearest(lat, lng) {
    let best = null;
    for (const [cityKey, c] of Object.entries(CITIES)) for (const [area, a, b] of c.localities) {
      const km = haversine([lat, lng], [a, b]);
      if (!best || km < best.km) best = { km, area, city: c.name, cityKey, pincode: AREA_PINS[cityKey][area] };
    }
    if (best.km <= 25) return { ...best, km: +best.km.toFixed(1) };
    let pin = null;
    for (const [k, p] of [...Object.entries(PIN2).map(([k2, v]) => [k2 + '0', v]), ...Object.entries(PIN3)]) {
      const km = haversine([lat, lng], [p[0], p[1]]);
      if (!pin || km < pin.km) pin = { km, pincode: String(k).padEnd(6, '0').slice(0, 5) + '1' };
    }
    return { km: +pin.km.toFixed(1), area: null, city: null, cityKey: null, pincode: pin.pincode };
  }
  return { parseInput, buildOptions, resolveRoute, resolvePlace, createBooking, trackById, areaPoint, haversine, pinPoint, nearest, cities: CITIES };
};
