import { Router } from 'express';
import { BudgetController } from '../controllers/BudgetController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const budgetController = new BudgetController();

router.use(authMiddleware);

router.get('/', budgetController.findAll);
router.get('/:id', budgetController.findById);
router.post('/', requireRoles('ADMIN', 'SELLER'), budgetController.create);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), budgetController.update);
router.patch('/:id/status', requireRoles('ADMIN', 'SELLER'), budgetController.updateStatus);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'ADMIN'), budgetController.delete);
router.post('/:id/send-email', requireRoles('ADMIN', 'SELLER'), budgetController.sendEmail);

export { router as budgetRoutes };
