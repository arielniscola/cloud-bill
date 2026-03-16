import { useEffect, useRef } from 'react';

export interface FormKeyboardShortcutsOptions {
  onSubmit: () => void;
  onAddItem: () => void;
  onCancel: () => void;
  onDuplicateLastItem: () => void;
  onDeleteLastItem: () => void;
  onFocusBarcode?: () => void;
}

/**
 * Atajos de teclado globales para formularios de facturas/presupuestos.
 *
 * Ctrl+Enter   → guardar (submit)
 * Alt+A        → agregar ítem
 * Ctrl+D       → duplicar último ítem
 * Alt+Supr     → eliminar último ítem
 * Ctrl+B       → enfocar lector de código de barras
 * Escape       → cancelar / volver (solo si no hay un campo de texto enfocado)
 */
export function useFormKeyboardShortcuts(options: FormKeyboardShortcutsOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const opts = optionsRef.current;
      const active = document.activeElement;
      const isTextField =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement;

      // Ctrl+Enter → submit (funciona incluso dentro de campos)
      if (e.ctrlKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault();
        opts.onSubmit();
        return;
      }

      // Alt+A → agregar ítem
      if (e.altKey && !e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        opts.onAddItem();
        return;
      }

      // Ctrl+D → duplicar último ítem
      if (e.ctrlKey && !e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        opts.onDuplicateLastItem();
        return;
      }

      // Alt+Delete → eliminar último ítem
      if (e.altKey && !e.ctrlKey && e.key === 'Delete') {
        e.preventDefault();
        opts.onDeleteLastItem();
        return;
      }

      // Ctrl+B → enfocar barcode input
      if (e.ctrlKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        opts.onFocusBarcode?.();
        return;
      }

      // Escape → cancelar (solo si no hay un campo de texto enfocado)
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !isTextField) {
        opts.onCancel();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
