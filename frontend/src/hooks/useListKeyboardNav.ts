import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface Options {
  /** Cantidad de opciones navegables (incluida una opción "limpiar" si la hay). */
  count: number;
  isOpen: boolean;
  onSelect: (index: number) => void;
  /** Escape: cierra el desplegable sin llegar al atajo "cancelar" del formulario. */
  onEscape?: () => void;
  /** Al cambiar (p.ej. el texto buscado) el resaltado vuelve a la primera opción. */
  resetKey?: unknown;
}

const PAGE = 8;

/**
 * Lleva la opción a la vista moviendo SOLO el contenedor con scroll de la
 * lista. `scrollIntoView` también scrollea la página, y los desplegables se
 * cierran ante un scroll de la página.
 */
function scrollWithinList(root: HTMLElement, el: HTMLElement) {
  let box: HTMLElement | null = el.parentElement;
  while (box && box !== root.parentElement) {
    const overflow = getComputedStyle(box).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') break;
    box = box.parentElement;
  }
  if (!box || box === root.parentElement) return;
  const boxRect = box.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (elRect.top < boxRect.top) box.scrollTop -= boxRect.top - elRect.top;
  else if (elRect.bottom > boxRect.bottom) box.scrollTop += elRect.bottom - boxRect.bottom;
}

/**
 * Navegación con teclado para los select + buscador: flechas, PageUp/PageDown,
 * Enter elige y Escape cierra. La opción resaltada se lleva a la vista dentro
 * de la lista (`listRef`), que identifica cada opción con `data-idx`.
 */
export function useListKeyboardNav<T extends HTMLElement = HTMLDivElement>({ count, isOpen, onSelect, onEscape, resetKey }: Options) {
  const [rawIndex, setActiveIndex] = useState(0);
  const listRef = useRef<T | null>(null);
  const activeIndex = count > 0 ? Math.min(rawIndex, count - 1) : 0;

  // Al abrir o al cambiar la búsqueda, el resaltado vuelve arriba (reset en render).
  const [prev, setPrev] = useState({ resetKey, isOpen });
  if (prev.resetKey !== resetKey || prev.isOpen !== isOpen) {
    setPrev({ resetKey, isOpen });
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    if (el) scrollWithinList(listRef.current, el);
  }, [activeIndex, isOpen]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }
    const move = (next: number) => {
      e.preventDefault();
      if (count > 0) setActiveIndex(next);
    };
    if (e.key === 'ArrowDown') return move((activeIndex + 1) % Math.max(count, 1));
    if (e.key === 'ArrowUp') return move((activeIndex - 1 + count) % Math.max(count, 1));
    if (e.key === 'PageDown') return move(Math.min(activeIndex + PAGE, count - 1));
    if (e.key === 'PageUp') return move(Math.max(activeIndex - PAGE, 0));
    if (e.key === 'Enter') {
      e.preventDefault();
      if (count > 0) onSelect(activeIndex);
    }
  };

  /** Props para cada opción: ancla del scroll + resaltado al pasar el mouse. */
  const optionProps = (index: number) => ({
    'data-idx': index,
    'aria-selected': index === activeIndex,
    role: 'option' as const,
    onMouseEnter: () => setActiveIndex(index),
  });

  return { activeIndex, setActiveIndex, listRef, onKeyDown, optionProps };
}
