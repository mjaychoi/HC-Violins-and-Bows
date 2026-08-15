import { formatNoteDate } from '../utils/formatNoteDate';

describe('formatNoteDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-08-09T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats recent timestamps relatively', () => {
    expect(formatNoteDate('2026-08-09T11:59:30.000Z')).toBe('Just now');
    expect(formatNoteDate('2026-08-09T11:45:00.000Z')).toBe('15m ago');
    expect(formatNoteDate('2026-08-09T08:00:00.000Z')).toBe('4h ago');
    expect(formatNoteDate('2026-08-07T12:00:00.000Z')).toBe('2d ago');
  });

  it('falls back to a locale date for older timestamps', () => {
    expect(formatNoteDate('2026-07-01T12:00:00.000Z')).toMatch(/Jul/);
  });
});
