import React from 'react';
import { fireEvent, render, screen } from '@/test-utils/render';
import ClientModal from '../ClientModal';
import type { Client, ClientInstrument } from '@/types';

const mockRefetch = jest.fn();

jest.mock('../InterestSelector', () => {
  function MockInterestSelector() {
    return null;
  }
  return MockInterestSelector;
});
jest.mock('../ClientTagSelector', () => {
  function MockClientTagSelector() {
    return null;
  }
  return MockClientTagSelector;
});
jest.mock('../ContactLog', () => {
  function MockContactLog() {
    return <div>ContactLog</div>;
  }
  return MockContactLog;
});
jest.mock('../FollowUpButton', () => {
  function MockFollowUpButton() {
    return <button>FollowUpButton</button>;
  }
  return MockFollowUpButton;
});
jest.mock('@/components/messages/MessageComposer', () => {
  function MockMessageComposer() {
    return <div>MessageComposer</div>;
  }
  return MockMessageComposer;
});

jest.mock('@/hooks/useOutsideClose', () => ({
  useOutsideClose: jest.fn(),
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canManageClients: true,
    canManageConnections: true,
  }),
}));

jest.mock('../../hooks/useContactLogs', () => ({
  useContactLogs: () => ({
    contactLogs: [],
    submitting: false,
    addContact: jest.fn(),
    updateContact: jest.fn(),
    deleteContact: jest.fn(),
    setFollowUp: jest.fn(),
  }),
}));

jest.mock('../../hooks/useClientsContactInfo', () => ({
  useClientsContactInfo: jest.fn(),
}));

const { useClientsContactInfo } = jest.requireMock(
  '../../hooks/useClientsContactInfo'
) as {
  useClientsContactInfo: jest.Mock;
};

const mockClient: Client = {
  id: 'client-1',
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

const baseProps = {
  isOpen: true,
  onClose: jest.fn(),
  client: mockClient,
  isEditing: false,
  onEdit: jest.fn(),
  onSave: jest.fn(),
  onDelete: jest.fn(),
  onCancel: jest.fn(),
  submitting: false,
  instrumentRelationships: [] as ClientInstrument[],
  onAddInstrument: jest.fn(),
  onRemoveInstrument: jest.fn(),
  searchResults: [],
  isSearchingInstruments: false,
  showInstrumentSearch: false,
  onToggleInstrumentSearch: jest.fn(),
  instrumentSearchTerm: '',
  onInstrumentSearchTermChange: jest.fn(),
  viewFormData: {
    last_name: 'Doe',
    first_name: 'John',
    contact_number: '123-456-7890',
    email: 'john@example.com',
    tags: ['Musician'],
    interest: 'Active',
    note: 'Test client',
  },
  showInterestDropdown: false,
  onViewInputChange: jest.fn(),
  onUpdateViewFormData: jest.fn(),
};

describe('ClientModal contact summary states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useClientsContactInfo.mockReturnValue({
      getContactInfo: () => null,
      status: 'empty',
      refetch: mockRefetch,
    });
  });

  it('shows error state instead of empty placeholders on summary failure', () => {
    useClientsContactInfo.mockReturnValue({
      getContactInfo: () => null,
      status: 'error',
      refetch: mockRefetch,
    });

    render(<ClientModal {...baseProps} />);

    expect(
      screen.getByText(/failed to load contact summary/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('None')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows explicit empty-state copy when no contact history exists', () => {
    render(<ClientModal {...baseProps} />);

    expect(screen.getByText(/no contact history/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/failed to load contact summary/i)
    ).not.toBeInTheDocument();
  });
});
