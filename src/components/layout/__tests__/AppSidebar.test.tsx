import { render, screen, waitFor } from '@/test-utils/render';
import { TestAuthProvider } from '@/test-utils/TestAuthProvider';
import AppSidebar from '../AppSidebar';

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>;
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('AppSidebar', () => {
  it('renders expanded sidebar content', async () => {
    render(<AppSidebar isExpanded currentPath="/clients" />);

    await waitFor(() =>
      expect(screen.getByText('Inventory App')).toBeInTheDocument()
    );
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });

  it('shows Invoices navigation for an authorized admin', async () => {
    render(<AppSidebar isExpanded currentPath="/dashboard" />);

    await waitFor(() =>
      expect(screen.getByText('Invoices')).toBeInTheDocument()
    );
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('hides Invoices navigation for a member without a permission flash', async () => {
    render(
      <TestAuthProvider value={{ role: 'member' }}>
        <AppSidebar isExpanded currentPath="/calendar" />
      </TestAuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByText('Calendar')).toBeInTheDocument()
    );
    expect(screen.queryByText('Invoices')).not.toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Clients')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('keeps Invoices hidden while permissions are still resolving', async () => {
    render(
      <TestAuthProvider value={{ loading: true, user: null, role: 'admin' }}>
        <AppSidebar isExpanded currentPath="/dashboard" />
      </TestAuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByText('Calendar')).toBeInTheDocument()
    );
    expect(screen.queryByText('Invoices')).not.toBeInTheDocument();
  });

  it('collapses when not expanded', () => {
    render(<AppSidebar isExpanded={false} currentPath="/clients" />);

    expect(screen.queryByText('Inventory App')).not.toBeInTheDocument();
  });
});
