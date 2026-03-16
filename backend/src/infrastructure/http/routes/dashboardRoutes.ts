import { Router } from 'express';
import { DashboardController } from '../controllers/DashboardController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const dashboardController = new DashboardController();

router.use(authMiddleware);
router.use(requireRoles('ADMIN', 'SELLER', 'WAREHOUSE_CLERK'));

router.get('/stats', dashboardController.getStats);
router.get('/charts', dashboardController.getCharts);

export { router as dashboardRoutes };
