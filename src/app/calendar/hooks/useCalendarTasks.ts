import { useMemo, useCallback } from 'react';
import type {
  MaintenanceTask,
  Client,
  Instrument,
  TaskType,
  TaskPriority,
  TaskStatus,
} from '@/types';
import { calculateSummaryStats } from '../utils/filterUtils';
import { sortByPriority } from '@/utils/filters';
import { PRIORITY_ORDER } from '../constants';

interface UseCalendarTasksOptions {
  tasks: MaintenanceTask[];
  instruments: Instrument[];
  clients: Client[];
  filteredTasks?: MaintenanceTask[]; // Optional, used for summary stats calculation
}

export const useCalendarTasks = ({
  tasks,
  instruments,
  clients,
  filteredTasks,
}: UseCalendarTasksOptions) => {
  // Normalize ownership string for matching (trim, collapse spaces, lowercase)
  const normalizeOwnership = useCallback((ownership: string | null): string => {
    if (!ownership) return '';
    return ownership
      .trim()
      .replace(/\s+/g, ' ') // Collapse multiple spaces to single space
      .toLowerCase();
  }, []);

  // Create instruments map for quick lookup with client info
  const instrumentsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        type: string | null;
        maker: string | null;
        ownership: string | null;
        serial_number?: string | null;
        clientId?: string | null;
        clientName?: string | null;
      }
    >();

    // Create client map for ownership lookup (normalized)
    // First, try to match by client_id if available (preferred method)
    const clientByIdMap = new Map<string, Client>();
    clients.forEach(client => {
      clientByIdMap.set(client.id, client);
    });

    // Fallback: create normalized name map for string-based matching
    const clientByNameMap = new Map<string, Client>();
    clients.forEach(client => {
      const fullName =
        `${client.first_name || ''} ${client.last_name || ''}`.trim();
      if (fullName) {
        const normalizedName = normalizeOwnership(fullName);
        // Only add if not already set (prefer first match)
        if (!clientByNameMap.has(normalizedName)) {
          clientByNameMap.set(normalizedName, client);
        }
      }
    });

    instruments.forEach(instrument => {
      const ownership = instrument.ownership;
      let clientId: string | null = null;
      let clientName: string | null = null;

      // Prefer client_id if available (most reliable)
      // Note: This assumes Instrument type has client_id field
      // If not available, fall back to ownership string matching
      if (ownership) {
        // Try normalized string matching
        const normalizedOwnership = normalizeOwnership(ownership);
        const client = clientByNameMap.get(normalizedOwnership);
        if (client) {
          clientId = client.id;
          clientName =
            `${client.first_name || ''} ${client.last_name || ''}`.trim();
        }
      }

      map.set(instrument.id, {
        type: instrument.type,
        maker: instrument.maker,
        ownership: instrument.ownership,
        serial_number: instrument.serial_number,
        clientId: clientId || null,
        clientName: clientName || null,
      });
    });
    return map;
  }, [instruments, clients, normalizeOwnership]);

  // Create clients map for quick lookup
  const clientsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        firstName: string;
        lastName: string;
        email?: string | null;
      }
    >();

    clients.forEach(client => {
      map.set(client.id, {
        firstName: client.first_name || '',
        lastName: client.last_name || '',
        email: client.email,
      });
    });

    return map;
  }, [clients]);

  // Get unique ownership values for filter
  const ownershipOptions = useMemo(() => {
    const ownerships = new Set<string>();
    instruments.forEach(instrument => {
      if (instrument.ownership) {
        ownerships.add(instrument.ownership);
      }
    });
    return Array.from(ownerships).sort();
  }, [instruments]);

  // Get filter options for search component
  // Calendar has complex logic (extractors, priority sorting, instrument map lookup)
  // so we keep custom logic but could use buildFilterOptions with extractors if needed
  const filterOptions = useMemo(() => {
    const types = new Set<TaskType>();
    const priorities = new Set<TaskPriority>();
    const statuses = new Set<TaskStatus>();
    const owners = new Set<string>();

    tasks.forEach(task => {
      if (task.task_type) types.add(task.task_type);
      if (task.priority) priorities.add(task.priority);
      if (task.status) statuses.add(task.status);

      const instrument = task.instrument_id
        ? instrumentsMap.get(task.instrument_id)
        : undefined;
      if (instrument?.ownership) {
        owners.add(instrument.ownership);
      }
    });

    return {
      types: Array.from(types).sort(),
      priorities: sortByPriority(Array.from(priorities), PRIORITY_ORDER),
      statuses: Array.from(statuses).sort(),
      owners: Array.from(owners).sort(),
    };
  }, [tasks, instrumentsMap]);

  // Create ownership map for efficient filtering (reused across filter calls)
  const ownershipMap = useMemo(() => {
    const m = new Map<
      string,
      {
        ownership: string | null;
      }
    >();
    instrumentsMap.forEach((v, k) => {
      m.set(k, { ownership: v.ownership });
    });
    return m;
  }, [instrumentsMap]);

  // Calculate summary statistics (use provided filteredTasks or empty array)
  const summaryStats = useMemo(() => {
    return calculateSummaryStats(filteredTasks || []);
  }, [filteredTasks]);

  return {
    instrumentsMap,
    clientsMap,
    ownershipMap, // Expose ownershipMap for reuse in filterCalendarTasks
    ownershipOptions,
    filterOptions,
    summaryStats,
  };
};
