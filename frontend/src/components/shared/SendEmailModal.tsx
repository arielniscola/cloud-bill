import { useState, useEffect } from 'react';
import { Mail, Send, AlertCircle, X } from 'lucide-react';
import { Modal, Button, Input } from '../ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSend: (to: string) => Promise<void>;
  defaultEmail?: string;
  documentLabel: string;
}

/** Best-effort error → user-friendly message extractor. */
function extractErrorMessage(err: unknown): string {
  const e = err as {
    response?: { data?: { message?: string; errors?: Record<string, string[]> } };
    message?: string;
  };
  // Validation errors (e.g., from Zod): pick the first
  if (e?.response?.data?.errors) {
    const allMsgs = Object.values(e.response.data.errors).flat();
    if (allMsgs.length > 0) return allMsgs[0];
  }
  if (e?.response?.data?.message) return e.response.data.message;
  if (e?.message) return e.message;
  return 'No se pudo enviar el correo. Intentalo nuevamente.';
}

export default function SendEmailModal({ isOpen, onClose, onSend, defaultEmail, documentLabel }: Props) {
  const [to, setTo]           = useState(defaultEmail ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTo(defaultEmail ?? '');
      setError(null);
    }
  }, [isOpen, defaultEmail]);

  const handleSend = async () => {
    if (!to.trim()) return;
    setError(null);
    setSending(true);
    try {
      await onSend(to.trim());
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enviar por correo"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
          <Mail className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
          <p className="text-sm text-indigo-700 dark:text-indigo-300">{documentLabel}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-0.5">No se pudo enviar el correo</p>
              <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed break-words">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 shrink-0"
              aria-label="Cerrar mensaje de error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            Destinatario
          </label>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="cliente@email.com"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSend} isLoading={sending} disabled={!to.trim()}>
            <Send className="w-4 h-4 mr-2" />
            {error ? 'Reintentar' : 'Enviar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
