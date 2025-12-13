'use client';

import React from 'react';
import type { MaintenanceTask } from '@/types';
import { formatDate } from '@/utils/formatUtils';
import {
  getPriorityPillClasses,
  getStatusColorClasses,
} from '@/utils/tasks/style';
import { EmptyTaskState } from '@/components/tasks/EmptyTaskState';

interface TaskListProps {
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
  onTaskClick?: (task: MaintenanceTask) => void;
  onTaskDelete?: (task: MaintenanceTask) => void;
}

export default function TaskList({
  tasks,
  instruments,
  onTaskClick,
  onTaskDelete,
}: TaskListProps) {
  if (tasks.length === 0) {
    return <EmptyTaskState />;
  }

  return (
    <div className="space-y-3">
      {tasks.map(task => {
        const instrument = task.instrument_id
          ? instruments?.get(task.instrument_id)
          : undefined;

        return (
          <div
            key={task.id}
            className="group bg-white border border-slate-100 rounded-lg p-4 hover:border-blue-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
            onClick={() => onTaskClick?.(task)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="shrink-0 mt-1">
                    {/* Status indicator dot - uses status color for consistency with pills */}
                    <div
                      className={`w-2 h-2 rounded-full ${
                        task.status === 'in_progress'
                          ? 'bg-blue-500'
                          : task.status === 'completed' ||
                              task.status === 'cancelled'
                            ? 'bg-slate-400'
                            : 'bg-slate-400'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h4 className="font-semibold text-gray-900 text-base">
                        {task.title}
                      </h4>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPriorityPillClasses(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColorClasses(
                          task.status
                        )}`}
                      >
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Instrument Info */}
                    {instrument && (
                      <div className="flex items-center gap-2 flex-wrap text-sm mb-2">
                        <div className="flex items-center gap-2 text-gray-600">
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
                              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                            />
                          </svg>
                          <span className="font-medium">
                            {instrument.type || 'Unknown'}
                          </span>
                          {instrument.maker && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span>{instrument.maker}</span>
                            </>
                          )}
                        </div>
                        {instrument.ownership && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            <span>{instrument.ownership}</span>
                            {instrument.clientName &&
                              instrument.clientName !==
                                instrument.ownership && (
                                <span className="text-blue-500">
                                  ({instrument.clientName})
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Task Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
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
                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                          />
                        </svg>
                        <span className="font-medium">Type:</span>
                        <span className="capitalize">{task.task_type}</span>
                      </div>

                      {task.received_date && (
                        <div className="flex items-center gap-2">
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
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="font-medium">Received:</span>
                          <span>{formatDate(task.received_date, 'short')}</span>
                        </div>
                      )}

                      {task.due_date && (
                        <div className="flex items-center gap-2">
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
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span className="font-medium">Due (Customer):</span>
                          <span>{formatDate(task.due_date, 'short')}</span>
                        </div>
                      )}

                      {task.personal_due_date && (
                        <div className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span className="font-medium text-slate-700">
                            Personal Due:
                          </span>
                          <span className="text-slate-700 font-medium">
                            {formatDate(task.personal_due_date, 'short')}
                          </span>
                        </div>
                      )}

                      {task.scheduled_date && (
                        <div className="flex items-center gap-2">
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
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="font-medium">Scheduled:</span>
                          <span>
                            {formatDate(task.scheduled_date, 'short')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {task.description && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {task.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              {onTaskDelete && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onTaskDelete(task);
                  }}
                  className="shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                  aria-label="Delete task"
                  title="Delete task"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
