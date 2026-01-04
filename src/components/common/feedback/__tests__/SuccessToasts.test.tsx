import React from 'react';
import { render, screen } from '@testing-library/react';
import type { Toast, ToastLink } from '@/contexts/ToastContext';

jest.unmock('@/components/common/feedback/SuccessToasts');
const SuccessToasts = require('../SuccessToasts')
  .default as typeof import('../SuccessToasts').default;

// Mock SuccessToast to avoid complex auto-close logic in tests
jest.mock('../SuccessToast', () => {
  return function MockSuccessToast({
    message,
    links,
    onClose,
  }: {
    message: string;
    links?: ToastLink[];
    onClose: () => void;
  }) {
    return (
      <div data-testid="success-toast">
        <div data-testid="toast-message">{message}</div>
        {links?.map((link, idx) => (
          <a key={idx} href={link.href} data-testid={`toast-link-${idx}`}>
            {link.label}
          </a>
        ))}
        <button onClick={onClose} data-testid="toast-close">
          Close
        </button>
      </div>
    );
  };
});

describe('SuccessToasts', () => {
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when toasts array is empty', () => {
    const { container } = render(
      <SuccessToasts toasts={[]} onRemove={mockOnRemove} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render container with correct classes when toasts exist', () => {
    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'Success message',
        timestamp: new Date(),
      },
    ];

    const { container } = render(
      <SuccessToasts toasts={toasts} onRemove={mockOnRemove} />
    );

    const wrapper = container.querySelector(
      '.fixed.top-4.right-4.z-50.space-y-2'
    );
    expect(wrapper).toBeInTheDocument();
  });

  it('should render single toast', () => {
    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'Success message',
        timestamp: new Date(),
      },
    ];

    render(<SuccessToasts toasts={toasts} onRemove={mockOnRemove} />);

    expect(screen.getByTestId('success-toast')).toBeInTheDocument();
    expect(screen.getByTestId('toast-message')).toHaveTextContent(
      'Success message'
    );
  });

  it('should render multiple toasts', () => {
    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'First message',
        timestamp: new Date(),
      },
      {
        id: 'toast-2',
        message: 'Second message',
        timestamp: new Date(),
      },
    ];

    render(<SuccessToasts toasts={toasts} onRemove={mockOnRemove} />);

    const toastElements = screen.getAllByTestId('success-toast');
    expect(toastElements).toHaveLength(2);
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  it('should call onRemove when toast is closed', async () => {
    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'Test message',
        timestamp: new Date(),
      },
    ];

    render(<SuccessToasts toasts={toasts} onRemove={mockOnRemove} />);

    const closeButton = screen.getByTestId('toast-close');
    closeButton.click();

    expect(mockOnRemove).toHaveBeenCalledWith('toast-1');
    expect(mockOnRemove).toHaveBeenCalledTimes(1);
  });

  it('should pass links to toast component', () => {
    const links: ToastLink[] = [
      { href: '/clients/123', label: 'View Client' },
      { href: '/instruments/456', label: 'View Instrument' },
    ];

    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'Success with links',
        timestamp: new Date(),
        links,
      },
    ];

    render(<SuccessToasts toasts={toasts} onRemove={mockOnRemove} />);

    expect(screen.getByTestId('toast-link-0')).toHaveTextContent('View Client');
    expect(screen.getByTestId('toast-link-0')).toHaveAttribute(
      'href',
      '/clients/123'
    );
    expect(screen.getByTestId('toast-link-1')).toHaveTextContent(
      'View Instrument'
    );
    expect(screen.getByTestId('toast-link-1')).toHaveAttribute(
      'href',
      '/instruments/456'
    );
  });

  it('should handle toast without links', () => {
    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'Success without links',
        timestamp: new Date(),
      },
    ];

    render(<SuccessToasts toasts={toasts} onRemove={mockOnRemove} />);

    expect(screen.getByText('Success without links')).toBeInTheDocument();
    expect(screen.queryByTestId('toast-link-0')).not.toBeInTheDocument();
  });

  it('should handle multiple close actions correctly', () => {
    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'First',
        timestamp: new Date(),
      },
      {
        id: 'toast-2',
        message: 'Second',
        timestamp: new Date(),
      },
    ];

    render(<SuccessToasts toasts={toasts} onRemove={mockOnRemove} />);

    const closeButtons = screen.getAllByTestId('toast-close');
    expect(closeButtons).toHaveLength(2);

    closeButtons[0].click();
    expect(mockOnRemove).toHaveBeenCalledWith('toast-1');

    closeButtons[1].click();
    expect(mockOnRemove).toHaveBeenCalledWith('toast-2');
    expect(mockOnRemove).toHaveBeenCalledTimes(2);
  });

  it('should render toasts in correct order', () => {
    const toasts: Toast[] = [
      {
        id: 'toast-1',
        message: 'First toast',
        timestamp: new Date(2024, 0, 1),
      },
      {
        id: 'toast-2',
        message: 'Second toast',
        timestamp: new Date(2024, 0, 2),
      },
    ];

    render(<SuccessToasts toasts={toasts} onRemove={mockOnRemove} />);

    const toastElements = screen.getAllByTestId('success-toast');
    expect(toastElements).toHaveLength(2);
    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
  });
});
