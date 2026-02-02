import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from '../../../application/dtos/product.dto';

const router = Router();
const productController = new ProductController();

router.use(authMiddleware);

router.post('/', validate({ body: createProductSchema }), productController.create);
router.get('/', validate({ query: productQuerySchema }), productController.findAll);
router.get('/:id', productController.findById);
router.put('/:id', validate({ body: updateProductSchema }), productController.update);
router.delete('/:id', productController.delete);

export { router as productRoutes };
