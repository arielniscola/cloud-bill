import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, MapPin, CornerDownLeft } from 'lucide-react';
import type { Localidad } from '../../types';
import { useLocalidades, findLocalidadByName } from './localidadesCatalog';
import { normalizeProvincia } from './provinciasCatalog';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Se dispara además de onChange con la localidad elegida del catálogo (null si es texto libre o se limpia). */
  onSelectLocalidad?: (localidad: Localidad | null) => void;
  /** Provincia elegida en el formulario: la lista muestra solo sus localidades (y las sin provincia). */
  provincia?: string | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const MAX_RENDERED = 150;

/**
 * Selector de localidad con buscador sobre el catálogo (parametrización). El
 * valor guardado sigue siendo el NOMBRE (`city`). Si lo buscado no está en el
 * catálogo se puede usar igual como texto libre, para no frenar la carga.
 */
export function LocalidadSelect({
  value, onChange, onSelectLocalidad, provincia,
  placeholder = 'Seleccionar localidad…', className, disabled,
}: Props) {
  const localidades = useLocalidades();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => findLocalidadByName(localidades, value, provincia), [localidades, value, provincia]);
  const outOfCatalog = !!value && !selected && localidades.length > 0;

  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 320;
    const showAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 260),
      zIndex: 9999,
      ...(showAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  useEffect(() => {
    // preventScroll: sin posición fija todavía, el scroll de la página lo cerraría.
    if (isOpen) { updatePosition(); inputRef.current?.focus({ preventScroll: true }); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => { setIsOpen(false); setQuery(''); };
    // El scroll DENTRO del propio desplegable (rueda o flechas) no lo cierra.
    const onScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  const inProvincia = useMemo(() => {
    if (!provincia) return localidades;
    const p = normalizeProvincia(provincia);
    return localidades.filter((l) => !l.provinciaName || normalizeProvincia(l.provinciaName) === p);
  }, [localidades, provincia]);

  const filtered = useMemo(() => {
    const q = normalizeProvincia(query);
    if (!q) return inProvincia;
    return inProvincia.filter((l) =>
      normalizeProvincia(l.name).includes(q) || (l.postalCode ?? '').includes(query.trim()));
  }, [inProvincia, query]);

  const shown = filtered.slice(0, MAX_RENDERED);
  const typed = query.trim();
  // Texto libre: solo si lo escrito no coincide exacto con una opción listada.
  const freeOption = typed.length >= 2 && !filtered.some((l) => normalizeProvincia(l.name) === normalizeProvincia(typed));

  const close = () => { setIsOpen(false); setQuery(''); };

  const handleSelect = (localidad: Localidad) => {
    onChange(localidad.name);
    onSelectLocalidad?.(localidad);
    close();
  };

  const handleFree = () => {
    onChange(typed);
    onSelectLocalidad?.(null);
    close();
  };

  const { activeIndex, listRef, onKeyDown, optionProps } = useListKeyboardNav({
    count: shown.length + (freeOption ? 1 : 0),
    isOpen,
    resetKey: query,
    onSelect: (idx) => {
      if (idx < shown.length) handleSelect(shown[idx]);
      else if (freeOption) handleFree();
    },
    onEscape: close,
  });

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    onSelectLocalidad?.(null);
  };

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
        >
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
            {shown.length === 0 && !freeOption ? (
              <div className="px-4 py-6 text-center">
                <MapPin className="w-6 h-6 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  {localidades.length === 0
                    ? 'Sin localidades cargadas — escribí el nombre'
                    : provincia ? `Sin localidades de ${provincia} — escribí el nombre` : 'Escribí para buscar'}
                </p>
                <a href="/localidades" className="text-xs text-indigo-500 underline">Configurar localidades</a>
              </div>
            ) : (
              <>
                {shown.map((l, idx) => {
                  const isSelected = selected?.id === l.id;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      {...optionProps(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(l)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors duration-100 ${
                        isSelected
                          ? isActive ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-indigo-50 dark:bg-indigo-900/30'
                          : isActive ? 'bg-gray-100 dark:bg-slate-700' : ''
                      }`}
                    >
                      <span className={`flex-1 text-sm truncate leading-tight ${isSelected ? 'text-indigo-700 dark:text-indigo-400 font-medium' : 'text-gray-800 dark:text-slate-200'}`}>
                        {l.name}
                        {!provincia && l.provinciaName && (
                          <span className="text-xs text-gray-400 dark:text-slate-500"> · {l.provinciaName}</span>
                        )}
                      </span>
                      {l.postalCode && (
                        <span className="font-mono text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">CP {l.postalCode}</span>
                      )}
                    </button>
                  );
                })}
                {filtered.length > MAX_RENDERED && (
                  <p className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">
                    {filtered.length - MAX_RENDERED} más — seguí escribiendo para filtrar
                  </p>
                )}
                {freeOption && (
                  <button
                    type="button"
                    {...optionProps(shown.length)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleFree}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left border-t border-gray-100 dark:border-slate-700 transition-colors duration-100 ${
                      activeIndex === shown.length ? 'bg-gray-100 dark:bg-slate-700' : ''
                    }`}
                  >
                    <CornerDownLeft className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-slate-300 truncate">
                      Usar «{typed}» <span className="text-xs text-gray-400 dark:text-slate-500">(fuera del catálogo)</span>
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  const baseCls = className ??
    'w-full text-sm px-2 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white';

  return (
    <div ref={containerRef} className="relative w-full">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => { if (!disabled) setIsOpen(true); }}
          disabled={disabled}
          className={`${baseCls} flex items-center gap-2 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {value ? (
            <>
              <span className="flex-1 truncate text-gray-900 dark:text-slate-200">
                {selected?.name ?? value}
                {outOfCatalog && <span className="text-xs text-amber-600 dark:text-amber-400"> (fuera del catálogo)</span>}
              </span>
              {!disabled && (
                <span
                  role="button"
                  onClick={handleClear}
                  className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                  title="Limpiar"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
            </>
          ) : (
            <>
              <span className="flex-1 text-gray-400 dark:text-slate-500 truncate">{placeholder}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" />
            </>
          )}
        </button>
      ) : (
        <div className={`${baseCls} flex items-center gap-2 border-indigo-400`}>
          <Search className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar localidad o C.P.…"
            className="flex-1 text-sm bg-transparent outline-none border-0 p-0 focus:ring-0 placeholder-gray-400 dark:placeholder-slate-500 dark:text-slate-200 min-w-0"
          />
          <button
            type="button"
            onClick={close}
            className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {dropdown}
    </div>
  );
}

export default LocalidadSelect;
