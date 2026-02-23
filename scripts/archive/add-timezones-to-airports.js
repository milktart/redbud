/**
 * Script to add timezone information to airports.json
 * Uses a combination of:
 * 1. Hard-coded major airport timezone mappings
 * 2. Country-based timezone fallback
 */

const fs = require('fs');
const path = require('path');

// Major airport code to timezone mapping
const majorAirportTimezones = {
  // US East Coast
  JFK: 'America/New_York',
  LGA: 'America/New_York',
  EWR: 'America/New_York',
  BOS: 'America/New_York',
  PHL: 'America/New_York',
  ATL: 'America/New_York',
  MIA: 'America/New_York',
  MCO: 'America/New_York',

  // US Central
  ORD: 'America/Chicago',
  DFW: 'America/Chicago',
  IAH: 'America/Chicago',
  DEN: 'America/Chicago',
  AUS: 'America/Chicago',
  DAL: 'America/Chicago',
  STL: 'America/Chicago',
  MSY: 'America/Chicago',
  MCI: 'America/Chicago',

  // US Mountain
  PHX: 'America/Phoenix',

  // US West Coast
  LAX: 'America/Los_Angeles',
  SFO: 'America/Los_Angeles',
  SEA: 'America/Los_Angeles',
  LAS: 'America/Los_Angeles',
  SJC: 'America/Los_Angeles',
  PDX: 'America/Los_Angeles',
  SAN: 'America/Los_Angeles',

  // US Alaska/Hawaii
  ANC: 'America/Anchorage',
  HNL: 'Pacific/Honolulu',

  // Europe
  LHR: 'Europe/London',
  LGW: 'Europe/London',
  STN: 'Europe/London',
  CDG: 'Europe/Paris',
  ORY: 'Europe/Paris',
  FRA: 'Europe/Berlin',
  TXL: 'Europe/Berlin',
  BER: 'Europe/Berlin',
  AMS: 'Europe/Amsterdam',
  DUB: 'Europe/Dublin',
  MUC: 'Europe/Berlin',
  ZRH: 'Europe/Zurich',
  FCO: 'Europe/Rome',
  MAD: 'Europe/Madrid',
  BCN: 'Europe/Madrid',
  LIS: 'Europe/Lisbon',
  VIE: 'Europe/Vienna',
  PRG: 'Europe/Prague',
  WAW: 'Europe/Warsaw',

  // Middle East
  IST: 'Europe/Istanbul',
  DXB: 'Asia/Dubai',
  AUH: 'Asia/Dubai',
  DOH: 'Asia/Qatar',
  RUH: 'Asia/Riyadh',

  // Asia
  NRT: 'Asia/Tokyo',
  HND: 'Asia/Tokyo',
  KIX: 'Asia/Tokyo',
  ICN: 'Asia/Seoul',
  SIN: 'Asia/Singapore',
  HKG: 'Asia/Hong_Kong',
  SHA: 'Asia/Shanghai',
  PVG: 'Asia/Shanghai',
  PEK: 'Asia/Shanghai',
  BKK: 'Asia/Bangkok',
  KUL: 'Asia/Kuala_Lumpur',
  CGK: 'Asia/Jakarta',
  DEL: 'Asia/Kolkata',
  BOM: 'Asia/Kolkata',
  MAA: 'Asia/Kolkata',

  // Australia/Pacific
  SYD: 'Australia/Sydney',
  MEL: 'Australia/Melbourne',
  BNE: 'Australia/Brisbane',
  AKL: 'Pacific/Auckland',
  NZA: 'Pacific/Auckland',

  // Canada
  YYZ: 'America/Toronto',
  YVR: 'America/Vancouver',
  YYJ: 'America/Vancouver',
  YLW: 'America/Vancouver',
  YLY: 'America/Vancouver',
  YXC: 'America/Edmonton',
  YEG: 'America/Edmonton',
  YLX: 'America/Edmonton',
  YCA: 'America/Edmonton',
  YQR: 'America/Regina',
  YWG: 'America/Winnipeg',
  YQX: 'America/Halifax',
  YHZ: 'America/Halifax',
};

