import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Save, FileText, Receipt, ClipboardList, Calculator, ShoppingBag } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../../components/ui';
import { appSettingsService } from '../../services';

type Format = 'A4' | 'THERMAL_80MM';

const FORMAT_LABEL: Record<Format, string> = {
  A4: 'A4',
  THERMAL_80MM: 'Térmica 80mm',
};

interface DocTypeRow {
  key: 'printFormatInvoice' | 'printFormatBudget' | 'printFormatOrdenPedido' | 'printFormatRemito' | 'printFormatRecibo';
  label: string;
  description: string;
  icon: React.ElementType;
  available: { A4: boolean; THERMAL_80MM: boolean };
  defaultFormat: Format;
}

const DOC_TYPES: DocTypeRow[] = [
  {
    key: 'printFormatInvoice',
    label: 'Facturas',
    description: 'Facturas A/B/C, Notas de Crédito y Débito',
    icon: FileText,
    available: { A4: true, THERMAL_80MM: true },
    defaultFormat: 'A4',
  },
  {
    key: 'printFormatBudget',
    label: 'Presupuestos',
    description: 'Cotizaciones y propuestas a clientes',
    icon: Calculator,
    available: { A4: false, THERMAL_80MM: false },
    defaultFormat: 'A4',
  },
  {
    key: 'printFormatOrdenPedido',
    label: 'Órdenes de Pedido',
    description: 'Pedidos internos antes de facturar',
    icon: ShoppingBag,
    available: { A4: false, THERMAL_80MM: true },
    defaultFormat: 'THERMAL_80MM',
  },
  {
    key: 'printFormatRemito',
    label: 'Remitos',
    description: 'Comprobantes de entrega de mercadería',
    icon: ClipboardList,
    available: { A4: false, THERMAL_80MM: false },
    defaultFormat: 'A4',
  },
  {
    key: 'printFormatRecibo',
    label: 'Recibos',
    description: 'Comprobantes de pago de clientes',
    icon: Receipt,
    available: { A4: false, THERMAL_80MM: false },
    defaultFormat: 'A4',
  },
];

type FormatsState = Record<DocTypeRow['key'], Format>;

export default function PrintSettingsCard() {
  const [formats, setFormats] = useState<FormatsState>({
    printFormatInvoice: 'A4',
    printFormatBudget: 'A4',
    printFormatOrdenPedido: 'THERMAL_80MM',
    printFormatRemito: 'A4',
    printFormatRecibo: 'A4',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    appSettingsService.get()
      .then((s) => {
        setFormats({
          printFormatInvoice:     (s.printFormatInvoice     ?? s.printFormat ?? 'A4') as Format,
          printFormatBudget:      (s.printFormatBudget      ?? s.printFormat ?? 'A4') as Format,
          printFormatOrdenPedido: (s.printFormatOrdenPedido ?? s.printFormat ?? 'THERMAL_80MM') as Format,
          printFormatRemito:      (s.printFormatRemito      ?? s.printFormat ?? 'A4') as Format,
          printFormatRecibo:      (s.printFormatRecibo      ?? s.printFormat ?? 'A4') as Format,
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await appSettingsService.update(formats);
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 animate-pulse">
        <div className="h-5 w-48 bg-gray-100 dark:bg-slate-700 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-slate-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Formato de impresión por comprobante</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Elegí el tamaño preferido para cada tipo de comprobante. Si el formato seleccionado no tiene plantilla disponible, se usa el otro como fallback.
        </p>
      </div>

      <div className="space-y-2 mb-5">
        {DOC_TYPES.map((row) => {
          const Icon = row.icon;
          const value = formats[row.key];
          return (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-700/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-300 leading-tight truncate">{row.label}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">{row.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg flex-shrink-0">
                {(['A4', 'THERMAL_80MM'] as const).map((f) => {
                  const active = value === f;
                  const isAvailable = row.available[f];
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormats((prev) => ({ ...prev, [row.key]: f }))}
                      title={!isAvailable ? `Plantilla ${FORMAT_LABEL[f]} aún no implementada — fallback al otro formato` : ''}
                      className={clsx(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 flex items-center gap-1',
                        active
                          ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white',
                      )}
                    >
                      {FORMAT_LABEL[f]}
                      {!isAvailable && <span className="text-[9px] text-amber-600 dark:text-amber-400" aria-hidden>·</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} isLoading={isSaving} size="sm">
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Guardar
        </Button>
        <p className="text-[11px] text-gray-400 dark:text-slate-500">
          <span className="text-amber-600 dark:text-amber-400">·</span> indica que la plantilla aún no está implementada en ese formato.
        </p>
      </div>
    </div>
  );
}
