import React from 'react';
import { renderHook, act } from '@/test-utils/render';
import {
  ConnectionsProvider,
  useConnectionsContext,
} from '../ConnectionsContext';
import type { Client, ClientInstrument, Instrument } from '@/types';

const mockHandleError = jest.fn();

jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({
    tenantIdentityKey: 'tenant-unit-test',
  })),
}));

jest.mock('@/utils/apiFetch', () => {
  const actual =
    jest.requireActual<typeof import('@/utils/apiFetch')>('@/utils/apiFetch');
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

import { apiFetch } from '@/utils/apiFetch';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConnectionsProvider>{children}</ConnectionsProvider>;
}

function client(overrides: Partial<Client> & Pick<Client, 'id'>): Client {
  return {
    last_name: 'Smith',
    first_name: 'Alice',
    contact_number: null,
    email: 'alice.smith@example.com',
    tags: [],
    interest: null,
    note: null,
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function instrument(
  overrides: Partial<Instrument> & Pick<Instrument, 'id'>
): Instrument {
  return {
    status: 'Available',
    maker: 'Old Maker',
    type: 'Violin',
    subtype: null,
    year: 1900,
    certificate: null,
    size: null,
    weight: null,
    price: 1000,
    ownership: null,
    note: null,
    serial_number: 'OLD123',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function connectionRow(
  id: string,
  extra?: Partial<ClientInstrument>
): ClientInstrument {
  return {
    id,
    client_id: extra?.client_id ?? 'client-a',
    instrument_id: extra?.instrument_id ?? 'instrument-a',
    relationship_type: extra?.relationship_type ?? 'Interested',
    notes: extra?.notes ?? 'keep-me',
    display_order: extra?.display_order ?? 2,
    created_at: extra?.created_at ?? '2024-01-01T00:00:00Z',
    client: extra?.client ?? client({ id: extra?.client_id ?? 'client-a' }),
    instrument:
      extra?.instrument ??
      instrument({ id: extra?.instrument_id ?? 'instrument-a' }),
    ...extra,
  };
}

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

describe('ConnectionsContext related-entity reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetch as jest.Mock).mockReset();
    (useTenantIdentity as jest.Mock).mockReturnValue({
      tenantIdentityKey: 'tenant-unit-test',
    });
  });

  async function seedCompleteCache(rows: ClientInstrument[]) {
    (apiFetch as jest.Mock).mockResolvedValue(
      okResponse({
        data: rows,
        count: rows.length,
        page: 1,
        pageSize: rows.length,
        totalPages: 1,
        pagination: {
          page: 1,
          pageSize: rows.length,
          totalCount: rows.length,
          totalPages: 1,
        },
        scope: 'paged',
        truncated: false,
      })
    );

    const rendered = renderHook(() => useConnectionsContext(), { wrapper });

    await act(async () => {
      await rendered.result.current.actions.fetchConnections({ all: true });
    });

    return rendered;
  }

  it('R1: a successful Client rename updates every cached Connection for that Client', async () => {
    const rows = [
      connectionRow('c1', { notes: 'one' }),
      connectionRow('c2', { notes: 'two', relationship_type: 'Owned' }),
      connectionRow('c3', {
        client_id: 'client-b',
        client: client({ id: 'client-b', last_name: 'Other' }),
      }),
    ];
    const { result } = await seedCompleteCache(rows);

    act(() => {
      result.current.actions.reconcileRelatedClient(
        client({
          id: 'client-a',
          first_name: 'Alice',
          last_name: 'Jones',
          email: 'alice.jones@example.com',
        }),
        'tenant-unit-test'
      );
    });

    const patchedA = result.current.state.connections.find(
      row => row.id === 'c1'
    );
    const patchedB = result.current.state.connections.find(
      row => row.id === 'c2'
    );
    const unrelated = result.current.state.connections.find(
      row => row.id === 'c3'
    );

    expect(patchedA?.client?.last_name).toBe('Jones');
    expect(patchedB?.client?.last_name).toBe('Jones');
    expect(unrelated?.client?.last_name).toBe('Other');
    expect(patchedA?.notes).toBe('one');
    expect(patchedB?.relationship_type).toBe('Owned');
    expect(result.current.state.truncated).toBe(false);
  });

  it('R2: a successful Instrument edit updates every cached Connection for that Item', async () => {
    const rows = [
      connectionRow('c1'),
      connectionRow('c2', { relationship_type: 'Booked' }),
      connectionRow('c3', {
        instrument_id: 'instrument-b',
        instrument: instrument({ id: 'instrument-b', maker: 'Keep' }),
      }),
    ];
    const { result } = await seedCompleteCache(rows);

    act(() => {
      result.current.actions.reconcileRelatedInstrument(
        instrument({
          id: 'instrument-a',
          maker: 'New Maker',
          type: 'Viola',
          serial_number: 'NEW456',
        }),
        'tenant-unit-test'
      );
    });

    const patchedA = result.current.state.connections.find(
      row => row.id === 'c1'
    );
    const patchedB = result.current.state.connections.find(
      row => row.id === 'c2'
    );
    const unrelated = result.current.state.connections.find(
      row => row.id === 'c3'
    );

    expect(patchedA?.instrument?.maker).toBe('New Maker');
    expect(patchedB?.instrument?.type).toBe('Viola');
    expect(patchedB?.instrument?.serial_number).toBe('NEW456');
    expect(unrelated?.instrument?.maker).toBe('Keep');
    expect(patchedA?.notes).toBe('keep-me');
  });

  it('does not invent an identity when a rename/edit never succeeds (no reconcile)', async () => {
    const { result } = await seedCompleteCache([connectionRow('c1')]);
    expect(result.current.state.connections[0].client?.last_name).toBe('Smith');
  });

  it('R4: a late reconcile from another tenant does not relabel the current cache', async () => {
    const { result } = await seedCompleteCache([connectionRow('c1')]);

    act(() => {
      result.current.actions.reconcileRelatedClient(
        client({ id: 'client-a', last_name: 'Jones' }),
        'tenant-other'
      );
    });

    expect(result.current.state.connections[0].client?.last_name).toBe('Smith');
  });

  it('preserves the complete-cache contract: reconcile does not force another drain', async () => {
    const { result } = await seedCompleteCache([connectionRow('c1')]);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.actions.reconcileRelatedClient(
        client({ id: 'client-a', last_name: 'Jones' }),
        'tenant-unit-test'
      );
    });

    await act(async () => {
      await result.current.actions.fetchConnections({ all: true });
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.state.connections[0].client?.last_name).toBe('Jones');
  });
});
