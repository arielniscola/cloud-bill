import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { UserController } from '../controllers/UserController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const userController = new UserController();

router.use(authMiddleware);

// Self-service: accesos rápidos del dashboard del usuario actual (cualquier rol)
router.get('/me/dashboard-shortcuts', userController.getMyDashboardShortcuts);
router.put('/me/dashboard-shortcuts', userController.updateMyDashboardShortcuts);

// Cambio de la propia contraseña. Va antes de '/:id/password' (que la tomaría
// con id = "me") y con tope de intentos: pide la contraseña actual.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiados intentos. Intentá de nuevo en unos minutos.' },
});
router.patch('/me/password', passwordLimiter, userController.changeMyPassword);

// SUPER_ADMIN manages all; ADMIN can only read their own company's users
router.get('/',               requireRoles('SUPER_ADMIN', 'ADMIN'), userController.findAll);
router.post('/',              requireRoles('SUPER_ADMIN'), userController.create);
router.put('/:id',            requireRoles('SUPER_ADMIN'), userController.update);
router.patch('/:id/password', requireRoles('SUPER_ADMIN'), userController.changePassword);
router.delete('/:id',         requireRoles('SUPER_ADMIN'), userController.delete);

export { router as userRoutes };
