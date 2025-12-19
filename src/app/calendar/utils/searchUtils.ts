import React from 'react';
import { MaintenanceTask } from '@/types';
import { getTaskDateKey } from '@/utils/calendar';
import { getPriorityOrder, getStatusOrder } from '../constants';

/**
 * Highlight search term in text
 * Supports multi-word search: highlights each token separately
 * Longer tokens are highlighted first to avoid overlap issues
 */
export function highlightText(
  text: string,
  searchTerm: string
): React.ReactNode {
  if (!searchTerm || !text) return text;

  // Split search term into tokens and sort by length (longest first)
  // This prevents shorter tokens from being highlighted inside longer ones
  const tokens = searchTerm
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (tokens.length === 0) return text;

  // Build regex pattern for all tokens (case-insensitive)
  const pattern = tokens.map(token => escapeRegex(token)).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(regex);

  const lowerTokens = tokens.map(t => t.toLowerCase());

  return parts.map((part, index) => {
    const lowerPart = part.toLowerCase();
    // Check if this part matches any token (prioritize longer matches)
    const isMatch = lowerTokens.some(token => lowerPart === token);
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
 *
 * Search logic:
 * - Single token: OR logic (any field contains the token)
 * - Multiple tokens (2+): AND logic (all tokens must be present)
 *   This provides a balance between power-user precision and general usability
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
  const searchFields = lowerSearch.split(/\s+/).filter(Boolean); // Support multiple words

  // Single token: use OR logic (any field contains it)
  if (searchFields.length === 1) {
    const singleToken = searchFields[0];
    return tasks.filter(task => {
      const instrument = task.instrument_id
        ? instrumentsMap.get(task.instrument_id)
        : undefined;

      if (!instrument) {
        // If no instrument info, search in task fields
        return (
          task.title?.toLowerCase().includes(singleToken) ||
          task.description?.toLowerCase().includes(singleToken) ||
          task.task_type?.toLowerCase().includes(singleToken)
        );
      }

      // Search in multiple fields (OR logic for single token)
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

      return searchableText.includes(singleToken);
    });
  }

  // Multiple tokens: use AND logic (all tokens must be present)
  return tasks.filter(task => {
    const instrument = task.instrument_id
      ? instrumentsMap.get(task.instrument_id)
      : undefined;

    if (!instrument) {
      // If no instrument info, search in task fields
      const searchableText = [task.title, task.description, task.task_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchFields.every(field => searchableText.includes(field));
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

    // Match all search fields (AND logic for multiple tokens)
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
 * 1. due_date (if available)
 * 2. personal_due_date (if due_date is not available)
 * 3. scheduled_date (if neither due_date nor personal_due_date is available)
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
        // Use centralized date key function for consistent priority
        const aDate = getTaskDateKey(a) || '';
        const bDate = getTaskDateKey(b) || '';
        comparison = aDate.localeCompare(bDate);
        break;

      case 'priority':
        // Use centralized priority order constants
        const aPriority = getPriorityOrder(a.priority);
        const bPriority = getPriorityOrder(b.priority);
        comparison = bPriority - aPriority; // Higher priority first
        break;

      case 'status':
        // Use centralized status order constants
        const aStatus = getStatusOrder(a.status);
        const bStatus = getStatusOrder(b.status);
        comparison = aStatus - bStatus;
        break;

      case 'type':
        // Null-safe comparison
        comparison = (a.task_type ?? '').localeCompare(b.task_type ?? '');
        break;

      default:
        comparison = 0;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return sorted;
}
