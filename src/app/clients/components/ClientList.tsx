'use client';
// src/app/clients/components/ClientList.tsx
import { Client, ClientInstrument } from '@/types';
import { getTagTextColor, sortTags } from '../utils';
import { useClientSalesData } from '../hooks/useClientKPIs';
import { useClientsContactInfo } from '../hooks/useClientsContactInfo';
import React, {
  useState,
  memo,
  useCallback,
  Fragment,
  forwardRef,
  useMemo,
} from 'react';
import ClientTagSelector from './ClientTagSelector';
import InterestSelector from './InterestSelector';
import { classNames, cn } from '@/utils/classNames';
import {
  Pagination,
  EmptyState,
  TagBadge,
  InterestBadge,
} from '@/components/common';
import dynamic from 'next/dynamic';

const MessageComposer = dynamic(
  () => import('@/components/messages/MessageComposer'),
  { ssr: false }
);

// SortIcon - dynamic import 위에 정의하여 promise로 감싸지지 않도록 함
const SortIcon = React.memo(({ arrow }: { arrow: string }) => (
  <span aria-hidden className="inline-block w-3">
    {arrow}
  </span>
));
SortIcon.displayName = 'SortIcon';

// ✅ FIXED: Table elements moved to file top to prevent recreation on every render
const TableOuterElement = forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>((props, ref) => <table ref={ref} {...props} className="w-full" />);
TableOuterElement.displayName = 'TableOuterElement';

const TbodyInnerElement = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>((props, ref) => (
  <tbody ref={ref} {...props} className={classNames.tableBody} />
));
TbodyInnerElement.displayName = 'TbodyInnerElement';

