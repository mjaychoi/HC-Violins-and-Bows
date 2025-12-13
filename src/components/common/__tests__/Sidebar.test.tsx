import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../Sidebar';

describe('Sidebar', () => {
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with expanded state', () => {
    const { container } = render(
      <Sidebar isExpanded={true} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const sidebar = container.firstChild as HTMLElement;
    expect(sidebar.className).toContain('w-64');
    expect(screen.getByText('Sidebar Content')).toBeInTheDocument();
  });

  it('should render with collapsed state', () => {
    const { container } = render(
      <Sidebar isExpanded={false} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const sidebar = container.firstChild as HTMLElement;
    expect(sidebar.className).toContain('w-16');
    // Content is hidden with CSS class 'hidden', but still in DOM
    const contentDiv = container.querySelector('.hidden');
    expect(contentDiv).toBeInTheDocument();
  });

  it('should call onToggle when toggle button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar isExpanded={true} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const toggleButton = screen.getByRole('button');
    await user.click(toggleButton);

    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('should show content when expanded', () => {
    const { container } = render(
      <Sidebar isExpanded={true} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const contentDiv = container.querySelector('.block');
    expect(contentDiv).toBeInTheDocument();
    expect(screen.getByText('Sidebar Content')).toBeInTheDocument();
  });

  it('should hide content when collapsed', () => {
    const { container } = render(
      <Sidebar isExpanded={false} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const contentDiv = container.querySelector('.hidden');
    expect(contentDiv).toBeInTheDocument();
    // Content is hidden with CSS but still exists in DOM
    expect(contentDiv?.textContent).toBe('Sidebar Content');
  });

  it('should rotate icon when expanded', () => {
    const { container } = render(
      <Sidebar isExpanded={true} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('rotate-180');
  });

  it('should not rotate icon when collapsed', () => {
    const { container } = render(
      <Sidebar isExpanded={false} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('class')).not.toContain('rotate-180');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <Sidebar
        isExpanded={true}
        onToggle={mockOnToggle}
        className="custom-class"
      >
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const sidebar = container.firstChild as HTMLElement;
    expect(sidebar.className).toContain('custom-class');
  });

  it('should render children correctly', () => {
    render(
      <Sidebar isExpanded={true} onToggle={mockOnToggle}>
        <div>
          <p>Item 1</p>
          <p>Item 2</p>
        </div>
      </Sidebar>
    );

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('should have transition classes', () => {
    const { container } = render(
      <Sidebar isExpanded={true} onToggle={mockOnToggle}>
        <div>Sidebar Content</div>
      </Sidebar>
    );

    const sidebar = container.firstChild as HTMLElement;
    expect(sidebar.className).toContain('transition-all');
    expect(sidebar.className).toContain('duration-300');
  });
});

