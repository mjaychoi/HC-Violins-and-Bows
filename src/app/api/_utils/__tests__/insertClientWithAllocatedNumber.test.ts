import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  CREATE_CLIENT_RPC_RESPONSE_ASSEMBLY_FAILED,
  formatClClientNumberFromSuffix,
  getNextClSuffixFromDb,
  insertClientWithClientNumber,
  isClientNumberAllocationExhausted,
  isCreateClientRpcResponseAssemblyFailure,
  parseCreateClientWithConnectionsPayload,
  rpcCreateClientWithConnectionsAtomic,
} from '../insertClientWithAllocatedNumber';

function buildInsertChain(
  onSingle: () => Promise<{ data: unknown; error: PostgrestError | null }>
) {
  const single = jest.fn().mockImplementation(onSingle);
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single,
  };
}

const sampleJsonPayload = {
  client: {
    id: 'a',
    org_id: 'o1',
    name: 'N',
    email: null,
    phone: null,
    client_number: 'CL001',
    tags: ['Owner'],
    interest: 'Collector',
    note: 'Prefers older bows',
    created_at: '2020-01-01',
    updated_at: null,
  },
  connections: [
    {
      id: 'c1',
      client_id: 'a',
      instrument_id: 'i1',
      relationship_type: 'Interested',
      notes: null,
      display_order: 0,
      created_at: '2020-01-01',
    },
  ],
};

describe('formatClClientNumberFromSuffix', () => {
  it('uses CL + zero-padded digits', () => {
    expect(formatClClientNumberFromSuffix(1)).toBe('CL001');
    expect(formatClClientNumberFromSuffix(1000)).toBe('CL1000');
  });
});

describe('getNextClSuffixFromDb', () => {
  it('adds 1 to rpc max (numeric data)', async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: 4, error: null }),
    } as unknown as SupabaseClient;
    await expect(getNextClSuffixFromDb(supabase, 'org-1')).resolves.toBe(5);
    expect(supabase.rpc).toHaveBeenCalledWith('max_cl_suffix_for_org', {
      p_org_id: 'org-1',
    });
  });
});

describe('parseCreateClientWithConnectionsPayload', () => {
  it('parses JSONB-shaped object', () => {
    const p = parseCreateClientWithConnectionsPayload(sampleJsonPayload);
    expect(p?.client.id).toBe('a');
    expect(p?.connections).toHaveLength(1);
  });
});

describe('isCreateClientRpcResponseAssemblyFailure', () => {
  it('matches the synthetic Postgrest error details from the RPC helper', () => {
    expect(
      isCreateClientRpcResponseAssemblyFailure({
        details: CREATE_CLIENT_RPC_RESPONSE_ASSEMBLY_FAILED,
      } as PostgrestError)
    ).toBe(true);
    expect(isCreateClientRpcResponseAssemblyFailure(null)).toBe(false);
    expect(
      isCreateClientRpcResponseAssemblyFailure({
        details: 'other',
      } as PostgrestError)
    ).toBe(false);
  });
});

describe('isClientNumberAllocationExhausted', () => {
  it('matches allocation exhausted synthetic error', () => {
    expect(
      isClientNumberAllocationExhausted({
        code: '23505',
        details: 'client_number_allocation_exhausted',
        message: 'x',
      } as PostgrestError)
    ).toBe(true);
  });
});

describe('insertClientWithClientNumber', () => {
  it('ignores a non-null client_number on body (server always allocates)', async () => {
    const q = buildInsertChain(() =>
      Promise.resolve({
        data: { id: 'a', client_number: 'CL001' },
        error: null,
      })
    );
    const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });
    const from = jest.fn().mockReturnValue(q);
    const supabase = { from, rpc } as unknown as SupabaseClient;
    const r = await insertClientWithClientNumber(
      supabase,
      'org-1',
      {
        name: 'N',
        email: null,
        phone: null,
        client_number: 'CL999',
        tags: ['Owner'],
        interest: 'Collector',
        note: 'Prefers older bows',
      },
      'id,client_number'
    );
    expect(r.error).toBeNull();
    expect(rpc).toHaveBeenCalled();
    const ins = (q.insert as jest.Mock).mock.calls[0][0] as {
      client_number: string;
      tags: string[];
      interest: string | null;
      note: string | null;
    };
    expect(ins.client_number).toBe('CL001');
    expect(ins.tags).toEqual(['Owner']);
    expect(ins.interest).toBe('Collector');
    expect(ins.note).toBe('Prefers older bows');
  });

  it('retries on 23505 and returns persisted value', async () => {
    let n = 0;
    const q = buildInsertChain(() => {
      n += 1;
      if (n === 1) {
        return Promise.resolve({
          data: null,
          error: { code: '23505', message: 'dup' } as PostgrestError,
        });
      }
      return Promise.resolve({
        data: { id: 'b', client_number: 'CL001' },
        error: null,
      });
    });
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: 0, error: null });
    const from = jest.fn().mockReturnValue(q);
    const supabase = { from, rpc } as unknown as SupabaseClient;
    const r = await insertClientWithClientNumber(
      supabase,
      'org-1',
      {
        name: 'N',
        email: null,
        phone: null,
        client_number: null,
        tags: [],
        interest: null,
        note: null,
      },
      'id,client_number'
    );
    expect(r.error).toBeNull();
    expect(n).toBe(2);
    if (r.data && typeof r.data === 'object' && r.data !== null) {
      expect((r.data as { client_number: string }).client_number).toBe('CL001');
    }
  });

  it('returns allocation exhausted when retries are exhausted', async () => {
    const q = buildInsertChain(() =>
      Promise.resolve({
        data: null,
        error: { code: '23505', message: 'dup' } as PostgrestError,
      })
    );
    const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });
    const from = jest.fn().mockReturnValue(q);
    const supabase = { from, rpc } as unknown as SupabaseClient;
    const r = await insertClientWithClientNumber(
      supabase,
      'org-1',
      {
        name: 'N',
        email: null,
        phone: null,
        client_number: null,
        tags: [],
        interest: null,
        note: null,
      },
      'id,client_number'
    );
    expect(r.data).toBeNull();
    expect(r.error).not.toBeNull();
    expect(
      isClientNumberAllocationExhausted(
        (r as { data: null; error: PostgrestError }).error
      )
    ).toBe(true);
  });
});

