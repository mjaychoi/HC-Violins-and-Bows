import {
  getDateRangeForView,
  navigatePrevious,
  navigateNext,
} from '../dateUtils';
import type { ExtendedView } from '../../components/CalendarView';

// Mock date-fns functions
jest.mock('date-fns', () => {
  const actual = jest.requireActual('date-fns');
  return {
    ...actual,
    format: jest.fn((date: Date, formatStr: string) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      if (formatStr === 'yyyy-MM-dd') {
        return `${year}-${month}-${day}`;
      }
      return actual.format(date, formatStr);
    }),
  };
});

describe('dateUtils', () => {
  describe('getDateRangeForView', () => {
    it('should return year range for year view', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const range = getDateRangeForView('year' as ExtendedView, date);
      expect(range.startDate).toMatch(/2024-01-01/);
      expect(range.endDate).toMatch(/2024-12-31/);
    });

    it('should return week range for week view', () => {
      const date = new Date('2024-01-15T12:00:00Z'); // Monday
      const range = getDateRangeForView('week' as ExtendedView, date);
      expect(range.startDate).toBeDefined();
      expect(range.endDate).toBeDefined();
      expect(range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return timeline range for timeline view', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const range = getDateRangeForView('timeline' as ExtendedView, date);
      expect(range.startDate).toBeDefined();
      expect(range.endDate).toBeDefined();
      expect(range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return month range for month view', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const range = getDateRangeForView('month' as ExtendedView, date);
      expect(range.startDate).toMatch(/2024-06-01/);
      expect(range.endDate).toMatch(/2024-06-30/);
    });

    it('should return month range for agenda view (default)', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      const range = getDateRangeForView('agenda' as ExtendedView, date);
      expect(range.startDate).toMatch(/2024-06-01/);
      expect(range.endDate).toMatch(/2024-06-30/);
    });
  });

  describe('navigatePrevious', () => {
    it('should navigate to previous month for month view', () => {
      const currentDate = new Date('2024-06-15T12:00:00Z');
      const result = navigatePrevious('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(4); // May (0-indexed)
      expect(result.getFullYear()).toBe(2024);
    });

    it('should navigate to previous year for year view', () => {
      const currentDate = new Date('2024-06-15T12:00:00Z');
      const result = navigatePrevious('year' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBe(2023);
    });

    it('should navigate to previous week for week view', () => {
      const currentDate = new Date('2024-01-15T12:00:00Z');
      const result = navigatePrevious('week' as ExtendedView, currentDate);
      const expectedDate = new Date('2024-01-08T12:00:00Z');
      expect(result.getTime()).toBe(expectedDate.getTime());
    });

    it('should navigate to previous week for timeline view', () => {
      const currentDate = new Date('2024-01-15T12:00:00Z');
      const result = navigatePrevious('timeline' as ExtendedView, currentDate);
      const expectedDate = new Date('2024-01-08T12:00:00Z');
      expect(result.getTime()).toBe(expectedDate.getTime());
    });

    it('should handle month boundary for month view', () => {
      const currentDate = new Date('2024-01-15T12:00:00Z');
      const result = navigatePrevious('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(11); // December (0-indexed)
      expect(result.getFullYear()).toBe(2023);
    });
  });

  describe('navigateNext', () => {
    it('should navigate to next month for month view', () => {
      const currentDate = new Date('2024-06-15T12:00:00Z');
      const result = navigateNext('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(6); // July (0-indexed)
      expect(result.getFullYear()).toBe(2024);
    });

    it('should navigate to next year for year view', () => {
      const currentDate = new Date('2024-06-15T12:00:00Z');
      const result = navigateNext('year' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBe(2025);
    });

    it('should navigate to next week for week view', () => {
      const currentDate = new Date('2024-01-15T12:00:00Z');
      const result = navigateNext('week' as ExtendedView, currentDate);
      const expectedDate = new Date('2024-01-22T12:00:00Z');
      expect(result.getTime()).toBe(expectedDate.getTime());
    });

    it('should navigate to next week for timeline view', () => {
      const currentDate = new Date('2024-01-15T12:00:00Z');
      const result = navigateNext('timeline' as ExtendedView, currentDate);
      const expectedDate = new Date('2024-01-22T12:00:00Z');
      expect(result.getTime()).toBe(expectedDate.getTime());
    });

    it('should handle month boundary for month view', () => {
      const currentDate = new Date('2024-12-15T12:00:00Z');
      const result = navigateNext('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(0); // January (0-indexed)
      expect(result.getFullYear()).toBe(2025);
    });

    it('should handle year boundary for year view', () => {
      const currentDate = new Date('2023-12-31T12:00:00Z');
      const result = navigateNext('year' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBe(2024);
    });

    it('should handle week navigation across month boundary', () => {
      const currentDate = new Date('2024-01-28T12:00:00Z'); // Near end of January
      const result = navigateNext('week' as ExtendedView, currentDate);
      // Should move 7 days forward (could be February)
      const expectedDate = new Date('2024-02-04T12:00:00Z');
      expect(result.getTime()).toBe(expectedDate.getTime());
    });

    it('should handle week navigation across year boundary', () => {
      const currentDate = new Date('2023-12-28T12:00:00Z'); // Near end of year
      const result = navigateNext('week' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBeGreaterThanOrEqual(2023);
    });
  });

  describe('getDateRangeForView edge cases', () => {
    it('should handle leap year dates', () => {
      const leapYearDate = new Date('2024-02-29T12:00:00Z');
      const range = getDateRangeForView('month' as ExtendedView, leapYearDate);
      expect(range.startDate).toMatch(/2024-02-01/);
      expect(range.endDate).toMatch(/2024-02-29/);
    });

    it('should handle non-leap year February', () => {
      const nonLeapYearDate = new Date('2023-02-15T12:00:00Z');
      const range = getDateRangeForView(
        'month' as ExtendedView,
        nonLeapYearDate
      );
      expect(range.startDate).toMatch(/2023-02-01/);
      expect(range.endDate).toMatch(/2023-02-28/);
    });

    it('should handle year view for different months', () => {
      const janDate = new Date('2024-01-15T12:00:00Z');
      const junDate = new Date('2024-06-15T12:00:00Z');
      const decDate = new Date('2024-12-15T12:00:00Z');

      const janRange = getDateRangeForView('year' as ExtendedView, janDate);
      const junRange = getDateRangeForView('year' as ExtendedView, junDate);
      const decRange = getDateRangeForView('year' as ExtendedView, decDate);

      // All should return same year range
      expect(janRange.startDate).toMatch(/2024-01-01/);
      expect(janRange.endDate).toMatch(/2024-12-31/);
      expect(junRange.startDate).toMatch(/2024-01-01/);
      expect(junRange.endDate).toMatch(/2024-12-31/);
      expect(decRange.startDate).toMatch(/2024-01-01/);
      expect(decRange.endDate).toMatch(/2024-12-31/);
    });
  });
});
