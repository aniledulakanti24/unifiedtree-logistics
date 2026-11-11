// Unified dashboard API. UT Log is the bridge: it finds third-party services
// (vehicles, couriers, logistics, travel, recharges, bills) and pays for them from
// one wallet. Every provider, price and rating here is simulated demo data, and no
// money moves. Connect real partner APIs and a payment gateway before launch.
'use strict';
const crypto = require('crypto');
const holidays = require('./holidays');

const hash = (s) => crypto.createHash('md5').update(String(s)).digest().readUInt32BE(0);
const newId = (p) => p + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomBytes(2).toString('hex').toUpperCase();
const oops = (status, message, extra) => Object.assign(new Error(message), { status, extra });
const text = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);

// ---- catalogue (demo data) -----------------------------------------------------
const AIRPORTS = [
  ['BLR', 'Bengaluru', 13.2, 77.7], ['BOM', 'Mumbai', 19.09, 72.87], ['DEL', 'Delhi', 28.56, 77.1], ['HYD', 'Hyderabad', 17.24, 78.43], ['MAA', 'Chennai', 12.99, 80.17],
  ['CCU', 'Kolkata', 22.65, 88.45], ['PNQ', 'Pune', 18.58, 73.92], ['AMD', 'Ahmedabad', 23.07, 72.63], ['COK', 'Kochi', 10.15, 76.4], ['GOI', 'Goa', 15.38, 73.83], ['JAI', 'Jaipur', 26.82, 75.81],
  ['DXB', 'Dubai', 25.25, 55.36, 1], ['SIN', 'Singapore', 1.36, 103.99, 1], ['BKK', 'Bangkok', 13.69, 100.75, 1], ['LHR', 'London', 51.47, -0.45, 1], ['FRA', 'Frankfurt', 50.03, 8.57, 1], ['JFK', 'New York', 40.64, -73.78, 1], ['YYZ', 'Toronto', 43.68, -79.63, 1], ['SYD', 'Sydney', -33.95, 151.18, 1],
];
const AIRLINES = [['IndiGo', 0.98, 4.3], ['Air India', 1.12, 4.1], ['Akasa Air', 0.95, 4.4], ['SpiceJet', 0.9, 3.8], ['Air India Express', 0.88, 4.0]];
const INTL_AIRLINES = [['Emirates', 1.25, 4.7], ['Singapore Airlines', 1.3, 4.8], ['Qatar Airways', 1.22, 4.7], ['Lufthansa', 1.18, 4.3], ['Air India', 1, 4.0], ['IndiGo', 0.9, 4.2]];
const BUS_CITIES = [['Bengaluru', 12.97, 77.59], ['Chennai', 13.08, 80.27], ['Hyderabad', 17.39, 78.49], ['Mumbai', 19.08, 72.88], ['Pune', 18.52, 73.86], ['Delhi', 28.61, 77.21], ['Jaipur', 26.91, 75.79], ['Goa', 15.5, 73.83], ['Kochi', 9.93, 76.27], ['Mysuru', 12.3, 76.65], ['Vijayawada', 16.51, 80.65], ['Ahmedabad', 23.02, 72.57]];
const BUS_OPERATORS = [['VRL Travels', 1, 4.2, 'AC sleeper'], ['SRS Travels', 0.94, 4.0, 'Non-AC sleeper'], ['Orange Tours', 1.12, 4.4, 'Volvo AC sleeper'], ['KSRTC Airavat', 1.02, 4.3, 'Volvo AC seater'], ['APSRTC Garuda', 0.92, 4.0, 'AC seater'], ['IntrCity SmartBus', 1.18, 4.5, 'AC sleeper'], ['Zingbus', 1.06, 4.3, 'AC seater']];
const STAY_CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Jaipur', 'Goa', 'Kochi', 'Dubai', 'Singapore', 'London', 'Bangkok'];
const HOTELS = [['Taj', 'Taj Residency', 9800, 4.8], ['ITC Hotels', 'ITC Grand', 9200, 4.7], ['Marriott', 'Courtyard by Marriott', 7600, 4.5], ['Lemon Tree', 'Lemon Tree Premier', 4600, 4.2], ['Ginger', 'Ginger Hotel', 2900, 4.0], ['Treebo', 'Treebo Trend', 2100, 4.0], ['FabHotels', 'FabHotel Prime', 1800, 3.9], ['OYO', 'OYO Townhouse', 1300, 3.7]];
const STAYS = [['Airbnb', 'Entire 2 BHK apartment', 3400, 4.6, 'Apartment'], ['Vista Rooms', 'Hillside villa', 8600, 4.7, 'Villa'], ['Zostel', 'Backpacker dorm bed', 750, 4.4, 'Hostel'], ['Stanza Living', 'Co-living private room', 1250, 4.2, 'Co-living'], ['Zolo', 'PG room with meals', 950, 3.9, 'PG'], ['Oakwood', 'Serviced studio', 4800, 4.5, 'Serviced apartment'], ['Local Homestays', 'Family homestay', 1600, 4.5, 'Homestay']];
const RIDES = [['Rapido', 'bike', 'Bike', 0.85, 4.2, 3], ['Rapido', 'auto', 'Auto', 0.9, 4.1, 4], ['Rapido', 'cab', 'Cab', 0.9, 4.1, 6], ['Uber', 'bike', 'Moto', 1, 4.3, 3], ['Uber', 'auto', 'Auto', 1.04, 4.3, 5], ['Uber', 'cab', 'Go', 1.05, 4.4, 5], ['Uber', 'xl', 'XL', 1.1, 4.5, 9], ['Ola', 'bike', 'Bike', 0.95, 4.0, 4], ['Ola', 'auto', 'Auto', 0.98, 4.0, 5], ['Ola', 'cab', 'Mini', 1, 4.1, 6], ['Namma Yatri', 'auto', 'Auto', 0.88, 4.4, 6], ['Namma Yatri', 'cab', 'Cab', 0.92, 4.3, 8]];
const RIDE_FARE = { bike: [25, 7, 26], auto: [35, 12, 22], cab: [70, 17, 24], xl: [110, 24, 24] };
const OPERATORS = { Jio: 1, Airtel: 1.06, Vi: 1.04, BSNL: 0.8 };
const CIRCLES = ['Karnataka', 'Maharashtra', 'Delhi NCR', 'Tamil Nadu', 'Telangana', 'Andhra Pradesh', 'Kerala', 'Gujarat', 'Rajasthan', 'West Bengal', 'Uttar Pradesh'];
const PLANS = [['p1', 199, '28 days', '1.5 GB/day', 'Popular'], ['p2', 299, '28 days', '2 GB/day', 'Best value'], ['p3', 479, '56 days', '1.5 GB/day', ''], ['p4', 719, '84 days', '2 GB/day', ''], ['p5', 2999, '365 days', '2.5 GB/day', 'Annual'], ['p6', 49, '1 day', '6 GB', 'Data pack'], ['p7', 1599, '30 days', 'International roaming', 'Roaming']];
const FASTAG_ISSUERS = ['ICICI Bank', 'HDFC Bank', 'Axis Bank', 'SBI', 'Kotak Bank', 'IDFC First Bank', 'Airtel Payments Bank', 'IHMCL'];
// Grouped like the UPI apps. open: you enter the amount. mode quote/lookup: fetch returns a quote or a check.
const BILLERS = {
  postpaid: { group: 'Telecom & Recharges', label: 'Mobile Postpaid', hint: 'Mobile number', list: ['Airtel Postpaid', 'Jio Postpaid', 'Vi Postpaid', 'BSNL Postpaid'] },
  dth: { group: 'Telecom & Recharges', label: 'DTH', hint: 'Subscriber ID', open: true, list: ['Tata Play', 'Airtel Digital TV', 'Dish TV', 'Sun Direct', 'd2h'] },
  cable: { group: 'Telecom & Recharges', label: 'Cable TV', hint: 'Subscriber ID', list: ['Hathway', 'DEN', 'GTPL', 'Siti Networks'] },
  play: { group: 'Telecom & Recharges', label: 'Google Play', hint: 'Email for the code', open: true, list: ['Google Play Code'] },
  roaming: { group: 'Telecom & Recharges', label: 'International Roaming', hint: 'Mobile number', open: true, list: ['Airtel IR pack', 'Jio IR pack', 'Vi IR pack'] },
  sim: { group: 'Telecom & Recharges', label: 'Get SIM', hint: 'Delivery pin code', open: true, badge: 'Prepaid', min: 199, list: ['Airtel SIM', 'Jio SIM', 'Vi SIM', 'BSNL SIM'] },
  apple: { group: 'Telecom & Recharges', label: 'Apple Store', hint: 'Apple Account email', open: true, list: ['Apple Gift Card'] },
  subscription: { group: 'Telecom & Recharges', label: 'Subscriptions', hint: 'Registered mobile or email', open: true, list: ['JioHotstar', 'SonyLIV', 'ZEE5', 'Times Prime', 'YouTube Premium'] },
  electricity: { group: 'Utilities', label: 'Electricity', hint: 'Consumer number', list: ['BESCOM', 'MSEDCL', 'Tata Power Delhi', 'TGSPDCL', 'TANGEDCO', 'Adani Electricity'] },
  gas: { group: 'Utilities', label: 'Piped Gas', hint: 'Consumer ID', list: ['Mahanagar Gas', 'IGL', 'Adani Total Gas', 'GAIL Gas'] },
  lpg: { group: 'Utilities', label: 'Book Cylinder', hint: 'Consumer ID or mobile', list: ['Indane', 'HP Gas', 'Bharat Gas'] },
  water: { group: 'Utilities', label: 'Water', hint: 'Connection ID', list: ['BWSSB', 'Delhi Jal Board', 'MCGM Water', 'HMWSSB'] },
  broadband: { group: 'Utilities', label: 'Broadband', hint: 'Account number', list: ['JioFiber', 'Airtel Xstream', 'ACT Fibernet', 'BSNL Bharat Fibre'] },
  landline: { group: 'Utilities', label: 'Landline', hint: 'Number with STD code', list: ['BSNL Landline', 'Airtel Landline', 'MTNL Delhi', 'MTNL Mumbai'] },
  prepaid_meter: { group: 'Utilities', label: 'Prepaid Meter', hint: 'Meter number', open: true, list: ['BESCOM Prepaid', 'TPDDL Smart Meter', 'MSEDCL Smart Meter', 'UPPCL Prepaid'] },
  ev: { group: 'Utilities', label: 'EV Recharge', hint: 'Registered mobile', open: true, badge: 'New', list: ['Tata Power EZ Charge', 'Statiq', 'ChargeZone', 'Jio-bp pulse'] },
  ncmc: { group: 'Vehicle Payments', label: 'NCMC Recharge', hint: 'Card number', open: true, list: ['SBI NCMC', 'Airtel Payments NCMC', 'Paytm NCMC'] },
  metro: { group: 'Vehicle Payments', label: 'Metro Card', hint: 'Card number', open: true, list: ['Delhi Metro', 'Namma Metro', 'Mumbai Metro', 'Hyderabad Metro', 'Chennai Metro', 'Kochi Metro'] },
  car_ins: { group: 'Vehicle Payments', label: 'Car Insurance', hint: 'Car number', mode: 'quote', list: ['ACKO', 'Digit', 'ICICI Lombard', 'Tata AIG'] },
  bike_ins: { group: 'Vehicle Payments', label: 'Bike Insurance', hint: 'Bike number', mode: 'quote', list: ['ACKO', 'Digit', 'ICICI Lombard', 'Tata AIG'] },
  accident: { group: 'Vehicle Payments', label: 'Accident Cover', hint: 'Mobile number', open: true, list: ['ACKO Personal Accident', 'Digit Personal Accident'] },
  challan: { group: 'Vehicle Payments', label: 'eChallan', hint: 'Challan or vehicle number', list: ['Karnataka Police', 'Delhi Traffic Police', 'Maharashtra Traffic Police', 'Telangana Police'] },
  policycheck: { group: 'Vehicle Payments', label: 'Motor Policy Expiry', hint: 'Vehicle number', mode: 'lookup', list: ['Any insurer'] },
  fleet: { group: 'Vehicle Payments', label: 'Fleet Card', hint: 'Fleet card number', open: true, list: ['IOCL Fleet Card', 'BPCL SmartFleet', 'HPCL DriveTrack Plus'] },
  credit: { group: 'Finance & Tax', label: 'Credit Card Bill', hint: 'Registered mobile number', no_card: true, list: ['HDFC Bank Card', 'ICICI Bank Card', 'SBI Card', 'Axis Bank Card', 'Kotak Card', 'AU Bank Card'] },
  loan: { group: 'Finance & Tax', label: 'Loan Repayment', hint: 'Loan account number', no_card: true, list: ['Bajaj Finance', 'HDFC Bank Loans', 'Tata Capital', 'IDFC First Loans'] },
  insurance: { group: 'Finance & Tax', label: 'LIC / Insurance', hint: 'Policy number', list: ['LIC', 'HDFC Life', 'ICICI Lombard', 'Star Health'] },
  rd: { group: 'Finance & Tax', label: 'Recurring Deposit', hint: 'RD account number', open: true, no_card: true, list: ['India Post RD', 'SBI RD', 'HDFC Bank RD'] },
  nps: { group: 'Finance & Tax', label: 'NPS Contribution', hint: 'PRAN', open: true, no_card: true, list: ['Protean NPS', 'KFintech NPS'] },
  itr: { group: 'Finance & Tax', label: 'File ITR', hint: 'PAN', open: true, list: ['Assisted filing', 'Self filing with expert review'] },
  tax: { group: 'Housing & Society', label: 'Municipal Tax', hint: 'Property ID', list: ['BBMP', 'MCGM', 'GHMC', 'Greater Chennai Corporation'] },
  municipal: { group: 'Housing & Society', label: 'Municipal Services', hint: 'Application number', open: true, list: ['BBMP Services', 'MCD Services', 'Pune Municipal Corporation'] },
  rent: { group: 'Housing & Society', label: 'Rentals', hint: 'Landlord UPI ID or account', open: true, list: ['House rent', 'Shop rent', 'Office rent'] },
  society: { group: 'Housing & Society', label: 'Apartment', hint: 'Flat or member ID', list: ['NoBrokerHood', 'MyGate', 'ApnaComplex', 'ADDA'] },
  clubs: { group: 'Housing & Society', label: 'Clubs & Associations', hint: 'Member ID', open: true, list: ['Residents association', 'Sports club', 'Professional body'] },
  donation: { group: 'Others', label: 'Donation', hint: 'Your mobile or PAN', open: true, list: ['Akshaya Patra', 'CRY', 'GiveIndia', 'HelpAge India'] },
  devotion: { group: 'Others', label: 'Devotion', hint: 'Your mobile', open: true, list: ['Tirumala Tirupati Devasthanams', 'Shri Siddhivinayak Temple', 'Shirdi Sai Baba Sansthan', 'Golden Temple Langar'] },
  education: { group: 'Others', label: 'Education Fee', hint: 'Student ID', open: true, list: ['School fees', 'College fees', 'Coaching fees'] },
  hospital: { group: 'Others', label: 'Hospital', hint: 'Patient or bill ID', open: true, list: ['Apollo Hospitals', 'Fortis', 'Manipal Hospitals', 'Max Healthcare'] },
  rentcc: { group: 'Others', label: 'Rent via Credit Card', hint: 'Landlord UPI ID or account', open: true, cc_only: true, fee_pct: 1.6, badge: '1.6% fee', list: ['House rent', 'Office rent'] },
  feescc: { group: 'Others', label: 'Fees via Credit Card', hint: 'Student ID', open: true, cc_only: true, fee_pct: 1.6, badge: '1.6% fee', list: ['School fees', 'College fees', 'Coaching fees'] },
};
const BILL_OFFERS = [
  { id: 'ELEC50', cat: 'electricity', title: '₹50 back on electricity', text: 'On a bill of ₹500 or more. Once.', flat: 50, min: 500 },
  { id: 'DTH10', cat: 'dth', title: '10% back on DTH', text: 'Up to ₹75 on ₹200 or more. Once.', pct: 10, cap: 75, min: 200 },
  { id: 'CARD1', cat: 'credit', title: '1% back on card bills', text: 'Up to ₹200 when you pay by UPI. Once.', pct: 1, cap: 200, min: 1000, via: 'upi' },
  { id: 'RENTFREE', cat: 'rentcc', title: 'No fee on your first rent', text: 'The 1.6% card fee is waived once.', waive: true },
  { id: 'EV20', cat: 'ev', title: '₹20 back on EV charging', text: 'On ₹300 or more. Once.', flat: 20, min: 300 },
];
const VOUCHERS = [
  ['amazon', 'Amazon Pay', 'Shopping', 100, 2, 'best'], ['flipkart', 'Flipkart', 'Shopping', 100, 3, 'best'], ['myntra', 'Myntra', 'Shopping', 250, 5, 'deal'], ['ajio', 'AJIO', 'Shopping', 500, 6, 'new'],
  ['zepto', 'Zepto', 'Grocery', 100, 3, 'best'], ['bigbasket', 'BigBasket', 'Grocery', 250, 4, 'deal'], ['blinkit', 'Blinkit', 'Grocery', 100, 2, 'new'],
  ['tanishq', 'Tanishq', 'Jewellery', 1000, 4, 'best'], ['caratlane', 'CaratLane', 'Jewellery', 1000, 5, 'deal'],
  ['mmt', 'MakeMyTrip', 'Travel & Transport', 500, 4, 'best'], ['uber', 'Uber', 'Travel & Transport', 250, 3, 'new'], ['irctc', 'IRCTC eWallet', 'Travel & Transport', 500, 1, 'deal'],
  ['nykaa', 'Nykaa', 'Beauty & Wellness', 250, 6, 'best'], ['cultfit', 'cult.fit', 'Beauty & Wellness', 500, 5, 'new'],
  ['swiggy', 'Swiggy', 'Dining', 250, 4, 'best'], ['zomato', 'Zomato', 'Dining', 250, 4, 'deal'], ['dominos', "Domino's", 'Dining', 250, 7, 'deal'],
  ['playstore', 'Google Play', 'Gaming', 100, 1, 'best'], ['steam', 'Steam Wallet', 'Gaming', 500, 2, 'new'],
  ['spotify', 'Spotify Premium', 'OTT & Music', 119, 5, 'best'], ['bms', 'BookMyShow', 'OTT & Music', 250, 6, 'deal'], ['prime', 'Amazon Prime', 'OTT & Music', 1499, 3, 'new'],
].map(([id, brand, category, from, cashback, tab]) => ({ id, brand, category, from, cashback, tab, values: [from, from * 2, from * 4, from * 10].filter((v) => v <= 10000) }));
const METAL_RATE = { gold: 9850, silver: 112 }; // ₹ per gram, sandbox prices
const UPI_APPS = ['PhonePe', 'Google Pay', 'Paytm', 'super.money', 'BHIM', 'CRED', 'Amazon Pay', 'Navi', 'MobiKwik', 'WhatsApp'];
const TEST_CARDS = ['Sandbox Visa ending 1111', 'Sandbox Mastercard ending 4444', 'Sandbox RuPay ending 0007'];
const BANKS = ['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Bank', 'Canara Bank', 'Bank of Baroda', 'Punjab National Bank'];
const PAY_LATER = ['Simpl', 'LazyPay', 'Amazon Pay Later', 'ICICI PayLater', 'Flipkart Pay Later'];
const EWALLETS = ['Paytm Wallet', 'Amazon Pay Balance', 'PhonePe Wallet', 'MobiKwik Wallet', 'Freecharge Wallet'];
const GIFT_CARDS = ['UT Log Gift Card', 'Corporate Gift Card'];
const UPI_KINDS = ['UPI', 'UPI Lite', 'RuPay Credit on UPI'];
const CARD_NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'American Express', 'Diners Club'];
const EMI_MONTHS = [3, 6, 9, 12];
const PAY_LABEL = { wallet: 'Wallet', upi: 'UPI', card: 'Card', emi: 'EMI', netbanking: 'Netbanking', paylater: 'Pay Later', ewallet: 'Other wallet', giftcard: 'Gift card', neft: 'Bank transfer' };
const NO_CARD = ['card', 'emi', 'paylater', 'giftcard'];
const VPA_RE = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;
const BUSINESS_TYPES = {
  vendor: { label: 'Vendor payout', payee: 'Vendor UPI ID or account number', ref: 'Invoice number' },
  gst: { label: 'GST challan', payee: 'GSTIN', ref: 'CPIN' },
  tds: { label: 'TDS payment', payee: 'TAN', ref: 'Assessment year' },
  rent: { label: 'Office rent', payee: 'Landlord UPI ID or account number', ref: 'Month' },
  payroll: { label: 'Payroll', payee: 'Payroll batch name', ref: 'Month' },
  freight: { label: 'Freight invoice', payee: 'Transporter name', ref: 'LR or invoice number' },
  customs: { label: 'Customs duty', payee: 'IEC code', ref: 'Bill of entry number' },
  saas: { label: 'Subscriptions', payee: 'Service name', ref: 'Billing period' },
  pf: { label: 'EPF / ESI', payee: 'Establishment code', ref: 'Wage month' },
  ptax: { label: 'Professional tax', payee: 'PTRC number', ref: 'Month' },
  advtax: { label: 'Advance tax', payee: 'Company PAN', ref: 'Quarter' },
  utilities: { label: 'Office utilities', payee: 'Biller and account number', ref: 'Bill month' },
};
const APPS = [['tally', 'Tally', 'Accounting'], ['zoho', 'Zoho Books', 'Accounting'], ['quickbooks', 'QuickBooks', 'Accounting'], ['shopify', 'Shopify', 'Store'], ['woocommerce', 'WooCommerce', 'Store'], ['amazon', 'Amazon Seller', 'Marketplace'], ['flipkart', 'Flipkart Seller', 'Marketplace'], ['razorpay', 'Razorpay', 'Payments'], ['crm', 'Unifiedtree CRM', 'CRM']];
const TRAINS = [['Vande Bharat Express', 'Chair car', 2.1, 4.6, 92], ['Rajdhani Express', 'AC 3 tier', 1.9, 4.5, 78], ['Shatabdi Express', 'Chair car', 1.6, 4.4, 80], ['Duronto Express', 'AC 3 tier', 1.75, 4.3, 72], ['Superfast Express', 'Sleeper', 0.62, 3.9, 58], ['Intercity Express', 'Second sitting', 0.42, 3.8, 52]];
const COUPONS = {
  FIRST100: { label: '₹100 off one booking over ₹300', flat: 100, min: 300, once: true, sections: null },
  SHIP10: { label: '10% off transport, up to ₹250', pct: 10, cap: 250, min: 200, sections: ['vehicle', 'courier', 'logistics', 'international'] },
  TRAVEL300: { label: '₹300 off travel over ₹3,000', flat: 300, min: 3000, sections: ['travel'] },
  RIDE20: { label: '20% off local rides, up to ₹50', pct: 20, cap: 50, min: 50, sections: ['rides'] },
};
const TIERS = [['Silver', 0, 1], ['Gold', 25000, 1.5], ['Platinum', 100000, 2]]; // name, 90-day spend, points per ₹100
const EXTRAS = { fragile: 49, packaging: 99, priority: 79 };
const SERVICES = {
  warehouse: { name: 'Warehousing', unit: 'pallets for a month', rate: 650, sub: 'Secure storage with inventory tracking', providers: [['Mahindra Logistics', 1.2, 4.5], ['Delhivery Fulfilment', 1.05, 4.3], ['TCI Supply Chain', 1.1, 4.2], ['City Storage Co', 0.85, 4.0]] },
  coldchain: { name: 'Cold chain', unit: 'pallets', rate: 1800, sub: 'Temperature-controlled transport', providers: [['Snowman Logistics', 1.15, 4.5], ['ColdStar Freight', 1, 4.2], ['FreshMove', 0.92, 4.0]] },
  customs: { name: 'Customs clearance', unit: 'shipments', rate: 3500, sub: 'Licensed customs broker and documents', providers: [['DHL Customs Services', 1.3, 4.6], ['Expeditors', 1.2, 4.4], ['Harbour Clearing Agents', 0.85, 4.1]] },
  rental: { name: 'Vehicle rental', unit: 'days', rate: 2400, sub: 'Truck or van with driver, by the day', providers: [['BlackBuck Rentals', 1, 4.2], ['Porter Hire', 1.1, 4.4], ['Local Fleet Hire', 0.85, 4.0]] },
  packaging: { name: 'Packaging supplies', unit: 'boxes', rate: 45, sub: 'Cartons, tape and bubble wrap, delivered', providers: [['PackMart', 1, 4.3], ['BoxKraft', 0.92, 4.1], ['SafeWrap', 1.1, 4.5]] },
};
const SECTION_KEYS = ['vehicle', 'courier', 'logistics', 'international', 'travel', 'rides', 'recharge', 'bills', 'business'];

