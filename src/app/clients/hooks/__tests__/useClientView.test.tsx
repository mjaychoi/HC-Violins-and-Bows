import { renderHook, act } from '@testing-library/react';
import { useClientView } from '../useClientView';
import { Client } from '@/types';

const mockClient: Client = {
  id: '1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: ['Musician'],
  interest: 'Active',
    note: 'Test client',
    client_number: null,
    created_at: '2023-01-01T00:00:00Z',
};

describe('useClientView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useClientView());

    expect(result.current.showViewModal).toBe(false);
    expect(result.current.selectedClient).toBeNull();
    expect(result.current.isEditing).toBe(false);
    expect(result.current.showInterestDropdown).toBe(false);
    expect(result.current.viewFormData).toEqual({
      last_name: '',
      first_name: '',
      contact_number: '',
      email: '',
      tags: [],
      interest: '',
      note: '',
    });
  });

  it('opens client view', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
    });

    expect(result.current.showViewModal).toBe(true);
    expect(result.current.selectedClient).toEqual(mockClient);
    expect(result.current.viewFormData).toEqual({
      last_name: mockClient.last_name,
      first_name: mockClient.first_name,
      contact_number: mockClient.contact_number,
      email: mockClient.email,
      tags: mockClient.tags,
      interest: mockClient.interest,
      note: mockClient.note,
    });
  });

  it('closes client view', () => {
    const { result } = renderHook(() => useClientView());

    // First open the modal
    act(() => {
      result.current.openClientView(mockClient);
    });

    expect(result.current.showViewModal).toBe(true);

    // Then close it
    act(() => {
      result.current.closeClientView();
    });

    expect(result.current.showViewModal).toBe(false);
    expect(result.current.selectedClient).toBeNull();
    expect(result.current.isEditing).toBe(false);
  });

  it('starts editing', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
      result.current.startEditing();
    });

    expect(result.current.isEditing).toBe(true);
  });

  it('stops editing', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
      result.current.startEditing();
      result.current.stopEditing();
    });

    expect(result.current.isEditing).toBe(false);
  });

  it('updates view form data', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
      result.current.updateViewFormData({
        first_name: 'Jane',
        last_name: 'Smith',
      });
    });

    expect(result.current.viewFormData.first_name).toBe('Jane');
    expect(result.current.viewFormData.last_name).toBe('Smith');
    expect(result.current.viewFormData.email).toBe(mockClient.email); // Other fields unchanged
  });

  it('handles input change', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
    });

    const mockEvent = {
      target: {
        name: 'first_name',
        value: 'Jane',
      },
    } as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleViewInputChange(mockEvent);
    });

    expect(result.current.viewFormData.first_name).toBe('Jane');
  });

  it('handles checkbox input change', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
    });

    const mockEvent = {
      target: {
        name: 'tags',
        type: 'checkbox',
        checked: true,
        value: 'Owner',
      },
    } as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleViewInputChange(mockEvent);
    });

    expect(result.current.viewFormData.tags).toContain('Owner');
  });

  it('handles checkbox uncheck', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
    });

    const mockEvent = {
      target: {
        name: 'tags',
        type: 'checkbox',
        checked: false,
        value: 'Musician',
      },
    } as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleViewInputChange(mockEvent);
    });

    expect(result.current.viewFormData.tags).not.toContain('Musician');
  });

  it('shows interest dropdown for relevant tags', () => {
    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(mockClient);
    });

    expect(result.current.showInterestDropdown).toBe(true); // Because client has 'Musician' tag
  });

  it('does not show interest dropdown for non-relevant tags', () => {
    const clientWithoutRelevantTags: Client = {
      ...mockClient,
      tags: ['Owner'],
    };

    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientWithoutRelevantTags);
    });

    expect(result.current.showInterestDropdown).toBe(false);
  });

  it('resets form data when opening new client', () => {
    const { result } = renderHook(() => useClientView());

    const firstClient: Client = {
      ...mockClient,
      first_name: 'John',
    };

    const secondClient: Client = {
      ...mockClient,
      id: '2',
      first_name: 'Jane',
    };

    act(() => {
      result.current.openClientView(firstClient);
      result.current.updateViewFormData({ first_name: 'Modified' });
    });

    expect(result.current.viewFormData.first_name).toBe('Modified');

    act(() => {
      result.current.openClientView(secondClient);
    });

    expect(result.current.viewFormData.first_name).toBe('Jane');
  });

  it('handles client with null values', () => {
    const clientWithNulls: Client = {
      id: '1',
      first_name: null,
      last_name: null,
      email: null,
      contact_number: null,
      tags: [],
      interest: null,
      note: null,
      client_number: null,
      created_at: '2023-01-01T00:00:00Z',
    };

    const { result } = renderHook(() => useClientView());

    act(() => {
      result.current.openClientView(clientWithNulls);
    });

    expect(result.current.viewFormData.first_name).toBe('');
    expect(result.current.viewFormData.last_name).toBe('');
    expect(result.current.viewFormData.email).toBe('');
    expect(result.current.viewFormData.contact_number).toBe('');
    expect(result.current.viewFormData.tags).toEqual([]);
    expect(result.current.viewFormData.interest).toBe('');
    expect(result.current.viewFormData.note).toBe('');
  });
});
