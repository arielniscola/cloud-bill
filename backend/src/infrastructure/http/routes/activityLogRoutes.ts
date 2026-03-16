import { Router } from 'express';
import { ActivityLogController } from '../controllers/ActivityLogController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const activityLogController = new ActivityLogController();

router.use(authMiddleware);
router.use(requireRoles('ADMIN'));

router.get('/', activityLogController.findAll);

export { router as activityLogRoutes };
