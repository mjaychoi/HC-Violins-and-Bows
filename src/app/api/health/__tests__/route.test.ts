import { GET } from '../route';

// Mock healthCheck
jest.mock('@/app/api/_utils/healthCheck', () => ({
  checkMigrations: jest.fn().mockResolvedValue({
    display_order: true,
    allHealthy: true,
  }),
}));

describe('/api/health', () => {
  it('returns ok with metadata', async () => {
    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.checks?.forbiddenPoliciesAbsent).toBe(true);
  });
});
