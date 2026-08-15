'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import type {
  MaintenanceTask,
  MaintenanceTaskSubmitPayload,
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
import ConfirmDialog from '@/components/common/modals/ConfirmDialog';
import { getStatusLabel } from '@/utils/calendar';
import { getAllowedMaintenanceTaskNextStatuses } from '@/utils/maintenanceTaskTransitions';
import {
  isMaintenanceTaskStaleVersionError,
  MAINTENANCE_TASK_CONFLICT_MESSAGE,
} from '@/utils/maintenanceTaskConcurrency';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: MaintenanceTaskSubmitPayload) => Promise<void>;
  submitting: boolean;
  selectedTask?: MaintenanceTask | null;
  isEditing?: boolean;
  instruments: Instrument[];
  clients: Client[];
  defaultScheduledDate?: string;
  onFetchLatest?: (id: string) => Promise<MaintenanceTask | null>;
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

// Normalizes an optional text field the same way handleSubmit does
// (trims, empty -> null) so trailing whitespace doesn't register as dirty.
function normalizeOptionalText(
  value: string | null | undefined
): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

// Mirrors the numeric parsing in handleSubmit so "2" and "2.0" compare equal.
function normalizeOptionalNumber(
  value: string | null | undefined
): number | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

// Comparable projection of the editable fields, excluding completed_date
// (not directly editable; it is derived from status at submit time).
function taskToFormState(task: MaintenanceTask): TaskFormState {
  return {
    instrument_id: task.instrument_id,
    client_id: task.client_id || '',
    task_type: task.task_type,
    title: task.title,
    description: task.description || '',
    status: task.status,
    received_date: task.received_date,
    due_date: task.due_date || '',
    personal_due_date: task.personal_due_date || '',
    scheduled_date: task.scheduled_date || '',
    priority: task.priority,
    estimated_hours: task.estimated_hours?.toString() || '',
    actual_hours: task.actual_hours?.toString() || '',
    cost: task.cost?.toString() || '',
    notes: task.notes || '',
    completed_date: task.completed_date || '',
  };
}

