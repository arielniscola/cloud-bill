import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const userController = new UserController();

router.use(authMiddleware);

// ADMIN + SUPER_ADMIN can list users
router.get('/', requireRoles('SUPER_ADMIN', 'ADMIN'), userController.findAll);

// Only SUPER_ADMIN can create/edit/delete
router.post('/',              requireRoles('SUPER_ADMIN'), userController.create);
router.put('/:id',            requireRoles('SUPER_ADMIN'), userController.update);
router.patch('/:id/password', requireRoles('SUPER_ADMIN'), userController.changePassword);
router.delete('/:id',         requireRoles('SUPER_ADMIN'), userController.delete);

export { router as userRoutes };
