'use client';

import { useCallback } from 'react';
import Button from '@/components/common/Button';

interface FollowUpButtonProps {
  clientId: string;
  instrumentId?: string | null;
  onSetFollowUp: (
    clientId: string,
    instrumentId: string | null,
    days: number,
    purpose?: string
  ) => Promise<void>;
  loading?: boolean;
  variant?: 'default' | 'compact';
}

export default function FollowUpButton({
  clientId,
  instrumentId,
  onSetFollowUp,
  loading = false,
  variant = 'default',
}: FollowUpButtonProps) {
  const handleFollowUp = useCallback(
    async (days: number) => {
      // FIXED: Use local date functions to avoid timezone bugs
      // Date calculation is handled in useContactLogs.setFollowUp
      await onSetFollowUp(
        clientId,
        instrumentId || null,
        days,
        `Follow-up in ${days} days`
      );
    },
    [clientId, instrumentId, onSetFollowUp]
  );

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleFollowUp(7)}
          disabled={loading}
          className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition"
          title="Follow-up in 7 days"
        >
          7d
        </button>
        <button
          type="button"
          onClick={() => handleFollowUp(30)}
          disabled={loading}
          className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition"
          title="Follow-up in 30 days"
        >
          30d
        </button>
        <button
          type="button"
          onClick={() => handleFollowUp(90)}
          disabled={loading}
          className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition"
          title="Follow-up in 90 days"
        >
          90d
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-700">Follow-up:</span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => handleFollowUp(7)}
        disabled={loading}
        className="text-xs"
      >
        In 7 days
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => handleFollowUp(30)}
        disabled={loading}
        className="text-xs"
      >
        In 30 days
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => handleFollowUp(90)}
        disabled={loading}
        className="text-xs"
      >
        In 90 days
      </Button>
    </div>
  );
}
