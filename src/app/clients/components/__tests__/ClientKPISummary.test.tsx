// src/app/clients/components/__tests__/ClientKPISummary.test.tsx
import React from 'react';
import { render, screen } from '@/test-utils/render';
import '@testing-library/jest-dom';
import { ClientKPISummary } from '../ClientKPISummary';

describe('ClientKPISummary', () => {
  const mockKPIs = {
    loading: false,
    totalCustomers: 150,
    totalSpend: 500000,
    avgSpendPerCustomer: 3333.33,
    totalPurchases: 200,
    mostRecentPurchase: '2024-01-15',
  };

  it('renders loading skeleton when loading', () => {
    const { container } = render(
      <ClientKPISummary kpis={{ loading: true } as any} />
    );

    // CardSkeleton renders cards inside containers with rounded-lg border (5 cards total)
    const skeletonCards = container.querySelectorAll(
      '.rounded-lg.border.bg-white'
    );
    expect(skeletonCards.length).toBeGreaterThanOrEqual(5);
  });

  it('renders all KPI cards when loaded', () => {
    render(<ClientKPISummary kpis={mockKPIs} />);

    expect(screen.getByText('Total Customers')).toBeInTheDocument();
    const totalCustomersValue = screen
      .getByText('Total Customers')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(totalCustomersValue).toHaveTextContent('150');

    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    const totalSpendValue = screen
      .getByText('Total Spend')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(totalSpendValue).toHaveTextContent('$500,000');

    expect(screen.getByText('Avg Spend/Customer')).toBeInTheDocument();
    const avgSpendValue = screen
      .getByText('Avg Spend/Customer')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(avgSpendValue).toHaveTextContent('$3,333');

    expect(screen.getByText('Purchases')).toBeInTheDocument();
    const purchasesValue = screen
      .getByText('Purchases')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(purchasesValue).toHaveTextContent('200');

    expect(screen.getByText('Most Recent Purchase')).toBeInTheDocument();
    const recentPurchaseValue = screen
      .getByText('Most Recent Purchase')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(recentPurchaseValue).toHaveTextContent('2024-01-15');
  });

  it('formats currency values correctly', () => {
    render(<ClientKPISummary kpis={mockKPIs} />);

    const totalSpend = screen.getByText('$500,000');
    expect(totalSpend).toBeInTheDocument();

    const avgSpend = screen.getByText('$3,333');
    expect(avgSpend).toBeInTheDocument();
  });

  it('handles zero values', () => {
    const zeroKPIs = {
      loading: false,
      totalCustomers: 0,
      totalSpend: 0,
      avgSpendPerCustomer: 0,
      totalPurchases: 0,
      mostRecentPurchase: 'N/A',
    };

    render(<ClientKPISummary kpis={zeroKPIs} />);

    expect(screen.getByText('Total Customers')).toBeInTheDocument();
    const totalCustomersValue = screen
      .getByText('Total Customers')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(totalCustomersValue).toHaveTextContent('0');

    const totalSpendValue = screen
      .getByText('Total Spend')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(totalSpendValue).toHaveTextContent('$0');

    const recentPurchaseValue = screen
      .getByText('Most Recent Purchase')
      .closest('.rounded-lg')
      ?.querySelector('.text-xl');
    expect(recentPurchaseValue).toHaveTextContent('N/A');
  });

  it('renders in grid layout', () => {
    const { container } = render(<ClientKPISummary kpis={mockKPIs} />);

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass('sm:grid-cols-2', 'lg:grid-cols-5');
  });

  it('renders cards with correct styling', () => {
    render(<ClientKPISummary kpis={mockKPIs} />);

    const cards = screen
      .getAllByText('Total Customers')[0]
      .closest('.rounded-lg');
    expect(cards).toHaveClass('border', 'border-gray-200', 'bg-white');
  });
});
