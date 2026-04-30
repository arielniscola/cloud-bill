import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../components/layout';
import ProtectedRoute from './ProtectedRoute';
import RoleGuard from './RoleGuard';
import FeatureRouteGuard from './FeatureRouteGuard';

// Pages
import LoginPage from '../pages/auth/LoginPage';
import HomePage from '../pages/home/HomePage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import CustomersPage from '../pages/customers/CustomersPage';
import CustomerFormPage from '../pages/customers/CustomerFormPage';
import CustomerDetailPage from '../pages/customers/CustomerDetailPage';
import ProductsPage from '../pages/products/ProductsPage';
import ProductFormPage from '../pages/products/ProductFormPage';
import BulkPriceUpdatePage from '../pages/products/BulkPriceUpdatePage';
import CategoriesPage from '../pages/categories/CategoriesPage';
import WarehousesPage from '../pages/warehouses/WarehousesPage';
import WarehouseFormPage from '../pages/warehouses/WarehouseFormPage';
import WarehouseDetailPage from '../pages/warehouses/WarehouseDetailPage';
import StockPage from '../pages/stock/StockPage';
import StockMovementsPage from '../pages/stock/StockMovementsPage';
import StockTransferPage from '../pages/stock/StockTransferPage';
import StockPhysicalCountPage from '../pages/stock/StockPhysicalCountPage';
import StockIntelligencePage from '../pages/stock/StockIntelligencePage';
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
import CashRegisterDetailPage from '../pages/cash-registers/CashRegisterDetailPage';
import SettingsPage from '../pages/settings/SettingsPage';
import ActivityPage from '../pages/activity/ActivityPage';
import IvaPage from '../pages/iva/IvaPage';
import SuppliersPage from '../pages/suppliers/SuppliersPage';
import SupplierFormPage from '../pages/suppliers/SupplierFormPage';
import SupplierDetailPage from '../pages/suppliers/SupplierDetailPage';
import PurchasesPage from '../pages/purchases/PurchasesPage';
import PurchaseFormPage from '../pages/purchases/PurchaseFormPage';
import PurchaseDetailPage from '../pages/purchases/PurchaseDetailPage';
import BrandsPage from '../pages/brands/BrandsPage';
import BudgetsPage from '../pages/budgets/BudgetsPage';
import BudgetFormPage from '../pages/budgets/BudgetFormPage';
import BudgetDetailPage from '../pages/budgets/BudgetDetailPage';
import RecibosPage from '../pages/recibos/RecibosPage';
import ReciboDetailPage from '../pages/recibos/ReciboDetailPage';
import SalesReportPage from '../pages/reports/SalesReportPage';
import ReportsHubPage from '../pages/reports/ReportsHubPage';
import PurchasesReportPage from '../pages/reports/PurchasesReportPage';
import ProfitabilityReportPage from '../pages/reports/ProfitabilityReportPage';
import StockValuationReportPage from '../pages/reports/StockValuationReportPage';
import AccountsReceivableReportPage from '../pages/reports/AccountsReceivableReportPage';
import CashFlowReportPage from '../pages/reports/CashFlowReportPage';
import OrdenPedidosPage from '../pages/orden-pedidos/OrdenPedidosPage';
import OrdenPedidoFormPage from '../pages/orden-pedidos/OrdenPedidoFormPage';
import OrdenPedidoDetailPage from '../pages/orden-pedidos/OrdenPedidoDetailPage';
import OrdenComprasPage from '../pages/orden-compras/OrdenComprasPage';
import OrdenCompraFormPage from '../pages/orden-compras/OrdenCompraFormPage';
import OrdenCompraDetailPage from '../pages/orden-compras/OrdenCompraDetailPage';
import BancoCheques from '../pages/banco-cheques/BancoCheques';
import ThermalInvoicePrintPage from '../pages/print/ThermalInvoicePrintPage';
import ThermalOrdenPedidoPrintPage from '../pages/print/ThermalOrdenPedidoPrintPage';
import CompaniesPage from '../pages/companies/CompaniesPage';
import CompanyFormPage from '../pages/companies/CompanyFormPage';
import CompanyDetailPage from '../pages/companies/CompanyDetailPage';
import UsersPage from '../pages/users/UsersPage';
import UserFormPage from '../pages/users/UserFormPage';
import OrdenPagosPage from '../pages/orden-pagos/OrdenPagosPage';
import OrdenPagoFormPage from '../pages/orden-pagos/OrdenPagoFormPage';
import OrdenPagoDetailPage from '../pages/orden-pagos/OrdenPagoDetailPage';
import SupplierAccountsPage from '../pages/suppliers/SupplierAccountsPage';
import SupplierAccountDetailPage from '../pages/suppliers/SupplierAccountDetailPage';
import BankAccountsPage from '../pages/banks/BankAccountsPage';
import BankAccountDetailPage from '../pages/banks/BankAccountDetailPage';
import MercadoPagoPage from '../pages/mercadopago/MercadoPagoPage';
import CardsPage from '../pages/cards/CardsPage';
import RubrosPage from '../pages/rubros/RubrosPage';
import ProductCustomFieldsPage from '../pages/product-custom-fields/ProductCustomFieldsPage';
import PlansPage from '../pages/plans/PlansPage';
import InternalNotesPage from '../pages/internal-notes/InternalNotesPage';
import AccountsPage from '../pages/accounting/AccountsPage';
import JournalEntriesPage from '../pages/accounting/JournalEntriesPage';
import JournalEntryDetailPage from '../pages/accounting/JournalEntryDetailPage';
import JournalEntryFormPage from '../pages/accounting/JournalEntryFormPage';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Print routes — authenticated, no layout */}
      <Route path="/print/invoice/:id" element={<ProtectedRoute><ThermalInvoicePrintPage /></ProtectedRoute>} />
      <Route path="/print/orden-pedido/:id" element={<ProtectedRoute><ThermalOrdenPedidoPrintPage /></ProtectedRoute>} />

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* Super admin only — companies & users management */}
        <Route element={<RoleGuard allowed={['SUPER_ADMIN']} />}>
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/new" element={<CompanyFormPage key="new" />} />
          <Route path="/companies/:id" element={<CompanyDetailPage />} />
          <Route path="/companies/:id/edit" element={<CompanyFormPage key="edit" />} />
          <Route path="/users/new" element={<UserFormPage key="new" />} />
          <Route path="/users/:id/edit" element={<UserFormPage key="edit" />} />
          <Route path="/plans" element={<PlansPage />} />
        </Route>
        {/* ADMIN can view users (read-only); SUPER_ADMIN already covered above */}
        <Route element={<RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']} />}>
          <Route path="/users" element={<UsersPage />} />
        </Route>

        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Read-only sections — all authenticated roles */}
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/brands" element={<BrandsPage />} />
        <Route path="/rubros" element={<RubrosPage />} />
        <Route element={<RoleGuard allowed={['ADMIN']} />}>
          <Route path="/products/custom-fields" element={<ProductCustomFieldsPage />} />
        </Route>
        <Route path="/warehouses" element={<WarehousesPage />} />
        <Route path="/warehouses/:id" element={<WarehouseDetailPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/stock/movements" element={<StockMovementsPage />} />
        <Route element={<FeatureRouteGuard feature="multi_warehouse" />}>
          <Route path="/stock/transfer" element={<StockTransferPage />} />
        </Route>
        <Route path="/stock/physical-count" element={<StockPhysicalCountPage />} />
        <Route element={<FeatureRouteGuard feature="stock_intelligence" />}>
          <Route path="/stock/intelligence" element={<StockIntelligencePage />} />
        </Route>
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/remitos" element={<RemitosPage />} />
        <Route path="/remitos/:id" element={<RemitoDetailPage />} />
        <Route element={<FeatureRouteGuard feature="current_accounts" />}>
          <Route path="/current-accounts" element={<CurrentAccountsPage />} />
          <Route path="/current-accounts/:customerId" element={<AccountDetailPage />} />
        </Route>

        {/* Write routes — ADMIN + SELLER only */}
        <Route element={<RoleGuard allowed={['ADMIN', 'SELLER']} />}>
          <Route path="/customers/new" element={<CustomerFormPage />} />
          <Route path="/customers/:id/edit" element={<CustomerFormPage />} />
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/bulk-price-update" element={<BulkPriceUpdatePage />} />
          <Route path="/products/:id/edit" element={<ProductFormPage />} />
          <Route path="/warehouses/new" element={<WarehouseFormPage />} />
          <Route path="/warehouses/:id/edit" element={<WarehouseFormPage />} />
          <Route path="/invoices/new" element={<InvoiceFormPage />} />
          <Route path="/invoices/:id/edit" element={<InvoiceFormPage />} />
          <Route path="/remitos/new" element={<RemitoFormPage />} />
        </Route>

        {/* Finances & System — ADMIN only */}
        <Route element={<RoleGuard allowed={['ADMIN']} />}>
          <Route path="/cash-registers" element={<CashRegistersPage />} />
          <Route path="/cash-registers/new" element={<CashRegisterFormPage />} />
          <Route path="/cash-registers/:id/edit" element={<CashRegisterFormPage />} />
          <Route path="/cash-registers/:id" element={<CashRegisterDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route element={<FeatureRouteGuard feature="activity_log" />}>
            <Route path="/activity" element={<ActivityPage />} />
          </Route>
          <Route element={<FeatureRouteGuard feature="iva_book" />}>
            <Route path="/iva" element={<IvaPage />} />
          </Route>
          <Route element={<FeatureRouteGuard feature="reports" />}>
            <Route path="/reports" element={<ReportsHubPage />} />
            <Route path="/reports/sales" element={<SalesReportPage />} />
            <Route path="/reports/purchases" element={<PurchasesReportPage />} />
            <Route path="/reports/profitability" element={<ProfitabilityReportPage />} />
            <Route path="/reports/stock-valuation" element={<StockValuationReportPage />} />
            <Route path="/reports/accounts-receivable" element={<AccountsReceivableReportPage />} />
            <Route path="/reports/cash-flow" element={<CashFlowReportPage />} />
          </Route>
        </Route>

        {/* Suppliers & Purchases — ADMIN only */}
        <Route element={<RoleGuard allowed={['ADMIN']} />}>
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/new" element={<SupplierFormPage />} />
          <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
          <Route path="/suppliers/:id/edit" element={<SupplierFormPage />} />
          <Route element={<FeatureRouteGuard feature="supplier_accounts" />}>
            <Route path="/supplier-accounts" element={<SupplierAccountsPage />} />
            <Route path="/supplier-accounts/:supplierId" element={<SupplierAccountDetailPage />} />
          </Route>

          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/purchases/new" element={<PurchaseFormPage />} />
          <Route path="/purchases/:id" element={<PurchaseDetailPage />} />

          {/* Órdenes de Compra — ADMIN only */}
          <Route path="/orden-compras" element={<OrdenComprasPage />} />
          <Route path="/orden-compras/new" element={<OrdenCompraFormPage />} />
          <Route path="/orden-compras/:id" element={<OrdenCompraDetailPage />} />
          <Route path="/orden-compras/:id/edit" element={<OrdenCompraFormPage />} />

          {/* Órdenes de Pago — ADMIN only */}
          <Route path="/orden-pagos" element={<OrdenPagosPage />} />
          <Route path="/orden-pagos/new" element={<OrdenPagoFormPage />} />
          <Route path="/orden-pagos/:id" element={<OrdenPagoDetailPage />} />

          {/* Bancos */}
          <Route element={<FeatureRouteGuard feature="bank_module" />}>
            <Route path="/banks" element={<BankAccountsPage />} />
            <Route path="/banks/:id" element={<BankAccountDetailPage />} />
          </Route>

          {/* MercadoPago */}
          <Route element={<FeatureRouteGuard feature="mercadopago" />}>
            <Route path="/mercadopago" element={<MercadoPagoPage />} />
          </Route>

          {/* Tarjetas */}
          <Route element={<FeatureRouteGuard feature="cards" />}>
            <Route path="/cards" element={<CardsPage />} />
          </Route>
        </Route>

        {/* Budgets */}
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/budgets/:id" element={<BudgetDetailPage />} />
        <Route element={<RoleGuard allowed={['ADMIN', 'SELLER']} />}>
          <Route path="/budgets/new" element={<BudgetFormPage />} />
          <Route path="/budgets/:id/edit" element={<BudgetFormPage />} />
        </Route>

        {/* Recibos */}
        <Route path="/recibos" element={<RecibosPage />} />
        <Route path="/recibos/:id" element={<ReciboDetailPage />} />

        {/* Contabilidad */}
        <Route path="/accounting/accounts" element={<AccountsPage />} />
        <Route path="/accounting/journal-entries" element={<JournalEntriesPage />} />
        <Route path="/accounting/journal-entries/new" element={<JournalEntryFormPage />} />
        <Route path="/accounting/journal-entries/:id" element={<JournalEntryDetailPage />} />

        {/* Banco de Cheques */}
        <Route element={<FeatureRouteGuard feature="bank_module" />}>
          <Route path="/banco-cheques" element={<BancoCheques />} />
        </Route>

        {/* Notas Internas */}
        <Route path="/internal-notes" element={<InternalNotesPage />} />

        {/* Órdenes de Pedido */}
        <Route path="/orden-pedidos" element={<OrdenPedidosPage />} />
        <Route path="/orden-pedidos/:id" element={<OrdenPedidoDetailPage />} />
        <Route element={<RoleGuard allowed={['ADMIN', 'SELLER']} />}>
          <Route path="/orden-pedidos/new" element={<OrdenPedidoFormPage />} />
          <Route path="/orden-pedidos/:id/edit" element={<OrdenPedidoFormPage />} />
        </Route>

      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
