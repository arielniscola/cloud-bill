import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, Button, Input, Select } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { suppliersService } from '../../services';
import { TAX_CONDITION_OPTIONS } from '../../utils/constants';
import type { CreateSupplierDTO } from '../../types';

const defaultForm: CreateSupplierDTO = {
  name: '',
  cuit: '',
  taxCondition: 'RESPONSABLE_INSCRIPTO',
  address: '',
  city: '',
  phone: '',
  email: '',
  notes: '',
  isActive: true,
};

export default function SupplierFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [form, setForm] = useState<CreateSupplierDTO>(defaultForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    setIsLoading(true);
    suppliersService.getById(id)
      .then((s) => {
        setForm({
          name: s.name,
          cuit: s.cuit || '',
          taxCondition: s.taxCondition,
          address: s.address || '',
          city: s.city || '',
          phone: s.phone || '',
          email: s.email || '',
          notes: s.notes || '',
          isActive: s.isActive,
        });
      })
      .catch(() => {
        toast.error('Error al cargar proveedor');
        navigate('/suppliers');
      })
      .finally(() => setIsLoading(false));
  }, [id, isEditing, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast.error('El nombre es requerido');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        cuit: form.cuit || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        notes: form.notes || undefined,
      };
      if (isEditing) {
        await suppliersService.update(id, payload);
        toast.success('Proveedor actualizado');
      } else {
        await suppliersService.create(payload);
        toast.success('Proveedor creado');
      }
      navigate('/suppliers');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al guardar proveedor');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-6">Cargando...</div>;

  return (
    <div>
      <PageHeader
        title={isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        backTo="/suppliers"
      />

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <Card>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Información del proveedor</h3>
          <div className="space-y-4">
            <Input
              label="Nombre *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Razón social"
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="CUIT (sin guiones)"
                value={form.cuit || ''}
                onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
                placeholder="20123456789"
              />
              <Select
                label="Condición IVA"
                options={TAX_CONDITION_OPTIONS}
                value={form.taxCondition || 'RESPONSABLE_INSCRIPTO'}
                onChange={(v) => setForm((f) => ({ ...f, taxCondition: v as CreateSupplierDTO['taxCondition'] }))}
              />
            </div>
            <Input
              label="Dirección"
              value={form.address || ''}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Ciudad"
                value={form.city || ''}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
              <Input
                label="Teléfono"
                value={form.phone || ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {isEditing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span className="text-sm text-gray-700">Activo</span>
              </label>
            )}
          </div>
        </Card>

        <div className="flex gap-3 mt-4">
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/suppliers')}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