// Country code to primary timezone mapping
// Uses the capital city's timezone or the most common timezone
const countryTimezones = {
  // Americas
  US: 'America/New_York',
  CA: 'America/Toronto',
  MX: 'America/Mexico_City',
  BR: 'America/Sao_Paulo',
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  CO: 'America/Bogota',
  PE: 'America/Lima',
  VE: 'America/Caracas',
  EC: 'America/Guayaquil',
  BO: 'America/La_Paz',
  PY: 'America/Asuncion',
  UY: 'America/Montevideo',
  PA: 'America/Panama',
  CR: 'America/Costa_Rica',
  NI: 'America/Managua',
  HN: 'America/Tegucigalpa',
  SV: 'America/El_Salvador',
  GT: 'America/Guatemala',
  BZ: 'America/Belize',
  JM: 'America/Jamaica',
  BS: 'America/Nassau',
  TT: 'America/Port_of_Spain',
  BB: 'America/Barbados',
  LC: 'America/St_Lucia',
  VC: 'America/St_Vincent',
  AG: 'America/Antigua',
  DM: 'America/Dominica',
  GD: 'America/Grenada',
  DO: 'America/Santo_Domingo',
  KN: 'America/St_Kitts',
  CU: 'America/Havana',
  PR: 'America/Puerto_Rico',
  VG: 'America/Virgin',
  VI: 'America/Virgin',

  // Europe
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  AT: 'Europe/Vienna',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  LU: 'Europe/Luxembourg',
  CH: 'Europe/Zurich',
  LI: 'Europe/Zurich',
  IT: 'Europe/Rome',
  VA: 'Europe/Rome',
  SM: 'Europe/Rome',
  MT: 'Europe/Malta',
  ES: 'Europe/Madrid',
  AD: 'Europe/Madrid',
  PT: 'Europe/Lisbon',
  NO: 'Europe/Oslo',
  SE: 'Europe/Stockholm',
  FI: 'Europe/Helsinki',
  DK: 'Europe/Copenhagen',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  SK: 'Europe/Prague',
  HU: 'Europe/Budapest',
  RO: 'Europe/Bucharest',
  BG: 'Europe/Sofia',
  GR: 'Europe/Athens',
  HR: 'Europe/Zagreb',
  SI: 'Europe/Ljubljana',
  BA: 'Europe/Sarajevo',
  RS: 'Europe/Belgrade',
  ME: 'Europe/Podgorica',
  MK: 'Europe/Skopje',
  AL: 'Europe/Tirana',
  UA: 'Europe/Kyiv',
  BY: 'Europe/Minsk',
  MD: 'Europe/Chisinau',
  RU: 'Europe/Moscow',
  TR: 'Europe/Istanbul',
  CY: 'Europe/Nicosia',
  IS: 'Atlantic/Reykjavik',

  // Middle East & Central Asia
  SA: 'Asia/Riyadh',
  AE: 'Asia/Dubai',
  OM: 'Asia/Muscat',
  KW: 'Asia/Kuwait',
  QA: 'Asia/Qatar',
  BH: 'Asia/Bahrain',
  YE: 'Asia/Aden',
  JO: 'Asia/Amman',
  IL: 'Asia/Jerusalem',
  PS: 'Asia/Jerusalem',
  LB: 'Asia/Beirut',
  SY: 'Asia/Damascus',
  IQ: 'Asia/Baghdad',
  IR: 'Asia/Tehran',
  AF: 'Asia/Kabul',
  PK: 'Asia/Karachi',
  UZ: 'Asia/Tashkent',
  TJ: 'Asia/Dushanbe',
  KG: 'Asia/Bishkek',
  TM: 'Asia/Ashgabat',
  KZ: 'Asia/Almaty',

  // Asia
  IN: 'Asia/Kolkata',
  BD: 'Asia/Dhaka',
  NP: 'Asia/Kathmandu',
  BT: 'Asia/Thimphu',
  LK: 'Asia/Colombo',
  MM: 'Asia/Yangon',
  TH: 'Asia/Bangkok',
  LA: 'Asia/Vientiane',
  KH: 'Asia/Phnom_Penh',
  VN: 'Asia/Ho_Chi_Minh',
  MY: 'Asia/Kuala_Lumpur',
  SG: 'Asia/Singapore',
  BN: 'Asia/Brunei',
  ID: 'Asia/Jakarta',
  PH: 'Asia/Manila',
  TL: 'Asia/Dili',
  CN: 'Asia/Shanghai',
  MN: 'Asia/Ulaanbaatar',
  KR: 'Asia/Seoul',
  JP: 'Asia/Tokyo',
  TW: 'Asia/Taipei',
  HK: 'Asia/Hong_Kong',
  MO: 'Asia/Macau',

  // Africa
  EG: 'Africa/Cairo',
  ZA: 'Africa/Johannesburg',
  NG: 'Africa/Lagos',
  ET: 'Africa/Addis_Ababa',
  KE: 'Africa/Nairobi',
  TZ: 'Africa/Dar_es_Salaam',
  MZ: 'Africa/Maputo',
  ZM: 'Africa/Lusaka',
  ZW: 'Africa/Harare',
  BW: 'Africa/Gaborone',
  NA: 'Africa/Windhoek',
  AO: 'Africa/Luanda',
  CD: 'Africa/Kinshasa',
  CG: 'Africa/Brazzaville',
  GA: 'Africa/Gabon',
  GQ: 'Africa/Malabo',
  ST: 'Africa/Sao_Tome',
  CM: 'Africa/Douala',
  TD: 'Africa/Ndjamena',
  CF: 'Africa/Bangui',
  BJ: 'Africa/Porto-Novo',
  TG: 'Africa/Lome',
  GH: 'Africa/Accra',
  CI: 'Africa/Abidjan',
  SN: 'Africa/Dakar',
  ML: 'Africa/Bamako',
  MR: 'Africa/Nouakchott',
  MU: 'Africa/Mauritius',
  SC: 'Indian/Seychelles',
  DZ: 'Africa/Algiers',
  MA: 'Africa/Casablanca',
  TN: 'Africa/Tunis',
  LY: 'Africa/Tripoli',
  SD: 'Africa/Khartoum',
  SS: 'Africa/Juba',
  UG: 'Africa/Kampala',
  RW: 'Africa/Kigali',
  BI: 'Africa/Bujumbura',
  SO: 'Africa/Mogadishu',
  DJ: 'Africa/Djibouti',
  ER: 'Africa/Asmara',
  SZ: 'Africa/Mbabane',
  LS: 'Africa/Maseru',
  MW: 'Africa/Lilongwe',

  // Oceania & Pacific
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  FJ: 'Pacific/Fiji',
  SB: 'Pacific/Guadalcanal',
  VU: 'Pacific/Efate',
  PG: 'Pacific/Port_Moresby',
  TO: 'Pacific/Tongatapu',
  WS: 'Pacific/Apia',
  KI: 'Pacific/Kiritimati',
  MH: 'Pacific/Majuro',
  FM: 'Pacific/Pohnpei',
  PW: 'Pacific/Palau',
  GU: 'Pacific/Guam',
  MP: 'Pacific/Saipan',
  NC: 'Pacific/Noumea',
  PF: 'Pacific/Tahiti',
};

