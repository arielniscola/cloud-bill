import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, FileText, Building2 } from 'lucide-react';
import { Button, Select } from '../../components/ui';
import { appSettingsService, cashRegistersService } from '../../services';
import type { CashRegister } from '../../types';

const COMPANY_TAX_OPTIONS = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable Inscripto' },
  { value: 'MONOTRIBUTISTA',        label: 'Monotributista' },
  { value: 'EXENTO',                label: 'Exento' },
];

export default function BudgetSettingsCard() {
  const [cashRegisters,            setCashRegisters]            = useState<CashRegister[]>([]);
  const [invoiceCashRegisterId,    setInvoiceCashRegisterId]    = useState<string>('');
  const [companyTaxCondition,      setCompanyTaxCondition]      = useState<string>('RESPONSABLE_INSCRIPTO');
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
        setInvoiceCashRegisterId(settingsData.defaultInvoiceCashRegisterId ?? '');
        setCompanyTaxCondition(  settingsData.companyTaxCondition          ?? 'RESPONSABLE_INSCRIPTO');
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
        defaultInvoiceCashRegisterId: invoiceCashRegisterId || null,
        companyTaxCondition,
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
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 animate-pulse">
        <div className="h-5 w-48 bg-gray-100 dark:bg-slate-700 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
          <div className="h-10 bg-gray-100 dark:bg-slate-700 rounded-lg" />
        </div>
      </div>
    );
  }

  const cashRegisterOptions = [
    { value: '', label: 'Sin caja predeterminada' },
    ...cashRegisters.map((cr) => ({ value: cr.id, label: cr.name })),
  ];

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Configuración general</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Pre-selección de caja al registrar cobros de facturas y condición fiscal de la empresa.
        </p>
      </div>

      <div className="space-y-5">
        {/* Invoice default */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200 mb-1">Facturas</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
              Caja pre-seleccionada al marcar una factura como pagada.
            </p>
            <Select
              options={cashRegisterOptions}
              value={invoiceCashRegisterId}
              onChange={setInvoiceCashRegisterId}
            />
          </div>
        </div>

        {/* Company tax condition */}
        <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-slate-200 mb-1">Condición fiscal de la empresa</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
              Determina el tipo de comprobante auto-seleccionado al elegir un cliente.
            </p>
            <Select
              options={COMPANY_TAX_OPTIONS}
              value={companyTaxCondition}
              onChange={setCompanyTaxCondition}
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
