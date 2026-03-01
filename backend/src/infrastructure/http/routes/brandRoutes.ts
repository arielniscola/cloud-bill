import { Router } from 'express';
import { BrandController } from '../controllers/BrandController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { createBrandSchema, updateBrandSchema } from '../../../application/dtos/brand.dto';

const router = Router();
const brandController = new BrandController();

router.use(authMiddleware);

router.post('/', validate({ body: createBrandSchema }), brandController.create);
router.get('/', brandController.findAll);
router.get('/:id', brandController.findById);
router.put('/:id', validate({ body: updateBrandSchema }), brandController.update);
router.delete('/:id', brandController.delete);

export { router as brandRoutes };
