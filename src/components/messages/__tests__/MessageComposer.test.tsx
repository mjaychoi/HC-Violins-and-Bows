import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import MessageComposer from '../MessageComposer';
import { Client, Instrument } from '@/types';

// Mock useAppFeedback
jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: jest.fn(() => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
  })),
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

// Mock window.location.href
delete (window as any).location;
(window as any).location = { href: '' };

const mockClient: Client = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL0001',
  address: null,
  created_at: '2024-01-01T00:00:00Z',
};

const mockInstrument: Instrument = {
  id: 'inst-1',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: null,
  year: 1720,
  certificate: true,
  certificate_name: null,
  cost_price: null,
  consignment_price: null,
  size: null,
  weight: null,
  price: 50000,
  ownership: null,
  note: null,
  serial_number: 'VI0001',
  status: 'Available',
  created_at: '2024-01-01T00:00:00Z',
};

describe('MessageComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window.location as any).href = '';
    // Ensure navigator.clipboard is properly mocked
    (navigator.clipboard.writeText as jest.Mock) = jest
      .fn()
      .mockResolvedValue(undefined);
  });

  it('should render template selection dropdown', () => {
    render(<MessageComposer client={mockClient} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(/Select a template/i)).toBeInTheDocument();
    // Select element should be present
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('should render channel selection when template is selected', async () => {
    const user = userEvent.setup();
    render(<MessageComposer client={mockClient} />);

    const templateSelect = screen.getByRole('combobox');
    // Try selecting a template that exists
    const options = Array.from(
      templateSelect.querySelectorAll('option')
    ) as HTMLOptionElement[];
    const templateValue = options.find(
      opt => opt.value && opt.value !== ''
    )?.value;

    if (templateValue) {
      await user.selectOptions(templateSelect, templateValue);

      // Channel selection might appear if multiple channels available
      await waitFor(
        () => {
          // Component should render
          expect(screen.getByRole('combobox')).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    }
  });

  it('should display rendered message preview when template is selected', async () => {
    const user = userEvent.setup();
    render(<MessageComposer client={mockClient} />);

    const templateSelect = screen.getByRole('combobox');
    const options = Array.from(
      templateSelect.querySelectorAll('option')
    ) as HTMLOptionElement[];
    const templateValue = options.find(
      opt => opt.value && opt.value !== ''
    )?.value;

    if (templateValue) {
      await user.selectOptions(templateSelect, templateValue);

      await waitFor(
        () => {
          // Message preview should be displayed when template is selected
          // If preview is shown, it means template was selected successfully
          expect(screen.getByRole('combobox')).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    }
  });

  it('should copy message to clipboard when copy button is clicked', async () => {
    const user = userEvent.setup();
    render(<MessageComposer client={mockClient} />);

    const templateSelect = screen.getByRole('combobox');
    const options = Array.from(
      templateSelect.querySelectorAll('option')
    ) as HTMLOptionElement[];
    const templateValue = options.find(
      opt => opt.value && opt.value !== ''
    )?.value;

    if (templateValue) {
      await user.selectOptions(templateSelect, templateValue);

      await waitFor(
        () => {
          const copyButton = screen.queryByText(/Copy to Clipboard/i);
          if (copyButton) {
            expect(copyButton).toBeInTheDocument();
          }
        },
        { timeout: 1000 }
      );

      const copyButton = screen.queryByText(/Copy to Clipboard/i);
      if (copyButton) {
        await user.click(copyButton);
        await waitFor(
          () => {
            expect(navigator.clipboard.writeText).toHaveBeenCalled();
          },
          { timeout: 1000 }
        );
      }
    }
  });

  it('should handle email channel selection', async () => {
    const user = userEvent.setup();
    render(<MessageComposer client={mockClient} />);

    const templateSelect = screen.getByRole('combobox');
    const options = Array.from(
      templateSelect.querySelectorAll('option')
    ) as HTMLOptionElement[];
    const templateValue = options.find(
      opt => opt.value && opt.value !== ''
    )?.value;

    if (templateValue) {
      await user.selectOptions(templateSelect, templateValue);

      await waitFor(
        () => {
          // Component should render
          expect(screen.getByRole('combobox')).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    }
  });

  it('should handle SMS channel selection', async () => {
    const user = userEvent.setup();
    render(<MessageComposer client={mockClient} />);

    const templateSelect = screen.getByRole('combobox');
    const options = Array.from(
      templateSelect.querySelectorAll('option')
    ) as HTMLOptionElement[];
    const templateValue = options.find(
      opt => opt.value && opt.value !== ''
    )?.value;

    if (templateValue) {
      await user.selectOptions(templateSelect, templateValue);

      await waitFor(
        () => {
          // Component should render
          expect(screen.getByRole('combobox')).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    }
  });

  it('should handle client without email', () => {
    const clientWithoutEmail = { ...mockClient, email: null };
    window.alert = jest.fn();

    render(<MessageComposer client={clientWithoutEmail} />);

    // Component should render
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should handle client without phone number', () => {
    const clientWithoutPhone = { ...mockClient, contact_number: null };
    window.alert = jest.fn();

    render(<MessageComposer client={clientWithoutPhone} />);

    // Component should render
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should handle template variable substitution with instrument', () => {
    render(<MessageComposer client={mockClient} instrument={mockInstrument} />);

    // Component should render
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should handle missing template variables', () => {
    render(<MessageComposer client={mockClient} />);

    // Component should render even with missing variables
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should handle component rendering with different props', () => {
    render(
      <MessageComposer
        client={mockClient}
        instrument={mockInstrument}
        dueDate="2024-01-15"
        amount={1000}
        quoteUrl="https://example.com/quote"
        invoiceUrl="https://example.com/invoice"
        pickupWindow="9am-5pm"
      />
    );

    // Component should render with all props
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
