import { renderHook, act } from '@testing-library/react';
import { useInstrumentView } from '../useInstrumentView';
import type { Instrument } from '@/types';

const mockInstrument: Instrument = {
  id: 'instrument-1',
  status: 'Available',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: null,
  year: 1720,
  certificate: true,
  certificate_name: null,
  cost_price: null,
  consignment_price: null,
  size: '4/4',
  weight: null,
  price: 1000000,
  ownership: null,
  note: null,
  serial_number: 'STR-001',
  created_at: '2024-01-01T00:00:00Z',
};

describe('useInstrumentView', () => {
  it('should initialize with modal closed and no selected instrument', () => {
    const { result } = renderHook(() => useInstrumentView());

    expect(result.current.showViewModal).toBe(false);
    expect(result.current.selectedInstrument).toBeNull();
  });

  it('should open modal with selected instrument', () => {
    const { result } = renderHook(() => useInstrumentView());

    act(() => {
      result.current.openInstrumentView(mockInstrument);
    });

    expect(result.current.showViewModal).toBe(true);
    expect(result.current.selectedInstrument).toEqual(mockInstrument);
  });

  it('should close modal and clear selected instrument', () => {
    const { result } = renderHook(() => useInstrumentView());

    // Open modal first
    act(() => {
      result.current.openInstrumentView(mockInstrument);
    });

    expect(result.current.showViewModal).toBe(true);
    expect(result.current.selectedInstrument).toEqual(mockInstrument);

    // Close modal
    act(() => {
      result.current.closeInstrumentView();
    });

    expect(result.current.showViewModal).toBe(false);
    expect(result.current.selectedInstrument).toBeNull();
  });

  it('should update selected instrument when opening different instrument', () => {
    const { result } = renderHook(() => useInstrumentView());

    const instrument1: Instrument = {
      ...mockInstrument,
      id: 'instrument-1',
      maker: 'Stradivarius',
    };

    const instrument2: Instrument = {
      ...mockInstrument,
      id: 'instrument-2',
      maker: 'Guarneri',
    };

    act(() => {
      result.current.openInstrumentView(instrument1);
    });

    expect(result.current.selectedInstrument?.id).toBe('instrument-1');
    expect(result.current.selectedInstrument?.maker).toBe('Stradivarius');

    act(() => {
      result.current.openInstrumentView(instrument2);
    });

    expect(result.current.selectedInstrument?.id).toBe('instrument-2');
    expect(result.current.selectedInstrument?.maker).toBe('Guarneri');
  });

  it('should handle closing when modal is already closed', () => {
    const { result } = renderHook(() => useInstrumentView());

    expect(result.current.showViewModal).toBe(false);

    act(() => {
      result.current.closeInstrumentView();
    });

    expect(result.current.showViewModal).toBe(false);
    expect(result.current.selectedInstrument).toBeNull();
  });

  it('should maintain state across re-renders', () => {
    const { result, rerender } = renderHook(() => useInstrumentView());

    act(() => {
      result.current.openInstrumentView(mockInstrument);
    });

    rerender();

    expect(result.current.showViewModal).toBe(true);
    expect(result.current.selectedInstrument).toEqual(mockInstrument);
  });

  it('should return all expected methods and state', () => {
    const { result } = renderHook(() => useInstrumentView());

    expect(result.current).toHaveProperty('showViewModal');
    expect(result.current).toHaveProperty('selectedInstrument');
    expect(result.current).toHaveProperty('openInstrumentView');
    expect(result.current).toHaveProperty('closeInstrumentView');

    expect(typeof result.current.openInstrumentView).toBe('function');
    expect(typeof result.current.closeInstrumentView).toBe('function');
    expect(typeof result.current.showViewModal).toBe('boolean');
  });

  it('should handle multiple open/close cycles', () => {
    const { result } = renderHook(() => useInstrumentView());

    // First cycle
    act(() => {
      result.current.openInstrumentView(mockInstrument);
    });
    expect(result.current.showViewModal).toBe(true);

    act(() => {
      result.current.closeInstrumentView();
    });
    expect(result.current.showViewModal).toBe(false);

    // Second cycle
    act(() => {
      result.current.openInstrumentView(mockInstrument);
    });
    expect(result.current.showViewModal).toBe(true);

    act(() => {
      result.current.closeInstrumentView();
    });
    expect(result.current.showViewModal).toBe(false);
  });
});
