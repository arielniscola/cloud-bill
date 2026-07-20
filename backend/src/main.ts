import 'reflect-metadata';
import './container';
import { createApp } from './infrastructure/http/app';
import { env } from './infrastructure/config/env';
import prisma from './infrastructure/database/prisma';
import { recurringInvoiceService } from './infrastructure/services/RecurringInvoiceService';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  console.log(`Health check: http://localhost:${env.PORT}/health`);
});

// ── Scheduler de facturación recurrente ─────────────────────────────────────
// Corre al arrancar (30s después, para no competir con el boot) y cada hora.
// Genera facturas EN BORRADOR de los abonos vencidos; es idempotente (claim
// atómico de cada corrida), así que un reinicio o doble corrida no duplica.
if (env.NODE_ENV !== 'test') {
  const runRecurring = async () => {
    try {
      const { generated, errors } = await recurringInvoiceService.generateDueInvoices();
      if (generated > 0 || errors > 0) {
        console.log(`[abonos] Generadas: ${generated}, errores: ${errors}`);
      }
    } catch (err) {
      console.error('[abonos] Error en el generador:', err);
    }
  };
  setTimeout(runRecurring, 30 * 1000);
  setInterval(runRecurring, 60 * 60 * 1000);
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
