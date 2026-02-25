import { Router } from 'express';
import { ActivityLogController } from '../controllers/ActivityLogController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const activityLogController = new ActivityLogController();

router.use(authMiddleware);

router.get('/', activityLogController.findAll);

export { router as activityLogRoutes };
