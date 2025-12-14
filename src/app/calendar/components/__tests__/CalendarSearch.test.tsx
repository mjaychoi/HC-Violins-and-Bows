import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import CalendarSearch from '../CalendarSearch';

// Mock SearchInput component
jest.mock('@/components/common/SearchInput', () => {
  return function MockSearchInput({
    value,
    onChange,
    placeholder,
    ...props
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    debounceMs?: number;
  }) {
    return (
      <div>
        <input
          data-testid="search-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          {...props}
        />
        {value && (
          <button
            data-testid="clear-button"
            onClick={() => onChange('')}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>
    );
  };
});

describe('CalendarSearch', () => {
  const defaultProps = {
    searchTerm: '',
    onSearchChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render search input', () => {
    render(<CalendarSearch {...defaultProps} />);

    const searchInput = screen.getByTestId('search-input');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute(
      'placeholder',
      'Search tasks, instruments, owners...'
    );
  });

  it('should display current search term', () => {
    render(<CalendarSearch {...defaultProps} searchTerm="test search" />);

    const searchInput = screen.getByTestId('search-input') as HTMLInputElement;
    expect(searchInput.value).toBe('test search');
  });

  it('should call onSearchChange when search input changes', async () => {
    const user = userEvent.setup();
    const onSearchChange = jest.fn();

    render(
      <CalendarSearch {...defaultProps} onSearchChange={onSearchChange} />
    );

    const searchInput = screen.getByTestId('search-input');

    await user.type(searchInput, 'test');

    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalled();
    });
  });

  it('should show clear button when search term is not empty', () => {
    render(<CalendarSearch {...defaultProps} searchTerm="test" />);

    const clearButton = screen.getByTestId('clear-button');
    expect(clearButton).toBeInTheDocument();
  });

  it('should hide clear button when search term is empty', () => {
    render(<CalendarSearch {...defaultProps} searchTerm="" />);

    const clearButton = screen.queryByTestId('clear-button');
    expect(clearButton).not.toBeInTheDocument();
  });

  it('should clear search when clear button is clicked', async () => {
    const user = userEvent.setup();
    const onSearchChange = jest.fn();

    render(
      <CalendarSearch
        {...defaultProps}
        searchTerm="test"
        onSearchChange={onSearchChange}
      />
    );

    const clearButton = screen.getByTestId('clear-button');
    await user.click(clearButton);

    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalledWith('');
    });
  });
});
