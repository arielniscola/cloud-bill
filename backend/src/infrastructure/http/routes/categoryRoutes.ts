import { Router } from 'express';
import { CategoryController } from '../controllers/CategoryController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { createCategorySchema, updateCategorySchema } from '../../../application/dtos/category.dto';

const router = Router();
const categoryController = new CategoryController();

router.use(authMiddleware);

router.post('/', validate({ body: createCategorySchema }), categoryController.create);
router.get('/', categoryController.findAll);
router.get('/:id', categoryController.findById);
router.put('/:id', validate({ body: updateCategorySchema }), categoryController.update);
router.delete('/:id', categoryController.delete);

export { router as categoryRoutes };
