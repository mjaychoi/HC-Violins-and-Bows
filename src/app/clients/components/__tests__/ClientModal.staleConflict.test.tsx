import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import ClientModal from '../ClientModal';
import type { Client } from '@/types';
import type { ClientViewFormData } from '../../types';
import { CLIENT_STALE_CONFLICT_MESSAGE } from '@/app/api/clients/_utils/concurrency';

const mockClient: Client = {
  id: '1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  contact_number: 'P0',
  tags: ['Musician'],
  interest: 'Active',
  note: 'A0',
  client_number: null,
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const onSave = jest.fn(async () => {
  /* parent keeps the modal open and preserves the local draft */
});

function ConflictHarness() {
  const [isOpen] = useState(true);
  const [isEditing] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewFormData, setViewFormData] = useState<ClientViewFormData>({
    last_name: mockClient.last_name || '',
    first_name: mockClient.first_name || '',
    contact_number: mockClient.contact_number || '',
    email: mockClient.email || '',
    tags: mockClient.tags || [],
    interest: mockClient.interest || '',
    note: mockClient.note || '',
  });

  return (
    <>
      <ClientModal
        isOpen={isOpen}
        onClose={jest.fn()}
        client={mockClient}
        isEditing={isEditing}
        onEdit={jest.fn()}
        onSave={async data => {
          await onSave(data);
          setSaveError(CLIENT_STALE_CONFLICT_MESSAGE);
        }}
        onDelete={jest.fn()}
        onCancel={jest.fn()}
        saveError={saveError}
        submitting={false}
        instrumentRelationships={[]}
        onAddInstrument={jest.fn()}
        onRemoveInstrument={jest.fn()}
        searchResults={[]}
        isSearchingInstruments={false}
        showInstrumentSearch={false}
        onToggleInstrumentSearch={jest.fn()}
        instrumentSearchTerm=""
        onInstrumentSearchTermChange={jest.fn()}
        viewFormData={viewFormData}
        showInterestDropdown={false}
        onViewInputChange={e => {
          const { name, value } = e.target as HTMLInputElement;
          setViewFormData(prev => ({ ...prev, [name]: value }));
        }}
        onUpdateViewFormData={updates => {
          setViewFormData(prev => ({ ...prev, ...updates }));
        }}
      />
    </>
  );
}

describe('ClientModal stale conflict UX', () => {
  beforeEach(() => {
    onSave.mockClear();
  });

  it('keeps the local draft open and does not auto-retry after 409', async () => {
    render(<ConflictHarness />);

    fireEvent.change(
      screen.getByPlaceholderText('Enter any additional notes'),
      {
        target: { value: 'A1' },
      }
    );
    fireEvent.click(screen.getByText('Save Changes'));

    expect(
      await screen.findByText(CLIENT_STALE_CONFLICT_MESSAGE)
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter any additional notes')
    ).toHaveValue('A1');
    expect(screen.getByPlaceholderText('Enter contact number')).toHaveValue(
      'P0'
    );
    expect(
      screen.queryByText('Client information updated successfully.')
    ).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });
});