function normalizeTaskFormState(state: TaskFormState) {
  return {
    instrument_id: state.instrument_id || null,
    client_id: state.client_id || null,
    task_type: state.task_type,
    title: state.title.trim(),
    description: normalizeOptionalText(state.description),
    status: state.status,
    received_date: state.received_date,
    due_date: normalizeOptionalText(state.due_date),
    personal_due_date: normalizeOptionalText(state.personal_due_date),
    scheduled_date: normalizeOptionalText(state.scheduled_date),
    priority: state.priority,
    estimated_hours: normalizeOptionalNumber(state.estimated_hours),
    actual_hours: normalizeOptionalNumber(state.actual_hours),
    cost: normalizeOptionalNumber(state.cost),
    notes: normalizeOptionalText(state.notes),
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
  onFetchLatest,
}: TaskModalProps) {
  const [formData, setFormData] = useState<TaskFormState>(() =>
    createEmptyFormState()
  );

  const [errors, setErrors] = useState<string[]>([]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [reloadingLatest, setReloadingLatest] = useState(false);

  // Snapshot of the form as it looked right after the last reset (open /
  // task switch), used as the baseline for dirty-state comparison.
  const initialSnapshotRef = useRef<TaskFormState>(createEmptyFormState());
  const expectedUpdatedAtRef = useRef<string | null>(null);
  const baseStatusRef = useRef<TaskStatus | null>(null);
  const baseCompletedDateRef = useRef<string | null>(null);
  const selectedTaskRef = useRef(selectedTask);
  const latestFetchGenRef = useRef(0);
  const reloadGenRef = useRef(0);

  selectedTaskRef.current = selectedTask;

  const editSessionKey = isOpen
    ? `${isEditing ? (selectedTask?.id ?? 'missing') : 'create'}:${isEditing ? '' : defaultScheduledDate}`
    : 'closed';

  const applyAuthoritativeTask = (task: MaintenanceTask) => {
    const nextFormState = taskToFormState(task);
    initialSnapshotRef.current = nextFormState;
    expectedUpdatedAtRef.current = task.updated_at;
    baseStatusRef.current = task.status;
    baseCompletedDateRef.current = task.completed_date;
    setFormData(nextFormState);
    setErrors([]);
    setHasConflict(false);
    setShowDiscardConfirm(false);
  };

  useEffect(() => {
    if (!isOpen) {
      latestFetchGenRef.current += 1;
      reloadGenRef.current += 1;
      expectedUpdatedAtRef.current = null;
      baseStatusRef.current = null;
      baseCompletedDateRef.current = null;
      setHasConflict(false);
      setReloadingLatest(false);
      return;
    }

    const task = selectedTaskRef.current;
    const nextFormState: TaskFormState =
      task && isEditing
        ? taskToFormState(task)
        : createEmptyFormState(defaultScheduledDate || '');

    initialSnapshotRef.current = nextFormState;
    expectedUpdatedAtRef.current = task && isEditing ? task.updated_at : null;
    baseStatusRef.current = task && isEditing ? task.status : null;
    baseCompletedDateRef.current =
      task && isEditing ? task.completed_date : null;
    setFormData(nextFormState);
    setErrors([]);
    setHasConflict(false);
    setShowDiscardConfirm(false);
  }, [editSessionKey, isOpen, isEditing, defaultScheduledDate]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(normalizeTaskFormState(formData)) !==
      JSON.stringify(normalizeTaskFormState(initialSnapshotRef.current)),
    [formData]
  );

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const prefetchLatestTask = (taskId: string) => {
    if (!onFetchLatest) return;

    const gen = ++latestFetchGenRef.current;
    void onFetchLatest(taskId).then(latest => {
      if (gen !== latestFetchGenRef.current) return;
      void latest;
    });
  };

  const handleReloadLatest = async () => {
    const taskId = selectedTask?.id;
    if (!taskId || !onFetchLatest) return;

    const gen = ++reloadGenRef.current;
    latestFetchGenRef.current += 1;
    setReloadingLatest(true);

    try {
      const latest = await onFetchLatest(taskId);
      if (gen !== reloadGenRef.current) return;

      if (!latest) {
        setErrors(['Could not load the latest maintenance task.']);
        return;
      }

      applyAuthoritativeTask(latest);
    } finally {
      if (gen === reloadGenRef.current) {
        setReloadingLatest(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    if (!hasConflict) {
      setErrors([]);
    }

    const instrumentId = formData.instrument_id as string;

    // Prepare task data
    // Set completed_date if status is completed and it wasn't already completed
    const wasCompleted = baseStatusRef.current === 'completed';
    const isNowCompleted = formData.status === 'completed';
    // FIXED: Use todayLocalYMD() instead of toISOString() to avoid UTC timezone issues
    // FIXED: If user switches status away from completed, set completed_date to null
    const completedDate =
      isNowCompleted && !wasCompleted
        ? todayLocalYMD()
        : isNowCompleted
          ? baseCompletedDateRef.current || todayLocalYMD()
          : null;

    const taskData: MaintenanceTaskSubmitPayload = {
      instrument_id: instrumentId,
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

    if (isEditing) {
      const expectedUpdatedAt = expectedUpdatedAtRef.current;
      if (!expectedUpdatedAt) {
        setErrors([
          'This maintenance task is missing a version to save against.',
        ]);
        return;
      }
      taskData.expected_updated_at = expectedUpdatedAt;
    }

    try {
      await onSubmit(taskData);
    } catch (error) {
      if (isMaintenanceTaskStaleVersionError(error)) {
        setHasConflict(true);
        setErrors([MAINTENANCE_TASK_CONFLICT_MESSAGE]);
        if (selectedTask?.id) {
          prefetchLatestTask(selectedTask.id);
        }
        return;
      }

      // Show error in modal for better UX
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to save task. Please try again.';
      setErrors([errorMessage]);
    }
  };

  // Intercept every non-save close path: dirty forms require explicit
  // discard confirmation instead of closing immediately.
  const requestClose = () => {
    if (showDiscardConfirm) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  const handleKeepEditing = () => {
    setShowDiscardConfirm(false);
  };

  // Close modal with ESC key and outside click
  const modalRef = useRef<HTMLDivElement>(null);
  useOutsideClose(modalRef, {
    isOpen,
    onClose: requestClose,
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
  const allTaskStatuses: TaskStatus[] = [
    'pending',
    'in_progress',
    'completed',
    'cancelled',
  ];
  const taskStatuses: TaskStatus[] =
    isEditing && (baseStatusRef.current ?? selectedTask?.status)
      ? [
          ...getAllowedMaintenanceTaskNextStatuses(
            (baseStatusRef.current ?? selectedTask?.status) as TaskStatus
          ),
        ]
      : allTaskStatuses;
  const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

  return (
    <div
      className={modalStyles.overlay}
      onClick={e => {
        if (e.target === e.currentTarget) {
          requestClose();
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
          onClose={requestClose}
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
              {hasConflict && onFetchLatest && (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void handleReloadLatest();
                    }}
                    disabled={submitting || reloadingLatest}
                  >
                    {reloadingLatest ? 'Loading latest...' : 'Reload latest'}
                  </Button>
                </div>
              )}
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
              onClick={requestClose}
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

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Discard changes?"
        message="You have unsaved changes. If you close now, they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={handleConfirmDiscard}
        onCancel={handleKeepEditing}
      />
    </div>
  );
}
