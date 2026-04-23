import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
  it('renders default title and description when no props provided', () => {
    render(<EmptyState />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No items yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add your first item to get started.')
    ).toBeInTheDocument();
  });

  it('renders filter empty state when hasActiveFilters is true', () => {
    const handleReset = jest.fn();

    render(<EmptyState hasActiveFilters={true} onResetFilters={handleReset} />);

    expect(
      screen.getByText('No items found matching your filters')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Try adjusting your filters or clearing them to see all items.'
      )
    ).toBeInTheDocument();

    const clearButton = screen.getByText('Clear filters');
    fireEvent.click(clearButton);
    expect(handleReset).toHaveBeenCalled();
  });

  it('calls actionButton.onClick when clicked without guideSteps', () => {
    const handleAction = jest.fn();

    render(
      <EmptyState actionButton={{ label: 'Add Item', onClick: handleAction }} />
    );

    const button = screen.getByText('Add Item');
    fireEvent.click(button);
    expect(handleAction).toHaveBeenCalled();
  });

  it('opens guide modal when guideSteps are provided and calls action on close', () => {
    const handleAction = jest.fn();
    const guideSteps = [
      'Enter instrument details (maker, type, serial number, etc.)',
      'Set price and status',
    ];

    render(
      <EmptyState
        actionButton={{ label: 'Get started', onClick: handleAction }}
        guideSteps={guideSteps}
      />
    );

    expect(
      screen.queryByText('다음 단계를 따라 첫 악기를 추가해보세요:')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Get started'));

    expect(
      screen.getByText('다음 단계를 따라 첫 악기를 추가해보세요:')
    ).toBeInTheDocument();
    const guideStepElements = screen.getAllByText(
      'Enter instrument details (maker, type, serial number, etc.)'
    );
    expect(guideStepElements.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('시작하기'));
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('calls onLoadSampleData when sample data button is clicked', () => {
    const handleLoadSampleData = jest.fn();

    render(<EmptyState onLoadSampleData={handleLoadSampleData} />);

    const sampleButton = screen.getByText('Start with sample data');
    fireEvent.click(sampleButton);
    expect(handleLoadSampleData).toHaveBeenCalled();
  });

  it('calls helpLink.onClick when help link is clicked', () => {
    const handleHelpClick = jest.fn((e?: React.MouseEvent) => {
      if (e) e.preventDefault();
    });

    render(
      <EmptyState
        helpLink={{
          label: 'Learn how to add an instrument',
          href: '#',
          onClick: handleHelpClick,
        }}
      />
    );

    const link = screen.getByText('Learn how to add an instrument');
    fireEvent.click(link);
    expect(handleHelpClick).toHaveBeenCalled();
  });
});
