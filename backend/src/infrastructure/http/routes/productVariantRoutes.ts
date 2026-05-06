import { Router } from 'express';
import { ProductVariantController } from '../controllers/ProductVariantController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router({ mergeParams: true });
const ctrl = new ProductVariantController();

router.use(authMiddleware);

// Nested under /api/products/:productId/variants
router.get('/',         (req, res, next) => ctrl.findByProduct(req, res, next));
router.post('/',        requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.create(req, res, next));
router.post('/bulk',    requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.bulkCreate(req, res, next));

export { router as productVariantRoutes };

// Standalone routes for /api/product-variants/:id (update/delete by variant id)
const standaloneRouter = Router();
standaloneRouter.use(authMiddleware);
standaloneRouter.get('/:id',    (req, res, next) => ctrl.findById(req, res, next));
standaloneRouter.put('/:id',    requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.update(req, res, next));
standaloneRouter.delete('/:id', requireRoles('ADMIN', 'SELLER'), (req, res, next) => ctrl.delete(req, res, next));

export { standaloneRouter as productVariantStandaloneRoutes };
