import { Router } from 'express';
import { ExchangeRateController } from '../controllers/ExchangeRateController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new ExchangeRateController();

router.use(authMiddleware);

router.get('/', (req, res, next) => ctrl.getUsdRate(req, res, next));

export { router as exchangeRateRoutes };
