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
      '악기 정보를 입력하세요 (Maker, Type, Serial Number 등)',
      '가격과 상태를 설정하세요',
    ];

    render(
      <EmptyState
        actionButton={{ label: '시작하기', onClick: handleAction }}
        guideSteps={guideSteps}
      />
    );

    // 처음에는 모달이 보이지 않음
    expect(
      screen.queryByText('다음 단계를 따라 첫 악기를 추가해보세요:')
    ).not.toBeInTheDocument();

    // 버튼 클릭 시 가이드 모달 열림
    fireEvent.click(screen.getByText('시작하기'));

    expect(
      screen.getByText('다음 단계를 따라 첫 악기를 추가해보세요:')
    ).toBeInTheDocument();
    const guideStepElements = screen.getAllByText(
      '악기 정보를 입력하세요 (Maker, Type, Serial Number 등)'
    );
    expect(guideStepElements.length).toBeGreaterThan(0);

    // 모달의 "시작하기" 버튼 클릭 시 onClose가 호출되고, 그 안에서 actionButton.onClick이 다시 호출됨
    const actionButtons = screen.getAllByText('시작하기');
    fireEvent.click(actionButtons[1]);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('calls onLoadSampleData when sample data button is clicked', () => {
    const handleLoadSampleData = jest.fn();

    render(<EmptyState onLoadSampleData={handleLoadSampleData} />);

    const sampleButton = screen.getByText('샘플 데이터로 시작하기');
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
          label: '악기 추가 방법 알아보기',
          href: '#',
          onClick: handleHelpClick,
        }}
      />
    );

    const link = screen.getByText('악기 추가 방법 알아보기');
    fireEvent.click(link);
    expect(handleHelpClick).toHaveBeenCalled();
  });
});
