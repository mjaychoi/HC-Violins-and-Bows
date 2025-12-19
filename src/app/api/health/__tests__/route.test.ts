import { GET } from '../route';
import { NextRequest } from 'next/server';

// Mock healthCheck
jest.mock('@/app/api/_utils/healthCheck', () => ({
  checkMigrations: jest.fn().mockResolvedValue({
    display_order: true,
    allHealthy: true,
  }),
}));

describe('/api/health', () => {
  it('returns ok with metadata', async () => {
    const request = new NextRequest('http://localhost/api/health');
    const res = await GET(request);
    const body = await res.json();

    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.environment).toBeDefined();
  });
});
