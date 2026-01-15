'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Instrument } from '@/types';
import { useDashboardForm } from '../hooks/useDashboardForm';
import { validateInstrumentData } from '../utils/dashboardUtils';
import { classNames } from '@/utils/classNames';
import { Button, Input } from '@/components/common/inputs';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import {
  generateInstrumentSerialNumber,
  normalizeInstrumentSerial,
  validateInstrumentSerial,
} from '@/utils/uniqueNumberGenerator';
import { modalStyles } from '@/components/common/modals/modalStyles';
import { ModalHeader } from '@/components/common/modals/ModalHeader';
import OptimizedImage from '@/components/common/OptimizedImage';

interface ItemFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: Omit<Instrument, 'id' | 'created_at'>) => Promise<void>;
  submitting: boolean;
  selectedItem?: Instrument | null;
  isEditing?: boolean;
  existingSerialNumbers: string[]; // Serial numbers from existing instruments for validation
  instruments?: Instrument[]; // Full instruments array for duplicate info
}

function ItemForm({
  isOpen,
  onClose,
  onSubmit,
  submitting,
  selectedItem,
  isEditing = false,
  existingSerialNumbers,
  instruments = [],
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
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    maker?: string;
    type?: string;
    year?: string;
    price?: string;
    serial_number?: string;
  }>({});
  const [success, setSuccess] = useState(false);
  // ✅ FIXED: 이미지 미리보기 URL 생성 - file.name + size 기반 키 사용 (reorder 대비)
  // index 기반은 drag & drop reorder 시 깨질 수 있음
  const [imagePreviews, setImagePreviews] = useState<Map<string, string>>(
    new Map()
  );
  const lastInitializedItemId = useRef<string | null>(null);
  const hasInitializedCreate = useRef(false);
  const lastAutoSerialRef = useRef<string>('');
  const lastSerialsKeyRef = useRef<string>('');
  const formDataRef = useRef(formData);

  // Keep formDataRef in sync with formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const focusFirstErrorField = (fieldErrs: typeof fieldErrors) => {
    const order: (keyof typeof fieldErrors)[] = [
      'maker',
      'type',
      'year',
      'price',
      'serial_number',
    ];
    for (const field of order) {
      if (fieldErrs[field]) {
        const el = document.getElementById(field);
        if (el && 'focus' in el) {
          (el as HTMLElement).focus();
          break;
        }
      }
    }
  };

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

    setFormError(null);
    setFieldErrors({});
    setErrors([]);

    // Validate form data - pass priceInput for accurate validation
    const validationErrors = validateInstrumentData(
      formData as unknown as Partial<Instrument>,
      priceInput
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      const mappedFieldErrors: typeof fieldErrors = {};
      validationErrors.forEach(msg => {
        if (msg.includes('Maker')) mappedFieldErrors.maker = msg;
        if (msg.includes('Type')) mappedFieldErrors.type = msg;
        if (msg.includes('Year')) mappedFieldErrors.year = msg;
        if (msg.includes('Price')) mappedFieldErrors.price = msg;
      });
      setFieldErrors(mappedFieldErrors);
      focusFirstErrorField(mappedFieldErrors);
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
        isEditing ? (selectedItem?.serial_number ?? null) : undefined,
        instruments
      );
      if (!serialValidation.valid) {
        const errorMessages = [
          serialValidation.error || 'Invalid serial number',
        ];

        // 중복된 항목에 대한 추가 정보 및 해결 방법 제시
        if (serialValidation.duplicateInfo) {
          errorMessages.push(
            '다른 Serial Number를 입력하거나 기존 악기를 수정하세요.'
          );
          if (serialValidation.duplicateInfo.id) {
            errorMessages.push(
              `중복된 악기 ID: ${serialValidation.duplicateInfo.id}`
            );
          }
        }

        setErrors(errorMessages);
        setFieldErrors(prev => ({
          ...prev,
          serial_number: serialValidation.error || 'Invalid serial number',
        }));
        focusFirstErrorField({ serial_number: 'Serial number error' });
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
        certificate: null,
        size: formData.size?.trim() || null,
        weight: formData.weight?.trim() || null,
        ownership: formData.ownership?.trim() || null,
        note: formData.note?.trim() || null,
        serial_number: serialValidation.normalizedSerial || normalizedSerial,
      };

      await onSubmit(instrumentData);
      setErrors([]);
      setFieldErrors({});
      setFormError(null);

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
      setFormError('저장에 실패했습니다. 입력 값을 다시 확인해 주세요.');
      setSuccess(false);
    }
  };

  // ✅ FIXED: 이미지 파일 선택 시 미리보기 생성 - file.name + size 기반 키 사용
  useEffect(() => {
    selectedFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        // ✅ FIXED: file.name + size를 키로 사용하여 reorder 시에도 안정적
        const fileKey = `${file.name}-${file.size}`;

        // 이미 생성된 미리보기는 건너뛰기 (prev를 통해 확인)
        setImagePreviews(prev => {
          if (prev.has(fileKey)) return prev; // 이미 있으면 업데이트하지 않음

          // 비동기로 미리보기 생성
          const reader = new FileReader();
          reader.onloadend = () => {
            if (reader.result) {
              setImagePreviews(current => {
                const updated = new Map(current);
                updated.set(fileKey, reader.result as string);
                return updated;
              });
            }
          };
          reader.readAsDataURL(file);

          return prev; // 즉시 반환 (비동기 업데이트는 onloadend에서)
        });
      }
    });
    // 선택 해제된 파일의 미리보기 제거
    setImagePreviews(prev => {
      const updated = new Map(prev);
      const currentFileKeys = new Set(
        selectedFiles.map(f => `${f.name}-${f.size}`)
      );
      // 현재 선택된 파일이 아닌 미리보기 제거
      for (const [key] of updated) {
        if (!currentFileKeys.has(key)) {
          updated.delete(key);
        }
      }
      return updated;
    });
  }, [selectedFiles]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
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
      onClick={e => {
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
                      variant="secondary"
                      size="sm"
                      className="!bg-white !border !border-green-300 !text-green-700 hover:!bg-green-50"
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

          {formError && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              <p className="text-sm">{formError}</p>
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
                id="maker"
                label="Maker"
                name="maker"
                value={formData.maker}
                onChange={handleInputChange}
                required
                placeholder="Enter maker name"
                error={fieldErrors.maker}
                helperText="The manufacturer or brand name of the instrument"
              />

              <Input
                id="type"
                label="Type"
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                required
                placeholder="Enter type"
                error={fieldErrors.type}
                helperText="Primary category (e.g., Violin, Viola, Cello, Bow)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="subtype"
                label="Subtype"
                name="subtype"
                value={formData.subtype}
                onChange={handleInputChange}
                placeholder="Enter subtype"
              />

              <Input
                id="year"
                label="Year"
                name="year"
                type="number"
                value={formData.year}
                onChange={handleInputChange}
                placeholder="Enter year"
                error={fieldErrors.year}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={classNames.formLabel} htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
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
                id="price"
                label="Price"
                name="price"
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={e => handlePriceChange(e.target.value)}
                placeholder="Enter price"
                error={fieldErrors.price}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="size"
                label="Size"
                name="size"
                value={formData.size}
                onChange={handleInputChange}
                placeholder="Enter size"
              />

              <Input
                id="weight"
                label="Weight"
                name="weight"
                value={formData.weight}
                onChange={handleInputChange}
                placeholder="Enter weight"
              />
            </div>

            <Input
              id="ownership"
              label="Ownership"
              name="ownership"
              value={formData.ownership}
              onChange={handleInputChange}
              placeholder="Enter ownership info"
            />

            <div>
              <label className={classNames.formLabel} htmlFor="serial_number">
                Serial Number
                {!isEditing && (
                  <span className="ml-2 text-xs text-gray-500">
                    (자동 생성)
                  </span>
                )}
              </label>
              <input
                id="serial_number"
                type="text"
                name="serial_number"
                value={formData.serial_number}
                onChange={handleInputChange}
                disabled={!isEditing}
                // ✅ NOTE: pattern은 UX 힌트용일 뿐, 실제 검증은 validateInstrumentSerial에서 수행
                // 규칙이 변경되면 normalizeInstrumentSerial과 validateInstrumentSerial도 함께 업데이트 필요
                pattern="[A-Za-z]{2}[0-9]{7}"
                title="2 letters + 7 digits (e.g., VI0000123)"
                className={
                  (fieldErrors.serial_number
                    ? classNames.inputError
                    : classNames.input) +
                  (isEditing ? '' : ' bg-gray-100 cursor-not-allowed')
                }
                placeholder={
                  isEditing
                    ? 'Enter serial number (e.g., VI0000123, BO0000456)'
                    : '자동 생성됨'
                }
              />
              {fieldErrors.serial_number && (
                <p className={classNames.formError}>
                  {fieldErrors.serial_number}
                </p>
              )}
              {!isEditing && (
                <p className="mt-1 text-xs text-gray-500 italic">
                  타입 입력 시 자동으로 생성됩니다
                </p>
              )}
            </div>

            <div>
              <label className={classNames.formLabel} htmlFor="images">
                Images
              </label>
              <input
                id="images"
                type="file"
                multiple
                accept="image/*"
                onChange={e => handleFileChange(e.target.files)}
                className={classNames.input}
              />
              {selectedFiles.length > 0 && (
                <div className="mt-2 space-y-3">
                  {selectedFiles.map((file, index) => {
                    // ✅ FIXED: file.name + size 기반 키로 lookup
                    const fileKey = `${file.name}-${file.size}`;
                    const previewUrl = imagePreviews.get(fileKey);
                    return (
                      <div
                        key={fileKey}
                        className="flex items-start gap-3 p-2 border border-gray-200 rounded-lg"
                      >
                        {previewUrl && (
                          <div className="relative w-20 h-20 shrink-0 rounded overflow-hidden bg-gray-100">
                            <OptimizedImage
                              src={previewUrl}
                              alt={`Preview ${file.name}`}
                              fill
                              objectFit="cover"
                              className="rounded"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600 truncate">
                              {file.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                removeFile(index);
                                // ✅ FIXED: fileKey 기반으로 미리보기 제거
                                setImagePreviews(prev => {
                                  const updated = new Map(prev);
                                  updated.delete(fileKey);
                                  return updated;
                                });
                              }}
                              className="ml-2 text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {(file.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className={classNames.formLabel} htmlFor="note">
                Note
              </label>
              <textarea
                id="note"
                name="note"
                value={formData.note}
                onChange={handleInputChange}
                rows={3}
                className={classNames.input}
                placeholder="Enter any additional notes"
              />
              <p className="mt-1 text-xs text-gray-500">
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

export default React.memo(ItemForm);
