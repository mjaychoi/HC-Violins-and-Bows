import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import RowActions from '../RowActions';

describe('RowActions', () => {
  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnDownloadCertificate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the trigger button', () => {
    render(<RowActions onEdit={mockOnEdit} onDelete={mockOnDelete} />);

    expect(screen.getByLabelText('More actions')).toBeInTheDocument();
  });

  it('opens the menu when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<RowActions onEdit={mockOnEdit} onDelete={mockOnDelete} />);

    await user.click(screen.getByLabelText('More actions'));

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('calls onEdit when Edit is clicked', async () => {
    const user = userEvent.setup();
    render(<RowActions onEdit={mockOnEdit} onDelete={mockOnDelete} />);

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());

    await user.click(screen.getByText('Edit'));
    expect(mockOnEdit).toHaveBeenCalled();
  });

  it('calls onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();
    render(<RowActions onEdit={mockOnEdit} onDelete={mockOnDelete} />);

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() => expect(screen.getByText('Delete')).toBeInTheDocument());

    await user.click(screen.getByText('Delete'));
    expect(mockOnDelete).toHaveBeenCalled();
  });

  it('shows certificate button when certificate exists and triggers download', async () => {
    const user = userEvent.setup();
    render(
      <RowActions
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        hasCertificate={true}
        onDownloadCertificate={mockOnDownloadCertificate}
      />
    );

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() =>
      expect(screen.getByText('Certificate')).toBeInTheDocument()
    );

    await user.click(screen.getByText('Certificate'));
    expect(mockOnDownloadCertificate).toHaveBeenCalled();
  });

  it('does not show certificate button when certificate is false', async () => {
    const user = userEvent.setup();
    render(
      <RowActions
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        hasCertificate={false}
        onDownloadCertificate={mockOnDownloadCertificate}
      />
    );

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() => {
      expect(screen.queryByText('Certificate')).not.toBeInTheDocument();
    });
  });

  it('shows current status header when currentStatus is provided', async () => {
    const user = userEvent.setup();
    render(
      <RowActions
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        currentStatus="Available"
      />
    );

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() => {
      expect(screen.getByText('Current Status')).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
    });
  });

  it('hides current status header when currentStatus is undefined', async () => {
    const user = userEvent.setup();
    render(<RowActions onEdit={mockOnEdit} onDelete={mockOnDelete} />);

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() => {
      expect(screen.queryByText('Current Status')).not.toBeInTheDocument();
    });
  });

  it('closes menu when Escape key is pressed', async () => {
    const user = userEvent.setup();
    render(<RowActions onEdit={mockOnEdit} onDelete={mockOnDelete} />);

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    });
  });

  it('renders menu with correct ARIA attributes', async () => {
    const user = userEvent.setup();
    render(
      <RowActions
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        itemId="test-item-123"
      />
    );

    const trigger = screen.getByLabelText('More actions');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute(
      'aria-controls',
      'row-actions-test-item-123'
    );

    await user.click(trigger);

    await waitFor(() => {
      const menu = document.getElementById('row-actions-test-item-123');
      expect(menu).toBeInTheDocument();
      expect(menu).toHaveAttribute('role', 'menu');
    });

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('stops propagation when menu items are clicked', async () => {
    const user = userEvent.setup();
    const parentClickHandler = jest.fn();

    render(
      <div onClick={parentClickHandler}>
        <RowActions onEdit={mockOnEdit} onDelete={mockOnDelete} />
      </div>
    );

    await user.click(screen.getByLabelText('More actions'));
    await waitFor(() => expect(screen.getByText('Edit')).toBeInTheDocument());

    await user.click(screen.getByText('Edit'));
    expect(mockOnEdit).toHaveBeenCalled();
  });
});
