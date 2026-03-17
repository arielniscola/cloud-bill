import { Router } from 'express';
import { AppSettingsController } from '../controllers/AppSettingsController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const appSettingsController = new AppSettingsController();

router.use(authMiddleware);

router.get('/', appSettingsController.get);
router.put('/', requireRoles('SUPER_ADMIN', 'ADMIN'), appSettingsController.upsert);

export { router as appSettingsRoutes };
