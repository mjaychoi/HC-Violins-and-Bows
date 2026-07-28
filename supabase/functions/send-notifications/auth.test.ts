jest.mock('../_shared/constantTimeSecret.ts', () =>
  jest.requireActual('@/app/api/_utils/constantTimeSecret')
);

import { constantTimeSecretEqual } from '@/app/api/_utils/constantTimeSecret';
import {
  extractSendNotificationsSecret,
  hasValidInvocationSecret,
  isSendNotificationsAuthorized,
} from './auth';

describe('send-notifications auth', () => {
  const configuredSecret = 'send-notifications-secret-abcdef';

  describe('constantTimeSecretEqual contract (via shared auth logic)', () => {
    it('returns true for an exact match', () => {
      expect(
        constantTimeSecretEqual(configuredSecret, configuredSecret)
      ).toBe(true);
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
      expect(() =>
        constantTimeSecretEqual(configuredSecret.slice(0, -1), configuredSecret)
      ).not.toThrow();
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
      const unicodeSecret = '알림-🔔-secret';
      expect(constantTimeSecretEqual(unicodeSecret, unicodeSecret)).toBe(true);
      expect(constantTimeSecretEqual(`${unicodeSecret}!`, unicodeSecret)).toBe(
        false
      );
    });
  });

  describe('extractSendNotificationsSecret', () => {
    it('trims the provided header value', () => {
      const req = new Request('https://example.com', {
        headers: { 'x-send-notifications-secret': `  ${configuredSecret}  ` },
      });
      expect(extractSendNotificationsSecret(req)).toBe(configuredSecret);
    });

    it('returns undefined when the header is missing', () => {
      const req = new Request('https://example.com');
      expect(extractSendNotificationsSecret(req)).toBeUndefined();
    });
  });

  describe('isSendNotificationsAuthorized', () => {
    it('authorizes an exact match', () => {
      expect(
        isSendNotificationsAuthorized(configuredSecret, configuredSecret)
      ).toBe(true);
    });

    it('rejects when the configured secret is missing', () => {
      expect(
        isSendNotificationsAuthorized(configuredSecret, undefined)
      ).toBe(false);
      expect(isSendNotificationsAuthorized(configuredSecret, '')).toBe(false);
    });

    it('rejects invalid provided secrets', () => {
      expect(
        isSendNotificationsAuthorized('wrong-secret-value', configuredSecret)
      ).toBe(false);
      expect(isSendNotificationsAuthorized('', configuredSecret)).toBe(false);
      expect(
        isSendNotificationsAuthorized(undefined, configuredSecret)
      ).toBe(false);
    });
  });

  describe('hasValidInvocationSecret', () => {
    it('passes authorization for a valid header', () => {
      const req = new Request('https://example.com', {
        method: 'POST',
        headers: { 'x-send-notifications-secret': configuredSecret },
      });
      expect(hasValidInvocationSecret(req, configuredSecret)).toBe(true);
    });

    it('rejects an invalid header', () => {
      const req = new Request('https://example.com', {
        method: 'POST',
        headers: { 'x-send-notifications-secret': 'wrong-secret-value' },
      });
      expect(hasValidInvocationSecret(req, configuredSecret)).toBe(false);
    });

    it('rejects when the configured secret is missing', () => {
      const req = new Request('https://example.com', {
        method: 'POST',
        headers: { 'x-send-notifications-secret': configuredSecret },
      });
      expect(hasValidInvocationSecret(req, undefined)).toBe(false);
    });
  });
});
