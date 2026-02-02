import { ReactNode } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TableEmpty,
} from '../ui/Table';
import { LoadingOverlay } from '../ui/Spinner';
import Pagination from './Pagination';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  // Pagination props
  pagination?: {
    page: number;
    totalPages: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
    onLimitChange: (limit: number) => void;
  };
}

export default function DataTable<T>({
  columns,
  data,
  isLoading = false,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No hay datos para mostrar',
  pagination,
}: DataTableProps<T>) {
  const getValue = (item: T, key: string): ReactNode => {
    const keys = key.split('.');
    let value: unknown = item;
    for (const k of keys) {
      value = (value as Record<string, unknown>)?.[k];
    }
    return value as ReactNode;
  };

  return (
    <div className="relative">
      {isLoading && <LoadingOverlay />}
      <Table>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableHeader key={col.key} className={col.className}>
                {col.header}
              </TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length === 0 ? (
            <TableEmpty message={emptyMessage} />
          ) : (
            data.map((item) => (
              <TableRow
                key={keyExtractor(item)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render ? col.render(item) : getValue(item, col.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {pagination && pagination.total > 0 && (
        <Pagination {...pagination} />
      )}
    </div>
  );
}