module.exports = function register(routes, { send }, ctx, engine) {
  const { seller, debit, credit, paginate, iso, day } = ctx;
  const quotes = new Map(); // id -> { owner, section, input, options, expires }
  const offers = new Map(); // id -> { owner, kind, offer, expires }

  const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---- per-account state --------------------------------------------------------
  function hubOf(db, user) {
    if (db.hub) return db.hub;
    const now = Date.now();
    const records = [
      ['courier', 'Courier parcel', 'Blue Dart', 'Bengaluru → Mumbai', 412, 2], ['vehicle', 'Three-wheeler cargo', 'Porter', 'Koramangala → Whitefield', 386, 3], ['recharge', 'Mobile recharge ₹299', 'Jio', '98•••••210', 299, 5],
      ['travel', 'Flight BLR → DEL', 'IndiGo', '1 traveller', 6240, 8], ['logistics', 'Full truck · Pickup 8 ft', 'BlackBuck', 'Pune → Hyderabad', 18650, 11], ['bills', 'Electricity bill', 'BESCOM', 'Consumer 40••••12', 1284, 14],
      ['rides', 'Auto ride', 'Rapido', 'Indiranagar → MG Road', 118, 16], ['international', 'International express', 'DHL Express', 'Bengaluru → Dubai', 2864, 21], ['recharge', 'FASTag recharge', 'ICICI Bank', 'KA 05 MN ••21', 500, 25],
    ].map(([section, title, provider, sub, amount, ago], n) => ({ id: 'UT' + (1000 + n), section, title, provider, sub, amount, pay_mode: 'prepaid', status: section === 'courier' || section === 'vehicle' || section === 'logistics' || section === 'international' ? 'DELIVERED' : 'SUCCESS', label: 'Completed', at: iso(now - ago * day), sample: true, weight: { courier: 5, vehicle: 120, logistics: 1200, international: 8 }[section] }));
    const total = records.reduce((s, r) => s + r.amount, 0);
    records.forEach((r) => db.wallet.push({ id: Math.random() + now, type: 'debit', amount: r.amount, note: `${r.title} · ${r.provider}`, at: r.at }));
    db.wallet.push({ id: Math.random() + now, type: 'credit', amount: total, note: 'Added from UPI (sample)', at: iso(now - 26 * day) });
    db.wallet.sort((a, b) => b.at.localeCompare(a.at));
    db.hub = {
      profile: { account_type: null, name: user.name || '', email: user.email || '', mobile: user.mobile || '', dob: '', company: '', gstin: '', pan: '', industry: '', employees: '', iec: '',
        addresses: [], bank: { holder: '', account: '', ifsc: '' }, upi: '', notifications: { bookings: true, wallet: true, autopay: true, offers: false, whatsapp: true, sms: true, email: true }, connected: {}, language: 'en', currency: 'INR', theme: 'light', twofa: false },
      records,
      accounts: [
        { id: 'A1', type: 'fastag', provider: 'ICICI Bank', label: 'KA 05 MN 4821', balance: 340, auto: true, threshold: 200, amount: 500, last_run: null },
        { id: 'A2', type: 'mobile', provider: 'Jio', label: '9876543210', balance: null, auto: false, threshold: null, amount: 299, last_run: null },
        { id: 'A3', type: 'bill', provider: 'BESCOM', label: '4012345612', balance: null, auto: false, threshold: null, amount: 1500, last_run: null },
      ],
      wallet_rule: { enabled: false, threshold: 500, amount: 2000, source: 'UPI · demo@upi' },
      rewards: { points: Math.floor(total / 100), saved: 0, used_coupons: [], history: [{ at: iso(now - 25 * day), points: Math.floor(total / 100), note: 'Points from past bookings (sample)' }] },
      budgets: {},
      alerts: [],
      holidays: [],
    };
    db.hub.accounts.forEach((a, n) => { a.next_due = localDay(now + (n * 5 - 1) * day); });
    return db.hub;
  }
  // Seller routes with hub state attached, and refusals turned into API errors.
  const hub = (fn) => seller(async (c) => {
    const actorHub = hubOf(c.db, c.user);
    Object.defineProperty(actorHub, '_actor', { value: { key: c.user.key, role: c.role }, writable: true, configurable: true, enumerable: false });
    try { await fn({ ...c, h: actorHub, owner: c.ownerKey }); }
    catch (err) {
      if (err.status) return send(c.res, err.status, { message: err.message, ...(err.extra || {}) });
      if (err.constructor === Error) return send(c.res, 400, { message: err.message }); // validation from the booking engine
      throw err;
    }
  });

  // ---- wallet --------------------------------------------------------------------
  // Per-person spending limits set by the owner. Above the limit needs an approved allowance.
  function spendGuard(h, amount, peek) {
    const a = h._actor;
    if (!a || a.role === 'owner' || !h.spend) return;
    const rule = h.spend.rules[a.key] || h.spend.rules['*'];
    if (!rule) return;
    const mon = localDay(Date.now()).slice(0, 7);
    const u = h.spend.usage[a.key] = h.spend.usage[a.key] || {};
    const used = u[mon] || 0;
    if ((rule.per_txn && amount > rule.per_txn) || (rule.monthly && used + amount > rule.monthly)) {
      const allowance = h.spend.approved[a.key] || 0;
      if (allowance < amount) throw oops(403, 'This payment is above your spending limit. Ask the owner to approve it.', { needs_approval: true, amount });
      if (!peek) h.spend.approved[a.key] = allowance - amount;
    }
    if (!peek) u[mon] = used + amount;
  }
  function ensureFunds(db, h, amount) {
    spendGuard(h, amount);
    const rule = h.wallet_rule;
    if (rule.enabled && db.balance - amount < rule.threshold) {
      const need = Math.max(rule.amount, Math.ceil((amount + rule.threshold - db.balance) / 100) * 100);
      credit(db, need, `Auto top-up from ${rule.source} (demo)`);
    }
    if (db.balance < amount) throw oops(402, 'Your wallet balance is too low for this payment. Add money, then try again.', { shortfall: Math.ceil(amount - db.balance), needs_topup: true });
  }
  function takePayment(db, h, amount, note) { ensureFunds(db, h, amount); debit(db, amount, note); }
  // Pays from the wallet, or uses a finished UPI, card or netbanking checkout.
  function findPaid(h, amount, paymentId, noCard) {
    const p = (h.checkouts || []).find((x) => x.id === paymentId);
    if (!p || p.status !== 'SUCCESS' || p.used || p.amount !== amount) throw oops(400, 'We could not match this payment. Please pay again.');
    if (noCard && NO_CARD.includes(p.method)) throw oops(400, 'This cannot be paid that way. Use UPI, netbanking or wallet.');
    return p;
  }
  function settle(db, h, amount, note, paymentId, noCard) {
    if (!paymentId) { takePayment(db, h, amount, note); return { pay_via: 'wallet' }; }
    const p = findPaid(h, amount, paymentId, noCard);
    spendGuard(h, amount);
    p.used = true;
    return { pay_via: p.method, pay_detail: p.detail };
  }
  const dryRun = (res, h, amount) => { spendGuard(h, amount, true); send(res, 200, { ok: true, amount }); };

  function addRecord(h, r) {
    const rec = { id: r.id || newId('UT'), at: iso(Date.now()), status: 'SUCCESS', label: 'Completed', ...r };
    h.records.unshift(rec);
    if (rec.pay_mode === 'prepaid') {
      rec.earned = Math.floor((rec.amount / 100) * tierOf(h).rate);
      if (rec.earned) { h.rewards.points += rec.earned; h.rewards.history.unshift({ at: rec.at, points: rec.earned, note: rec.title }); }
    }
    return rec;
  }

  // ---- rewards and coupons -----------------------------------------------------------
  function tierOf(h) {
    const since = Date.now() - 90 * day;
    const spend = h.records.filter((r) => r.status !== 'CANCELLED' && Date.parse(r.at) >= since).reduce((s, r) => s + r.amount, 0);
    let n = 0;
    TIERS.forEach((t, i) => { if (spend >= t[1]) n = i; });
    const next = TIERS[n + 1];
    return { name: TIERS[n][0], rate: TIERS[n][2], spend, next: next ? { name: next[0], need: next[1] - spend, at: next[1] } : null };
  }
  function couponValue(h, code, section, amount) {
    const c = COUPONS[code];
    if (!c) return { error: 'That coupon code is not valid.' };
    if (c.sections && !c.sections.includes(section)) return { error: 'That coupon does not apply to this service.' };
    if (c.once && h.rewards.used_coupons.includes(code)) return { error: 'You have already used that coupon.' };
    if (amount < c.min) return { error: `This coupon needs a minimum of ₹${c.min.toLocaleString('en-IN')}.` };
    return { discount: Math.min(amount, c.flat || Math.min(c.cap, Math.round((amount * c.pct) / 100))), label: c.label };
  }
  // Coupon and points are worked out here, never trusted from the browser.
  function priceWith(h, section, amount, body) {
    let discount = 0; let coupon = null;
    const code = text(body.coupon, 20).toUpperCase();
    if (code) { const v = couponValue(h, code, section, amount); if (v.error) throw oops(400, v.error); discount = v.discount; coupon = code; }
    const points = body.use_points ? Math.min(h.rewards.points, Math.floor((amount - discount) * 0.1)) : 0;
    return { coupon, discount, points, payable: amount - discount - points };
  }
  function settleDeal(h, deal, title) {
    if (deal.coupon && COUPONS[deal.coupon].once) h.rewards.used_coupons.push(deal.coupon);
    if (deal.points) { h.rewards.points -= deal.points; h.rewards.history.unshift({ at: iso(Date.now()), points: -deal.points, note: title }); }
    h.rewards.saved += deal.discount + deal.points;
  }

  // ---- transport orders ------------------------------------------------------------
  const GROUP = { BOOKED: 'new', ASSIGNED: 'assigned', ARRIVING: 'assigned', PICKUP_SCHEDULED: 'assigned', PICKED_UP: 'transit', IN_TRANSIT: 'transit', OUT_FOR_DELIVERY: 'transit', DELIVERED: 'delivered', CANCELLED: 'cancelled', SUCCESS: 'delivered', CONFIRMED: 'new', PAY_LATER: 'new' };
  function live(r) {
    if (!r.booking_id || r.status === 'CANCELLED') return { ...r, group: GROUP[r.status] || 'new' };
    const t = engine.trackById(r.booking_id);
    if (!t) return { ...r, group: GROUP[r.status] || 'new' };
    return { ...r, status: t.status, label: t.label, progress: t.progress, remaining_min: t.remaining_min, promised_by: t.promised_by, group: GROUP[t.status] || 'new', driver: t.driver, otp: t.otp };
  }

  // Each badge goes to one option only, the first in the ranked list when several tie.
  function awardTags(list, priceOf, speedOf, speedTag) {
    const best = (score) => list.reduce((a, b) => (score(b) < score(a) ? b : a));
    list.forEach((o) => { o.tags = []; });
    list[0].tags.push('Recommended');
    best(priceOf).tags.push('Cheapest');
    best(speedOf).tags.push(speedTag);
    best((o) => -o.rating).tags.push('Top rated');
  }

  // Demo: any place the user types works. Unknown places map to a served area; the typed name is kept.
  function mimicPlaces(req) {
    const labels = {}; const out = { ...req };
    const clean = (t) => String(t || '').trim();
    const usable = (t) => clean(t).length >= 3;
    const a = engine.resolvePlace(req.from_place);
    const z = req.country ? true : engine.resolvePlace(req.to_place);
    if ((a && z) || !usable(req.from_place) || (!req.country && !usable(req.to_place))) return { req: out, labels };
    const keys = Object.keys(engine.cities);
    const place = (key, seed, avoid) => { const l = engine.cities[key].localities; let i = hash(seed) % l.length; if (l[i][0] === avoid) i = (i + 1) % l.length; return l[i][0]; };
    const isPin = (t) => /^\d+$/.test(clean(t));
    const label = (t) => clean(t).split(',')[0].slice(0, 40);
    let fromKey = a && a.cityKey; let fromArea = a && a.area;
    if (!a) {
      fromKey = (z && z !== true && z.cityKey && !isPin(req.from_place)) ? z.cityKey : keys[hash(clean(req.from_place)) % keys.length];
      fromArea = place(fromKey, clean(req.from_place), z && z !== true ? z.area : null);
      out.from_place = `${fromArea}, ${engine.cities[fromKey].name}`; labels.from = label(req.from_place);
    }
    if (!z) {
      const key = (fromKey && !isPin(req.to_place)) ? fromKey : keys[hash(clean(req.to_place)) % keys.length];
      const area = place(key, clean(req.to_place), key === fromKey ? fromArea : null);
      out.to_place = `${area}, ${engine.cities[key].name}`; labels.to = label(req.to_place);
    }
    return { req: out, labels };
  }

  function sectionFilter(section, o) {
    if (section === 'vehicle') return o.mode === 'local' && ['bike', 'auto', 'mini'].includes(o.vehicle) && !['Contractor', 'Third-party logistics'].includes(o.provider_type);
    if (section === 'courier') return o.kind === 'courier';
    if (section === 'logistics') return o.mode === 'ftl' || (o.mode === 'local' && !['bike', 'auto'].includes(o.vehicle) && o.provider_type !== 'Delivery app');
    return true;
  }

  const insightFor = (input, section) => { const n = hash(`${section}|${input.from}|${input.to}|${localDay(Date.now())}`); return n % 2 ? { tone: 'good', text: `Prices on this route are ${6 + (n % 12)}% below usual today.` } : { tone: 'warn', text: 'Demand is high on this route. Prices may rise soon.' }; };

  routes['POST /v1/hub/transport/quote'] = hub(({ res, body, owner, h }) => {
    const section = ['vehicle', 'courier', 'logistics', 'international'].includes(body.section) ? body.section : null;
    if (!section) throw oops(400, 'Choose a transport section.');
    const req = { ...body, country: section === 'international' ? body.country : undefined };
    if (section === 'international' && !req.country) throw oops(400, 'Pick a destination country.');
    const places = mimicPlaces(req);
    const route = engine.resolveRoute(places.req);
    if (section === 'vehicle' && route.service !== 'local') throw oops(400, 'Bikes, autos and vans only run inside one city. A courier can take this between cities.', { title: 'This trip crosses cities', suggest: 'courier', suggest_query: { from: route.from_pincode, to: route.to_pincode, weight: body.weight } });
    if (section === 'vehicle' && Number(body.weight) > 750) throw oops(400, 'Bikes, autos and vans carry up to 750 kg. A truck is the right fit for this load.', { title: 'Too heavy for these vehicles', suggest: 'logistics', suggest_query: { from: body.from_place, to: body.to_place, weight: body.weight } });
    const segment = section === 'logistics' ? 'b2b' : body.segment === 'b2b' ? 'b2b' : 'b2c';
    const input = engine.parseInput({ ...req, ...route, segment, declared_value: body.insure ? body.value : 0, priority: 'best' });
    if (places.labels.from) input.from = places.labels.from;
    if (places.labels.to) input.to = places.labels.to;
    // Multi-stop trips: the route runs pickup → stops → drop, with a fee per extra stop.
    const stopNames = (Array.isArray(body.stops) ? body.stops : []).map((x) => text(x, 80)).filter(Boolean).slice(0, 3);
    let stopFee = 0;
    if (stopNames.length) {
      if (route.service !== 'local') throw oops(400, 'Extra stops work inside one city. Remove them for this route.');
      const pts = [engine.areaPoint(route.city, route.from)];
      stopNames.forEach((name) => {
        const p = engine.resolvePlace(name);
        if (!p || p.cityKey !== route.city) throw oops(400, `"${name}" is not in the same city as your pickup.`);
        pts.push(engine.areaPoint(p.cityKey, p.area));
      });
      pts.push(engine.areaPoint(route.city, route.to));
      input.distanceKm = +(pts.slice(1).reduce((km, p, n) => km + engine.haversine(pts[n], p), 0) * 1.35).toFixed(1);
      stopFee = stopNames.length * 40;
    }
    // Exact map points improve the distance and let tracking draw the real route.
    const point = (p) => (p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? [Number(p.lat), Number(p.lng)] : null);
    const fromMap = point(body.from_pt); const toMap = point(body.to_pt);
    if (input.service === 'national') { const a = engine.pinPoint(input.fromPin); const z = engine.pinPoint(input.toPin); if (a) input.fromPt = [a.lat, a.lng]; if (z) input.toPt = [z.lat, z.lng]; }
    if (fromMap) input.fromPt = fromMap;
    if (toMap) input.toPt = toMap;
    if (fromMap && toMap && input.service === 'local' && !stopNames.length) input.distanceKm = Math.max(0.5, +(engine.haversine(fromMap, toMap) * 1.35).toFixed(1));
    const { options, missed } = engine.buildOptions(input);
    // Partners closed on the pickup date drop out; limited ones run a day slower.
    const pickupDay = localDay(input.pickupAt);
    const shut = new Set(); let limitedCount = 0; let holidayName = null;
    const deskCfg = desks.settingsOf(h, section);
    const offered = options.filter((o) => sectionFilter(section, o));
    deskCfg.seen = [...new Set([...deskCfg.seen, ...offered.map((o) => o.provider)])];
    const list = offered.filter((o) => !deskCfg.blocked.includes(o.provider)).filter((o) => {
      const st = holidays.statusOn(h.holidays, o.provider, pickupDay);
      if (!st) return true;
      if (st.name !== 'Sunday' || st.status === 'closed') holidayName = holidayName || st.name;
      if (st.status === 'closed') { shut.add(o.provider); return false; }
      limitedCount++; o.holiday = st.name;
      if (o.mode !== 'local') o.eta = iso(Date.parse(o.eta) + day);
      return true;
    });
    const holiday = shut.size || (limitedCount && holidayName) ? { date: pickupDay, name: holidayName, closed: [...shut], limited: limitedCount } : null;
    if (list.length) {
      const now = Date.now();
      const avg = list.reduce((a, o) => a + o.total, 0) / list.length;
      list.forEach((o) => {
        if (stopFee) { o.price += stopFee; o.total += stopFee; o.stop_fee = stopFee; }
        const seed = hash(`${o.provider}|${input.toPin || input.to}`); // varies by destination
        o.on_time = 86 + (seed % 13); // simulated service record
        o.claims_pct = +(0.2 + (seed % 9) / 10).toFixed(1);
        o.save = Math.max(0, Math.round(avg + stopFee - o.total));
        o.co2 = +((input.distanceKm || 5000) * ({ bike: 0.04, auto: 0.08, mini: 0.18, parcel: 0.1, ptl: 0.3, plane: 1.4, air: 1.4, ship: 0.2 }[o.vehicle] || 0.6)).toFixed(1);
      });
      // Rank by value, arrival and service record together.
      const minP = Math.min(...list.map((o) => o.total)); const minT = Math.min(...list.map((o) => Date.parse(o.eta) - now));
      const score = (o) => (o.total / minP) * 0.5 + ((Date.parse(o.eta) - now) / Math.max(1, minT)) * 0.2 - o.rating * 0.06 - o.on_time * 0.006;
      list.sort((a, b) => score(a) - score(b));
      awardTags(list, (o) => o.total, (o) => Date.parse(o.eta), 'Fastest');
      // Your own auto-allocation rules go first.
      const rule = section === 'courier' && ((h.parity || {}).alloc || []).find((r) => input.weight >= r.min_kg && input.weight <= r.max_kg);
      const at = rule ? list.findIndex((o) => o.provider === rule.courier) : -1;
      if (at >= 0) { const [picked] = list.splice(at, 1); picked.tags = ['Your rule', ...picked.tags.filter((t) => t !== 'Recommended')]; list.unshift(picked); }
    }
    const id = crypto.randomBytes(8).toString('hex');
    if (stopNames.length) input.to = `${input.to} (+${stopNames.length} stop${stopNames.length > 1 ? 's' : ''})`;
    const form = { from: text(body.from_place, 80), to: text(body.to_place, 80), country: body.country, weight: body.weight, pieces: body.pieces, length: body.length, breadth: body.breadth, height: body.height, category: body.category, value: body.value, stops: stopNames, helpers: body.helpers };
    quotes.set(id, { owner, section, input, options: list, form, expires: Date.now() + 20 * 60000 });
    for (const [k, q] of quotes) if (q.expires < Date.now()) quotes.delete(k);
    send(res, 200, { quote_id: id, valid_minutes: 20, section, route: { service: input.service, from: input.from, to: input.to, city: input.city || null, distance_km: input.distanceKm || null }, load: { weight: input.weight, pieces: input.pieces }, options: list, holiday, estimated: !!(places.labels.from || places.labels.to), insight: insightFor(input, section),
      message: list.length ? null : holiday && holiday.closed.length ? `Partners for this service are closed for ${holiday.name}. Try another pickup date.` : missed ? `No service can meet your deadline. ${missed} option${missed > 1 ? 's are' : ' is'} available with a later delivery.` : section === 'courier' ? 'No courier fits this load. Try Logistics for full-truck services.' : 'No service fits this load right now. Try another weight or try again in a few minutes.' });
  });

  routes['POST /v1/hub/transport/book'] = hub(({ res, body, db, h, owner }) => {
    const q = quotes.get(String(body.quote_id || ''));
    if (!q || q.owner !== owner || q.expires < Date.now()) throw oops(400, 'This quote has expired. Please search again.');
    const option = q.options.find((o) => o.id === body.option_id);
    if (!option) throw oops(400, 'Pick one of the listed services.');
    const c = body.contact || {};
    if (!text(c.name) || !/^[6-9]\d{9}$/.test(c.phone || '')) throw oops(400, 'Enter your name and a 10-digit mobile number.');
    if (text(body.pickup_address, 200).length < 8 || text(body.drop_address, 200).length < 8) throw oops(400, 'Enter full pickup and drop addresses (house or building, and street).');
    if (body.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(body.gstin).toUpperCase())) throw oops(400, 'Enter a valid GSTIN or leave it blank.');
    const rc = body.receiver || {};
    if (rc.phone && !/^[6-9]\d{9}$/.test(rc.phone)) throw oops(400, 'Enter a 10-digit mobile number for the receiver, or leave it blank.');
    const pay = body.pay_mode === 'cod' ? 'cod' : 'prepaid';
    const fee = pay === 'cod' ? Math.max(25, Math.round(option.total * 0.015)) : 0;
    const extras = (Array.isArray(body.extras) ? body.extras : []).filter((x) => EXTRAS[x]);
    const extraFee = extras.reduce((t, x) => t + EXTRAS[x], 0);
    const deal = priceWith(h, q.section, option.total + fee + extraFee, body);
    const amount = deal.payable;
    if (body.dry_run) return dryRun(res, h, amount);
    const paid = pay === 'prepaid' && body.payment_id ? findPaid(h, amount, body.payment_id) : null;
    if (paid || pay !== 'prepaid') spendGuard(h, amount); else ensureFunds(db, h, amount);
    const { id } = engine.createBooking(q, option, body);
    let via = {};
    if (paid) { paid.used = true; via = { pay_via: paid.method, pay_detail: paid.detail }; }
    else if (pay === 'prepaid') { debit(db, amount, `${option.title} · ${option.provider} · ${id}`); via = { pay_via: 'wallet' }; }
    settleDeal(h, deal, option.title);
    const i = q.input;
    const rec = addRecord(h, { id, booking_id: id, section: q.section, title: option.title, provider: option.provider, provider_type: option.provider_type, sub: `${i.from} → ${i.to}`, amount, gross: option.total + fee + extraFee, fee, extras, discount: deal.discount, coupon: deal.coupon, points_used: deal.points, insurance: option.insurance || 0, declared: option.insurance ? i.declared : 0, pay_mode: pay, ...via, status: 'BOOKED', label: 'Booking confirmed', weight: i.weight, reference: text(body.reference, 40), segment: i.segment, form: q.form, pickup_address: text(body.pickup_address, 200), drop_address: text(body.drop_address, 200), contact_name: text(c.name, 60), contact_phone: c.phone, receiver: rc.phone ? { name: text(rc.name, 60) || 'there', phone: rc.phone, consent: !!rc.consent } : null, scheduled_for: i.pickupAt > Date.now() + 3600000 ? iso(i.pickupAt) : null });
    q.options = q.options.filter((o) => o.id !== option.id);
    send(res, 200, { id: rec.id, amount, pay_mode: pay, pay_via: via.pay_via, wallet_balance: db.balance, tracking_url: `/track/?id=${id}` });
  });

  const desks = require('./desks');
  routes['POST /v1/hub/orders/cancel'] = hub(({ res, body, db, h }) => {
    const r = h.records.find((x) => x.id === body.id);
    if (!r) throw oops(404, 'We could not find that booking.');
    const v = live(r);
    if (!['new', 'assigned'].includes(v.group) || r.status === 'CANCELLED') throw oops(400, 'This booking can no longer be cancelled.');
    r.status = 'CANCELLED'; r.label = 'Cancelled'; r.cancelled_at = iso(Date.now()); r.cancel_reason = text(body.reason, 120) || 'Not recorded';
    const keep = ['flight', 'bus', 'train', 'hotel', 'stay'].includes(r.kind) && !r.flex ? 0.25 : 0;
    const refund = Math.round(r.amount * (1 - keep));
    r.refund = r.pay_mode === 'prepaid' ? refund : 0;
    const toWallet = !r.pay_via || r.pay_via === 'wallet';
    if (r.pay_mode === 'prepaid' && refund && toWallet) credit(db, refund, `Refund · ${r.title} · ${r.id}${keep ? ' (after cancellation charge)' : ''}`);
    r.refund_to = toWallet ? 'Wallet' : PAY_LABEL[r.pay_via];
    const back = (r.points_used || 0) - (r.earned || 0);
    if (back) { h.rewards.points = Math.max(0, h.rewards.points + back); h.rewards.history.unshift({ at: iso(Date.now()), points: back, note: `Cancelled · ${r.title}` }); }
    send(res, 200, { id: r.id, wallet_balance: db.balance, refund: r.pay_mode === 'prepaid' ? refund : 0 });
  });

  routes['GET /v1/hub/orders'] = hub(({ res, url, h }) => {
    const section = url.searchParams.get('section');
    const group = url.searchParams.get('group');
    const days = Number(url.searchParams.get('days')) || 0;
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const scope = url.searchParams.get('scope');
    const since = days ? Date.now() - days * day : 0;
    let list = h.records.map(live);
    if (section) list = list.filter((r) => r.section === section);
    if (url.searchParams.get('desk')) list = desks.pick(list, url.searchParams.get('desk'), url.searchParams.get('sub'));
    if (scope === 'transport') list = list.filter((r) => ['vehicle', 'courier', 'logistics', 'international'].includes(r.section));
    if (scope === 'domestic') list = list.filter((r) => ['vehicle', 'courier', 'logistics'].includes(r.section));
    if (scope === 'intl') list = list.filter((r) => r.section === 'international');
    const payF = url.searchParams.get('pay');
    if (payF) list = list.filter((r) => r.pay_mode === payF);
    if (since) list = list.filter((r) => Date.parse(r.at) >= since);
    if (search) list = list.filter((r) => `${r.id} ${r.title} ${r.provider} ${r.sub}`.toLowerCase().includes(search));
    const counts = { all: list.length, new: 0, assigned: 0, transit: 0, delivered: 0, cancelled: 0 };
    list.forEach((r) => { counts[r.group] = (counts[r.group] || 0) + 1; });
    const stages = desks.stageCounts(list);
    const gone = list.filter((r) => r.status === 'CANCELLED');
    const refunded = gone.reduce((t, r) => t + desks.refundOf(r), 0);
    const cancel_rate = list.length ? Math.round((gone.length / list.length) * 100) : 0;
    if (group && group !== 'all') list = list.filter((r) => r.group === group);
    const stage = url.searchParams.get('stage');
    if (stage === 'all') list = list.filter((r) => r.status !== 'CANCELLED');
    else if (stage === 'cancellable') list = list.filter(desks.cancellable);
    else if (stage) list = list.filter((r) => desks.stageOf(r) === stage);
    send(res, 200, { ...paginate(list, url), counts, stages, refunded, cancel_rate });
  });

  // ---- summaries -------------------------------------------------------------------
  const startOfDay = (offset = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - offset * day; };
  function sectionStats(list) {
    const t0 = startOfDay(); const y0 = startOfDay(1); const m0 = Date.now() - 30 * day;
    const paid = list.filter((r) => r.status !== 'CANCELLED');
    const sum = (a) => a.reduce((s, r) => s + r.amount, 0);
    const within = (a, from, to = Infinity) => a.filter((r) => { const t = Date.parse(r.at); return t >= from && t < to; });
    const providers = {};
    within(paid, m0).forEach((r) => { providers[r.provider] = (providers[r.provider] || 0) + r.amount; });
    return { total: list.length, today: within(paid, t0).length, yesterday: within(paid, y0, t0).length, spend_today: sum(within(paid, t0)), spend_yesterday: sum(within(paid, y0, t0)), spend_30: sum(within(paid, m0)),
      active: paid.filter((r) => ['new', 'assigned', 'transit'].includes(r.group)).length, delivered: paid.filter((r) => r.group === 'delivered').length, cancelled: list.length - paid.length,
      providers: Object.entries(providers).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5) };
  }
  function series(list, days) {
    return Array.from({ length: days }, (_, n) => { const from = startOfDay(days - 1 - n); return { day: iso(from).slice(0, 10), amount: list.filter((r) => { const t = Date.parse(r.at); return r.status !== 'CANCELLED' && t >= from && t < from + day; }).reduce((s, r) => s + r.amount, 0) }; });
  }
  const profileScore = (p, db) => [p.account_type, p.name, p.email, p.mobile, p.addresses.length, p.upi || p.bank.account, p.account_type === 'business' ? p.gstin : p.dob].filter(Boolean).length;

  function upcomingOf(h) {
    return h.accounts.filter((a) => a.next_due && a.type !== 'fastag').map((a) => ({ id: a.id, type: a.type, provider: a.provider, label: a.label, amount: a.amount, auto: a.auto, due: a.next_due, days: Math.max(0, Math.round((Date.parse(a.next_due) - today0()) / day)) })).sort((a, b) => a.days - b.days);
  }
  function budgetRows(h, list) {
    const d = new Date(); const m0 = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const l30 = Date.now() - 30 * day; const l60 = Date.now() - 60 * day;
    const live_ = list.filter((r) => r.status !== 'CANCELLED');
    const sum = (a) => a.reduce((s, r) => s + r.amount, 0);
    return SECTION_KEYS.map((k) => { const rows = live_.filter((r) => r.section === k); return { section: k, mtd: sum(rows.filter((r) => Date.parse(r.at) >= m0)), last30: sum(rows.filter((r) => Date.parse(r.at) >= l30)), prev30: sum(rows.filter((r) => { const t = Date.parse(r.at); return t >= l60 && t < l30; })), count: rows.length, budget: h.budgets[k] || 0 }; });
  }

  routes['GET /v1/hub/desk'] = hub(({ res, url, h }) => {
    const f = desks.DESKS[url.searchParams.get('desk')];
    if (!f) throw oops(400, 'Choose a service.');
    const list = desks.pick(h.records.map(live), url.searchParams.get('desk'), url.searchParams.get('sub'));
    const returns = ((h.ops2 && h.ops2.returns) || []).filter((rt) => { const rec = h.records.find((x) => x.id === rt.order_id); return rec && f(rec); }).length;
    send(res, 200, { ...sectionStats(list), stages: desks.stageCounts(list), returns, series: series(list, 14), recent: list.slice(0, 5) });
  });

  const deskKey = (url) => { const k = url.searchParams.get('desk'); if (!desks.DESKS[k]) throw oops(400, 'Choose a service.'); return k; };
  routes['GET /v1/hub/desk/analytics'] = hub(({ res, url, h }) => {
    const key = deskKey(url);
    const days = Number(url.searchParams.get('days')) || 0;
    const payF = url.searchParams.get('pay');
    const everything = desks.pick(h.records.map(live), key, url.searchParams.get('sub')).filter((r) => !payF || r.pay_mode === payF);
    const since = days ? Date.now() - days * day : 0;
    const list = everything.filter((r) => Date.parse(r.at) >= since);
    const paid = list.filter((r) => r.status !== 'CANCELLED');
    const spend = paid.reduce((t, r) => t + r.amount, 0);
    const done = list.filter((r) => r.group === 'delivered').length;
    const tally = (by) => { const m = new Map(); list.forEach((r) => { const k = by(r) || 'Other'; const e = m.get(k) || { name: k, orders: 0, spend: 0, delivered: 0, cancelled: 0 }; e.orders++; if (r.status === 'CANCELLED') e.cancelled++; else e.spend += r.amount; if (r.group === 'delivered') e.delivered++; m.set(k, e); }); return [...m.values()].sort((a, b) => b.spend - a.spend); };
    const closed = (p) => p.delivered + p.cancelled;
    const payments = tally((r) => (r.pay_mode === 'cod' ? 'Pay on delivery' : PAY_LABEL[r.pay_via] || 'Wallet')).map((p) => ({ name: p.name, orders: p.orders, amount: p.spend }));
    send(res, 200, { orders: list.length, spend, average: paid.length ? Math.round(spend / paid.length) : 0, success: list.length ? Math.round((done / list.length) * 100) : 0, cancel_rate: list.length ? Math.round(((list.length - paid.length) / list.length) * 100) : 0, series: series(everything, days ? Math.max(7, Math.min(days, 30)) : 30), providers: tally((r) => r.provider).map((p) => ({ ...p, success: closed(p) ? Math.round((p.delivered / closed(p)) * 100) : 0 })), routes: tally((r) => r.sub).slice(0, 15), payments });
  });
  routes['GET /v1/hub/desk/tower'] = hub(({ res, url, h }) => {
    const key = deskKey(url);
    const cfg = desks.settingsOf(h, key);
    const list = desks.pick(h.records.map(live), key);
    const now = Date.now();
    const row = (r, note, action) => ({ id: r.id, kind: r.kind, flex: r.flex, title: r.title, provider: r.provider, sub: r.sub || '', at: r.at, amount: r.amount, note, action, href: `#/my/orders/${r.id}` });
    const claims = { key: 'claims', label: 'Claims', empty: 'No open claims.', items: list.filter((r) => r.claim).map((r) => row(r, `${r.claim.type}: ${r.claim.status === 'APPROVED' ? 'approved' : 'in review'}`, 'open')) };
    if (key === 'pay') {
      const low = h.accounts.filter((a) => a.balance != null && a.balance < (a.threshold || 200));
      return send(res, 200, { note: 'Low balances and upcoming payments.', sections: [
        { key: 'low', label: 'Low balance', empty: 'No low balances.', items: low.map((a) => ({ id: a.id, title: a.label, provider: a.provider, amount: a.balance, note: 'Balance is below your limit', href: '#/pay/fastag', cta: 'Recharge' })) },
        { key: 'due', label: 'Due soon', empty: 'Nothing is due soon.', items: upcomingOf(h).map((u) => ({ id: u.id, title: u.label, provider: u.provider, amount: u.amount, note: u.days ? `Due in ${u.days} day${u.days > 1 ? 's' : ''}${u.auto ? ', auto-pay is on' : ''}` : 'Due today', href: '#/autopay', cta: 'Manage' })) } ] });
    }
    if (key === 'travel') {
      return send(res, 200, { note: 'Upcoming trips, stays to pay for, and claims.', sections: [
        { key: 'upcoming', label: 'Upcoming', empty: 'No upcoming trips.', items: list.filter((r) => r.group === 'new' && r.status !== 'PAY_LATER').map((r) => row(r, 'Confirmed', 'open')) },
        { key: 'paylater', label: 'Pay later', empty: 'Nothing to pay later.', items: list.filter((r) => r.status === 'PAY_LATER').map((r) => row(r, 'Payable at the property or to the driver', 'open')) },
        claims ] });
    }
    const hrs = (ms) => Math.round(ms / 3600000);
    const late = list.filter((r) => ['new', 'assigned', 'transit'].includes(r.group) && r.promised_by && now > Date.parse(r.promised_by) + cfg.delay_hours * 3600000);
    const stuck = list.filter((r) => ['new', 'assigned'].includes(r.group) && !r.sample && !(r.scheduled_for && Date.parse(r.scheduled_for) > now) && now - Date.parse(r.at) > cfg.stuck_hours * 3600000);
    const cod = list.filter((r) => r.pay_mode === 'cod' && ['new', 'assigned', 'transit'].includes(r.group));
    const waiting = ((h.ops2 && h.ops2.returns) || []).filter((rt) => rt.status === 'REQUESTED' && list.some((r) => r.id === rt.order_id));
    send(res, 200, { note: `Delayed means ${cfg.delay_hours} hour${cfg.delay_hours > 1 ? 's' : ''} past promise. Stuck means ${cfg.stuck_hours} hour${cfg.stuck_hours > 1 ? 's' : ''} without pickup.`, sections: [
      { key: 'delayed', label: 'Delayed', empty: 'Nothing is running late.', items: late.map((r) => row(r, `${Math.max(1, hrs(now - Date.parse(r.promised_by)))}h past the promised time`, r.booking_id ? 'track' : 'open')) },
      { key: 'stuck', label: 'Stuck', empty: 'No orders are waiting too long for pickup.', items: stuck.map((r) => row(r, `Waiting ${Math.max(1, hrs(now - Date.parse(r.at)))}h for pickup`, r.status === 'PAY_LATER' ? 'open' : 'cancel')) },
      claims,
      { key: 'cash', label: 'Cash due', empty: 'No pay on delivery orders are open.', items: cod.map((r) => row(r, 'Keep cash ready on delivery', 'open')) },
      { key: 'returns', label: 'Returns to approve', empty: 'No returns are waiting.', items: waiting.map((rt) => ({ id: rt.id, title: rt.title, provider: rt.provider, sub: rt.sub, at: rt.at, amount: rt.fee, note: rt.reason, href: `#/${key}/returns?group=requested`, cta: 'Review' })) } ] });
  });
  routes['GET /v1/hub/desk/settings'] = hub(({ res, url, h }) => send(res, 200, desks.settingsOf(h, deskKey(url))));
  routes['POST /v1/hub/desk/settings'] = hub(({ res, url, body, h }) => {
    const cfg = desks.settingsOf(h, deskKey(url));
    if (body.sort != null) { if (!['best', 'fast', 'low', 'rating'].includes(body.sort)) throw oops(400, 'Pick a sort order.'); cfg.sort = body.sort; }
    if (body.pay_mode != null) cfg.pay_mode = body.pay_mode === 'cod' ? 'cod' : 'prepaid';
    if (body.pickup != null) cfg.pickup = text(body.pickup, 80);
    if (Array.isArray(body.blocked)) { const b = body.blocked.map((x) => text(x, 60)).filter(Boolean); if (cfg.seen.length && cfg.seen.every((p) => b.includes(p))) throw oops(400, 'Keep at least one partner switched on.'); cfg.blocked = b; }
    for (const k of ['delay_hours', 'stuck_hours']) if (body[k] != null) { const n = Number(body[k]); if (!(Number.isInteger(n) && n >= 1 && n <= 72)) throw oops(400, 'Enter whole hours from 1 to 72.'); cfg[k] = n; }
    send(res, 200, cfg);
  });

  // ---- overview: the dashboard, compared with the period before -------------------------
  const SECTION_NAME = { vehicle: 'Vehicle', courier: 'Courier', logistics: 'Logistics', international: 'International', travel: 'Travel & stay', rides: 'Local rides', recharge: 'Recharge', bills: 'Bills', business: 'Business payments' };
  routes['GET /v1/hub/overview'] = hub(({ res, url, db, h, perms }) => {
    const days = [7, 30, 90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
    const now = Date.now(); const span = days * day;
    const all = h.records.map(live);
    const inRange = (from, to) => all.filter((r) => { const t = Date.parse(r.at); return t >= from && t < to; });
    const cur = inRange(now - span, now + 1); const prev = inRange(now - 2 * span, now - span);
    const paid = (l) => l.filter((r) => r.status !== 'CANCELLED');
    const sum = (l, f = (r) => r.amount) => l.reduce((t, r) => t + (f(r) || 0), 0);
    const closed = (l) => l.filter((r) => ['delivered', 'cancelled'].includes(r.group));
    const rate = (l) => { const c = closed(l); return c.length ? Math.round((c.filter((r) => r.group === 'delivered').length / c.length) * 100) : null; };
    const avg = (l) => { const p = paid(l); return p.length ? Math.round(sum(p) / p.length) : 0; };
    const saved = (l) => sum(l, (r) => (r.discount || 0) + (r.points_used || 0));
    // No change badge when there is nothing to compare with.
    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
    // Trend line: one point per day (per week for 90 days).
    // Trend line: a few even buckets, so sparse days do not turn into spikes.
    const n = days === 7 ? 7 : days === 30 ? 10 : 13; const width = span / n;
    const spark = (f) => Array.from({ length: n }, (_, i) => { const from = now - span + i * width; return f(inRange(from, from + width)); });
    const active = all.filter((r) => ['new', 'assigned', 'transit'].includes(r.group));
    const kpis = [
      { key: 'spend', label: 'Spend', icon: 'rupee', fmt: 'money', value: sum(paid(cur)), delta: pct(sum(paid(cur)), sum(paid(prev))), tone: 'neutral', note: `${paid(cur).length} paid orders`, href: '#/insights', spark: spark((l) => sum(paid(l))) },
      { key: 'orders', label: 'Bookings', icon: 'box', fmt: 'num', value: cur.length, delta: pct(cur.length, prev.length), tone: 'up', note: `${prev.length} in the period before`, href: '#/my/orders?scope=all&days=' + days, spark: spark((l) => l.length) },
      { key: 'done', label: 'Completion rate', icon: 'check', fmt: 'pct', bar: rate(cur), barTone: 'good', value: rate(cur), delta: rate(cur) != null && rate(prev) != null ? rate(cur) - rate(prev) : null, unit: 'pts', tone: 'up', note: `${closed(cur).length} closed orders`, href: '#/my/orders?scope=all&group=delivered&days=' + days },
      { key: 'avg', label: 'Average order', icon: 'trend', fmt: 'money', value: avg(cur), delta: pct(avg(cur), avg(prev)), tone: 'neutral', note: 'Paid orders only', href: '#/insights', spark: spark(avg) },
      { key: 'active', label: 'Active now', icon: 'truck', fmt: 'num', value: active.length, note: 'Booked or on the way', href: '#/my/orders?scope=all&days=' },
      { key: 'wallet', label: 'Wallet balance', icon: 'wallet', fmt: 'money', value: perms.wallet === 'none' ? null : db.balance, note: db.balance < 1000 ? 'Running low' : 'Ready for prepaid bookings', href: '#/wallet' },
      { key: 'saved', label: 'Saved', icon: 'tag', fmt: 'money', value: saved(cur), delta: pct(saved(cur), saved(prev)), tone: 'up', note: 'Coupons and reward points', href: '#/rewards', spark: spark(saved) },
      { key: 'cancel', label: 'Cancellations', icon: 'x', fmt: 'num', bar: cur.length ? Math.round(((cur.length - paid(cur).length) / cur.length) * 100) : null, barTone: 'bad', value: cur.length - paid(cur).length, delta: pct(cur.length - paid(cur).length, prev.length - paid(prev).length), tone: 'down', note: cur.length ? `${Math.round(((cur.length - paid(cur).length) / cur.length) * 100)}% of bookings` : 'No bookings yet', href: '#/my/orders?scope=all&group=cancelled&days=' + days },
    ];
    // Things that need a person, counted.
    const returns = ((h.ops2 && h.ops2.returns) || []).filter((rt) => rt.status === 'REQUESTED');
    const late = active.filter((r) => r.promised_by && now > Date.parse(r.promised_by));
    const claims = all.filter((r) => r.claim && r.claim.status !== 'APPROVED');
    const due = upcomingOf(h).filter((u) => u.days <= 7);
    const low = h.accounts.filter((a) => a.balance != null && a.balance < (a.threshold || 200));
    const cod = active.filter((r) => r.pay_mode === 'cod');
    const alerts = h.alerts.map(alertView).filter((a) => a.triggered);
    const attention = [
      [returns.length, 'returnbox', ['return to approve', 'returns to approve'], '#/my/returns?group=requested'],
      [late.length, 'clock', ['shipment past the promised time', 'shipments past the promised time'], '#/my/orders?scope=all&group=transit&days='],
      [claims.length, 'shield', ['claim in review', 'claims in review'], '#/my/orders?scope=all&days='],
      [due.length, 'receipt', ['payment due this week', 'payments due this week'], '#/autopay'],
      [low.length, 'fastag', ['FASTag balance running low', 'FASTag balances running low'], '#/pay/fastag'],
      [cod.length, 'cash', ['pay on delivery order open', 'pay on delivery orders open'], '#/my/orders?scope=all&pay=cod&days='],
      [alerts.length, 'bell', ['price alert hit your target', 'price alerts hit your target'], '#/travel/flights'],
    ].filter(([c]) => c).map(([count, icon, text, href]) => ({ count, icon, text: text[count === 1 ? 0 : 1], href }));
    // What the numbers say: fixed rules, most serious first.
    const insights = [];
    const s0 = sum(paid(cur)); const s1 = sum(paid(prev));
    if (late.length) insights.push({ tone: 'bad', text: `${late.length} ${late.length === 1 ? 'shipment is' : 'shipments are'} past the promised delivery time.`, href: '#/courier/tower' });
    if (returns.length) insights.push({ tone: 'warn', text: `${returns.length} ${returns.length === 1 ? 'return is' : 'returns are'} waiting for your approval.`, href: '#/my/returns?group=requested' });
    if (perms.wallet !== 'none' && db.balance < 1000) insights.push({ tone: 'warn', text: `Wallet balance is ${'₹' + db.balance.toLocaleString('en-IN')}. Prepaid bookings may not go through.`, href: '#/wallet' });
    if (due.length) insights.push({ tone: 'info', text: `${due.length} ${due.length === 1 ? 'bill or recharge is' : 'bills and recharges are'} due in the next 7 days, worth ${'₹' + sum(due).toLocaleString('en-IN')}.`, href: '#/autopay' });
    if (s1 && Math.abs(pct(s0, s1)) >= 25) insights.push({ tone: s0 > s1 ? 'warn' : 'good', text: `Spend is ${s0 > s1 ? 'up' : 'down'} ${Math.abs(pct(s0, s1))}% on the ${days} days before.`, href: '#/insights' });
    const cr = cur.length ? (cur.length - paid(cur).length) / cur.length : 0;
    if (cur.length >= 4 && cr > 0.1) insights.push({ tone: 'warn', text: `${Math.round(cr * 100)}% of bookings were cancelled. Check partner pickup times in Control Tower.`, href: '#/courier/tower' });
    budgetRows(h, all).filter((b) => b.budget && b.mtd >= b.budget * 0.8).forEach((b) => insights.push({ tone: b.mtd >= b.budget ? 'bad' : 'warn', text: `${SECTION_NAME[b.section]} has used ${Math.round((b.mtd / b.budget) * 100)}% of this month's budget.`, href: '#/insights' }));
    const topSvc = Object.entries(paid(cur).reduce((m, r) => { m[r.section] = (m[r.section] || 0) + r.amount; return m; }, {})).sort((a, b) => b[1] - a[1]);
    if (topSvc[0] && s0) insights.push({ tone: 'info', text: `${SECTION_NAME[topSvc[0][0]]} is your biggest spend, ${Math.round((topSvc[0][1] / s0) * 100)}% of the total.`, href: '#/insights' });
    // What to do first: specific items, ranked by urgency.
    const todo = [
      ...late.slice(0, 2).map((r) => ({ icon: 'clock', title: `Check ${r.id}`, sub: `${r.provider} · past the promised time`, href: `#/my/orders/${r.id}` })),
      ...returns.slice(0, 2).map((rt) => ({ icon: 'returnbox', title: `Review return ${rt.id}`, sub: `${rt.reason} · order ${rt.order_id}`, href: '#/my/returns?group=requested' })),
      ...due.slice(0, 2).map((u) => ({ icon: 'receipt', title: `Pay ${u.provider}`, sub: `${u.label} · ${u.days ? `due in ${u.days} day${u.days > 1 ? 's' : ''}` : 'due today'}`, href: '#/autopay' })),
      ...low.slice(0, 1).map((a) => ({ icon: 'fastag', title: `Recharge FASTag ${a.label}`, sub: `₹${a.balance} left with ${a.provider}`, href: '#/pay/fastag' })),
      ...alerts.slice(0, 1).map((a) => ({ icon: 'bell', title: `Book ${a.from} → ${a.to}`, sub: `Now ₹${a.current}, under your target`, href: '#/travel/flights' })),
    ].slice(0, 6);
    // Getting started.
    const p = h.profile;
    const steps = [
      ['type', 'Choose Personal or Business', !!p.account_type, '#/profile'],
      ['details', 'Add your name and email', !!(p.name && p.email), '#/profile'],
      ['address', 'Save a pickup address', p.addresses.length > 0, '#/profile?tab=addresses'],
      ['method', 'Save a payment method', (h.instruments || []).length > 0 || !!p.upi, '#/profile?tab=payments'],
      ['money', 'Add money to your wallet', db.wallet.some((w) => w.type === 'credit'), '#/wallet'],
      ['first', 'Make your first booking', h.records.some((r) => !r.sample), '#/courier/book'],
      p.account_type === 'business' ? ['kyc', 'Verify your business (KYC)', !!db.kyc, '#/kyc'] : ['autopay', 'Turn on auto-pay for a bill', h.accounts.some((a) => a.auto), '#/autopay'],
    ].map(([key, label, done, href]) => ({ key, label, done, href }));
    const bySvc = topSvc.map(([k, v]) => ({ name: SECTION_NAME[k], amount: v }));
    send(res, 200, { days, kpis, attention, insights: insights.slice(0, 6), todo, start: { done: steps.filter((x) => x.done).length, total: steps.length, steps }, by_service: bySvc, series: series(all, Math.min(days, 30)), upcoming: upcomingOf(h).slice(0, 4), recent: all.slice(0, 6) });
  });
  routes['GET /v1/hub/nav-counts'] = hub(({ res, h }) => {
    const all = h.records.map(live);
    send(res, 200, { orders: all.filter((r) => ['new', 'assigned', 'transit'].includes(r.group)).length, returns: ((h.ops2 && h.ops2.returns) || []).filter((rt) => rt.status === 'REQUESTED').length, pay: upcomingOf(h).filter((u) => u.days <= 7).length });
  });

  routes['GET /v1/hub/summary'] = hub(({ res, db, h, perms }) => {
    const list = h.records.map(live);
    const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, sectionStats(list.filter((r) => r.section === k))]));
    const low = h.accounts.filter((a) => a.balance != null && a.balance < (a.threshold || 200));
    const due = list.filter((r) => r.pay_mode === 'cod' && ['new', 'assigned', 'transit'].includes(r.group));
    send(res, 200, { wallet_balance: perms.wallet === 'none' ? null : db.balance, all: sectionStats(list), sections, recent: list.slice(0, 8), series: series(list, 14), low_accounts: low, pay_on_delivery_due: due.reduce((s, r) => s + r.amount, 0), pay_on_delivery_count: due.length, profile_score: profileScore(h.profile, db), profile_total: 7, account_type: h.profile.account_type, autopay_on: h.accounts.filter((a) => a.auto).length + (h.wallet_rule.enabled ? 1 : 0), upcoming: upcomingOf(h), alerts_triggered: h.alerts.map(alertView).filter((a) => a.triggered), budget_warnings: budgetRows(h, list).filter((b) => b.budget && b.mtd >= b.budget * 0.8), rewards: { points: h.rewards.points, saved: h.rewards.saved, tier: tierOf(h).name } });
  });

  routes['GET /v1/hub/wallet'] = hub(({ res, url, db, h }) => {
    const m0 = Date.now() - 30 * day;
    const inPeriod = db.wallet.filter((w) => Date.parse(w.at) >= m0);
    const list = h.records.map(live);
    const due = list.filter((r) => r.pay_mode === 'cod' && ['new', 'assigned', 'transit'].includes(r.group));
    // Closing balance per day, walking the ledger back from today.
    const days = 30; let bal = db.balance; const points = [];
    for (let n = 0; n < days; n++) {
      const from = startOfDay(n);
      points.unshift({ day: iso(from).slice(0, 10), balance: bal });
      db.wallet.filter((w) => { const t = Date.parse(w.at); return t >= from && t < from + day; }).forEach((w) => { bal += w.type === 'debit' ? w.amount : -w.amount; });
    }
    const type = url.searchParams.get('type');
    const fDays = Number(url.searchParams.get('days')) || 0; const fMin = Number(url.searchParams.get('min')) || 0;
    const ledger = db.wallet.filter((w) => (!type || w.type === type) && (!fDays || Date.parse(w.at) >= Date.now() - fDays * day) && w.amount >= fMin);
    send(res, 200, { balance: db.balance, added_30: inPeriod.filter((w) => w.type === 'credit').reduce((s, w) => s + w.amount, 0), spent_30: inPeriod.filter((w) => w.type === 'debit').reduce((s, w) => s + w.amount, 0), pay_on_delivery_due: due.reduce((s, r) => s + r.amount, 0), pay_on_delivery_count: due.length,
      series: points, by_section: SECTION_KEYS.map((k) => ({ section: k, amount: list.filter((r) => r.section === k && r.status !== 'CANCELLED' && r.pay_mode === 'prepaid' && Date.parse(r.at) >= m0).reduce((s, r) => s + r.amount, 0) })).filter((x) => x.amount).sort((a, b) => b.amount - a.amount), rule: h.wallet_rule, ...paginate(ledger, url) });
  });
  routes['POST /v1/hub/wallet/withdraw'] = hub(({ res, body, db, h }) => {
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 100)) throw oops(400, 'Withdraw at least ₹100.');
    if (amount > db.balance) throw oops(400, 'That is more than your wallet balance.');
    if (!h.profile.upi && !h.profile.bank.account) throw oops(400, 'Add a UPI ID or bank account in your profile first.');
    debit(db, amount, `Withdrawal to ${h.profile.upi || 'bank account'} (demo)`);
    send(res, 200, { balance: db.balance });
  });

  // ---- travel + local rides ---------------------------------------------------------
  function today0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function checkDate(s, label) { const t = Date.parse(s); if (Number.isNaN(t) || t < today0()) throw oops(400, `Pick a ${label} from today onwards.`); return t; }
  const clock = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const span = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

  const searchers = {
    flight(b) {
      const a = AIRPORTS.find((x) => x[0] === b.from); const z = AIRPORTS.find((x) => x[0] === b.to);
      if (!a || !z) throw oops(400, 'Pick both airports.');
      if (a === z) throw oops(400, 'Departure and arrival are the same airport.');
      checkDate(b.date, 'travel date');
      const pax = Math.max(1, Math.min(9, Math.floor(Number(b.pax) || 1)));
      const biz = b.cabin === 'business';
      const km = engine.haversine([a[2], a[3]], [z[2], z[3]]);
      const intl = !!(a[4] || z[4]);
      return (intl ? INTL_AIRLINES : AIRLINES).flatMap(([provider, mult, rating], n) => [0, 1].map((k) => {
        const seed = hash(`${b.from}${b.to}${b.date}${provider}${k}`);
        const stops = intl && km > 5000 && seed % 3 === 0 ? 1 : !intl && seed % 7 === 0 ? 1 : 0;
        const mins = Math.round(km / 760 * 60 + 40 + stops * 110);
        const dep = 300 + (seed % 960);
        const price = Math.round((1900 + km * (intl ? 5.2 : 4.4)) * mult * (biz ? 2.7 : 1) * (0.92 + (seed % 25) / 100)) * pax;
        return { kind: 'flight', provider, title: `${a[0]} → ${z[0]}`, sub: `${provider.slice(0, 2).toUpperCase()} ${100 + (seed % 899)} · ${biz ? 'Business' : 'Economy'}`, meta: [`${clock(dep)} – ${clock(dep + mins)}`, span(mins), stops ? '1 stop' : 'Non-stop', `${pax} traveller${pax > 1 ? 's' : ''}`], price, mins, rating, section: 'travel', premium: biz, record_title: `Flight ${a[0]} → ${z[0]}`, record_sub: `${b.date} · ${pax} traveller${pax > 1 ? 's' : ''}`, pay_later: false };
      })).filter((o, n) => n % 2 === 0 || hash(o.sub) % 2);
    },
    bus(b) {
      const a = BUS_CITIES.find((x) => x[0] === b.from); const z = BUS_CITIES.find((x) => x[0] === b.to);
      if (!a || !z) throw oops(400, 'Pick both cities.');
      if (a === z) throw oops(400, 'Departure and arrival are the same city.');
      checkDate(b.date, 'travel date');
      const seats = Math.max(1, Math.min(6, Math.floor(Number(b.seats) || 1)));
      const km = engine.haversine([a[1], a[2]], [z[1], z[2]]) * 1.28;
      if (km > 1700) throw oops(400, 'No overnight buses on this long a route. Try a flight.');
      return BUS_OPERATORS.map(([provider, mult, rating, type]) => {
        const seed = hash(`${b.from}${b.to}${b.date}${provider}`);
        const mins = Math.round(km / (46 + (seed % 10)) * 60);
        const dep = 1080 + (seed % 330);
        const price = Math.round((180 + km * 1.75) * mult) * seats;
        return { kind: 'bus', provider, title: `${a[0]} → ${z[0]}`, sub: type, meta: [`${clock(dep)} – ${clock(dep + mins)}`, span(mins), `${8 + (seed % 26)} seats left`, `${seats} seat${seats > 1 ? 's' : ''}`], price, mins, rating, section: 'travel', record_title: `Bus ${a[0]} → ${z[0]}`, record_sub: `${b.date} · ${seats} seat${seats > 1 ? 's' : ''}`, pay_later: false };
      });
    },
    train(b) {
      const a = BUS_CITIES.find((x) => x[0] === b.from); const z = BUS_CITIES.find((x) => x[0] === b.to);
      if (!a || !z) throw oops(400, 'Pick both cities.');
      if (a === z) throw oops(400, 'Departure and arrival are the same city.');
      checkDate(b.date, 'travel date');
      const pax = Math.max(1, Math.min(6, Math.floor(Number(b.pax) || 1)));
      const km = engine.haversine([a[1], a[2]], [z[1], z[2]]) * 1.25;
      return TRAINS.map(([name, cls, rate, rating, speed]) => {
        const seed = hash(`${b.from}${b.to}${b.date}${name}`);
        const mins = Math.round((km / speed) * 60);
        const dep = 300 + (seed % 960);
        const left = seed % 5 === 0 ? `Waitlist ${1 + (seed % 30)}` : `${6 + (seed % 90)} seats left`;
        return { kind: 'train', provider: name, title: `${a[0]} → ${z[0]}`, sub: `${10000 + (seed % 9000)} · ${cls}`, meta: [`${clock(dep)} – ${clock(dep + mins)}`, span(mins), left, `${pax} passenger${pax > 1 ? 's' : ''}`], price: Math.round((60 + km * rate) * pax), mins, rating, section: 'travel', record_title: `Train ${a[0]} → ${z[0]}`, record_sub: `${b.date} · ${pax} passenger${pax > 1 ? 's' : ''}`, pay_later: false };
      });
    },
    movers(b) {
      const a = BUS_CITIES.find((x) => x[0] === b.from); const z = BUS_CITIES.find((x) => x[0] === b.to);
      if (!a || !z) throw oops(400, 'Pick both cities.');
      checkDate(b.date, 'moving date');
      const size = { '1rk': [1, '1 RK'], '1bhk': [1.5, '1 BHK'], '2bhk': [2.2, '2 BHK'], '3bhk': [3, '3 BHK'], office: [3.6, 'Small office'] }[b.size];
      if (!size) throw oops(400, 'Pick your home size.');
      const km = a === z ? 18 : engine.haversine([a[1], a[2]], [z[1], z[2]]) * 1.3;
      return [['Porter Packers', 1, 4.4], ['Agarwal Movers', 1.25, 4.6], ['Leo Packers', 1.1, 4.3], ['NoBroker Movers', 0.95, 4.2], ['Local Shifting Co', 0.85, 4.0]].map(([provider, mult, rating]) => {
        const seed = hash(`${provider}${b.from}${b.to}`);
        return { kind: 'movers', provider, title: `${size[1]} move · ${a[0]} → ${z[0]}`, sub: 'Packing, loading, transport, unloading', meta: [`${b.date}`, `${2 + (seed % 3)} helpers`, seed % 2 ? 'Transit insurance included' : 'Insurance optional', `${Math.round(km)} km`], price: Math.round((3500 + km * 14) * size[0] * mult), mins: Math.round(km / 40 * 60) + 240, rating, section: 'logistics', record_title: `Movers · ${size[1]}`, record_sub: `${a[0]} → ${z[0]} · ${b.date}`, pay_later: true, pay_later_label: 'Pay on delivery' };
      });
    },
    service(b) {
      const svc = SERVICES[b.service];
      if (!svc) throw oops(400, 'Pick a service.');
      if (!BUS_CITIES.some((c) => c[0] === b.city)) throw oops(400, 'Pick a city.');
      checkDate(b.date, 'start date');
      const qty = Math.max(1, Math.min(1000, Math.floor(Number(b.qty) || 1)));
      return svc.providers.map(([provider, mult, rating]) => { const seed = hash(`${provider}${b.city}`); return { kind: b.service, provider, title: `${svc.name} · ${b.city}`, sub: svc.sub, meta: [`${qty} ${svc.unit}`, `Starts ${b.date}`, `${1 + (seed % 6)} km from city centre`], price: Math.round(svc.rate * qty * mult), mins: 60 + (seed % 300), rating, section: 'logistics', record_title: svc.name, record_sub: `${b.city} · ${qty} ${svc.unit}`, pay_later: true, pay_later_label: 'Pay on invoice' }; });
    },
    hotel(b) { return stayList(b, HOTELS.map(([provider, name, rate, rating]) => ({ provider, name, rate, rating, type: 'Hotel' })), 'hotel'); },
    stay(b) { return stayList(b, STAYS.map(([provider, name, rate, rating, type]) => ({ provider, name, rate, rating, type })).filter((s) => !b.type || b.type === 'All' || s.type === b.type), 'stay'); },
    ride(b) {
      const a = engine.resolvePlace(b.from); const z = engine.resolvePlace(b.to);
      if (!a || !a.cityKey || !z || !z.cityKey) throw oops(400, 'Pick pickup and drop areas from the list, or enter a city pin code.');
      if (a.cityKey !== z.cityKey) throw oops(400, 'Local rides work inside one city. For other cities, try a bus or flight.');
      if (a.area === z.area) throw oops(400, 'Pickup and drop are the same area.');
      const km = +(engine.haversine(engine.areaPoint(a.cityKey, a.area), engine.areaPoint(z.cityKey, z.area)) * 1.3).toFixed(1);
      const now = Math.floor(Date.now() / 300000);
      return RIDES.filter((r) => !b.type || b.type === 'all' || r[1] === b.type).map(([provider, type, name, mult, rating, wait]) => {
        const [base, perKm, speed] = RIDE_FARE[type];
        const pickup = wait + (hash(`${provider}${type}${now}`) % 4);
        const trip = Math.round(km / speed * 60);
        return { kind: 'ride', provider, title: `${provider} ${name}`, sub: `${a.area} → ${z.area}`, ride_type: type, meta: [`Arrives in ${pickup} min`, `${trip} min trip`, `${km} km`], price: Math.round((base + perKm * km) * mult), mins: pickup + trip, rating, section: 'rides', record_title: `${provider} ${name}`, record_sub: `${a.area} → ${z.area}`, pay_later: true, pay_later_label: 'Pay driver' };
      });
    },
  };
  function stayList(b, list, kind) {
    if (!STAY_CITIES.includes(b.city)) throw oops(400, 'Pick a city.');
    const inT = checkDate(b.checkin, 'check-in date');
    const outT = Date.parse(b.checkout);
    if (Number.isNaN(outT) || outT <= inT) throw oops(400, 'Check-out must be after check-in.');
    const nights = Math.min(30, Math.round((outT - inT) / day));
    const rooms = Math.max(1, Math.min(8, Math.floor(Number(b.rooms) || 1)));
    return list.map(({ provider, name, rate, rating, type }) => {
      const seed = hash(`${b.city}${provider}${b.checkin}`);
      const km = 1 + (seed % 90) / 10;
      const price = Math.round(rate * (0.92 + (seed % 26) / 100) * nights * rooms * 1.12);
      return { kind, provider, title: `${name}, ${b.city}`, sub: type, meta: [`${km.toFixed(1)} km from centre`, `${nights} night${nights > 1 ? 's' : ''}`, `${rooms} room${rooms > 1 ? 's' : ''}`, seed % 3 ? 'Free cancellation' : 'Non-refundable'], price, mins: Math.round(km * 10), rating, section: 'travel', per_night: rate, record_title: `${name}, ${b.city}`, record_sub: `${b.checkin} to ${b.checkout}`, pay_later: true, pay_later_label: 'Pay at property' };
    });
  }

  routes['POST /v1/hub/search'] = hub(({ res, body, owner }) => {
    const run = searchers[body.kind];
    if (!run) throw oops(400, 'Choose what to search for.');
    const list = run(body).map((o) => ({ ...o, id: crypto.randomBytes(5).toString('hex') }));
    if (list.length) {
      const score = (o) => o.price / Math.min(...list.map((x) => x.price)) * 0.6 + o.mins / Math.min(...list.map((x) => x.mins)) * 0.25 - o.rating * 0.08;
      list.sort((a, b) => score(a) - score(b));
      awardTags(list, (o) => o.price, (o) => o.mins, ['hotel', 'stay'].includes(list[0].kind) ? 'Closest' : 'Fastest');
      list.forEach((o) => offers.set(o.id, { owner, offer: o, expires: Date.now() + 20 * 60000 }));
    }
    for (const [k, q] of offers) if (q.expires < Date.now()) offers.delete(k);
    send(res, 200, { options: list });
  });

  routes['POST /v1/hub/search/book'] = hub(({ res, body, db, h, owner }) => {
    const entry = offers.get(String(body.offer_id || ''));
    const lock = (h.locks || []).find((l) => l.offer.id === body.offer_id && l.expires > Date.now());
    if (!lock && (!entry || entry.owner !== owner || entry.expires < Date.now())) throw oops(400, 'This price has expired. Please search again.');
    const o = lock ? lock.offer : entry.offer;
    // Seats, add-ons and flexible protection are priced here, not in the browser.
    const trip = ['flight', 'bus', 'train'].includes(o.kind);
    const seats = trip && Array.isArray(body.seats) ? body.seats.slice(0, 9).map((x) => text(x, 5)) : [];
    const seatFee = o.kind === 'flight' ? seats.filter((x) => Number.parseInt(x, 10) <= 3).length * 199 : 0;
    const addons = o.kind === 'flight' && Array.isArray(body.addons) ? body.addons.filter((a) => ['bag', 'meal'].includes(a)) : [];
    const addonFee = addons.reduce((t, a) => t + (a === 'bag' ? 650 : 350), 0);
    const flexFee = body.flex && o.kind !== 'ride' ? Math.max(99, Math.round(o.price * 0.06)) : 0;
    const base = o.price + seatFee + addonFee + flexFee - (lock ? lock.fee : 0);
    if (!text(body.name) || !/^[6-9]\d{9}$/.test(body.phone || '')) throw oops(400, 'Enter the traveller name and a 10-digit mobile number.');
    const later = body.pay_mode === 'cod' && o.pay_later;
    const deal = priceWith(h, o.section, base, body);
    if (body.dry_run) return dryRun(res, h, deal.payable);
    const via = later ? {} : settle(db, h, deal.payable, `${o.record_title} · ${o.provider}`, body.payment_id);
    settleDeal(h, deal, o.record_title);
    offers.delete(body.offer_id);
    if (lock) h.locks = h.locks.filter((l) => l !== lock);
    const rec = addRecord(h, { section: o.section, kind: o.kind, title: o.record_title, provider: o.provider, sub: o.record_sub, amount: deal.payable, gross: base, flex: !!flexFee, seats, addons, pnr: trip ? crypto.randomBytes(3).toString('hex').toUpperCase() : null, premium: o.premium, per_night: o.per_night, discount: deal.discount, coupon: deal.coupon, points_used: deal.points, pay_mode: later ? 'cod' : 'prepaid', ...via, status: later ? 'PAY_LATER' : 'CONFIRMED', label: later ? o.pay_later_label : 'Confirmed', traveller: text(body.name, 60) });
    send(res, 200, { id: rec.id, amount: deal.payable, wallet_balance: db.balance, pay_mode: rec.pay_mode });
  });

  // ---- catalogue, recharges, bills, business payments ---------------------------------
  routes['GET /v1/hub/catalog'] = hub(({ res }) => send(res, 200, {
    airports: AIRPORTS.map(([code, city, , , intl]) => ({ code, city, intl: !!intl })), bus_cities: BUS_CITIES.map((c) => c[0]), stay_cities: STAY_CITIES, stay_types: ['All', ...new Set(STAYS.map((s) => s[4]))],
    operators: Object.keys(OPERATORS), circles: CIRCLES, fastag_issuers: FASTAG_ISSUERS, billers: BILLERS, upi_apps: UPI_APPS, test_cards: TEST_CARDS, banks: BANKS, pay_later: PAY_LATER, ewallets: EWALLETS, gift_cards: GIFT_CARDS, upi_kinds: UPI_KINDS, card_networks: CARD_NETWORKS, emi_months: EMI_MONTHS, business_types: BUSINESS_TYPES, apps: APPS.map(([key, name, group]) => ({ key, name, group })),
  }));
  routes['GET /v1/hub/plans'] = hub(({ res, url }) => {
    const op = url.searchParams.get('operator');
    if (!OPERATORS[op]) throw oops(400, 'Pick an operator.');
    send(res, 200, { operator: op, plans: PLANS.map(([id, price, validity, data, tag]) => ({ id, price: Math.round(price * OPERATORS[op]), validity, data, tag })) });
  });

  routes['POST /v1/hub/recharge/mobile'] = hub(({ res, body, db, h }) => {
    if (!/^[6-9]\d{9}$/.test(body.number || '')) throw oops(400, 'Enter a 10-digit mobile number.');
    if (!OPERATORS[body.operator]) throw oops(400, 'Pick an operator.');
    const plan = PLANS.find((p) => p[0] === body.plan_id);
    if (!plan) throw oops(400, 'Pick a plan.');
    const amount = Math.round(plan[1] * OPERATORS[body.operator]);
    if (body.dry_run) return dryRun(res, h, amount);
    const via = settle(db, h, amount, `Mobile recharge · ${body.operator} · ${body.number}`, body.payment_id);
    const rec = addRecord(h, { section: 'recharge', kind: 'mobile', title: `Mobile recharge ₹${amount}`, provider: body.operator, sub: body.number, amount, pay_mode: 'prepaid', ...via });
    if (body.auto && !h.accounts.some((a) => a.type === 'mobile' && a.label === body.number)) h.accounts.push({ id: newId('A'), type: 'mobile', provider: body.operator, label: body.number, balance: null, auto: true, threshold: null, amount, last_run: iso(Date.now()), next_due: localDay(Date.now() + 28 * day) });
    send(res, 200, { id: rec.id, amount, wallet_balance: db.balance });
  });

  const VEHICLE_RE = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4}$/;
  routes['POST /v1/hub/fastag/lookup'] = hub(({ res, body, h }) => {
    const no = text(body.vehicle_no, 16).toUpperCase();
    if (!VEHICLE_RE.test(no)) throw oops(400, 'Enter a vehicle number like KA 05 MN 4821.');
    const a = h.accounts.find((x) => x.type === 'fastag' && x.label.replace(/\s/g, '') === no.replace(/\s/g, ''));
    send(res, 200, { vehicle_no: no, balance: a ? a.balance : 100 + (hash(no) % 600), holder: 'Registered owner', linked: !!a });
  });
  routes['POST /v1/hub/recharge/fastag'] = hub(({ res, body, db, h }) => {
    const no = text(body.vehicle_no, 16).toUpperCase();
    if (!VEHICLE_RE.test(no)) throw oops(400, 'Enter a vehicle number like KA 05 MN 4821.');
    if (!FASTAG_ISSUERS.includes(body.issuer)) throw oops(400, 'Pick the bank that issued your FASTag.');
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 100 && amount <= 50000)) throw oops(400, 'Recharge between ₹100 and ₹50,000.');
    if (body.dry_run) return dryRun(res, h, amount);
    const via = settle(db, h, amount, `FASTag recharge · ${no}`, body.payment_id);
    let a = h.accounts.find((x) => x.type === 'fastag' && x.label.replace(/\s/g, '') === no.replace(/\s/g, ''));
    if (!a) { a = { id: newId('A'), type: 'fastag', provider: body.issuer, label: no, balance: 100 + (hash(no) % 600), auto: false, threshold: 200, amount: 500, last_run: null }; h.accounts.push(a); }
    a.balance += amount;
    if (body.auto) { a.auto = true; a.threshold = Math.max(100, Number(body.threshold) || 200); a.amount = Math.max(100, Number(body.auto_amount) || 500); }
    const rec = addRecord(h, { section: 'recharge', kind: 'fastag', title: 'FASTag recharge', provider: body.issuer, sub: no, amount, pay_mode: 'prepaid', ...via });
    send(res, 200, { id: rec.id, amount, balance: a.balance, wallet_balance: db.balance });
  });

  routes['POST /v1/hub/bill/fetch'] = hub(({ res, body }) => {
    const cat = BILLERS[body.category];
    if (!cat || !cat.list.includes(body.biller)) throw oops(400, 'Pick a biller.');
    const account = text(body.account, 30).toUpperCase();
    if (account.length < 5) throw oops(400, `Enter your ${cat.hint.toLowerCase()}.`);
    const seed = hash(body.biller + account);
    if (cat.mode === 'lookup') {
      const days = (seed % 400) - 40;
      return send(res, 200, { lookup: true, account, insurer: ['ACKO', 'Digit', 'ICICI Lombard', 'Tata AIG', 'HDFC ERGO'][seed % 5], expires: iso(Date.now() + days * day).slice(0, 10), expired: days < 0, days });
    }
    if (cat.mode === 'quote') {
      const base = body.category === 'car_ins' ? 2400 : 700;
      return send(res, 200, { biller: body.biller, account, holder: `${body.category === 'car_ins' ? 'Comprehensive' : 'Two-wheeler'} policy, 1 year`, amount: base + (seed % (base * 2)), due: iso(Date.now() + 365 * day).slice(0, 10), quote: true });
    }
    send(res, 200, { biller: body.biller, account, holder: 'Registered customer', amount: 180 + (seed % 3400), due: iso(Date.now() + (3 + seed % 15) * day).slice(0, 10) });
  });
  // Card fee, waived once by an offer.
  const billFee = (h, key, cat, amount) => {
    if (!cat.fee_pct) return 0;
    if (key === 'rentcc' && !(h.billOffers || []).includes('RENTFREE')) return 0;
    return Math.round((amount * cat.fee_pct) / 100);
  };
  routes['POST /v1/hub/bill/pay'] = hub(({ res, body, db, h }) => {
    const key = body.category; const cat = BILLERS[key];
    if (!cat || !cat.list.includes(body.biller)) throw oops(400, 'Pick a biller.');
    if (cat.mode === 'lookup') throw oops(400, 'This is a check, not a payment.');
    const account = text(body.account, 30);
    if (account.length < 5) throw oops(400, `Enter your ${cat.hint.toLowerCase()}.`);
    const amount = Math.round(Number(body.amount));
    if (!(amount >= (cat.min || 1) && amount <= 200000)) throw oops(400, cat.min ? `Enter at least ₹${cat.min}.` : 'Enter an amount up to ₹2,00,000.');
    const fee = billFee(h, key, cat, amount);
    const total = amount + fee;
    if (body.dry_run) { spendGuard(h, total, true); return send(res, 200, { ok: true, amount: total, fee }); }
    if (cat.cc_only) { const p = body.payment_id && findPaid(h, total, body.payment_id); if (!p || !['card', 'emi'].includes(p.method)) throw oops(400, 'Pay this by credit card or card EMI.'); }
    const via = settle(db, h, total, `${cat.label} · ${body.biller} · ${account}`, body.payment_id, cat.no_card);
    const rec = addRecord(h, { section: 'bills', kind: key, title: cat.open ? cat.label : `${cat.label} bill`, provider: body.biller, sub: account, amount: total, fee, pay_mode: 'prepaid', ...via });
    // Cashback: the best unused offer for this category.
    h.billOffers = h.billOffers || [];
    if (key === 'rentcc' && !h.billOffers.includes('RENTFREE')) h.billOffers.push('RENTFREE');
    const offer = BILL_OFFERS.find((o) => o.cat === key && !o.waive && !h.billOffers.includes(o.id) && amount >= (o.min || 0) && (!o.via || o.via === via.pay_via));
    let cashback = 0;
    if (offer) { cashback = offer.flat || Math.min(offer.cap || Infinity, Math.round((amount * offer.pct) / 100)); credit(db, cashback, `Cashback · ${offer.title}`); h.billOffers.push(offer.id); rec.cashback = cashback; }
    if (body.auto && !h.accounts.some((a) => a.type === 'bill' && a.label === account)) h.accounts.push({ id: newId('A'), type: 'bill', provider: body.biller, label: account, balance: null, auto: true, threshold: null, amount, last_run: iso(Date.now()), next_due: localDay(Date.now() + 28 * day) });
    const nick = text(body.save_as, 40);
    if (nick) { h.savedBills = (h.savedBills || []).filter((s) => !(s.cat === key && s.account === account)); h.savedBills.unshift({ id: newId('SB'), cat: key, biller: body.biller, account, nickname: nick, last: total, at: iso(Date.now()) }); h.savedBills = h.savedBills.slice(0, 30); }
    send(res, 200, { id: rec.id, amount: total, fee, cashback, wallet_balance: db.balance });
  });
  routes['GET /v1/hub/bill/home'] = hub(({ res, h }) => {
    // Suggested: what you pay most, then popular picks.
    const counts = {};
    h.records.filter((r) => r.section === 'bills' && BILLERS[r.kind]).forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
    const mine = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const suggested = [...new Set([...mine, 'insurance', 'feescc', 'credit', 'electricity'])].slice(0, 4);
    const used = h.billOffers || [];
    send(res, 200, { suggested, offers: BILL_OFFERS.filter((o) => !used.includes(o.id)).map((o) => ({ ...o, label: BILLERS[o.cat].label })), saved: h.savedBills || [], offer_cats: BILL_OFFERS.filter((o) => !used.includes(o.id)).map((o) => o.cat) });
  });
  routes['POST /v1/hub/bill/saved/remove'] = hub(({ res, body, h }) => { h.savedBills = (h.savedBills || []).filter((s) => s.id !== body.id); send(res, 200, { ok: true }); });
  routes['GET /v1/hub/vouchers'] = hub(({ res, h }) => send(res, 200, { data: VOUCHERS, categories: [...new Set(VOUCHERS.map((v) => v.category))], mine: h.records.filter((r) => r.kind === 'voucher').slice(0, 10).map((r) => ({ id: r.id, title: r.title, amount: r.amount, code: r.voucher_code, at: r.at })) }));
  routes['POST /v1/hub/vouchers/buy'] = hub(({ res, body, db, h }) => {
    const v = VOUCHERS.find((x) => x.id === body.id);
    if (!v) throw oops(400, 'Pick a brand.');
    const amount = Math.round(Number(body.amount));
    if (!v.values.includes(amount)) throw oops(400, 'Pick one of the listed values.');
    const to = text(body.to, 80);
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw oops(400, 'Enter a valid email, or leave it blank to keep the card yourself.');
    if (body.dry_run) return dryRun(res, h, amount);
    const via = settle(db, h, amount, `${v.brand} gift card`, body.payment_id);
    const code = `${v.id.slice(0, 3).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const cashback = Math.round((amount * v.cashback) / 100);
    if (cashback) credit(db, cashback, `Cashback · ${v.brand} gift card`);
    const rec = addRecord(h, { section: 'bills', kind: 'voucher', title: `${v.brand} gift card`, provider: v.brand, sub: to ? `Sent to ${to}` : 'For you', amount, pay_mode: 'prepaid', voucher_code: code, cashback, ...via });
    send(res, 200, { id: rec.id, code, cashback, amount, wallet_balance: db.balance });
  });
  routes['GET /v1/hub/gold'] = hub(({ res, h }) => {
    const m = h.metals || { gold: 0, silver: 0 };
    send(res, 200, { rates: METAL_RATE, holdings: m, value: Math.round(m.gold * METAL_RATE.gold + m.silver * METAL_RATE.silver), history: h.records.filter((r) => r.kind === 'gold').slice(0, 8) });
  });
  routes['POST /v1/hub/gold/buy'] = hub(({ res, body, db, h }) => {
    const metal = body.metal === 'silver' ? 'silver' : 'gold';
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 10 && amount <= 200000)) throw oops(400, 'Buy from ₹10 to ₹2,00,000.');
    if (body.dry_run) return dryRun(res, h, amount);
    const via = settle(db, h, amount, `Digital ${metal}`, body.payment_id, true);
    const grams = +((amount / 1.03) / METAL_RATE[metal]).toFixed(4); // price includes 3% GST
    h.metals = h.metals || { gold: 0, silver: 0 };
    h.metals[metal] = +(h.metals[metal] + grams).toFixed(4);
    const rec = addRecord(h, { section: 'bills', kind: 'gold', title: `Digital ${metal}, ${grams} g`, provider: metal === 'gold' ? 'Digital gold' : 'Digital silver', sub: `${metal === 'gold' ? '24K, 99.9%' : '99.9% pure'} at ₹${METAL_RATE[metal].toLocaleString('en-IN')}/g + GST`, amount, pay_mode: 'prepaid', ...via });
    send(res, 200, { id: rec.id, grams, holdings: h.metals, wallet_balance: db.balance });
  });
  routes['POST /v1/hub/bill/transfer'] = hub(({ res, body, db, h }) => {
    const to = text(body.to, 40); const name = text(body.name, 60);
    if (body.type === 'upi') { if (!VPA_RE.test(to)) throw oops(400, 'Enter a UPI ID like name@bank.'); }
    else if (body.type === 'mobile') { if (!/^[6-9]\d{9}$/.test(to)) throw oops(400, 'Enter a 10-digit mobile number.'); }
    else if (body.type === 'bank') { if (!/^\d{9,18}$/.test(to)) throw oops(400, 'Enter a bank account number of 9 to 18 digits.'); if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(text(body.ifsc, 11).toUpperCase())) throw oops(400, 'Enter a valid IFSC, like HDFC0001234.'); }
    else throw oops(400, 'Choose who to send money to.');
    if (name.length < 2) throw oops(400, 'Enter the name of the person receiving this.');
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 1 && amount <= 100000)) throw oops(400, 'Send between ₹1 and ₹1,00,000.');
    if (body.dry_run) return dryRun(res, h, amount);
    const via = settle(db, h, amount, `Sent to ${name} · ${to}`, body.payment_id, true);
    const PURPOSES = { rent: 'Rent', maintenance: 'Maintenance', newspaper: 'Newspaper', grocery: 'Grocery or milk', help: 'Domestic help', family: 'Family', salary: 'Fees or salary', services: 'Services', misc: 'Miscellaneous' };
    const purpose = PURPOSES[body.purpose] || '';
    if (body.repeat) { if (!purpose) throw oops(400, 'Pick what this regular payment is for.'); h.accounts.push({ id: newId('A'), type: 'transfer', provider: purpose, label: `${name} · ${body.type === 'bank' ? `account ending ${to.slice(-4)}` : to}`, balance: null, auto: false, threshold: null, amount, last_run: iso(Date.now()), next_due: localDay(Date.now() + 30 * day), remind_days: 3 }); }
    const rec = addRecord(h, { section: 'bills', kind: 'transfer', purpose, title: `Sent to ${name}`, provider: { upi: 'UPI ID', mobile: 'Mobile number', bank: 'Bank account' }[body.type], sub: body.type === 'bank' ? `Account ending ${to.slice(-4)}` : to, amount, pay_mode: 'prepaid', note: text(body.note, 60), ...via });
    send(res, 200, { id: rec.id, amount, wallet_balance: db.balance });
  });
  const instrumentsOf = (h) => { if (!h.instruments) h.instruments = []; return h.instruments; };
  routes['GET /v1/hub/checkout/methods'] = hub(({ res, h }) => send(res, 200, { instruments: instrumentsOf(h) }));
  routes['POST /v1/hub/checkout/instruments'] = hub(({ res, body, h }) => {
    const list = instrumentsOf(h);
    if (list.length >= 20) throw oops(400, 'You can save up to 20 payment methods. Remove one first.');
    const inst = { id: newId('PM'), type: body.type, is_default: false };
    const mobile = () => { if (!/^[6-9]\d{9}$/.test(body.mobile || '')) throw oops(400, 'Enter a 10-digit mobile number.'); return body.mobile; };
    if (body.type === 'upi') {
      const vpa = text(body.vpa, 60);
      if (!VPA_RE.test(vpa)) throw oops(400, 'Enter a UPI ID like name@bank.');
      if (!UPI_KINDS.includes(body.kind)) throw oops(400, 'Pick a UPI type.');
      inst.label = body.kind === 'UPI' ? vpa : `${vpa} (${body.kind})`;
    } else if (body.type === 'card') {
      if (!['Credit', 'Debit'].includes(body.kind)) throw oops(400, 'Pick credit or debit.');
      if (!CARD_NETWORKS.includes(body.network)) throw oops(400, 'Pick the card network.');
      if (!BANKS.includes(body.bank)) throw oops(400, 'Pick the issuing bank.');
      if (text(body.name, 60).length < 2) throw oops(400, 'Enter the name on the card.');
      if (!/^\d{4}$/.test(body.last4 || '')) throw oops(400, 'Enter only the last 4 digits of the card.');
      const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(body.expiry || '');
      if (!m) throw oops(400, 'Enter the expiry as MM/YY.');
      if (new Date(2000 + Number(m[2]), Number(m[1]), 1).getTime() <= Date.now()) throw oops(400, 'This card has expired.');
      inst.expiry = body.expiry; inst.label = `${body.bank} ${body.network} ${body.kind} ending ${body.last4}`;
    } else if (body.type === 'netbanking') {
      if (!BANKS.includes(body.bank)) throw oops(400, 'Pick your bank.');
      if (body.last4 && !/^\d{4}$/.test(body.last4)) throw oops(400, 'Enter only the last 4 digits of the account.');
      inst.label = body.last4 ? `${body.bank} ending ${body.last4}` : body.bank;
    } else if (body.type === 'paylater' || body.type === 'ewallet') {
      if (!(body.type === 'paylater' ? PAY_LATER : EWALLETS).includes(body.provider)) throw oops(400, 'Pick a provider.');
      inst.label = `${body.provider} · ${mobile().slice(-4).padStart(10, '•')}`;
    } else if (body.type === 'giftcard') {
      if (!GIFT_CARDS.includes(body.provider)) throw oops(400, 'Pick a gift card.');
      if (!/^[A-Za-z0-9-]{8,24}$/.test(body.code || '')) throw oops(400, 'Enter a gift card code of 8 to 24 characters.');
      inst.label = `${body.provider} ending ${body.code.slice(-4)}`;
    } else throw oops(400, 'Pick a payment type.');
    if (list.some((x) => x.type === inst.type && x.label === inst.label)) throw oops(400, 'You have already saved this.');
    if (body.is_default || !list.some((x) => x.is_default)) { list.forEach((x) => { x.is_default = false; }); inst.is_default = true; }
    list.unshift(inst);
    send(res, 200, inst);
  });
  routes['POST /v1/hub/checkout/instruments/default'] = hub(({ res, body, h }) => {
    const list = instrumentsOf(h); const inst = list.find((x) => x.id === body.id);
    if (!inst) throw oops(404, 'We could not find that payment method.');
    list.forEach((x) => { x.is_default = x === inst; });
    send(res, 200, inst);
  });
  routes['POST /v1/hub/checkout/instruments/remove'] = hub(({ res, body, h }) => {
    const list = instrumentsOf(h); const inst = list.find((x) => x.id === body.id);
    if (!inst) throw oops(404, 'We could not find that payment method.');
    h.instruments = list.filter((x) => x !== inst);
    if (inst.is_default && h.instruments[0]) h.instruments[0].is_default = true;
    send(res, 200, { ok: true });
  });
  routes['POST /v1/hub/checkout/intent'] = hub(({ res, body, h }) => {
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 1 && amount <= 1000000)) throw oops(400, 'Enter a valid amount.');
    const method = body.method;
    if (!PAY_LABEL[method] || method === 'wallet') throw oops(400, 'Pick a payment method.');
    if (method === 'neft' && h.profile.account_type !== 'business') throw oops(400, 'Bank transfer is for Business accounts.');
    let detail;
    if (body.instrument_id) {
      const inst = instrumentsOf(h).find((x) => x.id === body.instrument_id);
      if (!inst || inst.type !== (method === 'emi' ? 'card' : method)) throw oops(400, 'Pick one of your saved methods.');
      detail = inst.label;
    } else {
      detail = text(body.detail, 60);
      const ok = { upi: detail === 'qr' || UPI_APPS.includes(detail) || VPA_RE.test(detail), card: TEST_CARDS.includes(detail), emi: TEST_CARDS.includes(detail), netbanking: BANKS.includes(detail), neft: BANKS.includes(detail), paylater: PAY_LATER.includes(detail), ewallet: EWALLETS.includes(detail), giftcard: false }[method];
      if (!ok) throw oops(400, method === 'upi' ? 'Enter a UPI ID like name@bank.' : method === 'giftcard' ? 'Add a gift card first.' : 'Pick an option to pay with.');
    }
    if (method === 'emi') {
      if (amount < 1000) throw oops(400, 'EMI is available from ₹1,000. Choose another way to pay.');
      if (!EMI_MONTHS.includes(Number(body.plan))) throw oops(400, 'Pick an EMI plan.');
      detail = `${detail} · ${body.plan} months`;
    }
    const p = { id: newId('CHK'), amount, method, detail: detail === 'qr' ? 'QR code' : detail, status: 'PENDING', at: iso(Date.now()) };
    h.checkouts = [p, ...(h.checkouts || [])].slice(0, 50);
    send(res, 200, p);
  });
  routes['POST /v1/hub/checkout/confirm'] = hub(({ res, body, h }) => {
    const p = (h.checkouts || []).find((x) => x.id === body.id);
    if (!p) throw oops(404, 'We could not find that payment.');
    if (p.status !== 'PENDING') throw oops(409, 'This payment has already finished.');
    p.status = body.result === 'success' ? 'SUCCESS' : 'FAILED';
    send(res, 200, p);
  });
  routes['POST /v1/hub/business/pay'] = hub(({ res, body, db, h }) => {
    if (h.profile.account_type !== 'business') throw oops(400, 'Switch to a Business account to make business payments.');
    const t = BUSINESS_TYPES[body.type];
    if (!t) throw oops(400, 'Pick a payment type.');
    const payee = text(body.payee, 60); const ref = text(body.reference, 40);
    if (payee.length < 3) throw oops(400, `Enter the ${t.payee.toLowerCase()}.`);
    const amount = Math.round(Number(body.amount));
    if (!(amount >= 1 && amount <= 1000000)) throw oops(400, 'Enter an amount up to ₹10,00,000.');
    if (body.dry_run) return dryRun(res, h, amount);
    const via = settle(db, h, amount, `${t.label} · ${payee}`, body.payment_id);
    const rec = addRecord(h, { section: 'business', kind: body.type, title: t.label, provider: payee, sub: ref || '—', amount, pay_mode: 'prepaid', ...via });
    send(res, 200, { id: rec.id, amount, wallet_balance: db.balance });
  });

  // ---- auto-pay ----------------------------------------------------------------------
  routes['GET /v1/hub/autopay'] = hub(({ res, db, h }) => send(res, 200, { accounts: h.accounts, wallet_rule: h.wallet_rule, wallet_balance: db.balance }));
  routes['POST /v1/hub/autopay/account'] = hub(({ res, body, h }) => {
    if (!['fastag', 'mobile', 'bill'].includes(body.type)) throw oops(400, 'Pick an account type.');
    const label = text(body.label, 30).toUpperCase();
    const provider = text(body.provider, 40);
    if (!provider) throw oops(400, 'Pick the provider.');
    if (body.type === 'fastag' && !VEHICLE_RE.test(label)) throw oops(400, 'Enter a vehicle number like KA 05 MN 4821.');
    if (body.type === 'mobile' && !/^[6-9]\d{9}$/.test(label)) throw oops(400, 'Enter a 10-digit mobile number.');
    if (body.type === 'bill' && label.length < 5) throw oops(400, 'Enter your account number.');
    if (h.accounts.some((a) => a.type === body.type && a.label === label)) throw oops(409, 'That account is already connected.');
    const amount = Math.max(10, Math.round(Number(body.amount)) || 500);
    const a = { id: newId('A'), type: body.type, provider, label, balance: body.type === 'fastag' ? 100 + (hash(label) % 600) : null, auto: true, threshold: body.type === 'fastag' ? Math.max(100, Number(body.threshold) || 200) : null, amount, last_run: null, next_due: localDay(Date.now() + (5 + (hash(label) % 20)) * day) };
    h.accounts.push(a);
    send(res, 200, a);
  });
  routes['POST /v1/hub/autopay/update'] = hub(({ res, body, h }) => {
    const a = h.accounts.find((x) => x.id === body.id);
    if (!a) throw oops(404, 'That account is no longer connected.');
    if (body.auto != null) a.auto = !!body.auto;
    if (body.threshold != null && a.threshold != null) { const t = Math.round(Number(body.threshold)); if (!(t >= 50)) throw oops(400, 'Set a limit of ₹50 or more.'); a.threshold = t; }
    if (body.amount != null) { const m = Math.round(Number(body.amount)); if (!(m >= 10 && m <= 50000)) throw oops(400, 'Set an amount between ₹10 and ₹50,000.'); a.amount = m; }
    if (body.remind_days != null) { const d = Math.round(Number(body.remind_days)); if (!(d >= 0 && d <= 15)) throw oops(400, 'Remind between 0 and 15 days ahead.'); a.remind_days = d; }
    send(res, 200, a);
  });
  routes['POST /v1/hub/autopay/remove'] = hub(({ res, body, h }) => { h.accounts = h.accounts.filter((a) => a.id !== body.id); send(res, 200, { ok: true }); });
  routes['POST /v1/hub/autopay/wallet'] = hub(({ res, body, h }) => {
    const t = Math.round(Number(body.threshold)); const m = Math.round(Number(body.amount));
    if (!(t >= 100)) throw oops(400, 'Set a limit of ₹100 or more.');
    if (!(m >= 100 && m <= 100000)) throw oops(400, 'Top up between ₹100 and ₹1,00,000.');
    Object.assign(h.wallet_rule, { enabled: !!body.enabled, threshold: t, amount: m, source: text(body.source, 40) || h.wallet_rule.source });
    send(res, 200, h.wallet_rule);
  });
  // Demo trigger: a toll deduction for a FASTag, or a due date for a plan or bill.
  routes['POST /v1/hub/autopay/simulate'] = hub(({ res, body, db, h }) => {
    const a = h.accounts.find((x) => x.id === body.id);
    if (!a) throw oops(404, 'That account is no longer connected.');
    let event; let paid = 0;
    if (a.type === 'fastag') {
      const toll = Math.min(a.balance, 165);
      a.balance -= toll;
      event = `Toll of ₹${toll} deducted`;
      if (a.auto && a.balance < a.threshold) paid = a.amount;
    } else { event = 'Payment came due'; if (a.auto) paid = a.amount; }
    if (paid) {
      takePayment(db, h, paid, `Auto-pay · ${a.provider} · ${a.label}`);
      if (a.type === 'fastag') a.balance += paid;
      a.last_run = iso(Date.now());
      addRecord(h, { section: ['bill', 'transfer'].includes(a.type) ? 'bills' : 'recharge', kind: a.type, title: a.type === 'transfer' ? `${a.provider} · regular payment` : `Auto-pay · ${a.type === 'fastag' ? 'FASTag' : a.type === 'mobile' ? 'Mobile' : 'Bill'}`, provider: a.provider, sub: a.label, amount: paid, pay_mode: 'prepaid' });
    }
    send(res, 200, { account: a, event, paid, wallet_balance: db.balance });
  });

  // ---- tracking, claims, ratings -------------------------------------------------------
  routes['GET /v1/hub/orders/track'] = hub(({ res, url, h }) => {
    const r = h.records.find((x) => x.id === url.searchParams.get('id'));
    if (!r || !r.booking_id) throw oops(404, 'Live tracking is not available for this booking.');
    const tk = engine.trackById(r.booking_id);
    send(res, 200, { ...live(r), tracking: tk, proof: tk && tk.status === 'DELIVERED' ? { otp_verified: true, received_by: (r.receiver && r.receiver.name) || r.contact_name || 'Receiver', at: tk.timeline[0].at, simulated: true } : null });
  });
  routes['POST /v1/hub/orders/rate'] = hub(({ res, body, h }) => {
    const r = h.records.find((x) => x.id === body.id);
    if (!r) throw oops(404, 'We could not find that booking.');
    if (live(r).group !== 'delivered') throw oops(400, 'You can rate a service after it is completed.');
    const stars = Math.round(Number(body.stars));
    if (!(stars >= 1 && stars <= 5)) throw oops(400, 'Pick a rating from 1 to 5 stars.');
    r.rating = { stars, review: text(body.review, 300), at: iso(Date.now()) };
    send(res, 200, r.rating);
  });
  routes['POST /v1/hub/orders/claim'] = hub(({ res, body, db, h }) => {
    const r = h.records.find((x) => x.id === body.id);
    if (!r || !['vehicle', 'courier', 'logistics', 'international'].includes(r.section)) throw oops(404, 'We could not find that booking.');
    if (r.claim) throw oops(409, 'A claim is already open for this booking.');
    const v = live(r);
    if (!['transit', 'delivered'].includes(v.group)) throw oops(400, 'You can report a problem once the parcel is picked up.');
    const types = { lost: 'Lost', damaged: 'Damaged', delayed: 'Delayed', other: 'Something else' };
    if (!types[body.type]) throw oops(400, 'Pick what went wrong.');
    const note = text(body.note, 400);
    if (note.length < 10) throw oops(400, 'Tell us a little more, at least 10 characters.');
    const covered = ['lost', 'damaged'].includes(body.type) && r.declared > 0;
    r.claim = { type: types[body.type], note, at: iso(Date.now()), status: covered ? 'APPROVED' : 'UNDER_REVIEW', payout: covered ? r.declared : 0 };
    if (covered) credit(db, r.declared, `Insurance claim (demo) · ${r.id}`);
    send(res, 200, { claim: r.claim, wallet_balance: db.balance });
  });

  // ---- fare calendar and price alerts ----------------------------------------------------
  function cheapestDays(kind, from, to, days = 14) {
    const out = [];
    for (let n = 1; n <= days; n++) {
      const date = localDay(Date.now() + n * day);
      try { const list = searchers[kind]({ from, to, date, pax: 1, seats: 1, cabin: 'economy' }); out.push({ date, price: Math.min(...list.map((o) => o.price)) }); } catch (e) { if (n === 1) throw e; }
    }
    return out;
  }
  function alertView(a) { let current = null; try { current = Math.min(...cheapestDays(a.kind, a.from, a.to).map((d) => d.price)); } catch (e) { /* route no longer served */ } return { ...a, current, triggered: current != null && current <= a.target }; }
  routes['POST /v1/hub/calendar'] = hub(({ res, body }) => {
    if (!['flight', 'bus', 'train'].includes(body.kind)) throw oops(400, 'Fare calendars are for flights, buses and trains.');
    const days = cheapestDays(body.kind, body.from, body.to);
    const low = Math.min(...days.map((d) => d.price));
    send(res, 200, { days: days.map((d) => ({ ...d, low: d.price === low })) });
  });
  routes['GET /v1/hub/alerts'] = hub(({ res, h }) => send(res, 200, { data: h.alerts.map(alertView) }));
  routes['POST /v1/hub/alerts'] = hub(({ res, body, h }) => {
    if (!['flight', 'bus', 'train'].includes(body.kind)) throw oops(400, 'Price alerts are for flights, buses and trains.');
    const target = Math.round(Number(body.target));
    if (!(target >= 50)) throw oops(400, 'Set a target price of ₹50 or more.');
    if (h.alerts.length >= 10) throw oops(400, 'You can keep up to 10 alerts. Remove one first.');
    cheapestDays(body.kind, body.from, body.to, 1);
    const a = { id: newId('AL'), kind: body.kind, from: text(body.from, 30), to: text(body.to, 30), target, at: iso(Date.now()) };
    h.alerts.push(a);
    send(res, 200, alertView(a));
  });
  routes['POST /v1/hub/alerts/remove'] = hub(({ res, body, h }) => { h.alerts = h.alerts.filter((a) => a.id !== body.id); send(res, 200, { ok: true }); });

  // ---- rewards, budgets, insights -----------------------------------------------------------
  routes['GET /v1/hub/rewards'] = hub(({ res, h }) => send(res, 200, { points: h.rewards.points, saved: h.rewards.saved, tier: tierOf(h), tiers: TIERS.map(([name, at, rate]) => ({ name, at, rate })), history: h.rewards.history.slice(0, 30), coupons: Object.entries(COUPONS).map(([code, c]) => ({ code, label: c.label, sections: c.sections, used: h.rewards.used_coupons.includes(code) })) }));
  routes['POST /v1/hub/coupon/check'] = hub(({ res, body, h }) => {
    const code = text(body.code, 20).toUpperCase();
    const v = couponValue(h, code, body.section, Math.round(Number(body.amount)) || 0);
    if (v.error) throw oops(400, v.error);
    send(res, 200, { code, discount: v.discount, label: v.label });
  });
  routes['POST /v1/hub/rewards/redeem'] = hub(({ res, body, db, h }) => {
    const points = Math.round(Number(body.points));
    if (!(points >= 100)) throw oops(400, 'Redeem at least 100 points.');
    if (points > h.rewards.points) throw oops(400, 'You do not have that many points.');
    h.rewards.points -= points;
    h.rewards.history.unshift({ at: iso(Date.now()), points: -points, note: 'Moved to wallet' });
    credit(db, points, 'Reward points redeemed (demo)');
    send(res, 200, { points: h.rewards.points, wallet_balance: db.balance });
  });
  routes['POST /v1/hub/budgets'] = hub(({ res, body, h }) => {
    if (!SECTION_KEYS.includes(body.section)) throw oops(400, 'Pick a service.');
    const amount = Math.round(Number(body.amount)) || 0;
    if (amount < 0 || amount > 10000000) throw oops(400, 'Enter a budget up to ₹1,00,00,000.');
    if (amount) h.budgets[body.section] = amount; else delete h.budgets[body.section];
    send(res, 200, { budgets: h.budgets });
  });
  routes['GET /v1/hub/insights'] = hub(({ res, h }) => {
    const list = h.records.map(live);
    const rows = budgetRows(h, list);
    const d = new Date(); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const mtd = rows.reduce((s, r) => s + r.mtd, 0);
    const l30 = rows.reduce((s, r) => s + r.last30, 0); const p30 = rows.reduce((s, r) => s + r.prev30, 0);
    const providers = {};
    list.filter((r) => r.status !== 'CANCELLED').forEach((r) => { providers[r.provider] = (providers[r.provider] || 0) + r.amount; });
    const top = Object.entries(providers).sort((a, b) => b[1] - a[1])[0];
    const count = list.filter((r) => r.status !== 'CANCELLED').length;
    send(res, 200, { rows, mtd, projected: Math.round((mtd / d.getDate()) * dim), last30: l30, prev30: p30, saved: h.rewards.saved, avg: count ? Math.round(list.filter((r) => r.status !== 'CANCELLED').reduce((s, r) => s + r.amount, 0) / count) : 0, count, top_provider: top ? { name: top[0], amount: top[1] } : null, series: series(list, 30), cod_share: count ? Math.round((list.filter((r) => r.pay_mode === 'cod').length / count) * 100) : 0 });
  });

  // ---- profile -----------------------------------------------------------------------
  routes['GET /v1/hub/profile'] = hub(({ res, db, h, user }) => {
    if (!h.profile.name && user.name) h.profile.name = user.name;
    send(res, 200, { ...h.profile, score: profileScore(h.profile, db), score_total: 7, apps: APPS.map(([key, name, group]) => ({ key, name, group, connected: !!h.profile.connected[key] })) });
  });
  routes['POST /v1/hub/profile'] = hub(({ res, body, db, h, user }) => {
    const p = h.profile;
    if (body.account_type != null) { if (!['personal', 'business'].includes(body.account_type)) throw oops(400, 'Pick Personal or Business.'); p.account_type = body.account_type; }
    for (const k of ['name', 'dob', 'company', 'industry', 'employees', 'iec', 'upi']) if (body[k] != null) p[k] = text(body[k], 80);
    if (body.email != null) { const e = text(body.email, 120).toLowerCase(); if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw oops(400, 'Enter a valid email address.'); p.email = e; }
    if (body.mobile != null) { const m = text(body.mobile, 10); if (m && !/^[6-9]\d{9}$/.test(m)) throw oops(400, 'Enter a 10-digit mobile number.'); p.mobile = m; }
    if (body.gstin != null) { const g = text(body.gstin, 15).toUpperCase(); if (g && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) throw oops(400, 'Enter a valid GSTIN or leave it blank.'); p.gstin = g; }
    if (body.pan != null) { const g = text(body.pan, 10).toUpperCase(); if (g && !/^[A-Z]{5}\d{4}[A-Z]$/.test(g)) throw oops(400, 'Enter a valid PAN or leave it blank.'); p.pan = g; }
    if (body.bank) { const ifsc = text(body.bank.ifsc, 11).toUpperCase(); if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw oops(400, 'Enter a valid IFSC code.'); p.bank = { holder: text(body.bank.holder, 60), account: text(body.bank.account, 20), ifsc }; }
    if (body.notifications) Object.keys(p.notifications).forEach((k) => { if (body.notifications[k] != null) p.notifications[k] = !!body.notifications[k]; });
    if (body.connected) Object.entries(body.connected).forEach(([k, v]) => { if (APPS.some((a) => a[0] === k)) p.connected[k] = !!v; });
    if (body.language != null) p.language = text(body.language, 10);
    if (body.currency != null) p.currency = text(body.currency, 3);
    if (body.theme != null) p.theme = body.theme === 'dark' ? 'dark' : 'light';
    if (body.twofa != null) p.twofa = !!body.twofa;
    if (body.add_address) {
      const a = body.add_address;
      if (text(a.line, 200).length < 8) throw oops(400, 'Enter the full address.');
      if (!/^\d{6}$/.test(a.pincode || '')) throw oops(400, 'Enter a 6-digit pin code.');
      p.addresses.push({ id: newId('AD'), label: text(a.label, 30) || 'Saved address', line: text(a.line, 200), city: text(a.city, 40), pincode: a.pincode });
    }
    if (body.remove_address) p.addresses = p.addresses.filter((a) => a.id !== body.remove_address);
    if (body.name != null && p.name) user.name = p.name;
    if (body.email != null && p.email && !user.email) user.email = p.email;
    send(res, 200, { ...p, score: profileScore(p, db), score_total: 7, apps: APPS.map(([key, name, group]) => ({ key, name, group, connected: !!p.connected[key] })) });
  });

  return { hub, hubOf, live, oops, text, takePayment, addRecord, offers };
};
