// src/app/clients/hooks/__tests__/useFilters.sort-and-counters.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useFilters } from '../useFilters';
import { Client } from '@/types';

const mockClients: Client[] = [
  {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    contact_number: '1',
    tags: ['Musician'],
    interest: 'Active',
    note: '',
    client_number: null,
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    contact_number: '2',
    tags: ['Owner'],
    interest: 'Passive',
    note: '',
    client_number: null,
    created_at: '2023-01-02T00:00:00Z',
  },
];

describe('useFilters - 정렬/카운트/표시', () => {
  it('컬럼 정렬 및 토글', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortOrder).toBe('desc');
  });

  it('정렬 표시 화살표', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.getSortArrow('first_name')).toBe('↑');
    expect(result.current.getSortArrow('last_name')).toBe('');
  });

  it('활성 필터 수 계산', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2);
  });

  it('검색어 포함된 활성 필터 수 계산', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 검색어만
    act(() => {
      result.current.setSearchTerm('John');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1);

    // 검색어 + 필터
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2);

    // 검색어 + 여러 필터
    act(() => {
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('last_name', 'Doe');
    });
    expect(result.current.getActiveFiltersCount()).toBe(4);

    // 검색어 제거
    act(() => {
      result.current.setSearchTerm('');
    });
    expect(result.current.getActiveFiltersCount()).toBe(3);
  });

  it('복잡한 필터 조합에서 활성 필터 수 계산', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 모든 필터 타입 적용
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
      result.current.handleFilterChange('email', 'john@example.com');
      result.current.handleHasInstrumentsChange('Has Instruments');
      result.current.setSearchTerm('test');
    });

    // countActiveFilters는 각 필터 값의 개수를 세므로
    // tags: 2 (Musician, Owner), interest: 1, last_name: 1, first_name: 1, email: 1, hasInstruments: 1, searchTerm: 1
    // 총 8개
    expect(result.current.getActiveFiltersCount()).toBe(8);

    // 필터 제거 시 카운트 감소
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    // tags에 Owner가 아직 남아있으므로 tags는 1개 값
    expect(result.current.getActiveFiltersCount()).toBe(7);

    // 마지막 tags 제거
    act(() => {
      result.current.handleFilterChange('tags', 'Owner');
    });
    expect(result.current.getActiveFiltersCount()).toBe(6);
  });

  it('hasInstruments 필터는 단일 선택이므로 카운트 1', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    act(() => {
      result.current.handleHasInstrumentsChange('Has Instruments');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1);

    // 다른 옵션으로 변경해도 여전히 1
    act(() => {
      result.current.handleHasInstrumentsChange('No Instruments');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1);

    // 해제 시 0
    act(() => {
      result.current.handleHasInstrumentsChange('No Instruments');
    });
    expect(result.current.getActiveFiltersCount()).toBe(0);
  });

  it('clearAllFilters 후 활성 필터 수는 0', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 여러 필터와 검색어 설정
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleHasInstrumentsChange('Has Instruments');
      result.current.setSearchTerm('test');
    });

    expect(result.current.getActiveFiltersCount()).toBeGreaterThan(0);

    // 전체 초기화
    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.getActiveFiltersCount()).toBe(0);
  });

  it('빈 필터 배열은 카운트에 포함되지 않음', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 필터 추가 후 제거 (빈 배열로 만들기)
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Musician'); // 토글로 제거
    });

    expect(result.current.filters.tags).toEqual([]);
    expect(result.current.getActiveFiltersCount()).toBe(0);
  });

  it('여러 컬럼 정렬 순차 변경 테스트', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // first_name 정렬
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortBy).toBe('first_name');
    expect(result.current.sortOrder).toBe('asc');

    // 같은 컬럼 다시 정렬 - desc로 변경
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortOrder).toBe('desc');

    // 다른 컬럼 정렬 - 새로운 컬럼은 asc로 시작
    act(() => {
      result.current.handleColumnSort('last_name');
    });
    expect(result.current.sortBy).toBe('last_name');
    expect(result.current.sortOrder).toBe('asc');
  });

  it('정렬 상태에 따른 화살표 표시', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 초기 상태 - 정렬되지 않은 컬럼은 빈 문자열
    expect(result.current.getSortArrow('first_name')).toBe('');

    // first_name 오름차순 정렬
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.getSortArrow('first_name')).toBe('↑');
    expect(result.current.getSortArrow('last_name')).toBe('');

    // first_name 내림차순 정렬
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.getSortArrow('first_name')).toBe('↓');
    expect(result.current.getSortArrow('last_name')).toBe('');
  });

  it('빈 검색어는 활성 필터 수에 포함되지 않음', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 빈 문자열
    act(() => {
      result.current.setSearchTerm('');
    });
    expect(result.current.getActiveFiltersCount()).toBe(0);

    // 공백만 있는 문자열도 빈 문자열로 처리되는지 확인
    act(() => {
      result.current.setSearchTerm('   ');
    });
    // 공백은 truthy이므로 1로 카운트됨 (실제 동작 확인)
    expect(result.current.getActiveFiltersCount()).toBeGreaterThan(0);

    // 다시 빈 문자열로
    act(() => {
      result.current.setSearchTerm('');
    });
    expect(result.current.getActiveFiltersCount()).toBe(0);
  });

  it('필터 제거 시 카운트가 정확히 감소', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 필터 3개 추가
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.getActiveFiltersCount()).toBe(3);

    // 필터 1개 제거
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2);

    // 필터 1개 더 제거
    act(() => {
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1);

    // 마지막 필터 제거
    act(() => {
      result.current.handleFilterChange('tags', 'Owner');
    });
    expect(result.current.getActiveFiltersCount()).toBe(0);
  });

  it('모든 필터 타입의 카운트가 정확히 계산됨', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 각 필터 타입에 1개씩 추가
    act(() => {
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
      result.current.handleFilterChange('contact_number', '123');
      result.current.handleFilterChange('email', 'test@test.com');
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleHasInstrumentsChange('Has Instruments');
    });

    // 각 카테고리당 1개씩 = 7개 필터
    // (last_name, first_name, contact_number, email, tags, interest, hasInstruments)
    expect(result.current.getActiveFiltersCount()).toBe(7);
  });

  it('검색어와 필터의 카운트가 독립적으로 계산됨', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 검색어만
    act(() => {
      result.current.setSearchTerm('test');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1);

    // 필터 추가
    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2);

    // 검색어 제거 (필터 유지)
    act(() => {
      result.current.setSearchTerm('');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1);

    // 검색어 다시 추가
    act(() => {
      result.current.setSearchTerm('test2');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2);
  });

  it('모든 정렬 가능한 컬럼에 대해 정렬 동작 확인', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    const sortableColumns: (keyof Client)[] = [
      'first_name',
      'last_name',
      'email',
      'contact_number',
      'created_at',
    ];

    sortableColumns.forEach(column => {
      act(() => {
        result.current.handleColumnSort(column);
      });
      expect(result.current.sortBy).toBe(column);
      expect(result.current.sortOrder).toBe('asc');
    });
  });

  it('정렬 후 같은 컬럼 다시 클릭 시 order 토글', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortOrder).toBe('asc');

    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortOrder).toBe('desc');

    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.sortOrder).toBe('asc');
  });

  it('정렬 화살표가 모든 컬럼에서 올바르게 표시', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 정렬되지 않은 컬럼
    expect(result.current.getSortArrow('first_name')).toBe('');
    expect(result.current.getSortArrow('last_name')).toBe('');

    // first_name 정렬
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.getSortArrow('first_name')).toBe('↑');
    expect(result.current.getSortArrow('last_name')).toBe('');

    // 내림차순으로 변경
    act(() => {
      result.current.handleColumnSort('first_name');
    });
    expect(result.current.getSortArrow('first_name')).toBe('↓');
  });

  it('활성 필터 수가 0일 때 getActiveFiltersCount', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    expect(result.current.getActiveFiltersCount()).toBe(0);
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

  it('검색어만 있고 필터 없을 때 카운트는 1', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    act(() => {
      result.current.setSearchTerm('test');
    });

    expect(result.current.getActiveFiltersCount()).toBe(1);
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

  it('필터만 있고 검색어 없을 때 카운트는 필터 수만큼', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    act(() => {
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('interest', 'Active');
    });

    expect(result.current.getActiveFiltersCount()).toBe(2);
    expect(result.current.searchTerm).toBe('');
  });

  it('매우 많은 필터가 적용된 경우 카운트 정확성', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    act(() => {
      // 모든 필터 카테고리에 값 추가
      result.current.handleFilterChange('last_name', 'Doe');
      result.current.handleFilterChange('first_name', 'John');
      result.current.handleFilterChange('contact_number', '123');
      result.current.handleFilterChange('email', 'test@test.com');
      result.current.handleFilterChange('tags', 'Musician');
      result.current.handleFilterChange('tags', 'Owner');
      result.current.handleFilterChange('interest', 'Active');
      result.current.handleHasInstrumentsChange('Has Instruments');
      result.current.setSearchTerm('search');
    });

    // last_name: 1, first_name: 1, contact_number: 1, email: 1, tags: 2, interest: 1, hasInstruments: 1, searchTerm: 1
    // 총 9개
    expect(result.current.getActiveFiltersCount()).toBe(9);
  });

  it('필터 제거 순서와 카운트 변화', () => {
    const { result } = renderHook(() =>
      useFilters(mockClients, new Set(['1']))
    );

    // 여러 필터 추가
    act(() => {
      result.current.handleFilterChange('tags', 'A');
      result.current.handleFilterChange('tags', 'B');
      result.current.handleFilterChange('interest', 'Active');
      result.current.setSearchTerm('test');
    });

    expect(result.current.getActiveFiltersCount()).toBe(4); // tags: 2, interest: 1, search: 1

    // 필터 하나씩 제거
    act(() => {
      result.current.handleFilterChange('tags', 'A');
    });
    expect(result.current.getActiveFiltersCount()).toBe(3); // tags: 1, interest: 1, search: 1

    act(() => {
      result.current.handleFilterChange('interest', 'Active');
    });
    expect(result.current.getActiveFiltersCount()).toBe(2); // tags: 1, search: 1

    act(() => {
      result.current.setSearchTerm('');
    });
    expect(result.current.getActiveFiltersCount()).toBe(1); // tags: 1

    act(() => {
      result.current.handleFilterChange('tags', 'B');
    });
    expect(result.current.getActiveFiltersCount()).toBe(0);
  });
});
