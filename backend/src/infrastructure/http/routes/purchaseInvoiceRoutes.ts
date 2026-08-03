import { Router } from 'express';
import { PurchaseInvoiceController } from '../controllers/PurchaseInvoiceController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const controller = new PurchaseInvoiceController();

router.use(authMiddleware);

router.get('/',     requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), controller.findAllStandalone);
router.get('/retenciones', requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), controller.findRetenciones);
router.get('/:id',  requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), controller.findById);
router.post('/',    requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             controller.createStandalone);
router.put('/:id',  requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             controller.updateStandalone);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'ADMIN'),                        controller.deleteStandalone);

export { router as purchaseInvoiceRoutes };
