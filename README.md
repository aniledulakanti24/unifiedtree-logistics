# UT Log

A platform that connects businesses and people with courier services, delivery partners and independent vehicles, with bookings, a working sign-up/login widget, order tracking and a mock API. The homepage shows how it works in a scroll-driven 3D film set in one city. All branding, copy and images here are original placeholders.

## Run

```bash
node server.js
```

Then open http://localhost:3000. You need Node 18 or newer. There are no dependencies.

In dev mode the server prints each OTP to the console and shows it in a yellow hint under the form. Set `NODE_ENV=production` to turn that off.

## Use your own assets

| What | Where |
|---|---|
| Logo, favicon | `public/assets/logo.svg`, `logo-light.svg`, `favicon.svg` |
| Colours (Highway green #0B3A2C, Marigold #FFB81C, Vermillion #C8321C, Kraft #C8955A), fonts, radius | `:root` tokens at the top of `public/css/styles.css` (website) and `public/app/app.css` (dashboard); homepage extras in `.home` in `public/css/home.css`; partner vehicle colours in `LIVERY` in `public/js/network-film.js` |
| Icons | `public/assets/icons/*.svg` |
| Illustrations | `public/assets/illus/*.svg` |
| Copy | `public/index.html` |
| Film acts, camera, route and partner names | `ACTS`, `MARKS`, `trip` and `LIVERY` in `public/js/network-film.js` |
| Fonts | Website: Plus Jakarta Sans (headings), Inter (text). Dashboard: Inter throughout, matching the Unifiedtree CRM, with tokens at the top of `public/app/hub.css` |

Keep the file names, or update the `src` attributes to match.

## What the inspection found (reference site)

**Stack:** server-rendered WordPress (WP Rocket cache and lazy-load) with jQuery, Slick sliders, GSAP ScrollTrigger, Lenis smooth scroll and AOS. There is no SPA framework and no client-side store.

**Page structure, top to bottom:** top promo strip → sticky header with mega menu → hero (fade slider with dots and arrows, plus a sign-up widget) → order-tracking card (AWB or order ID + phone) → dark logo marquee → "why us" heading → 4 stacking cards → AI features (dark) → product demo tabs → integrations marquee → developer section (dark) → CTA strip → stats carousel → "who it's for" grid → testimonials (quote synced to people tabs) → services (hover swaps the illustration) → press marquee → blog carousel → footer (accordion on mobile).

**API calls:** on page load the only first-party requests are static assets. The rest is about 35 third-party analytics and ads origins. The sign-up widget calls a separate API host:
- `POST /v1/auth/onboard/request` `{mobile, captcha_token}`
- `POST /v1/auth/onboard/validate` `{mobile, otp, captcha_token, manual_form_signup, utm_*}` → `{token}`
- `POST /v1/users/reset/otp/confirm` `{otp, is_web, data: email}`

**State management:** everything lives in the DOM, cookies and Web Storage:
- Step visibility uses `.hidden` classes, with module-level flags (`isSendingOtp`, `isVerifyingOtp`, `resendCount`, `canResend`)
- `localStorage["<prefix><mobile>"]` holds the resend count and a 30-minute lockout
- The `UTM` cookie (30 days) records first-touch attribution, with `first_utm` as a snapshot; `browse_history` keeps the last 10 paths
- Login hand-off: a 60-second cookie `<host>|<token>` is set on the parent domain and read once by the app, so the token never appears in a URL

**Widget behaviour reproduced here:** the number auto-sends 600 ms after it is complete. The OTP auto-verifies 600 ms after the sixth digit. Pasted or autofilled codes spread across the boxes. A 30-second resend timer allows 2 resends, then a 30-minute lockout. Requests time out after 20 s, and errors get friendly messages by status code (429, 400, 5xx).

## Seller dashboard (reference app, inspected while logged in)

**Stack:** Angular built with esbuild (`main-*.js` plus about 120 lazy `chunk-*.js` files), served under `/seller/`. The homepage and analytics are separate micro-frontends (`homepage-mfe`, `dashboard-mfe`). The REST API is on its own host, with side services for reports, capital, trends and an AI copilot.

**State:** the JWT is in `localStorage.satellizer_token` and the user in `ngStorage-USER`. The sidebar menu and settings tree come from `GET /v1/settings/menuv2` and are cached in `sessionStorage` (`menuItems`, `settingItems`). List filters live in the URL query, so every view can be bookmarked.

**Pages and the calls behind them (read-only walk):**

| Page | Main calls |
|---|---|
| Every page | `auth/login/user`, `settings/menuv2`, `courier/applied_weight`, `get/version`, `vas/*` |
| Home | `homepage/order-count-details`, `homepage/next-best-actions`, `shipments/getpickup?from=`, `orders/track` |
| Orders | `orders/processing` (`order_status, channel_id, payment_method, pickup_address_id, rto_status, ship_weight, from, to, search, page, per_page`), `orders/processingordersfilters` |
| NDR | `shipments/ndr/list` (`status, aging, action_by, courier_id, attempts, from, to…`) |
| Returns | `orders/returns/new-return`, `orders/return_reason` |
| Weight | `account/details/wd/get_data_points`, `weightdispute/check` |
| Dashboard | `web/dashboard/performance-overview` (`from_date, to_date, compare_from, compare_to, card`) |
| Reports | `reports/all` (`from, to, page, per_page, title_id, type_id`) |

## Unified dashboard (`/app/`)

UT Log is the bridge between the customer and service providers: it does not deliver anything itself. One left sidebar and one wallet cover every service. Code: `public/app/js/hub/` (pages), `public/app/hub.css` (design), `server/hub-api.js` (API).

| Section | Route | How it works |
|---|---|---|
| Dashboard | `#/home` | Service tiles, today vs yesterday, items needing attention, spend charts, rate calculator |
| Vehicle Transport | `#/vehicle` | By location, inside one city, up to 750 kg: bike, auto, van (Rapido, Porter, Uber, Borzo, local owners) |
| Courier Transport | `#/courier` | By pincode and address, parcels and heavy surface cargo (Blue Dart, Xpressbees, Delhivery and others) |
| Logistics Transport | `#/logistics` | By location and address: full trucks from third-party logistics companies and contractors |
| International | `#/international` | Express, air freight and sea freight by country |
| All Bookings | `#/bookings` | Everything in one list, with filters and CSV |
| Travel & Stay | `#/travel/flights`, `trains`, `buses`, `hotels`, `stays` | Search, compare, book |
| Local Services | `#/rides` | Bike, auto and cab rides |
| Recharge & Bills | `#/pay/mobile`, `fastag`, `bills` | Mobile plans, FASTag, utilities |
| Business Payments | `#/pay/business` | Vendors, GST, TDS, rent, payroll, freight, customs (Business accounts only) |
| Auto-pay | `#/autopay` | Connected FASTag, mobile and bills, plus wallet auto top-up |
| Wallet | `#/wallet` | Balance, add, withdraw, statement |
| Profile | `#/profile` and the account drawer | Details, business, addresses, payment methods, language, currency, theme, notifications, security, apps |

Each transport section has its own Dashboard, New booking and Orders tab. The booking flow is: location or pincode, weight, optional dimensions, then recommendations sorted by Recommended, Fastest, Price low to high or Top rated. Payment is Prepaid (wallet) or Pay on delivery.

**Advanced features:** extra stops, scheduled pickup, deliver-by deadline, loading helpers, opt-in insurance, side-by-side compare, book again, in-app live tracking (`hub/tracking.js`), problem reports and claims, ratings, receipts, trains, 14-day fare calendar, price alerts, coupons and reward points (`#/rewards`), budgets and spending insights (`#/insights`), upcoming payments, and plain-language search (`smartAction` in `public/app/js/palette.js`). Competitor comparison: `docs/COMPETITORS.md`.

**Motion:** `hub/motion.js` has inertial wheel scrolling, reveal on scroll, count-up numbers and the route progress bar. All of it turns off under `prefers-reduced-motion`.

**Personal / Business:** asked on first sign-in and switchable in the top bar. Business adds freight options, GST fields, Business Payments and Seller Tools.

**Language:** the same approach as the Unifiedtree CRM: Google's page translator, with the language list in `LANGUAGES` in `hub/prefs.js`. Page text is sent to Google.

**Currency:** amounts are stored in INR and shown in the chosen currency. The rates in `CURRENCIES` in `public/app/js/core.js` are fixed indicative numbers. Replace them with a live feed before launch.

**Before launch:** every provider listing, price, rating, bill and plan is simulated, and no money moves. Each provider needs a signed agreement, a live API and permission to use its name. The wallet needs a licensed payment partner: holding customer balances in India is regulated (prepaid payment instrument rules), as are bill payments (BBPS) and FASTag issuing.

## Design and launch features

The app uses the Unifiedtree CRM design system (crm.css): the same colours, type, cards, tabs, tables and status badges. The Overview compares every number with the period before and adds a getting-started checklist, What the numbers say, Needs attention and What to do first. The top bar has New (start any booking or payment), Ask (plain questions answered from your own records), and Help. Sidebar items show live counts and can be starred as Favourites. Order tables have saved Views and a Columns chooser, and pages print cleanly to PDF.

## Where things live

Each feature has one home. The sidebar is for daily work; the profile menu (top right) is for the account and its settings.

- **Service workspaces:** Vehicle, Courier, Logistics, International and More Services each have Dashboard, New, Orders, Returns and Cancellations. Travel & Stay has Dashboard, Book, Orders and Cancellations. Recharge & Bills has Dashboard, Pay and Orders.
- **Inside each service:** a rail of sub-sections. Orders and Cancellations filter by sub-service (Flights, Warehousing, FASTag and so on) with status tabs that fit it. Analytics has Overview, Partners, Routes and Payments. Control Tower lists what needs attention. Settings holds booking defaults, partner choices and alert limits.
- **Recharge & Bills:** the categories UPI apps offer (recharges, utilities, finance, home and society, education and more), Send Money, and checkout by wallet, UPI, card, EMI, netbanking, Pay Later, other wallets, gift card or bank transfer. Transport and travel use the same checkout. People save their own methods under Profile, Payment methods; a card keeps only its last 4 digits and expiry. All of these run on the sandbox gateway. Going live needs a licensed BBPS and UPI partner.
- **Bills catalogue (UPI-app style):** Telecom & Recharges (mobile prepaid and postpaid, DTH, cable, Google Play, international roaming, get SIM, Apple, subscriptions), Utilities (electricity, piped gas, cylinder booking, water, broadband, landline, prepaid meter, EV charging), Vehicle Payments (FASTag, NCMC, metro, car and bike insurance quotes, accident cover, eChallan, policy expiry check, fleet card), Finance & Tax (credit card, loan, LIC and insurance, RD, NPS, ITR filing, gold and silver), Housing & Society (municipal tax and services, rentals, apartment, clubs) and Others (donation, devotion, education, hospital, rent and fees by credit card with a 1.6% fee, gift cards, send money). Plus My Bills with nicknames, Suggested for you, cashback offers, brand vouchers, and monthly regular payments with reminders.
- **Sidebar:** Dashboard · Ship (Vehicle, Courier, Logistics, International, More Services) · Manage (All Orders, All Returns, Weight Management, Courier Intelligence, Partner Holidays) · Book & pay (Travel & Stay, Recharge & Bills, Wallet) · Business (Live Tracking, WhatsApp, Single GST, Seller Tools) · Help, Feedback
- **Tabs inside a section:** Local Rides in Travel; Auto-pay and Business payments in Recharge & Bills; Rewards and Insights in Wallet
- **Profile menu:** My profile, Personal / Business, Language, Currency, Theme, and for owners Access Control, Spending Controls, Integrations, KYC, Developers

## Competitive features

Most of these are simulated where a real partner would be needed. Code: `server/parity-api.js`, `public/app/js/hub/intel.js`, `control.js`, `wa.js`, `experience.js`.

| Area | What it adds | Route |
|---|---|---|
| Courier | Pincode performance, auto-allocation rules, failed deliveries, bulk CSV booking | `#/intel`, `#/courier/bulk` |
| Vehicles | Driver chat, private calling, proof of delivery | Tracking panel |
| More services | Packers & Movers, Warehousing, Cold Chain, Customs, Vehicle Rental, Packaging | `#/services/movers` |
| Booking | Any typed place works (mapped to a served area in the demo), add-ons, carbon estimate, in-panel order confirmation with live progress | Booking pages |
| Travel | 48-hour price lock, seat maps, add-ons, Flexible protection, PNR and e-ticket | Travel pages |
| Payments | Sandbox gateway (UPI, QR, netbanking), reminders, pay all due | Add money, `#/autopay` |
| Business | Per-person limits and approvals, enforced on every payment | `#/business/spend` |
| WhatsApp | Shared inbox, broadcasts, templates, SMS and email channels | `#/business/whatsapp` |
| Design | Guided tour, customisable dashboard, phone tab bar, installable app | Help page, dashboard |
| Readiness | Sandbox integrations and go-live checklist | `#/business/integrations` |

**Storage:** accounts and bookings are saved to `data/state.json` (`server/store.js`) and restored at start. The file holds password hashes and session tokens, so keep it private, and move to a managed database before real traffic. Delete it to reset all data. `/healthz` reports server health.

## Access Control and partner holidays

**Access Control** (`#/business/access`, owner only): built-in and custom roles, a None / View / Manage level for each of 20 modules, and per-person changes. Enforced on the server in `server/access.js` on every request; the interface also hides what a role cannot open. Account-wide settings (`hub/profile` writes) stay with the owner.

**Partner Holidays** (`#/holidays`): monthly calendar with closed and limited partners, your own closures, and calendar export. Closed partners drop out of booking results for that pickup date, and limited ones are flagged and run a day slower. National dates and partner rules are in `server/holidays.js`; partner rules are demo assumptions, and festival dates should be checked against the official list each year.

**Filters:** every list uses `filterBtn` and `openFilters` in `public/app/js/hub/ui.js`.

## Orders, returns, weight, help (`#/my/…`)

For all accounts. Code: `server/orders-api.js`, `public/app/js/hub/orders.js`, `weight.js`, `help.js`.

| Feature | Route | How it works |
|---|---|---|
| Orders | `#/my/orders` | Domestic or international, status tabs, filters, bulk cancel and export, detail page with progress steps, packing slip |
| Returns | `#/my/returns` | Return or exchange from delivered orders, approve or reject, reverse-shipping charge, return window, reasons |
| Weight Management | `#/my/weight` | Limit of each vehicle, load checker with best fit and volumetric weight, weight checks with accept or dispute, saved packages |
| Help & Support | `#/help` | Search, topics, answers, and tickets (`#/support`). Set `SUPPORT_PHONE` and `SUPPORT_EMAIL` to show contact buttons |
| Feedback | `#/feedback` | Score, ideas and problems, optional reply through a ticket, and voting on the roadmap |

Vehicle images are transparent PNGs in `public/assets/vehicles-png/`, mapped in `vehicleImg` in `public/app/js/hub/art.js`. Keep the file names to swap a picture. The container and trailer are licensed photos: keep `CREDITS.md` and the credit line on the Weight Management page.

## Business module (`#/business/…`)

For Business accounts only; the API refuses personal accounts. Code: `server/business-api.js`, `server/whatsapp.js`, `public/app/js/hub/business.js`, `public/app/js/hub/maps.js`.

| Feature | Route | How it works |
|---|---|---|
| Map pickup and drop | Map button on each booking form | Drag the map under a pin, search, or use your location. The exact point sets the distance and the tracking route |
| Live Tracking | `#/business/tracking` | All active shipments on one map, with ETA, late flags and detail |
| WhatsApp | `#/business/whatsapp` | An automation per event, recipient choice, message log, test send, and a keyword bot (TRACK, RESCHEDULE, STOP, START) |
| Single GST | `#/business/gst` | One monthly statement across all providers: SAC summary, CGST/SGST or IGST by state, CSV export |
| Notifications | `#/business/notifications` | Feed, unread badge, browser alerts, and a channel choice per event |

Copy `.env.example` to `.env` to go live. Without keys, maps use OpenStreetMap and WhatsApp messages are recorded but not sent.

**Google Maps:** enable Maps JavaScript API, Places API (New) and Geocoding API, set `GOOGLE_MAPS_API_KEY`, and restrict the key to your domain. OpenStreetMap's public tiles are for development; do not use them for production traffic.

**WhatsApp:**
1. Create a WhatsApp Business app in Meta for Developers and set the four `WHATSAPP_` values.
2. Create and get approval for every template in `TEMPLATES` in `server/whatsapp.js`, with the same names and placeholders.
3. Set the webhook to `PUBLIC_URL/v1/public/whatsapp/webhook` and subscribe to `messages`.

Meta charges per delivered template message. Receivers get messages only when the sender confirms their consent at booking, and STOP is honoured.

**Single GST, before launch:** a single invoice is only valid if UT Log is legally the supplier of these services, or the e-commerce operator liable for the tax under section 9(5). If UT Log is only an agent, each provider must invoice the customer, and a consolidated document is a statement, so the customer cannot claim input credit from it. Delivery through e-commerce operators reportedly changed from 1 November 2026. Rates are in `GST_RULES` in `server/business-api.js`; have a chartered accountant confirm them, and add e-invoicing (IRN) if your turnover requires it.

## Seller tools (inside `/app/`)

A single-page app built in plain JavaScript (ES modules, hash router), backed by `server/seller-api.js`. Each account gets its own seeded demo data, saved between restarts.

- **Navigation:** Seller Tools in the sidebar (Business accounts) opens five stations that follow an order's life (Today, Ship, On the road, Money, Rules), each with its own strip of pages. Ctrl + K opens a palette to find any page or search. The structure comes from `GET /v1/settings/menuv2`
- **Overview (`#/seller-home`):** today's orders by stage, a work queue in priority order, a pickup departure board and a quick quote
- **Orders:** status tabs with counts, search, date range, filters, select-all with bulk Ship / Schedule pickup / Cancel, paging, and a detail page with a timeline
- **Ship now:** quotes every courier, recommends one, books an AWB and debits the wallet (the charge always equals the quote)
- **Add order:** buyer, product and package form with a volumetric-weight hint
- **NDR:** re-attempt (with a note) or RTO
- **Returns:** list, and create from a delivered order
- **Weight disputes:** accept (debits the wallet) or dispute
- **Dashboard:** KPI cards compared with the previous period, an orders/revenue chart, a status donut, courier performance and top states
- **Billing:** wallet ledger, demo recharge, COD remittances
- **Rate calculator**, **Reports** (CSV download) and **Settings** (profile, pickup addresses)

State follows the reference's pattern: the token is in `localStorage.ut_token`, the user in `ut-USER` and the menu in `sessionStorage.menuItems`. All three are refreshed from the API on load (`public/app/js/core.js`).

### Logistics modules

These areas describe what each module does; the Navigation entry above says where it lives.

| Area | Pages (`/app/#/…`) |
|---|---|
| Shipping operations | `shipments` (by AWB) · `manifests` (4×6 labels with Code 39 barcodes, pickup manifests, GST invoices; print or save as PDF) · `bulk` (CSV upload with per-row errors) · Orders tabs **Duplicate** / **On Hold** and a **Domestic / International** switch · `track` (bulk tracking) · `exchanges` · full return form with QC and refund mode |
| International | Dashboard **Domestic / International** switch · `intl-quote` (couriers, duty estimate, documents) · international addresses in Add order |
| Courier & rules | `couriers` (recommended / cheapest / fastest / custom ranking, enable/disable) · `pincodes` (COD or full blocks, delivery padding, zone mapping, serviceability check) · `tat` (S2D by zone, pickup and courier holidays) · `skus` (catalog, preferred/blocked couriers per SKU, SKU × pincode blocks) |
| Delivery quality | `rto` (risk score from COD, verification, address quality, buyer and pincode RTO history; verify / prepaid link / hold / cancel) · `freeze` (Weight Freeze with photo proof; closes disputes above the frozen weight; Smart Weight Assurance) · `boost` (Delivery Boost) · `radar` (delays by reason and courier, escalation) · `promise` (storefront delivery-date ranges) |
| Commerce | `channels` (connect, sync, disconnect) · `rate-card` (pay-as-you-go rate card and coupons) · `refer` |
| Team & developers | `team` (invite by mobile/email; roles owner / ops / finance / support / viewer, enforced by the server) · `developers` (signed webhooks with delivery log, API reference; API keys authenticate as the owner) |
| Finance | `cod` (COD reconciliation per AWB: matched / short / missing / not due; dispute opens a ticket) · `invoices` (monthly GST tax invoices and credit notes, weight-dispute ledger) · Early COD toggle on payouts |
| Returns | Public buyer portal `/returns/` (order ID + phone, return or exchange, photo rules) · approval queue in `returns?tab=requests` · `returns-policy` (window, exchanges, auto-approve, photo rules) |
| Delivery Health | `cod-confirm` (automatic WhatsApp/IVR COD confirmation; no reply → hold or cancel) · `blocklist` (phone / email / pincode; matching orders go on hold) |
| Support | `support` (tickets with SLA, threads; radar escalations and COD disputes create tickets) |
| Account | `kyc` (PAN/GSTIN/IFSC validation, agreements) · `vas` (WhatsApp/SMS/email per event) · `tracking-page` (branding, product recommendations and delivery ratings for the public `/track/?awb=` page) · `security` (two-factor login for email sign-in, sessions, API keys) · `activity` · `tutorials` · `shortcuts` (`/`, `n`, `?`, `g o`, `g s`…) |

**Rules affect real behaviour.** One rates engine (`rates()` in `server/seller-api.js`) applies courier priority, disabled couriers, blocked pincodes, padding, zone overrides, SKU courier/pincode rules and courier holidays. **Ship now**, the rate calculator, pincode check and Delivery Promise all use it, so a quote always equals the booked charge. Pickup dates skip Sundays and your holidays.

Removed after the competitor review: business loans (need a regulated lending partner), wholesale marketplace, packaging store, ONDC and plan tiers.

Server modules: `server/seller-api.js` (core, rules engine, team permissions, webhooks), `server/logistics-api.js` (shipping modules, public tracking and rates), `server/account-api.js` (channels, rate card, account, API-key auth), `server/ops-api.js` (team, webhooks, returns portal, COD reconciliation and confirmation, invoices, tickets, blocklist).

## Book a delivery (public website)

Anyone can book from `/book/`, or start from the search in the homepage hero.

- **Choose by time, speed and weight:** weight (kg or tonnes), pieces, optional size, pickup now or scheduled, an optional "deliver by" deadline, and a Best value / Fastest / Cheapest priority. Options that miss the deadline are hidden, and the page says how many.
- **Personal (B2C) or Business (B2B):** businesses also see freight options and can add a company name and GSTIN.
- **Local** (6 demo cities with localities) has on-demand vehicles from a two-wheeler (20 kg) through a three-wheeler, 7 ft mini truck, 8 ft pickup, 14 ft and 19 ft trucks and a 32 ft container to a 40 ft trailer (25 t). Vehicles are filtered by weight and volume. Pricing covers distance, night charge and loading helpers; pickup ETA and trip time are shown.
- **National** offers courier parcels (≤ 30 kg per piece, using the same rules engine as the dashboard), air cargo, part-truck load (PTL) and full-truck load (FTL) by vehicle class, priced by distance between pincodes.
- **International** offers express parcels, air freight (from 45 kg) and sea freight LCL (from 200 kg).
- **Providers:** every available provider gets its own row: couriers (Blue Dart, DTDC, Delhivery, Xpressbees), delivery apps (Porter, Rapido) and independent vehicle owners, including partners who register at `/partners/`. Courier services also appear for same-city routes. These are demo listings: there is no integration with these companies, and all prices, ratings and availability are simulated (`SEED_PARTNERS`, `freeNearby()` in `server/booking-api.js`; `COURIERS` in `server/seller-api.js`). Before launch you need agreements with each company and their live rates, and permission to use their names.
- **Compare and choose:** sort by best match, fastest, lowest price or highest weight limit, and filter by service type, vehicle, pickup time and maximum price. Tags mark the Recommended, Cheapest and Fastest options.
- **Booking:** contact details, addresses and pay at pickup or online (no payment is taken in this demo). Each booking gets a driver, a masked vehicle number, and pickup and delivery OTPs.
- **Live tracking** at `/track/?id=BK…`: a stage bar, route progress, driver card, the right OTP for the stage, and a timeline. The demo clock runs 20× faster for local trips and 2000× for national/international.
- **Partner network** at `/partners/`: drivers, fleet owners, transport agencies and contractors register their city and vehicles, and are matched into local quotes right away. The fictional seed partners include a driver co-op, agencies and a contractor.

API: `server/booking-api.js`. City localities and pincode coordinates are demo data for distance estimates. Swap in a maps/geocoding API for real routing.

## Homepage

- **Hero film:** real-time 3D in `public/js/hero-film.js`, with a setting for each kind of route: a miniature city for local, the map of India for national, and the globe for international. It loops a sample of how the platform works in each setting in turn: pickup, drop, the available services, the sender selects one, the request goes to that partner only, the partner comes to the pickup, and delivers. Once someone types, it follows their route: the setting changes to fit, and pins land at the real location on the map or globe. With `prefers-reduced-motion` it is one still frame; without WebGL only the captions remain. Prices in the sample card are examples.
- **Search:** pickup and drop each take an area, city or pin code, plus the weight. `resolveRoute()` in `server/booking-api.js` works out the service: the same city gets local vehicles, anything else national. **Abroad** swaps the drop for a country. Results appear under the hero: only the count when signed out (see Locked rates), the full list when signed in, and both lead to the booking page with the route filled in. Area pin codes in `AREA_PINS` are demo data.
- **How it works film:** a pinned 3D film (three.js r128 from a CDN) in `public/js/network-film.js`, set in one city built in code, with no downloaded textures. A shop has a parcel to send, the available services appear (a courier service, a delivery partner, a three-wheeler owner, an independent van and a truck owner), the sender selects the van, the request goes to that partner only, and the partner accepts, collects the parcel with a pickup OTP and delivers it with a delivery OTP. The last shot pulls back to the whole network and invites vehicle owners to join. Business names on the vehicles are examples. With `prefers-reduced-motion` it becomes six still frames beside the text; without WebGL the steps stay as text.
- **Locked rates:** `/v1/public/rates` and `/v1/public/booking/quote` return only `{ locked, count }` without a session, and `/v1/public/booking/book` needs one. The pricing and booking pages show blurred placeholders with a sign-in prompt, and `/?next=<path>#signup` brings the user back to their results.
- **What fits?:** a weight box that picks the smallest vehicle from `/v1/public/booking/meta` and shows its 3D render from `public/assets/vehicles3d/`.
- **Tracking:** results animate a parcel along the shipment's stages.
- **Sellers, developers, partners:** shipping-label feature cards with the sign-up form, a sample webhook feed using the API's event names.

Before going live, host three.js and the Earth image yourself rather than relying on the CDNs.

## Retired files

Nothing on the site loads these any more. They belonged to the old parcel journey and can be deleted: `public/js/journey.js`, `public/data/journey-*.json`, and everything in `public/assets/journey/` except `india-sat.jpg`. The hero film still uses `india-sat.jpg` and `public/js/journey-routes.js`.

## Where this build differs

- Vanilla JS replaces jQuery, Slick, GSAP and Lenis.
- Analytics and ads tags are left out.
- The email login, sign-up and reset endpoints, plus `/v1/me` and `/v1/tracking`, are my own design. The reference's handlers for these were not in the captured code.
- `getCaptchaToken` in `UT_SIGNUP_CONFIG` is a stub. Plug in reCAPTCHA or Turnstile there.
- Google sign-in is a disabled button until you connect an OAuth provider.
- Data is kept in a local file (`server/store.js`). Before going live, replace it with a real database and add an SMS provider.

## Files

```
server.js                 static server + mock API
public/index.html         page markup
server/seller-api.js      seller API core, rules engine + seeded demo data
server/logistics-api.js   shipments, print docs, bulk, international, exchanges, rules, risk, promise
server/account-api.js     channels, rate card, VAS, tracking page, KYC, security, API keys
server/ops-api.js         team, webhooks, returns portal, COD, invoices, tickets, blocklist
server/hub-api.js         unified dashboard: wallet, transport sections, travel, recharges, bills, auto-pay, profile
server/business-api.js    business module: WhatsApp automation, notifications, live tracking, single GST, maps config
server/whatsapp.js        WhatsApp Business Cloud API adapter, templates, webhook signature check
public/track/             public, seller-branded tracking page with ratings
public/returns/           public buyer returns & exchanges portal
public/pricing/           public pricing page with live rate calculator
public/book/ + js/book.js public "Book a delivery" (local / national / international, B2C / B2B)
public/partners/          partner sign-up for drivers, fleets, agencies and contractors
server/booking-api.js     vehicles, routes, quotes, recommendations, bookings, live tracking, partners
public/assets/vehicles/   vehicle icons (two-wheeler to 40 ft trailer, plane, ship, parcel, PTL)
public/app/               seller dashboard SPA (index.html, app.css, js/core.js, js/main.js, js/palette.js, js/pages/*)
public/dashboard.html     redirect to /app/ (old hand-off target)
public/css/styles.css     shared styles and brand tokens
public/css/home.css       homepage styles
public/js/token-handoff.js  cookie-based token hand-off (load first in <head>)
public/js/utm.js          attribution cookies and hidden-field fill
public/js/signup-form.js  sign-up/login state machine
public/js/tracking.js     order tracking
public/js/ui.js           header, menu, route progress, reveal on scroll
public/js/network-film.js the scroll-driven how-it-works film (three.js)
public/js/film-kit.js     shared 3D kit: vehicles, people, pins, road paths
public/js/hero-film.js    hero film: city, India map and globe; sample loop, then follows the search
public/js/journey-routes.js  India outline and the Bengaluru to Delhi road
public/js/home-fx.js      weight box, webhook feed
```
