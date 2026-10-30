import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal, Button, Textarea } from '../ui';
import { useApprovalStore } from '../../stores/approval.store';

/** Pide el motivo de una acción protegida antes de mandar la solicitud al Dueño. */
export default function ApprovalReasonModal() {
  const prompt = useApprovalStore((s) => s.prompt);
  const answerPrompt = useApprovalStore((s) => s.answer);
  const [reason, setReason] = useState('');

  // El motivo se limpia al cerrar, así el próximo pedido arranca vacío.
  const answer = (value: string | null) => {
    answerPrompt(value);
    setReason('');
  };

  const submit = () => {
    const trimmed = reason.trim();
    if (trimmed) answer(trimmed);
  };

  return (
    <Modal isOpen={!!prompt} onClose={() => answer(null)} title="Requiere aprobación del Dueño" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{prompt?.actionLabel}{prompt?.entityLabel ? ` — ${prompt.entityLabel}` : ''}</p>
            <p className="mt-0.5">
              La acción no se ejecuta ahora: queda una solicitud pendiente y el comprobante se bloquea hasta que el Dueño la apruebe o rechace.
            </p>
          </div>
        </div>
        <Textarea
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Explicá por qué hay que hacerlo"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => answer(null)}>Cancelar</Button>
          <Button onClick={submit} disabled={!reason.trim()}>Enviar solicitud</Button>
        </div>
      </div>
    </Modal>
  );
}
