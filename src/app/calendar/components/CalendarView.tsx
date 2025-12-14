'use client';

import React, { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Event, View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { DndProvider } from 'react-dnd/dist/core';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { addHours } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { MaintenanceTask, ContactLog } from '@/types';
import YearView from './YearView';
import TimelineView from './TimelineView';
import { getDateStatus } from '@/utils/tasks/style';
import { parseYMDLocal } from '@/utils/dateParsing';
import { parseISO, isValid } from 'date-fns';

// Custom styles for calendar events - professional card design
const calendarEventStyles = `
  /* Professional card design: white background with left accent bar (2px default, 4px for priority) */
  .rbc-event {
    background: #ffffff !important;
    border: 1px solid #e5e7eb !important;
    border-left: 2px solid !important;
    border-radius: 6px !important;
    padding: 6px 8px !important;
    margin: 1px 0 !important;
    box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.04) !important;
    color: #111827 !important;
    font-size: 11px !important;
    line-height: 1.3 !important;
    transition: all 0.15s ease !important;
    cursor: grab !important;
    width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
  }
  .rbc-event:hover {
    box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.08) !important;
    border-color: #d1d5db !important;
  }
  .rbc-event:active {
    cursor: grabbing !important;
  }
  .rbc-event-dragging {
    cursor: grabbing !important;
    z-index: 1000 !important;
  }
  /* Status-based accent colors: left border only (3px) */
  .rbc-event.status-overdue {
    border-left-color: #ef4444 !important; /* Red-500 */
    border-left-width: 4px !important; /* Thicker for priority */
    background-color: #fef2f2 !important; /* Red-50 tint */
  }
  .rbc-event.status-due-soon {
    border-left-color: #f59e0b !important; /* Amber-500 */
    border-left-width: 4px !important; /* Thicker for priority */
    background-color: #fffbeb !important; /* Amber-50 tint */
  }
  .rbc-event.status-today {
    border-left-color: #10b981 !important; /* Green-500 */
    border-left-width: 4px !important; /* Thicker for priority */
    background-color: #f0fdf4 !important; /* Green-50 tint */
  }
  .rbc-event.status-normal {
    border-left-color: #10b981 !important; /* Emerald-500 */
    border-left-width: 2px !important; /* Normal thickness */
  }
  .rbc-event.status-completed {
    border-left-color: #9ca3af !important; /* Gray-400 */
    border-left-width: 2px !important;
    opacity: 0.7 !important;
  }
  /* Remove old styles */
  .calendar-event-overdue::before {
    display: none !important;
  }
  .calendar-event-upcoming {
    border-style: solid !important;
  }
  .calendar-event-completed {
    opacity: 0.7 !important;
  }
  /* Fix for bottom row truncation in month view */
  .rbc-month-view {
    overflow: visible !important;
    padding-bottom: 1rem !important;
  }
  .rbc-month-row {
    overflow: visible !important;
  }
  .rbc-day-bg {
    overflow: visible !important;
    padding-left: 2px !important; /* Prevent border-left from overflowing */
  }
  .rbc-date-cell {
    overflow: visible !important;
  }
  .rbc-row-content {
    overflow: visible !important;
    padding-left: 2px !important; /* Prevent border-left from overflowing */
  }
  .rbc-row-segment {
    overflow: visible !important;
    padding-left: 2px !important; /* Prevent border-left from overflowing */
    width: 100% !important;
    min-width: 0 !important;
  }
  /* Prevent event text from overflowing */
  .rbc-event-label {
    width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }
  /* Month cell styling: date in top-right, reduced padding */
  .rbc-date-cell {
    padding: 4px 6px !important;
    text-align: right !important;
  }
  .rbc-date-cell > a {
    color: #9ca3af !important;
    font-size: 11px !important;
    font-weight: 500 !important;
  }
  /* Today column: enhanced highlight with stronger blue background */
  .rbc-today {
    background-color: #EFF6FF !important; /* Slightly stronger blue-50 */
  }
  .rbc-today .rbc-date-cell > a {
    color: #1D4ED8 !important; /* Deeper blue-700 */
    font-weight: 700 !important;
  }
  .rbc-today .rbc-day-bg {
    background-color: #EFF6FF !important; /* Slightly stronger blue-50 */
  }
  /* Today column border for extra emphasis */
  .rbc-today .rbc-day-bg {
    border-left: 2px solid #3B82F6 !important; /* Blue-500 accent */
  }
  /* Weekend: stronger background distinction */
  .rbc-day-bg.rbc-sat,
  .rbc-day-bg.rbc-sun {
    background-color: #f9fafb !important; /* Neutral-50 */
  }
  .rbc-sat .rbc-date-cell > a,
  .rbc-sun .rbc-date-cell > a {
    color: #9ca3af !important; /* Muted for weekend */
  }
  /* Previous/next month dates: lower opacity */
  .rbc-off-range-bg {
    background-color: #fafafa !important;
    opacity: 0.5 !important;
  }
  .rbc-off-range .rbc-date-cell > a {
    color: #d1d5db !important;
    opacity: 0.6 !important;
  }
  /* Event content: 2-line structure */
  .rbc-event-content {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 2px !important;
    line-height: 1.2 !important;
    width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }
  .rbc-event-content .event-instrument {
    font-weight: 500 !important;
    font-size: 11px !important;
    width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  .rbc-event-content .event-description {
    font-size: 10px !important;
    color: #6b7280 !important;
    opacity: 0.9 !important;
    width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  /* Target emoji icon (first character) - note: CSS can't directly style emoji opacity,
     so we rely on the emoji being in the title string itself */
  /* Limit month row height to naturally trigger "+N more" */
  .rbc-month-row {
    min-height: 100px !important;
  }
  .rbc-row-content {
    height: 100px !important; /* Fixed height triggers show more */
    overflow: visible !important;
  }
  /* Reduced event spacing */
  .rbc-event {
    margin: 1px 0 !important;
  }
  /* Style for "+X more" pill */
  .rbc-show-more {
    background: #f3f4f6 !important;
    color: #6b7280 !important;
    font-size: 10px !important;
    padding: 3px 8px !important;
    border-radius: 12px !important;
    margin-top: 2px !important;
    border: 1px solid #e5e7eb !important;
    font-weight: 500 !important;
  }
  .rbc-show-more:hover {
    background: #e5e7eb !important;
    color: #374151 !important;
  }
`;

const locales = {
  ko: ko,
};

// FIXED: startOfWeek now respects Korean locale (Monday start)
const localizer = dateFnsLocalizer({
  format: (date: Date, fmt: string, options?: { locale?: typeof ko }) =>
    format(date, fmt, { locale: ko, ...options }),
  parse: (value: string, fmt: string) =>
    parse(value, fmt, new Date(), { locale: ko }),
  startOfWeek: (date: Date) => startOfWeek(date, { locale: ko }),
  getDay,
  locales,
});

// Extended view type to include custom views
// Only allow specific views we support
export type ExtendedView = 'month' | 'week' | 'agenda' | 'year' | 'timeline';

interface CalendarViewProps {
  tasks: MaintenanceTask[];
  contactLogs?: ContactLog[]; // Follow-up 이벤트용
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
  onEventResize?: (data: {
    event: Event;
    start: Date;
    end: Date;
  }) => Promise<void> | void;
  draggingEventId?: string | null; // Track currently dragging event for visual feedback
  currentDate?: Date;
  onNavigate?: (date: Date) => void;
  currentView?: ExtendedView;
  onViewChange?: (view: ExtendedView) => void;
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
  onEventResize?: (data: {
    event: Event;
    start: Date;
    end: Date;
  }) => Promise<void> | void;
  draggableAccessor?: (event: Event) => boolean;
  resizableAccessor?: (event: Event) => boolean;
};

// Use type assertion to handle react-big-calendar's drag and drop types
const DragAndDropCalendar = withDragAndDrop(Calendar) as React.ComponentType<DragAndDropCalendarProps>;

export default function CalendarView({
  tasks,
  contactLogs = [],
  instruments,
  onSelectEvent,
  onSelectSlot,
  onEventDrop,
  onEventResize,
  draggingEventId,
  currentDate = new Date(),
  onNavigate,
  currentView = 'month',
  onViewChange,
}: CalendarViewProps) {
  // FIXED: Fully controlled component - use currentView prop directly
  // Removed internalView state to avoid controlled/uncontrolled mixing
  const view = currentView ?? 'month';

  const handleViewChange = (view: View | ExtendedView) => {
    // Type guard: only accept views that are in our ExtendedView type
    const validViews: ExtendedView[] = [
      'month',
      'week',
      'agenda',
      'year',
      'timeline',
    ];
    if (validViews.includes(view as ExtendedView)) {
      const extendedView = view as ExtendedView;
      onViewChange?.(extendedView);
    }
  };

  // EventData interface for structured event data
  interface EventData {
    instrument: string;
    instrumentColor: string;
    description: string;
  }

  // Convert tasks and follow-ups to calendar events
  const events: Event[] = useMemo(() => {
    // Task events
    const taskEvents = tasks
      .filter(
        task => task.due_date || task.personal_due_date || task.scheduled_date
      )
      .map(task => {
        // FIXED: Use correct date priority: due_date > personal_due_date > scheduled_date
        const raw =
          task.due_date || task.personal_due_date || task.scheduled_date;
        if (!raw) return null;

        // FIXED: Use parseYMDLocal for consistent date parsing strategy
        // This handles both YYYY-MM-DD (as local) and ISO timestamps correctly
        let date: Date | null = null;
        try {
          // Try parseYMDLocal first (handles YYYY-MM-DD as local)
          date = parseYMDLocal(raw);
          // If that fails, try parseISO for timestamps
          if (!date) {
            const isoDate = parseISO(raw);
            date = isValid(isoDate) ? isoDate : null;
          }
        } catch {
          return null;
        }

        if (!date) return null;

        // FIXED: For better visibility in week/agenda view, place events at 9AM (business hours)
        // This avoids clustering at 00:00 which can be confusing for users
        // Calendar UX: use date-only and set to 9AM for visibility
        const start = new Date(date);
        start.setHours(9, 0, 0, 0);
        const endDate = addHours(start, 1);

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
          title: `${eventData.instrument}\n${eventData.description}`, // 2-line format
          start: start,
          end: endDate,
          resource: { task, eventData }, // Store structured data
        };

        return event;
      })
      .filter((event): event is Event => event !== null);

    // Follow-up events (from contact logs)
    const followUpEvents = contactLogs
      .filter(log => log.next_follow_up_date)
      .map(log => {
        const followUpDate = parseYMDLocal(log.next_follow_up_date!);
        if (!followUpDate) return null;

        const start = new Date(followUpDate);
        start.setHours(10, 0, 0, 0); // 10AM for follow-ups
        const endDate = addHours(start, 1);

        const clientName = log.client
          ? `${log.client.first_name || ''} ${log.client.last_name || ''}`.trim() ||
            log.client.email ||
            'Unknown Client'
          : 'Unknown Client';

        const eventData: EventData = {
          instrument: log.instrument
            ? `${log.instrument.maker || ''} ${log.instrument.type || ''}`.trim() ||
              'Unknown Instrument'
            : 'Follow-up',
          instrumentColor: 'text-amber-600',
          description: `Follow-up: ${clientName}`,
        };

        const event: Event = {
          title: `${eventData.instrument}\n${eventData.description}`,
          start: start,
          end: endDate,
          resource: {
            type: 'follow_up',
            contactLog: log,
            clientName,
          },
        };

        return event;
      })
      .filter((event): event is Event => event !== null);

    return [...taskEvents, ...followUpEvents];
  }, [tasks, contactLogs, instruments]);

  // FIXED: Lightweight event style - white background with left color bar
  interface EventResource {
    task?: MaintenanceTask;
    type?: 'follow_up';
    contactLog?: ContactLog;
    clientName?: string;
    eventData?: {
      instrument: string;
      instrumentColor: string;
      description: string;
    };
  }
  const eventStyleGetter = useCallback(
    (event: Event) => {
      const resource = event.resource as EventResource | MaintenanceTask;
      const task = 'task' in resource && resource.task ? resource.task : (resource as MaintenanceTask);
      const isDragging = draggingEventId && task && task.id === draggingEventId;

      // Handle follow-up events
      if (
        resource &&
        typeof resource === 'object' &&
        'type' in resource &&
        resource.type === 'follow_up'
      ) {
        return {
          style: {
            backgroundColor: '#fef3c7', // Amber-100
            color: '#92400e', // Amber-800
            border: '1px solid #fbbf24', // Amber-400
            borderLeft: '4px solid #f59e0b', // Amber-500
            borderRadius: '6px',
            padding: '6px 8px',
            fontSize: '11px',
            fontWeight: '500',
            boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04)',
            cursor: 'pointer',
            opacity: isDragging ? 0.5 : 1,
          },
          className: 'rbc-event status-today',
        };
      }

      // Handle task events
      if (!task) {
        // Fallback for invalid task
        return {
          style: {
            backgroundColor: '#ffffff',
            color: '#111827',
            border: '1px solid #e5e7eb',
            borderLeft: '2px solid #9ca3af',
            borderRadius: '6px',
            padding: '6px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            opacity: isDragging ? 0.5 : 1,
          },
          className: 'rbc-event status-normal',
        };
      }

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

      // Professional card style: white background with border
      // Enhanced visual feedback for dragging
      const style: React.CSSProperties = {
        backgroundColor: '#ffffff',
        color: '#111827', // Gray-900
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: '6px 8px',
        fontSize: '11px',
        fontWeight: '400',
        boxShadow: isDragging
          ? '0px 4px 8px rgba(0, 0, 0, 0.15)'
          : '0px 1px 2px rgba(0, 0, 0, 0.04)',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.6 : isCompleted ? 0.7 : 1,
        textDecoration: isCompleted ? 'line-through' : 'none',
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: isDragging ? 'none' : 'all 0.2s ease',
        zIndex: isDragging ? 1000 : 'auto',
      };

      return {
        style,
        className: `rbc-event ${statusClass} ${isDragging ? 'rbc-event-dragging' : ''}`,
      };
    },
    [draggingEventId] // Include draggingEventId in dependencies
  );

  // FIXED: Translate messages to Korean to match culture="ko"
  const messages = useMemo(
    () => ({
      next: '다음',
      previous: '이전',
      today: '오늘',
      month: '월',
      week: '주',
      agenda: '일정',
      date: '날짜',
      time: '시간',
      event: '일정',
      noEventsInRange: '이 기간에는 예정된 작업이 없습니다.',
      showMore: (total: number) => `+${total} 더보기`,
    }),
    []
  );

  // Render custom views
  if (view === 'year' || view === 'timeline') {
    if (view === 'year') {
      return (
        <div
          className="w-full calendar-container"
          style={{ minHeight: '700px', padding: '1rem' }}
        >
          <YearView
            currentDate={currentDate}
            tasks={tasks}
            instruments={instruments}
            onSelectEvent={onSelectEvent}
            onNavigate={onNavigate}
          />
        </div>
      );
    }

    if (view === 'timeline') {
      return (
        <div
          className="w-full calendar-container"
          style={{ minHeight: '700px', padding: '1rem' }}
        >
          <TimelineView
            currentDate={currentDate}
            tasks={tasks}
            instruments={instruments}
            onSelectEvent={onSelectEvent}
            onNavigate={onNavigate}
          />
        </div>
      );
    }
  }

  // Render standard react-big-calendar views
  return (
    <>
      <style>{calendarEventStyles}</style>
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
                if (onSelectEvent && event.resource) {
                  onSelectEvent(event.resource as MaintenanceTask);
                }
              },
              onSelectSlot,
              ...(onEventDrop && { onEventDrop }),
              ...(onEventResize && { onEventResize }),
              draggableAccessor: (event: Event) => {
                // Only allow dragging task events, not follow-up events
                const resource = event.resource as EventResource | MaintenanceTask;
                if (
                  resource &&
                  typeof resource === 'object' &&
                  'type' in resource &&
                  resource.type === 'follow_up'
                ) {
                  return false; // Follow-ups are not draggable
                }
                return true; // Tasks are draggable
              },
              resizableAccessor: (event: Event) => {
                // Only allow resizing task events, not follow-up events
                const resource = event.resource as EventResource | MaintenanceTask;
                if (
                  resource &&
                  typeof resource === 'object' &&
                  'type' in resource &&
                  resource.type === 'follow_up'
                ) {
                  return false; // Follow-ups are not resizable
                }
                return true; // Tasks are resizable
              },
              selectable: true,
              resizable: true,
              date: currentDate,
              onNavigate,
              view: view as View,
              onView: (newView: View) => {
                // Handle standard react-big-calendar views (day view not supported)
                if (
                  newView === 'month' ||
                  newView === 'week' ||
                  newView === 'agenda'
                ) {
                  handleViewChange(newView);
                }
              },
              views: ['month', 'week', 'agenda'],
              messages,
              popup: true,
              showMultiDayTimes: true,
              step: 60,
              timeslots: 1,
              culture: 'ko',
            } as unknown as DragAndDropCalendarProps)}
          components={{
            event: ({ event }: { event: Event }) => {
              // Custom event component with 2-line structure
              interface EventResource {
                task?: MaintenanceTask;
                type?: 'follow_up';
                contactLog?: ContactLog;
                clientName?: string;
                eventData?: {
                  instrument: string;
                  instrumentColor: string;
                  description: string;
                };
              }
              const resource = event.resource as
                | EventResource
                | MaintenanceTask;

              // Handle follow-up events
              if (
                resource &&
                typeof resource === 'object' &&
                'type' in resource &&
                resource.type === 'follow_up'
              ) {
                const clientName = resource.clientName || 'Unknown Client';
                return (
                  <div className="rbc-event-content">
                    <div className="event-instrument text-amber-600">
                      ⏰ Follow-up
                    </div>
                    <div className="event-description">{clientName}</div>
                  </div>
                );
              }

              // Handle task events
              const eventData =
                'eventData' in resource ? resource.eventData : null;

              if (eventData) {
                // Use structured data for 2-line display
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
