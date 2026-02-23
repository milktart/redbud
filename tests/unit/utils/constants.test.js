/**
 * Unit Tests for utils/constants.js
 * Tests time conversion constants
 */

/* eslint-env jest */

const {
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
} = require('../../../utils/constants');

describe('Time Constants', () => {
  describe('MS_PER_SECOND', () => {
    it('should equal 1000 milliseconds', () => {
      expect(MS_PER_SECOND).toBe(1000);
    });

    it('should be a number', () => {
      expect(typeof MS_PER_SECOND).toBe('number');
    });
  });

  describe('MS_PER_MINUTE', () => {
    it('should equal 60000 milliseconds (60 seconds)', () => {
      expect(MS_PER_MINUTE).toBe(60000);
    });

    it('should equal 60 * MS_PER_SECOND', () => {
      expect(MS_PER_MINUTE).toBe(60 * MS_PER_SECOND);
    });

    it('should be a number', () => {
      expect(typeof MS_PER_MINUTE).toBe('number');
    });
  });

  describe('MS_PER_HOUR', () => {
    it('should equal 3600000 milliseconds (60 minutes)', () => {
      expect(MS_PER_HOUR).toBe(3600000);
    });

    it('should equal 60 * MS_PER_MINUTE', () => {
      expect(MS_PER_HOUR).toBe(60 * MS_PER_MINUTE);
    });

    it('should be a number', () => {
      expect(typeof MS_PER_HOUR).toBe('number');
    });
  });

  describe('MS_PER_DAY', () => {
    it('should equal 86400000 milliseconds (24 hours)', () => {
      expect(MS_PER_DAY).toBe(86400000);
    });

    it('should equal 24 * MS_PER_HOUR', () => {
      expect(MS_PER_DAY).toBe(24 * MS_PER_HOUR);
    });

    it('should be a number', () => {
      expect(typeof MS_PER_DAY).toBe('number');
    });
  });

  describe('Conversion accuracy', () => {
    it('should correctly convert 1 day to milliseconds', () => {
      const oneDayInMs = 1 * 24 * 60 * 60 * 1000;
      expect(MS_PER_DAY).toBe(oneDayInMs);
    });

    it('should correctly convert 1 hour to milliseconds', () => {
      const oneHourInMs = 1 * 60 * 60 * 1000;
      expect(MS_PER_HOUR).toBe(oneHourInMs);
    });

    it('should correctly convert 1 minute to milliseconds', () => {
      const oneMinuteInMs = 1 * 60 * 1000;
      expect(MS_PER_MINUTE).toBe(oneMinuteInMs);
    });
  });

  describe('Practical usage', () => {
    it('should correctly calculate days from milliseconds', () => {
      const threeDaysInMs = 3 * MS_PER_DAY;
      expect(threeDaysInMs / MS_PER_DAY).toBe(3);
    });

    it('should correctly calculate hours from milliseconds', () => {
      const fiveHoursInMs = 5 * MS_PER_HOUR;
      expect(fiveHoursInMs / MS_PER_HOUR).toBe(5);
    });

    it('should handle fractional conversions', () => {
      const halfDayInMs = 0.5 * MS_PER_DAY;
      expect(halfDayInMs).toBe(43200000); // 12 hours
    });
  });
});
