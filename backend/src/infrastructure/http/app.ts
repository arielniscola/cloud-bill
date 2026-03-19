import 'reflect-metadata';
import express, { Application } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/errorMiddleware';
import { authRoutes } from './routes/authRoutes';
import { customerRoutes } from './routes/customerRoutes';
import { productRoutes } from './routes/productRoutes';
import { categoryRoutes } from './routes/categoryRoutes';
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
import { dashboardRoutes } from './routes/dashboardRoutes';
import { brandRoutes } from './routes/brandRoutes';
import { budgetRoutes } from './routes/budgetRoutes';
import { appSettingsRoutes } from './routes/appSettingsRoutes';
import { stockIntelligenceRoutes } from './routes/stockIntelligenceRoutes';
import { reciboRoutes } from './routes/reciboRoutes';
import { ordenPedidoRoutes } from './routes/ordenPedidoRoutes';
import { ordenCompraRoutes } from './routes/ordenCompraRoutes';
import { userRoutes } from './routes/userRoutes';
import { companyRoutes } from './routes/companyRoutes';
import { ordenPagoRoutes } from './routes/ordenPagoRoutes';
import { bankRoutes } from './routes/bankRoutes';
import { searchRoutes } from './routes/searchRoutes';
import { remindersRoutes } from './routes/remindersRoutes';

export function createApp(): Application {
  const app = express();

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
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/categories', categoryRoutes);
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
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/brands', brandRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/app-settings', appSettingsRoutes);
  app.use('/api/stock-intelligence', stockIntelligenceRoutes);
  app.use('/api/recibos', reciboRoutes);
  app.use('/api/orden-pedidos', ordenPedidoRoutes);
  app.use('/api/orden-compras', ordenCompraRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/orden-pagos', ordenPagoRoutes);
  app.use('/api/banks', bankRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/reminders', remindersRoutes);

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
