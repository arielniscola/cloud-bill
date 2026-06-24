import { Router } from 'express';
import { ChequeraController } from '../controllers/ChequeraController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl = new ChequeraController();

router.use(authMiddleware);
router.use(requireFeature('bank_module'));

router.get('/',          (req, res, next) => ctrl.findAll(req, res, next));
router.get('/:id',       (req, res, next) => ctrl.findById(req, res, next));
router.post('/',         requireRoles('ADMIN', 'FINANCES'), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id',       requireRoles('ADMIN', 'FINANCES'), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id',    requireRoles('ADMIN', 'FINANCES'), (req, res, next) => ctrl.delete(req, res, next));

export { router as chequeraRoutes };
