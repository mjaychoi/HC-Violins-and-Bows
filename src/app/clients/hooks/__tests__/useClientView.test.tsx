import { renderHook, act } from '@/test-utils/render';
import { useClientView } from '../useClientView';
import { Client } from '@/types';

// Mock the interest policy
jest.mock('@/policies/interest', () => ({
  shouldShowInterestDropdown: jest.fn((tags: string[]) =>
    tags.some(tag => ['Musician', 'Dealer', 'Collector'].includes(tag))
  ),
}));

describe('useClientView', () => {
  const mockClient: Client = {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    contact_number: '123-456-7890',
    email: 'john@example.com',
    tags: ['Musician'],
    interest: 'Active',
    note: 'Test note',
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
  };

  it('초기 상태: 모달 닫힘, 선택된 클라이언트 없음, 편집 모드 아님', () => {
    const { result } = renderHook(() => useClientView());

    expect(result.current.showViewModal).toBe(false);
    expect(result.current.selectedClient).toBe(null);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.viewFormData).toEqual({
      last_name: '',
      first_name: '',
      contact_number: '',
      email: '',
      tags: [],
      interest: '',
      note: '',
    });
    expect(result.current.showInterestDropdown).toBe(false);
  });

  describe('openClientView', () => {
    it('클라이언트 뷰 모달 열기 (기본값: 편집 모드)', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      expect(result.current.showViewModal).toBe(true);
      expect(result.current.selectedClient).toEqual(mockClient);
      expect(result.current.isEditing).toBe(true);
      expect(result.current.viewFormData).toEqual({
        last_name: mockClient.last_name,
        first_name: mockClient.first_name,
        contact_number: mockClient.contact_number,
        email: mockClient.email,
        tags: mockClient.tags,
        interest: mockClient.interest,
        note: mockClient.note,
      });
      expect(result.current.showInterestDropdown).toBe(true); // Musician 태그 포함
    });

    it('클라이언트 뷰 모달 열기 (읽기 전용 모드)', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient, false);
      });

      expect(result.current.showViewModal).toBe(true);
      expect(result.current.selectedClient).toEqual(mockClient);
      expect(result.current.isEditing).toBe(false);
    });

    it('null/undefined 필드 처리', () => {
      const clientWithNulls: Client = {
        ...mockClient,
        last_name: null,
        first_name: null,
        contact_number: null,
        email: null,
        tags: null as unknown as string[],
        interest: null,
        note: null,
      };

      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(clientWithNulls);
      });

      expect(result.current.viewFormData).toEqual({
        last_name: '',
        first_name: '',
        contact_number: '',
        email: '',
        tags: [],
        interest: '',
        note: '',
      });
    });
  });

  describe('closeClientView', () => {
    it('모달 닫기 및 상태 리셋', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      expect(result.current.showViewModal).toBe(true);
      expect(result.current.selectedClient).toEqual(mockClient);

      act(() => {
        result.current.closeClientView();
      });

      expect(result.current.showViewModal).toBe(false);
      expect(result.current.selectedClient).toBe(null);
      expect(result.current.isEditing).toBe(false);
      expect(result.current.viewFormData).toEqual({
        last_name: '',
        first_name: '',
        contact_number: '',
        email: '',
        tags: [],
        interest: '',
        note: '',
      });
    });
  });

  describe('편집 모드 제어', () => {
    it('startEditing: 편집 모드 시작', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient, false);
      });

      expect(result.current.isEditing).toBe(false);

      act(() => {
        result.current.startEditing();
      });

      expect(result.current.isEditing).toBe(true);
    });

    it('stopEditing: 편집 모드 종료', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient, true);
      });

      expect(result.current.isEditing).toBe(true);

      act(() => {
        result.current.stopEditing();
      });

      expect(result.current.isEditing).toBe(false);
    });
  });

  describe('viewFormData 업데이트', () => {
    it('updateViewFormData: 부분 업데이트', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      act(() => {
        result.current.updateViewFormData({
          first_name: 'Jane',
          email: 'jane@example.com',
        });
      });

      expect(result.current.viewFormData.first_name).toBe('Jane');
      expect(result.current.viewFormData.email).toBe('jane@example.com');
      expect(result.current.viewFormData.last_name).toBe(mockClient.last_name); // 기존 값 유지
    });

    it('setField: 단일 필드 업데이트', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      act(() => {
        result.current.setField('first_name', 'Jane');
      });

      expect(result.current.viewFormData.first_name).toBe('Jane');
      expect(result.current.viewFormData.last_name).toBe(mockClient.last_name); // 기존 값 유지
    });
  });

  describe('태그 관리', () => {
    it('toggleTag: 태그 추가', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      act(() => {
        result.current.toggleTag('Dealer', true);
      });

      expect(result.current.viewFormData.tags).toContain('Dealer');
      expect(result.current.viewFormData.tags).toContain('Musician'); // 기존 태그 유지
      expect(result.current.viewFormData.tags.length).toBe(2);
    });

    it('toggleTag: 태그 제거', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      act(() => {
        result.current.toggleTag('Musician', false);
      });

      expect(result.current.viewFormData.tags).not.toContain('Musician');
      expect(result.current.viewFormData.tags.length).toBe(0);
    });

    it('toggleTag: 중복 태그 추가 방지', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      act(() => {
        result.current.toggleTag('Dealer', true);
        result.current.toggleTag('Dealer', true); // 중복 추가 시도
      });

      expect(
        result.current.viewFormData.tags.filter(t => t === 'Dealer').length
      ).toBe(1);
    });

    it('showInterestDropdown: 태그에 따라 변경됨', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      expect(result.current.showInterestDropdown).toBe(true); // Musician 태그 포함

      act(() => {
        result.current.toggleTag('Musician', false);
      });

      expect(result.current.showInterestDropdown).toBe(false);
    });
  });

  describe('handleViewInputChange', () => {
    it('텍스트 입력 필드 변경', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      const mockEvent = {
        target: {
          name: 'first_name',
          value: 'Jane',
          type: 'text',
        },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleViewInputChange(mockEvent);
      });

      expect(result.current.viewFormData.first_name).toBe('Jane');
    });

    it('선택 필드 변경', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      const mockEvent = {
        target: {
          name: 'interest',
          value: 'Inactive',
          type: 'select-one',
        },
      } as React.ChangeEvent<HTMLSelectElement>;

      act(() => {
        result.current.handleViewInputChange(mockEvent);
      });

      expect(result.current.viewFormData.interest).toBe('Inactive');
    });

    it('태그 체크박스 변경 (추가)', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      const mockEvent = {
        target: {
          name: 'tags',
          value: 'Dealer',
          type: 'checkbox',
          checked: true,
        },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleViewInputChange(mockEvent);
      });

      expect(result.current.viewFormData.tags).toContain('Dealer');
    });

    it('태그 체크박스 변경 (제거)', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      const mockEvent = {
        target: {
          name: 'tags',
          value: 'Musician',
          type: 'checkbox',
          checked: false,
        },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleViewInputChange(mockEvent);
      });

      expect(result.current.viewFormData.tags).not.toContain('Musician');
    });

    it('태그가 아닌 체크박스는 무시', () => {
      const { result } = renderHook(() => useClientView());

      act(() => {
        result.current.openClientView(mockClient);
      });

      const initialFormData = { ...result.current.viewFormData };

      const mockEvent = {
        target: {
          name: 'other_checkbox',
          value: 'value',
          type: 'checkbox',
          checked: true,
        },
      } as React.ChangeEvent<HTMLInputElement>;

      act(() => {
        result.current.handleViewInputChange(mockEvent);
      });

      expect(result.current.viewFormData).toEqual(initialFormData); // 변경 없음
    });
  });

  describe('통합 시나리오', () => {
    it('클라이언트 열기 -> 수정 -> 저장 -> 닫기', () => {
      const { result } = renderHook(() => useClientView());

      // 1. 클라이언트 열기
      act(() => {
        result.current.openClientView(mockClient, false);
      });

      expect(result.current.showViewModal).toBe(true);
      expect(result.current.isEditing).toBe(false);

      // 2. 편집 모드 시작
      act(() => {
        result.current.startEditing();
      });

      expect(result.current.isEditing).toBe(true);

      // 3. 필드 수정
      act(() => {
        result.current.setField('first_name', 'Jane');
        result.current.setField('email', 'jane@example.com');
      });

      expect(result.current.viewFormData.first_name).toBe('Jane');
      expect(result.current.viewFormData.email).toBe('jane@example.com');

      // 4. 편집 모드 종료
      act(() => {
        result.current.stopEditing();
      });

      expect(result.current.isEditing).toBe(false);

      // 5. 모달 닫기
      act(() => {
        result.current.closeClientView();
      });

      expect(result.current.showViewModal).toBe(false);
      expect(result.current.selectedClient).toBe(null);
    });

    it('여러 클라이언트를 순차적으로 열기', () => {
      const { result } = renderHook(() => useClientView());

      const client1 = mockClient;
      const client2: Client = {
        ...mockClient,
        id: '2',
        first_name: 'Jane',
        last_name: 'Smith',
      };

      // 첫 번째 클라이언트 열기
      act(() => {
        result.current.openClientView(client1);
      });

      expect(result.current.selectedClient?.id).toBe('1');
      expect(result.current.viewFormData.first_name).toBe('John');

      // 두 번째 클라이언트로 변경
      act(() => {
        result.current.openClientView(client2);
      });

      expect(result.current.selectedClient?.id).toBe('2');
      expect(result.current.viewFormData.first_name).toBe('Jane');
      expect(result.current.viewFormData.last_name).toBe('Smith');
    });
  });
});
