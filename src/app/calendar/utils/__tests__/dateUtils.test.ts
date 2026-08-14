import {
  getDateRangeForView,
  getMonthVisibleGridRange,
  navigatePrevious,
  navigateNext,
} from '../dateUtils';
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

describe('dateUtils', () => {
  describe('getMonthVisibleGridRange', () => {
    it('pads June 2024 to Sunday-aligned week boundaries', () => {
      const date = new Date(2024, 5, 15); // June 15, 2024 local
      const range = getMonthVisibleGridRange(date);
      const expectedStart = format(
        startOfWeek(startOfMonth(date), { weekStartsOn: 0 }),
        'yyyy-MM-dd'
      );
      const expectedEnd = format(
        endOfWeek(endOfMonth(date), { weekStartsOn: 0 }),
        'yyyy-MM-dd'
      );

      expect(range.startDate).toBe(expectedStart);
      expect(range.endDate).toBe(expectedEnd);
      expect(range.startDate).toBe('2024-05-26');
      expect(range.endDate).toBe('2024-07-06');
    });

    it('pads February 2024 leap month across year-boundary weeks', () => {
      const date = new Date(2024, 1, 15); // Feb 15, 2024
      const range = getMonthVisibleGridRange(date);

      expect(range.startDate).toBe('2024-01-28');
      expect(range.endDate).toBe('2024-03-02');
    });
  });

  describe('getDateRangeForView', () => {
    it('should return week-padded month range for the production month view', () => {
      const date = new Date(2024, 5, 15);
      const range = getDateRangeForView(date);
      expect(range).toEqual(getMonthVisibleGridRange(date));
      expect(range.startDate).toBe('2024-05-26');
      expect(range.endDate).toBe('2024-07-06');
    });

    it('should pad leap-year February month grid', () => {
      const leapYearDate = new Date(2024, 1, 29);
      const range = getDateRangeForView(leapYearDate);
      expect(range.startDate).toBe('2024-01-28');
      expect(range.endDate).toBe('2024-03-02');
    });

    it('should pad non-leap February month grid', () => {
      const nonLeapYearDate = new Date(2023, 1, 15);
      const range = getDateRangeForView(nonLeapYearDate);
      expect(range.startDate).toBe('2023-01-29');
      expect(range.endDate).toBe('2023-03-04');
    });
  });

  describe('navigatePrevious', () => {
    it('should navigate to previous month', () => {
      const currentDate = new Date(2024, 5, 15);
      const result = navigatePrevious(currentDate);
      expect(result.getMonth()).toBe(4); // May (0-indexed)
      expect(result.getFullYear()).toBe(2024);
    });

    it('should handle month boundary', () => {
      const currentDate = new Date(2024, 0, 15);
      const result = navigatePrevious(currentDate);
      expect(result.getMonth()).toBe(11); // December (0-indexed)
      expect(result.getFullYear()).toBe(2023);
    });
  });

  describe('navigateNext', () => {
    it('should navigate to next month', () => {
      const currentDate = new Date(2024, 5, 15);
      const result = navigateNext(currentDate);
      expect(result.getMonth()).toBe(6); // July (0-indexed)
      expect(result.getFullYear()).toBe(2024);
    });

    it('should handle month boundary', () => {
      const currentDate = new Date(2024, 11, 15);
      const result = navigateNext(currentDate);
      expect(result.getMonth()).toBe(0); // January (0-indexed)
      expect(result.getFullYear()).toBe(2025);
    });
  });
});
