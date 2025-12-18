import React from 'react';
import { render, screen } from '@/test-utils/render';
import CustomerPage from '../page';
import { useRouter } from 'next/navigation';

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('CustomerPage (deprecated redirect)', () => {
  it('renders redirect message and calls router.replace', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    render(<CustomerPage />);

    expect(
      screen.getByText('Redirecting to Client Analytics...')
    ).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/clients?tab=analytics');
  });

  it('calls router.replace only once even on re-render', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    const { rerender } = render(<CustomerPage />);

    // 첫 렌더에서 한 번 호출
    expect(replace).toHaveBeenCalledTimes(1);

    // 같은 컴포넌트로 다시 렌더해도 effect 재실행은 없음을 보장
    rerender(<CustomerPage />);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('renders with correct styling classes', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    render(<CustomerPage />);

    const container = screen.getByText(
      'Redirecting to Client Analytics...'
    ).parentElement;

    expect(container).toHaveClass(
      'min-h-screen',
      'bg-gray-50',
      'flex',
      'items-center',
      'justify-center'
    );
    expect(screen.getByText('Redirecting to Client Analytics...')).toHaveClass(
      'text-gray-600'
    );
  });

  it('renders loading message during redirect', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    render(<CustomerPage />);

    // 리다이렉트 중에도 로딩 메시지가 표시되어야 함
    const loadingMessage = screen.getByText(
      'Redirecting to Client Analytics...'
    );
    expect(loadingMessage).toBeInTheDocument();
    expect(loadingMessage).toBeVisible();
  });

  it('calls router.replace with correct destination URL', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    render(<CustomerPage />);

    expect(replace).toHaveBeenCalledWith('/clients?tab=analytics');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('renders redirect message with correct text content', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    render(<CustomerPage />);

    const message = screen.getByText('Redirecting to Client Analytics...');
    expect(message).toBeInTheDocument();
    expect(message.textContent).toBe('Redirecting to Client Analytics...');
  });

  it('uses useEffect to trigger redirect on mount', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    render(<CustomerPage />);

    // useEffect가 마운트 시 실행되어 replace가 호출됨
    expect(mockUseRouter).toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
  });

  it('does not call replace before component mounts', () => {
    const replace = jest.fn();
    mockUseRouter.mockReturnValue({ replace } as any);

    // 렌더링 전에는 호출되지 않아야 함
    expect(replace).not.toHaveBeenCalled();

    render(<CustomerPage />);

    // 렌더링 후에만 호출됨
    expect(replace).toHaveBeenCalled();
  });
});
