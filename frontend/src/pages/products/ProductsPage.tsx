import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Card } from '../../components/ui';
import { PageHeader, DataTable, SearchInput, ConfirmDialog } from '../../components/shared';
import type { Column } from '../../components/shared/DataTable';
import { productsService } from '../../services';
import { formatCurrency, formatPercentage } from '../../utils/formatters';
import { DEFAULT_PAGE_SIZE } from '../../utils/constants';
import type { Product } from '../../types';

export default function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await productsService.getAll({ page, limit, search });
      setProducts(response.data);
      setTotal(response.total);
    } catch (error) {
      toast.error('Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await productsService.delete(deleteId);
      toast.success('Producto eliminado');
      setDeleteId(null);
      fetchProducts();
    } catch (error) {
      toast.error('Error al eliminar producto');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<Product>[] = [
    { key: 'sku', header: 'SKU' },
    { key: 'name', header: 'Nombre' },
    {
      key: 'category.name',
      header: 'Categoría',
      render: (product) => product.category?.name || '-',
    },
    {
      key: 'cost',
      header: 'Costo',
      render: (product) => formatCurrency(product.cost),
    },
    {
      key: 'price',
      header: 'Precio',
      render: (product) => formatCurrency(product.price),
    },
    {
      key: 'taxRate',
      header: 'IVA',
      render: (product) => formatPercentage(product.taxRate),
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (product) => (
        <Badge variant={product.isActive ? 'success' : 'error'}>
          {product.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (product) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/products/${product.id}/edit`);
            }}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(product.id);
            }}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle={`${total} productos registrados`}
        actions={
          <Button onClick={() => navigate('/products/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Producto
          </Button>
        }
      />

      <Card padding="none">
        <div className="p-4 border-b border-gray-200">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Buscar por SKU, nombre..."
            className="max-w-md"
          />
        </div>

        <DataTable
          columns={columns}
          data={products}
          isLoading={isLoading}
          keyExtractor={(product) => product.id}
          onRowClick={(product) => navigate(`/products/${product.id}/edit`)}
          pagination={{
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            total,
            onPageChange: setPage,
            onLimitChange: (newLimit) => {
              setLimit(newLimit);
              setPage(1);
            },
          }}
        />
      </Card>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar producto"
        message="¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />
    </div>
  );
}
