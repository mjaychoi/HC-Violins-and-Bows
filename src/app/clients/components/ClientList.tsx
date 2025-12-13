'use client';
// src/app/clients/components/ClientList.tsx
import { Client, ClientInstrument } from '@/types';
import {
  getTagColor,
  getTagTextColor,
  sortTags,
  /* formatClientContact, getClientInitials */ getInterestColor,
} from '../utils';
import React, { useState, memo, useCallback, Fragment, useMemo, forwardRef } from 'react';
import dynamic from 'next/dynamic';
import ClientTagSelector from './ClientTagSelector';
import InterestSelector from './InterestSelector';
import { classNames, cn } from '@/utils/classNames';
import { Pagination, EmptyState } from '@/components/common';

// SortIcon - dynamic import 위에 정의하여 promise로 감싸지지 않도록 함
const SortIcon = React.memo(({ arrow }: { arrow: string }) => (
  <span aria-hidden className="inline-block w-3">
    {arrow}
  </span>
));
SortIcon.displayName = 'SortIcon';

// react-window를 dynamic import로 로드 (SSR 문제 방지)
// react-window v2 uses List component (FixedSizeList is removed in v2)
// Note: react-window v2 API is different - using rowComponent prop instead of children
type FixedSizeListProps = {
  height: number;
  itemCount: number;
  itemSize: number;
  overscanCount?: number;
  className?: string;
  outerElementType?: React.ElementType;
  innerElementType?: React.ElementType;
  children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode;
};

// react-window를 dynamic import로 로드 (SSR 문제 방지)
// react-window v2 uses List component (FixedSizeList is removed in v2)
// Using v1 API compatibility for FixedSizeList
type FixedSizeListComponent = React.ComponentType<{
  height: number;
  itemCount: number;
  itemSize: number;
  overscanCount?: number;
  className?: string;
  outerElementType?: React.ElementType;
  innerElementType?: React.ElementType;
  children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode;
}>;

const FixedSizeList = dynamic(
  () =>
    import('react-window').then(
      (mod: typeof import('react-window')) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const FixedSizeListComponent = (mod as any).FixedSizeList;
        if (!FixedSizeListComponent) {
          // Fallback if FixedSizeList is not available (v2)
          console.warn('FixedSizeList not found in react-window, using fallback');
          return ((props: FixedSizeListProps) => {
            return (
              <div style={{ height: props.height }}>
                {Array.from({ length: props.itemCount }, (_, index) => {
                  const style: React.CSSProperties = {
                    height: props.itemSize,
                    position: 'relative',
                  };
                  return (
                    <div key={index} style={style}>
                      {props.children({ index, style })}
                    </div>
                  );
                })}
              </div>
            );
          }) as FixedSizeListComponent;
        }
        return FixedSizeListComponent as FixedSizeListComponent;
      }
    ),
  { ssr: false }
) as FixedSizeListComponent;

interface ClientListProps {
  clients: Client[];
  clientInstruments: ClientInstrument[];
  onClientClick: (client: Client) => void;
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
}

