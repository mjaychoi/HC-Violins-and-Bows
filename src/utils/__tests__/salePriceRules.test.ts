import {
  validateSalePrice,
  validateSalePriceInput,
  evaluateSalePriceNumber,
  SALE_PRICE_MAX_MAGNITUDE,
  type SalePriceValidationResult,
} from '../salePriceRules';

function expectOk(
  result: SalePriceValidationResult,
  amountCents: number,
  amountDecimal: string
) {
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.amountCents).toBe(amountCents);
    expect(result.amountDecimal).toBe(amountDecimal);
  }
}

function expectErr(result: SalePriceValidationResult, code: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
  }
}

describe('salePriceRules — validateSalePrice (server-strict, requirePositive default)', () => {
  // 1. property omitted
  it('rejects omitted value (undefined) as required', () => {
    expectErr(validateSalePrice(undefined), 'SALE_PRICE_REQUIRED');
  });

  // 2. null
  it('rejects null as required', () => {
    expectErr(validateSalePrice(null), 'SALE_PRICE_REQUIRED');
  });

  // 3. empty string
  it('rejects empty string as invalid type', () => {
    expectErr(validateSalePrice(''), 'SALE_PRICE_INVALID_TYPE');
  });

  // 4. numeric string
  it('rejects numeric string "12.34" as invalid type (no coercion)', () => {
    expectErr(validateSalePrice('12.34'), 'SALE_PRICE_INVALID_TYPE');
  });

  // 5. whitespace numeric string
  it('rejects whitespace-padded numeric string as invalid type', () => {
    expectErr(validateSalePrice('  12.34  '), 'SALE_PRICE_INVALID_TYPE');
  });

  it('rejects a pure whitespace string as invalid type', () => {
    expectErr(validateSalePrice('   '), 'SALE_PRICE_INVALID_TYPE');
  });

  it('rejects boolean, array, and object values as invalid type', () => {
    expectErr(validateSalePrice(true), 'SALE_PRICE_INVALID_TYPE');
    expectErr(validateSalePrice([100]), 'SALE_PRICE_INVALID_TYPE');
    expectErr(validateSalePrice({ amount: 100 }), 'SALE_PRICE_INVALID_TYPE');
  });

  // 6. zero
  it('rejects zero as not positive', () => {
    expectErr(validateSalePrice(0), 'SALE_PRICE_MUST_BE_POSITIVE');
  });

  // 7. negative zero
  it('rejects negative zero as not positive', () => {
    expectErr(validateSalePrice(-0), 'SALE_PRICE_MUST_BE_POSITIVE');
  });

  // 8. negative number
  it('rejects a negative number as not positive', () => {
    expectErr(validateSalePrice(-100), 'SALE_PRICE_MUST_BE_POSITIVE');
  });

  // 9. NaN
  it('rejects NaN as not finite', () => {
    expectErr(validateSalePrice(NaN), 'SALE_PRICE_NOT_FINITE');
  });

  // 10. positive infinity
  it('rejects Infinity as not finite', () => {
    expectErr(validateSalePrice(Infinity), 'SALE_PRICE_NOT_FINITE');
  });

  // 11. negative infinity
  it('rejects -Infinity as not finite', () => {
    expectErr(validateSalePrice(-Infinity), 'SALE_PRICE_NOT_FINITE');
  });

  // 12. valid integer
  it('accepts a valid integer', () => {
    expectOk(validateSalePrice(100), 10000, '100.00');
  });

  // 13. valid one-decimal value
  it('accepts a valid one-decimal value', () => {
    expectOk(validateSalePrice(99.9), 9990, '99.90');
  });

  // 14. valid two-decimal value
  it('accepts a valid two-decimal value', () => {
    expectOk(validateSalePrice(99.99), 9999, '99.99');
  });

  // 15. three-decimal value
  it('rejects a three-decimal value instead of rounding it', () => {
    expectErr(validateSalePrice(99.999), 'SALE_PRICE_PRECISION_EXCEEDED');
  });

  // 16. value below one cent
  it('rejects a value below one cent as precision exceeded', () => {
    expectErr(validateSalePrice(0.001), 'SALE_PRICE_PRECISION_EXCEEDED');
  });

  // 17. maximum value
  it('accepts the exact maximum value', () => {
    expectOk(
      validateSalePrice(SALE_PRICE_MAX_MAGNITUDE),
      SALE_PRICE_MAX_MAGNITUDE * 100,
      '1000000000.00'
    );
  });

  // 18. maximum plus one cent
  it('rejects maximum plus one cent as exceeding the maximum', () => {
    expectErr(
      validateSalePrice(SALE_PRICE_MAX_MAGNITUDE + 0.01),
      'SALE_PRICE_EXCEEDS_MAXIMUM'
    );
  });

  // 19. exponential numeric value within range (already parsed by JSON.parse into a JS number)
  it('accepts an exponential-notation numeric value once parsed to a JS number', () => {
    expectOk(validateSalePrice(1e3), 100000, '1000.00');
  });

  // 20. value unsafe at cent precision
  it('rejects a value unsafe at cent precision as out of range', () => {
    expectErr(validateSalePrice(1e16), 'SALE_PRICE_OUT_OF_RANGE');
  });

  it('rejects a PostgreSQL-numeric-range-exceeding value as out of range', () => {
    expectErr(validateSalePrice(1e300), 'SALE_PRICE_OUT_OF_RANGE');
  });
});

