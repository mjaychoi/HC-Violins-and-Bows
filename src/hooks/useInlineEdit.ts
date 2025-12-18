/**
 * 공통 인라인 편집 훅
 * Dashboard의 인라인 편집 패턴을 재사용 가능한 훅으로 추출
 */

import { useState, useCallback } from 'react';

export interface UseInlineEditOptions<T> {
  /**
   * 저장 시 호출되는 함수
   * @param id 편집 중인 항목의 ID
   * @param data 편집된 데이터 (부분 업데이트)
   */
  onSave: (id: string, data: Partial<T>) => Promise<void>;
  /**
   * 취소 시 호출되는 선택적 콜백
   */
  onCancel?: () => void;
  /**
   * 저장 성공 후 하이라이트 지속 시간 (ms)
   * @default 2000
   */
  highlightDuration?: number;
}

export interface UseInlineEditReturn<T> {
  /**
   * 현재 편집 중인 항목의 ID (없으면 null)
   */
  editingId: string | null;
  /**
   * 편집 중인 데이터
   */
  editData: Partial<T>;
  /**
   * 저장 중인지 여부
   */
  isSaving: boolean;
  /**
   * 저장 성공한 항목의 ID (하이라이트용, 없으면 null)
   */
  savedId: string | null;
  /**
   * 편집 모드 시작
   * @param id 편집할 항목의 ID
   * @param initialData 초기 데이터 (현재 값으로 채워짐)
   */
  startEditing: (id: string, initialData: Partial<T>) => void;
  /**
   * 편집 취소
   */
  cancelEditing: () => void;
  /**
   * 필드 값 업데이트
   * @param field 필드명
   * @param value 새 값
   */
  updateField: <K extends keyof T>(field: K, value: T[K]) => void;
  /**
   * 편집 내용 저장
   */
  saveEditing: () => Promise<void>;
}

/**
 * 인라인 편집을 위한 공통 훅
 *
 * @example
 * ```tsx
 * const {
 *   editingId,
 *   editData,
 *   isSaving,
 *   savedId,
 *   startEditing,
 *   cancelEditing,
 *   updateField,
 *   saveEditing,
 * } = useInlineEdit<Client>({
 *   onSave: async (id, data) => {
 *     await updateClient(id, data);
 *   },
 *   highlightDuration: 2000,
 * });
 *
 * // 사용 예시
 * <button onClick={() => startEditing(client.id, { interest: client.interest })}>
 *   Edit
 * </button>
 *
 * {editingId === client.id ? (
 *   <input
 *     value={editData.interest || client.interest}
 *     onChange={e => updateField('interest', e.target.value)}
 *   />
 * ) : (
 *   <span>{client.interest}</span>
 * )}
 * ```
 */
export function useInlineEdit<T extends { id: string }>(
  options: UseInlineEditOptions<T>
): UseInlineEditReturn<T> {
  const { onSave, onCancel, highlightDuration = 2000 } = options;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<T>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const startEditing = useCallback((id: string, initialData: Partial<T>) => {
    setEditingId(id);
    setEditData(initialData);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditData({});
    onCancel?.();
  }, [onCancel]);

  const updateField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setEditData(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const saveEditing = useCallback(async () => {
    if (!editingId) return;

    setIsSaving(true);
    try {
      await onSave(editingId, editData);
      setEditingId(null);
      setEditData({});

      // 성공 피드백: 하이라이트 표시
      setSavedId(editingId);
      setTimeout(() => {
        setSavedId(null);
      }, highlightDuration);
    } catch (error) {
      // 에러는 상위 컴포넌트에서 처리
      // 편집 모드는 유지하여 사용자가 재시도할 수 있도록 함
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [editingId, editData, onSave, highlightDuration]);

  return {
    editingId,
    editData,
    isSaving,
    savedId,
    startEditing,
    cancelEditing,
    updateField,
    saveEditing,
  };
}
