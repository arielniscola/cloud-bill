import { Router } from 'express';
import { ReportsController } from '../controllers/ReportsController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const reportsController = new ReportsController();

router.use(authMiddleware);
router.use(requireRoles('ADMIN', 'SELLER'));

router.get('/sales/by-product', reportsController.salesByProduct);

export { router as reportsRoutes };
