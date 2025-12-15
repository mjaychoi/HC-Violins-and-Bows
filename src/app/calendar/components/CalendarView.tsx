'use client';

import React, { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Event, View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
// Note: react-dnd v16 exports DndProvider from dist/core path
// This is the stable import path for react-big-calendar compatibility
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

// Calendar styles are now in globals.css to avoid duplication and hydration issues

const locales = {
  ko: ko,
};

// FIXED: Explicitly set weekStartsOn to 0 (Sunday) for consistency
// Note: Korean locale may not guarantee Monday start, so we explicitly set it
const localizer = dateFnsLocalizer({
  format: (date: Date, fmt: string, options?: { locale?: typeof ko }) =>
    format(date, fmt, { locale: ko, ...options }),
  parse: (value: string, fmt: string) =>
    parse(value, fmt, new Date(), { locale: ko }),
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 0 }), // Explicitly Sunday start
  getDay,
  locales,
});

// Extended view type to include custom views
// Only allow specific views we support
export type ExtendedView = 'month' | 'week' | 'agenda' | 'year' | 'timeline';

// Unified calendar resource types
export interface EventData {
  instrument: string;
  instrumentColor: string;
  description: string;
}

export type CalendarResource =
  | { kind: 'task'; task: MaintenanceTask; eventData: EventData }
  | { kind: 'follow_up'; contactLog: ContactLog; clientName: string };

export type CalendarEvent = Omit<Event, 'resource'> & {
  resource: CalendarResource;
};

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
  onSelectFollowUpEvent?: (log: ContactLog) => void;
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
const DragAndDropCalendar = withDragAndDrop(
  Calendar
) as React.ComponentType<DragAndDropCalendarProps>;

export default function CalendarView({
  tasks,
  contactLogs = [],
  instruments,
  onSelectEvent,
  onSelectFollowUpEvent,
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

        // FIXED: Safe date parsing - check format first
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
          title: `${eventData.instrument} – ${eventData.description}`, // Single line for accessibility
          start: start,
          end: endDate,
          resource: { kind: 'task', task, eventData } as CalendarResource,
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
            kind: 'follow_up',
            contactLog: log,
            clientName,
          } as CalendarResource,
        };

        return event;
      })
      .filter((event): event is Event => event !== null);

    return [...taskEvents, ...followUpEvents];
  }, [tasks, contactLogs, instruments]);

  const eventStyleGetter = useCallback(
    (event: Event) => {
      const r = event.resource as CalendarResource | undefined;

      // Handle follow-up events first - early return (not draggable, so no dragging styles)
      if (r?.kind === 'follow_up') {
        return {
          style: {},
          className: 'rbc-event status-followup',
        };
      }

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
                if (!r) return;

                // Follow-up 클릭 처리
                if (r.kind === 'follow_up') {
                  if (onSelectFollowUpEvent) {
                    onSelectFollowUpEvent(r.contactLog);
                  }
                  return;
                }

                // Task 이벤트 처리
                if (r.kind === 'task' && onSelectEvent) {
                  onSelectEvent(r.task);
                }
              },
              onSelectSlot,
              ...(onEventDrop && { onEventDrop }),
              ...(onEventResize && { onEventResize }),
              draggableAccessor: (event: Event) => {
                // Only allow dragging task events, not follow-up events
                const resource = event.resource as CalendarResource | undefined;
                return resource?.kind === 'task';
              },
              resizableAccessor: (event: Event) => {
                // Only allow resizing task events, not follow-up events
                const resource = event.resource as CalendarResource | undefined;
                return resource?.kind === 'task';
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
                const resource = event.resource as CalendarResource | undefined;

                // Handle follow-up events
                if (resource?.kind === 'follow_up') {
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
                  resource?.kind === 'task' ? resource.eventData : null;

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
