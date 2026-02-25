import { Router } from 'express';
import { PurchaseController } from '../controllers/PurchaseController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const purchaseController = new PurchaseController();

router.use(authMiddleware);

router.get('/', purchaseController.findAll);
router.get('/:id', purchaseController.findById);
router.post('/', requireRoles('ADMIN', 'SELLER'), purchaseController.create);
router.post('/:id/cancel', requireRoles('ADMIN'), purchaseController.cancel);

export { router as purchaseRoutes };
