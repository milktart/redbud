const { spawn } = require('child_process');
const LoyaltyService = require('./LoyaltyService');
const logger = require('../utils/logger');

const loyaltyService = new LoyaltyService();

class PnrService {
  /**
   * Find a matching loyalty account for the requested airline.
   * Throws with statusCode 422 if not found or missing name fields.
   */
  async findLoyaltyAccount(userId, airline) {
    if (airline.toLowerCase() !== 'delta') {
      const err = new Error(`Unsupported airline: ${airline}`);
      err.statusCode = 400;
      throw err;
    }

    const programs = await loyaltyService.getMyPrograms(userId);
    const match = programs.find(
      p =>
        p.category === 'airline' &&
        p.programName.toLowerCase().includes('delta') &&
        p.accountFirstName &&
        p.accountLastName
    );

    if (!match) {
      const err = new Error(
        'No Delta loyalty account with name found. Add one in Settings → Loyalty Programs.'
      );
      err.statusCode = 422;
      throw err;
    }

    return { firstName: match.accountFirstName, lastName: match.accountLastName };
  }

  /**
   * Spawn `milk flights --pull <PNR> <LASTNAME/FIRSTNAME>` and return raw stdout.
   * Times out after 90 seconds (headless browser session capture can be slow).
   */
  runMilkPull(pnr, lastName, firstName) {
    return new Promise((resolve, reject) => {
      const nameArg = `${lastName.toUpperCase()}/${firstName.toUpperCase()}`;
      logger.info('PNR_LOOKUP_SPAWN', { pnr, nameArg });

      const proc = spawn('milk', ['flights', '--pull', pnr.toUpperCase(), nameArg], {
        timeout: 90000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('close', code => {
        if (code !== 0) {
          const err = new Error(stderr.trim() || 'PNR lookup failed');
          err.statusCode = 502;
          return reject(err);
        }
        resolve(stdout);
      });

      proc.on('error', spawnErr => {
        logger.error('PNR_SPAWN_ERROR', { error: spawnErr.message });
        const err = new Error('Failed to run PNR lookup tool');
        err.statusCode = 500;
        reject(err);
      });
    });
  }

  /**
   * Parse stdout from `milk flights --pull` into structured flight objects.
   *
   * The milk binary outputs a fixed-width table with ANSI escape codes:
   *   PNR     FLT     ORG  DST  DEP              ARR              PAX   SEAT  CLS    A/C  STATUS  MI
   *   F93BMN  DL0173  SLC  ICN  02JUL 1155       03JUL 1520       ...   —     ...    ...  ON TIME  5888
   *
   * Dates come in "02JUL" format → converted to YYYY-MM-DD using the year
   * inferred from context (current year, rolling forward if needed).
   */
  parseMilkOutput(stdout, pnr) {
    // Strip ANSI escape codes
    // eslint-disable-next-line no-control-regex
    const clean = stdout.replace(/\x1B\[[0-9;]*m/g, '');

    const flights = [];
    const now = new Date();
    const currentYear = now.getFullYear();

    const MONTHS = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };

    function parseMilkDate(raw) {
      // raw like "02JUL" or "14JUL"
      const m = raw.match(/^(\d{2})([A-Z]{3})$/);
      if (!m) return '';
      const day = parseInt(m[1], 10);
      const month = MONTHS[m[2]];
      if (month === undefined) return '';

      // Pick the nearest upcoming year (or current year if already past)
      let year = currentYear;
      const d = new Date(year, month, day);
      if (d < now) {
        year = currentYear + 1;
      }

      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    for (const rawLine of clean.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      // Skip header/separator lines (no flight number pattern)
      // Data lines start with a PNR (6 alphanum) or spaces then fields
      // We look for lines that contain a flight number like DL0173
      const fltMatch = line.match(/\b([A-Z]{2})(\d{3,4})\b/);
      if (!fltMatch) continue;

      // Split on 2+ spaces to get columns
      const cols = line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
      // cols order: [PNR-or-blank, FLT, ORG, DST, DEP-date, DEP-time, ARR-date, ARR-time, PAX..., SEAT, CLS, A/C, STATUS, MI]
      // But the table collapses dep/arr date+time into one token each split by space,
      // and the split on 2+ spaces should yield them separately.
      // Expected columns: PNR, FLT, ORG, DST, DEP_DATE DEP_TIME (might be split), ARR_DATE ARR_TIME, PAX, SEAT, CLS, A/C, STATUS, MI

      try {
        // Find the flight number column position
        const fltIdx = cols.findIndex(c => /^[A-Z]{2}\d{3,4}$/.test(c));
        if (fltIdx === -1) continue;

        const flt = cols[fltIdx];
        const origin = cols[fltIdx + 1] || '';
        const dest = cols[fltIdx + 2] || '';

        // DEP and ARR are "DDMON HHMM" — they may be one element split by space
        // The raw split on 2+ spaces should give "02JUL" and "1155" as separate items
        // OR "02JUL 1155" as one item
        let depDate = '', depTime = '', arrDate = '', arrTime = '';

        const depRaw = cols[fltIdx + 3] || '';
        const depParts = depRaw.split(/\s+/);
        if (depParts.length >= 2) {
          depDate = parseMilkDate(depParts[0]);
          depTime = depParts[1].replace(/(\d{2})(\d{2})/, '$1:$2');
          const arrRaw = cols[fltIdx + 4] || '';
          const arrParts = arrRaw.split(/\s+/);
          if (arrParts.length >= 2) {
            arrDate = parseMilkDate(arrParts[0]);
            arrTime = arrParts[1].replace(/(\d{2})(\d{2})/, '$1:$2');
          }
        } else {
          // Date and time are separate tokens
          depDate = parseMilkDate(depRaw);
          depTime = (cols[fltIdx + 4] || '').replace(/(\d{2})(\d{2})/, '$1:$2');
          const arrRaw = cols[fltIdx + 5] || '';
          arrDate = parseMilkDate(arrRaw);
          arrTime = (cols[fltIdx + 6] || '').replace(/(\d{2})(\d{2})/, '$1:$2');
        }

        const airlineCode = flt.match(/^([A-Z]{2})/)[1];

        flights.push({
          flightNumber: flt,
          airline: airlineCode,
          origin: origin.toUpperCase(),
          destination: dest.toUpperCase(),
          departureDate: depDate,
          departureTime: depTime,
          arrivalDate: arrDate,
          arrivalTime: arrTime,
          pnr: pnr.toUpperCase(),
        });
      } catch (e) {
        logger.warn('PNR_PARSE_SKIP_LINE', { line });
      }
    }

    return flights;
  }

  /**
   * Full lookup: find loyalty account → spawn milk → parse output.
   * This is the single method the controller calls.
   */
  async lookup(userId, pnr, airline) {
    const { firstName, lastName } = await this.findLoyaltyAccount(userId, airline);
    const stdout = await this.runMilkPull(pnr, lastName, firstName);
    return this.parseMilkOutput(stdout, pnr);
  }
}

module.exports = PnrService;
