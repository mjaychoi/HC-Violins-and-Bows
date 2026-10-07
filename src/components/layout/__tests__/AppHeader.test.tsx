import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import AppHeader from '../AppHeader';

const mockReplace = jest.fn();

jest.mock('@/contexts/AuthContext', () => {
  const actual = jest.requireActual('@/contexts/AuthContext');
  return {
    ...actual,
    useAuth: jest.fn().mockReturnValue({
      user: { email: 'user@example.com' },
      signOut: jest.fn(),
    }),
  };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

describe('AppHeader', () => {
  const navigationProps = {
    onToggleSidebar: jest.fn(),
    onToggleMobileNavigation: jest.fn(),
    isMobileNavigationOpen: false,
    mobileNavigationId: 'app-mobile-navigation',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and toggles sidebar', () => {
    const onToggleSidebar = jest.fn();
    render(
      <AppHeader
        title="Dashboard"
        {...navigationProps}
        onToggleSidebar={onToggleSidebar}
      />
    );

    fireEvent.click(screen.getByLabelText('Toggle sidebar'));
    expect(onToggleSidebar).toHaveBeenCalled();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('toggles mobile navigation with matching accessibility state', () => {
    const onToggleMobileNavigation = jest.fn();
    const { rerender } = render(
      <AppHeader
        title="Dashboard"
        {...navigationProps}
        onToggleMobileNavigation={onToggleMobileNavigation}
      />
    );

    const toggle = screen.getByLabelText('Toggle navigation');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'app-mobile-navigation');

    fireEvent.click(toggle);
    expect(onToggleMobileNavigation).toHaveBeenCalledTimes(1);

    rerender(
      <AppHeader
        title="Dashboard"
        {...navigationProps}
        onToggleMobileNavigation={onToggleMobileNavigation}
        isMobileNavigationOpen
      />
    );
    expect(screen.getByLabelText('Toggle navigation')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('shows user email and triggers sign out', async () => {
    const useAuth = jest.requireMock('@/contexts/AuthContext')
      .useAuth as jest.Mock;
    const signOutMock = jest.fn();
    useAuth.mockReturnValue({
      user: { email: 'user@example.com' },
      signOut: signOutMock,
    });

    render(<AppHeader title="Header" {...navigationProps} />);
    fireEvent.click(screen.getByLabelText('Sign out'));
    expect(signOutMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('fires action button callback', () => {
    const actionClick = jest.fn();
    render(
      <AppHeader
        title="Header"
        {...navigationProps}
        actionButton={{ label: 'Add', onClick: actionClick }}
      />
    );

    fireEvent.click(screen.getAllByText('Add')[0]);
    expect(actionClick).toHaveBeenCalled();
  });

  it('hides both navigation toggles when requested', () => {
    render(<AppHeader title="Header" {...navigationProps} hideSidebarToggle />);

    expect(
      screen.queryByLabelText('Toggle navigation')
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Toggle sidebar')).not.toBeInTheDocument();
  });
});
