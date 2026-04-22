// src/app/clients/components/__tests__/ClientForm.interactions-and-validation.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
import '@testing-library/jest-dom';
import ClientForm from '../ClientForm';

const mockHandleError = jest.fn();

jest.mock('@/hooks/useDataState', () => ({
  useDataState: jest.fn(() => ({
    data: [],
    addItem: jest.fn(),
    removeItem: jest.fn(),
    clearData: jest.fn(),
    setItems: jest.fn(),
  })),
}));

jest.mock('@/hooks/useDataFetching', () => ({
  useDataFetching: jest.fn(() => ({
    fetchData: jest.fn(),
    loading: false,
    items: [],
  })),
}));

jest.mock('@/hooks/useFormState', () => ({
  useFormState: jest.fn(() => ({
    formData: {
      last_name: '',
      first_name: '',
      contact_number: '',
      email: '',
      tags: [],
      interest: '',
      note: '',
      client_number: '',
    },
    updateField: jest.fn(),
    resetForm: jest.fn(),
  })),
}));

// ✅ FIXED: ToastProvider도 export하도록 mock 수정
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    ...actual,
    useErrorHandler: jest.fn(() => ({
      handleError: mockHandleError,
    })),
  };
});

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedClients: jest.fn(() => ({
    clients: [],
    loading: false,
    submitting: false,
    createClient: jest.fn(),
    updateClient: jest.fn(),
    deleteClient: jest.fn(),
  })),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        or: jest.fn(() => ({
          limit: jest.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
    })),
  },
}));

const baseProps = {
  isOpen: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  onRetryInstrumentLinks: jest.fn(),
  submitting: false,
};

