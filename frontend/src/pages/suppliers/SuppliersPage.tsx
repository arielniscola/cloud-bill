import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Truck, Mail, Phone, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card } from '../../components/ui';
import { PageHeader, SearchInput, ConfirmDialog, DataTable } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { suppliersService } from '../../services';
import { TAX_CONDITIONS } from '../../utils/constants';
import type { Supplier, TaxCondition } from '../../types';

// ── Tax condition badge config ────────────────────────────────────
const TAX_BADGE: Record<TaxCondition, { label: string; className: string }> = {
  RESPONSABLE_INSCRIPTO: { label: 'Resp. Inscripto', className: 'bg-indigo-50 text-indigo-700 border border-indigo-200' },
  MONOTRIBUTISTA:        { label: 'Monotributista',  className: 'bg-violet-50 text-violet-700 border border-violet-200' },
  EXENTO:                { label: 'Exento',           className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  CONSUMIDOR_FINAL:      { label: 'Cons. Final',      className: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

// ── Avatar ───────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type FilterTab = 'all' | 'active' | 'inactive';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isActiveFilter = tab === 'all' ? undefined : tab === 'active';

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await suppliersService.getAll({
        search: search || undefined,
        isActive: isActiveFilter,
        limit: 100,
      });
      setSuppliers(result.data);
      setTotal(result.total ?? result.data.length);
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setIsLoading(false);
      setIsFirstLoad(false);
    }
  }, [search, isActiveFilter]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

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

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: 'Proveedor',
      render: (s) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${avatarColor(s.name)}`}>
            {s.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{s.name}</p>
            {s.email && (
              <p className="text-xs text-gray-400 truncate leading-none mt-0.5 flex items-center gap-1">
                <Mail className="w-3 h-3 flex-shrink-0" />
                {s.email}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'cuit',
      header: 'CUIT',
      render: (s) =>
        s.cuit
          ? <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{s.cuit}</span>
          : <span className="text-gray-300">—</span>,
    },
    {
      key: 'taxCondition',
      header: 'Condición IVA',
      render: (s) => {
        const cfg = TAX_BADGE[s.taxCondition];
        return (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.className}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'city',
      header: 'Ubicación',
      render: (s) =>
        s.city
          ? (
            <span className="flex items-center gap-1.5 text-sm text-gray-600">
              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
              {s.city}
            </span>
          )
          : <span className="text-gray-300">—</span>,
    },
    {
      key: 'phone',
      header: 'Teléfono',
      render: (s) =>
        s.phone
          ? (
            <span className="flex items-center gap-1.5 text-sm text-gray-600">
              <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
              {s.phone}
            </span>
          )
          : <span className="text-gray-300">—</span>,
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (s) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.isActive ? 'text-emerald-700' : 'text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          {s.isActive ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (s) => (
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            title="Editar"
            onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/${s.id}/edit`); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-[background-color,color] duration-150"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            title="Eliminar"
            onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-[background-color,color] duration-150"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all',      label: 'Todos' },
    { id: 'active',   label: 'Activos' },
    { id: 'inactive', label: 'Inactivos' },
  ];

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle={
          isFirstLoad
            ? undefined
            : `${suppliers.length} ${suppliers.length === 1 ? 'proveedor' : 'proveedores'}${tab !== 'all' ? (tab === 'active' ? ' activos' : ' inactivos') : ''}`
        }
        actions={
          <Button onClick={() => navigate('/suppliers/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo proveedor
          </Button>
        }
      />

      <Card padding="none">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  tab === t.id
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, CUIT, email…"
            className="w-72"
          />
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          keyExtractor={(s) => s.id}
          onRowClick={(s) => navigate(`/suppliers/${s.id}/edit`)}
          emptyMessage={
            search
              ? `Sin resultados para "${search}"`
              : tab === 'active'
              ? 'No hay proveedores activos'
              : tab === 'inactive'
              ? 'No hay proveedores inactivos'
              : 'No hay proveedores registrados'
          }
        />

        {/* Empty state — no data, no filters */}
        {!isLoading && suppliers.length === 0 && !search && tab === 'all' && (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Truck className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Sin proveedores</p>
            <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-5">
              Registrá tus proveedores para asociarlos a compras y llevar un historial de abastecimiento.
            </p>
            <Button onClick={() => navigate('/suppliers/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo proveedor
            </Button>
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
