import { useState, useEffect } from 'react';
import { Mail, Send } from 'lucide-react';
import { Modal, Button, Input } from '../ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSend: (to: string) => Promise<void>;
  defaultEmail?: string;
  documentLabel: string;
}

export default function SendEmailModal({ isOpen, onClose, onSend, defaultEmail, documentLabel }: Props) {
  const [to, setTo]           = useState(defaultEmail ?? '');
  const [sending, setSending] = useState(false);

  // Sync defaultEmail when modal opens
  useEffect(() => {
    if (isOpen) setTo(defaultEmail ?? '');
  }, [isOpen, defaultEmail]);

  const handleSend = async () => {
    if (!to.trim()) return;
    setSending(true);
    try {
      await onSend(to.trim());
      onClose();
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
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSend} isLoading={sending} disabled={!to.trim()}>
            <Send className="w-4 h-4 mr-2" />
            Enviar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