describe('salePriceRules — requirePositive: false (POST /api/sales carve-out)', () => {
  it('accepts a negative amount (standalone refund entry)', () => {
    expectOk(
      evaluateSalePriceNumber(-500, { requirePositive: false }),
      -50000,
      '-500.00'
    );
  });

  it('still rejects zero', () => {
    expectErr(
      evaluateSalePriceNumber(0, { requirePositive: false }),
      'SALE_PRICE_ZERO_NOT_ALLOWED'
    );
  });

  it('still rejects negative zero', () => {
    expectErr(
      evaluateSalePriceNumber(-0, { requirePositive: false }),
      'SALE_PRICE_ZERO_NOT_ALLOWED'
    );
  });

  it('still rejects excess precision on a negative amount', () => {
    expectErr(
      evaluateSalePriceNumber(-99.999, { requirePositive: false }),
      'SALE_PRICE_PRECISION_EXCEEDED'
    );
  });

  it('still enforces the maximum symmetrically for negative amounts', () => {
    expectErr(
      evaluateSalePriceNumber(-(SALE_PRICE_MAX_MAGNITUDE + 0.01), {
        requirePositive: false,
      }),
      'SALE_PRICE_EXCEEDS_MAXIMUM'
    );
  });

  it('accepts the exact negative maximum', () => {
    expectOk(
      evaluateSalePriceNumber(-SALE_PRICE_MAX_MAGNITUDE, {
        requirePositive: false,
      }),
      -SALE_PRICE_MAX_MAGNITUDE * 100,
      '-1000000000.00'
    );
  });
});

describe('salePriceRules — validateSalePriceInput (client-side, string input)', () => {
  it('rejects empty input as required', () => {
    expectErr(validateSalePriceInput(''), 'SALE_PRICE_REQUIRED');
  });

  it('rejects whitespace-only input as required', () => {
    expectErr(validateSalePriceInput('   '), 'SALE_PRICE_REQUIRED');
  });

  it('rejects non-numeric text as invalid type', () => {
    expectErr(validateSalePriceInput('abc'), 'SALE_PRICE_INVALID_TYPE');
  });

  it('accepts a plain numeric string', () => {
    expectOk(validateSalePriceInput('1234.56'), 123456, '1234.56');
  });

  it('accepts a numeric string with surrounding whitespace', () => {
    expectOk(validateSalePriceInput('  1234.56  '), 123456, '1234.56');
  });

  it('rejects zero', () => {
    expectErr(validateSalePriceInput('0'), 'SALE_PRICE_MUST_BE_POSITIVE');
  });

  it('rejects negative zero text', () => {
    expectErr(validateSalePriceInput('-0'), 'SALE_PRICE_MUST_BE_POSITIVE');
  });

  it('rejects negative input by default', () => {
    expectErr(validateSalePriceInput('-50'), 'SALE_PRICE_MUST_BE_POSITIVE');
  });

  it('does not silently round three-decimal input', () => {
    expectErr(
      validateSalePriceInput('19.999'),
      'SALE_PRICE_PRECISION_EXCEEDED'
    );
  });

  it('rejects above-maximum input', () => {
    expectErr(
      validateSalePriceInput(String(SALE_PRICE_MAX_MAGNITUDE + 1)),
      'SALE_PRICE_EXCEEDS_MAXIMUM'
    );
  });

  it('allows negative input when requirePositive is false', () => {
    expectOk(
      validateSalePriceInput('-500', { requirePositive: false }),
      -50000,
      '-500.00'
    );
  });
});
