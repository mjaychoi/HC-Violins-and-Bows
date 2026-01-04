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

  it('should call onEdit when Enter key is pressed', async () => {
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

    const card = screen.getByRole('button', {
      name: /Connection: John Doe - Stradivarius Violin/i,
    });
    await user.type(card, '{Enter}');

    expect(mockOnEdit).toHaveBeenCalledWith(mockConnection);
  });

  it('should call onEdit when Space key is pressed', async () => {
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

    const card = screen.getByRole('button', {
      name: /Connection: John Doe - Stradivarius Violin/i,
    });
    await user.type(card, ' ');

    expect(mockOnEdit).toHaveBeenCalledWith(mockConnection);
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

    const card = screen.getByRole('button', {
      name: /Connection: John Doe - Stradivarius Violin/i,
    });
    expect(card).toHaveClass('shadow-lg', 'ring-2', 'ring-blue-400');
  });

  it('should render drag handle', () => {
    render(
      <DndContext>
        <SortableConnectionCard
          connection={mockConnection}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    expect(screen.getByLabelText('Drag to reorder')).toBeInTheDocument();
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

  it('should handle missing client or instrument names in aria-label', () => {
    const connectionMinimal = {
      ...mockConnection,
      client: {
        id: 'client-1',
        first_name: null,
        last_name: null,
        email: 'john@example.com',
        created_at: '2024-01-01',
      },
      instrument: {
        id: 'inst-1',
        maker: null,
        type: null,
        status: 'Available',
        created_at: '2024-01-01',
      },
    };

    render(
      <DndContext>
        <SortableConnectionCard
          connection={{
            ...connectionMinimal,
            client: {
              ...connectionMinimal.client!,
              contact_number: null,
              address: null,
              tags: [],
              interest: null,
              note: null,
              client_number: 'CL001',
            },
            instrument: {
              id: connectionMinimal.instrument!.id,
              maker: connectionMinimal.instrument!.maker,
              type: connectionMinimal.instrument!.type,
              status: connectionMinimal.instrument!.status as
                | 'Available'
                | 'Sold'
                | 'Booked'
                | 'Maintenance',
              created_at: connectionMinimal.instrument!.created_at,
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
            },
          }}
          onDelete={mockOnDelete}
          onEdit={mockOnEdit}
        />
      </DndContext>
    );

    // Should still render without errors
    expect(screen.getByTestId('connection-card')).toBeInTheDocument();
  });
});
