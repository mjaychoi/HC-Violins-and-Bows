/** @jest-environment node */

import { canViewHealthDiagnostics } from '../healthDiagnosticsAuth';
import { NextRequest } from 'next/server';

function healthRequest(headers?: HeadersInit): NextRequest {
  return new NextRequest('http://localhost/api/ready', { headers });
}

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

describe('canViewHealthDiagnostics', () => {
  const SECRET = 'health-secret';

  it('fails closed when production has no secret', () => {
    expect(
      canViewHealthDiagnostics(healthRequest(), env({ NODE_ENV: 'production' }))
    ).toBe(false);
  });

  it('accepts exact Bearer secret only', () => {
    expect(
      canViewHealthDiagnostics(
        healthRequest({ Authorization: `Bearer ${SECRET}` }),
        env({ NODE_ENV: 'production', HEALTH_CHECK_SECRET: SECRET })
      )
    ).toBe(true);
  });

  it('rejects wrong, partial, whitespace, and non-Bearer schemes', () => {
    const productionEnv = env({
      NODE_ENV: 'production',
      HEALTH_CHECK_SECRET: SECRET,
    });
    const cases = [
      `Bearer wrong`,
      `Bearer ${SECRET.slice(0, 4)}`,
      `Bearer ${SECRET} `,
      `Bearer  ${SECRET}`,
      `bearer ${SECRET}`,
      `Basic ${SECRET}`,
      SECRET,
      '',
    ];

    for (const authorization of cases) {
      expect(
        canViewHealthDiagnostics(
          healthRequest(
            authorization ? { Authorization: authorization } : undefined
          ),
          productionEnv
        )
      ).toBe(false);
    }
  });

  it('trims env secret config but not request tokens', () => {
    expect(
      canViewHealthDiagnostics(
        healthRequest({ Authorization: `Bearer ${SECRET}` }),
        env({ NODE_ENV: 'production', HEALTH_CHECK_SECRET: `  ${SECRET}  ` })
      )
    ).toBe(true);

    expect(
      canViewHealthDiagnostics(
        healthRequest({ Authorization: `Bearer  ${SECRET}` }),
        env({ NODE_ENV: 'production', HEALTH_CHECK_SECRET: SECRET })
      )
    ).toBe(false);
  });
});
