/** @jest-environment node */

import {
  AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
  AUTH_MATRIX_ORG_A_COST_PRICE,
} from '../constants';
import {
  buildHostedMatrixCases,
  formatMatrixFailure,
  runHostedCookieMatrix,
  type HostedCookieJar,
} from '../hosted-matrix';
import type { HostedActor } from '../hosted-session';

const fixtures = {
  orgAId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  orgBId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  orgAInstrumentId: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  orgBInstrumentId: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  orgAClientId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  orgBClientId: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
  orgACostPrice: AUTH_MATRIX_ORG_A_COST_PRICE,
  orgAConsignmentPrice: AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
};

function actor(
  label: HostedActor['label'],
  orgId: string,
  role: HostedActor['role']
): HostedActor {
  return {
    userId: `${label}-user`,
    orgId,
    role,
    label,
    cookieHeader: `hcv-sb-auth=${label}-cookie`,
  };
}

const actors: HostedCookieJar = {
  orgAAdmin: actor('orgAAdmin', fixtures.orgAId, 'admin'),
  orgAMember: actor('orgAMember', fixtures.orgAId, 'member'),
  orgBAdmin: actor('orgBAdmin', fixtures.orgBId, 'admin'),
  orgBMember: actor('orgBMember', fixtures.orgBId, 'member'),
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('hosted cookie matrix', () => {
  it('covers anonymous, member, admin, and cross-tenant cases', () => {
    const names = buildHostedMatrixCases(fixtures).map(entry => entry.name);
    expect(names).toEqual([
      'anonymous instrument list is unauthorized',
      'orgA member same-org instrument list',
      'orgA member financial redaction on synthetic instrument',
      'orgA member instrument create denied',
      'orgA member with-connections denied',
      'orgA member certificate mutation denied',
      'orgA admin same-org instrument list',
      'orgA admin financial access on synthetic instrument',
      'orgA admin cannot read Org B instrument',
      'orgB admin cannot read Org A instrument',
      'orgA admin cannot read Org B client',
      'orgB admin cannot read Org A client',
    ]);
  });

  it('sends Cookie headers and never Authorization', async () => {
    const captured: Array<{
      auth: string | null;
      cookie: string | null;
      method: string;
      url: string;
    }> = [];

    const results = await runHostedCookieMatrix({
      baseUrl: 'http://127.0.0.1:3000',
      actors,
      fixtures,
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        const url = String(input);
        const method = init?.method ?? 'GET';
        captured.push({
          url,
          method,
          cookie: headers.get('Cookie'),
          auth: headers.get('Authorization'),
        });

        if (!headers.has('Cookie')) {
          return jsonResponse(401, {
            error: 'Valid Supabase session is required',
            error_code: 'UNAUTHORIZED',
            success: false,
          });
        }

        if (method === 'POST') {
          return jsonResponse(403, {
            error: 'Admin role required',
            error_code: 'ADMIN_REQUIRED',
            success: false,
          });
        }

        if (url.includes(`/api/instruments?id=${fixtures.orgBInstrumentId}`)) {
          return jsonResponse(404, {
            error: 'Instrument not found',
            success: false,
          });
        }
        if (url.includes(`/api/instruments?id=${fixtures.orgAInstrumentId}`)) {
          if (headers.get('Cookie') === actors.orgBAdmin.cookieHeader) {
            return jsonResponse(404, {
              error: 'Instrument not found',
              success: false,
            });
          }
          const isMember =
            headers.get('Cookie') === actors.orgAMember.cookieHeader;
          return jsonResponse(200, {
            data: [
              isMember
                ? {
                    id: fixtures.orgAInstrumentId,
                    org_id: fixtures.orgAId,
                    maker: 'A',
                  }
                : {
                    id: fixtures.orgAInstrumentId,
                    org_id: fixtures.orgAId,
                    maker: 'A',
                    cost_price: AUTH_MATRIX_ORG_A_COST_PRICE,
                    consignment_price: AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
                  },
            ],
          });
        }
        if (url.includes('/api/clients?id=')) {
          return jsonResponse(404, {
            error: 'Client not found',
            success: false,
          });
        }
        if (url.includes('/api/instruments')) {
          const isMember =
            headers.get('Cookie') === actors.orgAMember.cookieHeader;
          return jsonResponse(200, {
            data: [
              isMember
                ? {
                    id: fixtures.orgAInstrumentId,
                    org_id: fixtures.orgAId,
                    maker: 'A',
                  }
                : {
                    id: fixtures.orgAInstrumentId,
                    org_id: fixtures.orgAId,
                    maker: 'A',
                    cost_price: AUTH_MATRIX_ORG_A_COST_PRICE,
                    consignment_price: AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
                  },
            ],
          });
        }

        return jsonResponse(500, { error: 'unhandled mock' });
      },
    });

    expect(results.every(result => result.ok)).toBe(true);
    expect(captured.some(entry => entry.cookie == null)).toBe(true);
    expect(
      captured.some(entry => entry.cookie === actors.orgAMember.cookieHeader)
    ).toBe(true);
    expect(captured.every(entry => entry.auth == null)).toBe(true);
  });

  it('requires 401 for anonymous rather than an arbitrary 4xx', async () => {
    const results = await runHostedCookieMatrix({
      baseUrl: 'http://127.0.0.1:3000',
      actors,
      fixtures,
      fetchImpl: async () => jsonResponse(403, { error: 'Forbidden' }),
    });

    const anonymous = results.find(result => result.name.includes('anonymous'));
    expect(anonymous?.ok).toBe(false);
    expect(anonymous?.report.expectedStatus).toBe(401);
    expect(anonymous?.report.actualStatus).toBe(403);
  });

  it('requires 403 for member mutations rather than 401', async () => {
    const results = await runHostedCookieMatrix({
      baseUrl: 'http://127.0.0.1:3000',
      actors,
      fixtures,
      fetchImpl: async (input, init) => {
        if (!(init?.headers && new Headers(init.headers).has('Cookie'))) {
          return jsonResponse(401, { error_code: 'UNAUTHORIZED' });
        }
        if ((init?.method ?? 'GET') === 'POST') {
          return jsonResponse(401, { error: 'Unauthorized' });
        }
        return jsonResponse(200, { data: [] });
      },
    });

    const denied = results.filter(result => result.name.includes('denied'));
    expect(denied.length).toBeGreaterThan(0);
    expect(denied.every(result => !result.ok)).toBe(true);
    expect(denied.every(result => result.report.expectedStatus === 403)).toBe(
      true
    );
  });

  it('inspects the exact synthetic instrument rather than the first list item', async () => {
    const results = await runHostedCookieMatrix({
      baseUrl: 'http://127.0.0.1:3000',
      actors,
      fixtures,
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        const url = String(input);
        if (!headers.has('Cookie')) {
          return jsonResponse(401, { error_code: 'UNAUTHORIZED' });
        }
        if ((init?.method ?? 'GET') === 'POST') {
          return jsonResponse(403, { error_code: 'ADMIN_REQUIRED' });
        }
        if (url.includes(`/api/instruments?id=${fixtures.orgAInstrumentId}`)) {
          if (headers.get('Cookie') === actors.orgAMember.cookieHeader) {
            return jsonResponse(200, {
              data: [
                {
                  id: fixtures.orgAInstrumentId,
                  org_id: fixtures.orgAId,
                  cost_price: AUTH_MATRIX_ORG_A_COST_PRICE,
                },
              ],
            });
          }
        }
        if (url.includes('/api/instruments?id=')) {
          return jsonResponse(404, { error: 'Instrument not found' });
        }
        if (url.includes('/api/clients?id=')) {
          return jsonResponse(404, { error: 'Client not found' });
        }
        return jsonResponse(200, {
          data: [{ id: 'other', org_id: fixtures.orgAId, maker: 'Other' }],
        });
      },
    });

    const redaction = results.find(result =>
      result.name.includes('financial redaction')
    );
    expect(redaction?.ok).toBe(false);
    expect(redaction?.report.errorMessage).toMatch(/financial/i);
  });

  it('keeps failure diagnostics secret-safe', async () => {
    const secretCookie = actors.orgAMember.cookieHeader;
    const results = await runHostedCookieMatrix({
      baseUrl: 'http://127.0.0.1:3000',
      actors,
      fixtures,
      fetchImpl: async () => {
        throw new Error(`upstream failed Cookie: ${secretCookie}`);
      },
    });

    const report = formatMatrixFailure(results[0].report);
    expect(report).toContain('actor=anonymous');
    expect(report).toContain('expected=401');
    expect(report).not.toContain(secretCookie);
    expect(report).not.toMatch(/hcv-sb-auth=orgAMember-cookie/);
    expect(JSON.stringify(results[0].report)).not.toContain(secretCookie);
  });
});
