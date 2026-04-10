import { Router } from 'express';
import { RubroController } from '../controllers/RubroController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { createRubroSchema, updateRubroSchema } from '../../../application/dtos/rubro.dto';

const router = Router();
const ctrl = new RubroController();

router.use(authMiddleware);

router.get('/',    (req, res, next) => ctrl.findAll(req, res, next));
router.get('/:id', (req, res, next) => ctrl.findById(req, res, next));
router.post('/',   requireRoles('ADMIN', 'SELLER'), validate({ body: createRubroSchema }), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id', requireRoles('ADMIN', 'SELLER'), validate({ body: updateRubroSchema }), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.delete(req, res, next));

export { router as rubroRoutes };
