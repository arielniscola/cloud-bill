import { Router } from 'express';
import { CashMovementReasonController } from '../controllers/CashMovementReasonController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new CashMovementReasonController();

router.use(authMiddleware);

// Mismos roles que registran retiros / ingresos.
router.get('/',       (req, res, next) => ctrl.findAll(req, res, next));
router.post('/',      requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES'), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id',    requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES'), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES'), (req, res, next) => ctrl.delete(req, res, next));

export { router as cashMovementReasonRoutes };
