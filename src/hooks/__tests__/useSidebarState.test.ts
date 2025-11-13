import { renderHook, act } from '@testing-library/react';
import { useSidebarState } from '../useSidebarState';

describe('useSidebarState', () => {
  it('should initialize with default value (false)', () => {
    const { result } = renderHook(() => useSidebarState());

    expect(result.current.isExpanded).toBe(false);
  });

  it('should initialize with custom value using setIsExpanded', () => {
    const { result } = renderHook(() => useSidebarState());

    expect(result.current.isExpanded).toBe(false);

    act(() => {
      result.current.setIsExpanded(true);
    });

    expect(result.current.isExpanded).toBe(true);
  });

  it('should toggle sidebar', () => {
    const { result } = renderHook(() => useSidebarState());

    expect(result.current.isExpanded).toBe(false);

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.isExpanded).toBe(true);

    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.isExpanded).toBe(false);
  });

  it('should expand sidebar', () => {
    const { result } = renderHook(() => useSidebarState());

    act(() => {
      result.current.expandSidebar();
    });

    expect(result.current.isExpanded).toBe(true);
  });

  it('should collapse sidebar', () => {
    const { result } = renderHook(() => useSidebarState());

    // First expand it
    act(() => {
      result.current.expandSidebar();
    });

    expect(result.current.isExpanded).toBe(true);

    // Then collapse it
    act(() => {
      result.current.collapseSidebar();
    });

    expect(result.current.isExpanded).toBe(false);
  });

  it('should allow direct setIsExpanded', () => {
    const { result } = renderHook(() => useSidebarState());

    act(() => {
      result.current.setIsExpanded(true);
    });

    expect(result.current.isExpanded).toBe(true);

    act(() => {
      result.current.setIsExpanded(false);
    });

    expect(result.current.isExpanded).toBe(false);
  });

  it('should maintain state across multiple operations', () => {
    const { result } = renderHook(() => useSidebarState());

    act(() => {
      result.current.expandSidebar();
      result.current.collapseSidebar();
      result.current.toggleSidebar();
    });

    expect(result.current.isExpanded).toBe(true);
  });

  it('should handle rapid toggles', () => {
    const { result } = renderHook(() => useSidebarState());

    act(() => {
      result.current.toggleSidebar();
      result.current.toggleSidebar();
      result.current.toggleSidebar();
    });

    expect(result.current.isExpanded).toBe(true);
  });

  it('should work with expanded state set programmatically', () => {
    const { result } = renderHook(() => useSidebarState());

    // Set to expanded state
    act(() => {
      result.current.setIsExpanded(true);
    });

    expect(result.current.isExpanded).toBe(true);

    // Then toggle it
    act(() => {
      result.current.toggleSidebar();
    });

    expect(result.current.isExpanded).toBe(false);
  });
});
