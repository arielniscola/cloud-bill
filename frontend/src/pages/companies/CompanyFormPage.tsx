import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Input, Select } from '../../components/ui';
import { CuitInput } from '../../components/shared';
import companiesService from '../../services/companies.service';
import type { CreateCompanyDTO, UpdateCompanyDTO } from '../../types/company.types';
import { PLAN_NAMES, PLAN_LABELS, PLAN_DESCRIPTIONS, type PlanName } from '../../utils/planFeatures';
import { useCompanyStore } from '../../stores/company.store';

const TAX_OPTIONS = [
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable Inscripto' },
  { value: 'MONOTRIBUTISTA',        label: 'Monotributista' },
  { value: 'EXENTO',                label: 'Exento' },
];

const PLAN_OPTIONS = PLAN_NAMES.map(p => ({ value: p, label: `${PLAN_LABELS[p]} — ${PLAN_DESCRIPTIONS[p]}` }));

export default function CompanyFormPage() {
  const navigate   = useNavigate();
  const { id }     = useParams<{ id: string }>();
  const isEditing  = !!id;
  const { setCompanies: storeSetCompanies } = useCompanyStore();

  const [form, setForm] = useState({
    name: '', cuit: '', address: '', city: '', phone: '', email: '',
    taxCondition: 'RESPONSABLE_INSCRIPTO',
    logoUrl: '',
    plan: 'PRO' as PlanName,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    setIsLoading(true);
    companiesService.getById(id).then(c => {
      setForm({
        name:         c.name,
        cuit:         c.cuit ?? '',
        address:      c.address ?? '',
        city:         c.city ?? '',
        phone:        c.phone ?? '',
        email:        c.email ?? '',
        taxCondition: c.taxCondition,
        logoUrl:      c.logoUrl ?? '',
        plan:         (c.plan as PlanName) ?? 'PRO',
      });
    }).catch(() => toast.error('Error al cargar empresa')).finally(() => setIsLoading(false));
  }, [id, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const payload = {
      name:         form.name,
      cuit:         form.cuit  || null,
      address:      form.address || null,
      city:         form.city   || null,
      phone:        form.phone  || null,
      email:        form.email  || null,
      taxCondition: form.taxCondition,
      logoUrl:      form.logoUrl || null,
    };
    try {
      if (isEditing) {
        await Promise.all([
          companiesService.update(id, payload as UpdateCompanyDTO),
          companiesService.updatePlan(id, form.plan),
        ]);
        // Refresh store so CompanySwitcher and other consumers see updated data
        const all = await companiesService.getAll();
        storeSetCompanies(all);
        toast.success('Empresa actualizada');
      } else {
        const created = await companiesService.create(payload as CreateCompanyDTO);
        if (form.plan !== 'PRO') {
          await companiesService.updatePlan(created.id, form.plan);
        }
        // Refresh store so new company appears in all selectors
        const all = await companiesService.getAll();
        storeSetCompanies(all);
        toast.success('Empresa creada');
        navigate(`/companies/${created.id}`, { replace: true });
        return;
      }
      navigate('/companies');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/companies')}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditing ? 'Editar empresa' : 'Nueva empresa'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
        <Input label="Nombre *" value={form.name} onChange={set('name')} required />
        <div className="grid grid-cols-2 gap-4">
          <CuitInput label="CUIT" value={form.cuit} onChange={(raw) => setForm(f => ({ ...f, cuit: raw }))} />
          <Select
            label="Condición IVA"
            value={form.taxCondition}
            onChange={v => setForm(f => ({ ...f, taxCondition: v }))}
            options={TAX_OPTIONS}
          />
        </div>
        <Select
          label="Plan"
          value={form.plan}
          onChange={v => setForm(f => ({ ...f, plan: v as PlanName }))}
          options={PLAN_OPTIONS}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Dirección" value={form.address} onChange={set('address')} />
          <Input label="Ciudad" value={form.city} onChange={set('city')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Teléfono" value={form.phone} onChange={set('phone')} />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="Logo (URL)"
              type="url"
              placeholder="https://…/logo.png"
              value={form.logoUrl}
              onChange={set('logoUrl')}
            />
          </div>
          {form.logoUrl && (
            <div className="w-12 h-12 rounded-lg border border-gray-200 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
              <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/companies')}>Cancelar</Button>
          <Button type="submit" isLoading={isSaving}>{isEditing ? 'Guardar cambios' : 'Crear empresa'}</Button>
        </div>
      </form>
    </div>
  );
}
