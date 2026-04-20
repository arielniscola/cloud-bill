import { useState, useEffect } from 'react';
import { Shield, ShieldOff, Eye, Check } from 'lucide-react';
import { useFiscalModeStore, type FiscalModeView } from '../../stores/fiscalMode.store';

type Option = {
  value: FiscalModeView;
  label: string;
  description: string;
  icon: React.ElementType;
  accent: string;
};

const OPTIONS: Option[] = [
  {
    value: 'FORMAL',
    label: 'Formal',
    description: 'Operaciones declaradas a AFIP',
    icon: Shield,
    accent: 'text-indigo-500',
  },
  {
    value: 'INFORMAL',
    label: 'Informal',
    description: 'Operaciones no informadas',
    icon: ShieldOff,
    accent: 'text-amber-500',
  },
  {
    value: 'ALL',
    label: 'Todo',
    description: 'Ver ambos contextos juntos',
    icon: Eye,
    accent: 'text-slate-500',
  },
];

export function FiscalModeQuickSwitch() {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const { viewMode, setViewMode } = useFiscalModeStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      const idx = OPTIONS.findIndex((o) => o.value === viewMode);
      setActiveIdx(idx >= 0 ? idx : 0);
    }
  }, [open, viewMode]);

  const choose = (value: FiscalModeView) => {
    setViewMode(value);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, OPTIONS.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(OPTIONS[activeIdx].value);
    }
    if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      choose(OPTIONS[parseInt(e.key, 10) - 1].value);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-x-0 top-[18vh] z-50 mx-auto w-full max-w-md px-4">
        <div
          className="rounded-2xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-gray-200 dark:ring-slate-700 overflow-hidden outline-none"
          tabIndex={-1}
          autoFocus
          onKeyDown={handleKeyDown}
          ref={(el) => el?.focus()}
        >
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Cambiar contexto fiscal
            </h2>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Elegí el modo activo para toda la aplicación
            </p>
          </div>

          <div className="py-2">
            {OPTIONS.map((opt, idx) => {
              const Icon = opt.icon;
              const isActive = idx === activeIdx;
              const isCurrent = opt.value === viewMode;
              return (
                <button
                  key={opt.value}
                  onClick={() => choose(opt.value)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 ${opt.accent}`}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className={`block text-sm font-medium ${
                        isActive
                          ? 'text-indigo-700 dark:text-indigo-300'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-slate-500">
                      {opt.description}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {isCurrent && (
                      <Check className="w-4 h-4 text-emerald-500" />
                    )}
                    <kbd className="kbd text-xs">{idx + 1}</kbd>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 text-xs text-gray-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <kbd className="kbd">↑↓</kbd> navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">↵</kbd> aplicar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">1-3</kbd> acceso directo
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <kbd className="kbd">Esc</kbd> cerrar
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
