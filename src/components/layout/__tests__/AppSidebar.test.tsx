/* eslint-disable react/display-name */
import { render, screen, waitFor } from '@testing-library/react';
import AppSidebar from '../AppSidebar';

jest.mock('next/link', () => {
  return ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
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
