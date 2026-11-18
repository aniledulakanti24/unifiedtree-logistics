// Every country UT Log can quote to: the 193 UN member states plus the two observer states
// (Holy See and Palestine) = 195. Each has an ISO 3166-1 alpha-2 code (for flags) and a region.
// Price and transit come from the region (demo rates); a few lanes keep their own multiplier.
'use strict';

const REGION = {
  'South Asia': { mult: 0.95, group: 1 }, 'Middle East': { mult: 1.0, group: 1 }, 'Southeast Asia': { mult: 1.05, group: 1 },
  'East Asia': { mult: 1.2, group: 2 }, 'Central Asia': { mult: 1.3, group: 2 }, Europe: { mult: 1.35, group: 2 },
  Africa: { mult: 1.45, group: 3 }, 'North America': { mult: 1.4, group: 3 }, 'Latin America': { mult: 1.6, group: 3 }, Oceania: { mult: 1.5, group: 3 },
};
// name, code, region
const LIST = [
  ['Afghanistan', 'AF', 'South Asia'], ['Albania', 'AL', 'Europe'], ['Algeria', 'DZ', 'Africa'], ['Andorra', 'AD', 'Europe'], ['Angola', 'AO', 'Africa'],
  ['Antigua and Barbuda', 'AG', 'Latin America'], ['Argentina', 'AR', 'Latin America'], ['Armenia', 'AM', 'Central Asia'], ['Australia', 'AU', 'Oceania'], ['Austria', 'AT', 'Europe'],
  ['Azerbaijan', 'AZ', 'Central Asia'], ['Bahamas', 'BS', 'Latin America'], ['Bahrain', 'BH', 'Middle East'], ['Bangladesh', 'BD', 'South Asia'], ['Barbados', 'BB', 'Latin America'],
  ['Belarus', 'BY', 'Europe'], ['Belgium', 'BE', 'Europe'], ['Belize', 'BZ', 'Latin America'], ['Benin', 'BJ', 'Africa'], ['Bhutan', 'BT', 'South Asia'],
  ['Bolivia', 'BO', 'Latin America'], ['Bosnia and Herzegovina', 'BA', 'Europe'], ['Botswana', 'BW', 'Africa'], ['Brazil', 'BR', 'Latin America'], ['Brunei', 'BN', 'Southeast Asia'],
  ['Bulgaria', 'BG', 'Europe'], ['Burkina Faso', 'BF', 'Africa'], ['Burundi', 'BI', 'Africa'], ['Cabo Verde', 'CV', 'Africa'], ['Cambodia', 'KH', 'Southeast Asia'],
  ['Cameroon', 'CM', 'Africa'], ['Canada', 'CA', 'North America'], ['Central African Republic', 'CF', 'Africa'], ['Chad', 'TD', 'Africa'], ['Chile', 'CL', 'Latin America'],
  ['China', 'CN', 'East Asia'], ['Colombia', 'CO', 'Latin America'], ['Comoros', 'KM', 'Africa'], ['Congo', 'CG', 'Africa'], ['Costa Rica', 'CR', 'Latin America'],
  ["Côte d'Ivoire", 'CI', 'Africa'], ['Croatia', 'HR', 'Europe'], ['Cuba', 'CU', 'Latin America'], ['Cyprus', 'CY', 'Europe'], ['Czechia', 'CZ', 'Europe'],
  ['Democratic Republic of the Congo', 'CD', 'Africa'], ['Denmark', 'DK', 'Europe'], ['Djibouti', 'DJ', 'Africa'], ['Dominica', 'DM', 'Latin America'], ['Dominican Republic', 'DO', 'Latin America'],
  ['Ecuador', 'EC', 'Latin America'], ['Egypt', 'EG', 'Africa'], ['El Salvador', 'SV', 'Latin America'], ['Equatorial Guinea', 'GQ', 'Africa'], ['Eritrea', 'ER', 'Africa'],
  ['Estonia', 'EE', 'Europe'], ['Eswatini', 'SZ', 'Africa'], ['Ethiopia', 'ET', 'Africa'], ['Fiji', 'FJ', 'Oceania'], ['Finland', 'FI', 'Europe'],
  ['France', 'FR', 'Europe'], ['Gabon', 'GA', 'Africa'], ['Gambia', 'GM', 'Africa'], ['Georgia', 'GE', 'Central Asia'], ['Germany', 'DE', 'Europe'],
  ['Ghana', 'GH', 'Africa'], ['Greece', 'GR', 'Europe'], ['Grenada', 'GD', 'Latin America'], ['Guatemala', 'GT', 'Latin America'], ['Guinea', 'GN', 'Africa'],
  ['Guinea-Bissau', 'GW', 'Africa'], ['Guyana', 'GY', 'Latin America'], ['Haiti', 'HT', 'Latin America'], ['Holy See', 'VA', 'Europe'], ['Honduras', 'HN', 'Latin America'],
  ['Hungary', 'HU', 'Europe'], ['Iceland', 'IS', 'Europe'], ['India', 'IN', 'South Asia'], ['Indonesia', 'ID', 'Southeast Asia'], ['Iran', 'IR', 'Middle East'],
  ['Iraq', 'IQ', 'Middle East'], ['Ireland', 'IE', 'Europe'], ['Israel', 'IL', 'Middle East'], ['Italy', 'IT', 'Europe'], ['Jamaica', 'JM', 'Latin America'],
  ['Japan', 'JP', 'East Asia'], ['Jordan', 'JO', 'Middle East'], ['Kazakhstan', 'KZ', 'Central Asia'], ['Kenya', 'KE', 'Africa'], ['Kiribati', 'KI', 'Oceania'],
  ['Kuwait', 'KW', 'Middle East'], ['Kyrgyzstan', 'KG', 'Central Asia'], ['Laos', 'LA', 'Southeast Asia'], ['Latvia', 'LV', 'Europe'], ['Lebanon', 'LB', 'Middle East'],
  ['Lesotho', 'LS', 'Africa'], ['Liberia', 'LR', 'Africa'], ['Libya', 'LY', 'Africa'], ['Liechtenstein', 'LI', 'Europe'], ['Lithuania', 'LT', 'Europe'],
  ['Luxembourg', 'LU', 'Europe'], ['Madagascar', 'MG', 'Africa'], ['Malawi', 'MW', 'Africa'], ['Malaysia', 'MY', 'Southeast Asia'], ['Maldives', 'MV', 'South Asia'],
  ['Mali', 'ML', 'Africa'], ['Malta', 'MT', 'Europe'], ['Marshall Islands', 'MH', 'Oceania'], ['Mauritania', 'MR', 'Africa'], ['Mauritius', 'MU', 'Africa'],
  ['Mexico', 'MX', 'Latin America'], ['Micronesia', 'FM', 'Oceania'], ['Moldova', 'MD', 'Europe'], ['Monaco', 'MC', 'Europe'], ['Mongolia', 'MN', 'East Asia'],
  ['Montenegro', 'ME', 'Europe'], ['Morocco', 'MA', 'Africa'], ['Mozambique', 'MZ', 'Africa'], ['Myanmar', 'MM', 'Southeast Asia'], ['Namibia', 'NA', 'Africa'],
  ['Nauru', 'NR', 'Oceania'], ['Nepal', 'NP', 'South Asia'], ['Netherlands', 'NL', 'Europe'], ['New Zealand', 'NZ', 'Oceania'], ['Nicaragua', 'NI', 'Latin America'],
  ['Niger', 'NE', 'Africa'], ['Nigeria', 'NG', 'Africa'], ['North Korea', 'KP', 'East Asia'], ['North Macedonia', 'MK', 'Europe'], ['Norway', 'NO', 'Europe'],
  ['Oman', 'OM', 'Middle East'], ['Pakistan', 'PK', 'South Asia'], ['Palau', 'PW', 'Oceania'], ['Palestine', 'PS', 'Middle East'], ['Panama', 'PA', 'Latin America'],
  ['Papua New Guinea', 'PG', 'Oceania'], ['Paraguay', 'PY', 'Latin America'], ['Peru', 'PE', 'Latin America'], ['Philippines', 'PH', 'Southeast Asia'], ['Poland', 'PL', 'Europe'],
  ['Portugal', 'PT', 'Europe'], ['Qatar', 'QA', 'Middle East'], ['Romania', 'RO', 'Europe'], ['Russia', 'RU', 'Europe'], ['Rwanda', 'RW', 'Africa'],
  ['Saint Kitts and Nevis', 'KN', 'Latin America'], ['Saint Lucia', 'LC', 'Latin America'], ['Saint Vincent and the Grenadines', 'VC', 'Latin America'], ['Samoa', 'WS', 'Oceania'], ['San Marino', 'SM', 'Europe'],
  ['São Tomé and Príncipe', 'ST', 'Africa'], ['Saudi Arabia', 'SA', 'Middle East'], ['Senegal', 'SN', 'Africa'], ['Serbia', 'RS', 'Europe'], ['Seychelles', 'SC', 'Africa'],
  ['Sierra Leone', 'SL', 'Africa'], ['Singapore', 'SG', 'Southeast Asia'], ['Slovakia', 'SK', 'Europe'], ['Slovenia', 'SI', 'Europe'], ['Solomon Islands', 'SB', 'Oceania'],
  ['Somalia', 'SO', 'Africa'], ['South Africa', 'ZA', 'Africa'], ['South Korea', 'KR', 'East Asia'], ['South Sudan', 'SS', 'Africa'], ['Spain', 'ES', 'Europe'],
  ['Sri Lanka', 'LK', 'South Asia'], ['Sudan', 'SD', 'Africa'], ['Suriname', 'SR', 'Latin America'], ['Sweden', 'SE', 'Europe'], ['Switzerland', 'CH', 'Europe'],
  ['Syria', 'SY', 'Middle East'], ['Tajikistan', 'TJ', 'Central Asia'], ['Tanzania', 'TZ', 'Africa'], ['Thailand', 'TH', 'Southeast Asia'], ['Timor-Leste', 'TL', 'Southeast Asia'],
  ['Togo', 'TG', 'Africa'], ['Tonga', 'TO', 'Oceania'], ['Trinidad and Tobago', 'TT', 'Latin America'], ['Tunisia', 'TN', 'Africa'], ['Türkiye', 'TR', 'Middle East'],
  ['Turkmenistan', 'TM', 'Central Asia'], ['Tuvalu', 'TV', 'Oceania'], ['Uganda', 'UG', 'Africa'], ['Ukraine', 'UA', 'Europe'], ['United Arab Emirates', 'AE', 'Middle East'],
  ['United Kingdom', 'GB', 'Europe'], ['United States', 'US', 'North America'], ['Uruguay', 'UY', 'Latin America'], ['Uzbekistan', 'UZ', 'Central Asia'], ['Vanuatu', 'VU', 'Oceania'],
  ['Venezuela', 'VE', 'Latin America'], ['Vietnam', 'VN', 'Southeast Asia'], ['Yemen', 'YE', 'Middle East'], ['Zambia', 'ZM', 'Africa'], ['Zimbabwe', 'ZW', 'Africa'],
];
// Lanes with their own established rate (kept from before).
const OWN = { 'United States': [1.4, 3], 'United Kingdom': [1.3, 2], 'United Arab Emirates': [1.0, 1], Singapore: [1.0, 1], Australia: [1.5, 3], Canada: [1.45, 3], Germany: [1.35, 2] };
// Shown first in the picker.
const POPULAR = ['United Arab Emirates', 'United States', 'United Kingdom', 'Singapore', 'Saudi Arabia', 'Canada', 'Australia', 'Germany'];

const ALL = LIST.map(([name, code, region]) => ({ name, code, region, mult: (OWN[name] || [REGION[region].mult])[0], group: (OWN[name] || [, REGION[region].group])[1] }));
// India is the origin, so it is not a destination.
const DESTINATIONS = ALL.filter((c) => c.code !== 'IN');
module.exports = {
  ALL, DESTINATIONS, POPULAR,
  rateOf: Object.fromEntries(DESTINATIONS.map((c) => [c.name, c.mult])),
  groupOf: Object.fromEntries(DESTINATIONS.map((c) => [c.name, c.group])),
};
