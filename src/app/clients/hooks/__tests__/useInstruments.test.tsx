import { renderHook } from '@/test-utils/render';
import { useInstruments } from '../useInstruments';

// Mock DataContext
const mockFetchInstruments = jest.fn();
const mockCreateInstrument = jest.fn();
const mockUpdateInstrument = jest.fn();
const mockDeleteInstrument = jest.fn();

jest.mock('@/contexts/DataContext', () => ({
  useDataContext: () => ({
    state: {
      instruments: [],
      loading: { instruments: false },
      submitting: { instruments: false },
    },
    actions: {
      fetchInstruments: mockFetchInstruments,
      createInstrument: mockCreateInstrument,
      updateInstrument: mockUpdateInstrument,
      deleteInstrument: mockDeleteInstrument,
    },
  }),
  useInstruments: () => ({
    instruments: [],
    loading: false,
    submitting: false,
    lastUpdated: null,
    fetchInstruments: mockFetchInstruments,
    createInstrument: mockCreateInstrument,
    updateInstrument: mockUpdateInstrument,
    deleteInstrument: mockDeleteInstrument,
  }),
}));

describe('useInstruments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should re-export useUnifiedInstruments', () => {
    const { result } = renderHook(() => useInstruments());

    expect(result.current).toBeDefined();
    expect(typeof result.current.fetchInstruments).toBe('function');
    expect(typeof result.current.createInstrument).toBe('function');
    expect(typeof result.current.updateInstrument).toBe('function');
    expect(typeof result.current.deleteInstrument).toBe('function');
  });

  it('should return instruments array', () => {
    const { result } = renderHook(() => useInstruments());

    expect(Array.isArray(result.current.instruments)).toBe(true);
  });

  it('should return loading state', () => {
    const { result } = renderHook(() => useInstruments());

    expect(typeof result.current.loading).toBe('boolean');
  });

  it('should return submitting state', () => {
    const { result } = renderHook(() => useInstruments());

    expect(typeof result.current.submitting).toBe('boolean');
  });
});
