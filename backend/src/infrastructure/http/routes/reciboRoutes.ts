import { Router } from 'express';
import { ReciboController } from '../controllers/ReciboController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { withApproval, blockIfPendingApproval } from '../middlewares/approvalMiddleware';
import { resolveReciboCancel } from '../middlewares/approvalResolvers';

const router = Router();
const reciboController = new ReciboController();

router.use(authMiddleware);

// Arrow wrappers preserve `this` (cancel() uses this._recalculate*).
// Los cobros los ven ventas, administración y finanzas. Depósito y compras no.
const READ = requireRoles('SUPER_ADMIN', 'ADMIN', 'SELLER', 'FINANCES');

router.get('/', READ, (req, res, next) => reciboController.findAll(req, res, next));
router.get('/checks/list', READ, (req, res, next) => reciboController.findChecks(req, res, next));
router.get('/:id', READ, (req, res, next) => reciboController.findById(req, res, next));
router.patch('/:id/check-status',  requireRoles('ADMIN', 'SELLER'), blockIfPendingApproval('RECIBO'), (req, res, next) => reciboController.updateCheckStatus(req, res, next));
router.patch('/:id/deposit-cash',  requireRoles('ADMIN', 'SELLER'), blockIfPendingApproval('RECIBO'), (req, res, next) => reciboController.depositCheckToCash(req, res, next));
router.delete(
  '/:id',
  requireRoles('ADMIN', 'SELLER'),
  ...withApproval('recibos.cancel', resolveReciboCancel, (req, res, next) => reciboController.cancel(req, res, next))
);

export { router as reciboRoutes };
