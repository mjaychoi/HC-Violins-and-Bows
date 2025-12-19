import React from 'react';
import { renderHook } from '@/test-utils/render';
import {
  DataProvider,
  useDataContext,
  useAllData,
  useClients,
  useInstruments,
  useConnections,
} from '../DataContext';

// 개별 컨텍스트 훅들을 모두 mock
const mockUseClientsContext = jest.fn();
const mockUseInstrumentsContext = jest.fn();
const mockUseConnectionsContext = jest.fn();
const mockUseClients = jest.fn();
const mockUseInstruments = jest.fn();
const mockUseConnections = jest.fn();

jest.mock('../ClientsContext', () => ({
  useClientsContext: () => mockUseClientsContext(),
  useClients: () => mockUseClients(),
}));

jest.mock('../InstrumentsContext', () => ({
  useInstrumentsContext: () => mockUseInstrumentsContext(),
  useInstruments: () => mockUseInstruments(),
}));

jest.mock('../ConnectionsContext', () => ({
  useConnectionsContext: () => mockUseConnectionsContext(),
  useConnections: () => mockUseConnections(),
}));

describe('DataContext (deprecated aggregator)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseClientsContext.mockReturnValue({
      state: {
        clients: ['c1'],
        loading: false,
        submitting: false,
        lastUpdated: 'client-ts',
      },
      actions: {
        fetchClients: jest.fn(),
        createClient: jest.fn(),
        updateClient: jest.fn(),
        deleteClient: jest.fn(),
        invalidateCache: jest.fn(),
        resetState: jest.fn(),
      },
    });

    mockUseInstrumentsContext.mockReturnValue({
      state: {
        instruments: ['i1'],
        loading: false,
        submitting: false,
        lastUpdated: 'inst-ts',
      },
      actions: {
        fetchInstruments: jest.fn(),
        createInstrument: jest.fn(),
        updateInstrument: jest.fn(),
        deleteInstrument: jest.fn(),
        invalidateCache: jest.fn(),
        resetState: jest.fn(),
      },
    });

    mockUseConnectionsContext.mockReturnValue({
      state: {
        connections: ['cn1'],
        loading: false,
        submitting: false,
        lastUpdated: 'conn-ts',
      },
      actions: {
        fetchConnections: jest.fn(),
        createConnection: jest.fn(),
        updateConnection: jest.fn(),
        deleteConnection: jest.fn(),
        invalidateCache: jest.fn(),
        resetState: jest.fn(),
      },
    });

    mockUseClients.mockReturnValue({
      clients: ['c1'],
      loading: false,
      submitting: false,
      lastUpdated: 'client-ts',
      fetchClients: jest.fn(),
      createClient: jest.fn(),
      updateClient: jest.fn(),
      deleteClient: jest.fn(),
      invalidateCache: jest.fn(),
      resetState: jest.fn(),
    });

    mockUseInstruments.mockReturnValue({
      instruments: ['i1'],
      loading: false,
      submitting: false,
      lastUpdated: 'inst-ts',
      fetchInstruments: jest.fn(),
      createInstrument: jest.fn(),
      updateInstrument: jest.fn(),
      deleteInstrument: jest.fn(),
      invalidateCache: jest.fn(),
      resetState: jest.fn(),
    });

    mockUseConnections.mockReturnValue({
      connections: ['cn1'],
      loading: false,
      submitting: false,
      lastUpdated: 'conn-ts',
      fetchConnections: jest.fn(),
      createConnection: jest.fn(),
      updateConnection: jest.fn(),
      deleteConnection: jest.fn(),
      invalidateCache: jest.fn(),
      resetState: jest.fn(),
    });
  });

  it('DataProvider 렌더 시 deprecation 경고를 한 번 출력하고 children 을 그대로 렌더한다', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DataProvider>{children}</DataProvider>
    );

    const { result } = renderHook(() => useDataContext(), { wrapper });

    expect(result.current.state.clients).toEqual(['c1']);
    expect(result.current.state.instruments).toEqual(['i1']);
    expect(result.current.state.connections).toEqual(['cn1']);

    expect(warnSpy).toHaveBeenCalledWith(
      'DataProvider is deprecated. Use individual context providers instead.'
    );
    warnSpy.mockRestore();
  });

  it('useDataContext 의 invalidateCache / resetState 가 각 컨텍스트 액션으로 위임된다', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DataProvider>{children}</DataProvider>
    );

    const { result } = renderHook(() => useDataContext(), { wrapper });

    // clients invalidate
    result.current.actions.invalidateCache('clients');
    expect(mockUseClientsContext().actions.invalidateCache).toHaveBeenCalled();

    // instruments invalidate
    result.current.actions.invalidateCache('instruments');
    expect(
      mockUseInstrumentsContext().actions.invalidateCache
    ).toHaveBeenCalled();

    // connections invalidate (기본 분기)
    result.current.actions.invalidateCache('connections');
    expect(
      mockUseConnectionsContext().actions.invalidateCache
    ).toHaveBeenCalled();

    // resetState 는 세 컨텍스트 모두 호출
    result.current.actions.resetState();
    expect(mockUseClientsContext().actions.resetState).toHaveBeenCalledTimes(1);
    expect(
      mockUseInstrumentsContext().actions.resetState
    ).toHaveBeenCalledTimes(1);
    expect(
      mockUseConnectionsContext().actions.resetState
    ).toHaveBeenCalledTimes(1);
  });

  it('useAllData 가 개별 훅에서 데이터를 모아 반환하고 invalidate/reset 을 위임한다', () => {
    const { result } = renderHook(() => useAllData(), {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(result.current.clients).toEqual(['c1']);
    expect(result.current.instruments).toEqual(['i1']);
    expect(result.current.connections).toEqual(['cn1']);

    // invalidateCache 분기
    result.current.invalidateCache('clients');
    expect(mockUseClients().invalidateCache).toHaveBeenCalledWith();

    result.current.invalidateCache('instruments');
    expect(mockUseInstruments().invalidateCache).toHaveBeenCalledWith();

    result.current.invalidateCache('connections');
    expect(mockUseConnections().invalidateCache).toHaveBeenCalledWith();

    // resetState 는 세 훅 모두 호출
    result.current.resetState();
    expect(mockUseClients().resetState).toHaveBeenCalled();
    expect(mockUseInstruments().resetState).toHaveBeenCalled();
    expect(mockUseConnections().resetState).toHaveBeenCalled();
  });

  it('useClients / useInstruments / useConnections 가 각 컨텍스트 훅을 그대로 반환한다', () => {
    const clients = useClients();
    const instruments = useInstruments();
    const connections = useConnections();

    expect(clients.clients).toEqual(['c1']);
    expect(instruments.instruments).toEqual(['i1']);
    expect(connections.connections).toEqual(['cn1']);
  });
});
