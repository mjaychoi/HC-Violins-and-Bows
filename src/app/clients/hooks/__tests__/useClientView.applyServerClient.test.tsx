import { act, renderHook } from '@testing-library/react';
import { useClientView } from '../useClientView';
import type { Client } from '@/types';

const mockClient: Client = {
  id: 'c1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  contact_number: '555',
  tags: ['Owner'],
  interest: 'High',
  note: 'note',
  client_number: 'CL001',
  created_at: '2024-01-01',
  updated_at: '2024-01-01T00:00:00Z',
};

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({ tenantIdentityKey: 'tenant-a' }),
}));

describe('useClientView applyServerClient', () => {
  it('syncs selected client and form defaults from server row', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient, true);
    });

    const serverRow: Client = {
      ...mockClient,
      first_name: 'Augusta',
      note: 'updated note',
      tags: ['Owner', 'Dealer'],
      updated_at: '2024-06-01T12:00:00Z',
    };

    act(() => {
      result.current.applyServerClient(serverRow);
    });

    expect(result.current.selectedClient).toEqual(serverRow);
    expect(result.current.viewFormData.first_name).toBe('Augusta');
    expect(result.current.viewFormData.note).toBe('updated note');
    expect(result.current.viewFormData.tags).toEqual(['Owner', 'Dealer']);
    expect(result.current.viewFormData.tags).not.toBe(serverRow.tags);
    expect(result.current.expectedUpdatedAt).toBe('2024-06-01T12:00:00Z');
  });
});
