import { Router } from 'express';
import { BancoController } from '../controllers/BancoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new BancoController();

router.use(authMiddleware);

router.get('/',    (req, res, next) => ctrl.findAll(req, res, next));
router.get('/:id', (req, res, next) => ctrl.findById(req, res, next));
router.post('/',   requireRoles('ADMIN', 'SELLER', 'FINANCES'), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id', requireRoles('ADMIN', 'SELLER', 'FINANCES'), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', requireRoles('ADMIN', 'SELLER', 'FINANCES'), (req, res, next) => ctrl.delete(req, res, next));

export { router as bancoRoutes };
