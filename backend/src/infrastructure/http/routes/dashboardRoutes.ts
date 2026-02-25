import { Router } from 'express';
import { DashboardController } from '../controllers/DashboardController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const dashboardController = new DashboardController();

router.use(authMiddleware);

router.get('/stats', dashboardController.getStats);

export { router as dashboardRoutes };
