import { Router } from 'express';
import { PurchaseRemitoController } from '../controllers/PurchaseRemitoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new PurchaseRemitoController();

router.use(authMiddleware);

router.get('/',            requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), ctrl.findAll);
router.get('/:id',         requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), ctrl.findById);
router.post('/',           requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             ctrl.create);
router.post('/:id/cancel',  requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),            ctrl.cancel);

export { router as purchaseRemitoRoutes };
