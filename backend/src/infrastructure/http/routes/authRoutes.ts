import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { validate } from '../middlewares/validationMiddleware';
import { registerSchema, loginSchema } from '../../../application/dtos/auth.dto';

const router = Router();
const authController = new AuthController();

router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', validate({ body: loginSchema }), authController.login);

export { router as authRoutes };
