import { Router } from 'express';
import { BankController } from '../controllers/BankController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const bankController = new BankController();

router.use(authMiddleware);

router.get('/',                                           bankController.findAll);
router.get('/:id',                                        bankController.findById);
router.post('/',    requireRoles('ADMIN'),                bankController.create);
router.put('/:id',  requireRoles('ADMIN'),                bankController.update);
router.delete('/:id', requireRoles('ADMIN'),              bankController.delete);

router.get('/:id/movements',                              bankController.getMovements);
router.post('/:id/movements', requireRoles('ADMIN', 'SELLER'), bankController.addMovement);

// Deposit a received check (recibo) to a bank account
router.post('/:id/deposit-check/:reciboId', requireRoles('ADMIN', 'SELLER'), bankController.depositCheck);

export { router as bankRoutes };
