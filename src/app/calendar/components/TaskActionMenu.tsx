'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { MaintenanceTask } from '@/types';

interface TaskActionMenuProps {
  task: MaintenanceTask;
  onViewDetails?: (task: MaintenanceTask) => void;
  onMarkComplete?: (task: MaintenanceTask) => void;
  onEdit?: (task: MaintenanceTask) => void;
  onDelete?: (task: MaintenanceTask) => void;
}

export default function TaskActionMenu({
  task,
  onViewDetails,
  onMarkComplete,
  onEdit,
  onDelete,
}: TaskActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        aria-label="Task actions"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[100]">
          {onViewDetails && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleAction(() => onViewDetails(task));
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              View details
            </button>
          )}
          {onMarkComplete && task.status !== 'completed' && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleAction(() => onMarkComplete(task));
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Mark complete
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleAction(() => onEdit(task));
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <>
              <div className="border-t border-gray-200 my-1" />
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  handleAction(() => onDelete(task));
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
