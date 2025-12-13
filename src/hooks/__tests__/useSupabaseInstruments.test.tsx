import { renderHook } from '@testing-library/react';
import { useSupabaseInstruments } from '../useSupabaseInstruments';
import { useSupabaseQuery } from '../useSupabaseQuery';

jest.mock('../useSupabaseQuery');

describe('useSupabaseInstruments', () => {
  it('maps supabase query helpers to instruments API', () => {
    const mockReturn = {
      data: [{ id: '1' }],
      loading: true,
      error: null,
      fetch: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    (useSupabaseQuery as jest.Mock).mockReturnValue(mockReturn);

    const { result } = renderHook(() => useSupabaseInstruments());

    expect(result.current.instruments).toEqual(mockReturn.data);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    result.current.fetchInstruments();
    expect(mockReturn.fetch).toHaveBeenCalled();
    result.current.createInstrument({} as any);
    expect(mockReturn.create).toHaveBeenCalled();
    result.current.updateInstrument('1', {} as any);
    expect(mockReturn.update).toHaveBeenCalledWith('1', {} as any);
    result.current.deleteInstrument('1');
    expect(mockReturn.remove).toHaveBeenCalledWith('1');
  });
});
