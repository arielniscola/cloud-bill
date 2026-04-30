import { Router } from 'express';
import { ProductCustomFieldController } from '../controllers/ProductCustomFieldController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createProductCustomFieldSchema,
  updateProductCustomFieldSchema,
} from '../../../application/dtos/productCustomField.dto';

const router = Router();
const ctrl = new ProductCustomFieldController();

router.use(authMiddleware);

router.get('/', (req, res, next) => ctrl.findAll(req, res, next));
router.get('/:id', (req, res, next) => ctrl.findById(req, res, next));
router.post(
  '/',
  requireRoles('ADMIN'),
  validate({ body: createProductCustomFieldSchema }),
  (req, res, next) => ctrl.create(req, res, next),
);
router.put(
  '/:id',
  requireRoles('ADMIN'),
  validate({ body: updateProductCustomFieldSchema }),
  (req, res, next) => ctrl.update(req, res, next),
);
router.delete('/:id', requireRoles('ADMIN'), (req, res, next) => ctrl.delete(req, res, next));

export { router as productCustomFieldRoutes };
