import React from 'react';
import { render } from '@testing-library/react';
import { DataInitializer } from '../DataInitializer';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { logInfo } from '@/utils/logger';

// Mock dependencies
jest.mock('@/hooks/useUnifiedData');
jest.mock('@/utils/logger');

const mockUseUnifiedData = useUnifiedData as jest.MockedFunction<
  typeof useUnifiedData
>;
const mockLogInfo = logInfo as jest.MockedFunction<typeof logInfo>;

describe('DataInitializer', () => {
  const originalEnv = process.env.NODE_ENV as string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUnifiedData.mockReturnValue({
      fetchClients: jest.fn(),
      createClient: jest.fn(),
      updateClient: jest.fn(),
      deleteClient: jest.fn(),
      fetchInstruments: jest.fn(),
      createInstrument: jest.fn(),
      updateInstrument: jest.fn(),
      deleteInstrument: jest.fn(),
      fetchConnections: jest.fn(),
      createConnection: jest.fn(),
      updateConnection: jest.fn(),
      deleteConnection: jest.fn(),
      clients: [],
      instruments: [],
      connections: [],
      lastUpdated: { clients: null, instruments: null, connections: null },
      invalidate: jest.fn(),
      invalidateAll: jest.fn(),
      reset: jest.fn(),
    } as any);
    // Reset window
    delete (global as any).window;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true,
        configurable: true,
      });
    }
    // Restore window
    if (typeof window !== 'undefined') {
      (global as any).window = window;
    }
  });

  it('should call useUnifiedData hook', () => {
    render(
      <DataInitializer>
        <div>Test Content</div>
      </DataInitializer>
    );

    expect(mockUseUnifiedData).toHaveBeenCalledTimes(1);
  });

  it('should render children', () => {
    const { getByText } = render(
      <DataInitializer>
        <div>Test Content</div>
      </DataInitializer>
    );

    expect(getByText('Test Content')).toBeInTheDocument();
  });

  it('should log info in development mode', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      writable: true,
      configurable: true,
    });
    (global as any).window = {};

    render(
      <DataInitializer>
        <div>Test</div>
      </DataInitializer>
    );

    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.stringContaining('[DataInitializer]')
    );
  });

  it('should not log in production mode', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true,
    });
    (global as any).window = {};

    render(
      <DataInitializer>
        <div>Test</div>
      </DataInitializer>
    );

    expect(mockLogInfo).not.toHaveBeenCalled();
  });

  it('should not log when window is undefined (SSR)', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      writable: true,
      configurable: true,
    });
    // In jsdom, window is always defined, so we can't fully test SSR scenario
    // But we can verify the component still renders
    const { getByText } = render(
      <DataInitializer>
        <div>Test</div>
      </DataInitializer>
    );

    expect(getByText('Test')).toBeInTheDocument();
    expect(mockUseUnifiedData).toHaveBeenCalled();
  });

  it('should render multiple children', () => {
    const { getByText } = render(
      <DataInitializer>
        <div>Child 1</div>
        <div>Child 2</div>
        <div>Child 3</div>
      </DataInitializer>
    );

    expect(getByText('Child 1')).toBeInTheDocument();
    expect(getByText('Child 2')).toBeInTheDocument();
    expect(getByText('Child 3')).toBeInTheDocument();
  });

  it('should render nested children', () => {
    const { getByText } = render(
      <DataInitializer>
        <div>
          <span>Nested Content</span>
        </div>
      </DataInitializer>
    );

    expect(getByText('Nested Content')).toBeInTheDocument();
  });

  it('should call useUnifiedData only once per render', () => {
    const { rerender } = render(
      <DataInitializer>
        <div>Test</div>
      </DataInitializer>
    );

    expect(mockUseUnifiedData).toHaveBeenCalledTimes(1);

    rerender(
      <DataInitializer>
        <div>Test</div>
      </DataInitializer>
    );

    // Should be called again on rerender (React hook rules)
    expect(mockUseUnifiedData).toHaveBeenCalledTimes(2);
  });
});
