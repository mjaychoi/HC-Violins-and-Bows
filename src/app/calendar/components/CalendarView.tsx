'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { Calendar, momentLocalizer, Event, View } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ko';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { MaintenanceTask } from '@/types';
import YearView from './YearView';
import TimelineView from './TimelineView';

const localizer = momentLocalizer(moment);

// Extended view type to include custom views
// Only allow specific views we support
export type ExtendedView = 'month' | 'week' | 'day' | 'agenda' | 'year' | 'timeline';

interface CalendarViewProps {
  tasks: MaintenanceTask[];
  instruments?: Map<string, { 
    type: string | null; 
    maker: string | null; 
    ownership: string | null;
    clientId?: string | null;
    clientName?: string | null;
  }>;
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
  
  // Set moment locale
  useEffect(() => {
    moment.locale('ko');
  }, []);

  // Update internal view when currentView prop changes
  useEffect(() => {
    setInternalView(currentView);
  }, [currentView]);

  const handleViewChange = (view: View | ExtendedView) => {
    // Type guard: only accept views that are in our ExtendedView type
    const validViews: ExtendedView[] = ['month', 'week', 'day', 'agenda', 'year', 'timeline'];
    if (validViews.includes(view as ExtendedView)) {
      const extendedView = view as ExtendedView;
      setInternalView(extendedView);
      onViewChange?.(extendedView);
    }
  };

