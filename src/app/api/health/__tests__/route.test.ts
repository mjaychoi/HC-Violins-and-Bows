jest.mock('next/server', () => ({
  NextResponse: {
    json: (payload: unknown) => ({
      json: async () => payload,
    }),
  },
}));

import { GET } from '../route';

describe('/api/health', () => {
  it('returns ok with metadata', async () => {
    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.environment).toBeDefined();
  });
});
