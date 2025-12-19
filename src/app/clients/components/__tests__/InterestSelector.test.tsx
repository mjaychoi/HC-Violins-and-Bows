import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import '@testing-library/jest-dom';
import InterestSelector from '../InterestSelector';
import { INTEREST_LEVELS } from '../../constants';

describe('InterestSelector', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders select element', () => {
    render(<InterestSelector value="" onChange={mockOnChange} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('renders all interest level options', () => {
    render(<InterestSelector value="" onChange={mockOnChange} />);

    INTEREST_LEVELS.forEach(level => {
      expect(screen.getByRole('option', { name: level })).toBeInTheDocument();
    });
  });

  it('renders placeholder option', () => {
    render(
      <InterestSelector
        value=""
        onChange={mockOnChange}
        placeholder="Select interest level"
      />
    );

    expect(
      screen.getByRole('option', { name: 'Select interest level' })
    ).toBeInTheDocument();
  });

  it('shows selected value', () => {
    render(<InterestSelector value="Active" onChange={mockOnChange} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('Active');
  });

  it('calls onChange when value changes', () => {
    render(<InterestSelector value="" onChange={mockOnChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Active' } });

    expect(mockOnChange).toHaveBeenCalledWith('Active');
  });

  it('calls onChange with empty string when placeholder is selected', () => {
    render(<InterestSelector value="Active" onChange={mockOnChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });

    expect(mockOnChange).toHaveBeenCalledWith('');
  });

  it('stops propagation when stopPropagation is enabled', () => {
    const handleClick = jest.fn();

    render(
      <div onClick={handleClick}>
        <InterestSelector
          value=""
          onChange={mockOnChange}
          stopPropagation={true}
        />
      </div>
    );

    const select = screen.getByRole('combobox');
    const clickEvent = new MouseEvent('click', { bubbles: true });
    fireEvent(select, clickEvent);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not stop propagation when stopPropagation is disabled', () => {
    const handleClick = jest.fn();

    render(
      <div onClick={handleClick}>
        <InterestSelector
          value=""
          onChange={mockOnChange}
          stopPropagation={false}
        />
      </div>
    );

    const select = screen.getByRole('combobox');
    fireEvent.click(select);

    expect(handleClick).toHaveBeenCalled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <InterestSelector
        value=""
        onChange={mockOnChange}
        className="custom-wrapper"
      />
    );

    expect(container.firstChild).toHaveClass('custom-wrapper');
  });

  it('applies custom selectClassName', () => {
    render(
      <InterestSelector
        value=""
        onChange={mockOnChange}
        selectClassName="custom-select"
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('custom-select');
  });

  it('uses custom options when provided', () => {
    const customOptions = ['Active', 'Passive'] as const;

    render(
      <InterestSelector
        value=""
        onChange={mockOnChange}
        options={customOptions}
      />
    );

    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Passive' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Inactive' })
    ).not.toBeInTheDocument();
  });

  it('sets name attribute when provided', () => {
    render(
      <InterestSelector value="" onChange={mockOnChange} name="interest" />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('name', 'interest');
  });

  it('sets id attribute when provided', () => {
    render(
      <InterestSelector value="" onChange={mockOnChange} id="interest-select" />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'interest-select');
  });

  it('uses name as id when id is not provided but name is', () => {
    render(
      <InterestSelector value="" onChange={mockOnChange} name="interest" />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('id', 'interest');
  });

  it('handles all interest level values', () => {
    INTEREST_LEVELS.forEach(level => {
      const { unmount } = render(
        <InterestSelector value={level} onChange={mockOnChange} />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe(level);
      unmount();
    });
  });

  it('handles change event with stopPropagation', () => {
    render(
      <InterestSelector
        value=""
        onChange={mockOnChange}
        stopPropagation={true}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Passive' } });

    expect(mockOnChange).toHaveBeenCalledWith('Passive');
  });
});
