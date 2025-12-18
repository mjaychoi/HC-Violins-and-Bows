import { render, screen, waitFor } from '@/test-utils/render';
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

  it('collapses when not expanded', () => {
    render(<AppSidebar isExpanded={false} currentPath="/clients" />);

    expect(screen.queryByText('Inventory App')).not.toBeInTheDocument();
  });
});
