import { Router } from 'express';
import { PurchaseRemitoController } from '../controllers/PurchaseRemitoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { withApproval, blockIfPendingApproval } from '../middlewares/approvalMiddleware';
import { resolvePurchaseRemitoCancel } from '../middlewares/approvalResolvers';

const router = Router();
const ctrl = new PurchaseRemitoController();

router.use(authMiddleware);

// Depósito (WAREHOUSE_CLERK) carga recepciones: quedan PENDING_CONFIRMATION
// sin mover stock hasta que un admin las confirma (puede corregir) o rechaza.
router.get('/',              requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES', 'WAREHOUSE_CLERK'), ctrl.findAll);
router.get('/pending-count', requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES', 'WAREHOUSE_CLERK'), ctrl.pendingCount);
router.get('/:id',           requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES', 'WAREHOUSE_CLERK'), ctrl.findById);
router.post('/',             requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES', 'WAREHOUSE_CLERK'),             ctrl.create);
router.post('/:id/confirm',  requireRoles('SUPER_ADMIN', 'ADMIN'), ctrl.confirm);
router.post('/:id/reject',   requireRoles('SUPER_ADMIN', 'ADMIN'), ctrl.reject);
router.patch('/:id/number', requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),            blockIfPendingApproval('PURCHASE_REMITO'), ctrl.updateNumber);
router.post('/:id/cancel',  requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),
  ...withApproval('purchaseRemitos.cancel', resolvePurchaseRemitoCancel, ctrl.cancel));

export { router as purchaseRemitoRoutes };
