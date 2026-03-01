import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, Brain, Clock, Shield } from 'lucide-react';
import { Card, Button, Input } from '../../components/ui';
import { appSettingsService } from '../../services';

export default function StockSettingsCard() {
  const [deadStockDays,   setDeadStockDays]   = useState(90);
  const [safetyStockDays, setSafetyStockDays] = useState(14);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving,  setIsSaving]  = useState(false);

  useEffect(() => {
    appSettingsService.get()
      .then(data => {
        setDeadStockDays(data.deadStockDays);
        setSafetyStockDays(data.safetyStockDays);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    if (deadStockDays < 1 || safetyStockDays < 1) {
      toast.error('Los valores deben ser mayores a 0');
      return;
    }
    setIsSaving(true);
    try {
      await appSettingsService.update({ deadStockDays, safetyStockDays });
      toast.success('Configuración de stock guardada');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-48 bg-gray-100 rounded" />
          <div className="h-20 bg-gray-100 rounded-xl" />
          <div className="h-20 bg-gray-100 rounded-xl" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
          <Brain className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Stock Inteligente</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Parámetros para el análisis predictivo de inventario y alertas de reposición.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Dead stock */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 mb-0.5">Stock muerto</p>
            <p className="text-xs text-gray-400 mb-3">
              Un producto sin ventas durante este período se considera inmovilizado.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="365"
                value={String(deadStockDays)}
                onChange={e => setDeadStockDays(Math.max(1, Number(e.target.value) || 90))}
                className="w-24"
              />
              <span className="text-sm text-gray-500">días sin ventas</span>
            </div>
          </div>
        </div>

        {/* Safety stock */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Shield className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 mb-0.5">Stock de seguridad</p>
            <p className="text-xs text-gray-400 mb-3">
              Días mínimos de stock antes de necesitar reponer. Por debajo de este umbral el producto se marca como crítico.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="180"
                value={String(safetyStockDays)}
                onChange={e => setSafetyStockDays(Math.max(1, Number(e.target.value) || 14))}
                className="w-24"
              />
              <span className="text-sm text-gray-500">días de cobertura</span>
            </div>
          </div>
        </div>

        {/* Info box */}
        <div className="text-xs text-gray-400 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 space-y-1">
          <p>
            <span className="font-semibold text-indigo-600">Crítico:</span>{' '}
            stock disponible cubre menos de <strong>{safetyStockDays}</strong> días al ritmo de ventas actual.
          </p>
          <p>
            <span className="font-semibold text-amber-600">Alerta:</span>{' '}
            stock disponible cubre menos de <strong>{safetyStockDays * 2}</strong> días.
          </p>
          <p>
            <span className="font-semibold text-purple-600">Muerto:</span>{' '}
            sin ventas en los últimos <strong>{deadStockDays}</strong> días.
          </p>
        </div>

        <Button onClick={handleSave} isLoading={isSaving} size="sm">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Guardar
        </Button>
      </div>
    </Card>
  );
}
