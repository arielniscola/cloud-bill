import { Router } from 'express';
import { CashRegisterController } from '../controllers/CashRegisterController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { createCashRegisterSchema, updateCashRegisterSchema } from '../../../application/dtos/cashRegister.dto';

const router = Router();
const cashRegisterController = new CashRegisterController();

router.use(authMiddleware);

router.post(
  '/',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: createCashRegisterSchema }),
  cashRegisterController.create
);
router.get('/', cashRegisterController.findAll);
router.get('/:id', cashRegisterController.findById);
router.put(
  '/:id',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: updateCashRegisterSchema }),
  cashRegisterController.update
);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), cashRegisterController.delete);

export { router as cashRegisterRoutes };