  // Convert tasks to calendar events
  const events: Event[] = useMemo(() => {
    return tasks
      .filter(task => task.scheduled_date || task.due_date || task.personal_due_date)
      .map(task => {
        // Use scheduled_date if available, otherwise use due_date or personal_due_date
        const dateStr = task.scheduled_date || task.due_date || task.personal_due_date;
        if (!dateStr) return null;

        const date = moment(dateStr).toDate();
        const endDate = moment(dateStr).endOf('day').toDate();

        // Get instrument info from instruments map if available
        const instrument = task.instrument_id ? instruments?.get(task.instrument_id) : undefined;
        const ownership = instrument?.ownership;
        const instrumentType = instrument?.type || 'Unknown';
        
        // Build event title with ownership badge
        let eventTitle = task.title;
        if (ownership) {
          // Add ownership with icon indicator
          eventTitle = `${task.title} 👤 ${ownership}`;
        }
        
        // Add instrument type if available
        if (instrumentType !== 'Unknown') {
          eventTitle = `${instrumentType} - ${eventTitle}`;
        }

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

  // Enhanced event style getter with improved colors and overdue/upcoming indicators
  const eventStyleGetter = (event: Event) => {
    const task = event.resource as MaintenanceTask;
    const now = new Date();
    
    // Check if task is overdue
    let isOverdue = false;
    let isUpcoming = false;
    let targetDate: Date | null = null;
    
    if (task.due_date) {
      targetDate = new Date(task.due_date);
    } else if (task.personal_due_date) {
      targetDate = new Date(task.personal_due_date);
    } else if (task.scheduled_date) {
      targetDate = new Date(task.scheduled_date);
    }
    
    if (targetDate && task.status !== 'completed' && task.status !== 'cancelled') {
      const daysDiff = Math.floor((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      isOverdue = daysDiff < 0;
      isUpcoming = daysDiff >= 0 && daysDiff <= 3;
    }
    
    const style: React.CSSProperties = {
      backgroundColor: '#3b82f6', // Default Blue-500
      borderColor: '#3b82f6',
      color: 'white',
      borderRadius: '6px',
      border: 'none',
      padding: '4px 8px',
      fontSize: '12px',
      fontWeight: '500',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      cursor: 'pointer',
      opacity: task.status === 'cancelled' ? 0.6 : 1,
    };

    if (task) {
      // Overdue tasks - highest priority (red with warning indicator)
      if (isOverdue) {
        style.backgroundColor = '#dc2626'; // Red-600 (stronger red)
        style.borderColor = '#991b1b'; // Red-800 (darker border)
        style.fontWeight = '700';
        style.boxShadow = '0 2px 4px 0 rgba(220, 38, 38, 0.4)';
        style.border = '2px solid';
        // Add a visual indicator for overdue tasks
        style.position = 'relative';
      }
      // Upcoming tasks (within 3 days) - amber/yellow
      else if (isUpcoming) {
        style.backgroundColor = '#f59e0b'; // Amber-500
        style.borderColor = '#d97706'; // Amber-600
        style.fontWeight = '600';
        style.boxShadow = '0 2px 4px 0 rgba(245, 158, 11, 0.3)';
      }
      // Priority-based colors (only if not overdue/upcoming)
      else if (task.priority === 'urgent') {
        style.backgroundColor = '#ef4444'; // Red-500
        style.borderColor = '#dc2626'; // Red-600
        style.fontWeight = '700';
        style.boxShadow = '0 2px 4px 0 rgba(239, 68, 68, 0.3)';
      } else if (task.priority === 'high') {
        style.backgroundColor = '#f97316'; // Orange-500
        style.borderColor = '#ea580c'; // Orange-600
        style.fontWeight = '600';
        style.boxShadow = '0 1px 3px 0 rgba(249, 115, 22, 0.3)';
      } else if (task.priority === 'medium') {
        style.backgroundColor = '#eab308'; // Yellow-500
        style.borderColor = '#ca8a04'; // Yellow-600
        style.fontWeight = '500';
      } else if (task.priority === 'low') {
        style.backgroundColor = '#22c55e'; // Green-500
        style.borderColor = '#16a34a'; // Green-600
        style.fontWeight = '500';
      }
      
      // Status-based colors (override priority for completed/cancelled)
      if (task.status === 'completed') {
        style.backgroundColor = '#10b981'; // Green-500
        style.borderColor = '#059669'; // Green-600
        style.opacity = 0.8;
        style.textDecoration = 'line-through';
      } else if (task.status === 'cancelled') {
        style.backgroundColor = '#6b7280'; // Gray-500
        style.borderColor = '#4b5563'; // Gray-600
        style.opacity = 0.6;
      } else if (task.status === 'in_progress' && !isOverdue && !isUpcoming && task.priority !== 'urgent' && task.priority !== 'high') {
        style.backgroundColor = '#3b82f6'; // Blue-500
        style.borderColor = '#2563eb'; // Blue-600
      } else if (task.status === 'pending' && !isOverdue && !isUpcoming && task.priority !== 'urgent' && task.priority !== 'high') {
        style.backgroundColor = '#f59e0b'; // Amber-500
        style.borderColor = '#d97706'; // Amber-600
      }
    }

    return {
      style,
    };
  };

  // Custom messages for Korean (optional)
  const messages = {
    next: '다음',
    previous: '이전',
    today: '오늘',
    month: '월',
    week: '주',
    day: '일',
    agenda: '일정',
    date: '날짜',
    time: '시간',
    event: '이벤트',
    noEventsInRange: '이 기간에 예정된 작업이 없습니다.',
    showMore: (total: number) => `+${total} more`,
  };

  // Render custom views
  if (internalView === 'year' || internalView === 'timeline') {
    if (internalView === 'year') {
      return (
        <div className="w-full calendar-container" style={{ minHeight: '700px', padding: '1rem' }}>
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
        <div className="w-full calendar-container" style={{ minHeight: '700px', padding: '1rem' }}>
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
    <div className="w-full calendar-container" style={{ height: '700px', minHeight: '700px', padding: '1rem' }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%', minHeight: '600px' }}
        eventPropGetter={eventStyleGetter}
        onSelectEvent={(event) => {
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
          // Only handle standard react-big-calendar views
          if (view === 'month' || view === 'week' || view === 'day' || view === 'agenda') {
            handleViewChange(view);
          }
        }}
        views={['month', 'week', 'day', 'agenda']}
        messages={messages}
        popup
        showMultiDayTimes
        step={60}
        timeslots={1}
        culture="ko"
      />
    </div>
  );
}

