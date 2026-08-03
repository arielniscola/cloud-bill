import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { ImportController } from '../controllers/ImportController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from '../../../application/dtos/product.dto';

const router = Router();
const productController = new ProductController();
const importController  = new ImportController();

router.use(authMiddleware);

router.post('/import', requireRoles('ADMIN', 'SELLER'), importController.importProducts);
router.post('/', requireRoles('ADMIN', 'SELLER'), validate({ body: createProductSchema }), productController.create);
router.patch('/bulk-price-update', requireRoles('ADMIN', 'SELLER'), productController.bulkUpdatePrices);
router.patch('/bulk-update', requireRoles('ADMIN', 'SELLER'), productController.bulkUpdate);
router.patch('/bulk-update-by-filter', requireRoles('ADMIN', 'SELLER'), productController.bulkUpdateByFilter);
router.get('/', validate({ query: productQuerySchema }), productController.findAll);
router.get('/:id', productController.findById);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), validate({ body: updateProductSchema }), productController.update);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), productController.delete);

export { router as productRoutes };
