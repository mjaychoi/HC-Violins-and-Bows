import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act } from '@/test-utils/render';
import { AdvancedSearch } from '@/components/common/inputs';

describe('AdvancedSearch', () => {
  const baseProps = {
    dateRange: null,
    onDateRangeChange: jest.fn(),
    operator: 'AND' as const,
    onOperatorChange: jest.fn(),
    onApply: jest.fn(),
    onReset: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('toggles popover and shows badge when filters active', () => {
    const { rerender } = render(<AdvancedSearch {...baseProps} />);

    // Opens popover
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Advanced Search')).toBeInTheDocument();

    // No badge when empty
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(
      <AdvancedSearch {...baseProps} dateRange={{ from: '2024-01-01' }} />
    );

    // Badge rendered via the absolute span (not role), so check via query selector
    expect(document.querySelector('span.bg-blue-600')).toBeInTheDocument();
  });

  it('calls onDateRangeChange for from/to inputs and clear', () => {
    render(
      <AdvancedSearch {...baseProps} dateRange={{ from: '2024-01-01' }} />
    );
    const toggle = document.querySelector('button');
    if (toggle) {
      act(() => {
        fireEvent.click(toggle);
        if (!screen.queryByText('Advanced Search')) {
          fireEvent.click(toggle);
        }
      });
    }
    expect(screen.getByText('Advanced Search')).toBeInTheDocument();

    const inputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2024-02-01' } });
    fireEvent.change(inputs[1], { target: { value: '2024-02-10' } });
    expect(baseProps.onDateRangeChange).toHaveBeenNthCalledWith(1, {
      from: '2024-02-01',
      to: undefined,
    });
    expect(baseProps.onDateRangeChange).toHaveBeenNthCalledWith(2, {
      from: '2024-01-01',
      to: '2024-02-10',
    });

    // Clear button appears when active
    fireEvent.click(screen.getByText(/Clear Date Range/i));
    expect(baseProps.onDateRangeChange).toHaveBeenCalledWith(null);
  });

  it('calls onApply/onReset', async () => {
    render(
      <AdvancedSearch
        {...baseProps}
        dateRange={{ from: '2024-01-01', to: '2024-01-02' }}
      />
    );

    fireEvent.click(screen.getByTestId('advanced-search-toggle'));
    await screen.findByText('Advanced Search');

    // Operator selection UI has been removed - only date range filter is used
    // Test onReset and onApply instead
    fireEvent.click(screen.getByText('Reset'));
    expect(baseProps.onReset).toHaveBeenCalled();

    const applyBtn = screen.getByTestId('advanced-search-apply');
    fireEvent.click(applyBtn);
    expect(baseProps.onApply).toHaveBeenCalled();
  });
});
