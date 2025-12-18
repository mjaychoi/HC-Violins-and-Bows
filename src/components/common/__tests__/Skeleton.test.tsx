import { render, screen } from '@/test-utils/render';
import {
  ListSkeleton,
  CardSkeleton,
  TableSkeleton,
  TableRowSkeleton,
  SpinnerLoading,
} from '@/components/common/layout';
import SkeletonComponents from '@/components/common/layout/Skeleton';

describe('Skeleton Components', () => {
  describe('TableRowSkeleton', () => {
    it('should render table row with specified columns', () => {
      const { container } = render(
        <table>
          <tbody>
            <TableRowSkeleton columns={3} />
          </tbody>
        </table>
      );

      const cells = container.querySelectorAll('td');
      expect(cells).toHaveLength(3);
    });

    it('should apply custom className', () => {
      const { container } = render(
        <table>
          <tbody>
            <TableRowSkeleton columns={2} className="custom-class" />
          </tbody>
        </table>
      );

      const row = container.querySelector('tr');
      expect(row).toHaveClass('custom-class');
    });
  });

  describe('ListSkeleton', () => {
    it('should render specified number of rows', () => {
      const { container } = render(<ListSkeleton rows={3} columns={4} />);
      const rows = container.querySelectorAll('.space-y-4 > div');
      expect(rows).toHaveLength(3);
    });

    it('should render default 5 rows when not specified', () => {
      const { container } = render(<ListSkeleton />);
      const rows = container.querySelectorAll('.space-y-4 > div');
      expect(rows).toHaveLength(5);
    });

    it('should apply custom className', () => {
      const { container } = render(<ListSkeleton className="custom-class" />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('CardSkeleton', () => {
    it('should render specified number of cards', () => {
      const { container } = render(<CardSkeleton count={3} />);
      const cards = container.querySelectorAll('.mb-4');
      expect(cards).toHaveLength(3);
    });

    it('should render default 1 card when not specified', () => {
      const { container } = render(<CardSkeleton />);
      const cards = container.querySelectorAll('.mb-4');
      expect(cards).toHaveLength(1);
    });

    it('should apply custom className', () => {
      const { container } = render(<CardSkeleton className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('SpinnerLoading', () => {
    it('should render with default message', () => {
      render(<SpinnerLoading />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should render with custom message', () => {
      render(<SpinnerLoading message="Please wait..." />);
      expect(screen.getByText('Please wait...')).toBeInTheDocument();
    });

    it('should render spinner', () => {
      const { container } = render(<SpinnerLoading />);
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<SpinnerLoading className="custom-class" />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('TableSkeleton', () => {
    it('should render table with header by default', () => {
      const { container } = render(<TableSkeleton rows={3} columns={4} />);
      const header = container.querySelector('thead');
      expect(header).toBeInTheDocument();
    });

    it('should not render header when header is false', () => {
      const { container } = render(
        <TableSkeleton rows={3} columns={4} header={false} />
      );
      const header = container.querySelector('thead');
      expect(header).not.toBeInTheDocument();
    });

    it('should render specified number of rows', () => {
      const { container } = render(<TableSkeleton rows={5} columns={3} />);
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(5);
    });

    it('should render default 5 rows when not specified', () => {
      const { container } = render(<TableSkeleton />);
      const rows = container.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(5);
    });

    it('should render SpinnerLoading when shouldVirtualize is true', () => {
      render(
        <TableSkeleton
          shouldVirtualize={true}
          loadingMessage="Virtualized loading..."
        />
      );

      // SpinnerLoading는 전달된 메시지를 그대로 렌더링해야 함
      expect(screen.getByText('Virtualized loading...')).toBeInTheDocument();
      // 테이블 구조는 렌더되지 않아야 함
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('SkeletonComponents export', () => {
    it('should export all skeleton components', () => {
      expect(SkeletonComponents.Element).toBeDefined();
      expect(SkeletonComponents.List).toBeDefined();
      expect(SkeletonComponents.Card).toBeDefined();
      expect(SkeletonComponents.Table).toBeDefined();
      expect(SkeletonComponents.TableRow).toBeDefined();
      expect(SkeletonComponents.Spinner).toBeDefined();
    });
  });
});
