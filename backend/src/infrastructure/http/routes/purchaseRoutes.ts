import { Router } from 'express';
import { PurchaseController } from '../controllers/PurchaseController';
import { PurchaseInvoiceController } from '../controllers/PurchaseInvoiceController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const purchaseController        = new PurchaseController();
const purchaseInvoiceController = new PurchaseInvoiceController();

router.use(authMiddleware);

router.get('/',                 requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), purchaseController.findAll);
router.get('/pending-invoices', requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), purchaseController.getPendingInvoices);
router.get('/:id',              requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), purchaseController.findById);
router.post('/',                requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             purchaseController.create);
router.post('/:id/cancel',      requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             purchaseController.cancel);
router.patch('/:id/warehouse',  requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             purchaseController.assignWarehouse);

// Supplier invoices for a purchase
router.get( '/:purchaseId/invoices',              requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), purchaseInvoiceController.findAll);
router.post('/:purchaseId/invoices',              requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             purchaseInvoiceController.create);
router.put( '/:purchaseId/invoices/:invoiceId',   requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             purchaseInvoiceController.update);
router.delete('/:purchaseId/invoices/:invoiceId', requireRoles('SUPER_ADMIN', 'ADMIN'),                          purchaseInvoiceController.delete);

export { router as purchaseRoutes };
