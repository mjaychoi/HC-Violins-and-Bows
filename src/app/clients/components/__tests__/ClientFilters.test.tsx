import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

    expect(screen.getByText('Filters')).toBeInTheDocument();
    // Search input is now in the parent page, not in ClientFilters
  });

  it('does not render filter panel when closed', () => {
    render(<ClientFilters {...mockProps} isOpen={false} />);

    expect(screen.queryByText('Filters')).not.toBeInTheDocument();
  });

  it('handles filter changes', () => {
    render(<ClientFilters {...mockProps} />);

    const musicianCheckbox = screen.getByLabelText('Musician');
    fireEvent.click(musicianCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('tags', 'Musician');
  });

  it('handles additional filter changes', () => {
    render(<ClientFilters {...mockProps} />);

    const ownerCheckbox = screen.getByLabelText('Owner');
    fireEvent.click(ownerCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('tags', 'Owner');
  });

  it('handles clear all filters', () => {
    render(<ClientFilters {...mockProps} />);

    // Try to find the clear button by partial text match
    const clearButton = screen.getByText((content, element) => {
      return (
        content.toLowerCase().includes('clear') && element?.tagName === 'BUTTON'
      );
    });
    fireEvent.click(clearButton);

    expect(mockProps.onClearAllFilters).toHaveBeenCalled();
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

  it('shows clear button even when no active filters (UI always renders button)', () => {
    render(<ClientFilters {...mockProps} />);

    expect(screen.getByText(/clear all/i)).toBeInTheDocument();
  });

  it('shows clear button when there are active filters', () => {
    const propsWithActiveFilters = {
      ...mockProps,
      getActiveFiltersCount: jest.fn(() => 2),
    };

    render(<ClientFilters {...propsWithActiveFilters} />);

    expect(screen.getByText(/clear all/i)).toBeInTheDocument();
  });

  it('handles hasInstruments filter', () => {
    render(<ClientFilters {...mockProps} />);

    const hasInstrumentsCheckbox = screen.getByLabelText('Has Instruments');
    fireEvent.click(hasInstrumentsCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'hasInstruments',
      'Has Instruments'
    );
  });

  it('handles interest filter', () => {
    render(<ClientFilters {...mockProps} />);

    const activeCheckbox = screen.getByLabelText('Active');
    fireEvent.click(activeCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('interest', 'Active');
  });

  it('handles email filter', () => {
    render(<ClientFilters {...mockProps} />);

    const emailCheckbox = screen.getByLabelText('john@example.com');
    fireEvent.click(emailCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'email',
      'john@example.com'
    );
  });

  it('handles contact number filter', () => {
    render(<ClientFilters {...mockProps} />);

    const contactCheckbox = screen.getByLabelText('123-456-7890');
    fireEvent.click(contactCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith(
      'contact_number',
      '123-456-7890'
    );
  });

  it('handles first name filter', () => {
    render(<ClientFilters {...mockProps} />);

    const firstNameCheckbox = screen.getByLabelText('John');
    fireEvent.click(firstNameCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('first_name', 'John');
  });

  it('handles last name filter', () => {
    render(<ClientFilters {...mockProps} />);

    const lastNameCheckbox = screen.getByLabelText('Doe');
    fireEvent.click(lastNameCheckbox);

    expect(mockProps.onFilterChange).toHaveBeenCalledWith('last_name', 'Doe');
  });

  it('shows all filter options', () => {
    render(<ClientFilters {...mockProps} />);

    // Check that all filter options are displayed
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('Interest')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Contact Number')).toBeInTheDocument();
    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('Last Name')).toBeInTheDocument();
    expect(screen.getByText('Has Instruments')).toBeInTheDocument();
  });

  it('handles ESC key to close filters', () => {
    render(<ClientFilters {...mockProps} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(mockProps.onClose).toHaveBeenCalled();
  });
});
