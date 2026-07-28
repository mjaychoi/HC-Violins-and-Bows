jest.mock('../_shared/constantTimeSecret.ts', () =>
  jest.requireActual('@/app/api/_utils/constantTimeSecret')
);

import { constantTimeSecretEqual } from '@/app/api/_utils/constantTimeSecret';
import {
  extractCleanupInvoiceImageUploadsSecret,
  hasValidInvocationSecret,
  isCleanupInvoiceImageUploadsAuthorized,
} from './auth';

describe('cleanup-invoice-image-uploads auth', () => {
  const configuredSecret = 'invoice-cleanup-secret-abcdef';

  describe('constantTimeSecretEqual contract (via shared auth logic)', () => {
    it('returns true for an exact match', () => {
      expect(constantTimeSecretEqual(configuredSecret, configuredSecret)).toBe(
        true
      );
    });

    it('returns false for same-length mismatches', () => {
      expect(
        constantTimeSecretEqual(
          `X${configuredSecret.slice(1)}`,
          configuredSecret
        )
      ).toBe(false);
      const middle = Math.floor(configuredSecret.length / 2);
      expect(
        constantTimeSecretEqual(
          configuredSecret.slice(0, middle) +
            'X' +
            configuredSecret.slice(middle + 1),
          configuredSecret
        )
      ).toBe(false);
      expect(
        constantTimeSecretEqual(
          `${configuredSecret.slice(0, -1)}X`,
          configuredSecret
        )
      ).toBe(false);
    });

    it('returns false for shorter, longer, and empty values without throwing', () => {
      expect(
        constantTimeSecretEqual(configuredSecret.slice(0, -1), configuredSecret)
      ).toBe(false);
      expect(
        constantTimeSecretEqual(`${configuredSecret}x`, configuredSecret)
      ).toBe(false);
      expect(constantTimeSecretEqual('', configuredSecret)).toBe(false);
      expect(constantTimeSecretEqual(null, configuredSecret)).toBe(false);
      expect(constantTimeSecretEqual(undefined, configuredSecret)).toBe(false);
    });

    it('handles Unicode input without throwing', () => {
      const unicodeSecret = '청구-🧾-secret';
      expect(constantTimeSecretEqual(unicodeSecret, unicodeSecret)).toBe(true);
      expect(constantTimeSecretEqual(`${unicodeSecret}!`, unicodeSecret)).toBe(
        false
      );
    });
  });

  describe('extractCleanupInvoiceImageUploadsSecret', () => {
    it('trims the provided header value', () => {
      const req = new Request('https://example.com', {
        headers: {
          'x-cleanup-invoice-image-uploads-secret': `  ${configuredSecret}  `,
        },
      });
      expect(extractCleanupInvoiceImageUploadsSecret(req)).toBe(
        configuredSecret
      );
    });

    it('returns undefined when the header is missing', () => {
      const req = new Request('https://example.com');
      expect(extractCleanupInvoiceImageUploadsSecret(req)).toBeUndefined();
    });
  });

  describe('isCleanupInvoiceImageUploadsAuthorized', () => {
    it('authorizes an exact match', () => {
      expect(
        isCleanupInvoiceImageUploadsAuthorized(
          configuredSecret,
          configuredSecret
        )
      ).toBe(true);
    });

    it('rejects when the configured secret is missing', () => {
      expect(
        isCleanupInvoiceImageUploadsAuthorized(configuredSecret, undefined)
      ).toBe(false);
      expect(isCleanupInvoiceImageUploadsAuthorized(configuredSecret, '')).toBe(
        false
      );
    });

    it('rejects invalid provided secrets', () => {
      expect(
        isCleanupInvoiceImageUploadsAuthorized(
          'wrong-secret-value',
          configuredSecret
        )
      ).toBe(false);
      expect(isCleanupInvoiceImageUploadsAuthorized('', configuredSecret)).toBe(
        false
      );
      expect(
        isCleanupInvoiceImageUploadsAuthorized(undefined, configuredSecret)
      ).toBe(false);
    });
  });

  describe('hasValidInvocationSecret', () => {
    it('passes authorization for a valid header', () => {
      const req = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'x-cleanup-invoice-image-uploads-secret': configuredSecret,
        },
      });
      expect(hasValidInvocationSecret(req, configuredSecret)).toBe(true);
    });

    it('rejects an invalid header', () => {
      const req = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'x-cleanup-invoice-image-uploads-secret': 'wrong-secret-value',
        },
      });
      expect(hasValidInvocationSecret(req, configuredSecret)).toBe(false);
    });

    it('rejects when the configured secret is missing', () => {
      const req = new Request('https://example.com', {
        method: 'POST',
        headers: {
          'x-cleanup-invoice-image-uploads-secret': configuredSecret,
        },
      });
      expect(hasValidInvocationSecret(req, undefined)).toBe(false);
    });
  });
});
