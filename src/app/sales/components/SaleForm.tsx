'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SalesHistory, Instrument, Client } from '@/types';
import {
  useUnifiedClients,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import { logInfo } from '@/utils/logger';
import { todayLocalYMD } from '@/utils/dateParsing';
import { modalStyles } from '@/components/common/modals/modalStyles';
import { ModalHeader } from '@/components/common/modals/ModalHeader';

interface SaleFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: Omit<SalesHistory, 'id' | 'created_at'>) => Promise<void>;
  submitting: boolean;
  // 원클릭 판매를 위한 초기값
  initialInstrument?: Instrument | null;
  initialClient?: Client | null;
  // 판매 후 악기 상태 자동 업데이트 여부
  autoUpdateInstrumentStatus?: boolean;
  /**
   * 최근 거래한 클라이언트 id 리스트 (0번이 가장 최근).
   * 부모에서 SalesHistory 기반으로 계산해 전달하면,
   * 이 순서를 기준으로 클라이언트 셀렉트 옵션을 정렬합니다.
   * 전달되지 않으면 기존처럼 이름 순으로만 정렬합니다.
   */
  recentClientIds?: string[];
}

export default function SaleForm({
  isOpen,
  onClose,
  onSubmit,
  submitting,
  initialInstrument,
  initialClient,
  autoUpdateInstrumentStatus = false,
  recentClientIds,
}: SaleFormProps) {
  const { clients } = useUnifiedClients();
  const { instruments } = useUnifiedInstruments();
  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  // FIXED: Removed unused prevOpenRef

  useOutsideClose(modalRef, { isOpen, onClose });

  // 최근 거래한 클라이언트 우선 표시 (판매 기록이 있는 클라이언트)
  const sortedClients = useMemo(() => {
    // recentClientIds를 순위 매핑으로 변환 (0이 가장 최근)
    const recentOrder = new Map<string, number>();
    recentClientIds?.forEach((id, index) => {
      if (id) {
        recentOrder.set(id, index);
      }
    });

    const getDisplayName = (c: Client) =>
      `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || '';

    return [...clients].sort((a, b) => {
      const rankA =
        (a.id && recentOrder.has(a.id)
          ? recentOrder.get(a.id)
          : Number.POSITIVE_INFINITY) ?? Number.POSITIVE_INFINITY;
      const rankB =
        (b.id && recentOrder.has(b.id)
          ? recentOrder.get(b.id)
          : Number.POSITIVE_INFINITY) ?? Number.POSITIVE_INFINITY;

      // 1순위: 최근 거래 순 (순위가 낮을수록 앞)
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // 2순위: 이름 알파벳 순 (기존 동작 유지)
      const nameA = getDisplayName(a);
      const nameB = getDisplayName(b);
      return nameA.localeCompare(nameB);
    });
  }, [clients, recentClientIds]);

  // 초기값 설정
  const getInitialFormData = useCallback(() => {
    return {
      sale_price: initialInstrument?.price?.toString() || '',
      sale_date: todayLocalYMD(),
      client_id: initialClient?.id || '',
      instrument_id: initialInstrument?.id || '',
      notes: '',
    };
  }, [initialInstrument, initialClient]);

  const [formData, setFormData] = useState(getInitialFormData);

  // 모달이 열릴 때 초기값 설정
  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
    }
  }, [isOpen, getInitialFormData]);

  // 모달 열릴 때 첫 필드에 자동 포커스
  useEffect(() => {
    if (isOpen && firstInputRef.current) {
      // 약간의 지연을 두어 모달 애니메이션 후 포커스
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  // FIXED: Removed unnecessary useEffect - errors already initialized as empty array

  useEffect(() => {
    // Debug form state changes during tests
    if (process.env.NODE_ENV === 'development') {
      logInfo('SaleForm formData', 'SaleForm', formData);
    }
  }, [formData]);

  const resetForm = useCallback(() => {
    setFormData(getInitialFormData());
    setErrors([]);
  }, [getInitialFormData]);

  // FIXED: Simplified reset logic - reset when closing (removed unused prevOpenRef)
  useEffect(() => {
    if (!isOpen) {
      resetForm();
      setSuccess(false);
    }
  }, [isOpen, resetForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    // Validation
    if (!formData.sale_price) {
      setErrors(['Sale price is required.']);
      return;
    }

    // FIXED: Allow negative values for refunds (Option A: simple approach)
    const parsedPrice = Number(formData.sale_price);
    if (!Number.isFinite(parsedPrice) || parsedPrice === 0) {
      setErrors([
        'Sale price must be a non-zero number. Use negative for refunds.',
      ]);
      return;
    }

    // Allow empty date to fall back to today to avoid HTML validation blocking tests
    const saleDate = formData.sale_date || todayLocalYMD();

    const payload: Omit<SalesHistory, 'id' | 'created_at'> = {
      sale_price: parsedPrice,
      sale_date: saleDate,
      client_id: formData.client_id ? formData.client_id : null,
      instrument_id: formData.instrument_id ? formData.instrument_id : null,
      notes: formData.notes || null,
    };

    try {
      await onSubmit(payload);

      // 판매 기록 저장 후 악기 상태 자동 업데이트
      if (
        autoUpdateInstrumentStatus &&
        formData.instrument_id &&
        parsedPrice > 0
      ) {
        try {
          const response = await fetch('/api/instruments', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: formData.instrument_id,
              status: 'Sold',
            }),
          });

          if (!response.ok) {
            console.warn('Failed to update instrument status to Sold');
          }
        } catch (error) {
          console.warn('Failed to update instrument status:', error);
          // 에러가 발생해도 판매 기록은 성공했으므로 계속 진행
        }
      }

      // UX: Show success state instead of immediately closing
      setSuccess(true);
    } catch {
      // Error handling is done by parent
      setSuccess(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={modalStyles.overlay}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-form-title"
        className={modalStyles.container}
      >
        <ModalHeader
          title={
            initialInstrument
              ? `Sell: ${initialInstrument.maker || ''} ${initialInstrument.type || ''}`.trim() ||
                'New Sale'
              : 'New Sale'
          }
          icon="sale"
          onClose={onClose}
          titleId="sale-form-title"
        />

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* UX: Success message with action buttons */}
          {success && (
            <div className="p-6 bg-green-50 border-b border-green-200">
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
                    Sale recorded successfully!
                  </h4>
                  <p className="mt-1 text-sm text-green-700">
                    What would you like to do next?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setErrors([]);
                        setSuccess(false);
                        // FIXED: Single reset - completely new sale form
                        // Don't call resetForm() which would use initialInstrument/initialClient
                        setFormData({
                          sale_price: '',
                          sale_date: todayLocalYMD(),
                          client_id: '',
                          instrument_id: '',
                          notes: '',
                        });
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-green-700 bg-white border border-green-300 rounded-md hover:bg-green-50 transition-colors"
                    >
                      Add Another
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setSuccess(false);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="p-6 space-y-4"
            style={{ display: success ? 'none' : 'block' }}
          >
            {errors.length > 0 && (
              <div
                className="rounded-md bg-red-50 p-3"
                role="alert"
                aria-live="assertive"
              >
                <div className="text-sm text-red-800">
                  {errors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="sale-price-input"
                >
                  Amount (negative for refund){' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  id="sale-price-input"
                  type="number"
                  value={formData.sale_price}
                  onChange={e => {
                    setErrors([]);
                    setFormData(prev => ({
                      ...prev,
                      sale_price: e.target.value,
                    }));
                  }}
                  placeholder="e.g. 2500 or -2500"
                  step="0.01"
                  className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use positive numbers for sales, negative numbers for refunds
                  (e.g., -2500)
                </p>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="sale-date-input"
                >
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="sale-date-input"
                  type="date"
                  value={formData.sale_date}
                  onChange={e => {
                    setErrors([]);
                    setFormData(prev => ({
                      ...prev,
                      sale_date: e.target.value,
                    }));
                  }}
                  className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="sale-client-select"
                >
                  Client (optional)
                </label>
                <select
                  id="sale-client-select"
                  value={formData.client_id}
                  onChange={e => {
                    setErrors([]);
                    setFormData(prev => ({
                      ...prev,
                      client_id: e.target.value,
                    }));
                  }}
                  className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a client</option>
                  {sortedClients.map(client => (
                    <option key={client.id} value={client.id}>
                      {`${client.first_name || ''} ${client.last_name || ''}`.trim() ||
                        client.email ||
                        client.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="sale-instrument-select"
                >
                  Instrument (optional)
                </label>
                <select
                  id="sale-instrument-select"
                  value={formData.instrument_id}
                  onChange={e => {
                    setErrors([]);
                    setFormData(prev => ({
                      ...prev,
                      instrument_id: e.target.value,
                    }));
                  }}
                  className="w-full h-10 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select an instrument</option>
                  {instruments.map(instrument => (
                    <option key={instrument.id} value={instrument.id}>
                      {[
                        instrument.maker,
                        instrument.type,
                        instrument.subtype,
                        instrument.serial_number,
                      ]
                        .filter(Boolean)
                        .join(' - ') || instrument.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="sale-notes-textarea"
                >
                  Notes
                </label>
                <textarea
                  id="sale-notes-textarea"
                  value={formData.notes}
                  onChange={e => {
                    setErrors([]);
                    setFormData(prev => ({ ...prev, notes: e.target.value }));
                  }}
                  placeholder="Add context for this sale"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                  rows={3}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Additional context about this sale (e.g., payment method,
                  special terms)
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving…' : 'Save Sale'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
