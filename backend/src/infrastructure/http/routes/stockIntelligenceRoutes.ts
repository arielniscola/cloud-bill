import { Router } from 'express';
import { StockIntelligenceController } from '../controllers/StockIntelligenceController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl   = new StockIntelligenceController();

router.use(authMiddleware);
router.use(requireFeature('stock_intelligence'));

// GET /api/stock-intelligence?warehouseId=&days=30
router.get('/', ctrl.getInsights);

export { router as stockIntelligenceRoutes };
