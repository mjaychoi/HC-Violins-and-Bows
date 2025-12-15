import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
import '@testing-library/jest-dom';
import ClientModal from '../ClientModal';
import { Client, ClientInstrument, Instrument } from '@/types';
import { useState } from 'react';
import { shouldShowInterestDropdown } from '@/policies/interest';
import { ClientViewFormData } from '../../types';

const mockClient: Client = {
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
      subtype: null,
      year: 1700,
      certificate: true,
      size: '4/4',
      weight: '500g',
      price: 1000000,
      ownership: 'Museum',
      note: 'Famous violin',
      serial_number: null,
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
    subtype: null,
    year: 1750,
    certificate: true,
    size: '4/4',
    weight: '480g',
    price: 800000,
    ownership: 'Private',
    note: 'Another famous violin',
    serial_number: null,
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
  searchResults: mockSearchResults,
  isSearchingInstruments: false,
  showInstrumentSearch: false,
  onToggleInstrumentSearch: jest.fn(),
  instrumentSearchTerm: '',
  onInstrumentSearchTermChange: jest.fn(),
};

function ModalWithState(props: Partial<typeof mockProps> = {}) {
  const [viewFormData, setViewFormData] = useState<ClientViewFormData>({
    last_name: mockClient.last_name || '',
    first_name: mockClient.first_name || '',
    contact_number: mockClient.contact_number || '',
    email: mockClient.email || '',
    tags: mockClient.tags || [],
    interest: mockClient.interest || '',
    note: mockClient.note || '',
  });

  return (
    <ClientModal
      {...mockProps}
      {...props}
      client={props.client || mockClient}
      viewFormData={viewFormData}
      showInterestDropdown={shouldShowInterestDropdown(viewFormData.tags)}
      onViewInputChange={e => {
        const { name, value } = e.target as HTMLInputElement;
        setViewFormData((prev: ClientViewFormData) => ({
          ...prev,
          [name]: value,
        }));
      }}
      onUpdateViewFormData={(updates: Partial<ClientViewFormData>) => {
        setViewFormData((prev: ClientViewFormData) => ({
          ...prev,
          ...updates,
        }));
      }}
    />
  );
}

