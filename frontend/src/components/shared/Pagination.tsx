import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Select } from '../ui';
import { PAGE_SIZE_OPTIONS } from '../../utils/constants';

export interface PaginationProps {
  page: number;
  totalPages: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  limit,
  total,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-500">
          Mostrando <span className="font-medium text-gray-700">{start}</span> a{' '}
          <span className="font-medium text-gray-700">{end}</span> de{' '}
          <span className="font-medium text-gray-700">{total}</span> resultados
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Por página:</span>
          <Select
            options={PAGE_SIZE_OPTIONS.map((size) => ({
              value: size.toString(),
              label: size.toString(),
            }))}
            value={limit.toString()}
            onChange={(value) => onLimitChange(parseInt(value))}
            className="w-20"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs text-gray-500">
          Página <span className="font-medium text-gray-700">{page}</span> de{' '}
          <span className="font-medium text-gray-700">{totalPages}</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
