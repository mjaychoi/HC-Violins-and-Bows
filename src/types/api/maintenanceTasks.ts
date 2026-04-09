type QueryDateValue = string | Date;

export interface MaintenanceTaskQuery {
  id?: string;
  instrument_id?: string;
  status?: string;
  task_type?: string;
  priority?: string;
  search?: string;
  start_date?: QueryDateValue | null;
  end_date?: QueryDateValue | null;
  scheduled_date?: QueryDateValue | null;
  overdue?: boolean;
}

function setIfPresent(
  query: URLSearchParams,
  key: string,
  value: string | null | undefined
) {
  if (value === undefined || value === null) return;
  query.set(key, value);
}

function normalizeDate(value: QueryDateValue | null | undefined) {
  if (value === undefined || value === null) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

export function buildMaintenanceTaskQuery(
  params: MaintenanceTaskQuery = {}
): string {
  const query = new URLSearchParams();

  setIfPresent(query, 'id', params.id);
  setIfPresent(query, 'instrument_id', params.instrument_id);
  setIfPresent(query, 'status', params.status);
  setIfPresent(query, 'task_type', params.task_type);
  setIfPresent(query, 'priority', params.priority);
  setIfPresent(query, 'search', params.search);
  setIfPresent(query, 'start_date', normalizeDate(params.start_date));
  setIfPresent(query, 'end_date', normalizeDate(params.end_date));
  setIfPresent(query, 'scheduled_date', normalizeDate(params.scheduled_date));
  if (typeof params.overdue === 'boolean') {
    setIfPresent(query, 'overdue', String(params.overdue));
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}
