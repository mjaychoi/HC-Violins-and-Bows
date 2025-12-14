'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Instrument } from '@/types';
import { useDashboardForm } from '../hooks/useDashboardForm';
import { validateInstrumentData } from '../utils/dashboardUtils';
import { classNames } from '@/utils/classNames';
import Button from '@/components/common/Button';
import Input from '@/components/common/Input';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import {
  generateInstrumentSerialNumber,
  normalizeInstrumentSerial,
  validateInstrumentSerial,
} from '@/utils/uniqueNumberGenerator';
import { modalStyles } from '@/components/common/modalStyles';
import { ModalHeader } from '@/components/common/ModalHeader';

interface ItemFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: Omit<Instrument, 'id' | 'created_at'>) => Promise<void>;
  submitting: boolean;
  selectedItem?: Instrument | null;
  isEditing?: boolean;
  existingSerialNumbers: string[]; // Serial numbers from existing instruments for validation
}

export default function ItemForm({
  isOpen,
  onClose,
  onSubmit,
  submitting,
  selectedItem,
  isEditing = false,
  existingSerialNumbers,
}: ItemFormProps) {
  const {
    formData,
    updateField,
    resetForm,
    priceInput,
    handlePriceChange,
    selectedFiles,
    handleFileChange,
    removeFile,
  } = useDashboardForm();
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const lastInitializedItemId = useRef<string | null>(null);
  const hasInitializedCreate = useRef(false);
  const lastAutoSerialRef = useRef<string>('');
  const lastSerialsKeyRef = useRef<string>('');
  const formDataRef = useRef(formData);

  // Keep formDataRef in sync with formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // FIXED: Derive stable key for existingSerialNumbers to avoid unnecessary re-runs
  const serialsKey = useMemo(
    () => existingSerialNumbers.slice().sort().join('|'),
    [existingSerialNumbers]
  );

  useEffect(() => {
    if (!isOpen) return;

    if (selectedItem && isEditing) {
      // Prevent re-initializing the same item on every render
      if (lastInitializedItemId.current === selectedItem.id) return;
      lastInitializedItemId.current = selectedItem.id;
      hasInitializedCreate.current = false;
      // Populate form with selected item data when editing
      updateField('status', selectedItem.status || 'Available');
      updateField('maker', selectedItem.maker || '');
      updateField('type', selectedItem.type || '');
      updateField('subtype', selectedItem.subtype || '');
      updateField('year', selectedItem.year?.toString() || '');
      // FIXED: Don't update formData.price - use priceInput directly
      // priceInput will be set via handlePriceChange
      handlePriceChange(selectedItem.price?.toString() || '');
      updateField('certificate', selectedItem.certificate ?? false);
      updateField('size', selectedItem.size || '');
      updateField('weight', selectedItem.weight || '');
      updateField('ownership', selectedItem.ownership || '');
      updateField('note', selectedItem.note || '');
      updateField('serial_number', selectedItem.serial_number || '');
    } else if (!isEditing && !selectedItem) {
      // FIXED: Create mode - handle initialization and serial regeneration
      if (!hasInitializedCreate.current) {
        // First time opening create form
        lastInitializedItemId.current = null;
        resetForm();
        const autoSerialNumber = generateInstrumentSerialNumber(
          null,
          existingSerialNumbers
        );
        lastAutoSerialRef.current = autoSerialNumber;
        lastSerialsKeyRef.current = serialsKey;
        updateField('serial_number', autoSerialNumber);
        hasInitializedCreate.current = true;
      } else {
        // Modal already initialized, but serial list changed
        // Regenerate ONLY if user didn't manually edit serial
        const current = formDataRef.current.serial_number?.trim();
        const shouldAuto = !current || current === lastAutoSerialRef.current;
        const serialsChanged = lastSerialsKeyRef.current !== serialsKey;

        // Only regenerate if serials list changed (and serial was auto-generated)
        if (shouldAuto && serialsChanged) {
          const autoSerialNumber = generateInstrumentSerialNumber(
            formDataRef.current.type?.trim() || null,
            existingSerialNumbers
          );
          lastAutoSerialRef.current = autoSerialNumber;
          lastSerialsKeyRef.current = serialsKey;
          updateField('serial_number', autoSerialNumber);
        }
      }
    }
    // FIXED: Remove formData.serial_number and formData.type from deps to prevent infinite loop
    // Use formDataRef to access latest values without causing re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedItem,
    isEditing,
    resetForm,
    updateField,
    isOpen,
    serialsKey,
    handlePriceChange,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data
    const validationErrors = validateInstrumentData(
      formData as unknown as Partial<Instrument>
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      // 새 악기 추가 시 serial number 자동 생성 (없는 경우)
      let serialNumber = formData.serial_number?.trim() || null;
      if (!isEditing && !serialNumber) {
        serialNumber = generateInstrumentSerialNumber(
          formData.type?.trim() || null,
          existingSerialNumbers
        );
      }

      // FIXED: Normalize only if we have a string (null check)
      const serialRaw = serialNumber?.trim() || '';
      const normalizedSerial = serialRaw
        ? normalizeInstrumentSerial(serialRaw)
        : '';
      const serialValidation = validateInstrumentSerial(
        normalizedSerial || null,
        existingSerialNumbers,
        isEditing ? (selectedItem?.serial_number ?? null) : undefined
      );
      if (!serialValidation.valid) {
        setErrors([serialValidation.error || 'Invalid serial number']);
        return;
      }

      // Convert form data to proper types for database
      const instrumentData: Omit<Instrument, 'id' | 'created_at'> = {
        status: formData.status as
          | 'Available'
          | 'Booked'
          | 'Sold'
          | 'Reserved'
          | 'Maintenance',
        maker: formData.maker?.trim() || null,
        type: formData.type?.trim() || null,
        subtype: formData.subtype?.trim() || null,
        year: (() => {
          const yearStr = formData.year?.toString().trim();
          if (!yearStr) return null;
          const yearNum = parseInt(yearStr, 10);
          return isNaN(yearNum) ? null : yearNum;
        })(),
        // FIXED: Derive price from priceInput (single source of truth) at submit time
        // Normalize price: remove commas, handle empty strings, validate number
        price: (() => {
          const normalizedPrice = priceInput.trim().replace(/,/g, '');
          if (normalizedPrice === '') return null;
          const priceNum = Number(normalizedPrice);
          return Number.isFinite(priceNum) ? priceNum : null;
        })(),
        certificate: formData.certificate,
        size: formData.size?.trim() || null,
        weight: formData.weight?.trim() || null,
        ownership: formData.ownership?.trim() || null,
        note: formData.note?.trim() || null,
        serial_number: serialValidation.normalizedSerial || normalizedSerial,
      };

      await onSubmit(instrumentData);
      setErrors([]);

      // UX: Show success state instead of immediately closing
      if (isEditing) {
        // For editing, just close and let parent show success toast
        resetForm();
        onClose();
      } else {
        // For creating, show success message with action buttons
        setSuccess(true);
        // Store created item ID if available (might need to be passed from parent)
        // For now, we'll just show success state
      }
    } catch {
      setErrors(['Failed to save item. Please try again.']);
      setSuccess(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      updateField(
        name as keyof typeof formData,
        (e.target as HTMLInputElement).checked as boolean
      );
    } else {
      updateField(name as keyof typeof formData, value as string);

      // 타입이 변경되면 serial number 자동 재생성 (새 악기 추가 시에만)
      // FIXED: Only auto-generate when serial was auto-generated (or empty) to avoid clobbering user edits
      if (name === 'type' && !isEditing) {
        const current = formData.serial_number?.trim();
        const shouldAuto = !current || current === lastAutoSerialRef.current;
        if (shouldAuto) {
          const newSerialNumber = generateInstrumentSerialNumber(
            value || null,
            existingSerialNumbers
          );
          lastAutoSerialRef.current = newSerialNumber;
          updateField('serial_number', newSerialNumber);
        }
      }
    }
  };

  // Close modal with ESC key and outside click
  // FIXED: Use only useOutsideClose to avoid double close handling
  const modalRef = useRef<HTMLDivElement>(null);
  useOutsideClose(modalRef, {
    isOpen,
    onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      className={modalStyles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={modalStyles.container}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-form-title"
      >
        <ModalHeader
          title={isEditing ? 'Edit Item' : 'Add New Item'}
          icon="item"
          onClose={onClose}
          titleId="item-form-title"
        />
        <div className={modalStyles.body}>
          {/* UX: Success message with action buttons */}
          {success && !isEditing && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-600 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-green-800">
                    Item created successfully!
                  </h4>
                  <p className="mt-1 text-sm text-green-700">
                    What would you like to do next?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        // FIXED: Clear errors when switching back to create form
                        setErrors([]);
                        setSuccess(false);
                        resetForm();
                        // Auto-generate new serial for next item
                        const autoSerialNumber = generateInstrumentSerialNumber(
                          null,
                          existingSerialNumbers
                        );
                        lastAutoSerialRef.current = autoSerialNumber;
                        updateField('serial_number', autoSerialNumber);
                        hasInitializedCreate.current = true;
                      }}
                      variant="success"
                      size="sm"
                      className="bg-white border border-green-300 text-green-700 hover:bg-green-50"
                    >
                      Add Another
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        // FIXED: Clear errors on Done
                        setErrors([]);
                        setSuccess(false);
                        resetForm();
                        onClose();
                      }}
                      variant="success"
                      size="sm"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              <ul className="list-disc list-inside">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            style={{ display: success && !isEditing ? 'none' : 'block' }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Maker"
                name="maker"
                value={formData.maker}
                onChange={handleInputChange}
                required
                placeholder="Enter maker name"
                helperText="The manufacturer or brand name of the instrument"
              />

              <Input
                label="Type"
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                required
                placeholder="Enter type"
                helperText="Primary category (e.g., Violin, Viola, Cello, Bow)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Subtype"
                name="subtype"
                value={formData.subtype}
                onChange={handleInputChange}
                required
                placeholder="Enter subtype"
              />

              <Input
                label="Year"
                name="year"
                type="number"
                value={formData.year}
                onChange={handleInputChange}
                placeholder="Enter year"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={classNames.formLabel}>Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className={classNames.input}
                >
                  <option value="Available">Available</option>
                  <option value="Booked">Booked</option>
                  <option value="Sold">Sold</option>
                  <option value="Reserved">Reserved</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>

              <Input
                label="Price"
                name="price"
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={e => handlePriceChange(e.target.value)}
                placeholder="Enter price"
                helperText="Selling price (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Size"
                name="size"
                value={formData.size}
                onChange={handleInputChange}
                placeholder="Enter size"
              />

              <Input
                label="Weight"
                name="weight"
                value={formData.weight}
                onChange={handleInputChange}
                placeholder="Enter weight"
              />
            </div>

            <Input
              label="Ownership"
              name="ownership"
              value={formData.ownership}
              onChange={handleInputChange}
              placeholder="Enter ownership info"
            />

            <div>
              <label className={classNames.formLabel}>
                Serial Number
                {!isEditing && (
                  <span className="ml-2 text-xs text-gray-500">
                    (자동 생성)
                  </span>
                )}
              </label>
              <input
                type="text"
                name="serial_number"
                value={formData.serial_number}
                onChange={handleInputChange}
                disabled={!isEditing}
                pattern="[A-Za-z]{2}[0-9]{7}"
                title="2 letters + 7 digits (e.g., VI0000123)"
                className={
                  classNames.input +
                  (isEditing ? '' : ' bg-gray-100 cursor-not-allowed')
                }
                placeholder={
                  isEditing
                    ? 'Enter serial number (e.g., VI0000123, BO0000456)'
                    : '자동 생성됨'
                }
              />
              {!isEditing && (
                <p className="mt-1 text-sm text-gray-500">
                  타입 입력 시 자동으로 생성됩니다
                </p>
              )}
            </div>

            <div>
              <label className={classNames.formLabel}>Images</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={e => handleFileChange(e.target.files)}
                className={classNames.input}
              />
              {selectedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-600">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="certificate"
                  checked={formData.certificate}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Has Certificate
                </span>
              </label>
            </div>

            <div>
              <label className={classNames.formLabel}>Note</label>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleInputChange}
                rows={3}
                className={classNames.input}
                placeholder="Enter any additional notes"
              />
              <p className="mt-1 text-sm text-gray-500">
                Any additional information about condition, history, or special
                features
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                {isEditing ? 'Update Item' : 'Add Item'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
