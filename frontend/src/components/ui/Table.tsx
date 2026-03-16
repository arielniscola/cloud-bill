import { ReactNode } from 'react';
import { clsx } from 'clsx';

export interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-gray-100 dark:divide-slate-700">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-gray-50/80 dark:bg-slate-700/50">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">{children}</tbody>
  );
}

export function TableRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      className={clsx(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-gray-50/80 dark:hover:bg-slate-700/50',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={clsx(
        'px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider',
        className
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={clsx('px-4 py-3.5 text-sm text-gray-700 dark:text-slate-300 whitespace-nowrap', className)}
    >
      {children}
    </td>
  );
}

export function TableEmpty({ message = 'No hay datos para mostrar' }: { message?: string }) {
  return (
    <tr>
      <td
        colSpan={100}
        className="px-4 py-10 text-center text-sm text-gray-400 dark:text-slate-500"
      >
        {message}
      </td>
    </tr>
  );
}
