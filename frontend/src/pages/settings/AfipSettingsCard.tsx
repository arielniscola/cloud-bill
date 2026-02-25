import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, Save, Wifi } from 'lucide-react';
import { Card, Button, Input } from '../../components/ui';
import { afipService } from '../../services';
import type { AfipConfigSummary, AfipConfigDTO } from '../../types';

export default function AfipSettingsCard() {
  const [config, setConfig] = useState<AfipConfigSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [form, setForm] = useState<AfipConfigDTO>({
    cuit: '',
    salePoint: 1,
    cert: '',
    privateKey: '',
    isProduction: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await afipService.getConfig();
        if (data) {
          setConfig(data);
          setForm((f) => ({
            ...f,
            cuit: data.cuit,
            salePoint: data.salePoint,
            isProduction: data.isProduction,
          }));
        }
      } catch {
        // No config yet
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!form.cuit || !form.cert || !form.privateKey) {
      toast.error('CUIT, certificado y clave privada son requeridos');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await afipService.saveConfig(form);
      setConfig(saved);
      // Clear sensitive fields from form after save
      setForm((f) => ({ ...f, cert: '', privateKey: '' }));
      toast.success('Configuración AFIP guardada');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await afipService.testConnection();
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al conectar con ARCA');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-gray-500">Cargando configuración AFIP...</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Configuración ARCA (AFIP)</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Configuración para emisión de facturas electrónicas
          </p>
        </div>
        {config && (
          <div className="flex items-center gap-2">
            {config.hasCert && config.hasKey ? (
              <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
                <CheckCircle className="w-3 h-3" />
                Certificados cargados
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full">
                <XCircle className="w-3 h-3" />
                Sin certificados
              </span>
            )}
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                config.isProduction
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {config.isProduction ? 'Producción' : 'Homologación'}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="CUIT (sin guiones)"
            placeholder="20123456789"
            value={form.cuit}
            onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
          />
          <Input
            label="Punto de Venta"
            type="number"
            min={1}
            value={String(form.salePoint)}
            onChange={(e) => setForm((f) => ({ ...f, salePoint: parseInt(e.target.value) || 1 }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Certificado (.crt) — pegue el contenido completo
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            rows={5}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={form.cert}
            onChange={(e) => setForm((f) => ({ ...f, cert: e.target.value }))}
          />
          {config?.hasCert && !form.cert && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Certificado guardado. Deje vacío para mantener el actual.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Clave Privada (.key) — pegue el contenido completo
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            rows={5}
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
            value={form.privateKey}
            onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
          />
          {config?.hasKey && !form.privateKey && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Clave guardada. Deje vacía para mantener la actual.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded"
              checked={form.isProduction}
              onChange={(e) => setForm((f) => ({ ...f, isProduction: e.target.checked }))}
            />
            <span className="text-sm text-gray-700">Usar entorno de producción</span>
          </label>
          <span className="text-xs text-gray-400">
            (Sin tilde = homologación / testing)
          </span>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} isLoading={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            Guardar configuración
          </Button>
          {config && (
            <Button variant="outline" onClick={handleTest} isLoading={isTesting}>
              <Wifi className="w-4 h-4 mr-2" />
              Test conexión ARCA
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
