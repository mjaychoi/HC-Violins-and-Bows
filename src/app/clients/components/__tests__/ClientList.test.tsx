import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
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

  it('handles empty client list without filters', () => {
    render(<ClientList {...mockProps} clients={[]} hasActiveFilters={false} />);

    // 공통 EmptyState 패턴: 필터 없음일 때 "No clients yet" 사용
    expect(
      screen.getByText(/No clients yet|등록된 고객이 없습니다/i)
    ).toBeInTheDocument();
  });

  it('handles empty client list with active filters', () => {
    render(
      <ClientList
        {...mockProps}
        clients={[]}
        hasActiveFilters={true}
        onResetFilters={jest.fn()}
      />
    );

    // 필터 활성화 시에는 필터 전용 메시지가 보여야 함
    expect(
      screen.getByText('No clients found matching your filters')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Try adjusting your filters or clearing them to see all clients.'
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

  it('allows inline editing via row actions and saves changes', () => {
    const onUpdateClient = jest
      .fn()
      .mockResolvedValue(undefined) as jest.MockedFunction<
      (id: string, updates: Partial<Client>) => Promise<void>
    >;

    render(
      <ClientList
        {...mockProps}
        clients={[mockClients[0]]}
        onUpdateClient={onUpdateClient}
      />
    );

    // Row actions 메뉴 열기
    const moreActionsButton = screen.getByLabelText('More actions');
    fireEvent.click(moreActionsButton);

    // Edit 선택 → 인라인 편집 모드 진입
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const nameInput = screen.getByPlaceholderText(
      'Full name'
    ) as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText('Email') as HTMLInputElement;

    // 이름과 이메일 수정
    fireEvent.change(nameInput, { target: { value: 'John Updated' } });
    fireEvent.change(emailInput, { target: { value: 'updated@example.com' } });

    // 저장 버튼 클릭
    const saveButton = screen.getByTitle('Save changes');
    fireEvent.click(saveButton);

    expect(onUpdateClient).toHaveBeenCalledWith(
      mockClients[0].id,
      expect.objectContaining({
        first_name: 'John',
        last_name: 'Updated',
        email: 'updated@example.com',
      })
    );
  });

  it('allows cancelling inline editing without calling onUpdateClient', () => {
    const onUpdateClient = jest
      .fn()
      .mockResolvedValue(undefined) as jest.MockedFunction<
      (id: string, updates: Partial<Client>) => Promise<void>
    >;

    render(
      <ClientList
        {...mockProps}
        clients={[mockClients[0]]}
        onUpdateClient={onUpdateClient}
      />
    );

    // Row actions 메뉴 열기 후 Edit
    const moreActionsButton = screen.getByLabelText('More actions');
    fireEvent.click(moreActionsButton);
    fireEvent.click(screen.getByText('Edit'));

    // Cancel 버튼 클릭
    const cancelButton = screen.getByTitle('Cancel editing');
    fireEvent.click(cancelButton);

    expect(onUpdateClient).not.toHaveBeenCalled();
    // 원래 Name 셀 텍스트가 다시 보이는지 확인
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should expand and collapse client row', () => {
    render(<ClientList {...mockProps} clients={[mockClients[0]]} />);

    const johnRow = screen.getByText('John Doe').closest('tr');
    expect(johnRow).toBeInTheDocument();

    // Click to expand
    fireEvent.click(johnRow!);

    // Click again to collapse
    fireEvent.click(johnRow!);
  });

  it('should handle pagination', () => {
    const onPageChange = jest.fn();
    render(
      <ClientList
        {...mockProps}
        currentPage={1}
        totalPages={3}
        totalCount={60}
        pageSize={20}
        onPageChange={onPageChange}
      />
    );

    // Pagination should be rendered
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should highlight newly created client', () => {
    render(
      <ClientList
        {...mockProps}
        clients={[mockClients[0]]}
        newlyCreatedClientId="1"
      />
    );

    const johnRow = screen.getByText('John Doe').closest('tr');
    expect(johnRow).toHaveClass('ring-2', 'ring-green-400', 'bg-green-50');
  });

  it('should handle full name editing', () => {
    const onUpdateClient = jest
      .fn()
      .mockResolvedValue(undefined) as jest.MockedFunction<
      (id: string, updates: Partial<Client>) => Promise<void>
    >;

    render(
      <ClientList
        {...mockProps}
        clients={[mockClients[0]]}
        onUpdateClient={onUpdateClient}
      />
    );

    // Enter edit mode
    const moreActionsButton = screen.getByLabelText('More actions');
    fireEvent.click(moreActionsButton);
    fireEvent.click(screen.getByText('Edit'));

    // Edit full name
    const nameInput = screen.getByPlaceholderText(
      'Full name'
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'John Updated Doe' } });

    // Save
    const saveButton = screen.getByTitle('Save changes');
    fireEvent.click(saveButton);

    expect(onUpdateClient).toHaveBeenCalledWith(
      mockClients[0].id,
      expect.objectContaining({
        first_name: 'John Updated',
        last_name: 'Doe',
      })
    );
  });

  it('should handle single word name as first name', () => {
    const onUpdateClient = jest
      .fn()
      .mockResolvedValue(undefined) as jest.MockedFunction<
      (id: string, updates: Partial<Client>) => Promise<void>
    >;

    render(
      <ClientList
        {...mockProps}
        clients={[mockClients[0]]}
        onUpdateClient={onUpdateClient}
      />
    );

    // Enter edit mode
    const moreActionsButton = screen.getByLabelText('More actions');
    fireEvent.click(moreActionsButton);
    fireEvent.click(screen.getByText('Edit'));

    // Edit with single word
    const nameInput = screen.getByPlaceholderText(
      'Full name'
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'SingleName' } });

    // Save
    const saveButton = screen.getByTitle('Save changes');
    fireEvent.click(saveButton);

    expect(onUpdateClient).toHaveBeenCalledWith(
      mockClients[0].id,
      expect.objectContaining({
        first_name: 'SingleName',
        last_name: '',
      })
    );
  });

  it('should handle empty name', () => {
    const onUpdateClient = jest
      .fn()
      .mockResolvedValue(undefined) as jest.MockedFunction<
      (id: string, updates: Partial<Client>) => Promise<void>
    >;

    render(
      <ClientList
        {...mockProps}
        clients={[mockClients[0]]}
        onUpdateClient={onUpdateClient}
      />
    );

    // Enter edit mode
    const moreActionsButton = screen.getByLabelText('More actions');
    fireEvent.click(moreActionsButton);
    fireEvent.click(screen.getByText('Edit'));

    // Clear name
    const nameInput = screen.getByPlaceholderText(
      'Full name'
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '' } });

    // Save
    const saveButton = screen.getByTitle('Save changes');
    fireEvent.click(saveButton);

    expect(onUpdateClient).toHaveBeenCalledWith(
      mockClients[0].id,
      expect.objectContaining({
        first_name: '',
        last_name: '',
      })
    );
  });

  it('should handle keyboard navigation for row expansion', () => {
    render(<ClientList {...mockProps} clients={[mockClients[0]]} />);

    const johnName = screen.getByText('John Doe');
    expect(johnName).toBeInTheDocument();

    const johnRow = johnName.closest('tr');
    expect(johnRow).toBeInTheDocument();

    // Press Enter to expand
    fireEvent.keyDown(johnRow!, { key: 'Enter', code: 'Enter' });

    // Press Space to toggle
    fireEvent.keyDown(johnRow!, { key: ' ', code: 'Space' });
  });

  it('should handle save error without closing edit mode', async () => {
    const onUpdateClient = jest
      .fn()
      .mockRejectedValue(new Error('Update failed')) as jest.MockedFunction<
      (id: string, updates: Partial<Client>) => Promise<void>
    >;

    render(
      <ClientList
        {...mockProps}
        clients={[mockClients[0]]}
        onUpdateClient={onUpdateClient}
      />
    );

    // Enter edit mode
    const moreActionsButton = screen.getByLabelText('More actions');
    fireEvent.click(moreActionsButton);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    // Wait for edit mode to activate
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });

    // Try to save (will fail)
    const saveButton = screen.getByTitle('Save changes');
    fireEvent.click(saveButton);

    // Should still be in edit mode after error
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
    });
  });
});
