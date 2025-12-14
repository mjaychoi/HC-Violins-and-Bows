'use client';

import { useState, useCallback } from 'react';
import { ContactLog, ContactType, ContactPurpose } from '@/types';
import { formatDisplayDate } from '@/utils/dateParsing';
import { todayLocalYMD } from '@/utils/dateParsing';
import Button from '@/components/common/Button';

interface ContactLogProps {
  clientId: string;
  instrumentId?: string | null;
  contactLogs: ContactLog[];
  onAddContact: (
    contact: Omit<
      ContactLog,
      'id' | 'created_at' | 'updated_at' | 'client' | 'instrument'
    >
  ) => Promise<unknown>;
  onUpdateContact: (
    id: string,
    updates: Partial<ContactLog>
  ) => Promise<unknown>;
  onDeleteContact: (id: string) => Promise<void>;
  loading?: boolean;
}

const contactTypeLabels: Record<ContactType, string> = {
  email: '📧 이메일',
  phone: '📞 전화',
  meeting: '🤝 미팅',
  note: '📝 메모',
  follow_up: '⏰ Follow-up',
};

const purposeLabels: Record<ContactPurpose, string> = {
  quote: '견적',
  follow_up: 'Follow-up',
  maintenance: '유지보수',
  sale: '판매',
  inquiry: '문의',
  other: '기타',
};

