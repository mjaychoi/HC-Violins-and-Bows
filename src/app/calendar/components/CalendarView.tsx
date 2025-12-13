'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Event, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { addHours } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { MaintenanceTask } from '@/types';
import YearView from './YearView';
import TimelineView from './TimelineView';
import { getCalendarEventStyle, getDateStatus } from '@/utils/tasks/style';
import { parseTaskDate } from '@/utils/tasks/dateUtils';

// Custom styles for calendar events with icons
const calendarEventStyles = `
  .calendar-event-overdue::before {
    content: '⏰';
    margin-right: 4px;
    font-size: 12px;
  }
  .calendar-event-upcoming {
    border-style: dashed !important;
  }
  .calendar-event-completed {
    opacity: 0.7;
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
export type ExtendedView =
  | 'month'
  | 'week'
  | 'agenda'
  | 'year'
  | 'timeline';

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
  onNavigate?: (date: Date, view?: string) => void;
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
  const [internalView, setInternalView] = useState<ExtendedView>(currentView);

  // Update internal view when currentView prop changes
  React.useEffect(() => {
    setInternalView(currentView);
  }, [currentView]);

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
      setInternalView(extendedView);
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
        const dateStr =
          task.scheduled_date || task.due_date || task.personal_due_date;
        if (!dateStr) return null;

        // FIXED: Use parseTaskDate to handle date-only strings correctly (avoid timezone shifts)
        const date = parseTaskDate(dateStr);
        // FIXED: For better visibility in week/agenda view, use 1-hour duration instead of all-day
        // If you want all-day events, use: const endDate = endOfDay(date);
        const endDate = addHours(date, 1);

        // Get instrument info from instruments map if available
        const instrument = task.instrument_id
          ? instruments?.get(task.instrument_id)
          : undefined;
        const instrumentType = instrument?.type;

        // FIXED: Keep title clean for search/filtering; render metadata in custom event component if needed
        // For now, keeping instrument type for context but removing emoji from title
        let eventTitle = task.title;
        if (instrumentType) {
          eventTitle = `${instrumentType} - ${eventTitle}`;
        }
        // Note: Ownership info can be added via custom event component styling instead of title pollution

        const event: Event = {
          title: eventTitle,
          start: date,
          end: endDate,
          resource: task,
        };

        return event;
      })
      .filter((event): event is Event => event !== null);
  }, [tasks, instruments]);

  // FIXED: Memoize eventStyleGetter to prevent recreation on every render
  const eventStyleGetter = useCallback((event: Event) => {
    const task = event.resource as MaintenanceTask;
    const eventStyle = getCalendarEventStyle(task);
    
    // Determine if task is overdue using utility function (instead of hardcoded color check)
    const dateStatus = getDateStatus(task);
    const isOverdue = dateStatus.status === 'overdue';
    const isUpcoming = dateStatus.status === 'upcoming' && dateStatus.days <= 3;
    const isCompleted = task.status === 'completed';

    // Build border style - avoid mixing shorthand and non-shorthand properties
    // If border shorthand is provided, use it; otherwise construct from borderColor
    let borderStyle: React.CSSProperties = {};
    if (eventStyle.border) {
      // Use shorthand border, exclude borderColor to avoid conflict
      borderStyle = { border: eventStyle.border };
    } else if (eventStyle.borderColor) {
      // Construct border from borderColor (avoiding shorthand conflict)
      // Use dashed border for upcoming tasks (within 3 days)
      borderStyle = {
        borderWidth: isOverdue ? '2px' : '1px',
        borderStyle: isUpcoming ? 'dashed' : 'solid',
        borderColor: eventStyle.borderColor,
      };
    } else {
      borderStyle = { border: 'none' };
    }

    // Build className for CSS-based icon styling
    const classNames: string[] = [];
    if (isOverdue) {
      classNames.push('calendar-event-overdue');
    }
    if (isUpcoming) {
      classNames.push('calendar-event-upcoming');
    }
    if (isCompleted) {
      classNames.push('calendar-event-completed');
    }

    // Base style properties for calendar events
    const style: React.CSSProperties = {
      backgroundColor: eventStyle.backgroundColor,
      color: eventStyle.color,
      borderRadius: '6px',
      ...borderStyle,
      padding: '4px 8px',
      fontSize: '12px',
      fontWeight: eventStyle.textDecoration ? '500' : '500',
      boxShadow:
        task.status === 'completed'
          ? '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
          : isOverdue
          ? '0 2px 4px 0 rgba(220, 38, 38, 0.4)'
          : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      cursor: 'pointer',
      opacity: eventStyle.opacity ?? 1,
      position: isOverdue ? 'relative' : 'static', // Visual indicator for overdue
      textDecoration: eventStyle.textDecoration,
    };

    // Additional styling for overdue tasks
    if (isOverdue) {
      style.fontWeight = '700';
      // If using individual border properties, update them
      if (!eventStyle.border) {
        style.borderWidth = '2px';
      }
    }

    return {
      style,
      className: classNames.join(' '),
    };
  }, []);

  // FIXED: Translate messages to Korean to match culture="ko"
  const messages = useMemo(() => ({
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
  }), []);

  // Render custom views
  if (internalView === 'year' || internalView === 'timeline') {
    if (internalView === 'year') {
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

    if (internalView === 'timeline') {
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
        style={{ height: '800px', minHeight: '800px', padding: '1rem', paddingBottom: '1.5rem' }}
      >
        <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%', minHeight: '700px' }}
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
        view={internalView as View}
        onView={(view: View) => {
          // Handle standard react-big-calendar views (day view not supported)
          if (
            view === 'month' ||
            view === 'week' ||
            view === 'agenda'
          ) {
            handleViewChange(view);
          }
        }}
        views={['month', 'week', 'agenda']}
        messages={messages}
        popup
        showMultiDayTimes
        step={60}
        timeslots={1}
        culture="ko"
      />
      </div>
    </>
  );
}
