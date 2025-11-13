'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useModalState } from '@/hooks/useModalState';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';
import CalendarView, { ExtendedView } from './components/CalendarView';
import TaskModal from './components/TaskModal';
import GroupedTaskList from './components/GroupedTaskList';
import Button from '@/components/common/Button';
import { MaintenanceTask, Client } from '@/types';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, addWeeks } from 'date-fns';

export default function CalendarPage() {
  const { ErrorToasts, handleError } = useErrorHandler();
  const { instruments, clients } = useUnifiedData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [calendarView, setCalendarView] = useState<ExtendedView>('month');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOwnership, setFilterOwnership] = useState<string>('all');
  
  // 에러 상태 관리
  const [hasTableError, setHasTableError] = useState(false);

  const {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    fetchTasksByDateRange,
    fetchTasksByScheduledDate,
  } = useMaintenanceTasks();

  const {
    isOpen: showModal,
    isEditing,
    openModal,
    closeModal,
    openEditModal,
    selectedItem: selectedTask,
  } = useModalState<MaintenanceTask>();

  const [modalDefaultDate, setModalDefaultDate] = useState<string>('');

  // Helper function to get date range based on current view
  const getDateRangeForView = useCallback((view: ExtendedView, date: Date) => {
    if (view === 'year') {
      const yearStart = startOfYear(date);
      const yearEnd = endOfYear(date);
      return {
        startDate: format(yearStart, 'yyyy-MM-dd'),
        endDate: format(yearEnd, 'yyyy-MM-dd'),
      };
    } else if (view === 'timeline') {
      const weekStart = startOfWeek(date);
      const weekBefore = addWeeks(weekStart, -2);
      const weekAfter = addWeeks(weekStart, 2);
      return {
        startDate: format(weekBefore, 'yyyy-MM-dd'),
        endDate: format(endOfWeek(weekAfter), 'yyyy-MM-dd'),
      };
    } else if (view === 'week') {
      const weekStart = startOfWeek(date);
      const weekEnd = endOfWeek(date);
      return {
        startDate: format(weekStart, 'yyyy-MM-dd'),
        endDate: format(weekEnd, 'yyyy-MM-dd'),
      };
    } else if (view === 'day') {
      const dateStr = format(date, 'yyyy-MM-dd');
      return {
        startDate: dateStr,
        endDate: dateStr,
      };
    } else {
      // Default: month or agenda
      return {
        startDate: format(startOfMonth(date), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(date), 'yyyy-MM-dd'),
      };
    }
  }, []);

  // Fetch tasks based on current view
  useEffect(() => {
    const { startDate, endDate } = getDateRangeForView(calendarView, currentDate);
    
    fetchTasksByDateRange(startDate, endDate).catch((error) => {
      // 테이블이 없을 수 있는 경우 처리
      const supabaseError = error as { code?: string; message?: string };
      const errorCode = supabaseError?.code;
      const errorMessage = supabaseError?.message || '';
      
      if (errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
        setHasTableError(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, calendarView, getDateRangeForView]);

  // Fetch tasks for selected date - useCallback으로 메모이제이션
  const loadSelectedDateTasks = useCallback(() => {
    if (selectedDate && view === 'list') {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      fetchTasksByScheduledDate(dateStr);
    }
  }, [selectedDate, view, fetchTasksByScheduledDate]);

  useEffect(() => {
    loadSelectedDateTasks();
  }, [loadSelectedDateTasks]);

  // Create instruments map for quick lookup with client info
  const instrumentsMap = useMemo(() => {
    const map = new Map<string, { 
      type: string | null; 
      maker: string | null; 
      ownership: string | null;
      clientId?: string | null;
      clientName?: string | null;
    }>();
    
    // Create client map for ownership lookup
    const clientMap = new Map<string, Client>();
    clients.forEach(client => {
      const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim();
      if (fullName) {
        clientMap.set(fullName, client);
      }
    });
    
    instruments.forEach(instrument => {
      // Try to find matching client by ownership name
      const ownership = instrument.ownership;
      let clientId: string | null = null;
      let clientName: string | null = null;
      
      if (ownership) {
        const client = clientMap.get(ownership);
        if (client) {
          clientId = client.id;
          clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim();
        }
      }
      
      map.set(instrument.id, {
        type: instrument.type,
        maker: instrument.maker,
        ownership: instrument.ownership,
        clientId: clientId || null,
        clientName: clientName || null,
      });
    });
    return map;
  }, [instruments, clients]);

  // Create clients map for quick lookup
  const clientsMap = useMemo(() => {
    const map = new Map<string, { 
      firstName: string;
      lastName: string;
      email?: string | null;
    }>();
    
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

  // Filter tasks based on status and ownership
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    
    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(task => task.status === filterStatus);
    }
    
    // Filter by ownership
    if (filterOwnership !== 'all') {
      filtered = filtered.filter(task => {
        const instrument = task.instrument_id ? instrumentsMap.get(task.instrument_id) : undefined;
        return instrument?.ownership === filterOwnership;
      });
    }
    
    return filtered;
  }, [tasks, filterStatus, filterOwnership, instrumentsMap]);

  // Handle task creation
  const handleCreateTask = async (
    taskData: Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'>
  ) => {
    try {
      await createTask(taskData);
      closeModal();
      // Refresh tasks based on current view
      const { startDate, endDate } = getDateRangeForView(calendarView, currentDate);
      await fetchTasksByDateRange(startDate, endDate);
    } catch (error) {
      handleError(error, 'Failed to create task');
    }
  };

  // Handle task update
  const handleUpdateTask = async (
    taskData: Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'>
  ) => {
    if (!selectedTask) return;
    try {
      await updateTask(selectedTask.id, taskData);
      closeModal();
      // Refresh tasks based on current view
      const { startDate, endDate } = getDateRangeForView(calendarView, currentDate);
      await fetchTasksByDateRange(startDate, endDate);
    } catch (error) {
      handleError(error, 'Failed to update task');
    }
  };

  // Handle task deletion
  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      // Refresh tasks based on current view
      const { startDate, endDate } = getDateRangeForView(calendarView, currentDate);
      await fetchTasksByDateRange(startDate, endDate);
    } catch (error) {
      handleError(error, 'Failed to delete task');
    }
  };

  // Handle calendar event selection
  const handleSelectEvent = (task: MaintenanceTask) => {
    openEditModal(task);
  };

  // Handle calendar slot selection (for creating new tasks)
  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    setSelectedDate(slotInfo.start);
    setModalDefaultDate(format(slotInfo.start, 'yyyy-MM-dd'));
    openModal();
  };

  // Handle task click in list
  const handleTaskClick = (task: MaintenanceTask) => {
    openEditModal(task);
  };

  // 테이블이 없을 때 표시할 메시지
  if (hasTableError) {
    return (
      <ErrorBoundary>
        <AppLayout title="Calendar">
          <div className="p-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">
                데이터베이스 테이블이 없습니다
              </h2>
              <p className="text-yellow-700 mb-4">
                캘린더 기능을 사용하려면 <code className="bg-yellow-100 px-2 py-1 rounded">maintenance_tasks</code> 테이블이 필요합니다.
              </p>
              <div className="text-left bg-white p-4 rounded border border-yellow-200 mb-4">
                <p className="font-semibold mb-2">해결 방법:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>
                    Supabase 대시보드 접속:{' '}
                    <a
                      href="https://supabase.com/dashboard/project/dmilmlhquttcozxlpfxw/sql/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      SQL Editor 열기
                    </a>
                  </li>
                  <li>
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      migration-maintenance-tasks.sql
                    </code>{' '}
                    파일 내용 복사
                  </li>
                  <li>SQL Editor에 붙여넣기 후 Run 클릭</li>
                  <li>페이지 새로고침</li>
                </ol>
              </div>
              <Button onClick={() => window.location.reload()} className="mt-4">
                페이지 새로고침
              </Button>
            </div>
          </div>
        </AppLayout>
        <ErrorToasts />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppLayout
        title="Calendar"
        actionButton={{
          label: 'Add Task',
          onClick: () => {
            setModalDefaultDate('');
            openModal();
          },
        }}
      >
        <div className="p-6">
          {/* View Toggle and Filters */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {/* View Toggle */}
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setView('calendar')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      view === 'calendar'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      Calendar
                    </span>
                  </button>
                  <button
                    onClick={() => setView('list')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      view === 'list'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6h16M4 10h16M4 14h16M4 18h16"
                        />
                      </svg>
                      List
                    </span>
                  </button>
                </div>

                {/* Status Filter */}
                <div className="relative">
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="appearance-none px-4 py-2 pr-8 border border-gray-200 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Ownership Filter */}
                {ownershipOptions.length > 0 && (
                  <div className="relative">
                    <select
                      value={filterOwnership}
                      onChange={e => setFilterOwnership(e.target.value)}
                      className="appearance-none px-4 py-2 pr-8 border border-gray-200 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                    >
                      <option value="all">All Owners</option>
                      {ownershipOptions.map(ownership => (
                        <option key={ownership} value={ownership}>
                          {ownership}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <svg
                        className="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Task Count */}
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <span>
                  {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Calendar or List View */}
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                  <div className="text-gray-500 text-sm">Loading tasks...</div>
                </div>
              </div>
            </div>
          ) : view === 'calendar' ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" style={{ minHeight: '700px' }}>
              <CalendarView
                tasks={filteredTasks}
                instruments={instrumentsMap}
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                currentDate={currentDate}
                onNavigate={setCurrentDate}
                currentView={calendarView}
                onViewChange={(view: ExtendedView) => {
                  setCalendarView(view);
                }}
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="p-6 border-b border-gray-100">
                {selectedDate ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Tasks for {format(selectedDate, 'MMMM d, yyyy')}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {format(selectedDate, 'EEEE')}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                    >
                      Show all tasks
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">All Tasks</h3>
                    {filteredTasks.length > 0 && (
                      <span className="text-sm text-gray-500">
                        {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="p-6">
                <GroupedTaskList
                  tasks={filteredTasks}
                  instruments={instrumentsMap}
                  clients={clientsMap}
                  onTaskClick={handleTaskClick}
                  onTaskDelete={handleDeleteTask}
                />
              </div>
            </div>
          )}

          {/* Task Modal */}
          <TaskModal
            isOpen={showModal}
            onClose={() => {
              closeModal();
              setModalDefaultDate('');
            }}
            onSubmit={isEditing ? handleUpdateTask : handleCreateTask}
            submitting={loading}
            selectedTask={selectedTask}
            isEditing={isEditing}
            instruments={instruments}
            clients={clients}
            defaultScheduledDate={modalDefaultDate}
          />

          {/* Error Toasts */}
          <ErrorToasts />
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
}

