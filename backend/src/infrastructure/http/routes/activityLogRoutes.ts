import { Router } from 'express';
import { ActivityLogController } from '../controllers/ActivityLogController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const activityLogController = new ActivityLogController();

router.use(authMiddleware);
// Historia de UN comprobante (quién lo creó, cobró, anuló): la ve cualquiera que
// pueda abrir el documento, no solo el admin. Va antes del filtro de roles.
router.get('/document/:entityId', activityLogController.byDocument);
router.use(requireRoles('SUPER_ADMIN', 'ADMIN'));
router.use(requireFeature('activity_log'));

router.get('/entities', activityLogController.getEntities);
router.get('/', activityLogController.findAll);

export { router as activityLogRoutes };