function getTimezoneForAirport(iataCode, countryCode, lat, lon) {
  // 1. Check if this is a major airport with known timezone
  if (iataCode && majorAirportTimezones[iataCode]) {
    return majorAirportTimezones[iataCode];
  }

  // 2. Fall back to country timezone
  if (countryCode && countryTimezones[countryCode]) {
    return countryTimezones[countryCode];
  }

  // 3. Estimate timezone from longitude (rough approximation)
  // This is a fallback - very approximate
  if (lat !== undefined && lon !== undefined) {
    // Very rough UTC offset based on longitude
    // Each 15 degrees is roughly 1 hour
    const estimatedOffset = Math.round(lon / 15);

    if (estimatedOffset >= -12 && estimatedOffset <= 12) {
      const hours = Math.abs(estimatedOffset);
      const sign = estimatedOffset >= 0 ? '+' : '-';
      // Return a generic UTC offset timezone
      return `UTC${sign}${hours}`;
    }
  }

  // 4. Default to UTC
  return 'UTC';
}

try {
  // Read the airports file
  const filePath = path.join(__dirname, '../data/airports.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Add timezone to each airport
  let updated = 0;
  const newData = {};

  for (const [iataCode, airport] of Object.entries(data)) {
    newData[iataCode] = {
      ...airport,
      timezone: getTimezoneForAirport(
        iataCode,
        airport.country_code,
        airport.latitude,
        airport.longitude
      ),
    };
    updated++;

    if (updated % 1000 === 0) {
      // Progress update removed
    }
  }

  // Write back to file
  fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
} catch (error) {
  process.exit(1);
}
