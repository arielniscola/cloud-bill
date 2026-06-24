import { Router } from 'express';
import { ReciboController } from '../controllers/ReciboController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const reciboController = new ReciboController();

router.use(authMiddleware);

// Arrow wrappers preserve `this` (cancel() uses this._recalculate*).
router.get('/', (req, res, next) => reciboController.findAll(req, res, next));
router.get('/checks/list', (req, res, next) => reciboController.findChecks(req, res, next));
router.get('/:id', (req, res, next) => reciboController.findById(req, res, next));
router.patch('/:id/check-status',  requireRoles('ADMIN', 'SELLER'), (req, res, next) => reciboController.updateCheckStatus(req, res, next));
router.patch('/:id/deposit-cash',  requireRoles('ADMIN', 'SELLER'), (req, res, next) => reciboController.depositCheckToCash(req, res, next));
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), (req, res, next) => reciboController.cancel(req, res, next));

export { router as reciboRoutes };
