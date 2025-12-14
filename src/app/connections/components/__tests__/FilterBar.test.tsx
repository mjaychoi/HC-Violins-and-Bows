import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../FilterBar';
import { RelationshipTypeCount } from '../../utils/connectionGrouping';

// Mock relationshipStyles
jest.mock('../../utils/relationshipStyles', () => ({
  getRelationshipTypeStyle: jest.fn((type: string) => {
    const styles: Record<
      string,
      { activeBorder: string; textColor: string; icon: string }
    > = {
      Interested: {
        activeBorder: 'border-yellow-600',
        textColor: 'text-yellow-600',
        icon: '💡',
      },
      Booked: {
        activeBorder: 'border-blue-600',
        textColor: 'text-blue-600',
        icon: '📅',
      },
      Sold: {
        activeBorder: 'border-green-600',
        textColor: 'text-green-600',
        icon: '✅',
      },
      Owned: {
        activeBorder: 'border-purple-600',
        textColor: 'text-purple-600',
        icon: '🏠',
      },
    };
    return (
      styles[type] || {
        activeBorder: 'border-gray-600',
        textColor: 'text-gray-600',
        icon: '📋',
      }
    );
  }),
}));

describe('FilterBar', () => {
  const mockOnFilterChange = jest.fn();
  const relationshipTypeCounts: RelationshipTypeCount[] = [
    { type: 'Interested', count: 5 },
    { type: 'Booked', count: 3 },
    { type: 'Sold', count: 2 },
    { type: 'Owned', count: 1 },
  ];
  const totalConnections = 11;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all filter button', () => {
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    expect(screen.getByText(/All \(11\)/i)).toBeInTheDocument();
  });

  it('should render relationship type filter buttons', () => {
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    expect(screen.getByText(/Interested \(5\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Booked \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Sold \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Owned \(1\)/i)).toBeInTheDocument();
  });

  it('should highlight "All" button when selectedFilter is null', () => {
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    const allButton = screen.getByText(/All \(11\)/i);
    expect(allButton.className).toContain('border-blue-600');
    expect(allButton.className).toContain('text-blue-600');
  });

  it('should highlight selected relationship type filter', () => {
    render(
      <FilterBar
        selectedFilter="Interested"
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    const interestedButton = screen.getByText(/Interested \(5\)/i);
    expect(interestedButton.className).toContain('border-yellow-600');
    expect(interestedButton.className).toContain('text-yellow-600');
  });

  it('should call onFilterChange with null when "All" button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar
        selectedFilter="Interested"
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    const allButton = screen.getByText(/All \(11\)/i);
    await user.click(allButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith(null);
  });

  it('should call onFilterChange with type when relationship type button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    const bookedButton = screen.getByText(/Booked \(3\)/i);
    await user.click(bookedButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith('Booked');
  });

  it('should display correct counts for each filter', () => {
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    expect(screen.getByText(/All \(11\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Interested \(5\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Booked \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Sold \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Owned \(1\)/i)).toBeInTheDocument();
  });

  it('should render icons for relationship types', () => {
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    expect(screen.getByText(/💡.*Interested/i)).toBeInTheDocument();
    expect(screen.getByText(/📅.*Booked/i)).toBeInTheDocument();
    expect(screen.getByText(/✅.*Sold/i)).toBeInTheDocument();
    expect(screen.getByText(/🏠.*Owned/i)).toBeInTheDocument();
  });

  it('should handle empty relationshipTypeCounts', () => {
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={[]}
        totalConnections={0}
      />
    );

    expect(screen.getByText(/All \(0\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/Interested/i)).not.toBeInTheDocument();
  });

  it('should have tooltip on relationship type buttons', () => {
    render(
      <FilterBar
        selectedFilter={null}
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    const interestedButton = screen.getByText(/Interested \(5\)/i);
    expect(interestedButton).toHaveAttribute('title', 'Filter by Interested');
  });

  it('should apply hover styles to inactive filters', () => {
    render(
      <FilterBar
        selectedFilter="Interested"
        onFilterChange={mockOnFilterChange}
        relationshipTypeCounts={relationshipTypeCounts}
        totalConnections={totalConnections}
      />
    );

    const bookedButton = screen.getByText(/Booked \(3\)/i);
    expect(bookedButton.className).toContain('hover:text-gray-800');
    expect(bookedButton.className).toContain('hover:border-gray-300');
  });
});
