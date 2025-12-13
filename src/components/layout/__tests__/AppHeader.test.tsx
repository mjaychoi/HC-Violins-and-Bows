import { fireEvent, render, screen } from '@testing-library/react';
import AppHeader from '../AppHeader';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn().mockReturnValue({
    user: { email: 'user@example.com' },
    signOut: jest.fn(),
  }),
}));

describe('AppHeader', () => {
  it('renders title and toggles sidebar', () => {
    const onToggleSidebar = jest.fn();
    render(<AppHeader title="Dashboard" onToggleSidebar={onToggleSidebar} />);

    fireEvent.click(screen.getByLabelText('Toggle sidebar'));
    expect(onToggleSidebar).toHaveBeenCalled();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows user email and triggers sign out', () => {
    const useAuth = jest.requireMock('@/contexts/AuthContext')
      .useAuth as jest.Mock;
    const signOutMock = jest.fn();
    useAuth.mockReturnValue({
      user: { email: 'user@example.com' },
      signOut: signOutMock,
    });

    render(<AppHeader title="Header" onToggleSidebar={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Sign out'));
    expect(signOutMock).toHaveBeenCalled();
  });

  it('fires action button callback', () => {
    const actionClick = jest.fn();
    render(
      <AppHeader
        title="Header"
        onToggleSidebar={jest.fn()}
        actionButton={{ label: 'Add', onClick: actionClick }}
      />
    );

    fireEvent.click(screen.getAllByText('Add')[0]);
    expect(actionClick).toHaveBeenCalled();
  });
});
