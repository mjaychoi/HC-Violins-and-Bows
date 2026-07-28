import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act } from '@/test-utils/render';
import { AdvancedSearch } from '@/components/common/inputs';

describe('AdvancedSearch', () => {
  const baseProps = {
    dateRange: null,
    onDateRangeChange: jest.fn(),
    onApply: jest.fn(),
    onReset: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const openPopover = () => {
    fireEvent.click(screen.getByTestId('advanced-search-toggle'));
    expect(screen.getByText('Advanced Search')).toBeInTheDocument();
  };

  it('toggles popover and shows badge when filters active', () => {
    const { rerender } = render(<AdvancedSearch {...baseProps} />);

    openPopover();

    rerender(
      <AdvancedSearch {...baseProps} dateRange={{ from: '2024-01-01' }} />
    );

    expect(document.querySelector('span.bg-blue-600')).toBeInTheDocument();
  });

  it('calls onDateRangeChange for from/to inputs and clear', () => {
    render(
      <AdvancedSearch {...baseProps} dateRange={{ from: '2024-01-01' }} />
    );
    openPopover();

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

    fireEvent.click(screen.getByText(/Clear Date Range/i));
    expect(baseProps.onDateRangeChange).toHaveBeenCalledWith(null);
  });

  it('does not render operator selector when callback is absent', () => {
    render(
      <AdvancedSearch
        {...baseProps}
        operator="OR"
        dateFields={[{ field: 'due_date', label: 'Due' }]}
      />
    );
    openPopover();

    expect(
      screen.queryByTestId('advanced-search-date-operator')
    ).not.toBeInTheDocument();
  });

  it('renders operator selector when operator and callback are supplied', () => {
    const onOperatorChange = jest.fn();
    render(
      <AdvancedSearch
        {...baseProps}
        operator="OR"
        onOperatorChange={onOperatorChange}
        dateFields={[
          { field: 'due_date', label: 'Due' },
          { field: 'scheduled_date', label: 'Scheduled' },
        ]}
      />
    );
    openPopover();

    const selector = screen.getByTestId('advanced-search-date-operator');
    expect(selector).toBeInTheDocument();
    expect(selector).toHaveAttribute('aria-label', 'Date matching rule');
    expect(screen.getByText(/Applies to:/)).toHaveTextContent('Due, Scheduled');
  });

  it('selecting "Any date matches" emits OR', () => {
    const onOperatorChange = jest.fn();
    render(
      <AdvancedSearch
        {...baseProps}
        operator="AND"
        onOperatorChange={onOperatorChange}
      />
    );
    openPopover();

    fireEvent.change(screen.getByTestId('advanced-search-date-operator'), {
      target: { value: 'OR' },
    });

    expect(onOperatorChange).toHaveBeenCalledWith('OR');
  });

  it('selecting "All populated dates match" emits AND', () => {
    const onOperatorChange = jest.fn();
    render(
      <AdvancedSearch
        {...baseProps}
        operator="OR"
        onOperatorChange={onOperatorChange}
      />
    );
    openPopover();

    fireEvent.change(screen.getByTestId('advanced-search-date-operator'), {
      target: { value: 'AND' },
    });

    expect(onOperatorChange).toHaveBeenCalledWith('AND');
  });

  it('operator controls are keyboard-accessible and correctly labelled', () => {
    render(
      <AdvancedSearch
        {...baseProps}
        operator="OR"
        onOperatorChange={jest.fn()}
      />
    );
    openPopover();

    const selector = screen.getByLabelText('Date matching rule');
    expect(selector.tagName).toBe('SELECT');
    expect(screen.getByText('Any date matches')).toBeInTheDocument();
    expect(screen.getByText('All populated dates match')).toBeInTheDocument();
  });

  it('calls onApply/onReset', async () => {
    render(
      <AdvancedSearch
        {...baseProps}
        dateRange={{ from: '2024-01-01', to: '2024-01-02' }}
      />
    );

    act(() => {
      fireEvent.click(screen.getByTestId('advanced-search-toggle'));
    });
    await screen.findByText('Advanced Search');

    fireEvent.click(screen.getByText('Reset'));
    expect(baseProps.onReset).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('advanced-search-apply'));
    expect(baseProps.onApply).toHaveBeenCalled();
  });
});
