import { Router } from 'express';
import { CurrentAccountController } from '../controllers/CurrentAccountController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createPaymentSchema,
  setCreditLimitSchema,
  movementQuerySchema,
} from '../../../application/dtos/currentAccount.dto';

const router = Router();
const currentAccountController = new CurrentAccountController();

router.use(authMiddleware);

router.get('/', currentAccountController.findAll);
router.get('/customer/:customerId', currentAccountController.findByCustomerId);
router.get('/customer/:customerId/balance', currentAccountController.getBalance);
router.get(
  '/customer/:customerId/movements',
  validate({ query: movementQuerySchema }),
  currentAccountController.getMovements
);
router.post(
  '/customer/:customerId/payment',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: createPaymentSchema }),
  currentAccountController.addPayment
);
router.put(
  '/customer/:customerId/credit-limit',
  requireRoles('ADMIN'),
  validate({ body: setCreditLimitSchema }),
  currentAccountController.setCreditLimit
);

export { router as currentAccountRoutes };
