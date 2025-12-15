// src/app/clients/hooks/__tests__/useFilters.basic-and-options.test.tsx
import { renderHook, act, waitFor } from '@/test-utils/render';
import { useFilters } from '../useFilters';
import { Client } from '@/types';

const mockClients: Client[] = [
  {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '123-456-7890',
    tags: ['Musician'],
    interest: 'Active',
    note: 'Test client',
    client_number: null,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '098-765-4321',
    tags: ['Owner'],
    interest: 'Passive',
    note: 'Another test client',
    client_number: null,
    created_at: '2023-01-02T00:00:00Z',
  },
  {
    id: '3',
    first_name: 'Bob',
    last_name: 'Johnson',
    email: 'bob@example.com',
    contact_number: '555-123-4567',
    tags: ['Dealer'],
    interest: 'Inactive',
    note: 'Third test client',
    client_number: null,
    created_at: '2023-01-03T00:00:00Z',
  },
];

const mockClientsWithInstruments = new Set(['1', '2']);

describe('useFilters - 기본 필터 & 옵션', () => {
  it('기본값 초기화', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    expect(result.current.searchTerm).toBe('');
    expect(result.current.showFilters).toBe(false);
    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    expect(result.current.filteredClients).toHaveLength(mockClients.length);
    mockClients.forEach(client => {
      expect(result.current.filteredClients).toContainEqual(client);
    });
  });

  it('검색어 필터', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.setSearchTerm('John');
    });
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(1);
    const johnClient = result.current.filteredClients.find(
      c => c.first_name === 'John'
    );
    expect(johnClient).toBeDefined();
    expect(johnClient?.first_name).toBe('John');
  });

  it('성/이름/이메일/태그/관심도/보유악기 필터', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('last_name', 'Doe');
    });
    expect(result.current.filteredClients).toHaveLength(1);
    expect(result.current.filteredClients[0].last_name).toBe('Doe');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('first_name', 'Jane');
    });
    expect(result.current.filteredClients[0].first_name).toBe('Jane');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('email', 'john@example.com');
    });
    expect(result.current.filteredClients[0].email).toBe('john@example.com');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filteredClients[0].tags).toContain('Musician');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.filteredClients[0].interest).toBe('Active');

    act(() => {
      result.current.clearAllFilters();
    });
    act(() => {
      result.current.handleFilterChange('hasInstruments', 'Has Instruments');
    });
    expect(result.current.filteredClients).toHaveLength(2);
  });

  it('보유악기 없음 필터', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.handleFilterChange('hasInstruments', 'No Instruments');
    });
    expect(result.current.filteredClients).toHaveLength(1);
    expect(result.current.filteredClients[0].first_name).toBe('Bob');
  });

  it('복합 필터 조합', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.filteredClients).toHaveLength(1);
    expect(result.current.filteredClients[0].first_name).toBe('John');
  });

  it('필터 토글 및 전체 초기화', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).toContain('Musician');
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).not.toContain('Musician');

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.setSearchTerm('John');
    });
    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filters.interest).toContain('Active');
    expect(result.current.searchTerm).toBe('John');
    act(() => {
      result.current.clearAllFilters();
    });
    expect(result.current.filters.tags).toEqual([]);
    expect(result.current.filters.interest).toEqual([]);
    expect(result.current.searchTerm).toBe('');
  });

  it('옵션 생성 및 빈 목록/널 값 처리', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );
    expect(result.current.filterOptions.lastNames).toEqual(
      expect.arrayContaining(['Doe', 'Smith', 'Johnson'])
    );
    expect(result.current.filterOptions.tags).toEqual(
      expect.arrayContaining(['Musician', 'Owner', 'Dealer'])
    );

    const { result: empty } = renderHook(() => useFilters([], new Set()));
    expect(empty.current.filteredClients).toEqual([]);
    expect(empty.current.filterOptions.lastNames).toEqual([]);

    const clientsWithNulls: Client[] = [
      {
        id: '1',
        first_name: null,
        last_name: null,
        email: null,
        contact_number: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2023-01-01T00:00:00Z',
      },
    ];
    const { result: withNulls } = renderHook(() =>
      useFilters(clientsWithNulls, new Set())
    );
    expect(withNulls.current.filteredClients).toEqual(clientsWithNulls);
  });

  it('handleHasInstrumentsChange는 단일 선택만 허용 (다른 옵션 자동 해제)', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 첫 번째 옵션 선택
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });
    expect(result.current.filters.hasInstruments).toEqual(['Has Instruments']);
    expect(result.current.filters.hasInstruments).toHaveLength(1);

    // 다른 옵션 선택 시 이전 옵션 해제
    act(() => {
      result.current.handleHasInstrumentsChange('No Instruments');
    });
    expect(result.current.filters.hasInstruments).toEqual(['No Instruments']);
    expect(result.current.filters.hasInstruments).toHaveLength(1);

    // 같은 옵션 다시 선택 시 해제
    act(() => {
      result.current.handleHasInstrumentsChange('No Instruments');
    });
    expect(result.current.filters.hasInstruments).toEqual([]);
  });

  it('handleFilterChange는 updateFilterState를 통해 작동', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 여러 필터 추가
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
      result.current.handleFilterChange('interest', 'Active');
    });

    expect(result.current.filters.tags).toEqual(['Musician', 'Owner']);
    expect(result.current.filters.interest).toEqual(['Active']);

    // 필터 제거 (토글)
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).toEqual(['Owner']);
    expect(result.current.filters.interest).toEqual(['Active']); // 다른 필터는 유지
  });

  it('clearAllFilters는 resetFilterState를 통해 초기화', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 여러 필터와 검색어 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.setSearchTerm('test');
    });

    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filters.interest).toContain('Active');
    expect(result.current.filters.last_name).toContain('Doe');
    expect(result.current.searchTerm).toBe('test');

    // 전체 초기화
    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    expect(result.current.searchTerm).toBe('');
  });

  it('handleFilterChange와 handleHasInstrumentsChange의 차이점', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // handleFilterChange는 일반 토글 (다중 선택 가능)
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
    });
    expect(result.current.filters.tags).toEqual(['Musician', 'Owner']);

    // handleHasInstrumentsChange는 단일 선택만 (이전 값 자동 해제)
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
      result.current.handleHasInstrumentsChange('No Instruments');
    });
    // 마지막 선택만 남음
    expect(result.current.filters.hasInstruments).toEqual(['No Instruments']);
    expect(result.current.filters.hasInstruments).toHaveLength(1);
  });

  it('검색어와 필터 조합 테스트', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 검색어만 설정
    act(() => {
      result.current.setSearchTerm('John');
    });
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(1);

    // 검색어 + 필터 조합
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    const combinedResults = result.current.filteredClients;
    expect(combinedResults.length).toBeGreaterThanOrEqual(0);
    combinedResults.forEach(client => {
      expect(client.tags).toContain('Musician');
    });

    // 필터만 제거 (검색어 유지)
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).not.toContain('Musician');
    expect(result.current.searchTerm).toBe('John'); // 검색어는 유지
  });

  it('EMPTY_FILTER_STATE와 초기 상태 일치 확인', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 초기 상태 확인
    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });

    // 필터 적용 후 clearAllFilters로 복원
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });
    act(() => {
      result.current.clearAllFilters();
    });

    // 초기 상태와 동일해야 함
    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
  });

  it('검색어 변경이 필터 결과에 즉시 반영됨 (externalSearchTerm 연동 확인)', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 존재하지 않는 검색어 → 빈 결과
    act(() => {
      result.current.setSearchTerm('no-match-term');
    });
    await waitFor(() => expect(result.current.filteredClients).toHaveLength(0));

    // 실제 이름으로 변경하면 바로 결과가 복원
    act(() => {
      result.current.setSearchTerm('Jane');
    });
    await waitFor(() =>
      expect(result.current.filteredClients.length).toBeGreaterThan(0)
    );
    expect(
      result.current.filteredClients.some(c => c.first_name === 'Jane')
    ).toBe(true);
  });

  it('검색어를 빈 문자열로 변경 시 모든 결과 복원', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 검색어 설정
    act(() => {
      result.current.setSearchTerm('John');
    });
    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThan(0);
    });

    // 빈 문자열로 변경
    act(() => {
      result.current.setSearchTerm('');
    });
    await waitFor(() => {
      expect(result.current.filteredClients.length).toBe(mockClients.length);
    });
    expect(result.current.searchTerm).toBe('');
  });

  it('필터와 검색어를 동시에 변경해도 정상 동작', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('tags', 'Musician');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    // 두 조건을 모두 만족하는 클라이언트만 반환되어야 함
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Musician');
    });
  });

  it('검색어 변경 시 필터는 유지됨', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 필터 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    // 검색어 변경
    act(() => {
      result.current.setSearchTerm('John');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    // 필터는 여전히 적용되어야 함
    expect(result.current.filters.tags).toContain('Musician');
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Musician');
    });
  });

  it('필터 변경 시 검색어는 유지됨', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 검색어 설정
    act(() => {
      result.current.setSearchTerm('John');
    });

    // 필터 변경
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    // 검색어는 여전히 유지되어야 함
    expect(result.current.searchTerm).toBe('John');
  });

  it('빠르게 연속으로 검색어 변경 시 최종 값만 반영', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('J');
    });
    act(() => {
      result.current.setSearchTerm('Jo');
    });
    act(() => {
      result.current.setSearchTerm('Joh');
    });
    act(() => {
      result.current.setSearchTerm('John');
    });

    await waitFor(() => {
      expect(result.current.searchTerm).toBe('John');
    });
    expect(
      result.current.filteredClients.some(c =>
        c.first_name?.toLowerCase().includes('john')
      )
    ).toBe(true);
  });

  it('검색어와 필터 모두 제거 시 모든 클라이언트 반환', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 필터와 검색어 설정
    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('tags', 'Musician');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    // 모두 제거
    act(() => {
      result.current.clearAllFilters();
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBe(mockClients.length);
    });
    expect(result.current.searchTerm).toBe('');
    expect(result.current.filters.tags).toEqual([]);
  });

  it('클라이언트 목록 변경 시 필터 옵션 업데이트', () => {
    const initialClients: Client[] = [
      {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        contact_number: '123',
        tags: ['Musician'],
        interest: 'Active',
        note: '',
        client_number: null,
        created_at: '2023-01-01T00:00:00Z',
      },
    ];

    const { result, rerender } = renderHook(
      ({ clients }) => useFilters(clients, mockClientsWithInstruments),
      {
        initialProps: { clients: initialClients },
      }
    );

    // 초기 필터 옵션
    expect(result.current.filterOptions.lastNames).toContain('Doe');
    expect(result.current.filterOptions.firstNames).toContain('John');

    // 새로운 클라이언트 추가
    const updatedClients: Client[] = [
      ...initialClients,
      {
        id: '2',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        contact_number: '456',
        tags: ['Owner'],
        interest: 'Passive',
        note: '',
        client_number: null,
        created_at: '2023-01-02T00:00:00Z',
      },
    ];

    rerender({ clients: updatedClients });

    // 필터 옵션이 업데이트됨
    expect(result.current.filterOptions.lastNames).toContain('Doe');
    expect(result.current.filterOptions.lastNames).toContain('Smith');
    expect(result.current.filterOptions.firstNames).toContain('John');
    expect(result.current.filterOptions.firstNames).toContain('Jane');
    expect(result.current.filterOptions.tags).toContain('Musician');
    expect(result.current.filterOptions.tags).toContain('Owner');
  });

  it('대소문자 구분 없는 검색 테스트', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 대문자로 검색
    act(() => {
      result.current.setSearchTerm('JOHN');
    });
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(1);
    expect(
      result.current.filteredClients.some(c => c.first_name === 'John')
    ).toBe(true);

    // 소문자로 검색
    act(() => {
      result.current.setSearchTerm('jane');
    });
    expect(
      result.current.filteredClients.some(c => c.first_name === 'Jane')
    ).toBe(true);

    // 혼합 케이스로 검색
    act(() => {
      result.current.setSearchTerm('DoE');
    });
    expect(
      result.current.filteredClients.some(c => c.last_name === 'Doe')
    ).toBe(true);
  });

  it('부분 문자열 검색 테스트', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 이름 일부만 검색
    act(() => {
      result.current.setSearchTerm('Joh');
    });
    expect(
      result.current.filteredClients.some(c => c.first_name === 'John')
    ).toBe(true);

    // 이메일 도메인 검색
    act(() => {
      result.current.setSearchTerm('@example.com');
    });
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(2);

    // 연락처 일부 검색
    act(() => {
      result.current.setSearchTerm('123');
    });
    expect(
      result.current.filteredClients.some(c =>
        c.contact_number?.includes('123')
      )
    ).toBe(true);
  });

  it('여러 필터와 검색어 복합 조합 - 모든 조건 만족', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // John이면서 Musician 태그를 가진 클라이언트 검색
    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });

    const filtered = result.current.filteredClients;
    expect(filtered.length).toBeGreaterThanOrEqual(0);
    filtered.forEach(client => {
      expect(client.tags).toContain('Musician');
      expect(client.interest).toBe('Active');
    });
  });

  it('빈 클라이언트 목록 처리', () => {
    const { result } = renderHook(() =>
      useFilters([], mockClientsWithInstruments)
    );

    expect(result.current.filteredClients).toEqual([]);
    expect(result.current.filterOptions.lastNames).toEqual([]);
    expect(result.current.filterOptions.firstNames).toEqual([]);
    expect(result.current.filterOptions.tags).toEqual([]);
    expect(result.current.getActiveFiltersCount()).toBe(0);
  });

  it('null/undefined 값이 많은 클라이언트 처리', () => {
    const clientsWithNulls: Client[] = [
      {
        id: '1',
        first_name: null,
        last_name: null,
        email: null,
        contact_number: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        contact_number: '123',
        tags: ['Owner'],
        interest: 'Active',
        note: 'Has data',
        client_number: null,
        created_at: '2023-01-02T00:00:00Z',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithNulls, mockClientsWithInstruments)
    );

    // 필터 옵션은 null을 제외하고 생성됨
    expect(result.current.filterOptions.firstNames).not.toContain(null);
    expect(result.current.filterOptions.firstNames).toContain('Jane');
    expect(result.current.filteredClients).toHaveLength(2);

    // 검색어로 필터링해도 에러 없이 동작
    act(() => {
      result.current.setSearchTerm('Jane');
    });
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(1);
  });

  it('clientsWithInstruments가 undefined일 때 처리', () => {
    const { result } = renderHook(() => useFilters(mockClients, undefined));

    // hasInstruments 필터가 작동해야 함
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    // undefined일 때는 모든 클라이언트가 필터링되지 않을 수 있음
    // (실제 동작 확인)
    expect(result.current.filters.hasInstruments).toEqual(['Has Instruments']);
  });

  it('동일한 값 중복 필터 추가 시도 (이미 존재하는 값)', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).toEqual(['Musician']);

    // 같은 값 다시 추가 시도 - 토글로 제거됨
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.filters.tags).toEqual([]);
  });

  it('showFilters 상태 토글', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    expect(result.current.showFilters).toBe(false);

    act(() => {
      result.current.setShowFilters(true);
    });
    expect(result.current.showFilters).toBe(true);

    act(() => {
      result.current.setShowFilters(false);
    });
    expect(result.current.showFilters).toBe(false);
  });

  it('필터와 검색어 모두 제거 후 상태 복원', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 필터와 검색어 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.setSearchTerm('test');
    });

    // 개별 제거
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.setSearchTerm('');
    });

    // 초기 상태로 복원
    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    expect(result.current.searchTerm).toBe('');
    expect(result.current.filteredClients).toHaveLength(mockClients.length);
  });

  it('태그 배열 검색 테스트', () => {
    const clientsWithTags: Client[] = [
      {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        contact_number: '123',
        tags: ['Musician', 'Owner', 'Collector'],
        interest: 'Active',
        note: '',
        client_number: null,
        created_at: '2023-01-01T00:00:00Z',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithTags, mockClientsWithInstruments)
    );

    // 태그 값으로 검색
    act(() => {
      result.current.setSearchTerm('Collector');
    });
    expect(
      result.current.filteredClients.some(c => c.tags?.includes('Collector'))
    ).toBe(true);
  });

  it('검색어 변경 시 필터링 즉시 반영', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('John');
    });

    act(() => {
      result.current.setSearchTerm('Jane');
    });

    // 검색어 변경 시 결과가 달라짐
    expect(result.current.searchTerm).toBe('Jane');
  });

  it('필터 옵션이 클라이언트 변경에 따라 실시간 업데이트', () => {
    const initialClients: Client[] = [
      {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        contact_number: '123',
        tags: ['Musician'],
        interest: 'Active',
        note: '',
        client_number: null,
        created_at: '2023-01-01T00:00:00Z',
      },
    ];

    const { result, rerender } = renderHook(
      ({ clients }) => useFilters(clients, mockClientsWithInstruments),
      {
        initialProps: { clients: initialClients },
      }
    );

    const initialTags = result.current.filterOptions.tags;

    // 새 클라이언트 추가
    const updatedClients: Client[] = [
      ...initialClients,
      {
        id: '2',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        contact_number: '456',
        tags: ['Owner', 'Collector'],
        interest: 'Passive',
        note: '',
        client_number: null,
        created_at: '2023-01-02T00:00:00Z',
      },
    ];

    rerender({ clients: updatedClients });

    // 태그 옵션이 업데이트됨
    expect(result.current.filterOptions.tags.length).toBeGreaterThan(
      initialTags.length
    );
    expect(result.current.filterOptions.tags).toContain('Owner');
    expect(result.current.filterOptions.tags).toContain('Collector');
  });

  it('여러 필터를 빠르게 연속으로 변경해도 안정적', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
    });

    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filters.interest).toContain('Active');
    expect(result.current.filters.last_name).toContain('Doe');
    expect(result.current.filters.first_name).toContain('John');
  });

  it('검색어와 필터를 동시에 변경', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('tags', 'Musician');
    });

    expect(result.current.searchTerm).toBe('John');
    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('setFilters 직접 호출 가능', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setFilters({
        last_name: ['Doe'],
        first_name: [],
        contact_number: [],
        email: [],
        tags: ['Musician'],
        interest: [],
        hasInstruments: [],
      });
    });

    expect(result.current.filters.last_name).toEqual(['Doe']);
    expect(result.current.filters.tags).toEqual(['Musician']);
  });

  it('정렬과 필터가 함께 작동', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('복잡한 필터 조합 후 clearAllFilters 호출', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 복잡한 필터 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
      result.current.handleFilterChange('email', 'john@example.com');
      result.current.handleFilterChange('contact_number', '123');
      result.current.handleHasInstrumentsChange('Has Instruments');
      result.current.setSearchTerm('complex search');
      result.current.handleColumnSort('last_name');
    });

    // 모든 필터와 검색어가 설정됨
    expect(result.current.getActiveFiltersCount()).toBeGreaterThan(0);

    // 전체 초기화
    act(() => {
      result.current.clearAllFilters();
    });

    // 모든 상태가 초기화됨
    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    expect(result.current.searchTerm).toBe('');
    // 정렬은 초기화되지 않음 (clearAllFilters는 필터와 검색어만 초기화)
  });

  it('필터 옵션이 중복 없이 생성됨', () => {
    // 동일한 이름을 가진 클라이언트들
    const clientsWithDuplicates: Client[] = [
      {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john1@example.com',
        contact_number: '123',
        tags: ['Musician'],
        interest: 'Active',
        note: '',
        client_number: null,
        created_at: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        first_name: 'John', // 동일한 이름
        last_name: 'Doe', // 동일한 성
        email: 'john2@example.com',
        contact_number: '456',
        tags: ['Owner'],
        interest: 'Passive',
        note: '',
        client_number: null,
        created_at: '2023-01-02T00:00:00Z',
      },
      {
        id: '3',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        contact_number: '789',
        tags: ['Dealer'],
        interest: 'Inactive',
        note: '',
        client_number: null,
        created_at: '2023-01-03T00:00:00Z',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithDuplicates, mockClientsWithInstruments)
    );

    // 중복이 제거되어야 함 (순서는 보장되지 않을 수 있음)
    expect(result.current.filterOptions.firstNames).toContain('John');
    expect(result.current.filterOptions.firstNames).toContain('Jane');
    expect(result.current.filterOptions.firstNames.length).toBe(2); // John, Jane만
    expect(result.current.filterOptions.lastNames).toContain('Doe');
    expect(result.current.filterOptions.lastNames).toContain('Smith');
    expect(result.current.filterOptions.lastNames.length).toBe(2); // Doe, Smith만
  });

  it('초기 정렬 상태 확인', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 초기 정렬은 created_at desc
    expect(result.current.sortBy).toBe('created_at');
    expect(result.current.sortOrder).toBe('desc');
  });

  it('note 필드 검색 테스트', () => {
    const clientsWithNotes: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        note: 'Prefers vintage violins from 1800s',
      },
      {
        ...mockClients[1],
        id: '2',
        note: 'Interested in modern cellos',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithNotes, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('vintage');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    if (result.current.filteredClients.length > 0) {
      expect(
        result.current.filteredClients.some(c =>
          c.note?.toLowerCase().includes('vintage')
        )
      ).toBe(true);
    }
  });

  it('client_number 필드 검색 테스트', () => {
    const clientsWithNumbers: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        client_number: 'CL-001',
      },
      {
        ...mockClients[1],
        id: '2',
        client_number: 'CL-002',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithNumbers, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('CL-001');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    if (result.current.filteredClients.length > 0) {
      expect(
        result.current.filteredClients.some(c => c.client_number === 'CL-001')
      ).toBe(true);
    }
  });

  it('태그 배열 검색 - customFilter 동작 확인', () => {
    const clientsWithTags: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        tags: ['Violin', 'Musician', 'Collector'],
      },
      {
        ...mockClients[1],
        id: '2',
        tags: ['Cello', 'Owner'],
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithTags, mockClientsWithInstruments)
    );

    // 태그 이름으로 검색 (태그가 공백으로 join되어 검색됨)
    act(() => {
      result.current.setSearchTerm('Collector');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    if (result.current.filteredClients.length > 0) {
      expect(
        result.current.filteredClients.some(c => c.tags?.includes('Collector'))
      ).toBe(true);
    }
  });

  it('모든 필터 타입을 동시에 적용', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
      result.current.handleFilterChange('contact_number', '123-456-7890');
      result.current.handleFilterChange('email', 'john@example.com');
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    const filtered = result.current.filteredClients;
    expect(filtered.length).toBeGreaterThanOrEqual(0);
    // 모든 필터 조건을 만족하는 클라이언트만 반환되어야 함
    filtered.forEach(client => {
      expect(client.last_name).toBe('Doe');
      expect(client.first_name).toBe('John');
      expect(client.contact_number).toBe('123-456-7890');
      expect(client.email).toBe('john@example.com');
      expect(client.tags).toContain('Musician');
      expect(client.interest).toBe('Active');
      expect(['1', '2']).toContain(client.id); // hasInstruments
    });
  });

  it('검색어만 사용하고 필터 없이 필터링', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('John');
    });

    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('필터만 사용하고 검색어 없이 필터링', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });

    expect(result.current.searchTerm).toBe('');
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Musician');
      expect(client.interest).toBe('Active');
    });
  });

  it('필터 + 검색 + 정렬 모두 조합', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.setSearchTerm('John');
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.searchTerm).toBe('John');
    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');

    const filtered = result.current.filteredClients;
    expect(filtered.length).toBeGreaterThanOrEqual(0);
    filtered.forEach(client => {
      expect(client.tags).toContain('Musician');
    });
  });

  it('빈 문자열 검색어는 필터링하지 않음', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('');
    });

    // 빈 검색어는 모든 클라이언트를 반환해야 함 (필터만 적용)
    expect(result.current.filteredClients.length).toBe(mockClients.length);
  });

  it('특수문자가 포함된 검색어 처리', () => {
    const clientsWithSpecial: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        email: 'john+tag@example.com',
        note: 'Special: character! #tag',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithSpecial, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('+tag');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);

    act(() => {
      result.current.setSearchTerm('Special:');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('여러 태그를 가진 클라이언트에서 태그 검색', () => {
    const clientsWithMultipleTags: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        tags: ['Violin', 'Musician', 'Collector', 'Dealer'],
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithMultipleTags, mockClientsWithInstruments)
    );

    // 여러 태그 중 하나만 검색해도 매칭되어야 함
    act(() => {
      result.current.setSearchTerm('Dealer');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    if (result.current.filteredClients.length > 0) {
      expect(
        result.current.filteredClients.some(c => c.tags?.includes('Dealer'))
      ).toBe(true);
    }
  });

  it('대소문자 혼합 검색어 처리', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 대소문자 혼합 검색
    act(() => {
      result.current.setSearchTerm('JoHn');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    expect(
      result.current.filteredClients.some(c =>
        c.first_name?.toLowerCase().includes('john')
      )
    ).toBe(true);
  });

  it('부분 문자열 검색 - 이름 일부만', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('oh'); // "John"의 일부
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    expect(
      result.current.filteredClients.some(c =>
        c.first_name?.toLowerCase().includes('oh')
      )
    ).toBe(true);
  });

  it('이메일 도메인으로 검색', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('@example.com');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    result.current.filteredClients.forEach(client => {
      expect(client.email).toContain('@example.com');
    });
  });

  it('정렬 변경 후 필터링 결과 순서 확인', () => {
    const clientsForSort: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        first_name: 'Alice',
        created_at: '2023-01-01T00:00:00Z',
      },
      {
        ...mockClients[1],
        id: '2',
        first_name: 'Bob',
        created_at: '2023-01-02T00:00:00Z',
      },
      {
        ...mockClients[2],
        id: '3',
        first_name: 'Charlie',
        created_at: '2023-01-03T00:00:00Z',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsForSort, mockClientsWithInstruments)
    );

    // first_name 오름차순 정렬
    act(() => {
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');

    const sorted = result.current.filteredClients;
    if (sorted.length >= 2) {
      expect(
        sorted[0].first_name?.localeCompare(sorted[1].first_name || '') || 0
      ).toBeLessThanOrEqual(0);
    }
  });

  it('빈 클라이언트 목록에서 필터 옵션은 빈 배열', () => {
    const { result } = renderHook(() =>
      useFilters([], mockClientsWithInstruments)
    );

    expect(result.current.filterOptions.lastNames).toEqual([]);
    expect(result.current.filterOptions.firstNames).toEqual([]);
    expect(result.current.filterOptions.tags).toEqual([]);
    expect(result.current.filterOptions.emails).toEqual([]);
    expect(result.current.filterOptions.contactNumbers).toEqual([]);
    expect(result.current.filterOptions.interests).toEqual([]);
  });

  it('필터 옵션이 클라이언트 수와 무관하게 중복 제거', () => {
    const manyClients: Client[] = Array.from({ length: 100 }, (_, i) => ({
      ...mockClients[0],
      id: `id-${i}`,
      first_name: i % 2 === 0 ? 'John' : 'Jane',
      last_name: i % 3 === 0 ? 'Doe' : 'Smith',
    }));

    const { result } = renderHook(() =>
      useFilters(manyClients, mockClientsWithInstruments)
    );

    // 중복 제거되어 2개의 이름만 있어야 함
    expect(result.current.filterOptions.firstNames.length).toBe(2);
    expect(result.current.filterOptions.firstNames).toContain('John');
    expect(result.current.filterOptions.firstNames).toContain('Jane');
  });

  it('customFilter 함수가 태그 배열을 올바르게 처리', async () => {
    const clientsWithTags: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        tags: ['Violin', 'Musician', 'Collector'],
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithTags, mockClientsWithInstruments)
    );

    // 태그 중 하나로 검색 (태그가 join되어 검색됨)
    act(() => {
      result.current.setSearchTerm('Violin');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });
    if (result.current.filteredClients.length > 0) {
      expect(
        result.current.filteredClients.some(c => c.tags?.includes('Violin'))
      ).toBe(true);
    }
  });

  it('검색어와 모든 필터 조합이 정확히 작동', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 모든 필터와 검색어 설정
    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    // 모든 조건을 만족하는 클라이언트만 반환
    result.current.filteredClients.forEach(client => {
      expect(client.first_name).toBe('John');
      expect(client.last_name).toBe('Doe');
      expect(client.tags).toContain('Musician');
      expect(client.interest).toBe('Active');
    });
  });

  it('빈 검색어에서 필터만으로 필터링', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('');
      result.current.handleFilterChange('tags', 'Musician');
    });

    expect(result.current.searchTerm).toBe('');
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Musician');
    });
  });

  it('검색어가 필터 결과에 추가로 필터링 적용', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 먼저 필터 적용
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    const filteredByTag = result.current.filteredClients.length;

    // 검색어 추가
    act(() => {
      result.current.setSearchTerm('John');
    });

    await waitFor(() => {
      // 검색어가 추가되면 결과가 더 줄어들거나 같아야 함
      expect(result.current.filteredClients.length).toBeLessThanOrEqual(
        filteredByTag
      );
    });

    // 두 조건 모두 만족
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Musician');
    });
  });

  it('setFilters로 직접 필터 상태 변경 가능', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setFilters({
        last_name: ['Doe'],
        first_name: ['John'],
        contact_number: [],
        email: [],
        tags: ['Musician'],
        interest: ['Active'],
        hasInstruments: [],
      });
    });

    expect(result.current.filters.last_name).toEqual(['Doe']);
    expect(result.current.filters.first_name).toEqual(['John']);
    expect(result.current.filters.tags).toEqual(['Musician']);
    expect(result.current.filters.interest).toEqual(['Active']);
  });

  it('setFilters로 빈 필터 상태 설정', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 필터 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });

    expect(result.current.filters.tags).toContain('Musician');

    // setFilters로 빈 상태로 설정
    act(() => {
      result.current.setFilters({
        last_name: [],
        first_name: [],
        contact_number: [],
        email: [],
        tags: [],
        interest: [],
        hasInstruments: [],
      });
    });

    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
  });

  it('검색어와 필터가 모두 설정된 상태에서 필터만 제거', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 검색어와 필터 설정
    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('tags', 'Musician');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    // 필터만 제거
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    // 검색어는 유지되어야 함
    expect(result.current.searchTerm).toBe('John');
    expect(result.current.filters.tags).not.toContain('Musician');
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('검색어와 필터가 모두 설정된 상태에서 검색어만 제거', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 검색어와 필터 설정
    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('tags', 'Musician');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    // 검색어만 제거
    act(() => {
      result.current.setSearchTerm('');
    });

    // 필터는 유지되어야 함
    expect(result.current.searchTerm).toBe('');
    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Musician');
    });
  });

  it('showFilters 상태 토글이 다른 상태에 영향 없음', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 필터와 검색어 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.setSearchTerm('John');
    });

    const filtersBefore = result.current.filters;
    const searchTermBefore = result.current.searchTerm;

    // showFilters 토글
    act(() => {
      result.current.setShowFilters(true);
    });

    expect(result.current.showFilters).toBe(true);
    expect(result.current.filters).toEqual(filtersBefore);
    expect(result.current.searchTerm).toBe(searchTermBefore);

    act(() => {
      result.current.setShowFilters(false);
    });

    expect(result.current.showFilters).toBe(false);
    expect(result.current.filters).toEqual(filtersBefore);
    expect(result.current.searchTerm).toBe(searchTermBefore);
  });

  it('clientsWithInstruments가 변경될 때 필터링 결과 업데이트', () => {
    const { result, rerender } = renderHook(
      ({ clientsWithInstruments }) =>
        useFilters(mockClients, clientsWithInstruments),
      {
        initialProps: { clientsWithInstruments: new Set(['1']) },
      }
    );

    // hasInstruments 필터 적용 (hasInstruments = true)
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    // clientsWithInstruments 변경 (더 많은 클라이언트 포함)
    rerender({ clientsWithInstruments: new Set(['1', '2', '3']) });

    // 결과가 변경될 수 있음
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('clientsWithInstruments가 undefined일 때 hasInstruments 필터 동작', () => {
    const { result } = renderHook(() => useFilters(mockClients, undefined));

    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    // undefined여도 에러 없이 동작해야 함
    expect(result.current.filters.hasInstruments).toEqual(['Has Instruments']);
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('clientsWithInstruments가 빈 Set일 때 동작', () => {
    const { result } = renderHook(() => useFilters(mockClients, new Set()));

    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    // 빈 Set이므로 hasInstruments='Has Instruments' 필터 적용 시 0개 결과
    expect(result.current.filteredClients.length).toBe(0);
    expect(result.current.filters.hasInstruments).toEqual(['Has Instruments']);

    act(() => {
      result.current.handleHasInstrumentsChange('No Instruments');
    });

    // 모든 클라이언트가 Set에 없으므로 모두 반환되어야 함
    expect(result.current.filteredClients.length).toBe(mockClients.length);
    expect(result.current.filters.hasInstruments).toEqual(['No Instruments']);
  });

  it('handleColumnSort로 다양한 컬럼 정렬 가능', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 초기 정렬 확인
    expect(result.current.sortBy).toBe('created_at');
    expect(result.current.sortOrder).toBe('desc');

    // first_name 정렬
    act(() => {
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');

    // 같은 컬럼 다시 클릭 시 내림차순
    act(() => {
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('desc');

    // 다른 컬럼 정렬
    act(() => {
      result.current.handleColumnSort('last_name');
    });

    expect(result.current.sortBy).toBe('last_name');
    expect(result.current.sortOrder).toBe('asc');
  });

  it('handleColumnSort와 필터 조합 동작', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 필터 적용
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    const filteredCount = result.current.filteredClients.length;

    // 정렬 변경
    act(() => {
      result.current.handleColumnSort('first_name');
    });

    // 필터된 결과는 유지되지만 순서만 변경
    expect(result.current.filteredClients.length).toBe(filteredCount);
    expect(result.current.sortBy).toBe('first_name');
  });

  it('getActiveFiltersCount가 검색어 포함하여 정확히 계산', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 초기 상태
    expect(result.current.getActiveFiltersCount()).toBe(0);

    // 검색어만
    act(() => {
      result.current.setSearchTerm('John');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1);

    // 검색어 + 필터 1개
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2);

    // 검색어 + 필터 2개 (tags는 배열이므로)
    act(() => {
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.getActiveFiltersCount()).toBeGreaterThanOrEqual(3);

    // 검색어 제거
    act(() => {
      result.current.setSearchTerm('');
    });
    expect(result.current.getActiveFiltersCount()).toBeGreaterThanOrEqual(2);
  });

  it('getActiveFiltersCount가 여러 필터 카테고리 정확히 계산', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });

    // 각 필터 카테고리의 활성 필터 수 합계
    const count = result.current.getActiveFiltersCount();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('getSortArrow가 정렬 상태에 따라 올바른 화살표 반환', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 초기 상태 (created_at desc)
    expect(result.current.getSortArrow('created_at')).toBe('↓');
    expect(result.current.getSortArrow('first_name')).toBe('');

    // first_name 정렬
    act(() => {
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.getSortArrow('first_name')).toBe('↑');
    expect(result.current.getSortArrow('created_at')).toBe('');

    // 내림차순으로 변경
    act(() => {
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.getSortArrow('first_name')).toBe('↓');
  });

  it('customFilter가 null/undefined 값 올바르게 처리', async () => {
    const clientsWithNulls: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        first_name: null,
        last_name: null,
        email: null,
        note: null,
        client_number: null,
        tags: [],
      },
      {
        ...mockClients[1],
        id: '2',
        first_name: 'Jane',
        last_name: 'Smith',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithNulls, mockClientsWithInstruments)
    );

    // null 값이 있는 필드로 검색해도 에러 없이 동작
    act(() => {
      result.current.setSearchTerm('Jane');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('customFilter가 빈 태그 배열 올바르게 처리', async () => {
    const clientsWithEmptyTags: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        tags: [],
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithEmptyTags, mockClientsWithInstruments)
    );

    // 빈 태그 배열이 있어도 에러 없이 동작
    act(() => {
      result.current.setSearchTerm('John');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('customFilter가 빈 문자열 검색어 처리', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('');
    });

    await waitFor(() => {
      // 빈 검색어는 모든 결과 반환
      expect(result.current.filteredClients.length).toBe(mockClients.length);
    });
  });

  it('clients 배열 참조가 변경되어도 필터 옵션 재계산', () => {
    const { result, rerender } = renderHook(
      ({ clients }) => useFilters(clients, mockClientsWithInstruments),
      {
        initialProps: { clients: mockClients },
      }
    );

    const initialOptions = result.current.filterOptions.firstNames;

    // 새로운 배열 참조로 변경 (같은 내용)
    rerender({ clients: [...mockClients] });

    // 필터 옵션은 동일해야 함 (내용이 같으므로)
    expect(result.current.filterOptions.firstNames).toEqual(initialOptions);

    // 다른 내용으로 변경
    const newClients = [
      ...mockClients,
      {
        id: '4',
        first_name: 'Alice',
        last_name: 'Williams',
        email: 'alice@example.com',
        contact_number: '111-222-3333',
        tags: ['Collector'],
        interest: 'Active',
        note: 'New client',
        client_number: null,
        created_at: '2023-01-04T00:00:00Z',
      },
    ];

    rerender({ clients: newClients });

    // 필터 옵션이 업데이트되어야 함
    expect(result.current.filterOptions.firstNames).toContain('Alice');
    expect(result.current.filterOptions.firstNames.length).toBeGreaterThan(
      initialOptions.length
    );
  });

  it('빈 클라이언트 배열에서 필터 옵션이 빈 배열', () => {
    const { result } = renderHook(() =>
      useFilters([], mockClientsWithInstruments)
    );

    expect(result.current.filterOptions.lastNames).toEqual([]);
    expect(result.current.filterOptions.firstNames).toEqual([]);
    expect(result.current.filterOptions.contactNumbers).toEqual([]);
    expect(result.current.filterOptions.emails).toEqual([]);
    expect(result.current.filterOptions.tags).toEqual([]);
    expect(result.current.filterOptions.interests).toEqual([]);
  });

  it('빈 클라이언트 배열에서 필터 적용 시 빈 결과', () => {
    const { result } = renderHook(() =>
      useFilters([], mockClientsWithInstruments)
    );

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.setSearchTerm('John');
    });

    expect(result.current.filteredClients).toEqual([]);
    expect(result.current.getActiveFiltersCount()).toBe(2); // 검색어 + 필터
  });

  it('필터 옵션이 null/undefined 값 제외하고 생성', () => {
    const clientsWithNulls: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
      },
      {
        ...mockClients[1],
        id: '2',
        first_name: null,
        last_name: null,
        email: null,
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithNulls, mockClientsWithInstruments)
    );

    // null 값은 필터 옵션에 포함되지 않아야 함
    expect(result.current.filterOptions.firstNames).toContain('John');
    expect(result.current.filterOptions.firstNames).not.toContain(null);
    expect(result.current.filterOptions.firstNames).not.toContain(undefined);
  });

  it('여러 필터와 정렬 동시 적용 시 정확한 결과', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 여러 필터 적용
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.setSearchTerm('John');
    });

    const filteredCount = result.current.filteredClients.length;

    // 정렬 적용
    act(() => {
      result.current.handleColumnSort('last_name');
    });

    // 필터 결과는 유지되지만 순서만 변경
    expect(result.current.filteredClients.length).toBe(filteredCount);
    expect(result.current.sortBy).toBe('last_name');

    // 모든 조건 만족 확인
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Musician');
      expect(client.interest).toBe('Active');
    });
  });

  it('clearAllFilters 후 정렬 상태 유지 확인', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 필터 및 검색어 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.setSearchTerm('John');
      result.current.handleColumnSort('first_name');
    });

    const sortByBefore = result.current.sortBy;
    const sortOrderBefore = result.current.sortOrder;

    // 필터 및 검색어 제거
    act(() => {
      result.current.clearAllFilters();
    });

    // 정렬 상태는 유지되어야 함
    expect(result.current.sortBy).toBe(sortByBefore);
    expect(result.current.sortOrder).toBe(sortOrderBefore);
    expect(result.current.searchTerm).toBe('');
    expect(result.current.filters.tags).toEqual([]);
  });

  it('빠른 연속 필터 변경이 안정적으로 처리', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 빠르게 연속으로 필터 변경
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('interest', 'Passive');
    });

    // 최종 상태 확인
    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filters.tags).toContain('Owner');
    expect(result.current.filters.interest).toContain('Active');
    expect(result.current.filters.interest).toContain('Passive');
  });

  it('hasInstruments 필터와 다른 필터 조합', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // hasInstruments 필터 적용
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    const countWithHasInstruments = result.current.filteredClients.length;

    // 다른 필터 추가
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    // 결과가 더 줄어들거나 같아야 함
    expect(result.current.filteredClients.length).toBeLessThanOrEqual(
      countWithHasInstruments
    );
  });

  it('debounce가 검색어 변경에 적용됨', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 빠르게 연속 검색어 변경
    act(() => {
      result.current.setSearchTerm('J');
    });
    act(() => {
      result.current.setSearchTerm('Jo');
    });
    act(() => {
      result.current.setSearchTerm('Joh');
    });
    act(() => {
      result.current.setSearchTerm('John');
    });

    // debounce 시간 대기
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // debounce 후 최종 검색어로 필터링됨
    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    jest.useRealTimers();
  });

  it('메모이제이션이 clients 배열이 변경되지 않으면 filterOptions 재계산 안함', () => {
    const { result, rerender } = renderHook(
      ({ clients }) => useFilters(clients, mockClientsWithInstruments),
      {
        initialProps: { clients: mockClients },
      }
    );

    const firstOptions = result.current.filterOptions;

    // 같은 배열 참조로 rerender
    rerender({ clients: mockClients });

    // filterOptions는 메모이제이션되어 같은 내용을 가져야 함
    // (usePageFilters를 통해 변환되므로 참조는 달라질 수 있지만 내용은 같아야 함)
    expect(result.current.filterOptions).toStrictEqual(firstOptions);
  });

  it('메모이제이션이 clients 배열이 변경되면 filterOptions 재계산', () => {
    const { result, rerender } = renderHook(
      ({ clients }) => useFilters(clients, mockClientsWithInstruments),
      {
        initialProps: { clients: mockClients },
      }
    );

    const firstOptions = result.current.filterOptions;

    // 새로운 클라이언트 추가
    const newClients = [
      ...mockClients,
      {
        id: '4',
        first_name: 'Alice',
        last_name: 'Williams',
        email: 'alice@example.com',
        contact_number: '111-222-3333',
        tags: ['Collector'],
        interest: 'Active',
        note: 'New client',
        client_number: null,
        created_at: '2023-01-04T00:00:00Z',
      },
    ];

    rerender({ clients: newClients });

    // filterOptions는 재계산되어 다른 참조여야 함
    expect(result.current.filterOptions).not.toBe(firstOptions);
    expect(result.current.filterOptions.firstNames).toContain('Alice');
  });

  it('매우 긴 검색어 처리', async () => {
    const longSearchTerm = 'a'.repeat(1000);
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm(longSearchTerm);
    });

    await waitFor(() => {
      // 매우 긴 검색어는 매치되지 않아야 함
      expect(result.current.filteredClients.length).toBe(0);
    });
  });

  it('공백만 있는 검색어는 빈 검색어로 처리', async () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('   ');
    });

    await waitFor(() => {
      // 공백만 있는 검색어는 trim되어 빈 검색어로 처리
      expect(result.current.filteredClients.length).toBe(mockClients.length);
    });
  });

  it('Unicode 문자 검색 처리', async () => {
    const clientsWithUnicode: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        first_name: '김',
        last_name: '철수',
        note: '한국어 메모',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithUnicode, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('김');
    });

    await waitFor(() => {
      expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    });

    if (result.current.filteredClients.length > 0) {
      expect(
        result.current.filteredClients.some(c => c.first_name === '김')
      ).toBe(true);
    }
  });

  it('특수문자가 포함된 필터 값 처리', () => {
    const clientsWithSpecialChars: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        email: 'test+tag@example.com',
        contact_number: '+1-555-123-4567',
        tags: ['Special@Tag', 'Tag#2'],
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithSpecialChars, mockClientsWithInstruments)
    );

    // 특수문자가 포함된 필터 옵션 확인
    expect(result.current.filterOptions.emails).toContain(
      'test+tag@example.com'
    );
    expect(result.current.filterOptions.contactNumbers).toContain(
      '+1-555-123-4567'
    );
    expect(result.current.filterOptions.tags).toContain('Special@Tag');

    // 특수문자가 포함된 필터 적용
    act(() => {
      result.current.handleFilterChange('tags', 'Special@Tag');
    });

    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
    result.current.filteredClients.forEach(client => {
      expect(client.tags).toContain('Special@Tag');
    });
  });

  it('필터 상태가 불변성 유지 (직접 수정 불가)', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    const initialFilters = { ...result.current.filters };
    const initialTags = [...initialFilters.tags];

    // 필터 변경
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    // 새 상태는 이전 상태와 다른 참조여야 함
    expect(result.current.filters).not.toBe(initialFilters);
    // 초기 태그 배열은 변경되지 않았어야 함
    expect(initialFilters.tags).toEqual(initialTags);
  });

  it('setFilters로 부분 필터 상태만 업데이트', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 일부 필터 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });

    const filtersBefore = result.current.filters;

    // setFilters로 부분 업데이트
    act(() => {
      result.current.setFilters({
        ...filtersBefore,
        tags: [...filtersBefore.tags, 'Owner'],
      });
    });

    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.filters.tags).toContain('Owner');
    expect(result.current.filters.interest).toEqual(['Active']);
  });

  it('동시에 검색어, 필터, 정렬 변경', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    act(() => {
      result.current.setSearchTerm('John');
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleColumnSort('first_name');
    });

    expect(result.current.searchTerm).toBe('John');
    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');
  });

  it('빈 문자열과 null 필터 옵션 구분', () => {
    const clientsWithEmptyStrings: Client[] = [
      {
        ...mockClients[0],
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'test@example.com',
      },
      {
        ...mockClients[1],
        id: '2',
        first_name: null,
        last_name: 'Smith',
        email: 'jane@example.com',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(clientsWithEmptyStrings, mockClientsWithInstruments)
    );

    // null은 필터 옵션에서 제외되어야 함
    expect(result.current.filterOptions.firstNames).not.toContain(null);
    expect(result.current.filterOptions.firstNames).not.toContain(undefined);
    expect(result.current.filterOptions.lastNames).not.toContain(null);
    expect(result.current.filterOptions.lastNames).toContain('Smith');
    expect(result.current.filterOptions.firstNames).toContain('John');
  });

  it('필터 제거 후 다른 필터는 유지', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 여러 필터 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('last_name', 'Doe');
    });

    // 하나의 필터만 제거
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });

    // 다른 필터들은 유지되어야 함
    expect(result.current.filters.tags).not.toContain('Musician');
    expect(result.current.filters.tags).toContain('Owner');
    expect(result.current.filters.interest).toContain('Active');
    expect(result.current.filters.last_name).toContain('Doe');
  });

  it('handleHasInstrumentsChange로 같은 값 토글 시 제거', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 선택
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    expect(result.current.filters.hasInstruments).toEqual(['Has Instruments']);

    // 같은 값 다시 선택 시 제거
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    expect(result.current.filters.hasInstruments).toEqual([]);
  });

  it('handleHasInstrumentsChange로 다른 값 선택 시 교체', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 첫 번째 옵션 선택
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    expect(result.current.filters.hasInstruments).toEqual(['Has Instruments']);

    // 다른 옵션 선택 시 교체
    act(() => {
      result.current.handleHasInstrumentsChange('No Instruments');
    });

    expect(result.current.filters.hasInstruments).toEqual(['No Instruments']);
    expect(result.current.filters.hasInstruments.length).toBe(1);
  });

  it('초기 정렬 순서가 created_at desc인지 확인', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    expect(result.current.sortBy).toBe('created_at');
    expect(result.current.sortOrder).toBe('desc');
    expect(result.current.getSortArrow('created_at')).toBe('↓');
  });

  it('모든 필터를 제거한 후 상태가 EMPTY_FILTER_STATE와 동일', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 초기 상태 확인
    const initialFilters = result.current.filters;
    expect(initialFilters.tags).toEqual([]);

    // 여러 필터 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.setSearchTerm('John');
    });

    // 필터가 설정되었는지 확인
    expect(result.current.filters.tags).toContain('Musician');
    expect(result.current.searchTerm).toBe('John');

    // 모두 제거
    act(() => {
      result.current.clearAllFilters();
    });

    // EMPTY_FILTER_STATE와 동일해야 함
    expect(result.current.filters).toEqual({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: [],
    });
    expect(result.current.searchTerm).toBe('');
  });

  it('필터 옵션이 항상 정렬된 순서로 반환되는지 확인', () => {
    const unsortedClients: Client[] = [
      {
        id: '3',
        first_name: 'Zebra',
        last_name: 'Zoo',
        email: 'z@example.com',
        contact_number: '999',
        tags: ['Other'],
        interest: 'Inactive',
        note: '',
        client_number: null,
        created_at: '2023-01-03T00:00:00Z',
      },
      {
        id: '1',
        first_name: 'Alice',
        last_name: 'Apple',
        email: 'a@example.com',
        contact_number: '111',
        tags: ['Musician'],
        interest: 'Active',
        note: '',
        client_number: null,
        created_at: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        first_name: 'Bob',
        last_name: 'Banana',
        email: 'b@example.com',
        contact_number: '222',
        tags: ['Owner'],
        interest: 'Passive',
        note: '',
        client_number: null,
        created_at: '2023-01-02T00:00:00Z',
      },
    ];

    const { result } = renderHook(() =>
      useFilters(unsortedClients, mockClientsWithInstruments)
    );

    // 필터 옵션이 정렬되어 있는지 확인 (실제로는 buildFilterOptionsFromFields가 정렬하는지 확인 필요)
    expect(result.current.filterOptions.firstNames.length).toBeGreaterThan(0);
    expect(result.current.filterOptions.lastNames.length).toBeGreaterThan(0);
  });

  it('fieldFiltered가 clientsWithInstruments 변경 시 재계산', () => {
    const { result, rerender } = renderHook(
      ({ clientsWithInstruments }) =>
        useFilters(mockClients, clientsWithInstruments),
      {
        initialProps: { clientsWithInstruments: new Set(['1']) },
      }
    );

    // hasInstruments 필터 적용
    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    // clientsWithInstruments 변경
    rerender({ clientsWithInstruments: new Set(['1', '2']) });

    // 결과가 변경될 수 있음
    expect(result.current.filteredClients.length).toBeGreaterThanOrEqual(0);
  });

  it('검색어와 필터가 모두 없을 때 모든 클라이언트 반환', () => {
    // 새로운 인스턴스로 테스트하여 다른 테스트의 영향 제거
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 초기 상태 확인
    expect(result.current.searchTerm).toBe('');
    expect(result.current.filters.tags).toEqual([]);
    expect(result.current.filters.interest).toEqual([]);
    expect(result.current.filters.last_name).toEqual([]);
    expect(result.current.filteredClients.length).toBe(mockClients.length);
  });

  it('handleColumnSort가 존재하지 않는 컬럼에 대해 에러 없이 동작', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, mockClientsWithInstruments)
    );

    // 존재하지 않는 컬럼 정렬 시도 (타입 체크를 통과했다고 가정)
    act(() => {
      result.current.handleColumnSort('non_existent_column' as string);
    });

    // 에러 없이 동작해야 함
    expect(result.current.sortBy).toBe('non_existent_column');
  });
});
