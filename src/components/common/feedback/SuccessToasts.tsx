import React from 'react';
import SuccessToast from './SuccessToast';

interface SuccessToastsProps {
  toasts: Array<{
    id: string;
    message: string;
    timestamp: Date;
  }>;
  onRemove: (id: string) => void;
}

/**
 * 성공 토스트 목록을 화면 오른쪽 상단에 렌더링하는 컨테이너 컴포넌트
 * - `ToastProvider`에서 상태를 관리하고, 여기서는 단순히 리스트만 렌더링
 */
export default function SuccessToasts({
  toasts,
  onRemove,
}: SuccessToastsProps) {
  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <SuccessToast
          key={toast.id}
          message={toast.message}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}
