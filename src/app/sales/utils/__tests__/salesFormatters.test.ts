// src/app/sales/utils/__tests__/salesFormatters.test.ts
import { currency, dateFormat, parseYMDUTC } from '../salesFormatters';

describe('salesFormatters', () => {
  describe('currency', () => {
    it('formats numbers as USD currency', () => {
      expect(currency.format(1000)).toBe('$1,000.00');
      expect(currency.format(1000000)).toBe('$1,000,000.00');
      expect(currency.format(0)).toBe('$0.00');
    });

    it('handles decimal values', () => {
      expect(currency.format(1234.56)).toBe('$1,234.56');
      expect(currency.format(0.99)).toBe('$0.99');
    });

    it('handles negative values', () => {
      expect(currency.format(-1000)).toBe('-$1,000.00');
    });
  });

  describe('dateFormat', () => {
    it('formats dates using formatDisplayDate', () => {
      const date = new Date('2024-01-15T00:00:00Z');
      const formatted = dateFormat.format(date);

      // formatDisplayDate returns format like "Jan 15, 2024"
      expect(formatted).toMatch(/Jan.*15.*2024/);
    });

    it('converts Date to YYYY-MM-DD before formatting', () => {
      // Create a date and verify it's converted correctly
      const date = new Date('2024-06-15T12:34:56Z');
      const formatted = dateFormat.format(date);

      expect(formatted).toMatch(/Jun.*15.*2024/);
    });

    it('handles different months correctly', () => {
      const janDate = new Date('2024-01-15T00:00:00Z');
      const junDate = new Date('2024-06-15T00:00:00Z');
      const decDate = new Date('2024-12-15T00:00:00Z');

      expect(dateFormat.format(janDate)).toMatch(/Jan/);
      expect(dateFormat.format(junDate)).toMatch(/Jun/);
      expect(dateFormat.format(decDate)).toMatch(/Dec/);
    });

    it('maintains Intl.DateTimeFormat interface', () => {
      const date = new Date('2024-01-15T00:00:00Z');
      expect(typeof dateFormat.format(date)).toBe('string');
      expect(dateFormat.format(date).length).toBeGreaterThan(0);
    });
  });

  describe('parseYMDUTC', () => {
    it('re-exports parseYMDUTC from dateParsing utils', () => {
      expect(typeof parseYMDUTC).toBe('function');
      const date = parseYMDUTC('2024-01-15');
      expect(date).toBeInstanceOf(Date);
    });

    it('parses YYYY-MM-DD format correctly', () => {
      const date = parseYMDUTC('2024-01-15');
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0); // January is 0
      expect(date.getUTCDate()).toBe(15);
    });
  });
});
