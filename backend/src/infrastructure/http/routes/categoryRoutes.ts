import { Router } from 'express';
import { CategoryController } from '../controllers/CategoryController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { createCategorySchema, updateCategorySchema } from '../../../application/dtos/category.dto';

const router = Router();
const ctrl = new CategoryController();

router.use(authMiddleware);

router.get('/',    (req, res, next) => ctrl.findAll(req, res, next));
router.get('/:id', (req, res, next) => ctrl.findById(req, res, next));
router.post('/',   requireRoles('ADMIN', 'SELLER'), validate({ body: createCategorySchema }), (req, res, next) => ctrl.create(req, res, next));
router.put('/:id', requireRoles('ADMIN', 'SELLER'), validate({ body: updateCategorySchema }), (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.delete(req, res, next));

export { router as categoryRoutes };