describe('ClientForm - 상호작용/검증/로딩', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Submit 호출', async () => {
    const mockOnSubmit = jest.fn();
    const mockUpdateField = jest.fn();
    const mockUseFormState = jest.mocked(
      require('@/hooks/useFormState')
    ).useFormState;

    mockUseFormState.mockReturnValue({
      formData: {
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '1234567890',
        email: 'john@example.com',
        tags: [],
        interest: '',
        note: '',
        client_number: '',
      },
      updateField: mockUpdateField,
      resetForm: jest.fn(),
    });

    render(<ClientForm {...baseProps} onSubmit={mockOnSubmit} />);
    const submitButton = screen.getByRole('button', { name: /add client/i });
    fireEvent.click(submitButton);
    await waitFor(
      () => {
        expect(mockOnSubmit).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('submitting=true 로딩 상태', () => {
    render(<ClientForm {...baseProps} submitting={true} />);
    // ✅ FIXED: Button 컴포넌트는 loading일 때 "Loading"만 sr-only로 표시 (showLoadingText=false)
    const submitButton = screen.getByRole('button', {
      name: 'Loading Add Client',
    });
    expect(submitButton).toBeDisabled();
  });

  it('태그 체크 및 토글 버튼', () => {
    render(<ClientForm {...baseProps} />);
    const ownerCheckbox = screen.getByLabelText('Owner');
    fireEvent.click(ownerCheckbox);
    expect(ownerCheckbox).toBeInTheDocument();

    const searchButton = screen.getByText('Search for Instruments');
    fireEvent.click(searchButton);
    expect(screen.getByText('Hide Instrument Search')).toBeInTheDocument();
  });

  it('빈 이름으로 제출하면 onSubmit을 호출하지 않고 에러를 표시한다', () => {
    const mockUseFormState = jest.mocked(
      require('@/hooks/useFormState')
    ).useFormState;
    mockUseFormState.mockReturnValue({
      formData: {
        last_name: '',
        first_name: '',
        contact_number: '',
        email: '',
        tags: [],
        interest: '',
        note: '',
        client_number: '',
      },
      updateField: jest.fn(),
      resetForm: jest.fn(),
    });

    render(<ClientForm {...baseProps} />);
    const submitButton = screen.getByRole('button', { name: /add client/i });
    fireEvent.click(submitButton);
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
    expect(mockHandleError).toHaveBeenCalled();
  });

  it('onSubmit에 instruments가 전달되지 않음 (선택된 instruments가 없을 때)', async () => {
    const mockOnSubmit = jest.fn();
    const mockUseFormState = jest.mocked(
      require('@/hooks/useFormState')
    ).useFormState;

    mockUseFormState.mockReturnValue({
      formData: {
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '1234567890',
        email: 'john@example.com',
        tags: [],
        interest: '',
        note: '',
        client_number: '',
      },
      updateField: jest.fn(),
      resetForm: jest.fn(),
    });

    const mockUseDataState = jest.mocked(
      require('@/hooks/useDataState')
    ).useDataState;

    mockUseDataState.mockReturnValue({
      data: [], // 선택된 instruments 없음
      addItem: jest.fn(),
      removeItem: jest.fn(),
      clearData: jest.fn(),
      setItems: jest.fn(),
    });

    render(<ClientForm {...baseProps} onSubmit={mockOnSubmit} />);
    const submitButton = screen.getByRole('button', { name: /add client/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
      // instruments가 undefined로 전달되어야 함
      const callArgs = mockOnSubmit.mock.calls[0];
      expect(callArgs[1]).toBeUndefined();
    });
  });

  it('onSubmit에 선택된 instruments가 전달됨', async () => {
    const mockOnSubmit = jest.fn();
    const mockUseFormState = jest.mocked(
      require('@/hooks/useFormState')
    ).useFormState;

    mockUseFormState.mockReturnValue({
      formData: {
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '1234567890',
        email: 'john@example.com',
        tags: [],
        interest: '',
        note: '',
        client_number: '',
      },
      updateField: jest.fn(),
      resetForm: jest.fn(),
    });

    const mockInstruments = [
      {
        instrument: {
          id: '1',
          status: 'Available' as const,
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
        relationshipType: 'Interested' as const,
      },
    ];

    const mockUseDataState = jest.mocked(
      require('@/hooks/useDataState')
    ).useDataState;

    mockUseDataState.mockReturnValue({
      data: mockInstruments,
      addItem: jest.fn(),
      removeItem: jest.fn(),
      clearData: jest.fn(),
      setItems: jest.fn(),
    });

    render(<ClientForm {...baseProps} onSubmit={mockOnSubmit} />);
    const submitButton = screen.getByRole('button', { name: /add client/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
      // instruments가 전달되어야 함
      const callArgs = mockOnSubmit.mock.calls[0];
      expect(callArgs[1]).toEqual(mockInstruments);
    });
  });

  it('partial success 시 retry affordance를 보여준다', async () => {
    const mockOnSubmit = jest.fn().mockResolvedValue({
      status: 'partial_success',
      clientId: 'client-123',
      failedLinks: [
        {
          instrument: {
            id: '1',
            status: 'Available' as const,
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
          relationshipType: 'Interested' as const,
        },
      ],
    });
    const mockOnRetryInstrumentLinks = jest.fn().mockResolvedValue({
      status: 'full_success',
    });

    const mockUseFormState = jest.mocked(
      require('@/hooks/useFormState')
    ).useFormState;

    mockUseFormState.mockReturnValue({
      formData: {
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '1234567890',
        email: 'john@example.com',
        tags: [],
        interest: '',
        note: '',
        client_number: '',
      },
      updateField: jest.fn(),
      resetForm: jest.fn(),
    });

    const mockUseDataState = jest.mocked(
      require('@/hooks/useDataState')
    ).useDataState;

    mockUseDataState.mockReturnValue({
      data: [
        {
          instrument: {
            id: '1',
            status: 'Available' as const,
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
          relationshipType: 'Interested' as const,
        },
      ],
      addItem: jest.fn(),
      removeItem: jest.fn(),
      clearData: jest.fn(),
      setItems: jest.fn(),
    });

    render(
      <ClientForm
        {...baseProps}
        onSubmit={mockOnSubmit}
        onRetryInstrumentLinks={mockOnRetryInstrumentLinks}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /add client/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Client created, but some instrument links failed')
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /retry failed links/i })
    );

    await waitFor(() => {
      expect(mockOnRetryInstrumentLinks).toHaveBeenCalledWith(
        'client-123',
        expect.any(Array)
      );
    });
  });

  it('instrument links 없이 성공하면 client-only 성공 메시지를 보여준다', async () => {
    const mockOnSubmit = jest.fn().mockResolvedValue({
      status: 'full_success',
      clientId: 'client-123',
    });
    const mockUseFormState = jest.mocked(
      require('@/hooks/useFormState')
    ).useFormState;

    mockUseFormState.mockReturnValue({
      formData: {
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '',
        email: '',
        tags: [],
        interest: '',
        note: '',
        client_number: '',
      },
      updateField: jest.fn(),
      resetForm: jest.fn(),
    });
    const mockUseDataState = jest.mocked(
      require('@/hooks/useDataState')
    ).useDataState;
    mockUseDataState.mockReturnValue({
      data: [],
      addItem: jest.fn(),
      removeItem: jest.fn(),
      clearData: jest.fn(),
      setItems: jest.fn(),
    });

    render(<ClientForm {...baseProps} onSubmit={mockOnSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /add client/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Client created successfully')
      ).toBeInTheDocument();
    });
  });

  it('validation 로직이 구현되어 있음 (통합 테스트에서 검증)', () => {
    // ClientForm에서 validation 로직을 사용하고 있음을 확인
    // 실제 validation 동작은 validationUtils 테스트나 E2E 테스트에서 확인
    const { validateForm } = require('@/utils/validationUtils');
    expect(validateForm).toBeDefined();
    expect(typeof validateForm).toBe('function');

    // validation이 빈 first_name을 감지할 수 있는지 확인
    const result = validateForm(
      { first_name: '', last_name: 'Doe' },
      {
        first_name: [
          { required: true, message: 'First name is required' },
          { minLength: 2 },
        ],
      }
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.first_name).toBeDefined();
  });
});
