import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const userController = new UserController();

router.use(authMiddleware);
router.use(requireRoles('ADMIN'));

router.get('/',              userController.findAll);
router.post('/',             userController.create);
router.put('/:id',           userController.update);
router.patch('/:id/password',userController.changePassword);
router.delete('/:id',        userController.delete);

export { router as userRoutes };
