import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/AuthController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { registerSchema, loginSchema } from '../../../application/dtos/auth.dto';

const router = Router();
const authController = new AuthController();

// Brute-force protection on credential endpoints: max 10 attempts / 15 min per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Demasiados intentos. Intentá de nuevo en unos minutos.' },
});

// El registro NO es público: permitía auto-crear usuarios con cualquier rol
// (incluso SUPER_ADMIN). El alta normal de usuarios va por POST /api/users.
router.post(
  '/register',
  authLimiter,
  authMiddleware,
  requireRoles('SUPER_ADMIN'),
  validate({ body: registerSchema }),
  authController.register
);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);

export { router as authRoutes };
