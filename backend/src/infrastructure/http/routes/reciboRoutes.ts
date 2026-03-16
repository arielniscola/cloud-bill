import { Router } from 'express';
import { ReciboController } from '../controllers/ReciboController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const reciboController = new ReciboController();

router.use(authMiddleware);

router.get('/', reciboController.findAll);
router.get('/checks/list', reciboController.findChecks);
router.get('/:id', reciboController.findById);
router.patch('/:id/check-status', requireRoles('ADMIN', 'SELLER'), reciboController.updateCheckStatus);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), reciboController.cancel);

export { router as reciboRoutes };
