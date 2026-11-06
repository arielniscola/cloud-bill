import { Router } from 'express';
import { StockIntelligenceController } from '../controllers/StockIntelligenceController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl   = new StockIntelligenceController();

router.use(authMiddleware);
router.use(requireFeature('stock_intelligence'));
// Depósito no accede a Stock Inteligente.
router.use(requireRoles('SUPER_ADMIN', 'ADMIN', 'SELLER', 'FINANCES', 'PURCHASES'));

// GET /api/stock-intelligence?warehouseId=&days=30
router.get('/', ctrl.getInsights);

export { router as stockIntelligenceRoutes };
