import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
import '@testing-library/jest-dom';
import ClientList from '../ClientList';
import type { Client, ClientInstrument } from '@/types';

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({
    canManageClients: true,
  })),
}));

jest.mock('@/components/common', () => {
  const actual = jest.requireActual('@/components/common');
  return {
    __esModule: true,
    ...actual,
    EmptyState: ({ title, description }: any) => (
      <div data-testid="empty-state">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    ),
    Pagination: () => null,
  };
});

const T0 = '2024-01-01T00:00:00.000Z';

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    contact_number: '555-0100',
    tags: ['Owner', 'Musician'],
    interest: 'Active',
    note: 'Old',
    client_number: 'CL001',
    created_at: T0,
    updated_at: T0,
    ...overrides,
  };
}

const baseProps = {
  clientInstruments: [] as ClientInstrument[],
  onClientClick: jest.fn(),
  onColumnSort: jest.fn(),
  getSortArrow: jest.fn(() => ''),
};

function openQuickEdit() {
  fireEvent.click(screen.getByLabelText('More actions'));
  fireEvent.click(screen.getByText('Quick edit'));
}

function saveQuickEdit() {
  fireEvent.click(screen.getByTitle('Save changes'));
}

describe('ClientList tag preservation (V2-003)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes quick-edit tags from the existing Client', () => {
    render(
      <ClientList
        {...baseProps}
        clients={[makeClient()]}
        onUpdateClient={jest.fn()}
      />
    );

    openQuickEdit();

    expect(screen.getByRole('checkbox', { name: 'Owner' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Musician' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dealer' })).not.toBeChecked();
  });

  it('preserves existing tags when saving an unrelated field change', async () => {
    const onUpdateClient = jest.fn().mockResolvedValue(undefined);
    render(
      <ClientList
        {...baseProps}
        clients={[makeClient()]}
        onUpdateClient={onUpdateClient}
      />
    );

    openQuickEdit();
    fireEvent.change(screen.getByLabelText('Contact number'), {
      target: { value: '555-0199' },
    });
    saveQuickEdit();

    await waitFor(() => {
      expect(onUpdateClient).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          contact_number: '555-0199',
          tags: ['Owner', 'Musician'],
        })
      );
    });
  });

  it('submits the added tag when the user checks one', async () => {
    const onUpdateClient = jest.fn().mockResolvedValue(undefined);
    render(
      <ClientList
        {...baseProps}
        clients={[makeClient({ tags: ['Owner'] })]}
        onUpdateClient={onUpdateClient}
      />
    );

    openQuickEdit();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Musician' }));
    saveQuickEdit();

    await waitFor(() => {
      expect(onUpdateClient).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          tags: ['Owner', 'Musician'],
        })
      );
    });
  });

  it('submits the remaining tags when the user removes one', async () => {
    const onUpdateClient = jest.fn().mockResolvedValue(undefined);
    render(
      <ClientList
        {...baseProps}
        clients={[makeClient()]}
        onUpdateClient={onUpdateClient}
      />
    );

    openQuickEdit();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Owner' }));
    saveQuickEdit();

    await waitFor(() => {
      expect(onUpdateClient).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          tags: ['Musician'],
        })
      );
    });
  });

  it('allows clearing every tag through the existing checkboxes', async () => {
    const onUpdateClient = jest.fn().mockResolvedValue(undefined);
    render(
      <ClientList
        {...baseProps}
        clients={[makeClient()]}
        onUpdateClient={onUpdateClient}
      />
    );

    openQuickEdit();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Owner' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Musician' }));
    saveQuickEdit();

    await waitFor(() => {
      expect(onUpdateClient).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          tags: [],
        })
      );
    });
  });

  it('reinitializes tags when switching from Client A to Client B', () => {
    const clientA = makeClient({ id: 'a', first_name: 'Ann', tags: ['Owner'] });
    const clientB = makeClient({
      id: 'b',
      first_name: 'Ben',
      last_name: 'Smith',
      tags: ['Musician', 'Dealer'],
    });

    render(
      <ClientList
        {...baseProps}
        clients={[clientA, clientB]}
        onUpdateClient={jest.fn()}
      />
    );

    fireEvent.click(screen.getAllByLabelText('More actions')[0]);
    fireEvent.click(screen.getByText('Quick edit'));
    expect(screen.getByRole('checkbox', { name: 'Owner' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Musician' })
    ).not.toBeChecked();

    fireEvent.click(screen.getByTitle('Cancel editing'));

    fireEvent.click(screen.getAllByLabelText('More actions')[1]);
    fireEvent.click(screen.getByText('Quick edit'));
    expect(screen.getByRole('checkbox', { name: 'Owner' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Musician' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dealer' })).toBeChecked();
  });
});