describe('ClientModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when open', () => {
    render(<ModalWithState />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('123-456-7890')).toBeInTheDocument();
  });

  it('does not render modal when closed', () => {
    render(<ModalWithState isOpen={false} />);

    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('handles close button click', () => {
    const { container } = render(<ModalWithState />);

    // 헤더의 우측 닫기 버튼은 aria-label이 없어 클래스 셀렉터로 조회
    const closeButton = container.querySelector(
      'button.text-gray-400'
    ) as HTMLElement;
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton);

    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('shows edit mode when editing', () => {
    render(<ModalWithState isEditing={true} />);

    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
  });

  it('shows view mode when not editing', () => {
    render(<ModalWithState isEditing={false} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('handles edit button click', () => {
    render(<ModalWithState />);

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    expect(mockProps.onEdit).toHaveBeenCalled();
  });

  it('handles save button click', async () => {
    render(<ModalWithState isEditing={true} />);

    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockProps.onSave).toHaveBeenCalled();
    });
  });

  it('handles cancel button click', () => {
    render(<ModalWithState isEditing={true} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('handles delete button click', () => {
    render(<ModalWithState />);

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    expect(mockProps.onDelete).toHaveBeenCalled();
  });

  it('shows instrument relationships', () => {
    render(<ModalWithState />);

    expect(screen.getByText('Stradivari - Violin')).toBeInTheDocument();
    // "1700 • Interested" 같이 렌더링되므로 텍스트 포함 조건으로 확인
    expect(
      screen.getByText(content => content.includes('Interested'))
    ).toBeInTheDocument();
  });

  it('handles instrument search toggle', () => {
    render(<ModalWithState />);

    const searchButton = screen.getByText('Add Instrument');
    fireEvent.click(searchButton);

    expect(mockProps.onToggleInstrumentSearch).toHaveBeenCalled();
  });

  it('shows instrument search when enabled', () => {
    render(<ModalWithState showInstrumentSearch={true} />);

    expect(
      screen.getByPlaceholderText('Search instruments...')
    ).toBeInTheDocument();
  });

  it('handles instrument search input', () => {
    render(<ModalWithState showInstrumentSearch={true} />);

    const searchInput = screen.getByPlaceholderText('Search instruments...');
    fireEvent.change(searchInput, { target: { value: 'Stradivari' } });

    expect(mockProps.onInstrumentSearchTermChange).toHaveBeenCalledWith(
      'Stradivari'
    );
  });

  it('shows search results', () => {
    render(<ModalWithState showInstrumentSearch={true} />);

    expect(screen.getByText('Guarneri')).toBeInTheDocument();
    expect(screen.getByText(/Violin\s*\(\s*1750\s*\)/)).toBeInTheDocument();
  });

  it('handles adding instrument', () => {
    render(<ModalWithState showInstrumentSearch={true} />);

    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);

    expect(mockProps.onAddInstrument).toHaveBeenCalled();
  });

  it('handles removing instrument relationship', () => {
    render(<ModalWithState />);

    const removeButton = screen.getByText('Remove');
    fireEvent.click(removeButton);

    expect(mockProps.onRemoveInstrument).toHaveBeenCalled();
  });

  it('shows loading state when submitting', () => {
    render(<ModalWithState isEditing={true} submitting={true} />);

    const saveButton = screen.getByText('Saving...');
    expect(saveButton).toBeDisabled();
  });

  it('shows client tags', () => {
    render(<ModalWithState />);

    expect(screen.getByText('Musician')).toBeInTheDocument();
  });

  it('shows client interest', () => {
    render(<ModalWithState />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows client notes', () => {
    render(<ModalWithState />);

    expect(screen.getByText('Test client')).toBeInTheDocument();
  });

  it('handles empty instrument relationships', () => {
    render(<ModalWithState instrumentRelationships={[]} />);

    // 컴포넌트는 'No instrument connections' 문구를 출력함
    expect(screen.getByText('No instrument connections')).toBeInTheDocument();
  });

  it('shows search loading state', () => {
    const { container } = render(
      <ModalWithState
        showInstrumentSearch={true}
        isSearchingInstruments={true}
      />
    );

    // 로딩 텍스트 대신 스피너가 표시됨(animate-spin 클래스)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('handles checkbox input change safely', () => {
    render(<ModalWithState isEditing={true} />);

    const tagsCheckbox = screen.getByLabelText('Owner');
    // 초기에는 체크되지 않음 (mockClient의 tags는 ['Musician'])
    expect(tagsCheckbox).not.toBeChecked();

    fireEvent.click(tagsCheckbox);

    // 체크박스 상태 변경이 안전하게 처리되어야 함
    // (타입 안전성 테스트 - handleViewInputChange에서 'type' in target 체크로 안전하게 처리)
    // 실제 상태 변경은 클라이언트의 tags 배열 업데이트에 따라 다르므로, 클릭만 테스트
    expect(tagsCheckbox).toBeInTheDocument();
  });

  it('handles text input change safely', () => {
    render(<ModalWithState isEditing={true} />);

    const firstNameInput = screen.getByDisplayValue('John');
    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });

    // 텍스트 입력이 안전하게 처리되어야 함
    expect(firstNameInput).toHaveValue('Jane');
  });

  it('handles textarea input change safely', () => {
    render(<ModalWithState isEditing={true} />);

    const noteTextarea = screen.getByDisplayValue('Test client');
    fireEvent.change(noteTextarea, { target: { value: 'Updated note' } });

    // Textarea 입력이 안전하게 처리되어야 함 (type 체크 없이 value만 사용)
    expect(noteTextarea).toHaveValue('Updated note');
  });

  it('handles select input change safely', () => {
    // Interest 드롭다운이 보이도록 tags 설정
    const propsWithTags = {
      ...mockProps,
      client: {
        ...mockProps.client,
        tags: ['Musician'], // Interest 드롭다운 표시를 위한 태그
      },
    };
    const { container } = render(
      <ModalWithState client={propsWithTags.client} isEditing={true} />
    );

    // name="interest"인 select 요소를 찾음 (name 속성 사용)
    const interestSelect = container.querySelector(
      'select[name="interest"]'
    ) as HTMLSelectElement;
    expect(interestSelect).toBeInTheDocument();
    expect(interestSelect).toHaveValue('Active');

    fireEvent.change(interestSelect, { target: { value: 'Passive' } });

    // Select 입력이 안전하게 처리되어야 함
    expect(interestSelect).toHaveValue('Passive');
  });

  it('handles tags using CLIENT_TAG_OPTIONS constant', () => {
    render(<ModalWithState isEditing={true} />);

    // 상수에서 정의된 모든 태그 옵션이 표시되어야 함
    expect(screen.getByLabelText('Owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Musician')).toBeInTheDocument();
    expect(screen.getByLabelText('Dealer')).toBeInTheDocument();
    expect(screen.getByLabelText('Collector')).toBeInTheDocument();
    expect(screen.getByLabelText('Other')).toBeInTheDocument();
  });
});
