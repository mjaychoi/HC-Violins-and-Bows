import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  const mockOnCreateConnection = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render empty state message', () => {
    render(<EmptyState onCreateConnection={mockOnCreateConnection} />);

    expect(screen.getByText('No connections')).toBeInTheDocument();
    expect(
      screen.getByText('Get started by creating your first client-item connection.')
    ).toBeInTheDocument();
  });

  it('should render create connection button', () => {
    render(<EmptyState onCreateConnection={mockOnCreateConnection} />);

    const createButton = screen.getByRole('button', { name: /Create Connection/i });
    expect(createButton).toBeInTheDocument();
  });

  it('should call onCreateConnection when button is clicked', async () => {
    const user = userEvent.setup();
    render(<EmptyState onCreateConnection={mockOnCreateConnection} />);

    const createButton = screen.getByRole('button', { name: /Create Connection/i });
    await user.click(createButton);

    expect(mockOnCreateConnection).toHaveBeenCalledTimes(1);
  });

  it('should render icon', () => {
    const { container } = render(
      <EmptyState onCreateConnection={mockOnCreateConnection} />
    );

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should have correct button styling', () => {
    render(<EmptyState onCreateConnection={mockOnCreateConnection} />);

    const createButton = screen.getByRole('button', { name: /Create Connection/i });
    expect(createButton.className).toContain('bg-blue-600');
    expect(createButton.className).toContain('hover:bg-blue-700');
  });
});

