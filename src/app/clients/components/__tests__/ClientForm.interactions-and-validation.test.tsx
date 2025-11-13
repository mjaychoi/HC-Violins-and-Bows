// src/app/clients/components/__tests__/ClientForm.interactions-and-validation.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClientForm from '../ClientForm';

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
    },
    updateField: jest.fn(),
    resetForm: jest.fn(),
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
    const submitButton = screen.getByRole('button', { name: 'Loading...' });
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

  it('빈 폼 제출 시 onSubmit 호출(현재 컴포넌트 동작 기준)', () => {
    render(<ClientForm {...baseProps} />);
    const submitButton = screen.getByRole('button', { name: /add client/i });
    fireEvent.click(submitButton);
    expect(baseProps.onSubmit).toHaveBeenCalled();
  });
});
