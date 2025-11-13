'use client';

import React, { useEffect, useState } from 'react';
import {
  MaintenanceTask,
  Instrument,
  Client,
  TaskType,
  TaskStatus,
  TaskPriority,
} from '@/types';
import { classNames } from '@/utils/classNames';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';

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
  const [formData, setFormData] = useState({
    instrument_id: '',
    client_id: '',
    task_type: 'repair' as TaskType,
    title: '',
    description: '',
    status: 'pending' as TaskStatus,
    received_date: new Date().toISOString().split('T')[0],
    due_date: '',
    personal_due_date: '',
    scheduled_date: '',
    completed_date: '',
    priority: 'medium' as TaskPriority,
    estimated_hours: '',
    actual_hours: '',
    cost: '',
    notes: '',
  });

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
      setFormData({
        instrument_id: '',
        client_id: '',
        task_type: 'repair',
        title: '',
        description: '',
        status: 'pending',
        received_date: new Date().toISOString().split('T')[0],
        due_date: '',
        personal_due_date: '',
        scheduled_date: defaultScheduledDate || '',
        completed_date: '',
        priority: 'medium',
        estimated_hours: '',
        actual_hours: '',
        cost: '',
        notes: '',
      });
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
    const completedDate =
      isNowCompleted && !wasCompleted
        ? new Date().toISOString().split('T')[0]
        : selectedTask?.completed_date || null;

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

    await onSubmit(taskData);
  };

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
      className="fixed inset-0 bg-gray-900 bg-opacity-20 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-blue-50">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg
                  className="w-6 h-6 text-blue-600"
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
              </div>
              <h3
                id="task-modal-title"
                className="text-xl font-semibold text-gray-900"
              >
                {isEditing ? 'Edit Task' : 'Add New Task'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors duration-200"
              aria-label="Close modal"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]"
        >
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
                value={formData.instrument_id}
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
                      {status.replace('_', ' ').charAt(0).toUpperCase() +
                        status.replace('_', ' ').slice(1)}
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
          <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-100 bg-gray-50 -mx-6 -mb-6 px-6 py-4">
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
