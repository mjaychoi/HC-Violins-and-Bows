import { render, screen, fireEvent } from '@/test-utils/render';
import InstrumentSearch from '../InstrumentSearch';
import { Instrument } from '@/types';

// EmptyState는 실제 구현 대신 단순 텍스트 렌더로 대체 (테스트 안정성용)
jest.mock('@/components/common', () => ({
  __esModule: true,
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));

const mockInstrument: Instrument = {
  id: 'inst1',
  maker: 'Stradivari',
  type: 'Violin',
  subtype: null,
  year: 1700,
  certificate: true,
  size: null,
  weight: null,
  price: 100000,
  ownership: null,
  note: null,
  serial_number: 'VI0000001',
  status: 'Available',
  created_at: '2024-01-01',
};

describe('InstrumentSearch', () => {
  const mockProps = {
    isOpen: true,
    onClose: jest.fn(),
    searchTerm: '',
    onSearchChange: jest.fn(),
    onSearch: jest.fn(),
    searchResults: [],
    isSearching: false,
    onAddInstrument: jest.fn(),
    selectedInstruments: [],
    onRemoveInstrument: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(<InstrumentSearch {...mockProps} isOpen={false} />);
    expect(screen.queryByText('Search Instruments')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(<InstrumentSearch {...mockProps} />);
    expect(screen.getByText('Search Instruments')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    render(<InstrumentSearch {...mockProps} />);
    const closeButton = screen.getByRole('button', { name: '' });
    fireEvent.click(closeButton);
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onSearchChange and onSearch when input changes', () => {
    render(<InstrumentSearch {...mockProps} />);
    const input = screen.getByPlaceholderText(
      'Search instruments by maker or name...'
    );
    fireEvent.change(input, { target: { value: 'Stradivari' } });
    expect(mockProps.onSearchChange).toHaveBeenCalledWith('Stradivari');
    expect(mockProps.onSearch).toHaveBeenCalledWith('Stradivari');
  });

  it('should display loading state when isSearching is true', () => {
    render(<InstrumentSearch {...mockProps} isSearching={true} />);
    expect(screen.getByText('Searching instruments...')).toBeInTheDocument();
  });

  it('should display no results message when search term exists but no results', () => {
    render(
      <InstrumentSearch {...mockProps} searchTerm="test" searchResults={[]} />
    );
    expect(screen.getByText('No instruments found')).toBeInTheDocument();
  });

  it('should display start typing message when no search term', () => {
    render(<InstrumentSearch {...mockProps} searchTerm="" />);
    expect(
      // EmptyState 설명 카피에 맞게 약간 완화된 매처 사용
      screen.getByText(/start typing to search/i)
    ).toBeInTheDocument();
  });

  it('should display search results', () => {
    render(
      <InstrumentSearch {...mockProps} searchResults={[mockInstrument]} />
    );
    expect(screen.getByText('Stradivari')).toBeInTheDocument();
    expect(screen.getByText('Violin')).toBeInTheDocument();
    expect(screen.getByText('Year: 1700')).toBeInTheDocument();
  });

  it('should call onAddInstrument when relationship is selected', () => {
    render(
      <InstrumentSearch {...mockProps} searchResults={[mockInstrument]} />
    );
    const select = screen.getByDisplayValue('Select relationship');
    fireEvent.change(select, { target: { value: 'Owned' } });
    expect(mockProps.onAddInstrument).toHaveBeenCalledWith(
      mockInstrument,
      'Owned'
    );
  });

  it('should display selected instruments', () => {
    const selectedInstruments = [
      {
        instrument: mockInstrument,
        relationshipType: 'Owned',
      },
    ];
    render(
      <InstrumentSearch
        {...mockProps}
        selectedInstruments={selectedInstruments}
      />
    );
    expect(screen.getByText('Selected Instruments')).toBeInTheDocument();
    expect(screen.getByText('Stradivari - Violin')).toBeInTheDocument();
    expect(screen.getByText('Owned')).toBeInTheDocument();
  });

  it('should call onRemoveInstrument when remove button is clicked', () => {
    const selectedInstruments = [
      {
        instrument: mockInstrument,
        relationshipType: 'Owned',
      },
    ];
    render(
      <InstrumentSearch
        {...mockProps}
        selectedInstruments={selectedInstruments}
      />
    );
    const removeButton = screen.getByText('Remove');
    fireEvent.click(removeButton);
    expect(mockProps.onRemoveInstrument).toHaveBeenCalledWith('inst1');
  });

  it('should not display selected instruments section when empty', () => {
    render(<InstrumentSearch {...mockProps} selectedInstruments={[]} />);
    expect(screen.queryByText('Selected Instruments')).not.toBeInTheDocument();
  });

  it('should handle multiple search results', () => {
    const instruments = [
      mockInstrument,
      {
        ...mockInstrument,
        id: 'inst2',
        maker: 'Guarneri',
        type: 'Cello',
      },
    ];
    render(<InstrumentSearch {...mockProps} searchResults={instruments} />);
    expect(screen.getByText('Stradivari')).toBeInTheDocument();
    expect(screen.getByText('Guarneri')).toBeInTheDocument();
  });
});
