import { Router } from 'express';
import { PurchaseController } from '../controllers/PurchaseController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const purchaseController = new PurchaseController();

router.use(authMiddleware);
router.use(requireRoles('SUPER_ADMIN', 'ADMIN'));

router.get('/', purchaseController.findAll);
router.get('/:id', purchaseController.findById);
router.post('/', purchaseController.create);
router.post('/:id/cancel', purchaseController.cancel);

export { router as purchaseRoutes };
