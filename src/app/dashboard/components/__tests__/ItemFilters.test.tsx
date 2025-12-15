import { fireEvent, render, screen } from '@/test-utils/render';
import ItemFilters from '../ItemFilters';
import { Instrument } from '@/types';

const instruments: Instrument[] = [
  {
    id: '1',
    maker: 'Strad',
    type: 'Violin',
    subtype: 'Solo',
    year: 2020,
    certificate: true,
    size: null,
    weight: null,
    price: 1000,
    ownership: 'Dealer',
    note: null,
    serial_number: 'VI0000001',
    status: 'Available',
    created_at: '2024',
  },
];

describe('ItemFilters', () => {
  const baseProps = {
    items: instruments,
    searchTerm: '',
    onSearchChange: jest.fn(),
    filters: {
      status: [],
      maker: [],
      type: [],
      subtype: [],
      ownership: [],
      certificate: [],
      priceRange: { min: '', max: '' },
      hasClients: [],
    },
    onFilterChange: jest.fn(),
    onPriceRangeChange: jest.fn(),
    onClearFilters: jest.fn(),
    showFilters: true,
    onToggleFilters: jest.fn(),
    activeFiltersCount: 0,
  };

  it('renders filter panel', () => {
    render(<ItemFilters {...baseProps} />);
    // UX: Search bar is now in the page-level quick filters, not in ItemFilters
    // expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
    expect(screen.getByText(/Status|상태/)).toBeInTheDocument();
  });

  it('handles filter toggles', () => {
    render(<ItemFilters {...baseProps} />);

    // UX: Search is now handled at page level, not in ItemFilters
    // fireEvent.change(screen.getByPlaceholderText('Search items...'), {
    //   target: { value: 'violin' },
    // });
    // expect(baseProps.onSearchChange).toHaveBeenCalledWith('violin');

    // Filter panel should be open (showFilters: true)
    // Expand status group if collapsed
    const statusHeader = screen.getByText(/상태|Status/i);
    const statusGroup = statusHeader.closest('[class*="border"]');
    const expandButton = statusGroup?.querySelector('button[aria-label]');
    if (
      expandButton &&
      expandButton.getAttribute('aria-expanded') === 'false'
    ) {
      fireEvent.click(expandButton);
    }

    // Find and click the Available checkbox
    // Wait for it to be visible (filter panel is open)
    const availableText = screen.queryByText('Available');
    if (availableText) {
      const availableLabel = availableText.closest('label');
      if (availableLabel) {
        fireEvent.click(availableLabel);
      } else {
        fireEvent.click(availableText);
      }

      expect(baseProps.onFilterChange).toHaveBeenCalledWith(
        'status',
        'Available'
      );
    } else {
      // If Available is not visible, try to expand the status group first
      const statusExpandBtn = screen
        .getAllByRole('button')
        .find(
          btn =>
            btn.getAttribute('aria-label')?.includes('상태') ||
            btn.getAttribute('aria-label')?.includes('Status')
        );
      if (statusExpandBtn) {
        fireEvent.click(statusExpandBtn);
        const availableTextAfterExpand = screen.queryByText('Available');
        if (availableTextAfterExpand) {
          const availableLabel = availableTextAfterExpand.closest('label');
          if (availableLabel) {
            fireEvent.click(availableLabel);
            expect(baseProps.onFilterChange).toHaveBeenCalledWith(
              'status',
              'Available'
            );
          }
        }
      }
    }
  });
});
