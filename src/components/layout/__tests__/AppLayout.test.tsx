import { render, screen, waitFor } from '@testing-library/react';
import AppLayout from '../AppLayout';

jest.mock('@/hooks/useSidebarState', () => ({
  useSidebarState: () => ({ isExpanded: true, toggleSidebar: jest.fn() }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../AppHeader', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div>Header: {title}</div>,
}));

jest.mock('../AppSidebar', () => ({
  __esModule: true,
  default: ({ currentPath }: { currentPath: string }) => (
    <div>Sidebar path: {currentPath}</div>
  ),
}));

describe('AppLayout', () => {
  const useAuth = jest.requireMock('@/contexts/AuthContext')
    .useAuth as jest.Mock;

  it('shows loading state while checking auth', () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders layout when authenticated', async () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
    });
    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    await waitFor(() =>
      expect(screen.getByText('Header: Dashboard')).toBeInTheDocument()
    );
    expect(screen.getByText('Sidebar path: /dashboard')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
