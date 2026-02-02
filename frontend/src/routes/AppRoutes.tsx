import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../components/layout';
import ProtectedRoute from './ProtectedRoute';

// Pages
import LoginPage from '../pages/auth/LoginPage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import CustomersPage from '../pages/customers/CustomersPage';
import CustomerFormPage from '../pages/customers/CustomerFormPage';
import ProductsPage from '../pages/products/ProductsPage';
import ProductFormPage from '../pages/products/ProductFormPage';
import CategoriesPage from '../pages/categories/CategoriesPage';
import WarehousesPage from '../pages/warehouses/WarehousesPage';
import WarehouseFormPage from '../pages/warehouses/WarehouseFormPage';
import StockPage from '../pages/stock/StockPage';
import StockMovementsPage from '../pages/stock/StockMovementsPage';
import StockTransferPage from '../pages/stock/StockTransferPage';
import InvoicesPage from '../pages/invoices/InvoicesPage';
import InvoiceFormPage from '../pages/invoices/InvoiceFormPage';
import InvoiceDetailPage from '../pages/invoices/InvoiceDetailPage';
import CurrentAccountsPage from '../pages/current-accounts/CurrentAccountsPage';
import AccountDetailPage from '../pages/current-accounts/AccountDetailPage';
import SettingsPage from '../pages/settings/SettingsPage';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />

        {/* Customers */}
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/new" element={<CustomerFormPage />} />
        <Route path="/customers/:id/edit" element={<CustomerFormPage />} />

        {/* Products */}
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/products/:id/edit" element={<ProductFormPage />} />

        {/* Categories */}
        <Route path="/categories" element={<CategoriesPage />} />

        {/* Warehouses */}
        <Route path="/warehouses" element={<WarehousesPage />} />
        <Route path="/warehouses/new" element={<WarehouseFormPage />} />
        <Route path="/warehouses/:id/edit" element={<WarehouseFormPage />} />

        {/* Stock */}
        <Route path="/stock" element={<StockPage />} />
        <Route path="/stock/movements" element={<StockMovementsPage />} />
        <Route path="/stock/transfer" element={<StockTransferPage />} />

        {/* Invoices */}
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/new" element={<InvoiceFormPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />

        {/* Current Accounts */}
        <Route path="/current-accounts" element={<CurrentAccountsPage />} />
        <Route path="/current-accounts/:customerId" element={<AccountDetailPage />} />

        {/* Settings */}
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
