import { render, screen, fireEvent } from '@/test-utils/render';
import { CustomerSearch } from '../CustomerSearch';

// Mock SearchInput
jest.mock('@/components/common/SearchInput', () => {
  return function MockSearchInput({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) {
    return (
      <input
        data-testid="search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  };
});

describe('CustomerSearch', () => {
  const mockProps = {
    searchTerm: '',
    onSearchChange: jest.fn(),
    tagFilter: null,
    onTagFilterChange: jest.fn(),
    sortBy: 'name' as const,
    onSortChange: jest.fn(),
    availableTags: ['VIP', 'Musician', 'Collector'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render search input', () => {
    render(<CustomerSearch {...mockProps} />);
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Search customers by name, email, or tag...')
    ).toBeInTheDocument();
  });

  it('should display "All" tag button', () => {
    render(<CustomerSearch {...mockProps} />);
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('should display available tags', () => {
    render(<CustomerSearch {...mockProps} />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Musician')).toBeInTheDocument();
    expect(screen.getByText('Collector')).toBeInTheDocument();
  });

  it('should highlight "All" button when tagFilter is null', () => {
    render(<CustomerSearch {...mockProps} tagFilter={null} />);
    const allButton = screen.getByText('All');
    // ✅ FIXED: 버튼 스타일이 bg-blue-600 text-white로 변경됨
    expect(allButton).toHaveClass('bg-blue-600', 'text-white');
  });

  it('should highlight selected tag button', () => {
    render(<CustomerSearch {...mockProps} tagFilter="VIP" />);
    const vipButton = screen.getByText('VIP');
    // ✅ FIXED: 버튼 스타일이 bg-blue-600 text-white로 변경됨
    expect(vipButton).toHaveClass('bg-blue-600', 'text-white');
  });

  it('should call onTagFilterChange when "All" button is clicked', () => {
    render(<CustomerSearch {...mockProps} tagFilter="VIP" />);
    const allButton = screen.getByText('All');
    fireEvent.click(allButton);
    expect(mockProps.onTagFilterChange).toHaveBeenCalledWith(null);
  });

  it('should call onTagFilterChange when tag button is clicked', () => {
    render(<CustomerSearch {...mockProps} tagFilter={null} />);
    const vipButton = screen.getByText('VIP');
    fireEvent.click(vipButton);
    expect(mockProps.onTagFilterChange).toHaveBeenCalledWith('VIP');
  });

  it('should toggle tag filter when same tag is clicked', () => {
    render(<CustomerSearch {...mockProps} tagFilter="VIP" />);
    const vipButton = screen.getByText('VIP');
    fireEvent.click(vipButton);
    expect(mockProps.onTagFilterChange).toHaveBeenCalledWith(null);
  });

  it('should display sort dropdown', () => {
    render(<CustomerSearch {...mockProps} />);
    const sortSelect = screen.getByDisplayValue('Name');
    expect(sortSelect).toBeInTheDocument();
  });

  it('should call onSortChange when sort option is changed', () => {
    render(<CustomerSearch {...mockProps} />);
    const sortSelect = screen.getByDisplayValue('Name');
    fireEvent.change(sortSelect, { target: { value: 'spend' } });
    expect(mockProps.onSortChange).toHaveBeenCalledWith('spend');
  });

  it('should display all sort options', () => {
    render(<CustomerSearch {...mockProps} />);
    const sortSelect = screen.getByDisplayValue('Name');
    expect(
      sortSelect.querySelector('option[value="name"]')
    ).toBeInTheDocument();
    expect(
      sortSelect.querySelector('option[value="spend"]')
    ).toBeInTheDocument();
    expect(
      sortSelect.querySelector('option[value="recent"]')
    ).toBeInTheDocument();
  });

  it('should handle empty availableTags array', () => {
    render(<CustomerSearch {...mockProps} availableTags={[]} />);
    // ✅ FIXED: availableTags가 빈 배열이면 topTags도 빈 배열이 되어 "All" 버튼이 렌더링되지 않음
    expect(screen.queryByText('All')).not.toBeInTheDocument();
    expect(screen.queryByText('VIP')).not.toBeInTheDocument();
  });

  it('should call onSearchChange when input changes', () => {
    render(<CustomerSearch {...mockProps} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'John' } });
    expect(mockProps.onSearchChange).toHaveBeenCalledWith('John');
  });
});
