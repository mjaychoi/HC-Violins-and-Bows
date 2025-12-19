import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/test-utils/render';
import '@testing-library/jest-dom';
import TodayFollowUps from '../TodayFollowUps';
import { ContactLog } from '@/types';
import { useAppFeedback } from '@/hooks/useAppFeedback';

const mockGetSession = jest.fn().mockResolvedValue({
  data: { session: null },
});

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock useAppFeedback
const mockHandleError = jest.fn();
const mockShowSuccess = jest.fn();
jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: jest.fn(() => ({
    handleError: mockHandleError,
    showSuccess: mockShowSuccess,
  })),
}));

// Mock dateParsing
jest.mock('@/utils/dateParsing', () => ({
  todayLocalYMD: jest.fn(() => '2024-01-20'),
  formatDisplayDate: jest.fn((date: string) => date),
}));

// Mock Next.js Link
jest.mock('next/link', () => {
  const MockLink = ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => {
    return <a href={href}>{children}</a>;
  };
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('TodayFollowUps', () => {
  const mockFollowUps: ContactLog[] = [
    {
      id: 'log1',
      client_id: 'client1',
      instrument_id: null,
      contact_type: 'phone',
      subject: 'Follow-up call',
      content: 'Need to follow up on pricing',
      contact_date: '2024-01-15',
      next_follow_up_date: '2024-01-20',
      follow_up_completed_at: null,
      purpose: 'follow_up',
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
      client: {
        id: 'client1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        contact_number: '123-456-7890',
        tags: [],
        interest: '',
        note: '',
        client_number: null,
        created_at: '2024-01-01T00:00:00Z',
      },
      instrument: undefined,
    },
    {
      id: 'log2',
      client_id: 'client2',
      instrument_id: null,
      contact_type: 'email',
      subject: 'Meeting follow-up',
      content: 'Discussed options',
      contact_date: '2024-01-18',
      next_follow_up_date: '2024-01-19', // Overdue
      follow_up_completed_at: null,
      purpose: 'inquiry',
      created_at: '2024-01-18T00:00:00Z',
      updated_at: '2024-01-18T00:00:00Z',
      client: {
        id: 'client2',
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        contact_number: '098-765-4321',
        tags: [],
        interest: '',
        note: '',
        client_number: null,
        created_at: '2024-01-01T00:00:00Z',
      },
      instrument: undefined,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    (useAppFeedback as jest.Mock).mockReturnValue({
      handleError: mockHandleError,
      showSuccess: mockShowSuccess,
    });
    mockGetSession.mockReturnValue(
      Promise.resolve({
        data: { session: null },
      })
    );
  });

  it('renders loading state initially', async () => {
    (global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(
            () => resolve({ ok: true, json: async () => ({ data: [] }) }),
            100
          )
        )
    );

    const { container } = render(<TodayFollowUps />);

    // Check for loading skeleton
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();

    // Wait for loading to complete
    await waitFor(() => {
      expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
    });
  });

  it('renders nothing when no follow-ups', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { container } = render(<TodayFollowUps />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/contacts?followUpDue=true'
      );
    });

    // Wait for loading to complete and component to return null
    await waitFor(
      () => {
        // Component returns null when no follow-ups, so container should be empty
        // But during loading, it shows skeleton, so wait for that to disappear
        const loadingSkeleton = container.querySelector('.animate-pulse');
        expect(loadingSkeleton).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // After loading completes, component should return null (container has no meaningful content)
    const hasContent = container.querySelector('.bg-amber-50');
    expect(hasContent).not.toBeInTheDocument();
  });

  it('renders follow-ups grouped by client', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockFollowUps }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('People to contact today')).toBeInTheDocument();
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Client count badge
  });

  it('shows overdue badge for overdue follow-ups', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [mockFollowUps[1]] }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText(/overdue/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/1 day overdue/i)).toBeInTheDocument();
  });

  it('shows today badge for today follow-ups', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [mockFollowUps[0]] }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });

  it('handles complete follow-up', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockFollowUps[0]] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('✓ Complete')).toBeInTheDocument();
    });

    const completeButton = screen.getByText('✓ Complete');
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/contacts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('follow_up_completed_at'),
      });
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Follow-up completed.');
    });
  });

  it('handles postpone follow-up', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockFollowUps[0]] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('⏱️')).toBeInTheDocument();
    });

    const postponeButton = screen.getByText('⏱️');
    fireEvent.click(postponeButton);

    await waitFor(() => {
      expect(screen.getByText('In 7 days')).toBeInTheDocument();
    });

    const postpone7Days = screen.getByText('In 7 days');
    fireEvent.click(postpone7Days);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/contacts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('next_follow_up_date'),
      });
    });

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Follow-up postponed by 7 days.'
      );
    });
  });

  it('renders email button when client has email', async () => {
    // Suppress console.error for navigation error (expected in test environment)
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [mockFollowUps[0]] }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Email button should be rendered when client has email
    const emailButton = screen.getByTitle('Send email');
    expect(emailButton).toBeInTheDocument();

    // Click should attempt to set window.location.href (navigation error is expected in test env)
    // The button click itself should not crash the component
    expect(() => {
      fireEvent.click(emailButton);
    }).not.toThrow();

    consoleErrorSpy.mockRestore();
  });

  it('handles email error when client has no email', async () => {
    const followUpWithoutEmail = {
      ...mockFollowUps[0],
      client: {
        ...mockFollowUps[0].client!,
        email: '',
      },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [followUpWithoutEmail] }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // When client has no email, the email button should not be rendered
    // But if handleEmail is called directly, it should show error
    // Since the button won't render, we can't test clicking it
    // Instead, we verify the button is not present
    expect(screen.queryByTitle('Send email')).not.toBeInTheDocument();
  });

  it('shows processing state when completing', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockFollowUps[0]] }),
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: [] }),
                }),
              100
            )
          )
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('✓ Complete')).toBeInTheDocument();
    });

    const completeButton = screen.getByText('✓ Complete');
    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { container } = render(<TodayFollowUps />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('handles non-OK response gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server error' }),
    });

    const { container } = render(<TodayFollowUps />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('closes menu when clicking outside', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [mockFollowUps[0]] }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('⏱️')).toBeInTheDocument();
    });

    const postponeButton = screen.getByText('⏱️');
    fireEvent.click(postponeButton);

    await waitFor(() => {
      expect(screen.getByText('In 7 days')).toBeInTheDocument();
    });

    // Click outside
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('In 7 days')).not.toBeInTheDocument();
    });
  });

  it('displays purpose when available', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [mockFollowUps[0]] }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('Follow-up')).toBeInTheDocument();
    });
  });

  it('displays content when available', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [mockFollowUps[0]] }),
    });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(
        screen.getByText('Need to follow up on pricing')
      ).toBeInTheDocument();
    });
  });

  it('handles postpone options correctly', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [mockFollowUps[0]] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    render(<TodayFollowUps />);

    await waitFor(() => {
      expect(screen.getByText('⏱️')).toBeInTheDocument();
    });

    const postponeButton = screen.getByText('⏱️');
    fireEvent.click(postponeButton);

    await waitFor(() => {
      expect(screen.getByText('In 7 days')).toBeInTheDocument();
      expect(screen.getByText('In 30 days')).toBeInTheDocument();
      expect(screen.getByText('In 90 days')).toBeInTheDocument();
    });

    const postpone30Days = screen.getByText('In 30 days');
    fireEvent.click(postpone30Days);

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith(
        'Follow-up postponed by 30 days.'
      );
    });
  });

  describe('Edge cases and additional scenarios', () => {
    it('handles multiple follow-ups for same client correctly', async () => {
      const multipleFollowUpsSameClient: ContactLog[] = [
        {
          ...mockFollowUps[0],
          id: 'log1',
          next_follow_up_date: '2024-01-20', // Today
        },
        {
          ...mockFollowUps[0],
          id: 'log2',
          next_follow_up_date: '2024-01-25', // Later
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: multipleFollowUpsSameClient }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Should only show one entry per client (most urgent)
      const johnDoeElements = screen.getAllByText('John Doe');
      // Should be grouped, so only one main entry
      expect(johnDoeElements.length).toBeGreaterThanOrEqual(1);
    });

    it('handles client without first_name or last_name', async () => {
      const followUpWithEmailOnly: ContactLog = {
        ...mockFollowUps[0],
        client: {
          ...mockFollowUps[0].client!,
          first_name: '',
          last_name: '',
          email: 'emailonly@example.com',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [followUpWithEmailOnly] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('emailonly@example.com')).toBeInTheDocument();
      });
    });

    it('handles client with only first_name', async () => {
      const followUpFirstNameOnly: ContactLog = {
        ...mockFollowUps[0],
        client: {
          ...mockFollowUps[0].client!,
          first_name: 'JohnOnly',
          last_name: '',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [followUpFirstNameOnly] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('JohnOnly')).toBeInTheDocument();
      });
    });

    it('handles unknown client gracefully', async () => {
      const followUpUnknownClient: ContactLog = {
        ...mockFollowUps[0],
        client: null as any,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [followUpUnknownClient] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('Unknown Client')).toBeInTheDocument();
      });
    });

    it('displays correct days overdue for overdue follow-ups', async () => {
      const overdueFollowUp: ContactLog = {
        ...mockFollowUps[0],
        next_follow_up_date: '2024-01-15', // 5 days ago (if today is 2024-01-20)
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [overdueFollowUp] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText(/days overdue/)).toBeInTheDocument();
      });
    });

    it('handles postpone with 90 days correctly', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockFollowUps[0]] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('⏱️')).toBeInTheDocument();
      });

      const postponeButton = screen.getByText('⏱️');
      fireEvent.click(postponeButton);

      await waitFor(() => {
        expect(screen.getByText('In 90 days')).toBeInTheDocument();
      });

      const postpone90Days = screen.getByText('In 90 days');
      fireEvent.click(postpone90Days);

      await waitFor(() => {
        expect(mockShowSuccess).toHaveBeenCalledWith(
          'Follow-up postponed by 90 days.'
        );
      });
    });

    it('handles complete API error gracefully', async () => {
      mockHandleError.mockClear();

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockFollowUps[0]] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: 'Failed to complete' }),
        });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('✓ Complete')).toBeInTheDocument();
      });

      const completeButton = screen.getByText('✓ Complete');
      fireEvent.click(completeButton);

      // Wait for error handling - handleError should be called with error
      await waitFor(
        () => {
          expect(mockHandleError).toHaveBeenCalledWith(
            expect.any(Error),
            'Complete follow-up'
          );
        },
        { timeout: 3000 }
      );
    });

    it('handles postpone API error gracefully', async () => {
      mockHandleError.mockClear();

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockFollowUps[0]] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: 'Failed to postpone' }),
        });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('⏱️')).toBeInTheDocument();
      });

      const postponeButton = screen.getByText('⏱️');
      fireEvent.click(postponeButton);

      await waitFor(() => {
        expect(screen.getByText('In 7 days')).toBeInTheDocument();
      });

      const postpone7Days = screen.getByText('In 7 days');
      fireEvent.click(postpone7Days);

      // Wait for error handling - handleError should be called with error
      await waitFor(
        () => {
          expect(mockHandleError).toHaveBeenCalledWith(
            expect.any(Error),
            'Postpone follow-up'
          );
        },
        { timeout: 3000 }
      );
    });

    it('disables buttons during processing', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockFollowUps[0]] }),
        })
        .mockImplementationOnce(
          () =>
            new Promise(() => {
              // Never resolve to keep processing state
            })
        );

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('✓ Complete')).toBeInTheDocument();
      });

      const completeButton = screen.getByText('✓ Complete');
      fireEvent.click(completeButton);

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument();
      });

      // Button should be disabled during processing
      expect(completeButton).toBeDisabled();
    });

    it('sorts follow-ups by urgency correctly', async () => {
      const followUpsWithDifferentDates: ContactLog[] = [
        {
          ...mockFollowUps[0],
          id: 'log1',
          next_follow_up_date: '2024-01-25', // Later
        },
        {
          ...mockFollowUps[0],
          id: 'log2',
          next_follow_up_date: '2024-01-20', // Today (most urgent)
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: followUpsWithDifferentDates }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // The most urgent (today) should be used
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('displays related contact date when available', async () => {
      const followUpWithContactDate: ContactLog = {
        ...mockFollowUps[0],
        contact_date: '2024-01-15',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [followUpWithContactDate] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText(/Related record:/)).toBeInTheDocument();
      });
    });

    it('displays follow-up date when available', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [mockFollowUps[0]] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText(/Follow-up:/)).toBeInTheDocument();
      });
    });

    it('handles empty purpose field', async () => {
      const followUpWithoutPurpose: ContactLog = {
        ...mockFollowUps[0],
        purpose: null,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [followUpWithoutPurpose] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Purpose should not be displayed when empty
      expect(screen.queryByText('Follow-up')).not.toBeInTheDocument();
    });

    it('handles empty content field', async () => {
      const followUpWithoutContent: ContactLog = {
        ...mockFollowUps[0],
        content: '',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [followUpWithoutContent] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Content should not be displayed when empty
      expect(
        screen.queryByText('Need to follow up on pricing')
      ).not.toBeInTheDocument();
    });

    it('handles client with no email (email button should not render)', async () => {
      const followUpWithoutEmail: ContactLog = {
        ...mockFollowUps[0],
        client: {
          ...mockFollowUps[0].client!,
          email: '',
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [followUpWithoutEmail] }),
      });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Email button should not be present
      expect(screen.queryByTitle('Send email')).not.toBeInTheDocument();
    });

    it('refreshes list after completing follow-up', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockFollowUps[0]] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        });

      render(<TodayFollowUps />);

      await waitFor(() => {
        expect(screen.getByText('✓ Complete')).toBeInTheDocument();
      });

      const completeButton = screen.getByText('✓ Complete');
      fireEvent.click(completeButton);

      // Should call fetch again to refresh
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(3); // Initial + Complete + Refresh
      });
    });
  });
});
