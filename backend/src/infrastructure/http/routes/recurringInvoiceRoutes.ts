import { Router } from 'express';
import { RecurringInvoiceController } from '../controllers/RecurringInvoiceController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const controller = new RecurringInvoiceController();

router.use(authMiddleware);

router.get('/', controller.findAll);
router.get('/:id', controller.findById);
router.post('/', requireRoles('ADMIN', 'SELLER'), controller.create);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), controller.update);
router.delete('/:id', requireRoles('SUPER_ADMIN', 'ADMIN'), controller.delete);
router.post('/:id/run', requireRoles('ADMIN', 'SELLER'), controller.runNow);
router.post('/generate-due', requireRoles('ADMIN'), controller.generateDue);

export { router as recurringInvoiceRoutes };
