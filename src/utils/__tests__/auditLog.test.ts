import type { AuditEntry } from '../auditLog';

const mockInsert = jest.fn();
const mockFrom = jest.fn();
const mockLogError = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getAdminSupabase: jest.fn(() => ({
    from: mockFrom,
  })),
}));

jest.mock('@/utils/logger', () => ({
  logError: mockLogError,
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockFrom.mockReturnValue({ insert: mockInsert });
  mockInsert.mockResolvedValue({ error: null });
});

const baseEntry: AuditEntry = {
  orgId: 'org-1',
  actorId: 'user-1',
  actorRole: 'admin',
  action: 'instrument.delete',
  resourceType: 'instrument',
  resourceId: 'instr-1',
};

async function writeAuditLog(entry: AuditEntry) {
  const mod = await import('../auditLog');
  return mod.writeAuditLog(entry);
}

it('inserts the correct row shape into audit_log', async () => {
  await writeAuditLog(baseEntry);

  expect(mockFrom).toHaveBeenCalledWith('audit_log');
  expect(mockInsert).toHaveBeenCalledWith({
    org_id: 'org-1',
    actor_id: 'user-1',
    actor_role: 'admin',
    action: 'instrument.delete',
    resource_type: 'instrument',
    resource_id: 'instr-1',
    metadata: null,
  });
});

it('includes metadata when provided', async () => {
  await writeAuditLog({ ...baseEntry, metadata: { cost_price: 1200 } });

  expect(mockInsert).toHaveBeenCalledWith(
    expect.objectContaining({ metadata: { cost_price: 1200 } })
  );
});

it('logs error and does not throw when insert returns an error', async () => {
  mockInsert.mockResolvedValueOnce({ error: { message: 'db error' } });

  await expect(writeAuditLog(baseEntry)).resolves.toBeUndefined();
  expect(mockLogError).toHaveBeenCalledWith(
    'auditLog insert failed',
    expect.any(Error),
    'auditLog',
    expect.objectContaining({ entry: baseEntry })
  );
});

it('logs error and does not throw when getAdminSupabase throws', async () => {
  const { getAdminSupabase } = await import('@/lib/supabase-server');
  (getAdminSupabase as jest.Mock).mockImplementationOnce(() => {
    throw new Error('supabase unavailable');
  });

  await expect(writeAuditLog(baseEntry)).resolves.toBeUndefined();
  expect(mockLogError).toHaveBeenCalledWith(
    'auditLog unexpected error',
    expect.any(Error),
    'auditLog',
    expect.objectContaining({ entry: baseEntry })
  );
});

it('handles all supported action types without type errors', async () => {
  const actions: AuditEntry['action'][] = [
    'instrument.delete',
    'instrument.update_financial',
    'invoice.delete',
    'invoice.update_status',
    'client.delete',
    'sale.create',
    'sale.update',
  ];

  for (const action of actions) {
    await writeAuditLog({ ...baseEntry, action });
  }

  expect(mockInsert).toHaveBeenCalledTimes(actions.length);
});
