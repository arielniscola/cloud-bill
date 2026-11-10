import { Router } from 'express';
import { ChequeEgresoController } from '../controllers/ChequeEgresoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl = new ChequeEgresoController();

router.use(authMiddleware);
router.use(requireFeature('bank_module'));

// Motivos de egreso de cheques en cartera (parametrizables por empresa).
router.get('/',       ctrl.findReasons);
router.post('/',      requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES'), ctrl.createReason);
router.put('/:id',    requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES'), ctrl.updateReason);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES'), ctrl.deleteReason);

export { router as chequeEgresoReasonRoutes };
