'use client';

import React, { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
// Note: react-dnd v16 exports DndProvider from dist/core path
// This is the stable import path for react-big-calendar compatibility
import { DndProvider } from 'react-dnd/dist/core';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfDay,
  addDays,
} from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { MaintenanceTask } from '@/types';
import { getDateStatus } from '@/utils/tasks/style';
import { parseYMDLocal } from '@/utils/dateParsing';
import { parseISO, isValid } from 'date-fns';
import { getCalendarPlacementDate } from '@/utils/calendar';

// Calendar styles are now in globals.css to avoid duplication and hydration issues

const locales = {
  'en-US': enUS,
};

// Explicitly set weekStartsOn to 0 (Sunday) for consistency
const localizer = dateFnsLocalizer({
  format: (date: Date, fmt: string, options?: { locale?: typeof enUS }) =>
    format(date, fmt, { locale: enUS, ...options }),
  parse: (value: string, fmt: string) =>
    parse(value, fmt, new Date(), { locale: enUS }),
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 0 }), // Explicitly Sunday start
  getDay,
  locales,
});

// Unified calendar resource types
export interface EventData {
  instrument: string;
  instrumentColor: string;
  description: string;
}

export type CalendarResource = {
  kind: 'task';
  task: MaintenanceTask;
  eventData: EventData;
};

export type CalendarEvent = Omit<Event, 'resource'> & {
  resource: CalendarResource;
};

interface CalendarViewProps {
  tasks: MaintenanceTask[];
  instruments?: Map<
    string,
    {
      type: string | null;
      maker: string | null;
      ownership: string | null;
      clientId?: string | null;
      clientName?: string | null;
    }
  >;
  onSelectEvent?: (task: MaintenanceTask) => void;
  onSelectSlot?: (slotInfo: { start: Date; end: Date }) => void;
  onEventDrop?: (data: {
    event: Event;
    start: Date;
    end: Date;
    isAllDay?: boolean;
  }) => Promise<void> | void;
  /** When false, slot selection / create affordances are disabled in the grid. */
  canCreateTask?: boolean;
  /** When false, drag/resize mutation affordances are disabled in the grid. */
  canManageTask?: boolean;
  draggingEventId?: string | null; // Track currently dragging event for visual feedback
  currentDate?: Date;
  onNavigate?: (date: Date) => void;
}

// Enhanced Calendar with drag and drop
// Properly typed DragAndDropCalendar component
type CalendarProps = React.ComponentProps<typeof Calendar>;
type DragAndDropCalendarProps = CalendarProps & {
  onEventDrop?: (data: {
    event: Event;
    start: Date;
    end: Date;
    isAllDay?: boolean;
  }) => Promise<void> | void;
  draggableAccessor?: (event: Event) => boolean;
  resizableAccessor?: (event: Event) => boolean;
};

// Use type assertion to handle react-big-calendar's drag and drop types
const DragAndDropCalendar = withDragAndDrop(
  Calendar
) as React.ComponentType<DragAndDropCalendarProps>;