export default function ContactLogComponent({
  clientId,
  instrumentId,
  contactLogs,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  loading = false,
}: ContactLogProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    contact_type: 'note' as ContactType,
    subject: '',
    content: '',
    contact_date: todayLocalYMD(),
    next_follow_up_date: '',
    purpose: null as ContactPurpose | null,
  });

  const handleAdd = useCallback(async () => {
    if (!formData.content.trim()) return;

    await onAddContact({
      client_id: clientId,
      instrument_id: instrumentId || null,
      contact_type: formData.contact_type,
      subject: formData.subject || null,
      content: formData.content.trim(),
      contact_date: formData.contact_date,
      next_follow_up_date: formData.next_follow_up_date || null,
      follow_up_completed_at: null,
      purpose: formData.purpose,
    });

    // Reset form
    setFormData({
      contact_type: 'note',
      subject: '',
      content: '',
      contact_date: todayLocalYMD(),
      next_follow_up_date: '',
      purpose: null,
    });
    setIsAdding(false);
  }, [clientId, instrumentId, formData, onAddContact]);

  const handleUpdate = useCallback(
    async (id: string) => {
      await onUpdateContact(id, {
        subject: formData.subject || null,
        content: formData.content.trim(),
        contact_date: formData.contact_date,
        next_follow_up_date: formData.next_follow_up_date || null,
        purpose: formData.purpose,
      });
      setEditingId(null);
      setFormData({
        contact_type: 'note',
        subject: '',
        content: '',
        contact_date: todayLocalYMD(),
        next_follow_up_date: '',
        purpose: null,
      });
    },
    [formData, onUpdateContact]
  );

  const startEdit = useCallback((log: ContactLog) => {
    setEditingId(log.id);
    setFormData({
      contact_type: log.contact_type,
      subject: log.subject || '',
      content: log.content,
      contact_date: log.contact_date,
      next_follow_up_date: log.next_follow_up_date || '',
      purpose: log.purpose,
    });
  }, []);

  const sortedLogs = [...contactLogs].sort((a, b) => {
    return b.contact_date.localeCompare(a.contact_date);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">연락 기록</h4>
        {!isAdding && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setIsAdding(true)}
            disabled={loading}
          >
            + Add Contact
          </Button>
        )}
      </div>

      {/* Add Form */}
      {isAdding && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                연락 유형
              </label>
              <select
                value={formData.contact_type}
                onChange={e =>
                  setFormData({
                    ...formData,
                    contact_type: e.target.value as ContactType,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5"
              >
                {Object.entries(contactTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                연락 목적
              </label>
              <select
                value={formData.purpose || ''}
                onChange={e =>
                  setFormData({
                    ...formData,
                    purpose: (e.target.value || null) as ContactPurpose | null,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5"
              >
                <option value="">선택 안 함</option>
                {Object.entries(purposeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(formData.contact_type === 'email' ||
            formData.contact_type === 'meeting') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                제목
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={e =>
                  setFormData({ ...formData, subject: e.target.value })
                }
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5"
                placeholder="이메일 제목 또는 미팅 주제"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              내용 *
            </label>
            <textarea
              value={formData.content}
              onChange={e =>
                setFormData({ ...formData, content: e.target.value })
              }
              rows={3}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5"
              placeholder="연락 내용을 입력하세요"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                연락 날짜
              </label>
              <input
                type="date"
                value={formData.contact_date}
                onChange={e =>
                  setFormData({ ...formData, contact_date: e.target.value })
                }
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Next Follow-up
              </label>
              <input
                type="date"
                value={formData.next_follow_up_date}
                onChange={e =>
                  setFormData({
                    ...formData,
                    next_follow_up_date: e.target.value,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setIsAdding(false);
                setFormData({
                  contact_type: 'note',
                  subject: '',
                  content: '',
                  contact_date: todayLocalYMD(),
                  next_follow_up_date: '',
                  purpose: null,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!formData.content.trim() || loading}
              loading={loading}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Contact Logs List */}
      <div className="space-y-2">
        {sortedLogs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            연락 기록이 없습니다
          </p>
        ) : (
          sortedLogs.map(log => {
            const isEditing = editingId === log.id;

            return (
              <div
                key={log.id}
                className="bg-white border border-gray-200 rounded-lg p-3 space-y-2"
              >
                {isEditing ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          제목
                        </label>
                        <input
                          type="text"
                          value={formData.subject}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              subject: e.target.value,
                            })
                          }
                          className="w-full text-xs border border-gray-300 rounded-md px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          연락 날짜
                        </label>
                        <input
                          type="date"
                          value={formData.contact_date}
                          onChange={e =>
                            setFormData({
                              ...formData,
                              contact_date: e.target.value,
                            })
                          }
                          className="w-full text-xs border border-gray-300 rounded-md px-2 py-1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        내용
                      </label>
                      <textarea
                        value={formData.content}
                        onChange={e =>
                          setFormData({ ...formData, content: e.target.value })
                        }
                        rows={2}
                        className="w-full text-xs border border-gray-300 rounded-md px-2 py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Next Follow-up
                      </label>
                      <input
                        type="date"
                        value={formData.next_follow_up_date}
                        onChange={e =>
                          setFormData({
                            ...formData,
                            next_follow_up_date: e.target.value,
                          })
                        }
                        className="w-full text-xs border border-gray-300 rounded-md px-2 py-1"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingId(null);
                          setFormData({
                            contact_type: 'note',
                            subject: '',
                            content: '',
                            contact_date: todayLocalYMD(),
                            next_follow_up_date: '',
                            purpose: null,
                          });
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleUpdate(log.id)}
                        disabled={!formData.content.trim() || loading}
                        loading={loading}
                      >
                        Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-700">
                            {contactTypeLabels[log.contact_type]}
                          </span>
                          {log.purpose && (
                            <span className="text-xs text-gray-500">
                              · {purposeLabels[log.purpose]}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {formatDisplayDate(log.contact_date)}
                          </span>
                        </div>
                        {log.subject && (
                          <p className="text-sm font-medium text-gray-900 mb-1">
                            {log.subject}
                          </p>
                        )}
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {log.content}
                        </p>
                        {log.next_follow_up_date && (
                          <div className="mt-2 flex items-center gap-1">
                            <span className="text-xs text-amber-600 font-medium">
                              ⏰ Next Contact:
                            </span>
                            <span className="text-xs text-amber-700">
                              {formatDisplayDate(log.next_follow_up_date)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => startEdit(log)}
                          className="text-xs text-gray-400 hover:text-blue-600"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteContact(log.id)}
                          className="text-xs text-gray-400 hover:text-red-600"
                          title="Delete"
                          disabled={loading}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
