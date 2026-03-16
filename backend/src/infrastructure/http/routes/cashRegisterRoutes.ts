import { Router } from 'express';
import { CashRegisterController } from '../controllers/CashRegisterController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createCashRegisterSchema,
  updateCashRegisterSchema,
  createCashRegisterCloseSchema,
} from '../../../application/dtos/cashRegister.dto';

const router = Router();
const cashRegisterController = new CashRegisterController();

router.use(authMiddleware);

router.post(
  '/',
  requireRoles('ADMIN'),
  validate({ body: createCashRegisterSchema }),
  cashRegisterController.create
);
router.get('/', cashRegisterController.findAll);
router.get('/:id/movements', requireRoles('ADMIN'), cashRegisterController.getMovements);
router.get('/:id/close-preview', requireRoles('ADMIN'), cashRegisterController.getClosePreview);
router.get('/:id/closes', requireRoles('ADMIN'), cashRegisterController.getCloses);
router.post(
  '/:id/close',
  requireRoles('ADMIN'),
  validate({ body: createCashRegisterCloseSchema }),
  cashRegisterController.createClose
);
router.get('/:id', cashRegisterController.findById);
router.put(
  '/:id',
  requireRoles('ADMIN'),
  validate({ body: updateCashRegisterSchema }),
  cashRegisterController.update
);
router.delete('/:id', requireRoles('ADMIN'), cashRegisterController.delete);

export { router as cashRegisterRoutes };
