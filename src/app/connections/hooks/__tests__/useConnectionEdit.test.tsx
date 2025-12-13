import { renderHook, act } from '@testing-library/react';
import { useConnectionEdit } from '../useConnectionEdit';
import { ClientInstrument, Client, Instrument } from '@/types';

const mockClient: Client = {
  id: 'c1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '010-1234-5678',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01',
};

const mockInstrument: Instrument = {
  id: 'i1',
  maker: 'Stradivari',
  type: 'Violin',
  subtype: null,
  year: 1700,
  certificate: true,
  size: null,
  weight: null,
  price: null,
  ownership: null,
  note: null,
  serial_number: 'VI0000001',
  status: 'Available',
  created_at: '2024-01-01',
};

const mockConnection: ClientInstrument = {
  id: 'conn1',
  client_id: 'c1',
  instrument_id: 'i1',
  relationship_type: 'Interested',
  notes: 'Test notes',
  created_at: '2024-01-01',
  client: mockClient,
  instrument: mockInstrument,
};

describe('useConnectionEdit', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useConnectionEdit());

    expect(result.current.editingConnection).toBeNull();
    expect(result.current.showEditModal).toBe(false);
  });

  it('should open edit modal with connection', () => {
    const { result } = renderHook(() => useConnectionEdit());

    act(() => {
      result.current.openEditModal(mockConnection);
    });

    expect(result.current.showEditModal).toBe(true);
    expect(result.current.editingConnection).toEqual(mockConnection);
  });

  it('should close edit modal and clear connection', () => {
    const { result } = renderHook(() => useConnectionEdit());

    act(() => {
      result.current.openEditModal(mockConnection);
    });

    expect(result.current.showEditModal).toBe(true);
    expect(result.current.editingConnection).toEqual(mockConnection);

    act(() => {
      result.current.closeEditModal();
    });

    expect(result.current.showEditModal).toBe(false);
    expect(result.current.editingConnection).toBeNull();
  });

  it('should handle multiple open/close cycles', () => {
    const { result } = renderHook(() => useConnectionEdit());

    act(() => {
      result.current.openEditModal(mockConnection);
    });

    expect(result.current.showEditModal).toBe(true);

    act(() => {
      result.current.closeEditModal();
    });

    expect(result.current.showEditModal).toBe(false);

    const anotherConnection: ClientInstrument = {
      ...mockConnection,
      id: 'conn2',
      relationship_type: 'Owned',
    };

    act(() => {
      result.current.openEditModal(anotherConnection);
    });

    expect(result.current.showEditModal).toBe(true);
    expect(result.current.editingConnection).toEqual(anotherConnection);
  });
});