export default function CalendarView({
  tasks,
  instruments,
  onSelectEvent,
  onSelectSlot,
  onEventDrop,
  canCreateTask = true,
  canManageTask = true,
  draggingEventId,
  currentDate = new Date(),
  onNavigate,
}: CalendarViewProps) {
  const allowSlotCreate = Boolean(canCreateTask && onSelectSlot);
  const allowEventDrag = Boolean(canManageTask && onEventDrop);

  // Convert tasks to calendar events
  const events: Event[] = useMemo(() => {
    // Task events
    const taskEvents = tasks
      .map(task => {
        const raw = getCalendarPlacementDate(task);
        if (!raw) return null;

        const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(raw);
        let date: Date | null = null;
        try {
          if (isYMD) {
            date = parseYMDLocal(raw);
          } else {
            const isoDate = parseISO(raw);
            date = isValid(isoDate) ? isoDate : null;
          }
        } catch {
          return null;
        }

        if (!date) return null;

        // Date-only tasks: all-day events (no fake clock time)
        const start = startOfDay(date);
        const end = addDays(start, 1);

        // Get instrument info from instruments map if available
        const instrument = task.instrument_id
          ? instruments?.get(task.instrument_id)
          : undefined;
        const instrumentType = instrument?.type;

        // Get instrument color for visual distinction (no icon)
        const getInstrumentColor = (
          type: string | null | undefined
        ): string => {
          if (!type) return 'text-gray-600';
          const t = type.toLowerCase();
          if (t.includes('violin') || t.includes('바이올린'))
            return 'text-blue-600';
          if (t.includes('viola') || t.includes('비올라'))
            return 'text-purple-600';
          if (t.includes('cello') || t.includes('첼로'))
            return 'text-green-600';
          if (t.includes('bass') || t.includes('베이스'))
            return 'text-indigo-600';
          if (t.includes('bow') || t.includes('활')) return 'text-amber-600';
          return 'text-gray-600';
        };

        // 2-line structure: Instrument (line 1) + Task Description (line 2)
        const instrumentColor = getInstrumentColor(instrumentType);
        const instrumentName = instrumentType || 'Unknown';

        // Clean task title (remove common prefixes/suffixes)
        let taskDescription = task.title.trim();
        const taskTypePatterns = [
          /(복원|restoration)/i,
          /(교체|replace|replacement)/i,
          /(점검|inspection|check)/i,
          /(수리|repair)/i,
          /(조율|tuning)/i,
        ];

        // Extract and clean task description
        for (const pattern of taskTypePatterns) {
          const match = taskDescription.match(pattern);
          if (match) {
            taskDescription = taskDescription.replace(pattern, '').trim();
            break;
          }
        }

        // Truncate if too long
        if (taskDescription.length > 20) {
          taskDescription = `${taskDescription.slice(0, 18)}...`;
        }

        // Store structured data for custom event component
        const eventData: EventData = {
          instrument: instrumentName,
          instrumentColor,
          description: taskDescription || 'Task',
        };

        const event: Event = {
          title: `${eventData.instrument} – ${eventData.description}`, // Single line for accessibility
          start,
          end,
          allDay: true,
          resource: { kind: 'task', task, eventData } as CalendarResource,
        };

        return event;
      })
      .filter((event): event is Event => event !== null);

    return taskEvents;
  }, [tasks, instruments]);

  const eventStyleGetter = useCallback(
    (event: Event) => {
      const r = event.resource as CalendarResource | undefined;

      // Handle task events
      const task = r?.kind === 'task' ? r.task : undefined;
      if (!task) {
        // Fallback for invalid task
        return {
          style: {},
          className: 'rbc-event status-normal',
        };
      }

      const isDragging = draggingEventId && task.id === draggingEventId;

      const dateStatus = getDateStatus(task);
      const isOverdue = dateStatus.status === 'overdue';
      const isToday = dateStatus.days === 0 && !isOverdue;
      const isDueSoon =
        dateStatus.status === 'upcoming' && dateStatus.days <= 3;
      const isCompleted = task.status === 'completed';

      // Determine status class for CSS-based left border color
      let statusClass = 'status-normal';
      if (isCompleted) {
        statusClass = 'status-completed';
      } else if (isOverdue) {
        statusClass = 'status-overdue';
      } else if (isToday) {
        statusClass = 'status-today';
      } else if (isDueSoon) {
        statusClass = 'status-due-soon';
      }

      // Dynamic styles only (CSS handles layout/basic card)
      const style: React.CSSProperties = {
        opacity: isDragging ? 0.6 : isCompleted ? 0.7 : 1,
        textDecoration: isCompleted ? 'line-through' : 'none',
        boxShadow: isDragging ? '0px 4px 8px rgba(0, 0, 0, 0.15)' : undefined,
        transform: isDragging ? 'scale(1.02)' : undefined,
        // NOTE: Disable transition during drag to avoid jitter in react-big-calendar
        // Transition animations conflict with drag position updates, causing visual glitches
        transition: isDragging ? 'none' : undefined,
        zIndex: isDragging ? 1000 : undefined,
      };

      return {
        style,
        className: `rbc-event ${statusClass} ${isDragging ? 'rbc-event-dragging' : ''}`,
      };
    },
    [draggingEventId] // Include draggingEventId in dependencies
  );

  const messages = useMemo(
    () => ({
      next: 'Next',
      previous: 'Previous',
      today: 'Today',
      month: 'Month',
      date: 'Date',
      time: 'Time',
      event: 'Event',
      noEventsInRange: 'No scheduled tasks in this range.',
      showMore: (total: number) => `+${total} more`,
    }),
    []
  );

  return (
    <>
      <DndProvider backend={HTML5Backend}>
        <div
          className="w-full calendar-container"
          style={{
            height: '850px', // Increased height to accommodate bottom row
            minHeight: '850px',
            padding: '1rem',
            paddingBottom: '3rem', // Increased padding to prevent bottom row cutoff
            overflow: 'visible', // Allow content to overflow if needed
          }}
        >
          <DragAndDropCalendar
            {...({
              localizer,
              events,
              startAccessor: 'start',
              endAccessor: 'end',
              style: { height: '100%', minHeight: '750px' },
              eventPropGetter: eventStyleGetter,
              onSelectEvent: (event: Event) => {
                const r = event.resource as CalendarResource | undefined;
                if (r?.kind === 'task' && onSelectEvent) {
                  onSelectEvent(r.task);
                }
              },
              ...(allowSlotCreate && { onSelectSlot }),
              ...(allowEventDrag && { onEventDrop }),
              draggableAccessor: (event: Event) => {
                if (!allowEventDrag) return false;
                const resource = event.resource as CalendarResource | undefined;
                return resource?.kind === 'task';
              },
              resizableAccessor: () => false,
              selectable: allowSlotCreate,
              resizable: false,
              date: currentDate,
              onNavigate,
              toolbar: false,
              view: 'month',
              views: ['month'],
              messages,
              popup: true,
              showMultiDayTimes: true,
              step: 60,
              timeslots: 1,
              culture: 'en-US',
            } as unknown as DragAndDropCalendarProps)}
            components={{
              event: ({ event }: { event: Event }) => {
                const resource = event.resource as CalendarResource | undefined;

                // Handle task events
                const eventData =
                  resource?.kind === 'task' ? resource.eventData : null;

                if (eventData) {
                  // NOTE: Visual rendering strategy (2-line structure)
                  // - Line 1: Instrument name (with color coding)
                  // - Line 2: Task description
                  // This provides rich visual information while event.title remains single-line for accessibility
                  return (
                    <div className="rbc-event-content">
                      <div
                        className={`event-instrument ${eventData.instrumentColor}`}
                      >
                        {eventData.instrument}
                      </div>
                      <div className="event-description">
                        {eventData.description}
                      </div>
                    </div>
                  );
                }

                // Fallback: parse title (2-line format: "Instrument\nDescription")
                const title =
                  typeof event.title === 'string'
                    ? event.title
                    : String(event.title || '');
                const lines = title.split('\n');

                if (lines.length >= 2) {
                  return (
                    <div className="rbc-event-content">
                      <div className="event-instrument text-gray-700">
                        {lines[0]}
                      </div>
                      <div className="event-description">{lines[1]}</div>
                    </div>
                  );
                }

                return <div className="rbc-event-content">{title}</div>;
              },
            }}
          />
        </div>
      </DndProvider>
    </>
  );
}
