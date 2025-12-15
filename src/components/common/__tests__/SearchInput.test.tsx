import { render, screen, waitFor, act } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import {
  SearchInput,
  ClientSearchInput,
  InstrumentSearchInput,
  ConnectionSearchInput,
} from '@/components/common/inputs';

// Mock useDebounce
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: jest.fn(value => value),
}));

describe('SearchInput', () => {
  const mockOnChange = jest.fn();
  const mockOnClear = jest.fn();
  const mockOnFocus = jest.fn();
  const mockOnBlur = jest.fn();
  const mockOnSuggestionSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should render with default props', () => {
      render(<SearchInput value="" onChange={mockOnChange} />);

      const input = screen.getByPlaceholderText('Search...');
      expect(input).toBeInTheDocument();
    });

    it('should render with custom placeholder', () => {
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          placeholder="Custom placeholder"
        />
      );

      expect(
        screen.getByPlaceholderText('Custom placeholder')
      ).toBeInTheDocument();
    });

    it('should display value', () => {
      render(<SearchInput value="test value" onChange={mockOnChange} />);

      const input = screen.getByDisplayValue('test value');
      expect(input).toBeInTheDocument();
    });

    it('should call onChange when input changes', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(<SearchInput value="" onChange={mockOnChange} />);

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'test');

      expect(mockOnChange).toHaveBeenCalledTimes(4);
      expect(mockOnChange).toHaveBeenCalledWith('t');
      expect(mockOnChange).toHaveBeenCalledWith('e');
      expect(mockOnChange).toHaveBeenCalledWith('s');
      expect(mockOnChange).toHaveBeenCalledWith('t');
    });

    it('should be disabled when disabled prop is true', () => {
      render(<SearchInput value="" onChange={mockOnChange} disabled />);

      const input = screen.getByPlaceholderText('Search...');
      expect(input).toBeDisabled();
    });
  });

  describe('clear button', () => {
    it('should show clear button when value exists and showClearButton is true', () => {
      render(<SearchInput value="test" onChange={mockOnChange} />);

      const clearButton = screen.getByRole('button');
      expect(clearButton).toBeInTheDocument();
    });

    it('should not show clear button when value is empty', () => {
      render(<SearchInput value="" onChange={mockOnChange} />);

      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('should not show clear button when showClearButton is false', () => {
      render(
        <SearchInput
          value="test"
          onChange={mockOnChange}
          showClearButton={false}
        />
      );

      const buttons = screen.queryAllByRole('button');
      expect(buttons).toHaveLength(0);
    });

    it('should call onChange and onClear when clear button is clicked', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value="test"
          onChange={mockOnChange}
          onClear={mockOnClear}
        />
      );

      const clearButton = screen.getByRole('button');
      await user.click(clearButton);

      expect(mockOnChange).toHaveBeenCalledWith('');
      expect(mockOnClear).toHaveBeenCalled();
    });
  });

  describe('search icon', () => {
    it('should show search icon by default', () => {
      const { container } = render(
        <SearchInput value="" onChange={mockOnChange} />
      );

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should not show search icon when showSearchIcon is false', () => {
      const { container } = render(
        <SearchInput value="" onChange={mockOnChange} showSearchIcon={false} />
      );

      const icon = container.querySelector('svg');
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe('sizes', () => {
    it('should apply sm size classes', () => {
      render(<SearchInput value="" onChange={mockOnChange} size="sm" />);

      const input = screen.getByPlaceholderText('Search...');
      expect(input.className).toContain('px-3 py-1.5 text-sm');
    });

    it('should apply md size classes by default', () => {
      render(<SearchInput value="" onChange={mockOnChange} size="md" />);

      const input = screen.getByPlaceholderText('Search...');
      expect(input.className).toContain('px-3 py-2 text-sm');
    });

    it('should apply lg size classes', () => {
      render(<SearchInput value="" onChange={mockOnChange} size="lg" />);

      const input = screen.getByPlaceholderText('Search...');
      expect(input.className).toContain('px-4 py-3 text-base');
    });
  });

  describe('variants', () => {
    it('should apply default variant classes', () => {
      render(
        <SearchInput value="" onChange={mockOnChange} variant="default" />
      );

      const input = screen.getByPlaceholderText('Search...');
      expect(input.className).toContain('border border-gray-300 bg-white');
    });

    it('should apply outlined variant classes', () => {
      render(
        <SearchInput value="" onChange={mockOnChange} variant="outlined" />
      );

      const input = screen.getByPlaceholderText('Search...');
      expect(input.className).toContain(
        'border-2 border-gray-300 bg-transparent'
      );
    });

    it('should apply filled variant classes', () => {
      render(<SearchInput value="" onChange={mockOnChange} variant="filled" />);

      const input = screen.getByPlaceholderText('Search...');
      expect(input.className).toContain('border-0 bg-gray-100');
    });
  });

  describe('focus and blur', () => {
    it('should call onFocus when input is focused', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput value="" onChange={mockOnChange} onFocus={mockOnFocus} />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      expect(mockOnFocus).toHaveBeenCalled();
    });

    it('should call onBlur when input loses focus', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput value="" onChange={mockOnChange} onBlur={mockOnBlur} />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await user.tab();

      await waitFor(() => {
        expect(mockOnBlur).toHaveBeenCalled();
      });
    });

    it('should auto focus when autoFocus is true', () => {
      render(<SearchInput value="" onChange={mockOnChange} autoFocus />);

      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveFocus();
    });
  });

  describe('suggestions', () => {
    const suggestions = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry'];

    it('should show suggestions when focused and showSuggestions is true', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });
    });

    it('should filter suggestions based on input value', async () => {
      const user = userEvent.setup({ delay: undefined });
      const { rerender } = render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      // Update value prop to trigger filtering
      rerender(
        <SearchInput
          value="ap"
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.queryByText('Banana')).not.toBeInTheDocument();
        expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
      });
    });

    it('should limit suggestions to maxSuggestions', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
          maxSuggestions={2}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
        expect(screen.getByText('Banana')).toBeInTheDocument();
        expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
      });
    });

    it('should select suggestion with keyboard arrow down', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await user.keyboard('{ArrowDown}');

      await waitFor(() => {
        const firstSuggestion = screen.getByText('Apple');
        expect(firstSuggestion.className).toContain('bg-gray-100');
      });
    });

    it('should select suggestion with keyboard arrow up', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await user.keyboard('{ArrowUp}');

      await waitFor(() => {
        const lastSuggestion = screen.getByText('Elderberry');
        expect(lastSuggestion.className).toContain('bg-gray-100');
      });
    });

    it('should select suggestion with Enter key', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
          onSuggestionSelect={mockOnSuggestionSelect}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await user.keyboard('{ArrowDown}{Enter}');

      expect(mockOnChange).toHaveBeenCalledWith('Apple');
      expect(mockOnSuggestionSelect).toHaveBeenCalledWith('Apple');
    });

    it('should close suggestions with Escape key', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByText('Apple')).not.toBeInTheDocument();
      });
    });

    it('should call onSuggestionSelect when suggestion is clicked', async () => {
      const user = userEvent.setup({ delay: undefined });
      render(
        <SearchInput
          value=""
          onChange={mockOnChange}
          suggestions={suggestions}
          showSuggestions={true}
          onSuggestionSelect={mockOnSuggestionSelect}
        />
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(async () => {
        const appleButton = screen.getByText('Apple');
        await user.click(appleButton);
      });

      expect(mockOnChange).toHaveBeenCalledWith('Apple');
      expect(mockOnSuggestionSelect).toHaveBeenCalledWith('Apple');
    });
  });

  describe('specialized components', () => {
    it('should render ClientSearchInput with correct placeholder', () => {
      render(<ClientSearchInput value="" onChange={mockOnChange} />);

      expect(
        screen.getByPlaceholderText('Search clients by name or email...')
      ).toBeInTheDocument();
    });

    it('should render InstrumentSearchInput with correct placeholder', () => {
      render(<InstrumentSearchInput value="" onChange={mockOnChange} />);

      expect(
        screen.getByPlaceholderText('Search instruments by maker or type...')
      ).toBeInTheDocument();
    });

    it('should render ConnectionSearchInput with correct placeholder', () => {
      render(<ConnectionSearchInput value="" onChange={mockOnChange} />);

      expect(
        screen.getByPlaceholderText('Search connections by notes...')
      ).toBeInTheDocument();
    });
  });
});
