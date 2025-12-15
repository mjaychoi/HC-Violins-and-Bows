import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import '@testing-library/jest-dom';
import ClientList from '../ClientList';
import { Client } from '@/types';

jest.mock('@/components/common', () => {
  const actual = jest.requireActual('@/components/common');
  return {
    __esModule: true,
    ...actual,
    EmptyState: ({ title, description }: any) => (
      <div data-testid="empty-state">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    ),
    Pagination: () => null,
  };
});

jest.mock('next/dynamic', () => {
  return () => {
    // Mock FixedSizeList component
    const MockedFixedSizeList = ({ children, itemCount }: any) => (
      <div data-testid="fixed-size-list">
        {Array.from({ length: itemCount }, (_, i) =>
          children({ index: i, style: {} })
        )}
      </div>
    );
    return MockedFixedSizeList;
  };
});

const mockClients: Client[] = [
  {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '123-456-7890',
    tags: ['Musician'],
    interest: 'Active',
    note: 'Test client',
    client_number: null,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '098-765-4321',
    tags: ['Owner'],
    interest: null,
    note: 'Another test client',
    client_number: null,
    created_at: '2023-01-02T00:00:00Z',
  },
];

const mockProps = {
  clients: mockClients,
  clientInstruments: [],
  onClientClick: jest.fn(),
  onUpdateClient: jest.fn(),
  onColumnSort: jest.fn(),
  getSortArrow: jest.fn((field: keyof Client) =>
    field === 'first_name' ? '↑' : ''
  ),
};

describe('ClientList', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('renders client list', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  // Note: Instruments column was removed, so these tests are no longer applicable
  // Instrument management is now done through inline editing

  it('handles client row click', () => {
    render(<ClientList {...mockProps} />);

    const johnRow = screen.getByText('John Doe').closest('tr');
    fireEvent.click(johnRow!);

    // ✅ FIXED: 행 클릭은 expand/collapse만 처리하고 onClientClick를 호출하지 않음
    // View 버튼을 클릭해야 onClientClick가 호출됨
    expect(mockProps.onClientClick).not.toHaveBeenCalled();
  });

  it('handles column sort', () => {
    render(<ClientList {...mockProps} />);

    const nameHeader = screen.getByText('Name');
    fireEvent.click(nameHeader);

    expect(mockProps.onColumnSort).toHaveBeenCalledWith('first_name');
  });

  it('displays sort arrows correctly', () => {
    render(<ClientList {...mockProps} />);

    const nameHeader = screen.getByText('Name');
    const arrowElement = nameHeader.querySelector('span[aria-hidden="true"]');
    expect(arrowElement).toHaveTextContent('↑');
  });

  it('shows client tags', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('Musician')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('shows client interest when available', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('handles empty client list', () => {
    render(<ClientList {...mockProps} clients={[]} />);

    // 공통 EmptyState 패턴: 필터 없음일 때 "No clients yet" 사용
    expect(
      screen.getByText(
        /등록된 고객이 없습니다|No clients found|No clients yet/i
      )
    ).toBeInTheDocument();
  });

  it('displays client contact information', () => {
    render(<ClientList {...mockProps} />);

    expect(screen.getByText('123-456-7890')).toBeInTheDocument();
    expect(screen.getByText('098-765-4321')).toBeInTheDocument();
  });

  // Note: Instruments column was removed, so this test is no longer applicable
  // Instrument connection status is no longer displayed in the table

  it('handles clients with missing optional fields', () => {
    const clientWithMissingFields: Client = {
      id: '3',
      first_name: 'Bob',
      last_name: 'Johnson',
      email: null,
      contact_number: null,
      tags: [],
      client_number: null,
      interest: null,
      note: null,
      created_at: '2023-01-03T00:00:00Z',
    };

    render(<ClientList {...mockProps} clients={[clientWithMissingFields]} />);

    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText('No contact')).toBeInTheDocument(); // For missing contact
  });

  it('handles client with null tags safely', () => {
    const clientWithNullTags: Client = {
      id: '4',
      first_name: 'Alice',
      last_name: 'Williams',
      email: 'alice@example.com',
      contact_number: '111-222-3333',
      tags: null as unknown as string[], // null tags - edge case
      client_number: null,
      interest: null,
      note: null,
      created_at: '2023-01-04T00:00:00Z',
    };

    // null tags가 있어도 에러 없이 렌더링되어야 함
    expect(() => {
      render(<ClientList {...mockProps} clients={[clientWithNullTags]} />);
    }).not.toThrow();

    expect(screen.getByText('Alice Williams')).toBeInTheDocument();
  });

  it('handles client with undefined tags safely', () => {
    const clientWithUndefinedTags: Client = {
      id: '5',
      first_name: 'Charlie',
      last_name: 'Brown',
      email: 'charlie@example.com',
      contact_number: '444-555-6666',
      tags: undefined as unknown as string[], // undefined tags - edge case
      client_number: null,
      interest: null,
      note: null,
      created_at: '2023-01-05T00:00:00Z',
    };

    // undefined tags가 있어도 에러 없이 렌더링되어야 함
    expect(() => {
      render(<ClientList {...mockProps} clients={[clientWithUndefinedTags]} />);
    }).not.toThrow();

    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
  });

  it('handles row click without editing mode interference', () => {
    render(<ClientList {...mockProps} />);

    const johnRow = screen.getByText('John Doe').closest('tr');
    // 편집 모드가 아닐 때 클릭 시 expand/collapse 동작
    fireEvent.click(johnRow!);

    // ✅ FIXED: 행 클릭은 expand/collapse만 처리하고 onClientClick를 호출하지 않음
    expect(mockProps.onClientClick).not.toHaveBeenCalled();
  });

  it('renders tags using null-safe operator', () => {
    const clientWithEmptyTags: Client = {
      id: '6',
      first_name: 'David',
      last_name: 'Lee',
      email: 'david@example.com',
      contact_number: '777-888-9999',
      tags: [], // empty array
      client_number: null,
      interest: null,
      note: null,
      created_at: '2023-01-06T00:00:00Z',
    };

    render(<ClientList {...mockProps} clients={[clientWithEmptyTags]} />);

    // 빈 tags 배열이 있어도 에러 없이 렌더링되어야 함
    expect(screen.getByText('David Lee')).toBeInTheDocument();
  });

  it('calls onDeleteClient with client object (not window.confirm)', () => {
    const onDeleteClient = jest.fn();
    render(<ClientList {...mockProps} onDeleteClient={onDeleteClient} />);

    // Find delete button (should be in actions column)
    const deleteButtons = screen.getAllByLabelText('Delete client');
    expect(deleteButtons.length).toBeGreaterThan(0);

    fireEvent.click(deleteButtons[0]);

    // Should call onDeleteClient with the full client object, not just ID
    expect(onDeleteClient).toHaveBeenCalledWith(mockClients[0]);
    expect(onDeleteClient).toHaveBeenCalledTimes(1);

    // Should NOT use window.confirm
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
