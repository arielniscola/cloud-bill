import { Router } from 'express';
import { ChequeController } from '../controllers/ChequeController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl   = new ChequeController();

router.use(authMiddleware);

router.get('/',          ctrl.findAll);
router.get('/:id',       ctrl.findById);
router.post('/',         requireRoles('ADMIN', 'FINANCES'), ctrl.create);
router.patch('/:id/status', requireRoles('ADMIN', 'FINANCES'), ctrl.updateStatus);
router.delete('/:id',    requireRoles('ADMIN', 'FINANCES'), ctrl.delete);

export { router as chequeRoutes };
