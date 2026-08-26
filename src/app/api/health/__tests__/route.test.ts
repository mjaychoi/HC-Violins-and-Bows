/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { handleHealthGet } from '@/app/api/_utils/handleHealthGet';
import { checkMigrations } from '@/app/api/_utils/healthCheck';

jest.mock('@/app/api/_utils/healthCheck', () => ({
  checkMigrations: jest.fn().mockRejectedValue(new Error('db should not run')),
}));

jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  checkSchemaReadiness: jest
    .fn()
    .mockRejectedValue(new Error('schema should not run')),
}));

function healthRequest(headers?: HeadersInit): NextRequest {
  return new NextRequest('http://localhost/api/health', { headers });
}

describe('/api/health liveness', () => {
  it('returns 200 without querying the database or schema', async () => {
    const res = await GET(healthRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      status: 'ok',
      service: 'inventory-app',
      timestamp: expect.any(String),
    });
    expect(checkMigrations).not.toHaveBeenCalled();
  });

  it('does not require authentication or cookies', async () => {
    const res = await handleHealthGet(healthRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks).toBeUndefined();
    expect(body.diagnostics).toBeUndefined();
  });

  it('stays 200 in production when dependency env is missing', async () => {
    const res = await handleHealthGet(healthRequest());
    const serialized = JSON.stringify(await res.json());

    expect(res.status).toBe(200);
    expect(serialized).not.toMatch(/DATABASE_URL/i);
    expect(serialized).not.toMatch(/SERVICE_ROLE/i);
    expect(serialized).not.toMatch(/postgres/i);
    expect(serialized).not.toMatch(/HEALTH_CHECK_SECRET/i);
  });

  it('does not leak version, env, or secrets', async () => {
    const res = await handleHealthGet(
      healthRequest({ Authorization: 'Bearer secret-value' })
    );
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(body.version).toBeUndefined();
    expect(serialized).not.toContain('9.9.9-should-not-leak');
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toContain('postgres://');
    expect(serialized).not.toContain('db.internal');
  });
});
