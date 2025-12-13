'use client';

import { memo } from 'react';
import { classNames } from '@/utils/classNames';

interface SkeletonProps {
  className?: string;
}

// 기본 스켈레톤 원소
const SkeletonElement = memo(function SkeletonElement({
  className,
}: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className || ''}`} />
  );
});

// 테이블 행 스켈레톤
interface TableRowSkeletonProps {
  columns: number;
  className?: string;
}

export const TableRowSkeleton = memo(function TableRowSkeleton({
  columns,
  className = '',
}: TableRowSkeletonProps) {
  return (
    <tr className={className}>
      {[...Array(columns)].map((_, i) => (
        <td key={i} className="px-6 py-4">
          <SkeletonElement className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
});

// 리스트 스켈레톤 (ItemList 스타일)
interface ListSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const ListSkeleton = memo(function ListSkeleton({
  rows = 5,
  columns = 5,
  className = '',
}: ListSkeletonProps) {
  return (
    <div
      className={`rounded-xl border border-gray-100 bg-white shadow-sm ${className}`}
    >
      <div className="p-6">
        <div className="space-y-4">
          {[...Array(rows)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center space-x-4">
                {[...Array(columns)].map((_, j) => (
                  <div
                    key={j}
                    className="h-4 bg-gray-200 rounded"
                    style={{
                      width: j === 0 ? '25%' : '16.66%',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// 카드 스켈레톤
interface CardSkeletonProps {
  count?: number;
  className?: string;
}

export const CardSkeleton = memo(function CardSkeleton({
  count = 1,
  className = '',
}: CardSkeletonProps) {
  return (
    <div className={className}>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse bg-white rounded-lg shadow border border-gray-200 p-6 mb-4"
        >
          <div className="space-y-4">
            <SkeletonElement className="h-4 w-3/4" />
            <SkeletonElement className="h-4 w-1/2" />
            <SkeletonElement className="h-4 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
});

// 스피너 + 텍스트 로딩 (ClientList용)
interface SpinnerLoadingProps {
  message?: string;
  className?: string;
}

export const SpinnerLoading = memo(function SpinnerLoading({
  message = 'Loading...',
  className = '',
}: SpinnerLoadingProps) {
  return (
    <div
      className={`bg-white rounded-lg shadow border border-gray-200 ${className}`}
    >
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <div className="text-gray-500 text-lg">{message}</div>
      </div>
    </div>
  );
});

// 테이블 스켈레톤 (전체 테이블)
interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  header?: boolean;
}

export const TableSkeleton = memo(function TableSkeleton({
  rows = 5,
  columns = 6,
  header = true,
}: TableSkeletonProps) {
  return (
    <div className={classNames.tableWrapper}>
      <div className={classNames.tableContainer}>
        <table className={classNames.table}>
          {header && (
            <thead className={classNames.tableHeader}>
              <tr>
                {[...Array(columns)].map((_, i) => (
                  <th
                    key={i}
                    className={classNames.tableHeaderCell}
                  >
                    <SkeletonElement className="h-3 w-20" />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className={classNames.tableBody}>
            {[...Array(rows)].map((_, i) => (
              <TableRowSkeleton key={i} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const SkeletonComponents = {
  Element: SkeletonElement,
  List: ListSkeleton,
  Card: CardSkeleton,
  Table: TableSkeleton,
  TableRow: TableRowSkeleton,
  Spinner: SpinnerLoading,
};

export default SkeletonComponents;
