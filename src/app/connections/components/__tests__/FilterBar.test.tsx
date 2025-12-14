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
        activeBorder: 'border-indigo-600',
        textColor: 'text-indigo-600',
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

    // FIXED: Text is split across elements (All + span with count)
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('(11)')).toBeInTheDocument();
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

    // FIXED: Text includes emoji and spaces, use regex or getByRole
    expect(screen.getByText(/Interested/i)).toBeInTheDocument();
    expect(screen.getByText('(5)')).toBeInTheDocument();
    expect(screen.getByText(/Booked/i)).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText(/Sold/i)).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText(/Owned/i)).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
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

    // FIXED: Use getByRole to find button containing "All" text
    const allButton = screen.getByRole('button', { name: /All/i });
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

    // FIXED: Use getByRole to find button containing "Interested" text
    const interestedButton = screen.getByRole('button', { name: /Interested/i });
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

    // FIXED: Use getByRole to find button containing "All" text
    const allButton = screen.getByRole('button', { name: /All/i });
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

    // FIXED: Use getByRole to find button containing "Booked" text
    const bookedButton = screen.getByRole('button', { name: /Booked/i });
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

    // FIXED: Text includes emoji and spaces, use regex for type names
    expect(screen.getByText(/All/i)).toBeInTheDocument();
    expect(screen.getByText('(11)')).toBeInTheDocument();
    expect(screen.getByText(/Interested/i)).toBeInTheDocument();
    expect(screen.getByText('(5)')).toBeInTheDocument();
    expect(screen.getByText(/Booked/i)).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText(/Sold/i)).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText(/Owned/i)).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
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

    // FIXED: Text is split across elements
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('(0)')).toBeInTheDocument();
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

    // FIXED: Use getByRole to find button containing "Interested" text
    const interestedButton = screen.getByRole('button', { name: /Interested/i });
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

    // FIXED: Use getByRole to find button containing "Booked" text
    const bookedButton = screen.getByRole('button', { name: /Booked/i });
    expect(bookedButton.className).toContain('hover:text-gray-800');
    expect(bookedButton.className).toContain('hover:border-gray-300');
  });
});
