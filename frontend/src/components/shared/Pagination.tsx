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
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">
          Mostrando <span className="font-medium">{start}</span> a{' '}
          <span className="font-medium">{end}</span> de{' '}
          <span className="font-medium">{total}</span> resultados
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Por página:</span>
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
        <span className="text-sm text-gray-700">
          Página {page} de {totalPages}
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
