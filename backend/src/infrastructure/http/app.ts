import 'reflect-metadata';
import express, { Application } from 'express';
import { errorMiddleware } from './middlewares/errorMiddleware';
import { authRoutes } from './routes/authRoutes';
import { customerRoutes } from './routes/customerRoutes';
import { productRoutes } from './routes/productRoutes';
import { categoryRoutes } from './routes/categoryRoutes';
import { warehouseRoutes } from './routes/warehouseRoutes';
import { stockRoutes } from './routes/stockRoutes';
import { invoiceRoutes } from './routes/invoiceRoutes';
import { currentAccountRoutes } from './routes/currentAccountRoutes';

export function createApp(): Application {
  const app = express();

  // Middleware
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
