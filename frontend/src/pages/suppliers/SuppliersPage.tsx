import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button, Badge } from '../../components/ui';
import { PageHeader, ConfirmDialog } from '../../components/shared';
import { suppliersService } from '../../services';
import { TAX_CONDITIONS } from '../../utils/constants';
import type { Supplier } from '../../types';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const result = await suppliersService.getAll({ search: search || undefined, limit: 50 });
      setSuppliers(result.data);
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await suppliersService.delete(deleteId);
      toast.success('Proveedor eliminado');
      setDeleteId(null);
      fetchSuppliers();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al eliminar proveedor');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Gestión de proveedores"
        actions={
          <Button onClick={() => navigate('/suppliers/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo proveedor
          </Button>
        }
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o CUIT..."
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-full max-w-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No hay proveedores. <button onClick={() => navigate('/suppliers/new')} className="text-indigo-600 underline">Crear uno</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">CUIT</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Condición IVA</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Ciudad</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Estado</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase text-xs">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.cuit || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {TAX_CONDITIONS[s.taxCondition]}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.city || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.email || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge className={s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
                        {s.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => navigate(`/suppliers/${s.id}/edit`)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(s.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar proveedor"
        message="¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
