import { Router } from 'express';
import { PurchaseController } from '../controllers/PurchaseController';
import { PurchaseInvoiceController } from '../controllers/PurchaseInvoiceController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const purchaseController        = new PurchaseController();
const purchaseInvoiceController = new PurchaseInvoiceController();

router.use(authMiddleware);
router.use(requireRoles('SUPER_ADMIN', 'ADMIN'));

router.get('/',                        purchaseController.findAll);
router.get('/pending-invoices',        purchaseController.getPendingInvoices);
router.get('/:id',                     purchaseController.findById);
router.post('/',        purchaseController.create);
router.post('/:id/cancel',          purchaseController.cancel);
router.patch('/:id/warehouse',       purchaseController.assignWarehouse);

// Supplier invoices for a purchase
router.get( '/:purchaseId/invoices',                purchaseInvoiceController.findAll);
router.post('/:purchaseId/invoices',                purchaseInvoiceController.create);
router.put( '/:purchaseId/invoices/:invoiceId',     purchaseInvoiceController.update);
router.delete('/:purchaseId/invoices/:invoiceId',   purchaseInvoiceController.delete);

export { router as purchaseRoutes };
