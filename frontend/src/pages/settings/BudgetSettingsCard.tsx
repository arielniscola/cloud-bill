import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, FileText, Receipt } from 'lucide-react';
import { Button, Select } from '../../components/ui';
import { appSettingsService, cashRegistersService } from '../../services';
import type { CashRegister } from '../../types';

export default function BudgetSettingsCard() {
  const [cashRegisters,            setCashRegisters]            = useState<CashRegister[]>([]);
  const [budgetCashRegisterId,     setBudgetCashRegisterId]     = useState<string>('');
  const [invoiceCashRegisterId,    setInvoiceCashRegisterId]    = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving,  setIsSaving]  = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [settingsData, crData] = await Promise.all([
          appSettingsService.get(),
          cashRegistersService.getAll(true),
        ]);
        setCashRegisters(crData);
        setBudgetCashRegisterId( settingsData.defaultBudgetCashRegisterId  ?? '');
        setInvoiceCashRegisterId(settingsData.defaultInvoiceCashRegisterId ?? '');
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await appSettingsService.update({
        defaultBudgetCashRegisterId:  budgetCashRegisterId  || null,
        defaultInvoiceCashRegisterId: invoiceCashRegisterId || null,
      });
      toast.success('Configuración guardada');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
        <div className="h-5 w-48 bg-gray-100 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-100 rounded-lg" />
          <div className="h-10 bg-gray-100 rounded-lg" />
        </div>
      </div>
    );
  }

  const cashRegisterOptions = [
    { value: '', label: 'Sin caja predeterminada' },
    ...cashRegisters.map((cr) => ({ value: cr.id, label: cr.name })),
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900">Cajas predeterminadas</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Pre-selección de caja al registrar cobros de facturas y presupuestos.
        </p>
      </div>

      <div className="space-y-5">
        {/* Invoice default */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 mb-1">Facturas</p>
            <p className="text-xs text-gray-400 mb-3">
              Caja pre-seleccionada al marcar una factura como pagada.
            </p>
            <Select
              options={cashRegisterOptions}
              value={invoiceCashRegisterId}
              onChange={setInvoiceCashRegisterId}
            />
          </div>
        </div>

        {/* Budget default */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Receipt className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 mb-1">Presupuestos</p>
            <p className="text-xs text-gray-400 mb-3">
              Caja pre-seleccionada al cobrar facturas generadas desde presupuestos.
            </p>
            <Select
              options={cashRegisterOptions}
              value={budgetCashRegisterId}
              onChange={setBudgetCashRegisterId}
            />
          </div>
        </div>

        <Button onClick={handleSave} isLoading={isSaving} size="sm">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Guardar
        </Button>
      </div>
    </div>
  );
}
