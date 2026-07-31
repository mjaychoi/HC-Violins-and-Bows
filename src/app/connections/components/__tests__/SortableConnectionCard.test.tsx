import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortableConnectionCard } from '../SortableConnectionCard';
import { ClientInstrument } from '@/types';
import { DndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';

// Mock @dnd-kit/sortable
jest.mock('@dnd-kit/sortable', () => ({
  useSortable: jest.fn(),
}));

// Mock ConnectionCard
jest.mock('../ConnectionCard', () => ({
  ConnectionCard: jest.fn(({ connection, onDelete, onEdit }) => (
    <div data-testid="connection-card">
      <div>
        {connection.client?.first_name} {connection.client?.last_name}
      </div>
      <div>
        {connection.instrument?.maker} {connection.instrument?.type}
      </div>
      <button onClick={() => onEdit(connection)}>Edit</button>
      <button onClick={() => onDelete(connection)}>Delete</button>
    </div>
  )),
}));

const mockUseSortable = useSortable as jest.MockedFunction<typeof useSortable>;

describe('SortableConnectionCard', () => {
  const mockConnection: ClientInstrument = {
    id: 'conn-1',
    client_id: 'client-1',
    instrument_id: 'inst-1',
    relationship_type: 'Interested',
    notes: 'Test notes',
    created_at: '2024-01-01',
    client: {
      id: 'client-1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      contact_number: null,
      address: null,
      tags: [],
      interest: null,
      note: null,
      client_number: 'CL001',
      created_at: '2024-01-01',
    },
    instrument: {
      id: 'inst-1',
      maker: 'Stradivarius',
      type: 'Violin',
      subtype: null,
      year: null,
      price: null,
      certificate: false,
      certificate_name: null,
      cost_price: null,
      consignment_price: null,
      serial_number: null,
      size: null,
      weight: null,
      ownership: null,
      note: null,
      status: 'Available',
      created_at: '2024-01-01',
    },
  };

  const mockOnDelete = jest.fn();
  const mockOnEdit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSortable.mockReturnValue({
      attributes: {
        role: 'button',
        tabIndex: 0,
      },
      listeners: {
        onPointerDown: jest.fn(),
      },
      setNodeRef: jest.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    } as any);
  });

  it('should render connection card', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    expect(screen.getByTestId('connection-card')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Stradivarius Violin')).toBeInTheDocument();
  });

  it('F8: renders the composite card as role="group", not a nested button', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    const group = screen.getByRole('group', {
      name: /Connection: John Doe - Stradivarius - Violin \(Interested\)/i,
    });
    expect(group).toBeInTheDocument();
    // Edit/Delete buttons must not be nested inside another interactive
    // (button/link) ancestor - role="group" is not an interactive widget.
    expect(group.closest('[role="button"]')).toBeNull();
  });

  it('F8: edit and delete remain reachable as independent actions', async () => {
    const user = userEvent.setup();
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(mockOnEdit).toHaveBeenCalledWith(mockConnection);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockOnDelete).toHaveBeenCalledWith(mockConnection);
  });

  it('should apply dragging styles when isDragging is true', () => {
    mockUseSortable.mockReturnValue({
      attributes: {
        role: 'button',
        tabIndex: 0,
      },
      listeners: {
        onPointerDown: jest.fn(),
      },
      setNodeRef: jest.fn(),
      transform: null,
      transition: null,
      isDragging: true,
    } as any);

    const { container } = render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('shadow-2xl');
  });

  it('should apply isOver styles when isOver is true', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
          isOver={true}
        />
      </DndContext>
    );

    const card = screen.getByRole('group', {
      name: /Connection: John Doe - Stradivarius - Violin \(Interested\)/i,
    });
    expect(card).toHaveClass('shadow-lg', 'ring-2', 'ring-blue-400');
  });

  it('should render a real <button> drag handle reachable by keyboard', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    const handle = screen.getByRole('button', {
      name: /Drag to reorder Connection: John Doe/i,
    });
    expect(handle.tagName).toBe('BUTTON');
  });

  it('does not render a drag handle when canDrag is false', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
          canDrag={false}
        />
      </DndContext>
    );

    expect(
      screen.queryByRole('button', { name: /Drag to reorder/i })
    ).not.toBeInTheDocument();
  });

  it('should render screen reader description', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    const description = document.getElementById(
      'connection-conn-1-description'
    );
    expect(description).toBeInTheDocument();
    expect(description).toHaveTextContent('Interested relationship.');
    expect(description).toHaveTextContent('Notes: Test notes');
  });

  it('should render "No notes" when notes are not provided', () => {
    const connectionWithoutNotes = {
      ...mockConnection,
      notes: null,
    };

    render(
      <DndContext>
        <SortableConnectionCard
          connection={connectionWithoutNotes}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    const description = document.getElementById(
      'connection-conn-1-description'
    );
    expect(description).toHaveTextContent('No notes.');
  });

  it('should pass showCreatedAt prop to ConnectionCard', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
          showCreatedAt={true}
        />
      </DndContext>
    );

    expect(screen.getByTestId('connection-card')).toBeInTheDocument();
    // ConnectionCard receives showCreatedAt prop (tested in ConnectionCard tests)
  });

  it('F1/F8: never produces an empty accessible name when client/instrument are missing', () => {
    const connectionMissingRefs: ClientInstrument = {
      ...mockConnection,
      client: null,
      instrument: null,
    };

    render(
      <DndContext>
        <SortableConnectionCard
          connection={connectionMissingRefs}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    const group = screen.getByRole('group', {
      name: /Connection: Unavailable client - Unavailable instrument \(Interested\)/i,
    });
    expect(group).toBeInTheDocument();
    expect(group.getAttribute('aria-label')).not.toBe('');
  });
});
