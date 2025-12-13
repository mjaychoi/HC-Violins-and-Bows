import React from 'react';
import { CLIENT_TAG_OPTIONS, ClientTag } from '../constants';

interface ClientTagSelectorProps {
  selectedTags: string[];
  onChange: (next: string[]) => void;
  className?: string;
  optionClassName?: string;
  checkboxClassName?: string;
  labelClassName?: string;
  stopPropagation?: boolean;
  options?: readonly ClientTag[];
  getLabelClassName?: (tag: ClientTag) => string;
}

export default function ClientTagSelector({
  selectedTags,
  onChange,
  className = 'space-y-2',
  optionClassName = 'flex items-center',
  checkboxClassName = 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded',
  labelClassName = 'ml-2 text-sm text-gray-700',
  stopPropagation = false,
  options = CLIENT_TAG_OPTIONS,
  getLabelClassName,
}: ClientTagSelectorProps) {
  const handleToggle = (
    tag: ClientTag,
    checked: boolean,
    event?: React.MouseEvent | React.ChangeEvent
  ) => {
    if (stopPropagation && event && 'stopPropagation' in event) {
      event.stopPropagation();
    }
    const next = checked
      ? Array.from(new Set([...selectedTags, tag]))
      : selectedTags.filter(t => t !== tag);
    onChange(next);
  };

  return (
    <div className={className}>
      {options.map(tag => (
        <label
          key={tag}
          className={optionClassName}
          onClick={stopPropagation ? e => e.stopPropagation() : undefined}
        >
          <input
            type="checkbox"
            checked={selectedTags.includes(tag)}
            onChange={e => handleToggle(tag, e.target.checked, e)}
            className={checkboxClassName}
            onClick={
              stopPropagation ? e => e.stopPropagation() : undefined
            }
          />
          <span
            className={[
              labelClassName,
              getLabelClassName ? getLabelClassName(tag) : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {tag}
          </span>
        </label>
      ))}
    </div>
  );
}
