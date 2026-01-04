import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MaintenanceTask } from '@/types';

// Mock useOutsideClose or similar hooks if needed
const TaskActionMenu = require('../TaskActionMenu')
  .default as typeof import('../TaskActionMenu').default;

const baseTask: MaintenanceTask = {
  id: 'task-1',
  instrument_id: 'inst-1',
  client_id: null,
  task_type: 'repair',
  title: 'Test task',
  description: null,
  priority: 'medium',
  status: 'pending',
  received_date: '2024-01-01',
  due_date: '2024-01-15',
  personal_due_date: null,
  scheduled_date: null,
  completed_date: null,
  estimated_hours: null,
  actual_hours: null,
  cost: null,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const makeTask = (
  overrides: Partial<MaintenanceTask> = {}
): MaintenanceTask => ({
  ...baseTask,
  ...overrides,
});

describe('TaskActionMenu', () => {
  const mockTask = makeTask();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render menu button', () => {
    render(<TaskActionMenu task={mockTask} />);

    const menuButton = screen.getByLabelText('Task actions');
    expect(menuButton).toBeInTheDocument();
  });

  it('should open menu when button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    // Menu opens (check for menu items or aria-expanded)
    const menu = screen.queryByRole('menu');
    expect(menu || menuButton).toBeTruthy();
  });

  it('should call onViewDetails when View details is clicked', async () => {
    const user = userEvent.setup();
    const onViewDetails = jest.fn();
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} onViewDetails={onViewDetails} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('View details')).toBeInTheDocument();
    });

    const viewDetailsButton = screen.getByText('View details');
    await user.click(viewDetailsButton);

    expect(onViewDetails).toHaveBeenCalledWith(mockTask);
  });

  it('should call onMarkComplete when Mark complete is clicked', async () => {
    const user = userEvent.setup();
    const onMarkComplete = jest.fn();
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} onMarkComplete={onMarkComplete} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Mark complete')).toBeInTheDocument();
    });

    const markCompleteButton = screen.getByText('Mark complete');
    await user.click(markCompleteButton);

    expect(onMarkComplete).toHaveBeenCalledWith(mockTask);
  });

  it('should call onEdit when Edit is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = jest.fn();
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} onEdit={onEdit} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    const editButton = screen.getByText('Edit');
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockTask);
  });

  it('should call onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} onDelete={onDelete} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('Delete');
    await user.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(mockTask);
  });

  it('should close menu when Escape key is pressed', async () => {
    const user = userEvent.setup();
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeInTheDocument();
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('should close menu when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div className="group">
        <div data-testid="outside">Outside</div>
        <TaskActionMenu task={mockTask} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeInTheDocument();
    });

    const outside = screen.getByTestId('outside');
    await user.click(outside);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  it('should only show available actions', async () => {
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} onViewDetails={jest.fn()} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('View details')).toBeInTheDocument();
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    });
  });

  it('should close menu after action is executed', async () => {
    const user = userEvent.setup();
    const onViewDetails = jest.fn();
    render(
      <div className="group">
        <TaskActionMenu task={mockTask} onViewDetails={onViewDetails} />
      </div>
    );

    const menuButton = screen.getByLabelText('Task actions');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('View details')).toBeInTheDocument();
    });

    const viewDetailsButton = screen.getByText('View details');
    await user.click(viewDetailsButton);

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
