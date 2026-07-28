import { constantTimeSecretEqual } from '../constantTimeSecret';

describe('constantTimeSecretEqual', () => {
  const expected = 'cron-secret-value-1234567890';

  it('returns true for an exact match', () => {
    expect(constantTimeSecretEqual(expected, expected)).toBe(true);
  });

  it('returns false for a same-length mismatch at the beginning', () => {
    const provided = `X${expected.slice(1)}`;
    expect(provided.length).toBe(expected.length);
    expect(constantTimeSecretEqual(provided, expected)).toBe(false);
  });

  it('returns false for a same-length mismatch in the middle', () => {
    const middle = Math.floor(expected.length / 2);
    const provided =
      expected.slice(0, middle) + 'X' + expected.slice(middle + 1);
    expect(provided.length).toBe(expected.length);
    expect(constantTimeSecretEqual(provided, expected)).toBe(false);
  });

  it('returns false for a same-length mismatch at the end', () => {
    const provided = `${expected.slice(0, -1)}X`;
    expect(provided.length).toBe(expected.length);
    expect(constantTimeSecretEqual(provided, expected)).toBe(false);
  });

  it('returns false for a shorter secret without throwing', () => {
    expect(() =>
      constantTimeSecretEqual(expected.slice(0, -1), expected)
    ).not.toThrow();
    expect(constantTimeSecretEqual(expected.slice(0, -1), expected)).toBe(
      false
    );
  });

  it('returns false for a longer secret without throwing', () => {
    expect(() =>
      constantTimeSecretEqual(`${expected}x`, expected)
    ).not.toThrow();
    expect(constantTimeSecretEqual(`${expected}x`, expected)).toBe(false);
  });

  it('returns false for null, undefined, and empty values', () => {
    expect(constantTimeSecretEqual(null, expected)).toBe(false);
    expect(constantTimeSecretEqual(undefined, expected)).toBe(false);
    expect(constantTimeSecretEqual('', expected)).toBe(false);
    expect(constantTimeSecretEqual(expected, null)).toBe(false);
    expect(constantTimeSecretEqual(expected, undefined)).toBe(false);
    expect(constantTimeSecretEqual(expected, '')).toBe(false);
    expect(constantTimeSecretEqual(null, null)).toBe(false);
    expect(constantTimeSecretEqual('', '')).toBe(false);
  });

  it('handles Unicode input without throwing', () => {
    const unicodeSecret = '비밀-🔐-secret';
    expect(() =>
      constantTimeSecretEqual(unicodeSecret, unicodeSecret)
    ).not.toThrow();
    expect(constantTimeSecretEqual(unicodeSecret, unicodeSecret)).toBe(true);
    expect(constantTimeSecretEqual(`${unicodeSecret}!`, unicodeSecret)).toBe(
      false
    );
  });
});
