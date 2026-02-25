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
import RemitosPage from '../pages/remitos/RemitosPage';
import RemitoFormPage from '../pages/remitos/RemitoFormPage';
import RemitoDetailPage from '../pages/remitos/RemitoDetailPage';
import CashRegistersPage from '../pages/cash-registers/CashRegistersPage';
import CashRegisterFormPage from '../pages/cash-registers/CashRegisterFormPage';
import SettingsPage from '../pages/settings/SettingsPage';
import ActivityPage from '../pages/activity/ActivityPage';
import IvaPage from '../pages/iva/IvaPage';
import SuppliersPage from '../pages/suppliers/SuppliersPage';
import SupplierFormPage from '../pages/suppliers/SupplierFormPage';
import PurchasesPage from '../pages/purchases/PurchasesPage';
import PurchaseFormPage from '../pages/purchases/PurchaseFormPage';

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
        <Route path="/invoices/:id/edit" element={<InvoiceFormPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />

        {/* Remitos */}
        <Route path="/remitos" element={<RemitosPage />} />
        <Route path="/remitos/new" element={<RemitoFormPage />} />
        <Route path="/remitos/:id" element={<RemitoDetailPage />} />

        {/* Current Accounts */}
        <Route path="/current-accounts" element={<CurrentAccountsPage />} />
        <Route path="/current-accounts/:customerId" element={<AccountDetailPage />} />

        {/* Cash Registers */}
        <Route path="/cash-registers" element={<CashRegistersPage />} />
        <Route path="/cash-registers/new" element={<CashRegisterFormPage />} />
        <Route path="/cash-registers/:id/edit" element={<CashRegisterFormPage />} />

        {/* Activity */}
        <Route path="/activity" element={<ActivityPage />} />

        {/* Settings */}
        <Route path="/settings" element={<SettingsPage />} />

        {/* Libro IVA */}
        <Route path="/iva" element={<IvaPage />} />

        {/* Suppliers */}
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/suppliers/new" element={<SupplierFormPage />} />
        <Route path="/suppliers/:id/edit" element={<SupplierFormPage />} />

        {/* Purchases */}
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/purchases/new" element={<PurchaseFormPage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
