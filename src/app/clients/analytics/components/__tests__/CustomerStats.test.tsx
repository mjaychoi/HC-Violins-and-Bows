import { render, screen } from '@/test-utils/render';
import { CustomerStats } from '../CustomerStats';
import { CustomerWithPurchases } from '../../types';

const mockCustomer1: CustomerWithPurchases = {
  id: 'c1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '010-1234-5678',
  tags: ['VIP'],
  interest: 'High',
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01',
  purchases: [
    {
      id: 'p1',
      item: 'Violin',
      amount: 100000,
      date: '2024-04-01',
      status: 'Completed',
    },
    {
      id: 'p2',
      item: 'Bow',
      amount: 5000,
      date: '2024-05-12',
      status: 'Completed',
    },
  ],
  lastPurchaseAt: '2024-05-12',
};

const mockCustomer2: CustomerWithPurchases = {
  id: 'c2',
  first_name: 'Jane',
  last_name: 'Smith',
  email: 'jane@example.com',
  contact_number: null,
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL002',
  created_at: '2024-02-01',
  purchases: [
    {
      id: 'p3',
      item: 'Cello',
      amount: 50000,
      date: '2024-06-01',
      status: 'Pending',
    },
  ],
  lastPurchaseAt: '2024-06-01',
};

describe('CustomerStats', () => {
  it('should render all stat cards', () => {
    render(<CustomerStats customers={[mockCustomer1, mockCustomer2]} />);
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getByText('Avg Spend/Customer')).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
    expect(screen.getByText('Most Recent Purchase')).toBeInTheDocument();
  });

  it('should display total customers count', () => {
    render(<CustomerStats customers={[mockCustomer1, mockCustomer2]} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should calculate total spend correctly', () => {
    render(<CustomerStats customers={[mockCustomer1, mockCustomer2]} />);
    // 100000 + 5000 + 50000 = 155000
    expect(screen.getByText('$155,000')).toBeInTheDocument();
  });

  it('should calculate average spend correctly', () => {
    render(<CustomerStats customers={[mockCustomer1, mockCustomer2]} />);
    // (100000 + 5000 + 50000) / 2 = 77500
    expect(screen.getByText('$77,500.00')).toBeInTheDocument();
  });

  it('should display purchase count', () => {
    render(<CustomerStats customers={[mockCustomer1, mockCustomer2]} />);
    // 2 + 1 = 3 purchases
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should display most recent purchase date', () => {
    render(<CustomerStats customers={[mockCustomer1, mockCustomer2]} />);
    // Most recent is 2024-06-01
    expect(screen.getByText('May 31, 2024')).toBeInTheDocument();
  });

  it('should handle empty customers array', () => {
    const { container } = render(<CustomerStats customers={[]} />);
    expect(container.textContent).toContain('0');
    expect(container.textContent).toContain('$0');
    expect(container.textContent).toContain('—');
  });

  it('should handle customers with no purchases', () => {
    const customerWithoutPurchases: CustomerWithPurchases = {
      ...mockCustomer1,
      purchases: [],
    };
    const { container } = render(
      <CustomerStats customers={[customerWithoutPurchases]} />
    );
    expect(container.textContent).toContain('$0');
    expect(container.textContent).toContain('0');
    expect(container.textContent).toContain('—');
  });

  it('should format currency correctly', () => {
    const { container } = render(<CustomerStats customers={[mockCustomer1]} />);
    expect(container.textContent).toContain('$105,000');
  });

  it('should handle single customer', () => {
    const { container } = render(<CustomerStats customers={[mockCustomer1]} />);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('$105,000');
    // Average equals total for single customer
    const matches = container.textContent?.match(/\$105,000/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});
