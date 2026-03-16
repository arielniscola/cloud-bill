import { Router } from 'express';
import { OrdenPedidoController } from '../controllers/OrdenPedidoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const controller = new OrdenPedidoController();

router.use(authMiddleware);

router.get('/', controller.findAll);
router.get('/:id', controller.findById);
router.post('/', requireRoles('ADMIN', 'SELLER'), controller.create);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), controller.update);
router.patch('/:id/status', requireRoles('ADMIN', 'SELLER'), controller.updateStatus);
router.post('/:id/convert', requireRoles('ADMIN', 'SELLER'), controller.convertToInvoice);
router.post('/:id/pay', requireRoles('ADMIN', 'SELLER'), controller.pay);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), controller.delete);

export { router as ordenPedidoRoutes };