// ✅ FIXED: RowActions moved to file top to prevent recreation on every render
// Row Actions Component (Dropdown menu like Dashboard)
const RowActions = memo(
  ({ onEdit, onDelete }: { onEdit: () => void; onDelete?: () => void }) => {
    // ✅ RowActions state - safe now that virtualization is removed
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="relative flex justify-start">
        {onDelete && (
          <button
            type="button"
            aria-label="Delete client"
            className="sr-only"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        )}
        <button
          onClick={e => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="p-1.5 rounded-md hover:bg-gray-50 transition-colors duration-200"
          aria-label="More actions"
          aria-expanded={isOpen}
        >
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute left-0 z-20 mt-2 w-32 rounded-md border border-gray-200 bg-white shadow-lg">
              <button
                onClick={e => {
                  e.stopPropagation();
                  onEdit();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Edit
              </button>
              {onDelete && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDelete();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors duration-200"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);
RowActions.displayName = 'RowActions';

// Client Expanded Row Component (with sales data)
const ClientExpandedRow = memo(function ClientExpandedRow({
  client,
  contactInfo,
  instrument,
}: {
  client: Client;
  contactInfo: ReturnType<typeof useClientsContactInfo>['getContactInfo'];
  instrument?: ClientInstrument['instrument'];
}) {
  const { totalSpend, purchaseCount, lastPurchaseDate, loading } =
    useClientSalesData(client.id);
  const info = contactInfo(client.id);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <tr className="bg-gray-50">
      <td
        colSpan={9}
        className={cn(classNames.tableCell, 'text-sm text-gray-700 px-6 py-4')}
      >
        <div className="space-y-4">
          {/* Sales Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-xs font-medium text-gray-500 mb-1">
                Total Spend
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {loading ? (
                  <span className="text-gray-400">Loading...</span>
                ) : (
                  formatAmount(totalSpend)
                )}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-xs font-medium text-gray-500 mb-1">
                Purchase Count
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {loading ? (
                  <span className="text-gray-400">Loading...</span>
                ) : (
                  purchaseCount
                )}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-xs font-medium text-gray-500 mb-1">
                Last Purchase
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {loading ? (
                  <span className="text-gray-400">Loading...</span>
                ) : (
                  lastPurchaseDate
                )}
              </div>
            </div>
          </div>

          {/* Contact Info Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-xs font-medium text-gray-500 mb-1">
                Recent Contact
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {info?.lastContactDateDisplay || (
                  <span className="text-gray-400">None</span>
                )}
                {info && info.daysSinceLastContact !== null && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({info.daysSinceLastContact} days ago)
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="text-xs font-medium text-gray-500 mb-1">
                Next Follow-up
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {info?.nextFollowUpDateDisplay ? (
                  info && (
                    <span
                      className={
                        info.isOverdue
                          ? 'text-red-600'
                          : info.daysUntilFollowUp !== null &&
                              info.daysUntilFollowUp <= 3
                            ? 'text-amber-600'
                            : ''
                      }
                    >
                      {info.nextFollowUpDateDisplay}
                      {info.daysUntilFollowUp !== null && (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          (
                          {info.daysUntilFollowUp < 0
                            ? `${Math.abs(info.daysUntilFollowUp)} days overdue`
                            : info.daysUntilFollowUp === 0
                              ? 'Today'
                              : `${info.daysUntilFollowUp} days later`}
                          )
                        </span>
                      )}
                      {info.isOverdue && (
                        <span className="ml-2 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          overdue
                        </span>
                      )}
                    </span>
                  )
                ) : (
                  <span className="text-gray-400">None</span>
                )}
              </div>
            </div>
          </div>

          {/* Client Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500">Email</div>
              <div className="font-medium">{client.email || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Contact</div>
              <div className="font-medium">{client.contact_number || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Interest</div>
              <div className="font-medium">{client.interest || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Client #</div>
              <div className="font-mono">{client.client_number || '—'}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-gray-500">Tags</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {client.tags?.length ? (
                  sortTags([...client.tags]).map(tag => (
                    <TagBadge key={tag} tag={tag} context="table" />
                  ))
                ) : (
                  <span className="text-gray-400">No tags</span>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-gray-500">Note</div>
              <div className="mt-1 whitespace-pre-wrap">
                {client.note || '—'}
              </div>
            </div>
          </div>

          {/* Message Composer */}
          <div className="pt-4 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Send Message
            </h4>
            <MessageComposer client={client} instrument={instrument || null} />
          </div>
        </div>
      </td>
    </tr>
  );
});

// TODO: Virtualization will be implemented when needed for 200+ clients
// Currently using pagination (20 items per page) which is sufficient
// When implementing, uncomment the following code:
// type VariableSizeListProps = {
//   height: number;
//   itemCount: number;
//   itemSize: (index: number) => number;
//   overscanCount?: number;
//   className?: string;
//   children: (props: {
//     index: number;
//     style: React.CSSProperties;
//   }) => React.ReactNode;
//   onItemsRendered?: (props: {
//     overscanStartIndex: number;
//     overscanStopIndex: number;
//     visibleStartIndex: number;
//     visibleStopIndex: number;
//   }) => void;
// };
// const VariableSizeList = dynamic(...);

interface ClientListProps {
  clients: Client[];
  clientInstruments: ClientInstrument[];
  onClientClick: (client: Client) => void; // Kept for interface compatibility but not used (handles expand instead)
  onUpdateClient: (clientId: string, updates: Partial<Client>) => Promise<void>;
  onDeleteClient?: (client: Client) => void;
  onColumnSort: (column: keyof Client) => void;
  getSortArrow: (column: keyof Client) => string;
  // UX: For displaying instrument count and recent activity
  clientsWithInstruments?: Set<string>;
  // Pagination
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  /** 필터/검색이 활성화되어 있는지 여부 (빈 상태 메시지/버튼 제어) */
  hasActiveFilters?: boolean;
  /** 모든 필터/검색 리셋 핸들러 */
  onResetFilters?: () => void;
  /** 새 클라이언트 추가 CTA가 필요할 때 */
  onAddClient?: () => void;
}

const ClientList = memo(function ClientList({
  clients,
  clientInstruments,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClientClick: _onClientClick, // Prefixed with _ to indicate intentionally unused
  onUpdateClient,
  onDeleteClient,
  onColumnSort,
  getSortArrow,
  clientsWithInstruments: _clientsWithInstruments = new Set(), // eslint-disable-line @typescript-eslint/no-unused-vars
  // Pagination
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  loading = false,
  hasActiveFilters = false,
  onResetFilters,
  onAddClient,
}: ClientListProps) {
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  // Fetch contact info for all clients
  const clientIds = useMemo(() => clients.map(c => c.id), [clients]);
  const { getContactInfo, loading: contactInfoLoading } = useClientsContactInfo(
    {
      clientIds,
      enabled: clients.length > 0,
    }
  );
  // Dead code: instrument dropdown 관련 코드 제거 (현재 사용되지 않음)
  // const [showInstrumentDropdown, setShowInstrumentDropdown] = useState<
  //   string | null
  // >(null);
  // const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  // const dropdownRef = useRef<HTMLDivElement>(null);

  // ✅ Removed unused: clientInstrumentCounts, clientLastActivity, formatRelativeTime

  const startEditing = useCallback((client: Client) => {
    setEditingClient(client.id);
    setEditData({
      first_name: client.first_name || '',
      last_name: client.last_name || '',
      email: client.email || '',
      contact_number: client.contact_number || '',
      interest: client.interest || '',
      note: client.note || '',
      tags: client.tags || [],
      client_number: client.client_number || '',
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingClient(null);
    setEditData({});
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editingClient) return;

    setIsSaving(true);
    try {
      await onUpdateClient(editingClient, editData);
      // Only close editing mode if update was successful
      // If updateClient returns null or throws an error, editing mode will remain open
      setEditingClient(null);
      setEditData({});
    } catch {
      // Error is handled by parent component's error handler
      // Don't close editing mode on error - let user see the error and retry
      // Editing mode remains open so user can fix the issue and try again
    } finally {
      setIsSaving(false);
    }
  }, [editingClient, editData, onUpdateClient]);

  const handleEditFieldChange = useCallback(
    (field: keyof Client, value: Client[keyof Client] | string | string[]) => {
      setEditData(prev => ({ ...prev, [field]: value as never }));
    },
    []
  );

  // Handle full name change - split into first_name and last_name
  const handleFullNameChange = useCallback((fullName: string) => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setEditData(prev => ({ ...prev, first_name: '', last_name: '' }));
      return;
    }

    const parts = trimmedName.split(/\s+/);
    if (parts.length === 1) {
      // Only one word - treat as first name
      setEditData(prev => ({ ...prev, first_name: parts[0], last_name: '' }));
    } else {
      // Multiple words - last word is last name, rest is first name
      const lastName = parts[parts.length - 1];
      const firstName = parts.slice(0, -1).join(' ');
      setEditData(prev => ({
        ...prev,
        first_name: firstName,
        last_name: lastName,
      }));
    }
  }, []);

  // TODO: Virtualization will be implemented when needed for 200+ clients
  // Currently using pagination (20 items per page) which is sufficient
  // const shouldVirtualize = clients.length >= 50;
  // const rowHeightRef = useRef<Map<number, number>>(new Map());
  // const listRef = useRef<{ resetAfterIndex: (index: number) => void } | null>(null);
  // const getRowHeight = useCallback(...);
  // const listHeight = useMemo(...);

  if (clients.length === 0) {
    return (
      <EmptyState
        title={
          hasActiveFilters
            ? 'No clients found matching your filters'
            : 'No clients yet'
        }
        description={
          hasActiveFilters
            ? 'Try adjusting your filters or clearing them to see all clients.'
            : 'Add your first client to start tracking relationships and instruments.'
        }
        hasActiveFilters={hasActiveFilters}
        onResetFilters={hasActiveFilters ? onResetFilters : undefined}
        actionButton={
          !hasActiveFilters && onAddClient
            ? { label: 'Add client', onClick: onAddClient }
            : undefined
        }
      />
    );
  }

  return (
    <div className={`${classNames.tableWrapper} relative`}>
      <div className={`${classNames.tableContainer} -mx-4 sm:mx-0`}>
        <div className="inline-block min-w-full align-middle">
          <div className="overflow-hidden">
            <table className={classNames.table}>
              <thead className={classNames.tableHeader}>
                <tr>
                  <th className={`${classNames.tableHeaderCell} text-right`}>
                    <span>Actions</span>
                  </th>
                  <th
                    className={cn(classNames.tableHeaderCellSortable, 'group')}
                    onClick={() => onColumnSort('first_name')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Name
                      <span
                        className={`opacity-0 group-hover:opacity-100 ${getSortArrow('first_name') !== '' ? 'opacity-100 text-gray-900' : ''}`}
                      >
                        <SortIcon arrow={getSortArrow('first_name')} />
                      </span>
                    </span>
                  </th>
                  <th
                    className={cn(classNames.tableHeaderCellSortable, 'group')}
                    onClick={() => onColumnSort('contact_number')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Contact
                      <span
                        className={`opacity-0 group-hover:opacity-100 ${getSortArrow('contact_number') !== '' ? 'opacity-100 text-gray-900' : ''}`}
                      >
                        <SortIcon arrow={getSortArrow('contact_number')} />
                      </span>
                    </span>
                  </th>
                  <th
                    className={cn(classNames.tableHeaderCellSortable, 'group')}
                    onClick={() => onColumnSort('tags')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Tags
                      <span
                        className={`opacity-0 group-hover:opacity-100 ${getSortArrow('tags') !== '' ? 'opacity-100 text-gray-900' : ''}`}
                      >
                        <SortIcon arrow={getSortArrow('tags')} />
                      </span>
                    </span>
                  </th>
                  <th
                    className={cn(classNames.tableHeaderCellSortable, 'group')}
                    onClick={() => onColumnSort('interest')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Interest
                      <span
                        className={`opacity-0 group-hover:opacity-100 ${getSortArrow('interest') !== '' ? 'opacity-100 text-gray-900' : ''}`}
                      >
                        <SortIcon arrow={getSortArrow('interest')} />
                      </span>
                    </span>
                  </th>
                  <th
                    className={cn(classNames.tableHeaderCellSortable, 'group')}
                    onClick={() => onColumnSort('client_number')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Client #
                      <span
                        className={`opacity-0 group-hover:opacity-100 ${getSortArrow('client_number') !== '' ? 'opacity-100 text-gray-900' : ''}`}
                      >
                        <SortIcon arrow={getSortArrow('client_number')} />
                      </span>
                    </span>
                  </th>
                  <th className={classNames.tableHeaderCell}>
                    <span className="inline-flex items-center gap-1">
                      Recent Contact
                    </span>
                  </th>
                  <th className={classNames.tableHeaderCell}>
                    <span className="inline-flex items-center gap-1">
                      Next Follow-up
                    </span>
                  </th>
                </tr>
              </thead>
              {/* ✅ FIXED: Removed virtualization - pagination handles large lists */}
              <tbody className={classNames.tableBody}>
                {clients.map(client => {
                  const fullName =
                    `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
                    'N/A';

                  const isExpanded = expandedClientId === client.id;

                  return (
                    <Fragment key={client.id}>
                      <tr
                        onClick={() => {
                          // ✅ FIXED: Only handle expand, not onClientClick (UX improvement)
                          if (editingClient === client.id) return;
                          setExpandedClientId(prev =>
                            prev === client.id ? null : client.id
                          );
                        }}
                        className={cn(
                          classNames.tableRow,
                          'cursor-pointer group',
                          editingClient === client.id ? 'bg-blue-50' : '',
                          'hover:bg-blue-50/30 transition-colors'
                        )}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (editingClient !== client.id) {
                              setExpandedClientId(prev =>
                                prev === client.id ? null : client.id
                              );
                            }
                          }
                        }}
                        aria-label={`Toggle details for ${fullName}`}
                        aria-expanded={isExpanded}
                      >
                        <td
                          className={cn(
                            classNames.tableCell,
                            'text-left relative'
                          )}
                        >
                          {editingClient === client.id ? (
                            <div className="flex items-center justify-end gap-0.5 relative z-10">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  saveEditing();
                                }}
                                disabled={isSaving}
                                className="text-green-600 hover:text-green-700 disabled:opacity-50 transition-all duration-200 hover:scale-110 p-1.5 rounded-md hover:bg-green-50"
                                title="Save changes"
                              >
                                {isSaving ? (
                                  <svg
                                    className="w-4 h-4 animate-spin"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  cancelEditing();
                                }}
                                disabled={isSaving}
                                className="text-red-600 hover:text-red-700 disabled:opacity-50 transition-all duration-200 hover:scale-110 p-1.5 rounded-md hover:bg-red-50"
                                title="Cancel editing"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <RowActions
                              onEdit={() => startEditing(client)}
                              onDelete={
                                onDeleteClient
                                  ? () => onDeleteClient(client)
                                  : undefined
                              }
                            />
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {editingClient === client.id ? (
                            <div className="min-w-[200px] space-y-2">
                              <input
                                type="text"
                                value={`${editData.first_name || ''} ${editData.last_name || ''}`.trim()}
                                onChange={e =>
                                  handleFullNameChange(e.target.value)
                                }
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={e => e.stopPropagation()}
                                placeholder="Full name"
                              />
                              <input
                                type="email"
                                value={editData.email || ''}
                                onChange={e =>
                                  handleEditFieldChange('email', e.target.value)
                                }
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={e => e.stopPropagation()}
                                placeholder="Email"
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedClientId(prev =>
                                  prev === client.id ? null : client.id
                                );
                              }}
                              className="w-full text-left min-w-[150px] focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-sm"
                              aria-expanded={expandedClientId === client.id}
                              aria-controls={`client-details-${client.id}`}
                            >
                              <div className="flex items-center">
                                <div className="text-sm font-medium text-gray-900">
                                  {fullName}
                                </div>
                              </div>
                              {client.email && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {client.email}
                                </div>
                              )}
                              {client.note && (
                                <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                                  {client.note}
                                </div>
                              )}
                            </button>
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {editingClient === client.id ? (
                            <div className="min-w-[150px]">
                              <input
                                type="tel"
                                value={editData.contact_number || ''}
                                onChange={e =>
                                  handleEditFieldChange(
                                    'contact_number',
                                    e.target.value
                                  )
                                }
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                onClick={e => e.stopPropagation()}
                                placeholder="Phone number"
                              />
                            </div>
                          ) : (
                            <div className="text-sm text-gray-900 min-w-[120px]">
                              {client.contact_number ? (
                                <span>{client.contact_number}</span>
                              ) : (
                                <span className="text-gray-400">
                                  No contact
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {editingClient === client.id ? (
                            <div className="min-w-[150px]">
                              <ClientTagSelector
                                selectedTags={editData.tags || []}
                                onChange={next =>
                                  handleEditFieldChange(
                                    'tags',
                                    next as string[]
                                  )
                                }
                                className="space-y-1.5"
                                optionClassName="flex items-center cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors duration-150"
                                checkboxClassName="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                labelClassName="ml-2 text-xs font-medium"
                                getLabelClassName={tag => getTagTextColor(tag)}
                                stopPropagation
                              />
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1 min-w-[120px]">
                              {sortTags([...(client.tags ?? [])]).map(tag => (
                                <TagBadge key={tag} tag={tag} context="table" />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {editingClient === client.id ? (
                            <div className="min-w-[120px]">
                              <InterestSelector
                                value={editData.interest || ''}
                                onChange={value =>
                                  handleEditFieldChange('interest', value)
                                }
                                selectClassName="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Select interest"
                                stopPropagation
                              />
                            </div>
                          ) : (
                            <div className="text-sm min-w-[100px]">
                              {client.interest ? (
                                <InterestBadge
                                  interest={client.interest}
                                  context="table"
                                />
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {editingClient === client.id ? (
                            <input
                              type="text"
                              value={editData.client_number || ''}
                              onChange={e =>
                                handleEditFieldChange(
                                  'client_number',
                                  e.target.value
                                )
                              }
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={e => e.stopPropagation()}
                              placeholder="Client #"
                            />
                          ) : (
                            <div className="text-sm text-gray-400 font-mono">
                              {client.client_number || '—'}
                            </div>
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {contactInfoLoading ? (
                            <div className="text-sm text-gray-400">...</div>
                          ) : (
                            <div className="text-sm text-gray-900 min-w-[120px]">
                              {(() => {
                                const info = getContactInfo(client.id);
                                if (!info?.lastContactDateDisplay) {
                                  return (
                                    <span className="text-gray-400">None</span>
                                  );
                                }
                                return (
                                  <div className="flex flex-col">
                                    <span>{info.lastContactDateDisplay}</span>
                                    {info.daysSinceLastContact !== null && (
                                      <span className="text-xs text-gray-500">
                                        {info.daysSinceLastContact} days ago
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {contactInfoLoading ? (
                            <div className="text-sm text-gray-400">...</div>
                          ) : (
                            <div className="text-sm text-gray-900 min-w-[140px]">
                              {(() => {
                                const info = getContactInfo(client.id);
                                if (!info?.nextFollowUpDateDisplay) {
                                  return (
                                    <span className="text-gray-400">None</span>
                                  );
                                }
                                return (
                                  <div className="flex flex-col gap-1">
                                    <span
                                      className={
                                        info.isOverdue
                                          ? 'text-red-600 font-medium'
                                          : info.daysUntilFollowUp !== null &&
                                              info.daysUntilFollowUp <= 3
                                            ? 'text-amber-600 font-medium'
                                            : ''
                                      }
                                    >
                                      {info.nextFollowUpDateDisplay}
                                    </span>
                                    {info.daysUntilFollowUp !== null && (
                                      <span className="text-xs text-gray-500">
                                        {info.daysUntilFollowUp < 0
                                          ? `${Math.abs(info.daysUntilFollowUp)} days overdue`
                                          : info.daysUntilFollowUp === 0
                                            ? 'Today'
                                            : `${info.daysUntilFollowUp} days later`}
                                      </span>
                                    )}
                                    {info.isOverdue && (
                                      <span className="inline-flex items-center text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full w-fit">
                                        overdue
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                      </tr>
                      {/* ✅ Expanded row - only render when expanded */}
                      {isExpanded && (
                        <ClientExpandedRow
                          client={client}
                          contactInfo={getContactInfo}
                          instrument={
                            clientInstruments
                              .filter(ci => ci.client_id === client.id)
                              .map(ci => ci.instrument)
                              .find(
                                instr => instr !== null && instr !== undefined
                              ) || undefined
                          }
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Pagination */}
      {totalPages !== undefined && totalPages > 1 && (
        <div className="border-t border-gray-200 px-6 py-4">
          <Pagination
            currentPage={currentPage || 1}
            totalPages={totalPages}
            onPageChange={onPageChange || (() => {})}
            loading={loading}
            totalCount={totalCount}
            pageSize={pageSize}
          />
        </div>
      )}
    </div>
  );
});

export default ClientList;
