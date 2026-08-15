import React, { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import ClientModal from '../ClientModal';
import { useClientView } from '../../hooks/useClientView';
import type { Client } from '@/types';

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => ({ tenantIdentityKey: 'tenant-a' }),
}));

const T0 = '2024-01-01T00:00:00.000Z';

const taggedClient: Client = {
  id: 'c1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  contact_number: 'P0',
  tags: ['Owner', 'Musician'],
  interest: 'Active',
  note: 'Old',
  client_number: null,
  created_at: T0,
  updated_at: T0,
};

const onSave = jest.fn().mockResolvedValue(undefined);

function EditHarness({ client }: { client: Client }) {
  const view = useClientView();

  useEffect(() => {
    view.openClientView(client, true);
    // openClientView is not memoized; bind to the opened Client identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  if (!view.showViewModal || !view.selectedClient) {
    return null;
  }

  return (
    <ClientModal
      isOpen={view.showViewModal}
      onClose={view.closeClientView}
      client={view.selectedClient}
      isEditing={view.isEditing}
      onEdit={view.startEditing}
      onSave={onSave}
      onDelete={jest.fn()}
      onCancel={view.stopEditing}
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
      viewFormData={view.viewFormData}
      showInterestDropdown={view.showInterestDropdown}
      onViewInputChange={view.handleViewInputChange}
      onUpdateViewFormData={view.updateViewFormData}
    />
  );
}

describe('ClientModal tag preservation (V2-003)', () => {
  beforeEach(() => {
    onSave.mockClear();
  });

  it('saves existing tags when only the note changes', async () => {
    render(<EditHarness client={taggedClient} />);

    expect(
      await screen.findByRole('checkbox', { name: 'Owner' })
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Musician' })).toBeChecked();

    fireEvent.change(
      screen.getByPlaceholderText('Enter any additional notes'),
      {
        target: { value: 'New' },
      }
    );
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          note: 'New',
          tags: ['Owner', 'Musician'],
        })
      );
    });
  });

  it('saves an intentionally added tag', async () => {
    render(<EditHarness client={{ ...taggedClient, tags: ['Owner'] }} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Musician' }));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['Owner', 'Musician'],
        })
      );
    });
  });

  it('saves an intentionally removed tag', async () => {
    render(<EditHarness client={taggedClient} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Owner' }));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['Musician'],
        })
      );
    });
  });

  it('saves an intentionally cleared tag set', async () => {
    render(<EditHarness client={taggedClient} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Owner' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Musician' }));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [],
        })
      );
    });
  });
});
