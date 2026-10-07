import { NextRequest } from 'next/server';

import { PATCH, POST } from '../route';

/**
 * Regression: POST/PATCH /api/connections returned HTTP 500 after the write
 * had already committed.
 *
 * Both handlers re-read the row with CONNECTION_DETAIL_SELECT, whose embeds
 * are narrow column allowlists (instrument: id, maker, type, year, price).
 * fetchConnectionById then validated that row with the full
 * clientInstrumentSchema, whose `instrument` is the full instrumentSchema
 * (status, created_at, serial_number, ...), so every real response failed
 * validation. route.test.ts mocks validateClientInstrument to the identity
 * function, which hid this; the hosted critical E2E caught it. This suite
 * keeps the real typeGuards validators and feeds the handlers the exact
 * narrowed shape PostgREST returns for that select.
 */

jest.mock('@/app/api/_utils/rateLimit', () => ({
  authRateLimit: null,
  applyScopedRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  extractClientIp: jest.fn(),
  RATE_LIMIT_ROUTE_KEYS: { connectionsCreate: 'connections:create' },
}));
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertClientConnectionsSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-10-07T00:00:00.000Z',
    missingColumns: [],
  }),
}));

let mockUserSupabase: { from: jest.Mock; rpc: jest.Mock };

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => async (request: any) =>
      handler(request, {
        user: { id: 'admin-user' },
        accessToken: 'token',
        orgId: '6c1e9a40-6b0e-4c55-9d0a-6a3e4c1f2b10',
        role: 'admin',
        userSupabase: mockUserSupabase,
        isTestBypass: false,
      }),
  };
});

const CONNECTION_ID = '1f6a3c2e-8d4b-4e7a-9c1d-2b3e4f5a6b70';
const CLIENT_ID = '2a7b4d3f-9e5c-4f8b-8d2e-3c4f5a6b7c81';
const INSTRUMENT_ID = '3b8c5e4a-af6d-4a9c-9e3f-4d5a6b7c8d92';

/** What PostgREST returns for CONNECTION_DETAIL_SELECT on one row. */
const narrowedDetailRow = {
  id: CONNECTION_ID,
  client_id: CLIENT_ID,
  instrument_id: INSTRUMENT_ID,
  relationship_type: 'Interested',
  notes: 'detail notes',
  display_order: 0,
  created_at: '2026-10-07T13:10:25.000Z',
  updated_at: '2026-10-07T13:10:25.000Z',
  org_id: '6c1e9a40-6b0e-4c55-9d0a-6a3e4c1f2b10',
  client: {
    id: CLIENT_ID,
    first_name: 'Conn',
    last_name: 'Critical',
    email: 'conn@example.com',
    tags: ['E2E-CRITICAL'],
  },
  instrument: {
    id: INSTRUMENT_ID,
    maker: 'Conn A',
    type: 'Violin',
    year: 2026,
    price: 1200,
  },
};

function mockDetailRead(row: unknown) {
  const single = jest.fn().mockResolvedValue({ data: row, error: null });
  const eqOrg = jest.fn().mockReturnValue({ single });
  const eqId = jest.fn().mockReturnValue({ eq: eqOrg });
  const select = jest.fn().mockReturnValue({ eq: eqId });
  mockUserSupabase.from.mockReturnValue({ select });
}

function expectNarrowedEmbeds(data: Record<string, any>) {
  expect(data).toMatchObject({
    id: CONNECTION_ID,
    client_id: CLIENT_ID,
    instrument_id: INSTRUMENT_ID,
    relationship_type: 'Interested',
    notes: 'detail notes',
  });
  expect(data.client).toMatchObject({
    id: CLIENT_ID,
    first_name: 'Conn',
    last_name: 'Critical',
    email: 'conn@example.com',
    tags: ['E2E-CRITICAL'],
  });
  expect(data.instrument).toMatchObject({
    id: INSTRUMENT_ID,
    maker: 'Conn A',
    type: 'Violin',
    year: 2026,
    price: 1200,
  });
  // Allowlisted embeds stay narrow: nothing outside the select is invented.
  expect(data.instrument.status).toBeUndefined();
  expect(data.instrument.serial_number).toBeUndefined();
  expect(data.instrument.cost_price).toBeUndefined();
}

describe('/api/connections detail response validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSupabase = { from: jest.fn(), rpc: jest.fn() };
  });

  it('POST returns 201 with the narrowed client/instrument embeds', async () => {
    mockUserSupabase.rpc.mockResolvedValue({
      data: CONNECTION_ID,
      error: null,
    });
    mockDetailRead(narrowedDetailRow);

    const response = await POST(
      new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: CLIENT_ID,
          instrument_id: INSTRUMENT_ID,
          relationship_type: 'Interested',
          notes: 'detail notes',
        }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expectNarrowedEmbeds(json.data);
  });

  it('PATCH returns 200 with the narrowed client/instrument embeds', async () => {
    mockUserSupabase.rpc.mockResolvedValue({
      data: CONNECTION_ID,
      error: null,
    });
    mockDetailRead(narrowedDetailRow);

    const response = await PATCH(
      new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({ id: CONNECTION_ID, notes: 'detail notes' }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expectNarrowedEmbeds(json.data);
  });

  it('still rejects a detail row whose embedded instrument lacks its id', async () => {
    mockUserSupabase.rpc.mockResolvedValue({
      data: CONNECTION_ID,
      error: null,
    });
    mockDetailRead({
      ...narrowedDetailRow,
      instrument: { maker: 'Conn A', type: 'Violin', year: 2026, price: 1200 },
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({ id: CONNECTION_ID, notes: 'detail notes' }),
      })
    );

    expect(response.status).toBe(500);
  });
});
