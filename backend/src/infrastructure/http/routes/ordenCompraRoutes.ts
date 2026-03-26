import { Router } from 'express';
import { OrdenCompraController } from '../controllers/OrdenCompraController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl   = new OrdenCompraController();

router.use(authMiddleware);

router.get('/',             requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), ctrl.findAll);
router.get('/:id',          requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), ctrl.findById);
router.post('/',            requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             ctrl.create);
router.put('/:id',          requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             ctrl.update);
router.patch('/:id/status', requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             ctrl.updateStatus);
router.post('/:id/convert', requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             ctrl.convert);
router.delete('/:id',       requireRoles('SUPER_ADMIN', 'ADMIN'),                          ctrl.delete);

export { router as ordenCompraRoutes };
