import { Router } from 'express';
import { SyncController } from '../controllers/SyncController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new SyncController();

// Only authenticated ADMIN (or SUPER_ADMIN) users can trigger a sync export
router.use(authMiddleware);
router.use(requireRoles('ADMIN', 'SUPER_ADMIN'));

router.get('/export', ctrl.export.bind(ctrl));
router.get('/status', ctrl.status.bind(ctrl));

export { router as syncRoutes };
