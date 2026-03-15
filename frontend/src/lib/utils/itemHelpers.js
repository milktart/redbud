/**
 * Pure helper functions for travel items.
 * No side effects, no DOM access, no API calls.
 */

/**
 * Parse a UTC offset string like "UTC+5", "UTC-3", "UTC+5:30" into minutes.
 * Returns null if not a UTC offset format.
 */
export function parseUtcOffsetMinutes(timezone) {
  if (!timezone || !timezone.startsWith('UTC')) return null;
  const match = timezone.match(/^UTC([+-])(\d+)(?::(\d+))?$/);
  if (!match) return null;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

/**
 * Convert a UTC ISO datetime string to { date: 'YYYY-MM-DD', time: 'HH:MM' }
 * in the given IANA timezone (or UTC if none provided).
 * Also handles UTC+N / UTC-N offset strings (used by some airports).
 */
export function utcDateTimeParts(isoString, timezone) {
  if (!isoString) return { date: '', time: '' };

  const offsetMinutes = parseUtcOffsetMinutes(timezone);
  if (offsetMinutes !== null) {
    const localMs = new Date(isoString).getTime() + offsetMinutes * 60 * 1000;
    const local = new Date(localMs);
    const year  = local.getUTCFullYear();
    const month = String(local.getUTCMonth() + 1).padStart(2, '0');
    const day   = String(local.getUTCDate()).padStart(2, '0');
    const hour  = String(local.getUTCHours()).padStart(2, '0');
    const min   = String(local.getUTCMinutes()).padStart(2, '0');
    return { date: `${year}-${month}-${day}`, time: `${hour}:${min}` };
  }

  try {
    const dt = new Date(isoString);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = {};
    fmt.formatToParts(dt).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value; });
    // hour12:false can return '24' at midnight — normalise to '00'
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
  } catch {
    // Fallback: slice UTC directly
    const iso = new Date(isoString).toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  }
}

