import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Package,
  FileText,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { Card, Badge } from '../../components/ui';
import { PageHeader } from '../../components/shared';
import { customersService, productsService, invoicesService, stockService } from '../../services';
import { formatCurrency } from '../../utils/formatters';
import type { Stock } from '../../types';

interface DashboardStats {
  totalCustomers: number;
  totalProducts: number;
  totalInvoices: number;
  lowStockItems: Stock[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    totalProducts: 0,
    totalInvoices: 0,
    lowStockItems: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [customers, products, invoices, lowStock] = await Promise.all([
          customersService.getAll({ limit: 1 }),
          productsService.getAll({ limit: 1 }),
          invoicesService.getAll({ limit: 1 }),
          stockService.getLowStock(),
        ]);

        setStats({
          totalCustomers: customers.total,
          totalProducts: products.total,
          totalInvoices: invoices.total,
          lowStockItems: lowStock,
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Clientes',
      value: stats.totalCustomers,
      icon: Users,
      color: 'bg-blue-500',
      href: '/customers',
    },
    {
      title: 'Productos',
      value: stats.totalProducts,
      icon: Package,
      color: 'bg-green-500',
      href: '/products',
    },
    {
      title: 'Facturas',
      value: stats.totalInvoices,
      icon: FileText,
      color: 'bg-purple-500',
      href: '/invoices',
    },
    {
      title: 'Stock bajo',
      value: stats.lowStockItems.length,
      icon: AlertTriangle,
      color: 'bg-yellow-500',
      href: '/stock',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Bienvenido al sistema de gestión"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => (
          <Link key={stat.title} to={stat.href}>
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {isLoading ? '...' : stat.value.toLocaleString()}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Alertas de Stock Bajo
            </h3>
            <Link
              to="/stock"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              Ver todo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {stats.lowStockItems.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay productos con stock bajo
            </p>
          ) : (
            <div className="space-y-3">
              {stats.lowStockItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.product?.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.warehouse?.name}
                    </p>
                  </div>
                  <Badge variant="warning">
                    {item.quantity} / {item.minQuantity}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick Actions */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Acciones Rápidas
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/customers/new"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Users className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-medium text-gray-700">
                Nuevo Cliente
              </span>
            </Link>
            <Link
              to="/products/new"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Package className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-gray-700">
                Nuevo Producto
              </span>
            </Link>
            <Link
              to="/invoices/new"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-medium text-gray-700">
                Nueva Factura
              </span>
            </Link>
            <Link
              to="/stock/transfer"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <TrendingUp className="w-5 h-5 text-yellow-500" />
              <span className="text-sm font-medium text-gray-700">
                Transferir Stock
              </span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
