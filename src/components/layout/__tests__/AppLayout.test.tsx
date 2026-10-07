import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import AppLayout from '../AppLayout';

jest.mock('@/hooks/useSidebarState', () => ({
  useSidebarState: () => ({ isExpanded: true, toggleSidebar: jest.fn() }),
}));

jest.mock('@/contexts/AuthContext', () => {
  const actual = jest.requireActual('@/contexts/AuthContext');
  return { ...actual, useAuth: jest.fn() };
});

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({
    tenantIdentityKey: 'test-key',
    isTenantTransitioning: false,
  })),
}));

const mockReplace = jest.fn();
let mockPathname = '/dashboard';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../AppHeader', () => ({
  __esModule: true,
  default: ({
    title,
    onToggleMobileNavigation,
    isMobileNavigationOpen,
    mobileNavigationId,
    mobileToggleRef,
    hideSidebarToggle,
  }: {
    title: string;
    onToggleMobileNavigation: () => void;
    isMobileNavigationOpen: boolean;
    mobileNavigationId: string;
    mobileToggleRef: React.RefObject<HTMLButtonElement>;
    hideSidebarToggle: boolean;
  }) => (
    <div>
      Header: {title}
      {!hideSidebarToggle && (
        <button
          ref={mobileToggleRef}
          type="button"
          aria-controls={mobileNavigationId}
          aria-expanded={isMobileNavigationOpen}
          onClick={onToggleMobileNavigation}
        >
          Mobile navigation toggle
        </button>
      )}
    </div>
  ),
}));

jest.mock('../AppSidebar', () => ({
  __esModule: true,
  default: ({
    currentPath,
    id,
    variant = 'desktop',
    onNavigate,
  }: {
    currentPath: string;
    id?: string;
    variant?: 'desktop' | 'mobile';
    onNavigate?: () => void;
  }) => (
    <aside id={id} data-variant={variant}>
      Sidebar path: {currentPath}
      {onNavigate && (
        <a href="/clients" onClick={onNavigate}>
          Navigate to Clients
        </a>
      )}
    </aside>
  ),
}));

describe('AppLayout', () => {
  const useAuth = jest.requireMock('@/contexts/AuthContext')
    .useAuth as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
  });

  it('shows loading state while checking auth', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: true,
      hasOrgContext: false,
    });
    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );
    expect(screen.getByText('Checking your session...')).toBeInTheDocument();
  });

  it('renders layout when authenticated', async () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: true,
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
    expect(screen.getByTestId('desktop-sidebar')).toHaveClass(
      'hidden',
      'lg:block'
    );
    expect(screen.getByTestId('app-main-content')).toHaveClass(
      'min-w-0',
      'flex-1'
    );
  });

  it('keeps mobile navigation out of the layout until opened', () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: true,
    });
    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    expect(
      screen.queryByTestId('mobile-navigation-overlay')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('app-main-content')).toHaveClass('min-w-0');
  });

  it('opens the mobile drawer and closes it from the backdrop', () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: true,
    });
    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    fireEvent.click(screen.getByRole('button', { name: /mobile navigation/i }));
    expect(screen.getByTestId('mobile-navigation-overlay')).toBeInTheDocument();
    expect(screen.getByText('Navigate to Clients')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mobile-navigation-backdrop'));
    expect(
      screen.queryByTestId('mobile-navigation-overlay')
    ).not.toBeInTheDocument();
  });

  it('closes the mobile drawer on Escape', () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: true,
    });
    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    fireEvent.click(screen.getByRole('button', { name: /mobile navigation/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByTestId('mobile-navigation-overlay')
    ).not.toBeInTheDocument();
  });

  it('closes the mobile drawer after navigation and pathname changes', () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: true,
    });
    const { rerender } = render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    fireEvent.click(screen.getByRole('button', { name: /mobile navigation/i }));
    fireEvent.click(screen.getByText('Navigate to Clients'));
    expect(
      screen.queryByTestId('mobile-navigation-overlay')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /mobile navigation/i }));
    mockPathname = '/clients';
    rerender(
      <AppLayout title="Clients">
        <div>content</div>
      </AppLayout>
    );
    expect(
      screen.queryByTestId('mobile-navigation-overlay')
    ).not.toBeInTheDocument();
  });

  it('suppresses desktop and mobile navigation when hideSidebar is set', () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: true,
    });
    render(
      <AppLayout title="Dashboard" hideSidebar>
        <div>content</div>
      </AppLayout>
    );

    expect(screen.queryByTestId('desktop-sidebar')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mobile navigation/i })
    ).not.toBeInTheDocument();
  });

  it('redirects authenticated users without org context before rendering content', async () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: false,
    });

    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    expect(
      screen.getByText('Redirecting you to organization setup...')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/onboarding/organization?next=%2Fdashboard'
      );
    });

    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('does not login-redirect when the session is present', async () => {
    useAuth.mockReturnValue({
      user: { email: 'test@example.com' },
      loading: false,
      hasOrgContext: true,
    });

    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    await waitFor(() =>
      expect(screen.getByText('content')).toBeInTheDocument()
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects to login when the session is missing after auth resolves', async () => {
    useAuth.mockReturnValue({
      user: null,
      loading: false,
      hasOrgContext: false,
    });

    render(
      <AppLayout title="Dashboard">
        <div>content</div>
      </AppLayout>
    );

    expect(screen.getByText('Redirecting to sign in...')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/?next=%2Fdashboard');
    });
  });
});
