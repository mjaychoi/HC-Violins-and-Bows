import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClientSearch from '../ClientSearch';

// Mock fetch API (replacing direct Supabase calls)
global.fetch = jest.fn();

jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
}));

const mockClients = [
  {
    id: '1',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    contact_number: '010-1234-5678',
    tags: [],
    interest: 'Active',
    note: null,
    client_number: 'CL001',
    created_at: '2024-01-01',
    type: 'Musician' as const,
    status: 'Active' as const,
  },
];

describe('ClientSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: mockClients,
        count: mockClients.length,
      }),
    });
  });

  it('opens search, performs query, and adds client', async () => {
    const onClientsChange = jest.fn();
    render(<ClientSearch selectedClients={[]} onClientsChange={onClientsChange} />);

    fireEvent.click(screen.getByText('Add Client'));
    fireEvent.change(
      screen.getByPlaceholderText(/Search by first or last name/i),
      { target: { value: 'ja' } }
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const resultRow = await screen.findByText('Jane Doe');
    fireEvent.click(resultRow);

    expect(onClientsChange).toHaveBeenCalledWith([
      {
        client: expect.objectContaining({ first_name: 'Jane' }),
        relationshipType: 'Interested',
      },
    ]);
  });

  it('updates relationship and removes client', () => {
    const selected = [
      { client: mockClients[0], relationshipType: 'Interested' as const },
    ];
    const onClientsChange = jest.fn();
    render(
      <ClientSearch selectedClients={selected} onClientsChange={onClientsChange} />
    );

    fireEvent.change(screen.getByDisplayValue('Interested'), {
      target: { value: 'Owned' },
    });
    expect(onClientsChange).toHaveBeenCalledWith([
      { client: mockClients[0], relationshipType: 'Owned' },
    ]);

    fireEvent.click(screen.getByTitle('Remove client'));
    expect(onClientsChange).toHaveBeenCalledWith([]);
  });
});
