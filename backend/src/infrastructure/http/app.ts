import 'reflect-metadata';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorMiddleware } from './middlewares/errorMiddleware';
import { authRoutes } from './routes/authRoutes';
import { customerRoutes } from './routes/customerRoutes';
import { productRoutes } from './routes/productRoutes';
import { rubroRoutes } from './routes/rubroRoutes';
import { warehouseRoutes } from './routes/warehouseRoutes';
import { stockRoutes } from './routes/stockRoutes';
import { invoiceRoutes } from './routes/invoiceRoutes';
import { currentAccountRoutes } from './routes/currentAccountRoutes';
import { remitoRoutes } from './routes/remitoRoutes';
import { cashRegisterRoutes } from './routes/cashRegisterRoutes';
import { activityLogRoutes } from './routes/activityLogRoutes';
import { afipRoutes } from './routes/afipRoutes';
import { ivaRoutes } from './routes/ivaRoutes';
import { supplierRoutes } from './routes/supplierRoutes';
import { purchaseRoutes } from './routes/purchaseRoutes';
import { purchaseInvoiceRoutes } from './routes/purchaseInvoiceRoutes';
import { dashboardRoutes } from './routes/dashboardRoutes';
import { brandRoutes } from './routes/brandRoutes';
import { budgetRoutes } from './routes/budgetRoutes';
import { appSettingsRoutes } from './routes/appSettingsRoutes';
import { stockIntelligenceRoutes } from './routes/stockIntelligenceRoutes';
import { reciboRoutes } from './routes/reciboRoutes';
import { recurringInvoiceRoutes } from './routes/recurringInvoiceRoutes';
import { ordenPedidoRoutes } from './routes/ordenPedidoRoutes';
import { purchaseRemitoRoutes } from './routes/purchaseRemitoRoutes';
import { userRoutes } from './routes/userRoutes';
import { companyRoutes } from './routes/companyRoutes';
import { ordenPagoRoutes } from './routes/ordenPagoRoutes';
import { bankRoutes } from './routes/bankRoutes';
import { searchRoutes } from './routes/searchRoutes';
import { remindersRoutes } from './routes/remindersRoutes';
import { syncRoutes } from './routes/syncRoutes';
import { reportsRoutes } from './routes/reportsRoutes';
import { mpRoutes } from './routes/mpRoutes';
import { cardRoutes } from './routes/cardRoutes';
import { bancoRoutes } from './routes/bancoRoutes';
import { chequeraRoutes } from './routes/chequeraRoutes';
import { categoryRoutes } from './routes/categoryRoutes';
import { productVariantRoutes, productVariantStandaloneRoutes } from './routes/productVariantRoutes';
import { productCustomFieldRoutes } from './routes/productCustomFieldRoutes';
import { internalNoteRoutes } from './routes/internalNoteRoutes';
import { accountingRoutes } from './routes/accountingRoutes';
import { pdvRoutes } from './routes/pdvRoutes';
import { chequeRoutes } from './routes/chequeRoutes';
import { fiscalModeMiddleware } from './middlewares/fiscalModeMiddleware';

export function createApp(): Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // Middleware
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['*'];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
    })
  );
  // 20mb: las importaciones masivas (CSV de miles de productos) superan el default de 100kb
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));
  app.use(fiscalModeMiddleware);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/products/:productId/variants', productVariantRoutes);
  app.use('/api/product-variants', productVariantStandaloneRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/rubros', rubroRoutes);
  app.use('/api/warehouses', warehouseRoutes);
  app.use('/api/stock', stockRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/current-accounts', currentAccountRoutes);
  app.use('/api/remitos', remitoRoutes);
  app.use('/api/cash-registers', cashRegisterRoutes);
  app.use('/api/activity-logs', activityLogRoutes);
  app.use('/api/afip', afipRoutes);
  app.use('/api/iva', ivaRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/purchase-invoices', purchaseInvoiceRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/brands', brandRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/app-settings', appSettingsRoutes);
  app.use('/api/stock-intelligence', stockIntelligenceRoutes);
  app.use('/api/recibos', reciboRoutes);
  app.use('/api/recurring-invoices', recurringInvoiceRoutes);
  app.use('/api/orden-pedidos', ordenPedidoRoutes);
  app.use('/api/purchase-remitos', purchaseRemitoRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/orden-pagos', ordenPagoRoutes);
  app.use('/api/banks', bankRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/reminders', remindersRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/mercadopago', mpRoutes);
  app.use('/api/cards', cardRoutes);
  app.use('/api/bancos', bancoRoutes);
  app.use('/api/chequeras', chequeraRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/product-custom-fields', productCustomFieldRoutes);
  app.use('/api/internal-notes', internalNoteRoutes);
  app.use('/api/accounting', accountingRoutes);
  app.use('/api/pdv', pdvRoutes);
  app.use('/api/cheques', chequeRoutes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      status: 'error',
      message: 'Route not found',
    });
  });

  // Error handling
  app.use(errorMiddleware);

  return app;
}
