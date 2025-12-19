import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import '@testing-library/jest-dom';
import ClientTagSelector from '../ClientTagSelector';
import { CLIENT_TAG_OPTIONS } from '../../constants';

describe('ClientTagSelector', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all tag options', () => {
    render(<ClientTagSelector selectedTags={[]} onChange={mockOnChange} />);

    CLIENT_TAG_OPTIONS.forEach(tag => {
      expect(screen.getByLabelText(tag)).toBeInTheDocument();
    });
  });

  it('shows checked state for selected tags', () => {
    render(
      <ClientTagSelector
        selectedTags={['Owner', 'Musician']}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByLabelText('Owner')).toBeChecked();
    expect(screen.getByLabelText('Musician')).toBeChecked();
    expect(screen.getByLabelText('Dealer')).not.toBeChecked();
  });

  it('calls onChange when tag is checked', () => {
    render(<ClientTagSelector selectedTags={[]} onChange={mockOnChange} />);

    const ownerCheckbox = screen.getByLabelText('Owner');
    fireEvent.click(ownerCheckbox);

    expect(mockOnChange).toHaveBeenCalledWith(['Owner']);
  });

  it('calls onChange when tag is unchecked', () => {
    render(
      <ClientTagSelector
        selectedTags={['Owner', 'Musician']}
        onChange={mockOnChange}
      />
    );

    const ownerCheckbox = screen.getByLabelText('Owner');
    fireEvent.click(ownerCheckbox);

    expect(mockOnChange).toHaveBeenCalledWith(['Musician']);
  });

  it('prevents duplicate tags when adding', () => {
    const { rerender } = render(
      <ClientTagSelector selectedTags={[]} onChange={mockOnChange} />
    );

    const ownerCheckbox = screen.getByLabelText('Owner');
    fireEvent.click(ownerCheckbox); // Check
    expect(mockOnChange).toHaveBeenCalledWith(['Owner']);

    // Re-render with Owner selected
    rerender(
      <ClientTagSelector selectedTags={['Owner']} onChange={mockOnChange} />
    );

    // Try to add Owner again (should not create duplicate)
    // But since it's already checked, clicking will uncheck it
    fireEvent.click(ownerCheckbox); // Uncheck
    expect(mockOnChange).toHaveBeenCalledWith([]);

    // Re-render with empty selection
    rerender(<ClientTagSelector selectedTags={[]} onChange={mockOnChange} />);

    // Click to add again
    fireEvent.click(ownerCheckbox); // Check
    expect(mockOnChange).toHaveBeenCalledWith(['Owner']);
  });

  it('handles stopPropagation when enabled', () => {
    const handleClick = jest.fn();

    render(
      <div onClick={handleClick}>
        <ClientTagSelector
          selectedTags={[]}
          onChange={mockOnChange}
          stopPropagation={true}
        />
      </div>
    );

    const ownerCheckbox = screen.getByLabelText('Owner');
    const clickEvent = new MouseEvent('click', { bubbles: true });
    fireEvent(ownerCheckbox, clickEvent);

    expect(mockOnChange).toHaveBeenCalled();
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ClientTagSelector
        selectedTags={[]}
        onChange={mockOnChange}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('applies custom label className', () => {
    render(
      <ClientTagSelector
        selectedTags={[]}
        onChange={mockOnChange}
        labelClassName="custom-label"
      />
    );

    // labelClassName applies to the <span> element, not the label
    const span = screen.getByText('Owner');
    expect(span).toHaveClass('custom-label');
  });

  it('applies custom checkbox className', () => {
    render(
      <ClientTagSelector
        selectedTags={[]}
        onChange={mockOnChange}
        checkboxClassName="custom-checkbox"
      />
    );

    const checkbox = screen.getByLabelText('Owner');
    expect(checkbox).toHaveClass('custom-checkbox');
  });

  it('uses custom options when provided', () => {
    const customOptions = ['Owner', 'Musician'] as const;

    render(
      <ClientTagSelector
        selectedTags={[]}
        onChange={mockOnChange}
        options={customOptions}
      />
    );

    expect(screen.getByLabelText('Owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Musician')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dealer')).not.toBeInTheDocument();
  });

  it('applies getLabelClassName function', () => {
    const getLabelClassName = jest.fn(tag => `tag-${tag.toLowerCase()}`);

    render(
      <ClientTagSelector
        selectedTags={[]}
        onChange={mockOnChange}
        getLabelClassName={getLabelClassName}
      />
    );

    expect(getLabelClassName).toHaveBeenCalledWith('Owner');
    // getLabelClassName applies to the <span> element
    const span = screen.getByText('Owner');
    expect(span).toHaveClass('tag-owner');
  });

  it('handles multiple tag selections', () => {
    let currentTags: string[] = [];
    const handleChange = jest.fn((tags: string[]) => {
      currentTags = tags;
    });

    const { rerender } = render(
      <ClientTagSelector selectedTags={currentTags} onChange={handleChange} />
    );

    fireEvent.click(screen.getByLabelText('Owner'));
    expect(handleChange).toHaveBeenCalledWith(['Owner']);

    // Update props and rerender
    rerender(
      <ClientTagSelector selectedTags={['Owner']} onChange={handleChange} />
    );

    fireEvent.click(screen.getByLabelText('Musician'));
    // The component uses Array.from(new Set([...selectedTags, tag])) which adds to existing
    // So it should be called with ['Owner', 'Musician'] but order may vary
    expect(handleChange).toHaveBeenCalled();
    const lastCall =
      handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
    expect(lastCall).toContain('Owner');
    expect(lastCall).toContain('Musician');
    expect(lastCall).toHaveLength(2);
  });

  it('handles event.stopPropagation on label click when enabled', () => {
    const handleClick = jest.fn();

    render(
      <div onClick={handleClick}>
        <ClientTagSelector
          selectedTags={[]}
          onChange={mockOnChange}
          stopPropagation={true}
        />
      </div>
    );

    const label = screen.getByText('Owner').parentElement;
    fireEvent.click(label!);

    expect(handleClick).not.toHaveBeenCalled();
  });
});
