'use client';

import Link from 'next/link';
import { Instrument } from '@/types';
import { CardSkeleton, EmptyState } from '@/components/common';
import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';

// react-window를 dynamic import로 로드 (SSR 문제 방지)
type FixedSizeListComponent = React.ComponentType<{
  height: number;
  itemCount: number;
  itemSize: number;
  overscanCount?: number;
  className?: string;
  children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode;
}>;

const FixedSizeList = dynamic(
  () =>
    import('react-window').then(
      (mod: typeof import('react-window')) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const FixedSizeListComponent = (mod as any).FixedSizeList;
        return FixedSizeListComponent as FixedSizeListComponent;
      }
    ),
  { ssr: false }
) as FixedSizeListComponent;

interface InstrumentListProps {
  items: Instrument[];
  loading: boolean;
  onAddInstrument: () => void;
}

export default function InstrumentList({
  items,
  loading,
  onAddInstrument,
}: InstrumentListProps) {
  // 가상화 적용: 50개 이상일 때만 가상화 사용 (성능 최적화)
  // useMemo는 모든 early return 전에 호출해야 함 (React Hooks 규칙)
  const shouldVirtualize = items.length > 50;
  const itemHeight = 73; // py-4 + border height
  const listHeight = useMemo(() => {
    if (!shouldVirtualize) return null;
    // 최대 600px, 최소 400px, 또는 전체 높이
    return Math.min(600, Math.max(400, items.length * itemHeight * 0.3));
  }, [shouldVirtualize, items.length, itemHeight]);

  if (loading) {
    return <CardSkeleton count={3} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="등록된 악기가 없습니다"
        description="첫 번째 악기를 추가해서 목록을 시작해 보세요."
        actionButton={{
          label: '악기 추가하기',
          onClick: onAddInstrument,
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          ),
        }}
      />
    );
  }

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }): React.ReactElement => {
    const item = items[index];
    return (
      <div style={style} className="border-b border-gray-200">
        <div className="px-4 py-4 transition-colors duration-150 hover:bg-gray-50">
          <div className="flex items-center justify-between">
              <div className="flex items-center">
              <div className="shrink-0">
                <div className="w-8 h-8 rounded-md flex items-center justify-center bg-blue-50">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <div className="text-sm font-medium text-gray-900">
                  {item.maker} - {item.type}
                </div>
                <div className="text-sm text-gray-500">Year: {item.year}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Link
                href={`/instruments/${item.id}`}
                className="text-blue-600 hover:text-blue-500 text-sm font-medium"
              >
                View Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (shouldVirtualize && listHeight && FixedSizeList) {
    return (
      <div className="overflow-hidden border border-gray-200 rounded-lg">
        <FixedSizeList
          height={listHeight}
          itemCount={items.length}
          itemSize={itemHeight}
          overscanCount={5}
          className="virtualized-instrument-list"
        >
          {Row}
        </FixedSizeList>
      </div>
    );
  }

  // 데이터가 적을 때는 일반 렌더링 (가상화 오버헤드 방지)
  return (
    <div className="overflow-hidden border border-gray-200 rounded-lg">
      <ul className="divide-y divide-gray-200">
        {items.map(item => (
          <li
            key={item.id}
            className="px-4 py-4 transition-colors duration-150 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
              <div className="shrink-0">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center bg-blue-50">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                      />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <div className="text-sm font-medium text-gray-900">
                    {item.maker} - {item.type}
                  </div>
                  <div className="text-sm text-gray-500">Year: {item.year}</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Link
                  href={`/instruments/${item.id}`}
                  className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                >
                  View Details
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