describe('rpcCreateClientWithConnectionsAtomic', () => {
  it('retries unique violation and returns JSON payload', async () => {
    let createAttempts = 0;
    const rpc = jest
      .fn()
      .mockImplementation((fnName: string, args?: Record<string, unknown>) => {
        if (fnName === 'max_cl_suffix_for_org') {
          return Promise.resolve({ data: 0, error: null });
        }
        if (fnName === 'create_client_with_connections_atomic') {
          if (createAttempts === 0) {
            expect(args).toMatchObject({
              p_interest: 'Collector',
              p_note: 'Prefers older bows',
            });
          }
          createAttempts += 1;
          if (createAttempts === 1) {
            return Promise.resolve({
              data: null,
              error: { code: '23505', message: 'dup' } as PostgrestError,
            });
          }
          return Promise.resolve({
            data: sampleJsonPayload,
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });
    const supabase = { rpc } as unknown as SupabaseClient;
    const r = await rpcCreateClientWithConnectionsAtomic(
      supabase,
      'org-1',
      {
        name: 'N',
        email: null,
        phone: null,
        tags: [],
        interest: 'Collector',
        note: 'Prefers older bows',
      },
      []
    );
    expect(r.error).toBeNull();
    if (r.data) {
      expect(r.data.client.id).toBe('a');
      expect(r.data.connections).toHaveLength(1);
    }
    expect(createAttempts).toBe(2);
  });

  it('recovers persisted rows when RPC payload parsing fails after a successful write', async () => {
    const recoveredClientQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: sampleJsonPayload.client,
        error: null,
      }),
    };
    const recoveredConnectionsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };
    (recoveredConnectionsQuery.order as jest.Mock)
      .mockReturnValueOnce(recoveredConnectionsQuery)
      .mockResolvedValueOnce({
        data: sampleJsonPayload.connections,
        error: null,
      });

    const rpc = jest.fn().mockImplementation((fnName: string) => {
      if (fnName === 'max_cl_suffix_for_org') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (fnName === 'create_client_with_connections_atomic') {
        return Promise.resolve({ data: { malformed: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const from = jest.fn((table: string) => {
      if (table === 'clients') return recoveredClientQuery;
      if (table === 'client_instruments') return recoveredConnectionsQuery;
      return undefined;
    });

    const supabase = { rpc, from } as unknown as SupabaseClient;
    const r = await rpcCreateClientWithConnectionsAtomic(
      supabase,
      'org-1',
      {
        name: 'N',
        email: null,
        phone: null,
        tags: [],
        interest: null,
        note: null,
      },
      []
    );

    expect(r.error).toBeNull();
    expect(r.data?.client.client_number).toBe('CL001');
    expect(r.data?.connections).toHaveLength(1);
  });

  it('returns assembly failure when RPC payload is invalid and recovery finds no row', async () => {
    const recoveredClientQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    const rpc = jest.fn().mockImplementation((fnName: string) => {
      if (fnName === 'max_cl_suffix_for_org') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (fnName === 'create_client_with_connections_atomic') {
        return Promise.resolve({ data: { malformed: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const from = jest.fn((table: string) => {
      if (table === 'clients') return recoveredClientQuery;
      return undefined;
    });

    const supabase = { rpc, from } as unknown as SupabaseClient;
    const r = await rpcCreateClientWithConnectionsAtomic(
      supabase,
      'org-1',
      {
        name: 'N',
        email: null,
        phone: null,
        tags: [],
        interest: null,
        note: null,
      },
      []
    );

    expect(r.data).toBeNull();
    expect(r.error).not.toBeNull();
    expect(isCreateClientRpcResponseAssemblyFailure(r.error)).toBe(true);
  });
});
