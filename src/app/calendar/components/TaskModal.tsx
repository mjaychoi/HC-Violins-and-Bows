'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  MaintenanceTask,
  Instrument,
  Client,
  TaskType,
  TaskStatus,
  TaskPriority,
} from '@/types';
import { classNames } from '@/utils/classNames';
import { Button, Input } from '@/components/common/inputs';
import { todayLocalYMD } from '@/utils/dateParsing';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import { modalStyles } from '@/components/common/modals/modalStyles';
import { ModalHeader } from '@/components/common/modals/ModalHeader';
import { getStatusLabel } from '@/utils/calendar';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    task: Omit<
      MaintenanceTask,
      'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
    >
  ) => Promise<void>;
  submitting: boolean;
  selectedTask?: MaintenanceTask | null;
  isEditing?: boolean;
  instruments: Instrument[];
  clients: Client[];
  defaultScheduledDate?: string;
}

type TaskFormState = {
  instrument_id: string | null;
  client_id: string;
  task_type: TaskType;
  title: string;
  description: string;
  status: TaskStatus;
  received_date: string;
  due_date: string;
  personal_due_date: string;
  scheduled_date: string;
  completed_date: string;
  priority: TaskPriority;
  estimated_hours: string;
  actual_hours: string;
  cost: string;
  notes: string;
};

function createEmptyFormState(scheduledDate = ''): TaskFormState {
  return {
    instrument_id: '',
    client_id: '',
    task_type: 'repair',
    title: '',
    description: '',
    status: 'pending',
    received_date: todayLocalYMD(),
    due_date: '',
    personal_due_date: '',
    scheduled_date: scheduledDate,
    completed_date: '',
    priority: 'medium',
    estimated_hours: '',
    actual_hours: '',
    cost: '',
    notes: '',
  };
}

