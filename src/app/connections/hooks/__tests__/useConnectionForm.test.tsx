import { renderHook, act } from '@testing-library/react';
import { useConnectionForm } from '../useConnectionForm';

// Mock useModalState
jest.mock('@/hooks/useModalState', () => ({
  useModalState: jest.fn(() => ({
    isOpen: false,
    openModal: jest.fn(),
    resetModal: jest.fn(),
  })),
}));

describe('useConnectionForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useConnectionForm());

    expect(result.current.showConnectionModal).toBe(false);
    expect(result.current.selectedClient).toBe('');
    expect(result.current.selectedInstrument).toBe('');
    expect(result.current.relationshipType).toBe('Interested');
    expect(result.current.connectionNotes).toBe('');
    expect(result.current.clientSearchTerm).toBe('');
    expect(result.current.instrumentSearchTerm).toBe('');
    expect(result.current.connectionSearchTerm).toBe('');
  });

  it('should update selectedClient', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setSelectedClient('client1');
    });

    expect(result.current.selectedClient).toBe('client1');
  });

  it('should update selectedInstrument', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setSelectedInstrument('instrument1');
    });

    expect(result.current.selectedInstrument).toBe('instrument1');
  });

  it('should update relationshipType', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setRelationshipType('Owned');
    });

    expect(result.current.relationshipType).toBe('Owned');
  });

  it('should update connectionNotes', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setConnectionNotes('Test notes');
    });

    expect(result.current.connectionNotes).toBe('Test notes');
  });

  it('should update clientSearchTerm', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setClientSearchTerm('John');
    });

    expect(result.current.clientSearchTerm).toBe('John');
  });

  it('should update instrumentSearchTerm', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setInstrumentSearchTerm('Violin');
    });

    expect(result.current.instrumentSearchTerm).toBe('Violin');
  });

  it('should update connectionSearchTerm', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setConnectionSearchTerm('search term');
    });

    expect(result.current.connectionSearchTerm).toBe('search term');
  });

  it('should reset form to default values', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setSelectedClient('client1');
      result.current.setSelectedInstrument('instrument1');
      result.current.setRelationshipType('Owned');
      result.current.setConnectionNotes('Test notes');
      result.current.setClientSearchTerm('John');
      result.current.setInstrumentSearchTerm('Violin');
      result.current.setConnectionSearchTerm('search');
    });

    act(() => {
      result.current.resetForm();
    });

    expect(result.current.selectedClient).toBe('');
    expect(result.current.selectedInstrument).toBe('');
    expect(result.current.relationshipType).toBe('Interested');
    expect(result.current.connectionNotes).toBe('');
    // Note: resetForm does not reset search terms, only form fields
    // Search terms are managed separately
  });

  it('should call resetModal when resetForm is called', () => {
    const { useModalState } = require('@/hooks/useModalState');
    const mockResetModal = jest.fn();
    useModalState.mockReturnValue({
      isOpen: false,
      openModal: jest.fn(),
      resetModal: mockResetModal,
    });

    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.resetForm();
    });

    expect(mockResetModal).toHaveBeenCalled();
  });

  it('should call openModal when openModal is called', () => {
    const { useModalState } = require('@/hooks/useModalState');
    const mockOpenModal = jest.fn();
    useModalState.mockReturnValue({
      isOpen: false,
      openModal: mockOpenModal,
      resetModal: jest.fn(),
    });

    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.openModal();
    });

    expect(mockOpenModal).toHaveBeenCalled();
  });

  it('should reset form when closeModal is called', () => {
    const { result } = renderHook(() => useConnectionForm());

    act(() => {
      result.current.setSelectedClient('client1');
      result.current.setConnectionNotes('Test notes');
    });

    act(() => {
      result.current.closeModal();
    });

    expect(result.current.selectedClient).toBe('');
    expect(result.current.selectedInstrument).toBe('');
    expect(result.current.relationshipType).toBe('Interested');
    expect(result.current.connectionNotes).toBe('');
  });

  it('should handle all relationship types', () => {
    const { result } = renderHook(() => useConnectionForm());

    const relationshipTypes: Array<
      'Interested' | 'Booked' | 'Sold' | 'Owned'
    > = ['Interested', 'Booked', 'Sold', 'Owned'];

    relationshipTypes.forEach(type => {
      act(() => {
        result.current.setRelationshipType(type);
      });

      expect(result.current.relationshipType).toBe(type);
    });
  });
});

