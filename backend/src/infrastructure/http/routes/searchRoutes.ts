import { Router } from 'express';
import { SearchController } from '../controllers/SearchController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new SearchController();

router.use(authMiddleware);
router.get('/', ctrl.search);

export { router as searchRoutes };
