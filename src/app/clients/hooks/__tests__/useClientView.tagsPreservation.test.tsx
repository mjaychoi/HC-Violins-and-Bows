import React, { StrictMode } from 'react';
import { act, renderHook } from '@/test-utils/render';
import { useClientView } from '../useClientView';
import type { Client } from '@/types';

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({ tenantIdentityKey: 'tenant-a' }),
}));

const T0 = '2024-01-01T00:00:00.000Z';
const T1 = '2024-01-01T00:00:01.000Z';

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    contact_number: 'P0',
    tags: ['Owner', 'Musician'],
    interest: 'Active',
    note: 'Old',
    client_number: 'CL001',
    created_at: T0,
    updated_at: T0,
    ...overrides,
  };
}

describe('useClientView tag preservation (V2-003)', () => {
  it('initializes edit tags from the opened Client as a defensive copy', () => {
    const tags = ['Owner', 'Musician'];
    const client = makeClient({ tags });
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(client, true);
    });

    expect(result.current.viewFormData.tags).toEqual(['Owner', 'Musician']);
    expect(result.current.viewFormData.tags).not.toBe(tags);
    expect(result.current.expectedUpdatedAt).toBe(T0);
  });

  it('keeps existing tags when an unrelated field changes', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(makeClient(), true);
    });
    act(() => {
      result.current.setField('note', 'New');
    });

    expect(result.current.viewFormData.note).toBe('New');
    expect(result.current.viewFormData.tags).toEqual(['Owner', 'Musician']);
    expect(result.current.expectedUpdatedAt).toBe(T0);
  });

  it('adds a tag through the existing toggle without dropping others', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(makeClient({ tags: ['Owner'] }), true);
    });
    act(() => {
      result.current.toggleTag('Musician', true);
    });

    expect(result.current.viewFormData.tags).toEqual(['Owner', 'Musician']);
  });

  it('removes one tag without restoring it from the server snapshot', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(makeClient(), true);
    });
    act(() => {
      result.current.toggleTag('Owner', false);
    });

    expect(result.current.viewFormData.tags).toEqual(['Musician']);
  });

  it('supports clearing every tag through the existing toggle', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(makeClient(), true);
    });
    act(() => {
      result.current.toggleTag('Owner', false);
      result.current.toggleTag('Musician', false);
    });

    expect(result.current.viewFormData.tags).toEqual([]);
  });

  it('resets form tags when switching from Client A to Client B', () => {
    const { result } = renderHook(() => useClientView());
    const clientA = makeClient({ id: 'a', tags: ['Owner'] });
    const clientB = makeClient({
      id: 'b',
      first_name: 'Ben',
      tags: ['Musician', 'Dealer'],
    });

    act(() => {
      result.current.openClientView(clientA, true);
    });
    act(() => {
      result.current.toggleTag('Collector', true);
    });
    act(() => {
      result.current.closeClientView();
    });
    act(() => {
      result.current.openClientView(clientB, true);
    });

    expect(result.current.viewFormData.tags).toEqual(['Musician', 'Dealer']);
    expect(result.current.viewFormData.first_name).toBe('Ben');
  });

  it('resets tags to the create/empty default after closing an existing Client', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(makeClient(), true);
    });
    act(() => {
      result.current.closeClientView();
    });

    expect(result.current.viewFormData.tags).toEqual([]);
    expect(result.current.expectedUpdatedAt).toBeNull();
  });

  it('does not rewrite a dirty T0 draft when the collection moves to T1 tags', () => {
    const clientT0 = makeClient({ tags: ['Owner'] });
    const clientT1 = makeClient({
      tags: ['Owner', 'Dealer'],
      note: 'Server note',
      updated_at: T1,
    });
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientT0, true);
    });
    act(() => {
      result.current.setField('note', 'Local note');
    });
    act(() => {
      result.current.syncFromCollection(clientT1);
    });

    expect(result.current.expectedUpdatedAt).toBe(T0);
    expect(result.current.viewFormData.note).toBe('Local note');
    expect(result.current.viewFormData.tags).toEqual(['Owner']);
    expect(result.current.selectedClient?.updated_at).toBe(T0);
  });

  it('moves fields, tags, and version together on explicit reconcile', () => {
    const clientT0 = makeClient({ tags: ['Owner'], note: 'N0' });
    const clientT1 = makeClient({
      tags: ['Owner', 'Dealer'],
      note: 'N1-server',
      updated_at: T1,
    });
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientT0, true);
    });
    act(() => {
      result.current.setField('note', 'N1-local');
    });
    act(() => {
      result.current.applyServerClient(clientT1);
    });

    expect(result.current.expectedUpdatedAt).toBe(T1);
    expect(result.current.viewFormData.note).toBe('N1-server');
    expect(result.current.viewFormData.tags).toEqual(['Owner', 'Dealer']);
  });

  it('preserves tag order and stays stable under StrictMode double invoke', () => {
    const client = makeClient({ tags: ['Musician', 'Owner'] });
    const { result } = renderHook(() => useClientView(), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });

    act(() => {
      result.current.openClientView(client, true);
    });

    expect(result.current.viewFormData.tags).toEqual(['Musician', 'Owner']);
    expect(result.current.isEditing).toBe(true);
    expect(result.current.expectedUpdatedAt).toBe(T0);
  });
});
