import React from 'react';
import { render, screen } from '@/test-utils/render';
import ClientForm from '../ClientForm';

jest.mock('@/hooks/useDataState', () => ({
  useDataState: jest.fn(() => ({
    data: [],
    addItem: jest.fn(),
    removeItem: jest.fn(),
    clearData: jest.fn(),
    setItems: jest.fn(),
  })),
}));

jest.mock('@/hooks/useDataFetching', () => ({
  useDataFetching: jest.fn(() => ({
    fetchData: jest.fn(),
    loading: false,
    items: [],
  })),
}));

describe('ClientForm create tag default (V2-003)', () => {
  it('starts create with empty tags and does not inherit a prior Client', () => {
    render(
      <ClientForm
        isOpen={true}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        onRetryInstrumentLinks={jest.fn()}
        submitting={false}
      />
    );

    expect(screen.getByText('Add New Client')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Owner' })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Musician' })
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dealer' })).not.toBeChecked();
  });
});
