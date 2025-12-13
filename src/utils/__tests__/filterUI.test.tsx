import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  buildFilterSelect,
  buildFilterButton,
  filterPanelClasses,
  filterToolbarClasses,
  filterSelectClasses,
  filterButtonClasses,
  pillSelectClasses,
  filterGroupClasses,
} from '../filterUI';

describe('filterUI presets', () => {
  it('exposes class presets', () => {
    expect(filterPanelClasses.container).toMatch(/bg-white/);
    expect(filterToolbarClasses.container).toMatch(/border/);
    expect(filterSelectClasses.select).toMatch(/rounded/);
    expect(filterButtonClasses.reset).toContain('border');
    expect(pillSelectClasses.pillActive).toMatch(/blue/);
    expect(filterGroupClasses.title).toMatch(/font-semibold/);
  });

  it('buildFilterSelect returns props and renders options', () => {
    const onChange = jest.fn();
    const props = buildFilterSelect({
      value: 'a',
      onChange,
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    render(<select {...props} data-testid="sel" />);
    expect(screen.getByTestId('sel')).toHaveValue('a');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.change(screen.getByTestId('sel'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('buildFilterButton returns props with variant class', () => {
    const onClick = jest.fn();
    const props = buildFilterButton({
      onClick,
      children: 'Reset',
      variant: 'reset',
    });
    render(<button {...props} />);
    fireEvent.click(screen.getByText('Reset'));
    expect(onClick).toHaveBeenCalled();
  });
});
