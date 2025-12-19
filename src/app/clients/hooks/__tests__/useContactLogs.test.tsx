import { renderHook, act, waitFor } from '@/test-utils/render';
import { useContactLogs } from '../useContactLogs';
import { ContactLog } from '@/types';

// Mock fetch globally
global.fetch = jest.fn();

// Mock useErrorHandler and useLoadingState
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

// Mock useLoadingState
const mockWithSubmitting = jest.fn(fn => Promise.resolve(fn()));
jest.mock('@/hooks/useLoadingState', () => ({
  useLoadingState: () => ({
    loading: false,
    submitting: false,
    withSubmitting: mockWithSubmitting,
  }),
}));

describe('useContactLogs', () => {
  const mockContactLogs: ContactLog[] = [
    {
      id: '1',
      client_id: 'client1',
      instrument_id: 'inst1',
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
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    mockHandleError.mockClear();
    mockWithSubmitting.mockImplementation(fn => Promise.resolve(fn()));
  });

  describe('초기화 및 fetchContactLogs', () => {
    it('초기 상태: 빈 배열, loading=false', () => {
      const { result } = renderHook(() =>
        useContactLogs({ clientId: undefined })
      );

      expect(result.current.contactLogs).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('clientId가 없으면 데이터를 가져오지 않음', async () => {
      const { result } = renderHook(() =>
        useContactLogs({ clientId: undefined, autoFetch: true })
      );

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(result.current.contactLogs).toEqual([]);
      });
    });

    it('autoFetch=false일 때 자동으로 가져오지 않음', async () => {
      renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: false })
      );

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });

    it('연락 로그 가져오기 성공 (clientId만)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockContactLogs,
        }),
      });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('clientId=client1')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.not.stringContaining('instrumentId')
      );
    });

    it('연락 로그 가져오기 성공 (clientId + instrumentId)', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockContactLogs[0]],
        }),
      });

      const { result } = renderHook(() =>
        useContactLogs({
          clientId: 'client1',
          instrumentId: 'inst1',
          autoFetch: true,
        })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(1);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('clientId=client1')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('instrumentId=inst1')
      );
    });

    it('fetchContactLogs: 수동으로 가져오기', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: mockContactLogs,
        }),
      });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: false })
      );

      await act(async () => {
        await result.current.fetchContactLogs();
      });

      expect(result.current.contactLogs).toHaveLength(2);
    });

    it('API 에러 처리', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Failed to fetch contact logs',
        }),
      });

      renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(mockHandleError).toHaveBeenCalled();
      });
    });

    it('fetch 에러 처리', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(mockHandleError).toHaveBeenCalled();
      });
    });
  });

  describe('addContact', () => {
    const newContact = {
      client_id: 'client1',
      instrument_id: 'inst1',
      contact_type: 'phone' as const,
      subject: 'New contact',
      content: 'New contact content',
      contact_date: '2024-01-20',
      next_follow_up_date: null,
      follow_up_completed_at: null,
      purpose: 'inquiry' as const,
    };

    it('연락 로그 추가 성공', async () => {
      const createdContact: ContactLog = {
        ...newContact,
        id: '3',
        created_at: '2024-01-20T10:00:00Z',
        updated_at: '2024-01-20T10:00:00Z',
        client: undefined,
        instrument: undefined,
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: createdContact,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [...mockContactLogs, createdContact],
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      let addedContact: ContactLog | undefined;
      await act(async () => {
        addedContact = await result.current.addContact(newContact);
      });

      expect(addedContact).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newContact),
      });
    });

    it('연락 로그 추가 실패', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: 'Failed to create contact log',
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      await act(async () => {
        try {
          await result.current.addContact(newContact);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('updateContact', () => {
    it('연락 로그 업데이트 성공', async () => {
      const updatedContact: ContactLog = {
        ...mockContactLogs[0],
        subject: 'Updated subject',
        content: 'Updated content',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: updatedContact,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [updatedContact, mockContactLogs[1]],
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      let updated: ContactLog | undefined;
      await act(async () => {
        updated = await result.current.updateContact('1', {
          subject: 'Updated subject',
          content: 'Updated content',
        });
      });

      expect(updated).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith('/api/contacts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: '1',
          subject: 'Updated subject',
          content: 'Updated content',
        }),
      });
    });

    it('연락 로그 업데이트 실패', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: 'Failed to update contact log',
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      await act(async () => {
        try {
          await result.current.updateContact('1', { subject: 'New' });
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('deleteContact', () => {
    it('연락 로그 삭제 성공', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { success: true },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [mockContactLogs[1]],
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteContact('1');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/contacts?id=1', {
        method: 'DELETE',
      });
    });

    it('연락 로그 삭제 실패', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: 'Failed to delete contact log',
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      await act(async () => {
        try {
          await result.current.deleteContact('1');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      expect(mockHandleError).toHaveBeenCalled();
    });
  });

  describe('setFollowUp', () => {
    it('팔로우업 설정 성공', async () => {
      const createdFollowUp: ContactLog = {
        id: '3',
        client_id: 'client1',
        instrument_id: 'inst1',
        contact_type: 'follow_up',
        subject: null,
        content: 'Follow-up scheduled for 7 days',
        contact_date: expect.any(String),
        next_follow_up_date: expect.any(String),
        follow_up_completed_at: null,
        purpose: 'follow_up',
        created_at: expect.any(String),
        updated_at: expect.any(String),
        client: undefined,
        instrument: undefined,
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: createdFollowUp,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [...mockContactLogs, createdFollowUp],
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      await act(async () => {
        await result.current.setFollowUp('client1', 'inst1', 7, 'Test purpose');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contacts',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('instrumentId가 null인 경우', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { id: '3' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      await act(async () => {
        await result.current.setFollowUp('client1', null, 7);
      });

      const callBody = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[1][1].body
      );
      expect(callBody.instrument_id).toBeNull();
    });
  });

  describe('completeFollowUp', () => {
    it('팔로우업 완료 성공', async () => {
      const completedContact: ContactLog = {
        ...mockContactLogs[0],
        follow_up_completed_at: expect.any(String),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: completedContact,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [completedContact, mockContactLogs[1]],
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      let completed: ContactLog | undefined;
      await act(async () => {
        completed = await result.current.completeFollowUp('1');
      });

      expect(completed).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith('/api/contacts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"id":"1"'),
      });
    });
  });

  describe('postponeFollowUp', () => {
    it('팔로우업 연기 성공', async () => {
      const postponedContact: ContactLog = {
        ...mockContactLogs[0],
        next_follow_up_date: expect.any(String),
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: postponedContact,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [postponedContact, mockContactLogs[1]],
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      let postponed: ContactLog | undefined;
      await act(async () => {
        postponed = await result.current.postponeFollowUp('1', 3);
      });

      expect(postponed).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith('/api/contacts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"id":"1"'),
      });
    });
  });

  describe('통합 시나리오', () => {
    it('CRUD 작업 전체 플로우', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: mockContactLogs,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { id: '3' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [...mockContactLogs, { id: '3' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { id: '3', subject: 'Updated' },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              { ...mockContactLogs[0], id: '3', subject: 'Updated' },
              mockContactLogs[1],
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { success: true },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [mockContactLogs[1]],
          }),
        });

      const { result } = renderHook(() =>
        useContactLogs({ clientId: 'client1', autoFetch: true })
      );

      // 1. 초기 로드
      await waitFor(() => {
        expect(result.current.contactLogs).toHaveLength(2);
      });

      // 2. 추가
      await act(async () => {
        await result.current.addContact({
          client_id: 'client1',
          instrument_id: null,
          contact_type: 'phone',
          subject: 'New',
          content: 'Content',
          contact_date: '2024-01-20',
          next_follow_up_date: null,
          follow_up_completed_at: null,
          purpose: 'inquiry',
        });
      });

      // 3. 수정
      await act(async () => {
        await result.current.updateContact('3', { subject: 'Updated' });
      });

      // 4. 삭제
      await act(async () => {
        await result.current.deleteContact('3');
      });

      expect(global.fetch).toHaveBeenCalledTimes(7); // 초기 + 추가 + 재조회 + 수정 + 재조회 + 삭제 + 재조회
    });
  });
});
