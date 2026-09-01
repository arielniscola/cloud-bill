import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { ImportController } from '../controllers/ImportController';
import { ProductImageController } from '../controllers/ProductImageController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireModule } from '../middlewares/moduleMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from '../../../application/dtos/product.dto';

const router = Router();
const productController = new ProductController();
const importController  = new ImportController();
const productImageController = new ProductImageController();

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

// Imagen del producto — módulo "imagenes" (lo activa el SUPER_ADMIN por empresa).
const imageGuards = [requireRoles('ADMIN', 'SELLER'), requireModule('imagenes')];
router.post('/:id/image/upload-url', ...imageGuards, productImageController.createUploadUrl);
router.put('/:id/image', ...imageGuards, productImageController.confirm);
router.delete('/:id/image', ...imageGuards, productImageController.remove);

export { router as productRoutes };
