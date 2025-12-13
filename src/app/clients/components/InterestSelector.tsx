import React from 'react';
import { INTEREST_LEVELS, InterestLevel } from '../constants';

interface InterestSelectorProps {
  value: string;
  onChange: (value: InterestLevel | '') => void;
  className?: string;
  selectClassName?: string;
  placeholder?: string;
  stopPropagation?: boolean;
  options?: readonly InterestLevel[];
  name?: string;
  id?: string;
}

export default function InterestSelector({
  value,
  onChange,
  className,
  selectClassName = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900',
  placeholder = 'Select interest level',
  stopPropagation = false,
  options = INTEREST_LEVELS,
  name,
  id,
}: InterestSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (stopPropagation) e.stopPropagation();
    onChange(e.target.value as InterestLevel | '');
  };

  return (
    <div className={className}>
      <select
        value={value || ''}
        onChange={handleChange}
        name={name}
        id={id || name}
        className={selectClassName}
        onClick={stopPropagation ? e => e.stopPropagation() : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
