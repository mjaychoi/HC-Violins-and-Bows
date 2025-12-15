import { useState, useCallback, useEffect } from 'react';
import { addDays, format } from 'date-fns';
import { ContactLog } from '@/types';
import { useErrorHandler } from '@/contexts/ToastContext';
import { useLoadingState } from '@/hooks/useLoadingState';
import { todayLocalYMD } from '@/utils/dateParsing';

interface UseContactLogsOptions {
  clientId?: string;
  instrumentId?: string | null;
  autoFetch?: boolean;
}

export function useContactLogs({
  clientId,
  instrumentId,
  autoFetch = true,
}: UseContactLogsOptions = {}) {
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([]);
  const { loading, submitting, withSubmitting } = useLoadingState();
  const { handleError } = useErrorHandler();

  const fetchContactLogs = useCallback(async () => {
    if (!clientId) {
      setContactLogs([]);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set('clientId', clientId);
      if (instrumentId) {
        params.set('instrumentId', instrumentId);
      }

      const response = await fetch(`/api/contacts?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch contact logs');
      }

      setContactLogs(result.data || []);
    } catch (error) {
      handleError(error, 'Fetch contact logs');
    }
  }, [clientId, instrumentId, handleError]);

  useEffect(() => {
    if (autoFetch && clientId) {
      fetchContactLogs();
    }
  }, [autoFetch, clientId, fetchContactLogs]);

  const addContact = useCallback(
    async (
      contact: Omit<
        ContactLog,
        'id' | 'created_at' | 'updated_at' | 'client' | 'instrument'
      >
    ) => {
      return withSubmitting(async () => {
        try {
          const response = await fetch('/api/contacts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(contact),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Failed to create contact log');
          }

          await fetchContactLogs();
          return result.data as ContactLog;
        } catch (error) {
          handleError(error, 'Create contact log');
          throw error;
        }
      });
    },
    [withSubmitting, fetchContactLogs, handleError]
  );

  const updateContact = useCallback(
    async (id: string, updates: Partial<ContactLog>) => {
      return withSubmitting(async () => {
        try {
          const response = await fetch('/api/contacts', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id, ...updates }),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Failed to update contact log');
          }

          await fetchContactLogs();
          return result.data as ContactLog;
        } catch (error) {
          handleError(error, 'Update contact log');
          throw error;
        }
      });
    },
    [withSubmitting, fetchContactLogs, handleError]
  );

  const deleteContact = useCallback(
    async (id: string) => {
      return withSubmitting(async () => {
        try {
          const response = await fetch(`/api/contacts?id=${id}`, {
            method: 'DELETE',
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Failed to delete contact log');
          }

          await fetchContactLogs();
        } catch (error) {
          handleError(error, 'Delete contact log');
          throw error;
        }
      });
    },
    [withSubmitting, fetchContactLogs, handleError]
  );

  const setFollowUp = useCallback(
    async (
      clientId: string,
      instrumentId: string | null,
      days: number,
      purpose?: string
    ) => {
      return withSubmitting(async () => {
        try {
          // FIXED: Use local date functions to avoid timezone bugs
          const base = new Date(); // local
          const contactDateStr = todayLocalYMD(); // local ymd
          const followUpDateStr = format(addDays(base, days), 'yyyy-MM-dd'); // local ymd

          // Create a follow-up contact log
          await addContact({
            client_id: clientId,
            instrument_id: instrumentId,
            contact_type: 'follow_up',
            subject: null,
            content: purpose || `Follow-up scheduled for ${days} days`,
            contact_date: contactDateStr,
            next_follow_up_date: followUpDateStr,
            follow_up_completed_at: null,
            purpose: 'follow_up',
          });
        } catch (error) {
          handleError(error, 'Set follow-up');
          throw error;
        }
      });
    },
    [withSubmitting, addContact, handleError]
  );

  const completeFollowUp = useCallback(
    async (contactLogId: string) => {
      return withSubmitting(async () => {
        try {
          const response = await fetch('/api/contacts', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: contactLogId,
              follow_up_completed_at: new Date().toISOString(),
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Failed to complete follow-up');
          }

          await fetchContactLogs();
          return result.data as ContactLog;
        } catch (error) {
          handleError(error, 'Complete follow-up');
          throw error;
        }
      });
    },
    [withSubmitting, fetchContactLogs, handleError]
  );

  const postponeFollowUp = useCallback(
    async (contactLogId: string, days: number) => {
      return withSubmitting(async () => {
        try {
          const base = new Date();
          const newFollowUpDate = format(addDays(base, days), 'yyyy-MM-dd');

          const response = await fetch('/api/contacts', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: contactLogId,
              next_follow_up_date: newFollowUpDate,
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Failed to postpone follow-up');
          }

          await fetchContactLogs();
          return result.data as ContactLog;
        } catch (error) {
          handleError(error, 'Postpone follow-up');
          throw error;
        }
      });
    },
    [withSubmitting, fetchContactLogs, handleError]
  );

  return {
    contactLogs,
    loading,
    submitting,
    fetchContactLogs,
    addContact,
    updateContact,
    deleteContact,
    setFollowUp,
    completeFollowUp,
    postponeFollowUp,
  };
}