/** Parse YYYY-MM-DD as local time to avoid timezone off-by-one */
export function parseDateOnly(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = parseDateOnly(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateGroupHeader(dateKey) {
  if (!dateKey) return '';
  const d = parseDateOnly(String(dateKey).slice(0, 10));
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.toLocaleDateString('en-US', { day: '2-digit' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${day} ${month}`;
}

export function formatTripDateRange(departureDate, returnDate) {
  if (!departureDate) return '';
  const pad = n => String(n).padStart(2, '0');
  const start = parseDateOnly(departureDate);
  const startDay = pad(start.getDate());
  const startMonth = pad(start.getMonth() + 1);
  if (!returnDate) return `[${startDay}/${startMonth}]`;
  const end = parseDateOnly(returnDate);
  const endDay = pad(end.getDate());
  const endMonth = pad(end.getMonth() + 1);
  if (startMonth === endMonth) {
    return `[${startDay}-${endDay}/${startMonth}]`;
  }
  return `[${startDay}/${startMonth}-${endDay}/${endMonth}]`;
}

export function getTripNights(departureDate, returnDate) {
  if (!departureDate || !returnDate) return null;
  const diff = parseDateOnly(returnDate) - parseDateOnly(departureDate);
  const nights = Math.round(diff / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : null;
}

export function getItemPrimaryDate(form) {
  if (!form) return null;
  switch (form.itemType) {
    case 'flight':
    case 'transportation':
      return form.departureDate || null;
    case 'hotel':
      return form.checkInDate || null;
    case 'event':
      return form.startDate || null;
    case 'car_rental':
      return form.pickupDate || null;
    default:
      return null;
  }
}

export function getMonthYear(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'long' });
}

export function safeTimezone(timezone) {
  if (!timezone) return 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function formatDateTime(dateStr, timezone) {
  if (!dateStr) return '';
  const offsetMinutes = parseUtcOffsetMinutes(timezone);
  if (offsetMinutes !== null) {
    const { date, time } = utcDateTimeParts(dateStr, timezone);
    if (!date) return '';
    const [, , day] = date.split('-');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = monthNames[parseInt(date.split('-')[1], 10) - 1];
    return `${parseInt(day, 10)} ${month}, ${time}`;
  }
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', {
    timeZone: safeTimezone(timezone),
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function formatTime24(dateStr, timezone) {
  if (!dateStr) return '';
  const offsetMinutes = parseUtcOffsetMinutes(timezone);
  if (offsetMinutes !== null) {
    return utcDateTimeParts(dateStr, timezone).time;
  }
  const d = new Date(dateStr);
  return d.toLocaleString('en-GB', { timeZone: safeTimezone(timezone), hour: '2-digit', minute: '2-digit', hour12: false });
}

export function getFlightDuration(item) {
  if (!item.departureDateTime || !item.arrivalDateTime) return null;
  const diffMs = new Date(item.arrivalDateTime) - new Date(item.departureDateTime);
  if (diffMs <= 0) return null;
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function getLayoverDuration(prevFlight, nextFlight) {
  if (!prevFlight?.arrivalDateTime || !nextFlight?.departureDateTime) return null;
  const prevIds = new Set((prevFlight.attendees || []).map(a => a.userId));
  const nextIds = new Set((nextFlight.attendees || []).map(a => a.userId));
  if (prevIds.size !== nextIds.size || ![...prevIds].every(id => nextIds.has(id))) return null;
  const diffMs = new Date(nextFlight.departureDateTime) - new Date(prevFlight.arrivalDateTime);
  if (diffMs <= 0 || diffMs >= 48 * 60 * 60 * 1000) return null;
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function getItemEndDateTime(item) {
  switch (item.itemType) {
    case 'flight': return item.arrivalDateTime;
    case 'hotel': return item.checkOutDateTime;
    case 'transportation': return item.arrivalDateTime;
    case 'event': return item.endDateTime;
    case 'car_rental': return item.dropoffDateTime;
    default: return null;
  }
}

export function getItemSortDateTime(item) {
  switch (item.itemType) {
    case 'flight': return item.departureDateTime;
    case 'hotel': return item.checkInDateTime;
    case 'transportation': return item.departureDateTime;
    case 'event': return item.startDateTime;
    case 'car_rental': return item.pickupDateTime;
    default: return null;
  }
}

export function getItemLocalTimezone(item) {
  switch (item.itemType) {
    case 'flight':
    case 'transportation':
      return item.originTimezone;
    case 'hotel':
    case 'event':
      return item.timezone;
    case 'car_rental':
      return item.pickupTimezone;
    default:
      return null;
  }
}

export function getItemIcon(itemType) {
  switch (itemType) {
    case 'flight':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>`;
    case 'hotel':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3m12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4"/></svg>`;
    case 'transportation':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M6 10V6h12v4z"/></svg>`;
    case 'event':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17 12h-5v5h5zM16 1v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1zm3 18H5V8h14z"/></svg>`;
    case 'car_rental':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M5 11l1.5-4.5h11L19 11z"/></svg>`;
    default:
      return '';
  }
}

export function extractAirportCode(locationString) {
  if (!locationString) return 'Unknown';
  if (/^[A-Z]{3}$/.test(locationString.trim())) {
    return locationString.trim();
  }
  const match = locationString.match(/^([A-Z]{3})\s*[-–—]/);
  if (match) {
    return match[1];
  }
  const upperMatch = locationString.match(/[A-Z]{3}/);
  if (upperMatch) {
    return upperMatch[0];
  }
  return locationString.substring(0, 3).toUpperCase();
}

export function getItemLabel(item, formatTime24Fn) {
  switch (item.itemType) {
    case 'flight': {
      const originCode = extractAirportCode(item.origin);
      const destinationCode = extractAirportCode(item.destination);
      const depTime = item.departureDateTime && formatTime24Fn
        ? `${formatTime24Fn(item.departureDateTime, item.originTimezone)} · `
        : '';
      return `${depTime}${originCode} → ${destinationCode}`;
    }
    case 'hotel':
      return item.hotelName || 'Hotel';
    case 'transportation':
      return `${item.method || 'Transport'}: ${item.origin || 'Unknown'} → ${item.destination || 'Unknown'}`;
    case 'event':
      return item.name || 'Event';
    case 'car_rental':
      return `${item.company || 'Car'} Rental`;
    default:
      return 'Item';
  }
}

export function getItemDateTime(item) {
  switch (item.itemType) {
    case 'flight':
      return formatDateTime(item.departureDateTime, item.originTimezone);
    case 'hotel':
      return formatDateTime(item.checkInDateTime, item.timezone);
    case 'transportation':
      return formatDateTime(item.departureDateTime, item.originTimezone);
    case 'event':
      return formatDateTime(item.startDateTime, item.timezone);
    case 'car_rental':
      return formatDateTime(item.pickupDateTime, item.pickupTimezone);
    default:
      return '';
  }
}

export function getAttendeeInitials(user) {
  if (!user) return '?';
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first) return first[0].toUpperCase();
  if (user.email) return user.email[0].toUpperCase();
  return '?';
}

export function sortAttendees(attendees, createdBy) {
  return [...attendees].sort((a, b) => {
    const aIsCreator = a.userId === createdBy;
    const bIsCreator = b.userId === createdBy;
    if (aIsCreator && !bIsCreator) return -1;
    if (!aIsCreator && bIsCreator) return 1;
    const aFirst = (a.user?.firstName || '').toLowerCase();
    const bFirst = (b.user?.firstName || '').toLowerCase();
    if (aFirst !== bFirst) return aFirst < bFirst ? -1 : 1;
    const aLast = (a.user?.lastName || '').toLowerCase();
    const bLast = (b.user?.lastName || '').toLowerCase();
    return aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
  });
}

export function getOwnerName(obj) {
  const u = obj.user;
  if (u) {
    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    return name || u.email || 'A friend';
  }
  return 'A friend';
}

export function groupItemsByDate(items) {
  const grouped = {};

  for (const item of items) {
    const dateTime = getItemSortDateTime(item);
    if (!dateTime) continue;

    const itemTimezone = getItemLocalTimezone(item);
    const { date: localDate, time: localTime } = utcDateTimeParts(dateTime, itemTimezone);
    const dateKey = localDate || new Date(dateTime).toISOString().split('T')[0];
    const utcMs = new Date(dateTime).getTime();

    if (!grouped[dateKey]) {
      grouped[dateKey] = { dateKey, items: [], minUtcMs: utcMs };
    } else if (utcMs < grouped[dateKey].minUtcMs) {
      grouped[dateKey].minUtcMs = utcMs;
    }

    grouped[dateKey].items.push({ item, localTime: localTime || '00:00', utcMs });
  }

  // Sort date groups by the earliest UTC timestamp in each group rather than the
  // local date key string. This prevents date-line-crossing flights (e.g. ICN→SLC)
  // from being sorted out of order when their local date in Asia is "ahead" of the
  // local date of a connecting US flight that departs at an earlier UTC moment.
  const result = Object.values(grouped).sort((a, b) => a.minUtcMs - b.minUtcMs);
  result.forEach(group => {
    // Sort within the group by UTC timestamp so that items departing from
    // different timezones compare correctly (local time strings are not comparable
    // across timezones — e.g. ICN 19:20 KST is earlier than SLC 17:25 MDT in UTC).
    group.items.sort((a, b) => a.utcMs - b.utcMs);
    group.items = group.items.map(e => e.item);
  });
  return result;
}

/** Generate a great-circle arc path between two lat/lng points. */
export function generateCurvedPath(start, end, numPoints = 100) {
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const lat1Rad = toRad(lat1);
  const lng1Rad = toRad(lng1);
  const lat2Rad = toRad(lat2);
  const lng2Rad = toRad(lng2);

  const dLat = lat2Rad - lat1Rad;
  const dLng = lng2Rad - lng1Rad;

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (c < 0.0001) {
    return [start, end];
  }

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;

    const A = Math.sin((1 - f) * c) / Math.sin(c);
    const B = Math.sin(f * c) / Math.sin(c);

    const x = A * Math.cos(lat1Rad) * Math.cos(lng1Rad) + B * Math.cos(lat2Rad) * Math.cos(lng2Rad);
    const y = A * Math.cos(lat1Rad) * Math.sin(lng1Rad) + B * Math.cos(lat2Rad) * Math.sin(lng2Rad);
    const z = A * Math.sin(lat1Rad) + B * Math.sin(lat2Rad);

    const latRad = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2));
    const lngRad = Math.atan2(y, x);

    points.push([toDeg(latRad), toDeg(lngRad)]);
  }

  return points;
}

