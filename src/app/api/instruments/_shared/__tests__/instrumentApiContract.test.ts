import {
  ensureInstrumentIdempotencyTableContract,
  INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE,
  INSTRUMENT_SCHEMA_CONTRACT_ERROR_CODE,
  requireInstrumentPatchUpdatedAt,
  resetInstrumentApiContractCacheForTests,
} from '../instrumentApiContract';

describe('instrumentApiContract', () => {
  beforeEach(() => {
    resetInstrumentApiContractCacheForTests();
  });

  describe('requireInstrumentPatchUpdatedAt', () => {
    it('rejects missing updated_at with stable machine-readable code', () => {
      const result = requireInstrumentPatchUpdatedAt(
        { note: 'x' },
        'InstrumentsAPI'
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.result.status).toBe(400);
        const payload = result.result.payload as {
          error_code?: string;
          error?: string;
        };
        expect(payload.error_code).toBe(
          INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE
        );
        expect(String(payload.error)).toContain('updated_at');
      }
    });

    it('accepts non-empty updated_at string', () => {
      const result = requireInstrumentPatchUpdatedAt(
        { updated_at: '2024-01-02T00:00:00Z' },
        'InstrumentsAPI'
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.expectedUpdatedAt).toBe('2024-01-02T00:00:00Z');
      }
    });
  });

  describe('ensureInstrumentIdempotencyTableContract', () => {
    it('reuses cached negative probe within TTL (single from/limit)', async () => {
      let limitCalls = 0;
      const client = {
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            limit: jest.fn(async () => {
              limitCalls += 1;
              return {
                data: null,
                error: {
                  code: '42P01',
                  message:
                    'relation "instrument_create_idempotency" does not exist',
                },
              };
            }),
          })),
        })),
      };

      const first = await ensureInstrumentIdempotencyTableContract(
        client as never
      );
      const second = await ensureInstrumentIdempotencyTableContract(
        client as never
      );

      expect(first?.status).toBe(503);
      expect(second?.status).toBe(503);
      expect((first?.payload as { error_code?: string }).error_code).toBe(
        INSTRUMENT_SCHEMA_CONTRACT_ERROR_CODE
      );
      expect(limitCalls).toBe(1);
      expect(client.from).toHaveBeenCalledTimes(1);
    });
  });
});
