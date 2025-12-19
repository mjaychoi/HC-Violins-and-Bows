import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import DataQualityWarning from '../DataQualityWarning';
import { DataQuality } from '../../types';

describe('DataQualityWarning', () => {
  it('does not render when data quality is good', () => {
    const goodQuality: DataQuality = {
      hasInsufficientData: false,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: false,
    };

    const { container } = render(
      <DataQualityWarning dataQuality={goodQuality} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when data quality is low', () => {
    const lowQuality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true,
    };

    render(<DataQualityWarning dataQuality={lowQuality} />);
    expect(screen.getByText('Limited Data Available')).toBeInTheDocument();
  });

  it('displays insufficient data message', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true,
    };

    render(<DataQualityWarning dataQuality={quality} />);
    expect(
      screen.getByText('Too few transactions to show meaningful patterns.')
    ).toBeInTheDocument();
  });

  it('displays outlier message', () => {
    const quality: DataQuality = {
      hasInsufficientData: false,
      hasOutliers: true,
      hasSparseDates: false,
      isLowQuality: true,
    };

    render(<DataQualityWarning dataQuality={quality} />);
    expect(
      screen.getByText(
        'Some transactions have unusually high values that may skew averages.'
      )
    ).toBeInTheDocument();
  });

  it('displays sparse dates message', () => {
    const quality: DataQuality = {
      hasInsufficientData: false,
      hasOutliers: false,
      hasSparseDates: true,
      isLowQuality: true,
    };

    render(<DataQualityWarning dataQuality={quality} />);
    expect(
      screen.getByText(
        'Data is spread across many days, making daily patterns less reliable.'
      )
    ).toBeInTheDocument();
  });

  it('displays all messages when multiple issues exist', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: true,
      hasSparseDates: true,
      isLowQuality: true,
    };

    render(<DataQualityWarning dataQuality={quality} />);
    expect(
      screen.getByText('Too few transactions to show meaningful patterns.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Some transactions have unusually high values that may skew averages.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Data is spread across many days, making daily patterns less reliable.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Charts and insights may not be fully representative.')
    ).toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true,
    };

    const { container } = render(<DataQualityWarning dataQuality={quality} />);
    const warningDiv = container.querySelector('[role="status"]');
    expect(warningDiv).toBeInTheDocument();
    expect(warningDiv).toHaveAttribute('aria-live', 'polite');
  });

  it('renders correct CSS classes for styling', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true,
    };

    const { container } = render(<DataQualityWarning dataQuality={quality} />);
    const warningDiv = container.querySelector('[role="status"]');
    expect(warningDiv).toHaveClass(
      'bg-yellow-50',
      'border',
      'border-yellow-200',
      'rounded-lg',
      'p-4',
      'mb-4'
    );
  });

  it('displays warning icon', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true,
    };

    const { container } = render(<DataQualityWarning dataQuality={quality} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders messages as list items when multiple issues exist', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: true,
      hasSparseDates: true,
      isLowQuality: true,
    };

    const { container } = render(<DataQualityWarning dataQuality={quality} />);
    const list = container.querySelector('ul');
    expect(list).toBeInTheDocument();

    const listItems = container.querySelectorAll('li');
    expect(listItems).toHaveLength(3);
  });

  it('does not render list when no specific issues (edge case)', () => {
    const quality: DataQuality = {
      hasInsufficientData: false,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true, // isLowQuality is true but no specific issues
    };

    const { container } = render(<DataQualityWarning dataQuality={quality} />);
    // Component should still render warning div
    const warningDiv = container.querySelector('[role="status"]');
    expect(warningDiv).toBeInTheDocument();

    // But list should not exist if no messages
    const list = container.querySelector('ul');
    expect(list).not.toBeInTheDocument();

    // Should still show the main message
    expect(
      screen.getByText('Charts and insights may not be fully representative.')
    ).toBeInTheDocument();
  });

  it('displays main warning message regardless of specific issues', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true,
    };

    render(<DataQualityWarning dataQuality={quality} />);
    expect(
      screen.getByText('Charts and insights may not be fully representative.')
    ).toBeInTheDocument();
  });

  it('renders structured content with proper hierarchy', () => {
    const quality: DataQuality = {
      hasInsufficientData: true,
      hasOutliers: true,
      hasSparseDates: false,
      isLowQuality: true,
    };

    const { container } = render(<DataQualityWarning dataQuality={quality} />);

    // Check for heading
    expect(screen.getByText('Limited Data Available')).toBeInTheDocument();

    // Check for list
    const list = container.querySelector('ul');
    expect(list).toBeInTheDocument();

    // Check for paragraph
    const paragraph = container.querySelector('p');
    expect(paragraph).toBeInTheDocument();
  });

  it('handles empty messages array gracefully', () => {
    const quality: DataQuality = {
      hasInsufficientData: false,
      hasOutliers: false,
      hasSparseDates: false,
      isLowQuality: true,
    };

    const { container } = render(<DataQualityWarning dataQuality={quality} />);

    // Should still render the warning container
    const warningDiv = container.querySelector('[role="status"]');
    expect(warningDiv).toBeInTheDocument();

    // Should not render list when messages array would be empty
    const list = container.querySelector('ul');
    expect(list).not.toBeInTheDocument();
  });
});