export default function TaskModal({
  isOpen,
  onClose,
  onSubmit,
  submitting,
  selectedTask,
  isEditing = false,
  instruments,
  clients,
  defaultScheduledDate = '',
}: TaskModalProps) {
  const [formData, setFormData] = useState<TaskFormState>(() =>
    createEmptyFormState()
  );

  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (selectedTask && isEditing) {
      setFormData({
        instrument_id: selectedTask.instrument_id,
        client_id: selectedTask.client_id || '',
        task_type: selectedTask.task_type,
        title: selectedTask.title,
        description: selectedTask.description || '',
        status: selectedTask.status,
        received_date: selectedTask.received_date,
        due_date: selectedTask.due_date || '',
        personal_due_date: selectedTask.personal_due_date || '',
        scheduled_date: selectedTask.scheduled_date || '',
        priority: selectedTask.priority,
        estimated_hours: selectedTask.estimated_hours?.toString() || '',
        actual_hours: selectedTask.actual_hours?.toString() || '',
        cost: selectedTask.cost?.toString() || '',
        notes: selectedTask.notes || '',
        completed_date: selectedTask.completed_date || '',
      });
    } else {
      // Reset form for new task
      // FIXED: Use todayLocalYMD() instead of toISOString() to avoid UTC timezone issues
      setFormData(createEmptyFormState(defaultScheduledDate || ''));
    }
    setErrors([]);
  }, [selectedTask, isEditing, isOpen, defaultScheduledDate]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    // Validation
    const newErrors: string[] = [];
    if (!formData.instrument_id) {
      newErrors.push('Instrument is required');
    }
    if (!formData.title.trim()) {
      newErrors.push('Title is required');
    }
    if (!formData.received_date) {
      newErrors.push('Received date is required');
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    // Prepare task data
    // Set completed_date if status is completed and it wasn't already completed
    const wasCompleted = selectedTask?.status === 'completed';
    const isNowCompleted = formData.status === 'completed';
    // FIXED: Use todayLocalYMD() instead of toISOString() to avoid UTC timezone issues
    // FIXED: If user switches status away from completed, set completed_date to null
    const completedDate =
      isNowCompleted && !wasCompleted
        ? todayLocalYMD()
        : isNowCompleted
          ? selectedTask?.completed_date || todayLocalYMD()
          : null;

    const taskData: Omit<
      MaintenanceTask,
      'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
    > = {
      instrument_id: formData.instrument_id,
      client_id: formData.client_id || null,
      task_type: formData.task_type,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      status: formData.status,
      received_date: formData.received_date,
      due_date: formData.due_date || null,
      personal_due_date: formData.personal_due_date || null,
      scheduled_date: formData.scheduled_date || null,
      completed_date: completedDate,
      priority: formData.priority,
      estimated_hours: (() => {
        const val = formData.estimated_hours?.trim();
        if (!val) return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      })(),
      actual_hours: (() => {
        const val = formData.actual_hours?.trim();
        if (!val) return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      })(),
      cost: (() => {
        const val = formData.cost?.trim();
        if (!val) return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      })(),
      notes: formData.notes.trim() || null,
    };

    try {
      await onSubmit(taskData);
    } catch (error) {
      // Show error in modal for better UX
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to save task. Please try again.';
      setErrors([errorMessage]);
    }
  };

  // Close modal with ESC key and outside click
  const modalRef = useRef<HTMLDivElement>(null);
  useOutsideClose(modalRef, {
    isOpen,
    onClose,
  });

  if (!isOpen) return null;

  const taskTypes: TaskType[] = [
    'repair',
    'rehair',
    'maintenance',
    'inspection',
    'setup',
    'adjustment',
    'restoration',
  ];
  const taskStatuses: TaskStatus[] = [
    'pending',
    'in_progress',
    'completed',
    'cancelled',
  ];
  const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

  return (
    <div
      className={modalStyles.overlay}
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={`${modalStyles.container} max-w-3xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <ModalHeader
          title={isEditing ? 'Edit Task' : 'Add New Task'}
          icon="task"
          onClose={onClose}
          titleId="task-modal-title"
        />

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className={modalStyles.formBody}>
          {errors.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <ul className="list-disc list-inside text-sm text-red-600">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            {/* Instrument Selection */}
            <div>
              <label className={classNames.formLabel}>
                Instrument/Bow <span className="text-red-500">*</span>
              </label>
              <select
                name="instrument_id"
                value={formData.instrument_id ?? ''}
                onChange={handleInputChange}
                className={classNames.input}
                required
              >
                <option value="">Select an instrument</option>
                {instruments.map(instrument => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.type || 'Unknown'} -{' '}
                    {instrument.maker || 'Unknown Maker'}
                    {instrument.ownership ? ` (${instrument.ownership})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Client Selection */}
            <div>
              <label className={classNames.formLabel}>Client (Optional)</label>
              <select
                name="client_id"
                value={formData.client_id}
                onChange={handleInputChange}
                className={classNames.input}
              >
                <option value="">Select a client (optional)</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.first_name} {client.last_name}
                    {client.email ? ` (${client.email})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Task Type */}
            <div>
              <label className={classNames.formLabel}>
                Task Type <span className="text-red-500">*</span>
              </label>
              <select
                name="task_type"
                value={formData.task_type}
                onChange={handleInputChange}
                className={classNames.input}
                required
              >
                {taskTypes.map(type => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <Input
              label="Title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Enter task title"
              required
            />

            {/* Description */}
            <div>
              <label className={classNames.formLabel}>Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className={classNames.input}
                placeholder="Enter task description"
              />
            </div>

            {/* Status and Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={classNames.formLabel}>Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className={classNames.input}
                >
                  {taskStatuses.map(status => (
                    <option key={status} value={status}>
                      {getStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={classNames.formLabel}>Priority</label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className={classNames.input}
                >
                  {priorities.map(priority => (
                    <option key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={classNames.formLabel}>
                  Received Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="received_date"
                  value={formData.received_date}
                  onChange={handleInputChange}
                  className={classNames.input}
                  required
                />
              </div>

              <div>
                <label className={classNames.formLabel}>
                  Due Date (Customer)
                </label>
                <input
                  type="date"
                  name="due_date"
                  value={formData.due_date}
                  onChange={handleInputChange}
                  className={classNames.input}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={classNames.formLabel}>
                  Personal Due Date
                </label>
                <input
                  type="date"
                  name="personal_due_date"
                  value={formData.personal_due_date}
                  onChange={handleInputChange}
                  className={classNames.input}
                />
              </div>

              <div>
                <label className={classNames.formLabel}>Scheduled Date</label>
                <input
                  type="date"
                  name="scheduled_date"
                  value={formData.scheduled_date}
                  onChange={handleInputChange}
                  className={classNames.input}
                />
              </div>
            </div>

            {/* Hours and Cost */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={classNames.formLabel}>Estimated Hours</label>
                <input
                  type="number"
                  name="estimated_hours"
                  value={formData.estimated_hours}
                  onChange={handleInputChange}
                  className={classNames.input}
                  step="0.5"
                  min="0"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className={classNames.formLabel}>Actual Hours</label>
                <input
                  type="number"
                  name="actual_hours"
                  value={formData.actual_hours}
                  onChange={handleInputChange}
                  className={classNames.input}
                  step="0.5"
                  min="0"
                  placeholder="0.0"
                />
              </div>

              <div>
                <label className={classNames.formLabel}>Cost</label>
                <input
                  type="number"
                  name="cost"
                  value={formData.cost}
                  onChange={handleInputChange}
                  className={classNames.input}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={classNames.formLabel}>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows={3}
                className={classNames.input}
                placeholder="Enter additional notes"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Saving...
                </span>
              ) : isEditing ? (
                'Update Task'
              ) : (
                'Create Task'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
