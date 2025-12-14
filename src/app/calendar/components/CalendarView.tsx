'use client';

import React, { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Event, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { addHours } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { MaintenanceTask } from '@/types';
import YearView from './YearView';
import TimelineView from './TimelineView';
import { getDateStatus } from '@/utils/tasks/style';
import { parseYMDLocal } from '@/utils/dateParsing';
import { parseISO, isValid } from 'date-fns';

// Custom styles for calendar events - professional card design
const calendarEventStyles = `
  /* Professional card design: white background with left accent bar (3px) */
  .rbc-event {
    background: #ffffff !important;
    border: 1px solid #e5e7eb !important;
    border-left: 3px solid !important;
    border-radius: 6px !important;
    padding: 6px 8px !important;
    margin: 1px 0 !important;
    box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.04) !important;
    color: #111827 !important;
    font-size: 11px !important;
    line-height: 1.4 !important;
    transition: all 0.15s ease !important;
    cursor: pointer !important;
  }
  .rbc-event:hover {
    box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.08) !important;
    border-color: #d1d5db !important;
  }
  /* Status-based accent colors: left border only (3px) */
  .rbc-event.status-overdue {
    border-left-color: #ef4444 !important; /* Red-500 */
  }
  .rbc-event.status-due-soon {
    border-left-color: #f59e0b !important; /* Amber-500 */
  }
  .rbc-event.status-normal {
    border-left-color: #10b981 !important; /* Emerald-500 */
  }
  .rbc-event.status-completed {
    border-left-color: #9ca3af !important; /* Gray-400 */
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
  /* Weekend: slightly lighter text */
  .rbc-off-range-bg {
    background-color: #fafafa !important;
  }
  .rbc-off-range .rbc-date-cell > a {
    color: #d1d5db !important;
  }
  /* Event icon styling: emoji opacity 60% via span wrapper */
  .rbc-event-content {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
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
  currentDate?: Date;
  onNavigate?: (date: Date) => void;
  currentView?: ExtendedView;
  onViewChange?: (view: ExtendedView) => void;
}

export default function CalendarView({
  tasks,
  instruments,
  onSelectEvent,
  onSelectSlot,
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

  // Convert tasks to calendar events
  const events: Event[] = useMemo(() => {
    return tasks
      .filter(
        task => task.scheduled_date || task.due_date || task.personal_due_date
      )
      .map(task => {
        // Use scheduled_date if available, otherwise use due_date or personal_due_date
        const raw =
          task.scheduled_date || task.due_date || task.personal_due_date;
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

        // FIXED: Get instrument icon for visual scanning
        const getInstrumentIcon = (type: string | null | undefined): string => {
          if (!type) return '🎼';
          const t = type.toLowerCase();
          if (t.includes('violin') || t.includes('바이올린')) return '🎻';
          if (t.includes('viola') || t.includes('비올라')) return '🎻';
          if (t.includes('cello') || t.includes('첼로')) return '🎻';
          if (t.includes('bass') || t.includes('베이스')) return '🎻';
          if (t.includes('bow') || t.includes('활')) return '🏹';
          return '🎼';
        };

        // FIXED: Improved text hierarchy - prioritize task type and instrument
        // Format: "🎻 [Instrument] Task Type" with better visual scanning
        let eventTitle = task.title;
        const icon = getInstrumentIcon(instrumentType);

        // Extract task type from title (common patterns: "복원", "교체", "점검", etc.)
        const taskTypePatterns = [
          /(복원|restoration)/i,
          /(교체|replace|replacement)/i,
          /(점검|inspection|check)/i,
          /(수리|repair)/i,
          /(조율|tuning)/i,
        ];

        let taskType = '';
        let taskDescription = eventTitle;
        for (const pattern of taskTypePatterns) {
          const match = eventTitle.match(pattern);
          if (match) {
            taskType = match[1];
            taskDescription = eventTitle.replace(pattern, '').trim();
            break;
          }
        }

        if (instrumentType) {
          // Format: "🎻 [Instrument] Task Type" or "🎻 [Instrument] Task Description"
          const instrumentPart = instrumentType;
          const taskPart =
            taskType ||
            (taskDescription.length > 12
              ? `${taskDescription.slice(0, 10)}...`
              : taskDescription);
          // Icon emoji is included in title - CSS will style it
          eventTitle = `${icon} ${instrumentPart} · ${taskPart}`;
        } else {
          // No instrument: just show task
          const displayTitle = taskType || taskDescription;
          if (displayTitle.length > 20) {
            eventTitle = `${displayTitle.slice(0, 18)}...`;
          } else {
            eventTitle = displayTitle;
          }
        }

        const event: Event = {
          title: eventTitle,
          start: start,
          end: endDate,
          resource: task,
        };

        return event;
      })
      .filter((event): event is Event => event !== null);
  }, [tasks, instruments]);

  // FIXED: Lightweight event style - white background with left color bar
  const eventStyleGetter = useCallback(
    (event: Event) => {
      const task = event.resource as MaintenanceTask;
      const dateStatus = getDateStatus(task);
      const isOverdue = dateStatus.status === 'overdue';
      const isDueSoon =
        dateStatus.status === 'upcoming' && dateStatus.days <= 3;
      const isCompleted = task.status === 'completed';

      // Determine status class for CSS-based left border color
      let statusClass = 'status-normal';
      if (isCompleted) {
        statusClass = 'status-completed';
      } else if (isOverdue) {
        statusClass = 'status-overdue';
      } else if (isDueSoon) {
        statusClass = 'status-due-soon';
      }

      // Professional card style: white background with border
      // Icon is already included in eventTitle, so no need for separate icon styling
      const style: React.CSSProperties = {
        backgroundColor: '#ffffff',
        color: '#111827', // Gray-900
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        padding: '6px 8px',
        fontSize: '11px',
        fontWeight: '400',
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04)',
        cursor: 'pointer',
        opacity: isCompleted ? 0.7 : 1,
        textDecoration: isCompleted ? 'line-through' : 'none',
      };

      return {
        style,
        className: `rbc-event ${statusClass}`,
      };
    },
    [] // getDateStatus is a stable imported function
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
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%', minHeight: '750px' }}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={event => {
            if (onSelectEvent && event.resource) {
              onSelectEvent(event.resource as MaintenanceTask);
            }
          }}
          onSelectSlot={onSelectSlot}
          selectable
          date={currentDate}
          onNavigate={onNavigate}
          view={view as View}
          onView={(newView: View) => {
            // Handle standard react-big-calendar views (day view not supported)
            if (
              newView === 'month' ||
              newView === 'week' ||
              newView === 'agenda'
            ) {
              handleViewChange(newView);
            }
          }}
          views={['month', 'week', 'agenda']}
          messages={messages}
          popup
          showMultiDayTimes
          step={60}
          timeslots={1}
          culture="ko"
          components={{
            event: ({ event }) => {
              // Custom event component to style icon with opacity 60%
              const title =
                typeof event.title === 'string'
                  ? event.title
                  : String(event.title || '');
              // Match emoji icon at start of title
              const iconMatch = title.match(
                /^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/u
              );
              if (iconMatch) {
                const icon = iconMatch[0];
                const rest = title.slice(icon.length).trim();
                return (
                  <div
                    className="rbc-event-content"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span
                      style={{
                        opacity: 0.6,
                        fontSize: '12px',
                        lineHeight: '1',
                      }}
                    >
                      {icon}
                    </span>
                    <span>{rest}</span>
                  </div>
                );
              }
              return <div className="rbc-event-content">{title}</div>;
            },
          }}
        />
      </div>
    </>
  );
}
