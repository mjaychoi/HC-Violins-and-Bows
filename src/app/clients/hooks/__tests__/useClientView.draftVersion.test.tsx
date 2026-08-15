import { act, renderHook } from '@testing-library/react';
import { useClientView } from '../useClientView';
import type { Client } from '@/types';

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({ tenantIdentityKey: 'tenant-a' }),
}));

const clientT0: Client = {
  id: 'c1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  contact_number: 'P0',
  tags: ['Owner'],
  interest: 'High',
  note: 'A0',
  client_number: 'CL001',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const clientT1: Client = {
  ...clientT0,
  contact_number: 'P1',
  updated_at: '2024-01-01T00:00:01Z',
};

describe('useClientView draft version isolation', () => {
  it('captures the loaded updated_at as the expected version', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientT0, true);
    });

    expect(result.current.expectedUpdatedAt).toBe(clientT0.updated_at);
    expect(result.current.viewFormData.contact_number).toBe('P0');
    expect(result.current.viewFormData.note).toBe('A0');
  });

  it('TEST-12: collection refresh cannot upgrade a dirty T0 draft token', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientT0, true);
    });

    act(() => {
      result.current.setField('note', 'A1');
    });

    act(() => {
      result.current.syncFromCollection(clientT1);
    });

    expect(result.current.isEditing).toBe(true);
    expect(result.current.expectedUpdatedAt).toBe(clientT0.updated_at);
    expect(result.current.viewFormData.note).toBe('A1');
    expect(result.current.viewFormData.contact_number).toBe('P0');
    expect(result.current.selectedClient?.updated_at).toBe(clientT0.updated_at);
    expect(result.current.selectedClient?.contact_number).toBe('P0');
  });

  it('TEST-11: explicit reconcile replaces the draft token', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientT0, true);
    });
    act(() => {
      result.current.setField('note', 'A1');
    });
    act(() => {
      result.current.applyServerClient(clientT1);
    });

    expect(result.current.expectedUpdatedAt).toBe(clientT1.updated_at);
    expect(result.current.viewFormData.contact_number).toBe('P1');
    expect(result.current.viewFormData.note).toBe('A0');
  });

  it('syncs from the collection only when the editor is not dirty', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientT0, false);
    });
    act(() => {
      result.current.syncFromCollection(clientT1);
    });

    expect(result.current.expectedUpdatedAt).toBe(clientT1.updated_at);
    expect(result.current.viewFormData.contact_number).toBe('P1');
  });
});
