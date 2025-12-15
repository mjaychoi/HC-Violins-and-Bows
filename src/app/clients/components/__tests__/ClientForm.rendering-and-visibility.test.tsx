// src/app/clients/components/__tests__/ClientForm.rendering-and-visibility.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import '@testing-library/jest-dom';
import ClientForm from '../ClientForm';

jest.mock('@/hooks/useUnifiedData', () => ({
  useUnifiedClients: jest.fn(() => ({
    clients: [],
    loading: false,
    fetchClients: jest.fn(),
  })),
}));

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

const mockProps = {
  isOpen: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  submitting: false,
};

describe('ClientForm - 렌더링/표시', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('열려 있을 때 폼 렌더', () => {
    render(<ClientForm {...mockProps} />);
    expect(screen.getByText('Add New Client')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter last name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter first name')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter contact number')
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter email address')
    ).toBeInTheDocument();
  });

  it('닫혀 있을 때 렌더 안 함', () => {
    render(<ClientForm {...mockProps} isOpen={false} />);
    expect(screen.queryByText('Add New Client')).not.toBeInTheDocument();
  });

  it('Close 버튼 클릭 시 onClose 호출', () => {
    render(<ClientForm {...mockProps} />);
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('태그에 따라 Interest 드롭다운 표시', () => {
    const mockUseFormState = jest.mocked(
      require('@/hooks/useFormState')
    ).useFormState;
    mockUseFormState.mockReturnValue({
      formData: {
        last_name: '',
        first_name: '',
        contact_number: '',
        email: '',
        tags: ['Musician'],
        interest: '',
        note: '',
      },
      updateField: jest.fn(),
      resetForm: jest.fn(),
    });
    render(<ClientForm {...mockProps} />);
    expect(screen.getByLabelText('Interest')).toBeInTheDocument();
  });
});
