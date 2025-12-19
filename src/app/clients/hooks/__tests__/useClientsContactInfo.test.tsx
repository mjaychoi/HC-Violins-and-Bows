import { renderHook, act, waitFor } from '@/test-utils/render';
import { useClientsContactInfo } from '../useClientsContactInfo';
import { ContactLog } from '@/types';
import { flushPromises } from '../../../../../tests/utils/flushPromises';

const mockToday = { value: '2024-01-19' };

jest.mock('@/utils/dateParsing', () => {
  const actual = jest.requireActual('@/utils/dateParsing');
  return {
    __esModule: true,
    ...actual,
    todayLocalYMD: () => mockToday.value,
  };
});

// Mock fetch globally
global.fetch = jest.fn();

describe('useClientsContactInfo', () => {
  const mockContactLogs: ContactLog[] = [
    {
      id: '1',
      client_id: 'client1',
      instrument_id: null,
      contact_type: 'phone',
      subject: 'Initial contact',
      content: 'Called to discuss pricing',
      contact_date: '2024-01-15',
      next_follow_up_date: '2024-01-20',
      follow_up_completed_at: null,
      purpose: 'inquiry',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      client: undefined,
      instrument: undefined,
    },
    {
      id: '2',
      client_id: 'client1',
      instrument_id: null,
      contact_type: 'email',
      subject: 'Follow-up',
      content: 'Sent pricing information',
      contact_date: '2024-01-18',
      next_follow_up_date: '2024-01-25',
      follow_up_completed_at: null,
      purpose: 'follow_up',
      created_at: '2024-01-18T10:00:00Z',
      updated_at: '2024-01-18T10:00:00Z',
      client: undefined,
      instrument: undefined,
    },
    {
      id: '3',
      client_id: 'client2',
      instrument_id: null,
      contact_type: 'meeting',
      subject: 'Meeting',
      content: 'Met in person',
      contact_date: '2024-01-10',
      next_follow_up_date: '2024-01-17',
      follow_up_completed_at: '2024-01-17T10:00:00Z',
      purpose: 'inquiry',
      created_at: '2024-01-10T10:00:00Z',
      updated_at: '2024-01-17T10:00:00Z',
      client: undefined,
      instrument: undefined,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockToday.value = '2024-01-19';
  });

  it('초기 상태: 빈 맵, loading=false', () => {
    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: [], enabled: true })
    );

    expect(result.current.contactInfoMap.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it('enabled=false일 때 데이터를 가져오지 않음', async () => {
    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: false })
    );

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.contactInfoMap.size).toBe(0);
    });
  });

  it('clientIds가 비어있으면 데이터를 가져오지 않음', async () => {
    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: [], enabled: true })
    );

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.contactInfoMap.size).toBe(0);
    });
  });

  it('클라이언트 연락 정보 가져오기 성공', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: mockContactLogs.filter(log => log.client_id === 'client1'),
      }),
    });

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 5000 }
    );

    const contactInfo = result.current.getContactInfo('client1');
    expect(contactInfo).not.toBeNull();
    expect(contactInfo?.lastContactDate).toBe('2024-01-18'); // 가장 최근 연락일
    expect(contactInfo?.nextFollowUpDate).toBe('2024-01-20'); // 가장 이른 미완료 팔로우업
    expect(contactInfo?.isOverdue).toBe(false); // 오늘 기준으로 계산
  });

  it('여러 클라이언트의 연락 정보 가져오기', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockContactLogs }),
    });

    const { result } = renderHook(() =>
      useClientsContactInfo({
        clientIds: ['client1', 'client2'],
        enabled: true,
      })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    const contactInfo1 = result.current.getContactInfo('client1');
    const contactInfo2 = result.current.getContactInfo('client2');

    expect(contactInfo1).not.toBeNull();
    expect(contactInfo2).not.toBeNull();
    expect(contactInfo1?.clientId).toBe('client1');
    expect(contactInfo2?.clientId).toBe('client2');
  });

  it('배치 크기 제한 (100개 이상)', async () => {
    const manyClientIds = Array.from({ length: 150 }, (_, i) => `client${i}`);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    renderHook(() =>
      useClientsContactInfo({ clientIds: manyClientIds, enabled: true })
    );

    await waitFor(() => {
      // 150개 클라이언트 = 2개의 배치 (100 + 50)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('연락 로그가 없는 클라이언트', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client3'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    const contactInfo = result.current.getContactInfo('client3');
    expect(contactInfo).not.toBeNull();
    expect(contactInfo?.lastContactDate).toBeNull();
    expect(contactInfo?.nextFollowUpDate).toBeNull();
    expect(contactInfo?.isOverdue).toBe(false);
    expect(contactInfo?.daysSinceLastContact).toBeNull();
    expect(contactInfo?.daysUntilFollowUp).toBeNull();
  });

  it('팔로우업 완료된 로그는 nextFollowUpDate에서 제외', async () => {
    const logs: ContactLog[] = [
      {
        id: '1',
        client_id: 'client1',
        instrument_id: null,
        contact_type: 'phone',
        subject: 'Old follow-up',
        content: 'Content',
        contact_date: '2024-01-10',
        next_follow_up_date: '2024-01-15',
        follow_up_completed_at: '2024-01-15T10:00:00Z', // 완료됨
        purpose: 'follow_up',
        created_at: '2024-01-10T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        client: undefined,
        instrument: undefined,
      },
      {
        id: '2',
        client_id: 'client1',
        instrument_id: null,
        contact_type: 'phone',
        subject: 'New follow-up',
        content: 'Content',
        contact_date: '2024-01-18',
        next_follow_up_date: '2024-01-25',
        follow_up_completed_at: null, // 미완료
        purpose: 'follow_up',
        created_at: '2024-01-18T10:00:00Z',
        updated_at: '2024-01-18T10:00:00Z',
        client: undefined,
        instrument: undefined,
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: logs }),
    });

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    const contactInfo = result.current.getContactInfo('client1');
    expect(contactInfo?.nextFollowUpDate).toBe('2024-01-25'); // 완료되지 않은 것만
  });

  it('지연된 팔로우업 감지', async () => {
    mockToday.value = '2024-01-23';
    const overdueDate = '2024-01-20'; // 오늘(23) 기준 지연됨

    const logs: ContactLog[] = [
      {
        id: '1',
        client_id: 'client1',
        instrument_id: null,
        contact_type: 'phone',
        subject: 'Overdue follow-up',
        content: 'Content',
        contact_date: '2024-01-10',
        next_follow_up_date: overdueDate, // 지연됨
        follow_up_completed_at: null,
        purpose: 'follow_up',
        created_at: '2024-01-10T10:00:00Z',
        updated_at: '2024-01-10T10:00:00Z',
        client: undefined,
        instrument: undefined,
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: logs }),
    });

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    const contactInfo = result.current.getContactInfo('client1');
    expect(contactInfo?.isOverdue).toBe(true);
  });

  it('API 에러 처리', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Failed to fetch' }),
    });

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    expect(result.current.contactInfoMap.size).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('fetch 에러 처리', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    expect(result.current.contactInfoMap.size).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('getContactInfo: 존재하지 않는 클라이언트', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    const contactInfo = result.current.getContactInfo('nonexistent');
    expect(contactInfo).toBeNull();
  });

  it('clientIds 변경 시 재조회', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockContactLogs.filter(log => log.client_id === 'client1'),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockContactLogs.filter(log => log.client_id === 'client2'),
        }),
      });

    const { result, rerender } = renderHook(
      ({ clientIds }) => useClientsContactInfo({ clientIds, enabled: true }),
      {
        initialProps: { clientIds: ['client1'] },
      }
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    expect(result.current.getContactInfo('client1')).not.toBeNull();

    // clientIds 변경
    rerender({ clientIds: ['client2'] });

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    expect(result.current.getContactInfo('client2')).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('clientIds가 동일하면 재조회하지 않음', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { rerender } = renderHook(
      ({ clientIds }) => useClientsContactInfo({ clientIds, enabled: true }),
      {
        initialProps: { clientIds: ['client1'] },
      }
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // 동일한 clientIds로 재렌더링
    rerender({ clientIds: ['client1'] });

    await waitFor(() => {
      // 재조회되지 않아야 함
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('refetch: 강제 재조회', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 }
    );

    act(() => {
      result.current.refetch();
    });

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 }
    );
  });

  it('날짜 포맷팅 확인', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            ...mockContactLogs[0],
            contact_date: '2024-01-15',
            next_follow_up_date: '2024-01-20',
          },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useClientsContactInfo({ clientIds: ['client1'], enabled: true })
    );

    await act(async () => {
      await flushPromises();
    });

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false);
      },
      { timeout: 3000 }
    );

    const contactInfo = result.current.getContactInfo('client1');
    expect(contactInfo?.lastContactDateDisplay).toBeTruthy();
    expect(contactInfo?.nextFollowUpDateDisplay).toBeTruthy();
  });
});
