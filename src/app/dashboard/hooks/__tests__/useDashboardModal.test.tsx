import { renderHook, act } from '@testing-library/react';
import { useDashboardModal } from '../useDashboardModal';
import { Instrument } from '@/types';

// Mock useModalState
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockOpenEditModal = jest.fn();
const mockSetSelectedItem = jest.fn();

jest.mock('@/hooks/useModalState', () => ({
  useModalState: jest.fn(() => ({
    isOpen: false,
    isEditing: false,
    openModal: mockOpenModal,
    closeModal: mockCloseModal,
    openEditModal: mockOpenEditModal,
    selectedItem: null,
    setSelectedItem: mockSetSelectedItem,
  })),
}));

describe('useDashboardModal', () => {
  const mockInstrument: Instrument = {
    id: 'inst-1',
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: null,
    serial_number: 'SN123',
    year: 1700,
    ownership: null,
    size: null,
    weight: null,
    note: null,
    price: null,
    certificate: false,
    status: 'Available',
    created_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should provide initial state', () => {
    const { result } = renderHook(() => useDashboardModal());

    expect(result.current.isModalOpen).toBe(false);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.selectedItem).toBeNull();
    expect(result.current.confirmItemId).toBeNull();
    expect(result.current.isConfirmDialogOpen).toBe(false);
  });

  it('should open modal when handleAddItem is called', () => {
    const { result } = renderHook(() => useDashboardModal());

    act(() => {
      result.current.handleAddItem();
    });

    expect(mockOpenModal).toHaveBeenCalledTimes(1);
  });

  it('should close modal when closeModal is called', () => {
    const { result } = renderHook(() => useDashboardModal());

    act(() => {
      result.current.closeModal();
    });

    expect(mockCloseModal).toHaveBeenCalledTimes(1);
  });

  it('should open edit modal when openEditModal is called', () => {
    const { result } = renderHook(() => useDashboardModal());

    act(() => {
      result.current.openEditModal(mockInstrument);
    });

    expect(mockOpenEditModal).toHaveBeenCalledWith(mockInstrument);
  });

  it('should set confirm item id when handleRequestDelete is called', () => {
    const { result } = renderHook(() => useDashboardModal());

    act(() => {
      result.current.handleRequestDelete(mockInstrument.id);
    });

    expect(result.current.confirmItemId).toBe(mockInstrument.id);
    expect(result.current.isConfirmDialogOpen).toBe(true);
  });

  it('should clear confirm item id when handleCancelDelete is called', () => {
    const { result } = renderHook(() => useDashboardModal());

    act(() => {
      result.current.handleRequestDelete(mockInstrument.id);
    });

    expect(result.current.isConfirmDialogOpen).toBe(true);

    act(() => {
      result.current.handleCancelDelete();
    });

    expect(result.current.confirmItemId).toBeNull();
    expect(result.current.isConfirmDialogOpen).toBe(false);
  });

  it('should update isConfirmDialogOpen based on confirmItemId', () => {
    const { result } = renderHook(() => useDashboardModal());

    expect(result.current.isConfirmDialogOpen).toBe(false);

    act(() => {
      result.current.handleRequestDelete(mockInstrument.id);
    });

    expect(result.current.isConfirmDialogOpen).toBe(true);

    act(() => {
      result.current.handleCancelDelete();
    });

    expect(result.current.isConfirmDialogOpen).toBe(false);
  });

  it('should handle multiple delete requests', () => {
    const { result } = renderHook(() => useDashboardModal());

    const instrument2Id = 'inst-2';

    act(() => {
      result.current.handleRequestDelete(mockInstrument.id);
    });

    expect(result.current.confirmItemId).toBe(mockInstrument.id);

    act(() => {
      result.current.handleRequestDelete(instrument2Id);
    });

    expect(result.current.confirmItemId).toBe(instrument2Id);
  });

  it('should call onDelete when handleConfirmDelete is called', async () => {
    const mockOnDelete = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDashboardModal({ onDelete: mockOnDelete })
    );

    act(() => {
      result.current.handleRequestDelete(mockInstrument.id);
    });

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(mockOnDelete).toHaveBeenCalledWith(mockInstrument.id);
    expect(result.current.confirmItemId).toBeNull();
  });
});
