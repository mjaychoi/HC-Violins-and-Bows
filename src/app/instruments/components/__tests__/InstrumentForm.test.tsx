import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstrumentForm from '../InstrumentForm';

// Mock fetch API (replacing direct Supabase calls)
global.fetch = jest.fn();

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  onSubmit: jest.fn().mockResolvedValue(undefined),
  submitting: false,
};

describe('InstrumentForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [],
        count: 0,
      }),
    });
  });

  it('submits form data', async () => {
    render(<InstrumentForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Maker'), {
      target: { value: 'Stradivari' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Violin' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
      target: { value: '2020' },
    });

    fireEvent.click(screen.getByText('Add Instrument'));

    await waitFor(() =>
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        maker: 'Stradivari',
        name: 'Violin',
        year: '2020',
      })
    );
  });

  it('shows client search, queries API, and hides search', async () => {
    render(<InstrumentForm {...defaultProps} />);

    fireEvent.click(screen.getByText('Add Client'));
    fireEvent.change(
      screen.getByPlaceholderText(/Search by first or last name/i),
      { target: { value: 'Ja' } }
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
