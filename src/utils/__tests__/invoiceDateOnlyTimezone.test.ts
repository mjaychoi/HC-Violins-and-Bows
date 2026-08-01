/**
 * Date-only invoice display must preserve the calendar day across timezones.
 * Fixture: 2026-07-15 → "Jul 15, 2026" (never Jul 14 / Jul 16).
 *
 * Run under TZ=UTC, TZ=America/Los_Angeles, and TZ=Asia/Seoul.
 */

import { formatDateOnly } from '../formatUtils';

describe(`invoice date-only display (TZ=${process.env.TZ || 'unset'})`, () => {
  const FIXTURE = '2026-07-15';
  const EXPECTED = 'Jul 15, 2026';

  it('formatDateOnly preserves the calendar day for invoice dates', () => {
    expect(formatDateOnly(FIXTURE)).toBe(EXPECTED);
  });

  it('never shifts to the previous or next calendar day', () => {
    const result = formatDateOnly(FIXTURE);
    expect(result).not.toMatch(/Jul 14/);
    expect(result).not.toMatch(/Jul 16/);
    expect(result).toBe(EXPECTED);
  });

  it('new Date(YYYY-MM-DD) is unsafe in negative offsets (documents the defect)', () => {
    // Guardrail: if someone reintroduces new Date('YYYY-MM-DD') for display,
    // this comparison still shows why formatDateOnly is required.
    const unsafe = new Date(FIXTURE).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const safe = formatDateOnly(FIXTURE);
    expect(safe).toBe(EXPECTED);
    // In America/Los_Angeles the unsafe parse can become Jul 14; we only assert
    // the safe path, and that safe !== "Jul 14".
    expect(safe).not.toBe('Jul 14, 2026');
    void unsafe;
  });
});
