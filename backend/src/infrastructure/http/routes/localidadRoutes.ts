import { Router } from 'express';
import { LocalidadController } from '../controllers/LocalidadController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new LocalidadController();

router.use(authMiddleware);

router.get('/',        (req, res, next) => ctrl.findAll(req, res, next));
router.post('/import', requireRoles('ADMIN'), (req, res, next) => ctrl.importFromParties(req, res, next));
router.post('/',       requireRoles('ADMIN'), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id',     requireRoles('ADMIN'), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id',  requireRoles('ADMIN'), (req, res, next) => ctrl.delete(req, res, next));

export { router as localidadRoutes };