const ClientList = memo(function ClientList({
  clients,
  clientInstruments,
  onClientClick,
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
}: ClientListProps) {
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  // Dead code: instrument dropdown 관련 코드 제거 (현재 사용되지 않음)
  // const [showInstrumentDropdown, setShowInstrumentDropdown] = useState<
  //   string | null
  // >(null);
  // const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');
  // const dropdownRef = useRef<HTMLDivElement>(null);

  // UX: Calculate instrument count per client and last activity
  const clientInstrumentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    clientInstruments.forEach(rel => {
      if (rel.client_id) {
        counts.set(rel.client_id, (counts.get(rel.client_id) || 0) + 1);
      }
    });
    return counts;
  }, [clientInstruments]);

  // UX: Calculate last activity date (using created_at as fallback since updated_at may not exist)
  const clientLastActivity = useMemo(() => {
    const activityMap = new Map<string, Date>();
    
    // Use client's created_at as baseline (updated_at might not exist in type)
    // Type-safe access to optional updated_at property
    type ClientWithOptionalUpdatedAt = Client & { updated_at?: string };
    type RelationshipWithOptionalUpdatedAt = ClientInstrument & { updated_at?: string };
    
    clients.forEach(client => {
      const clientWithUpdated = client as ClientWithOptionalUpdatedAt;
      if (clientWithUpdated.updated_at) {
        activityMap.set(client.id, new Date(clientWithUpdated.updated_at));
      } else if (client.created_at) {
        activityMap.set(client.id, new Date(client.created_at));
      }
    });
    
    // Update with most recent instrument relationship update
    clientInstruments.forEach(rel => {
      if (rel.client_id) {
        const relWithUpdated = rel as RelationshipWithOptionalUpdatedAt;
        const relDate = relWithUpdated.updated_at 
          ? new Date(relWithUpdated.updated_at)
          : rel.created_at 
            ? new Date(rel.created_at)
            : null;
        if (relDate) {
          const existing = activityMap.get(rel.client_id);
          if (!existing || relDate > existing) {
            activityMap.set(rel.client_id, relDate);
          }
        }
      }
    });
    
    return activityMap;
  }, [clients, clientInstruments]);

  // UX: Format relative time (e.g., "3 days ago")
  const formatRelativeTime = useCallback((date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    }
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }, []);

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

  // 가상화 적용: 50개 이상일 때만 가상화 사용 (성능 최적화)
  const shouldVirtualize = clients.length > 50;
  const itemHeight = 72; // py-4 + border height (대략, 확장된 행 포함)
  const listHeight = useMemo(() => {
    if (!shouldVirtualize) return null;
    // 최대 600px, 최소 400px, 또는 전체 높이의 70%
    return Math.min(600, Math.max(400, clients.length * itemHeight * 0.3));
  }, [shouldVirtualize, clients.length, itemHeight]);

  // 테이블 구조를 유지하기 위한 커스텀 엘리먼트 타입
  const TableOuterElement = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
    (props, ref) => <table ref={ref} {...props} className="w-full" />
  );
  TableOuterElement.displayName = 'TableOuterElement';

  const TbodyInnerElement = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
    (props, ref) => <tbody ref={ref} {...props} className={classNames.tableBody} />
  );
  TbodyInnerElement.displayName = 'TbodyInnerElement';

  if (clients.length === 0) {
    return (
      <EmptyState
        title="등록된 고객이 없습니다"
        description="검색어나 필터를 조정하거나 첫 번째 고객을 추가해 보세요."
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
              <th className={`${classNames.tableHeaderCell} text-right`}>Actions</th>
              <th
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
                className={classNames.tableHeaderCellSortable}
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
            </tr>
          </thead>
          {shouldVirtualize && listHeight && FixedSizeList ? (
            <FixedSizeList
              height={listHeight}
              itemCount={clients.length}
              itemSize={itemHeight}
              overscanCount={5}
              outerElementType={TableOuterElement}
              innerElementType={TbodyInnerElement}
              className="virtualized-client-list"
            >
              {({ index, style }: { index: number; style: React.CSSProperties }) => {
                const client = clients[index];
                const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'N/A';
                const normalizedEmail = client.email?.trim();
                const hasEmail = Boolean(normalizedEmail);
                const emailSubject = encodeURIComponent(
                  `Message to ${fullName !== 'N/A' ? fullName : 'client'}`
                );
                const emailGreeting =
                  fullName !== 'N/A'
                    ? `안녕하세요 ${fullName},`
                    : '안녕하세요,';
                const emailBody = encodeURIComponent(`${emailGreeting}\n\n`);
                const mailtoHref = hasEmail
                  ? `mailto:${normalizedEmail}?subject=${emailSubject}&body=${emailBody}`
                  : '';

                return (
                  <tr
                    key={client.id}
                    style={style}
                    onClick={() => {
                      if (editingClient === client.id) return;
                      setExpandedClientId(prev =>
                        prev === client.id ? null : client.id
                      );
                      onClientClick(client);
                    }}
                    className={cn(
                      classNames.tableRow,
                      'cursor-pointer',
                      editingClient === client.id ? 'bg-blue-50' : ''
                    )}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (editingClient !== client.id) {
                          onClientClick(client);
                        }
                      }
                    }}
                    aria-label={`View details for ${fullName}`}
                  >
                    <td className={cn(classNames.tableCell, 'text-left relative')}>
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
                        onView={() => onClientClick(client)}
                        onEdit={() => startEditing(client)}
                        onEmail={hasEmail && mailtoHref ? () => { window.location.href = mailtoHref; } : undefined}
                        onDelete={onDeleteClient ? () => onDeleteClient(client) : undefined}
                      />
                    )}
                  </td>
                  <td className={classNames.tableCell}>
                    {editingClient === client.id ? (
                      <div className="min-w-[200px] space-y-2">
                        <input
                          type="text"
                          value={`${editData.first_name || ''} ${editData.last_name || ''}`.trim()}
                          onChange={e => handleFullNameChange(e.target.value)}
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
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-900">
                            {fullName}
                          </div>
                          <span
                            className="text-gray-400 text-xs"
                            aria-hidden
                          >
                            {expandedClientId === client.id ? '▲' : '▼'}
                          </span>
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
                        <span className="text-gray-400">No contact</span>
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
                          handleEditFieldChange('tags', next as string[])
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
                        <span
                          key={tag}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                        >
                          {tag}
                        </span>
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
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getInterestColor(client.interest)}`}
                        >
                          {client.interest}
                        </span>
                      ) : (
                        <span className="text-gray-400">No interest</span>
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
                        handleEditFieldChange('client_number', e.target.value)
                      }
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onClick={e => e.stopPropagation()}
                      placeholder="Client #"
                    />
                  ) : (
                    <div className="text-sm text-gray-900 font-mono">
                      {client.client_number || '—'}
                    </div>
                  )}
                </td>
              </tr>
              );
            }}
            </FixedSizeList>
          ) : (
              <tbody className={classNames.tableBody}>
                {clients.map(client => {
                  const fullName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'N/A';
                  const normalizedEmail = client.email?.trim();
                  const hasEmail = Boolean(normalizedEmail);
                  const emailSubject = encodeURIComponent(
                    `Message to ${fullName !== 'N/A' ? fullName : 'client'}`
                  );
                  const emailGreeting =
                    fullName !== 'N/A'
                      ? `안녕하세요 ${fullName},`
                      : '안녕하세요,';
                  const emailBody = encodeURIComponent(`${emailGreeting}\n\n`);
                  const mailtoHref = hasEmail
                    ? `mailto:${normalizedEmail}?subject=${emailSubject}&body=${emailBody}`
                    : '';

                  const isExpanded = expandedClientId === client.id;

                  return (
                    <Fragment key={client.id}>
                      <tr
                        onClick={() => {
                          if (editingClient === client.id) return;
                          setExpandedClientId(prev =>
                            prev === client.id ? null : client.id
                          );
                          onClientClick(client);
                        }}
                        className={cn(
                          classNames.tableRow,
                          'cursor-pointer',
                          editingClient === client.id ? 'bg-blue-50' : ''
                        )}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (editingClient !== client.id) {
                              onClientClick(client);
                            }
                          }
                        }}
                        aria-label={`View details for ${fullName}`}
                      >
                        <td className={cn(classNames.tableCell, 'text-left relative')}>
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
                              onView={() => onClientClick(client)}
                              onEdit={() => startEditing(client)}
                              onEmail={hasEmail && mailtoHref ? () => { window.location.href = mailtoHref; } : undefined}
                              onDelete={onDeleteClient ? () => onDeleteClient(client) : undefined}
                            />
                          )}
                        </td>
                        <td className={classNames.tableCell}>
                          {editingClient === client.id ? (
                            <div className="min-w-[200px] space-y-2">
                              <input
                                type="text"
                                value={`${editData.first_name || ''} ${editData.last_name || ''}`.trim()}
                                onChange={e => handleFullNameChange(e.target.value)}
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
                              aria-expanded={isExpanded}
                              aria-controls={`client-details-${client.id}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium text-gray-900">
                                  {fullName}
                                </div>
                                <span
                                  className="text-gray-400 text-xs"
                                  aria-hidden
                                >
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              </div>
                              {client.email && (
                                <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                  <span aria-hidden="true">📧</span>
                                  {client.email}
                                </div>
                              )}
                              {/* UX: Display instrument count and recent activity */}
                              <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                                {(() => {
                                  const instrumentCount = clientInstrumentCounts.get(client.id) || 0;
                                  const lastActivity = clientLastActivity.get(client.id);
                                  return (
                                    <>
                                      {instrumentCount > 0 && (
                                        <div className="flex items-center gap-1">
                                          <span aria-hidden="true">🎻</span>
                                          <span>Instruments: {instrumentCount}</span>
                                        </div>
                                      )}
                                      {lastActivity && (
                                        <div className="flex items-center gap-1">
                                          <span aria-hidden="true">🕒</span>
                                          <span>Last activity: {formatRelativeTime(lastActivity)}</span>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
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
                                <span className="text-gray-400">No contact</span>
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
                                  handleEditFieldChange('tags', next as string[])
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
                                <span
                                  key={tag}
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                                >
                                  {tag}
                                </span>
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
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getInterestColor(client.interest)}`}
                                >
                                  {client.interest}
                                </span>
                              ) : (
                                <span className="text-gray-400">No interest</span>
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
                                handleEditFieldChange('client_number', e.target.value)
                              }
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onClick={e => e.stopPropagation()}
                              placeholder="Client #"
                            />
                          ) : (
                            <div className="text-sm text-gray-900 font-mono">
                              {client.client_number || '—'}
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className={cn(classNames.tableCell, 'text-sm text-gray-700')}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs text-gray-500">Email</div>
                                <div className="font-medium">
                                  {client.email || '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500">Contact</div>
                                <div className="font-medium">
                                  {client.contact_number || '—'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500">Interest</div>
                                <div className="font-medium">
                                  {client.interest || '—'}
                                </div>
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
                                      <span
                                        key={tag}
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                                      >
                                        {tag}
                                      </span>
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            )}
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

// Row Actions Component (Dropdown menu like Dashboard)
const RowActions = ({
  onView,
  onEdit,
  onEmail,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onEmail?: () => void;
  onDelete?: () => void;
}) => {
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
        onClick={(e) => {
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
              onClick={(e) => {
                e.stopPropagation();
                onView();
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
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View
            </button>
            <button
              onClick={(e) => {
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
            {onEmail && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEmail();
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
                    d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Email
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
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
};

export default ClientList;
