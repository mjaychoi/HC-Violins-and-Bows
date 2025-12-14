import { renderHook, act } from '@/test-utils/render';
import { useModalState } from '../useModalState';

describe('useModalState', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useModalState());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.selectedItem).toBeNull();
  });

  it('should initialize with custom values', () => {
    const { result } = renderHook(() =>
      useModalState({ initialOpen: true, initialEditing: true })
    );

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isEditing).toBe(true);
  });

  it('should open modal', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.openModal();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.selectedItem).toBeNull();
  });

  it('should close modal', () => {
    const { result } = renderHook(() => useModalState({ initialOpen: true }));

    act(() => {
      result.current.closeModal();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.selectedItem).toBeNull();
  });

  it('should open edit modal with item', () => {
    const { result } = renderHook(() => useModalState());
    const testItem = { id: '1', name: 'Test' };

    act(() => {
      result.current.openEditModal(testItem);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isEditing).toBe(true);
    expect(result.current.selectedItem).toEqual(testItem);
  });

  it('should open view modal with item', () => {
    const { result } = renderHook(() => useModalState());
    const testItem = { id: '1', name: 'Test' };

    act(() => {
      result.current.openViewModal(testItem);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.selectedItem).toEqual(testItem);
  });

  it('should toggle modal', () => {
    const { result } = renderHook(() => useModalState());

    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggleModal();
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggleModal();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('should reset modal', () => {
    const { result } = renderHook(() => useModalState());
    const testItem = { id: '1', name: 'Test' };

    act(() => {
      result.current.openEditModal(testItem);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isEditing).toBe(true);

    act(() => {
      result.current.resetModal();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.selectedItem).toBeNull();
  });

  it('should allow manual state updates', () => {
    const { result } = renderHook(() => useModalState());

    act(() => {
      result.current.setIsOpen(true);
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.setIsEditing(true);
    });

    expect(result.current.isEditing).toBe(true);

    const testItem = { id: '1', name: 'Test' };
    act(() => {
      result.current.setSelectedItem(testItem);
    });

    expect(result.current.selectedItem).toEqual(testItem);
  });
});
