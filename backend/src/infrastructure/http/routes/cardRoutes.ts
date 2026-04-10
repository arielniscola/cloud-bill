import { Router } from 'express';
import { CardController } from '../controllers/CardController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new CardController();

router.use(authMiddleware);

router.get('/',    (req, res, next) => ctrl.findAll(req, res, next));
router.get('/:id', (req, res, next) => ctrl.findById(req, res, next));
router.post('/',   requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id', requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.delete(req, res, next));

export { router as cardRoutes };
