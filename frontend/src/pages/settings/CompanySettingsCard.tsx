import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Building2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Input, Select, Modal } from '../../components/ui';
import { ConfirmDialog } from '../../components/shared';
import companiesService from '../../services/companies.service';
import type { Company, CreateCompanyDTO, UpdateCompanyDTO } from '../../types/company.types';
import { useCompanyStore } from '../../stores/company.store';

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const TAX_CONDITION_OPTIONS = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable Inscripto' },
  { value: 'MONOTRIBUTISTA',        label: 'Monotributista' },
  { value: 'EXENTO',                label: 'Exento' },
];

// ── Create / Edit modal ───────────────────────────────────────────────────────
interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editing: Company | null;
}

function CompanyFormModal({ isOpen, onClose, onSave, editing }: CompanyFormModalProps) {
  const [form, setForm] = useState<CreateCompanyDTO & { isActive?: boolean }>({
    name: '',
    cuit: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    taxCondition: 'RESPONSABLE_INSCRIPTO',
    logoUrl: '',
    isActive: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editing) {
        setForm({
          name: editing.name,
          cuit: editing.cuit ?? '',
          address: editing.address ?? '',
          city: editing.city ?? '',
          phone: editing.phone ?? '',
          email: editing.email ?? '',
          taxCondition: editing.taxCondition,
          logoUrl: editing.logoUrl ?? '',
          isActive: editing.isActive,
        });
      } else {
        setForm({
          name: '',
          cuit: '',
          address: '',
          city: '',
          phone: '',
          email: '',
          taxCondition: 'RESPONSABLE_INSCRIPTO',
          logoUrl: '',
          isActive: true,
        });
      }
    }
  }, [isOpen, editing]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    setIsSaving(true);
    try {
      const payload: CreateCompanyDTO = {
        name: form.name.trim(),
        cuit: form.cuit || null,
        address: form.address || null,
        city: form.city || null,
        phone: form.phone || null,
        email: form.email || null,
        taxCondition: form.taxCondition,
        logoUrl: form.logoUrl || null,
      };
      if (editing) {
        await companiesService.update(editing.id, { ...payload, isActive: form.isActive } as UpdateCompanyDTO);
        toast.success('Empresa actualizada');
      } else {
        await companiesService.create(payload);
        toast.success('Empresa creada');
      }
      onSave();
    } catch {
      toast.error('Error al guardar la empresa');
    } finally {
      setIsSaving(false);
    }
  };

  const f = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Editar empresa' : 'Nueva empresa'}
      size="md"
    >
      <div className="space-y-4">
        <Input label="Nombre *" value={form.name} onChange={f('name')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="CUIT" value={form.cuit ?? ''} onChange={f('cuit')} />
          <Select
            label="Condición fiscal"
            value={form.taxCondition ?? ''}
            onChange={(value) => setForm((p) => ({ ...p, taxCondition: value }))}
            options={TAX_CONDITION_OPTIONS}
          />
        </div>
        <Input label="Dirección" value={form.address ?? ''} onChange={f('address')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Ciudad" value={form.city ?? ''} onChange={f('city')} />
          <Input label="Teléfono" value={form.phone ?? ''} onChange={f('phone')} />
        </div>
        <Input label="Email" type="email" value={form.email ?? ''} onChange={f('email')} />
        {editing && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive ?? true}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-slate-300">
              Empresa activa
            </label>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
        <Button onClick={handleSave} isLoading={isSaving}>
          {editing ? 'Guardar cambios' : 'Crear empresa'}
        </Button>
      </div>
    </Modal>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
export default function CompanySettingsCard() {
  const [companies, setCompanies]   = useState<Company[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Company | null>(null);
  const [deleting, setDeleting]     = useState<Company | null>(null);

  const { activeCompanyId, setActiveCompany, setCompanies: storeSetCompanies } = useCompanyStore();

  const load = async () => {
    try {
      setIsLoading(true);
      const data = await companiesService.getAll();
      setCompanies(data);
      storeSetCompanies(data);
    } catch {
      toast.error('Error al cargar empresas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEdit = (company: Company) => {
    setEditing(company);
    setModalOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleSaved = () => {
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await companiesService.delete(deleting.id);
      toast.success('Empresa eliminada');
      setDeleting(null);
      load();
    } catch {
      toast.error('No se puede eliminar esta empresa');
    }
  };

  const handleActivate = (company: Company) => {
    setActiveCompany(company.id);
    storeSetCompanies(companies);
    toast.success(`Empresa activa: ${company.name}`);
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
        <p className="text-sm text-gray-400 dark:text-slate-500">Cargando empresas...</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Empresas</h3>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              Gestión de empresas y puntos de venta
            </p>
          </div>
          <Button size="sm" onClick={handleNew} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Nueva empresa
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Empresa</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">CUIT</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Ciudad</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="text-right px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {companies.map((company) => {
                const isActive = activeCompanyId === company.id || (!activeCompanyId && company.id === DEFAULT_COMPANY_ID);
                return (
                  <tr
                    key={company.id}
                    className={clsx(
                      'hover:bg-gray-50/80 dark:hover:bg-slate-700/30 transition-colors',
                      isActive && 'bg-indigo-50/40 dark:bg-indigo-900/10'
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm">{company.name}</p>
                          {isActive && (
                            <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Activa
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-gray-500 dark:text-slate-400 text-sm">
                      {company.cuit ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-gray-500 dark:text-slate-400 text-sm">
                      {company.city ?? '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
                        company.isActive
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-800/50'
                          : 'text-gray-500 bg-gray-50 border-gray-200 dark:text-slate-400 dark:bg-slate-700 dark:border-slate-600'
                      )}>
                        {company.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleActivate(company)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                          >
                            Activar
                          </Button>
                        )}
                        <button
                          onClick={() => handleEdit(company)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {company.id !== DEFAULT_COMPANY_ID && (
                          <button
                            onClick={() => setDeleting(company)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400 dark:text-slate-500">
                    No hay empresas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CompanyFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaved}
        editing={editing}
      />

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Eliminar empresa"
        message={`¿Estás seguro de que querés eliminar la empresa "${deleting?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </>
  );
}
