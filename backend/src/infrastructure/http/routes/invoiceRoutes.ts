import { Router } from 'express';
import { InvoiceController } from '../controllers/InvoiceController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createInvoiceSchema,
  updateInvoiceStatusSchema,
  payInvoiceSchema,
  invoiceQuerySchema,
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
router.get('/:id', invoiceController.findById);
router.put(
  '/:id',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: createInvoiceSchema }),
  invoiceController.updateDraft
);
router.patch(
  '/:id/status',
  requireRoles('ADMIN'),
  validate({ body: updateInvoiceStatusSchema }),
  invoiceController.updateStatus
);
router.post(
  '/:id/pay',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: payInvoiceSchema }),
  invoiceController.pay
);
router.post('/:id/cancel', requireRoles('ADMIN'), invoiceController.cancel);
router.post('/:id/emit', requireRoles('ADMIN', 'SELLER'), invoiceController.emit);

export { router as invoiceRoutes };
