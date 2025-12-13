import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationBadge from '../NotificationBadge';

describe('NotificationBadge', () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when total is 0', () => {
    const { container } = render(
      <NotificationBadge overdue={0} upcoming={0} today={0} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders notification badge when there are notifications', () => {
    render(
      <NotificationBadge overdue={2} upcoming={1} today={1} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 4개/i });
    expect(button).toBeInTheDocument();
  });

  it('displays correct total count', () => {
    render(
      <NotificationBadge overdue={5} upcoming={3} today={2} onClick={mockOnClick} />
    );

    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('displays 99+ when total exceeds 99', () => {
    // Component shows 99+ when total > 99
    const { container } = render(
      <NotificationBadge overdue={50} upcoming={30} today={20} onClick={mockOnClick} />
    );
    
    // Total is 100, which should show "99+" (since 100 > 99)
    const badge = container.querySelector('.rounded-full');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe('99+');
  });

  it('shows tooltip on hover', () => {
    render(
      <NotificationBadge overdue={2} upcoming={1} today={1} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 4개/i });
    fireEvent.mouseEnter(button);

    expect(screen.getByText('알림')).toBeInTheDocument();
    expect(screen.getByText(/지연된 작업:/)).toBeInTheDocument();
    expect(screen.getByText('2개')).toBeInTheDocument();
    expect(screen.getByText(/오늘 마감:/)).toBeInTheDocument();
    expect(screen.getByText(/곧 마감/)).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <NotificationBadge overdue={2} upcoming={1} today={1} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 4개/i });
    fireEvent.mouseEnter(button);
    expect(screen.getByText('알림')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    expect(screen.queryByText('알림')).not.toBeInTheDocument();
  });

  it('calls onClick when button is clicked', () => {
    render(
      <NotificationBadge overdue={1} upcoming={0} today={0} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 1개/i });
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('does not show overdue section when overdue is 0', () => {
    render(
      <NotificationBadge overdue={0} upcoming={2} today={1} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 3개/i });
    fireEvent.mouseEnter(button);

    expect(screen.queryByText(/지연된 작업:/)).not.toBeInTheDocument();
    expect(screen.getByText(/곧 마감/)).toBeInTheDocument();
    expect(screen.getByText(/오늘 마감:/)).toBeInTheDocument();
  });

  it('does not show today section when today is 0', () => {
    render(
      <NotificationBadge overdue={2} upcoming={1} today={0} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 3개/i });
    fireEvent.mouseEnter(button);

    expect(screen.getByText(/지연된 작업:/)).toBeInTheDocument();
    expect(screen.queryByText(/오늘 마감:/)).not.toBeInTheDocument();
    expect(screen.getByText(/곧 마감/)).toBeInTheDocument();
  });

  it('does not show upcoming section when upcoming is 0', () => {
    render(
      <NotificationBadge overdue={2} upcoming={0} today={1} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 3개/i });
    fireEvent.mouseEnter(button);

    expect(screen.getByText(/지연된 작업:/)).toBeInTheDocument();
    expect(screen.getByText(/오늘 마감:/)).toBeInTheDocument();
    expect(screen.queryByText(/곧 마감/)).not.toBeInTheDocument();
  });

  it('shows "캘린더에서 확인하기" button in tooltip when onClick is provided', () => {
    render(
      <NotificationBadge overdue={1} upcoming={0} today={0} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 1개/i });
    fireEvent.mouseEnter(button);

    const calendarButton = screen.getByText(/캘린더에서 확인하기/);
    expect(calendarButton).toBeInTheDocument();

    fireEvent.click(calendarButton);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('does not show calendar button in tooltip when onClick is not provided', () => {
    render(<NotificationBadge overdue={1} upcoming={0} today={0} />);

    const button = screen.getByRole('button', { name: /알림 1개/i });
    fireEvent.mouseEnter(button);

    expect(screen.queryByText(/캘린더에서 확인하기/)).not.toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(
      <NotificationBadge overdue={5} upcoming={3} today={2} onClick={mockOnClick} />
    );

    const button = screen.getByRole('button', { name: /알림 10개/i });
    expect(button).toHaveAttribute('aria-label', '알림 10개');
  });
});
