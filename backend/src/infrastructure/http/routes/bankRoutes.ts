import { Router } from 'express';
import { BankController } from '../controllers/BankController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const bankController = new BankController();

router.use(authMiddleware);
router.use(requireFeature('bank_module'));

// Depósito (WAREHOUSE_CLERK) no accede a bancos, ni siquiera para leer. El
// listado lo usan los formularios de cobro y de pago (para elegir la cuenta);
// los movimientos son solo de administración y finanzas.
const READ_ACCOUNTS  = requireRoles('SUPER_ADMIN', 'ADMIN', 'SELLER', 'FINANCES', 'PURCHASES');
const READ_MOVEMENTS = requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES');

router.get('/',     READ_ACCOUNTS,                        bankController.findAll);
router.get('/:id',  READ_ACCOUNTS,                        bankController.findById);
router.post('/',    requireRoles('ADMIN'),                bankController.create);
router.put('/:id',  requireRoles('ADMIN'),                bankController.update);
router.delete('/:id', requireRoles('ADMIN'),              bankController.delete);

router.get('/:id/movements', READ_MOVEMENTS,              bankController.getMovements);
router.post('/:id/movements', requireRoles('ADMIN', 'SELLER'), bankController.addMovement);

// Deposit a received check (recibo) to a bank account
router.post('/:id/deposit-check/:reciboId', requireRoles('ADMIN', 'SELLER'), bankController.depositCheck);

export { router as bankRoutes };
