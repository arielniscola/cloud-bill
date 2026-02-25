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

export function createApp(): Application {
  const app = express();

  // Middleware
  app.use(cors());
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
