import { Router } from 'express';
import { sendEmailLimiter } from '../utils/emailRequest';
import { InvoiceController } from '../controllers/InvoiceController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { withApproval, blockIfPendingApproval } from '../middlewares/approvalMiddleware';
import { resolveInvoiceCancel, resolveInvoiceDelete, resolveInvoicePay } from '../middlewares/approvalResolvers';
import {
  createInvoiceSchema,
  updateInvoiceStatusSchema,
  payInvoiceSchema,
  invoiceQuerySchema,
  emitBatchSchema,
} from '../../../application/dtos/invoice.dto';

const router = Router();
const invoiceController = new InvoiceController();

router.use(authMiddleware);

router.post(
  '/',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: createInvoiceSchema }),
  invoiceController.create
);
router.get('/', validate({ query: invoiceQuerySchema }), invoiceController.findAll);
// Antes de '/:id' para que "stats" no se lea como un id.
router.get('/stats', validate({ query: invoiceQuerySchema }), invoiceController.stats);
// Antes de '/:id/...' por claridad: no colisiona, pero es una ruta de colección.
router.post(
  '/emit-batch',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: emitBatchSchema }),
  invoiceController.emitBatch
);
router.get('/:id', invoiceController.findById);
router.put(
  '/:id',
  requireRoles('ADMIN', 'SELLER'),
  blockIfPendingApproval('INVOICE'),
  validate({ body: createInvoiceSchema }),
  invoiceController.updateDraft
);
router.patch(
  '/:id/status',
  requireRoles('SUPER_ADMIN', 'ADMIN'),
  blockIfPendingApproval('INVOICE'),
  validate({ body: updateInvoiceStatusSchema }),
  invoiceController.updateStatus
);
router.post(
  '/:id/pay',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: payInvoiceSchema }),
  // Pagar una NC es una devolución: requiere aprobación del Dueño.
  ...withApproval('invoices.pay', resolveInvoicePay, invoiceController.pay)
);
router.post(
  '/:id/cancel',
  requireRoles('SUPER_ADMIN', 'ADMIN'),
  ...withApproval('invoices.cancel', resolveInvoiceCancel, invoiceController.cancel)
);
router.delete(
  '/:id',
  requireRoles('ADMIN', 'SELLER'),
  ...withApproval('invoices.delete', resolveInvoiceDelete, invoiceController.remove)
);
router.post('/:id/emit', requireRoles('ADMIN', 'SELLER'), blockIfPendingApproval('INVOICE'), invoiceController.emit);
router.post('/:id/send-email', requireRoles('ADMIN', 'SELLER'), sendEmailLimiter, invoiceController.sendEmail);
router.get('/:id/afip-errors', invoiceController.getAfipErrors);

export { router as invoiceRoutes };