/** Split a path that crosses the International Date Line into multiple segments. */
export function splitPathAtDateline(points) {
  const segments = [];
  let currentSegment = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prevLng = points[i - 1][1];
    const currLng = points[i][1];
    const lngDiff = currLng - prevLng;

    if (Math.abs(lngDiff) > 180) {
      segments.push(currentSegment);
      currentSegment = [points[i]];
    } else {
      currentSegment.push(points[i]);
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

/** Get all mappable locations from an item with lat/lng coordinates. */
export function getItemLocations(item) {
  const locations = [];

  switch (item.itemType) {
    case 'flight':
      if (item.originLat && item.originLng) {
        locations.push({ lat: parseFloat(item.originLat), lng: parseFloat(item.originLng), label: item.origin, type: 'origin', item });
      }
      if (item.destinationLat && item.destinationLng) {
        locations.push({ lat: parseFloat(item.destinationLat), lng: parseFloat(item.destinationLng), label: item.destination, type: 'destination', item });
      }
      break;
    case 'hotel':
      if (item.lat && item.lng) {
        locations.push({ lat: parseFloat(item.lat), lng: parseFloat(item.lng), label: item.hotelName, type: 'hotel', item });
      }
      break;
    case 'transportation':
      if (item.originLat && item.originLng) {
        locations.push({ lat: parseFloat(item.originLat), lng: parseFloat(item.originLng), label: item.origin, type: 'origin', item });
      }
      if (item.destinationLat && item.destinationLng) {
        locations.push({ lat: parseFloat(item.destinationLat), lng: parseFloat(item.destinationLng), label: item.destination, type: 'destination', item });
      }
      break;
    case 'event':
      if (item.lat && item.lng) {
        locations.push({ lat: parseFloat(item.lat), lng: parseFloat(item.lng), label: item.name, type: 'event', item });
      }
      break;
    case 'car_rental':
      if (item.pickupLat && item.pickupLng) {
        locations.push({ lat: parseFloat(item.pickupLat), lng: parseFloat(item.pickupLng), label: item.pickupLocation, type: 'pickup', item });
      }
      if (item.dropoffLat && item.dropoffLng) {
        locations.push({ lat: parseFloat(item.dropoffLat), lng: parseFloat(item.dropoffLng), label: item.dropoffLocation, type: 'dropoff', item });
      }
      break;
  }

  return locations;
}

export function flattenStandaloneObj(obj) {
  return [
    ...(obj.flights || []).map(item => ({ ...item, itemType: 'flight' })),
    ...(obj.hotels || []).map(item => ({ ...item, itemType: 'hotel' })),
    ...(obj.transportation || []).map(item => ({ ...item, itemType: 'transportation' })),
    ...(obj.events || []).map(item => ({ ...item, itemType: 'event' })),
    ...(obj.carRentals || []).map(item => ({ ...item, itemType: 'car_rental' })),
  ];
}
