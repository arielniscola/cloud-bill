import { Router } from 'express';
import { ReciboController } from '../controllers/ReciboController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const reciboController = new ReciboController();

router.use(authMiddleware);

router.get('/', reciboController.findAll);
router.get('/:id', reciboController.findById);
router.delete('/:id', reciboController.cancel);

export { router as reciboRoutes };
