import { Router } from 'express';
import { OrdenCompraController } from '../controllers/OrdenCompraController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl   = new OrdenCompraController();

router.use(authMiddleware);
router.use(requireRoles('SUPER_ADMIN', 'ADMIN'));

router.get('/',             ctrl.findAll);
router.get('/:id',          ctrl.findById);
router.post('/',            ctrl.create);
router.put('/:id',          ctrl.update);
router.patch('/:id/status', ctrl.updateStatus);
router.post('/:id/convert', ctrl.convert);
router.delete('/:id',       ctrl.delete);

export { router as ordenCompraRoutes };
