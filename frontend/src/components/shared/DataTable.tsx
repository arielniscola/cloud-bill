import { ReactNode } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Table,
  TableHead,
  TableFoot,
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
  /** Habilita el orden por esta columna (lo resuelve quien usa la tabla). */
  sortable?: boolean;
  /** Contenido de la fila de totales, cuando la tabla la muestra. */
  footer?: ReactNode;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  /** Filas más bajas (modo compacto). */
  dense?: boolean;
  sort?: SortState | null;
  /** Se llama con la key de la columna clickeada; el orden lo aplica el llamador. */
  onSortChange?: (key: string) => void;
  /** Muestra una fila de totales con los `footer` de cada columna. */
  showFooter?: boolean;
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
  dense = false,
  sort = null,
  onSortChange,
  showFooter = false,
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
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <TableHeader
                  key={col.key}
                  className={clsx(col.className, active && 'text-primary-600 dark:text-primary-400')}
                  dense={dense}
                  onClick={col.sortable && onSortChange ? () => onSortChange(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && active && (
                      sort!.dir === 'asc'
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                </TableHeader>
              );
            })}
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
                  <TableCell key={col.key} className={col.className} dense={dense}>
                    {col.render ? col.render(item) : getValue(item, col.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {showFooter && data.length > 0 && (
          <TableFoot>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  dense={dense}
                  className={clsx('font-semibold text-gray-900 dark:text-white border-t border-gray-200 dark:border-slate-600', col.className)}
                >
                  {col.footer ?? null}
                </TableCell>
              ))}
            </TableRow>
          </TableFoot>
        )}
      </Table>
      {pagination && pagination.total > 0 && (
        <Pagination {...pagination} />
      )}
    </div>
  );
}
