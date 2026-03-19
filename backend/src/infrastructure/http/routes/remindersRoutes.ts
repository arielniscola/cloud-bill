import { Router } from 'express';
import { RemindersController } from '../controllers/RemindersController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new RemindersController();

router.use(authMiddleware);
router.get('/', ctrl.getReminders);

export { router as remindersRoutes };
