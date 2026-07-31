import {
  getDateRangeForView,
  getMonthVisibleGridRange,
  getAgendaMonthRange,
  navigatePrevious,
  navigateNext,
} from '../dateUtils';
import type { ExtendedView } from '../../components/CalendarView';
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

  describe('getAgendaMonthRange', () => {
    it('uses calendar month only without week padding', () => {
      const date = new Date(2024, 5, 15);
      expect(getAgendaMonthRange(date)).toEqual({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });
    });
  });

  describe('getDateRangeForView', () => {
    it('should return year range for year view', () => {
      const date = new Date(2024, 5, 15);
      const range = getDateRangeForView('year' as ExtendedView, date);
      expect(range.startDate).toBe('2024-01-01');
      expect(range.endDate).toBe('2024-12-31');
    });

    it('should return week range for week view', () => {
      const date = new Date(2024, 0, 15); // Monday
      const range = getDateRangeForView('week' as ExtendedView, date);
      expect(range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.startDate).toBe(
        format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd')
      );
    });

    it('should return timeline range for timeline view', () => {
      const date = new Date(2024, 0, 15);
      const range = getDateRangeForView('timeline' as ExtendedView, date);
      expect(range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return week-padded month range for month view', () => {
      const date = new Date(2024, 5, 15);
      const range = getDateRangeForView('month' as ExtendedView, date);
      expect(range).toEqual(getMonthVisibleGridRange(date));
      expect(range.startDate).toBe('2024-05-26');
      expect(range.endDate).toBe('2024-07-06');
    });

    it('should return calendar-month-only range for agenda (not grid-expanded)', () => {
      const date = new Date(2024, 5, 15);
      const range = getDateRangeForView('agenda' as ExtendedView, date);
      expect(range).toEqual({
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });
      expect(range).not.toEqual(getMonthVisibleGridRange(date));
    });

    it('does not expand agenda for leap February', () => {
      const date = new Date(2024, 1, 15);
      const agenda = getDateRangeForView('agenda' as ExtendedView, date);
      const month = getDateRangeForView('month' as ExtendedView, date);

      expect(agenda).toEqual({
        startDate: '2024-02-01',
        endDate: '2024-02-29',
      });
      expect(month.startDate).toBe('2024-01-28');
      expect(month.endDate).toBe('2024-03-02');
    });
  });

  describe('navigatePrevious', () => {
    it('should navigate to previous month for month view', () => {
      const currentDate = new Date(2024, 5, 15);
      const result = navigatePrevious('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(4); // May (0-indexed)
      expect(result.getFullYear()).toBe(2024);
    });

    it('should navigate to previous year for year view', () => {
      const currentDate = new Date(2024, 5, 15);
      const result = navigatePrevious('year' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBe(2023);
    });

    it('should navigate to previous week for week view', () => {
      const currentDate = new Date(2024, 0, 15);
      const result = navigatePrevious('week' as ExtendedView, currentDate);
      expect(result.getDate()).toBe(8);
      expect(result.getMonth()).toBe(0);
    });

    it('should navigate to previous week for timeline view', () => {
      const currentDate = new Date(2024, 0, 15);
      const result = navigatePrevious('timeline' as ExtendedView, currentDate);
      expect(result.getDate()).toBe(8);
    });

    it('should handle month boundary for month view', () => {
      const currentDate = new Date(2024, 0, 15);
      const result = navigatePrevious('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(11); // December (0-indexed)
      expect(result.getFullYear()).toBe(2023);
    });
  });

  describe('navigateNext', () => {
    it('should navigate to next month for month view', () => {
      const currentDate = new Date(2024, 5, 15);
      const result = navigateNext('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(6); // July (0-indexed)
      expect(result.getFullYear()).toBe(2024);
    });

    it('should navigate to next year for year view', () => {
      const currentDate = new Date(2024, 5, 15);
      const result = navigateNext('year' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBe(2025);
    });

    it('should navigate to next week for week view', () => {
      const currentDate = new Date(2024, 0, 15);
      const result = navigateNext('week' as ExtendedView, currentDate);
      expect(result.getDate()).toBe(22);
    });

    it('should navigate to next week for timeline view', () => {
      const currentDate = new Date(2024, 0, 15);
      const result = navigateNext('timeline' as ExtendedView, currentDate);
      expect(result.getDate()).toBe(22);
    });

    it('should handle month boundary for month view', () => {
      const currentDate = new Date(2024, 11, 15);
      const result = navigateNext('month' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(0); // January (0-indexed)
      expect(result.getFullYear()).toBe(2025);
    });

    it('should handle year boundary for year view', () => {
      const currentDate = new Date(2023, 11, 31);
      const result = navigateNext('year' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBe(2024);
    });

    it('should handle week navigation across month boundary', () => {
      const currentDate = new Date(2024, 0, 28);
      const result = navigateNext('week' as ExtendedView, currentDate);
      expect(result.getMonth()).toBe(1);
      expect(result.getDate()).toBe(4);
    });

    it('should handle week navigation across year boundary', () => {
      const currentDate = new Date(2023, 11, 28);
      const result = navigateNext('week' as ExtendedView, currentDate);
      expect(result.getFullYear()).toBeGreaterThanOrEqual(2023);
    });
  });

  describe('getDateRangeForView edge cases', () => {
    it('should pad leap-year February month grid', () => {
      const leapYearDate = new Date(2024, 1, 29);
      const range = getDateRangeForView('month' as ExtendedView, leapYearDate);
      expect(range.startDate).toBe('2024-01-28');
      expect(range.endDate).toBe('2024-03-02');
    });

    it('should pad non-leap February month grid', () => {
      const nonLeapYearDate = new Date(2023, 1, 15);
      const range = getDateRangeForView(
        'month' as ExtendedView,
        nonLeapYearDate
      );
      expect(range.startDate).toBe('2023-01-29');
      expect(range.endDate).toBe('2023-03-04');
    });

    it('should handle year view for different months', () => {
      const janDate = new Date(2024, 0, 15);
      const junDate = new Date(2024, 5, 15);
      const decDate = new Date(2024, 11, 15);

      const janRange = getDateRangeForView('year' as ExtendedView, janDate);
      const junRange = getDateRangeForView('year' as ExtendedView, junDate);
      const decRange = getDateRangeForView('year' as ExtendedView, decDate);

      expect(janRange).toEqual({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(junRange).toEqual(janRange);
      expect(decRange).toEqual(janRange);
    });
  });
});
