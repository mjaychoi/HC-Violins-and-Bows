import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClientModal from '../ClientModal';
import { Client, ClientInstrument, Instrument } from '@/types';

const mockClient: Client = {
  id: '1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: ['Musician'],
  interest: 'Active',
  note: 'Test client',
  created_at: '2023-01-01T00:00:00Z',
};

const mockInstrumentRelationships: ClientInstrument[] = [
  {
    id: '1',
    client_id: '1',
    instrument_id: '1',
    relationship_type: 'Interested',
    notes: 'Test relationship',
    created_at: '2023-01-01T00:00:00Z',
    client: mockClient,
    instrument: {
      id: '1',
      status: 'Available',
      maker: 'Stradivari',
      type: 'Violin',
      year: 1700,
      certificate: true,
      size: '4/4',
      weight: '500g',
      price: 1000000,
      ownership: 'Museum',
      note: 'Famous violin',
      created_at: '2023-01-01T00:00:00Z',
    },
  },
];

const mockSearchResults: Instrument[] = [
  {
    id: '2',
    status: 'Available',
    maker: 'Guarneri',
    type: 'Violin',
    year: 1750,
    certificate: true,
    size: '4/4',
    weight: '480g',
    price: 800000,
    ownership: 'Private',
    note: 'Another famous violin',
    created_at: '2023-01-01T00:00:00Z',
  },
];

const mockProps = {
  isOpen: true,
  onClose: jest.fn(),
  client: mockClient,
  isEditing: false,
  onEdit: jest.fn(),
  onSave: jest.fn(),
  onDelete: jest.fn(),
  onCancel: jest.fn(),
  submitting: false,
  instrumentRelationships: mockInstrumentRelationships,
  onAddInstrument: jest.fn(),
  onRemoveInstrument: jest.fn(),
  onSearchInstruments: jest.fn(),
  searchResults: mockSearchResults,
  isSearchingInstruments: false,
  showInstrumentSearch: false,
  onToggleInstrumentSearch: jest.fn(),
  instrumentSearchTerm: '',
  onInstrumentSearchTermChange: jest.fn(),
};

describe('ClientModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when open', () => {
    render(<ClientModal {...mockProps} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('123-456-7890')).toBeInTheDocument();
  });

  it('does not render modal when closed', () => {
    render(<ClientModal {...mockProps} isOpen={false} />);

    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('handles close button click', () => {
    const { container } = render(<ClientModal {...mockProps} />);

    // 헤더의 우측 닫기 버튼은 aria-label이 없어 클래스 셀렉터로 조회
    const closeButton = container.querySelector(
      'button.text-gray-400'
    ) as HTMLElement;
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton);

    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('shows edit mode when editing', () => {
    render(<ClientModal {...mockProps} isEditing={true} />);

    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
  });

  it('shows view mode when not editing', () => {
    render(<ClientModal {...mockProps} isEditing={false} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('handles edit button click', () => {
    render(<ClientModal {...mockProps} />);

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    expect(mockProps.onEdit).toHaveBeenCalled();
  });

  it('handles save button click', async () => {
    render(<ClientModal {...mockProps} isEditing={true} />);

    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockProps.onSave).toHaveBeenCalled();
    });
  });

  it('handles cancel button click', () => {
    render(<ClientModal {...mockProps} isEditing={true} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('handles delete button click', () => {
    render(<ClientModal {...mockProps} />);

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    expect(mockProps.onDelete).toHaveBeenCalled();
  });

  it('shows instrument relationships', () => {
    render(<ClientModal {...mockProps} />);

    expect(screen.getByText('Stradivari - Violin')).toBeInTheDocument();
    // "1700 • Interested" 같이 렌더링되므로 텍스트 포함 조건으로 확인
    expect(
      screen.getByText(content => content.includes('Interested'))
    ).toBeInTheDocument();
  });

  it('handles instrument search toggle', () => {
    render(<ClientModal {...mockProps} />);

    const searchButton = screen.getByText('Add Instrument');
    fireEvent.click(searchButton);

    expect(mockProps.onToggleInstrumentSearch).toHaveBeenCalled();
  });

  it('shows instrument search when enabled', () => {
    render(<ClientModal {...mockProps} showInstrumentSearch={true} />);

    expect(
      screen.getByPlaceholderText('Search instruments...')
    ).toBeInTheDocument();
  });

  it('handles instrument search input', () => {
    render(<ClientModal {...mockProps} showInstrumentSearch={true} />);

    const searchInput = screen.getByPlaceholderText('Search instruments...');
    fireEvent.change(searchInput, { target: { value: 'Stradivari' } });

    expect(mockProps.onInstrumentSearchTermChange).toHaveBeenCalledWith(
      'Stradivari'
    );
  });

  it('shows search results', () => {
    render(<ClientModal {...mockProps} showInstrumentSearch={true} />);

    expect(screen.getByText('Guarneri')).toBeInTheDocument();
    expect(screen.getByText(/Violin\s*\(\s*1750\s*\)/)).toBeInTheDocument();
  });

  it('handles adding instrument', () => {
    render(<ClientModal {...mockProps} showInstrumentSearch={true} />);

    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);

    expect(mockProps.onAddInstrument).toHaveBeenCalled();
  });

  it('handles removing instrument relationship', () => {
    render(<ClientModal {...mockProps} />);

    const removeButton = screen.getByText('Remove');
    fireEvent.click(removeButton);

    expect(mockProps.onRemoveInstrument).toHaveBeenCalled();
  });

  it('shows loading state when submitting', () => {
    render(<ClientModal {...mockProps} isEditing={true} submitting={true} />);

    const saveButton = screen.getByText('Saving...');
    expect(saveButton).toBeDisabled();
  });

  it('shows client tags', () => {
    render(<ClientModal {...mockProps} />);

    expect(screen.getByText('Musician')).toBeInTheDocument();
  });

  it('shows client interest', () => {
    render(<ClientModal {...mockProps} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows client notes', () => {
    render(<ClientModal {...mockProps} />);

    expect(screen.getByText('Test client')).toBeInTheDocument();
  });

  it('handles empty instrument relationships', () => {
    render(<ClientModal {...mockProps} instrumentRelationships={[]} />);

    // 컴포넌트는 'No instrument connections' 문구를 출력함
    expect(screen.getByText('No instrument connections')).toBeInTheDocument();
  });

  it('shows search loading state', () => {
    const { container } = render(
      <ClientModal
        {...mockProps}
        showInstrumentSearch={true}
        isSearchingInstruments={true}
      />
    );

    // 로딩 텍스트 대신 스피너가 표시됨(animate-spin 클래스)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
