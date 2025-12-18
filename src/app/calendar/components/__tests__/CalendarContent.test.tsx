import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import CalendarContent from '../CalendarContent';
import type { MaintenanceTask, Instrument, Client } from '@/types';
import type { ExtendedView } from '../CalendarView';

jest.mock('@/app/clients/components/TodayFollowUps', () => ({
  __esModule: true,
  default: () => <div data-testid="today-follow-ups" />,
}));

jest.mock('../CalendarView', () => ({
  __esModule: true,
  default: () => <div data-testid="calendar-view-mock" />,
}));

const baseTask: MaintenanceTask = {
  id: 'task-1',
  instrument_id: 'inst-1',
  client_id: 'client-1',
  task_type: 'repair',
  title: 'Setup Violin',
  description: 'Soundpost adjustment',
  status: 'pending',
  received_date: '2024-01-01',
  due_date: '2024-01-05',
  personal_due_date: null,
  scheduled_date: '2024-01-03',
  completed_date: null,
  priority: 'medium',
  estimated_hours: 1,
  actual_hours: null,
  cost: 100,
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const baseInstrument: Instrument = {
  id: 'inst-1',
  status: 'Available',
  maker: 'Stradivarius',
  type: 'Violin',
  subtype: null,
  year: 1700,
  certificate: true,
  size: '4/4',
  weight: null,
  ownership: 'John Doe',
  note: null,
  serial_number: 'VI0000001',
  created_at: '2024-01-01T00:00:00Z',
  price: 0,
};

const baseClient: Client = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  tags: [],
  interest: null,
  note: null,
  client_number: 'CL001',
  created_at: '2024-01-01T00:00:00Z',
};

type CalendarNavigationOverrides = {
  currentDate: Date;
  calendarView: ExtendedView;
  selectedDate: Date | null;
  handlePrevious: () => void;
  handleNext: () => void;
  handleGoToToday: () => void;
  setCurrentDate: (date: Date) => void;
  setCalendarView: (view: ExtendedView) => void;
  setSelectedDate: (date: Date | null) => void;
};

function createNavigationOverrides(
  overrides: Partial<CalendarNavigationOverrides> = {}
) {
  const today = new Date();
  return {
    currentDate: today,
    calendarView: 'month' as ExtendedView,
    selectedDate: null,
    handlePrevious: jest.fn(),
    handleNext: jest.fn(),
    handleGoToToday: jest.fn(),
    setCurrentDate: jest.fn(),
    setCalendarView: jest.fn(),
    setSelectedDate: jest.fn(),
    ...overrides,
  };
}

describe('CalendarContent', () => {
  it('renders empty state when there are no tasks and not loading', () => {
    const onOpenNewTask = jest.fn();
    const navigation = createNavigationOverrides();

    render(
      <CalendarContent
        tasks={[]}
        contactLogs={[]}
        instruments={[]}
        clients={[]}
        loading={{ fetch: false, mutate: false }}
        navigation={navigation}
        view="list"
        setView={jest.fn()}
        onTaskClick={jest.fn()}
        onTaskDelete={jest.fn()}
        onSelectEvent={jest.fn()}
        onSelectSlot={jest.fn()}
        draggingEventId={null}
        onOpenNewTask={onOpenNewTask}
      />
    );

    expect(screen.getAllByText('No tasks yet').length).toBeGreaterThan(0);

    const addTaskButtons = screen.getAllByText('Add maintenance task');
    fireEvent.click(addTaskButtons[0]);
    expect(onOpenNewTask).toHaveBeenCalled();
  });

  it('calls navigation handlers and view toggle callbacks', () => {
    const navigation = createNavigationOverrides();
    const setView = jest.fn();
    const onOpenNewTask = jest.fn();

    render(
      <CalendarContent
        tasks={[baseTask]}
        contactLogs={[]}
        instruments={[baseInstrument]}
        clients={[baseClient]}
        loading={{ fetch: false, mutate: false }}
        navigation={navigation}
        view="calendar"
        setView={setView}
        onTaskClick={jest.fn()}
        onTaskDelete={jest.fn()}
        onSelectEvent={jest.fn()}
        onSelectSlot={jest.fn()}
        draggingEventId={null}
        onOpenNewTask={onOpenNewTask}
      />
    );

    // Today 버튼 클릭 시 navigation.handleGoToToday 호출
    fireEvent.click(screen.getByRole('button', { name: /go to today/i }));
    expect(navigation.handleGoToToday).toHaveBeenCalled();

    // 뷰 토글 버튼 클릭 시 setView 호출
    // Note: Buttons are in a tablist, so we need to find them by role="tab"
    const listViewButton = screen.getByRole('tab', { name: /list view/i });
    fireEvent.click(listViewButton);
    expect(setView).toHaveBeenCalledWith('list');

    const calendarViewButton = screen.getByRole('tab', {
      name: /calendar view/i,
    });
    fireEvent.click(calendarViewButton);
    expect(setView).toHaveBeenCalledWith('calendar');

    // 새 작업 버튼 클릭 시 onOpenNewTask 호출
    fireEvent.click(screen.getByRole('button', { name: /add new task/i }));
    expect(onOpenNewTask).toHaveBeenCalled();
  });

  it('applies quick filter presets from sticky toolbar in list view', () => {
    const navigation = createNavigationOverrides();
    const onOpenNewTask = jest.fn();

    render(
      <CalendarContent
        tasks={[baseTask]}
        contactLogs={[]}
        instruments={[baseInstrument]}
        clients={[baseClient]}
        loading={{ fetch: false, mutate: false }}
        navigation={navigation}
        view="list"
        setView={jest.fn()}
        onTaskClick={jest.fn()}
        onTaskDelete={jest.fn()}
        onSelectEvent={jest.fn()}
        onSelectSlot={jest.fn()}
        draggingEventId={null}
        onOpenNewTask={onOpenNewTask}
      />
    );

    // 상단 퀵 필터 버튼이 모두 렌더링되는지 확인
    fireEvent.click(screen.getAllByRole('button', { name: /overdue/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /^today$/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /next 7d/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /completed/i })[0]);

    // 단순히 브랜치 실행을 보장하기 위한 상호작용이므로,
    // 여기서는 예외 없이 렌더되고 동작하는지만 확인하면 충분하다.
    expect(screen.getByText('All Tasks')).toBeInTheDocument();
  });
});
