import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Modal } from '../ui';
import { usersService } from '../../services';
import { useAuthStore } from '../../stores';

const MIN_LENGTH = 8;

/** Cambio de la propia contraseña, disponible para cualquier rol desde el menú. */
export default function ChangePasswordModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, setAuth } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrent(''); setNext(''); setRepeat(''); setError(null);
  }, [isOpen]);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== next;
  const canSubmit = !!current && next.length >= MIN_LENGTH && repeat === next;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      // Las demás sesiones se cierran; ésta sigue con el token nuevo.
      const token = await usersService.changeMyPassword(current, next);
      if (user) setAuth(user, token);
      toast.success('Contraseña actualizada');
      onClose();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'No se pudo cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cambiar contraseña" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Contraseña actual"
          name="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={error ?? undefined}
          autoFocus
        />
        <Input
          label="Contraseña nueva"
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={tooShort ? `Mínimo ${MIN_LENGTH} caracteres` : undefined}
          hint={`Mínimo ${MIN_LENGTH} caracteres`}
        />
        <Input
          label="Repetir contraseña nueva"
          name="repeat-password"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={mismatch ? 'No coincide con la contraseña nueva' : undefined}
        />
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Al cambiarla se cierran tus sesiones en otros dispositivos.
        </p>
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={saving} disabled={!canSubmit}>Cambiar contraseña</Button>
        </div>
      </form>
    </Modal>
  );
}
