import { Router } from 'express';
import { ActivityLogController } from '../controllers/ActivityLogController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const activityLogController = new ActivityLogController();

router.use(authMiddleware);
router.use(requireRoles('SUPER_ADMIN', 'ADMIN'));
router.use(requireFeature('activity_log'));

router.get('/entities', activityLogController.getEntities);
router.get('/', activityLogController.findAll);

export { router as activityLogRoutes };
