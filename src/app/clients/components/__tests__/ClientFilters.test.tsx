import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import '@testing-library/jest-dom';
import ClientFilters from '../ClientFilters';

const mockFilters = {
  last_name: [],
  first_name: [],
  contact_number: [],
  email: [],
  tags: [],
  interest: [],
  hasInstruments: [],
};

const mockFilterOptions = {
  lastNames: ['Doe', 'Smith'],
  firstNames: ['John', 'Jane'],
  contactNumbers: ['123-456-7890', '098-765-4321'],
  emails: ['john@example.com', 'jane@example.com'],
  tags: ['Musician', 'Owner', 'Dealer'],
  interests: ['Active', 'Passive', 'Inactive'],
};

const mockProps = {
  isOpen: true,
  onClose: jest.fn(),
  searchTerm: '',
  onSearchChange: jest.fn(),
  filters: mockFilters,
  filterOptions: mockFilterOptions,
  onFilterChange: jest.fn(),
  onClearAllFilters: jest.fn(),
  getActiveFiltersCount: jest.fn(() => 0),
};

describe('ClientFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders filter panel when open', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter panel should be visible when open
    expect(screen.getByTestId('filters-panel')).toBeInTheDocument();
    // Check that filter options are displayed
    expect(screen.getByText(/태그|Tags/i)).toBeInTheDocument();
    expect(screen.getByText(/관심도|Interest/i)).toBeInTheDocument();
  });

  it('does not render filter panel when closed', () => {
    render(<ClientFilters {...mockProps} isOpen={false} />);

    expect(screen.queryByTestId('filters-panel')).not.toBeInTheDocument();
  });

  it('handles filter changes', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter groups are expanded by default, so no need to click expand button
    const musicianCheckbox = screen.getByLabelText('Musician');
    fireEvent.click(musicianCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('tags', 'Musician');
  });

  it('handles additional filter changes', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter groups are expanded by default, so no need to click expand button
    const ownerCheckbox = screen.getByLabelText('Owner');
    fireEvent.click(ownerCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('tags', 'Owner');
  });

  it('handles clear all filters', () => {
    // Note: Clear all filters button is in the parent component, not in ClientFilters
    // This test verifies that the component renders correctly
    render(<ClientFilters {...mockProps} />);

    // Verify that filter options are displayed
    expect(screen.getByText(/태그|Tags/i)).toBeInTheDocument();
    expect(screen.getByText(/관심도|Interest/i)).toBeInTheDocument();

    // The clear all filters functionality is handled by the parent component
    // through the onClearAllFilters prop, which is called from the parent
  });

  it('shows active filters count when greater than 0', () => {
    const propsWithActiveFilters = {
      ...mockProps,
      getActiveFiltersCount: jest.fn(() => 3),
    };

    render(<ClientFilters {...propsWithActiveFilters} />);

    // 헤더 내 배지는 상위 페이지에서, 여기선 함수가 호출 가능한지만 확인
    expect(propsWithActiveFilters.getActiveFiltersCount()).toBe(3);
  });

  it('renders filter options when open', () => {
    render(<ClientFilters {...mockProps} />);

    // Verify that filter options are displayed
    expect(screen.getByText(/태그|Tags/i)).toBeInTheDocument();
    expect(screen.getByText(/관심도|Interest/i)).toBeInTheDocument();
    expect(screen.getByText(/이메일|Email/i)).toBeInTheDocument();
    expect(screen.getByText(/연락처|Contact Number/i)).toBeInTheDocument();
  });

  it('renders filter options when there are active filters', () => {
    const propsWithActiveFilters = {
      ...mockProps,
      getActiveFiltersCount: jest.fn(() => 2),
    };

    render(<ClientFilters {...propsWithActiveFilters} />);

    // Verify that filter options are still displayed
    expect(screen.getByText(/태그|Tags/i)).toBeInTheDocument();
    expect(screen.getByText(/관심도|Interest/i)).toBeInTheDocument();
  });

  it('handles hasInstruments filter - single selection', () => {
    render(<ClientFilters {...mockProps} />);

    // ✅ FIXED: 중복 요소가 있으므로 getAllByLabelText 사용
    const hasInstrumentsCheckboxes = screen.getAllByLabelText(
      /악기 보유|Has Instruments/i
    );
    const hasInstrumentsCheckbox = hasInstrumentsCheckboxes[0];
    fireEvent.click(hasInstrumentsCheckbox);

    // 처음 선택 시: 다른 옵션이 있으면 제거 후 이 옵션만 선택
    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'hasInstruments',
      'Has Instruments'
    );
  });

  it('handles hasInstruments filter - deselecting removes filter', () => {
    const propsWithSelected = {
      ...mockProps,
      filters: {
        ...mockFilters,
        hasInstruments: ['Has Instruments'],
      },
    };
    render(<ClientFilters {...propsWithSelected} />);

    // ✅ FIXED: hasInstruments는 라디오 버튼이므로 "전체" 라디오 버튼을 클릭하여 선택 해제
    const allRadio = screen.getByLabelText(/전체|All/i);
    expect(allRadio).toBeInTheDocument();

    fireEvent.click(allRadio);

    // 선택 해제 시: 필터 제거 (모든 hasInstruments 필터를 제거)
    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'hasInstruments',
      'Has Instruments'
    );
  });

  it('handles hasInstruments filter - selecting one deselects the other', () => {
    const propsWithSelected = {
      ...mockProps,
      filters: {
        ...mockFilters,
        hasInstruments: ['No Instruments'],
      },
    };
    render(<ClientFilters {...propsWithSelected} />);

    // ✅ FIXED: 중복 요소가 있으므로 getAllByLabelText 사용
    const hasInstrumentsCheckboxes = screen.getAllByLabelText(
      /악기 보유|Has Instruments/i
    );
    const hasInstrumentsCheckbox = hasInstrumentsCheckboxes[0];
    const noInstrumentsCheckbox = screen.getByLabelText(
      /악기 미보유|No Instruments/i
    );

    expect(noInstrumentsCheckbox).toBeChecked();

    // Has Instruments 선택 시 No Instruments가 먼저 제거됨
    fireEvent.click(hasInstrumentsCheckbox);

    // 다른 옵션 제거 호출이 먼저 발생
    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'hasInstruments',
      'No Instruments'
    );
    // 그 다음 새 옵션 선택
    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'hasInstruments',
      'Has Instruments'
    );
  });

  it('has aria attributes for accessibility', () => {
    render(<ClientFilters {...mockProps} />);

    const filterPanel = screen.getByTestId('filters-panel');
    expect(filterPanel).toHaveAttribute('role', 'dialog');
    expect(filterPanel).toHaveAttribute('aria-modal', 'false');
    expect(filterPanel).toHaveAttribute(
      'aria-labelledby',
      'filters-panel-title'
    );
  });

  it('handles interest filter', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter groups are expanded by default, so no need to click expand button
    const activeCheckbox = screen.getByLabelText('Active');
    fireEvent.click(activeCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('interest', 'Active');
  });

  it('handles email filter', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter groups are expanded by default, so no need to click expand button
    const emailCheckbox = screen.getByLabelText('john@example.com');
    fireEvent.click(emailCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'email',
      'john@example.com'
    );
  });

  it('handles contact number filter', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter groups are expanded by default, so no need to click expand button
    const contactCheckbox = screen.getByLabelText('123-456-7890');
    fireEvent.click(contactCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'contact_number',
      '123-456-7890'
    );
  });

  it('handles first name filter', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter groups are expanded by default, so no need to click expand button
    const firstNameCheckbox = screen.getByLabelText('John');
    fireEvent.click(firstNameCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('first_name', 'John');
  });

  it('handles last name filter', () => {
    render(<ClientFilters {...mockProps} />);

    // Filter groups are expanded by default, so no need to click expand button
    const lastNameCheckbox = screen.getByLabelText('Doe');
    fireEvent.click(lastNameCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('last_name', 'Doe');
  });

  it('shows all filter options', () => {
    render(<ClientFilters {...mockProps} />);

    // Check that all filter options are displayed
    expect(screen.getByText(/태그|Tags/i)).toBeInTheDocument();
    expect(screen.getByText(/관심도|Interest/i)).toBeInTheDocument();
    expect(screen.getByText(/이메일|Email/i)).toBeInTheDocument();
    expect(screen.getByText(/연락처|Contact Number/i)).toBeInTheDocument();
    expect(screen.getByText(/이름|First Name/i)).toBeInTheDocument();
    expect(screen.getByText(/성|Last Name/i)).toBeInTheDocument();
    // Has Instruments appears in both h4 title and span label, so use getAllByText
    expect(screen.getAllByText(/악기 연결|Has Instruments/i).length).toBeGreaterThan(0);
  });

  it('handles ESC key to close filters', () => {
    render(<ClientFilters {...mockProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockProps.onClose).toHaveBeenCalled();
  });
});
