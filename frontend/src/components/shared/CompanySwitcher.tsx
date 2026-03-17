import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useCompanyStore } from '../../stores/company.store';

interface CompanySwitcherProps {
  /** When true shows the full name + dropdown; when false (collapsed sidebar) shows only the icon */
  showText?: boolean;
}

export default function CompanySwitcher({ showText = true }: CompanySwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { companies, activeCompanyId, setActiveCompany, activeCompany } = useCompanyStore();
  const current = activeCompany();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!current && companies.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => companies.length > 1 && setOpen((o) => !o)}
        title={!showText ? (current?.name ?? 'Empresa') : undefined}
        className={clsx(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors duration-150',
          'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
          !showText && 'md:justify-center',
          companies.length <= 1 && 'cursor-default',
        )}
      >
        <Building2 className="w-[18px] h-[18px] flex-shrink-0 text-slate-500" />
        {showText && (
          <>
            <span className="flex-1 text-left leading-none truncate text-[12px] text-slate-400">
              {current?.name ?? 'Empresa'}
            </span>
            {companies.length > 1 && (
              <ChevronDown
                className={clsx(
                  'w-3.5 h-3.5 text-slate-600 flex-shrink-0 transition-transform duration-200',
                  open && 'rotate-180'
                )}
              />
            )}
          </>
        )}
      </button>

      {open && companies.length > 1 && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-slate-700">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Cambiar empresa
            </p>
          </div>
          <ul className="py-1 max-h-52 overflow-y-auto">
            {companies.map((company) => {
              const isSelected = activeCompanyId === company.id || (!activeCompanyId && companies.indexOf(company) === 0);
              return (
                <li key={company.id}>
                  <button
                    onClick={() => { setActiveCompany(company.id); setOpen(false); }}
                    className={clsx(
                      'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors',
                      isSelected
                        ? 'text-indigo-300 bg-indigo-600/10'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                    )}
                  >
                    <Building2 className="w-4 h-4 flex-shrink-0 opacity-60" />
                    <span className="flex-1 truncate">{company.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
