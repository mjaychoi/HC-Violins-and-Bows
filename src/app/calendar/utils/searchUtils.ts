import React from 'react';
import { MaintenanceTask } from '@/types';

/**
 * Highlight search term in text
 */
export function highlightText(
  text: string,
  searchTerm: string
): React.ReactNode {
  if (!searchTerm || !text) return text;

  const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    const isMatch = regex.test(part);
    // Reset regex lastIndex for next test
    regex.lastIndex = 0;
    return isMatch
      ? React.createElement(
          'mark',
          { key: index, className: 'bg-yellow-200 px-1 rounded' },
          part
        )
      : part;
  });
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search tasks by multiple fields (name, serial, type, owner)
 */
export function searchTasks(
  tasks: MaintenanceTask[],
  searchTerm: string,
  instrumentsMap: Map<
    string,
    {
      type: string | null;
      maker: string | null;
      ownership: string | null;
      serial_number?: string | null;
    }
  >
): MaintenanceTask[] {
  if (!searchTerm.trim()) return tasks;

  const lowerSearch = searchTerm.toLowerCase().trim();
  const searchFields = lowerSearch.split(/\s+/); // Support multiple words

  return tasks.filter(task => {
    const instrument = task.instrument_id
      ? instrumentsMap.get(task.instrument_id)
      : undefined;

    if (!instrument) {
      // If no instrument info, search in task fields
      return (
        task.title?.toLowerCase().includes(lowerSearch) ||
        task.description?.toLowerCase().includes(lowerSearch) ||
        task.task_type?.toLowerCase().includes(lowerSearch)
      );
    }

    // Search in multiple fields
    const searchableText = [
      instrument.maker,
      instrument.type,
      instrument.ownership,
      instrument.serial_number,
      task.title,
      task.description,
      task.task_type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Match all search fields (AND logic)
    return searchFields.every(field => searchableText.includes(field));
  });
}

/**
 * Sort tasks by date (default) or other criteria
 *
 * @param tasks - Array of tasks to sort
 * @param sortBy - Sort criteria: 'date', 'priority', 'status', or 'type'
 * @param sortOrder - Sort direction: 'asc' (ascending) or 'desc' (descending)
 * @returns Sorted array of tasks (new array, original is not mutated)
 *
 * @remarks
 * When sorting by 'date', uses the following priority order for date selection:
 * 1. scheduled_date (if available)
 * 2. due_date (if scheduled_date is not available)
 * 3. personal_due_date (if neither scheduled_date nor due_date is available)
 * 4. received_date (as fallback)
 *
 * This matches the date priority used throughout the application for displaying
 * and grouping tasks.
 */
export function sortTasks(
  tasks: MaintenanceTask[],
  sortBy: 'date' | 'priority' | 'status' | 'type' = 'date',
  sortOrder: 'asc' | 'desc' = 'asc'
): MaintenanceTask[] {
  const sorted = [...tasks];

  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'date':
        // Date priority: scheduled_date > due_date > personal_due_date > received_date
        const aDate =
          a.scheduled_date ||
          a.due_date ||
          a.personal_due_date ||
          a.received_date ||
          '';
        const bDate =
          b.scheduled_date ||
          b.due_date ||
          b.personal_due_date ||
          b.received_date ||
          '';
        comparison = aDate.localeCompare(bDate);
        break;

      case 'priority':
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority] || 0;
        const bPriority = priorityOrder[b.priority] || 0;
        comparison = bPriority - aPriority; // Higher priority first
        break;

      case 'status':
        const statusOrder = {
          pending: 1,
          in_progress: 2,
          completed: 3,
          cancelled: 4,
        };
        const aStatus = statusOrder[a.status] || 0;
        const bStatus = statusOrder[b.status] || 0;
        comparison = aStatus - bStatus;
        break;

      case 'type':
        comparison = a.task_type.localeCompare(b.task_type);
        break;

      default:
        comparison = 0;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return sorted;
}
