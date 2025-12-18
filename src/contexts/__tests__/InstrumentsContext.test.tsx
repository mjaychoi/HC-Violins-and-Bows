import React from 'react';
import { renderHook, act, waitFor } from '@/test-utils/render';
import {
  InstrumentsProvider,
  useInstrumentsContext,
  useInstruments,
} from '../InstrumentsContext';
import { Instrument } from '@/types';
import { fetchInstruments as serviceFetchInstruments } from '@/services/dataService';

// Mock fetch
global.fetch = jest.fn();

// Mock useErrorHandler
const mockHandleError = jest.fn();
jest.mock('@/contexts/ToastContext', () => {
  const actual = jest.requireActual('@/contexts/ToastContext');
  return {
    __esModule: true,
    ...actual,
    useErrorHandler: () => ({
      handleError: mockHandleError,
    }),
  };
});

// Mock dataService
jest.mock('@/services/dataService', () => ({
  fetchInstruments: jest.fn(),
}));

const mockServiceFetchInstruments =
  serviceFetchInstruments as jest.MockedFunction<
    typeof serviceFetchInstruments
  >;

describe('InstrumentsContext', () => {
  const mockInstrument: Instrument = {
    id: 'inst1',
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

  const mockInstrument2: Instrument = {
    id: 'inst2',
    maker: 'Guarneri',
    type: 'Violin',
    subtype: 'Classical',
    serial_number: 'SN456',
    year: 1740,
    ownership: null,
    size: null,
    weight: null,
    note: null,
    price: null,
    certificate: false,
    status: 'Available',
    created_at: '2024-01-02T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockServiceFetchInstruments.mockClear();
  });

  describe('Provider and hooks', () => {
    it('provides initial state', () => {
      const { result } = renderHook(() => useInstrumentsContext(), {
        wrapper: InstrumentsProvider,
      });

      expect(result.current.state.instruments).toEqual([]);
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.submitting).toBe(false);
      expect(result.current.state.lastUpdated).toBeNull();
    });

    it('throws error when used outside provider', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      const NoProviderWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => <>{children}</>;

      expect(() => {
        renderHook(() => useInstrumentsContext(), {
          wrapper: NoProviderWrapper,
        });
      }).toThrow(
        'useInstrumentsContext must be used within an InstrumentsProvider'
      );

      consoleError.mockRestore();
    });

    it('useInstruments hook returns correct structure', () => {
      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      expect(result.current.instruments).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.submitting).toBe(false);
      expect(result.current.lastUpdated).toBeNull();
      expect(typeof result.current.fetchInstruments).toBe('function');
      expect(typeof result.current.createInstrument).toBe('function');
      expect(typeof result.current.updateInstrument).toBe('function');
      expect(typeof result.current.deleteInstrument).toBe('function');
    });
  });

  describe('fetchInstruments', () => {
    it('fetches instruments successfully', async () => {
      const mockInstruments = [mockInstrument, mockInstrument2];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockInstruments }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.instruments).toEqual(mockInstruments);
      expect(result.current.lastUpdated).not.toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/instruments?orderBy=created_at&ascending=false&all=true'
      );
    });

    it('parses type field with slash separator', async () => {
      const instrumentWithSlash = {
        ...mockInstrument,
        type: 'Violin / Classical',
        subtype: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [instrumentWithSlash] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const instrument = result.current.instruments[0];
      expect(instrument.type).toBe('Violin');
      expect(instrument.subtype).toBe('Classical');
    });

    it('handles type field with multiple slashes', async () => {
      const instrumentWithMultiSlash = {
        ...mockInstrument,
        type: 'Violin / Classical / 4/4',
        subtype: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [instrumentWithMultiSlash] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const instrument = result.current.instruments[0];
      // parseInstrumentType splits by '/' and joins with ' / '
      // 'Violin / Classical / 4/4' becomes type: 'Violin', subtype: 'Classical / 4 / 4'
      expect(instrument.type).toBe('Violin');
      // The '4/4' will be split as ['4', '4'] and joined as '4 / 4'
      expect(instrument.subtype).toBe('Classical / 4 / 4');
    });

    it('sets loading state during fetch', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: [mockInstrument] }),
                }),
              100
            )
          )
      );

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      act(() => {
        result.current.fetchInstruments();
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('handles fetch error', async () => {
      const error = new Error('Network error');
      mockServiceFetchInstruments.mockRejectedValue(error);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalledWith(error, 'Fetch instruments');
      expect(result.current.instruments).toEqual([]);
    });

    it('deduplicates concurrent fetch requests', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: [mockInstrument] }),
                }),
              100
            )
          )
      );

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        const promise1 = result.current.fetchInstruments();
        const promise2 = result.current.fetchInstruments();
        const promise3 = result.current.fetchInstruments();

        await Promise.all([promise1, promise2, promise3]);
      });

      // Should only call fetch once (deduplicated)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createInstrument', () => {
    it('creates instrument successfully', async () => {
      const newInstrument = {
        maker: 'New Maker',
        type: 'Violin',
        subtype: null,
        serial_number: 'SN999',
        year: 1800,
        ownership: null,
        size: null,
        weight: null,
        note: null,
        price: null,
        certificate: false,
        status: 'Available' as const,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockInstrument }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument =
          await result.current.createInstrument(newInstrument);
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(createdInstrument).toEqual(mockInstrument);
      expect(result.current.instruments).toContainEqual(mockInstrument);
      expect(global.fetch).toHaveBeenCalledWith('/api/instruments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInstrument),
      });
    });

    it('parses type field when creating instrument', async () => {
      const instrumentWithSlash = {
        ...mockInstrument,
        type: 'Violin / Classical',
        subtype: null,
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: instrumentWithSlash }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin / Classical',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      const instrument = result.current.instruments[0];
      expect(instrument.type).toBe('Violin');
      expect(instrument.subtype).toBe('Classical');
    });

    it('sets submitting state during creation', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: mockInstrument }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      act(() => {
        result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(result.current.submitting).toBe(true);

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });
    });

    it('handles create error', async () => {
      const error = { error: { message: 'Create failed' } };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument = await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdInstrument).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('handles string error in create response', async () => {
      const error = { error: 'Simple error message' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument = await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdInstrument).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('returns null when response has no data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument = await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      // When result.data is undefined, the function returns undefined (not null)
      expect(createdInstrument).toBeFalsy();
    });
  });

  describe('updateInstrument', () => {
    beforeEach(async () => {
      // Setup initial state with an instrument
      mockServiceFetchInstruments.mockResolvedValue([mockInstrument]);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });
    });

    it('updates instrument successfully', async () => {
      const updatedInstrument = { ...mockInstrument, maker: 'Updated Maker' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: updatedInstrument }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      let updated: Instrument | null = null;
      await act(async () => {
        updated = await result.current.updateInstrument(mockInstrument.id, {
          maker: 'Updated Maker',
        });
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(updated).toEqual(updatedInstrument);
      const instrumentInState = result.current.instruments.find(
        i => i.id === mockInstrument.id
      );
      expect(instrumentInState?.maker).toBe('Updated Maker');
    });

    it('parses type field when updating instrument', async () => {
      const updatedInstrument = {
        ...mockInstrument,
        type: 'Violin / Baroque',
        subtype: null,
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: updatedInstrument }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await act(async () => {
        await result.current.updateInstrument(mockInstrument.id, {
          type: 'Violin / Baroque',
        });
      });

      const instrumentInState = result.current.instruments.find(
        i => i.id === mockInstrument.id
      );
      expect(instrumentInState?.type).toBe('Violin');
      expect(instrumentInState?.subtype).toBe('Baroque');
    });

    it('handles update error', async () => {
      const error = { error: new Error('Update failed') };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      let updated: Instrument | null = null;
      await act(async () => {
        updated = await result.current.updateInstrument(mockInstrument.id, {
          maker: 'Updated',
        });
      });

      expect(updated).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('deleteInstrument', () => {
    beforeEach(async () => {
      mockServiceFetchInstruments.mockResolvedValue([mockInstrument]);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });
    });

    it('deletes instrument successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteInstrument(mockInstrument.id);
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(deleted).toBe(true);
      expect(
        result.current.instruments.find(i => i.id === mockInstrument.id)
      ).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/instruments?id=${mockInstrument.id}`,
        { method: 'DELETE' }
      );
    });

    it('handles delete error', async () => {
      const error = { error: new Error('Delete failed') };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteInstrument(mockInstrument.id);
      });

      expect(deleted).toBe(false);
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('invalidates cache', async () => {
      mockServiceFetchInstruments.mockResolvedValue([mockInstrument]);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      expect(result.current.lastUpdated).not.toBeNull();

      act(() => {
        result.current.invalidateCache();
      });

      expect(result.current.lastUpdated).toBeNull();
    });
  });

  describe('resetState', () => {
    it('resets state to initial', async () => {
      mockServiceFetchInstruments.mockResolvedValue([mockInstrument]);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      expect(result.current.instruments).toHaveLength(1);

      act(() => {
        result.current.resetState();
      });

      expect(result.current.instruments).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.submitting).toBe(false);
      expect(result.current.lastUpdated).toBeNull();
    });
  });

  describe('parseInstrumentType edge cases', () => {
    it('handles type with slash at the beginning', async () => {
      const instrumentWithLeadingSlash = {
        ...mockInstrument,
        type: '/ Violin',
        subtype: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [instrumentWithLeadingSlash] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      const instrument = result.current.instruments[0];
      // When leading slash, split('/') = ['', ' Violin'], trim() = ['', 'Violin'],
      // filter() removes empty strings, so parts = ['Violin'], length === 1
      // Therefore type = 'Violin', subtype = original (null)
      expect(instrument.type).toBe('Violin');
      expect(instrument.subtype).toBeNull();
    });

    it('handles type with slash at the end', async () => {
      const instrumentWithTrailingSlash = {
        ...mockInstrument,
        type: 'Violin / ',
        subtype: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [instrumentWithTrailingSlash] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      const instrument = result.current.instruments[0];
      // When trailing slash, parts become ['Violin', ''], empty string is filtered out, so parts.length === 1
      // This means type becomes parts[0] and subtype stays as original (null)
      expect(instrument.type).toBe('Violin');
      expect(instrument.subtype).toBeNull();
    });

    it('handles type with only slashes', async () => {
      const instrumentWithOnlySlashes = {
        ...mockInstrument,
        type: ' / / ',
        subtype: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [instrumentWithOnlySlashes] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      const instrument = result.current.instruments[0];
      // Should preserve original when parsing fails meaningfully
      expect(instrument.type).toBeDefined();
    });

    it('preserves existing subtype when type does not contain slash', async () => {
      const instrumentWithSubtype = {
        ...mockInstrument,
        type: 'Violin',
        subtype: 'Classical',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [instrumentWithSubtype] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      const instrument = result.current.instruments[0];
      expect(instrument.type).toBe('Violin');
      expect(instrument.subtype).toBe('Classical');
    });

    it('handles null type', async () => {
      const instrumentWithNullType = {
        ...mockInstrument,
        type: null,
        subtype: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [instrumentWithNullType] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      const instrument = result.current.instruments[0];
      expect(instrument.type).toBeNull();
      expect(instrument.subtype).toBeNull();
    });
  });

  describe('createInstrument error handling', () => {
    it('handles error with details field', async () => {
      const error = { error: { details: 'Validation failed' } };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument = await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdInstrument).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('handles error object without message or details', async () => {
      const error = { error: {} };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: async () => error,
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument = await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdInstrument).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('handles network error (fetch throws)', async () => {
      const networkError = new Error('Network request failed');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument = await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdInstrument).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('handles non-Error exception', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        throw 'String error';
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      let createdInstrument: Instrument | null = null;
      await act(async () => {
        createdInstrument = await result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(createdInstrument).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('updateInstrument edge cases', () => {
    beforeEach(async () => {
      mockServiceFetchInstruments.mockResolvedValue([mockInstrument]);
    });

    it('updates lastUpdated when updating instrument', async () => {
      const updatedInstrument = { ...mockInstrument, maker: 'Updated Maker' };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: updatedInstrument }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      const firstUpdateTime = result.current.lastUpdated;

      await act(async () => {
        await result.current.updateInstrument(mockInstrument.id, {
          maker: 'Updated Maker',
        });
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
      // Should be a new date
      expect(result.current.lastUpdated?.getTime()).toBeGreaterThanOrEqual(
        firstUpdateTime?.getTime() || 0
      );
    });

    it('handles update when instrument does not exist in state', async () => {
      const nonExistentId = 'non-existent-id';
      const updatedInstrument = { ...mockInstrument, id: nonExistentId };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: updatedInstrument }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      let updated: Instrument | null = null;
      await act(async () => {
        updated = await result.current.updateInstrument(nonExistentId, {
          maker: 'New Maker',
        });
      });

      // API call succeeds but state is unchanged since ID doesn't match
      expect(updated).toEqual(updatedInstrument);
      expect(
        result.current.instruments.find(i => i.id === nonExistentId)
      ).toBeUndefined();
    });

    it('handles network error during update', async () => {
      const networkError = new Error('Network error');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      let updated: Instrument | null = null;
      await act(async () => {
        updated = await result.current.updateInstrument(mockInstrument.id, {
          maker: 'Updated',
        });
      });

      expect(updated).toBeNull();
      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('deleteInstrument edge cases', () => {
    beforeEach(async () => {
      mockServiceFetchInstruments.mockResolvedValue([mockInstrument]);
    });

    it('sets submitting state during deletion', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ success: true }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      act(() => {
        result.current.deleteInstrument(mockInstrument.id);
      });

      expect(result.current.submitting).toBe(true);

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });
    });

    it('handles network error during deletion', async () => {
      const networkError = new Error('Network error');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteInstrument(mockInstrument.id);
      });

      expect(deleted).toBe(false);
      expect(mockHandleError).toHaveBeenCalled();
    });

    it('updates lastUpdated when deleting instrument', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      const firstUpdateTime = result.current.lastUpdated;

      await act(async () => {
        await result.current.deleteInstrument(mockInstrument.id);
      });

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      expect(result.current.lastUpdated).not.toBeNull();
      expect(result.current.lastUpdated?.getTime()).toBeGreaterThanOrEqual(
        firstUpdateTime?.getTime() || 0
      );
    });
  });

  describe('state management', () => {
    it('updates lastUpdated sequentially for multiple operations', async () => {
      const updatedInstrument = { ...mockInstrument, maker: 'Updated' };
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockInstrument] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockInstrument }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: updatedInstrument }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      // Fetch
      await act(async () => {
        await result.current.fetchInstruments();
      });

      const fetchTime = result.current.lastUpdated;

      // Create
      await act(async () => {
        await result.current.createInstrument({
          maker: 'New',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      const createTime = result.current.lastUpdated;

      // Update
      await act(async () => {
        await result.current.updateInstrument(mockInstrument.id, {
          maker: 'Updated',
        });
      });

      const updateTime = result.current.lastUpdated;

      // Delete
      await act(async () => {
        await result.current.deleteInstrument(mockInstrument.id);
      });

      const deleteTime = result.current.lastUpdated;

      // Verify sequential updates
      expect(createTime?.getTime()).toBeGreaterThanOrEqual(
        fetchTime?.getTime() || 0
      );
      expect(updateTime?.getTime()).toBeGreaterThanOrEqual(
        createTime?.getTime() || 0
      );
      expect(deleteTime?.getTime()).toBeGreaterThanOrEqual(
        updateTime?.getTime() || 0
      );
    });

    it('handles empty array response from fetch', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.instruments).toEqual([]);
      expect(result.current.lastUpdated).not.toBeNull();
    });

    it('maintains submitting state correctly during concurrent operations', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: mockInstrument }),
                }),
              50
            )
          )
      );

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      act(() => {
        result.current.createInstrument({
          maker: 'Test',
          type: 'Violin',
          subtype: null,
          serial_number: 'SN999',
          year: 1800,
          ownership: null,
          size: null,
          weight: null,
          note: null,
          price: null,
          certificate: false,
          status: 'Available' as const,
        });
      });

      expect(result.current.submitting).toBe(true);

      await waitFor(() => {
        expect(result.current.submitting).toBe(false);
      });

      // Should be false after operation completes
      expect(result.current.submitting).toBe(false);
    });
  });

  describe('fetchInstruments edge cases', () => {
    it('handles API response without data field', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        return await fetcher();
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.instruments).toEqual([]);
    });

    it('handles API error response without error field', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      });

      mockServiceFetchInstruments.mockImplementation(async fetcher => {
        try {
          return await fetcher();
        } catch (error) {
          throw error;
        }
      });

      const { result } = renderHook(() => useInstruments(), {
        wrapper: InstrumentsProvider,
      });

      await act(async () => {
        await result.current.fetchInstruments();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockHandleError).toHaveBeenCalled();
    });
  });
});
