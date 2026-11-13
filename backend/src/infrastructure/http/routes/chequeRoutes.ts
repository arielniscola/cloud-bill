import { Router } from 'express';
import { ChequeController } from '../controllers/ChequeController';
import { ChequeEgresoController } from '../controllers/ChequeEgresoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl   = new ChequeController();
const egresos = new ChequeEgresoController();

router.use(authMiddleware);
router.use(requireFeature('bank_module'));

// Egreso de cheques en cartera (antes de '/:id' para que no lo capture).
// La cartera de cheques la ven administración, finanzas y compras (que los
// endosa en las órdenes de pago). Ventas y depósito no.
const READ = requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES');

router.get('/cartera',              READ, egresos.cartera);
router.get('/egresos',              READ, egresos.list);
router.post('/egresos',             requireRoles('ADMIN', 'FINANCES'), egresos.create);
router.post('/egresos/:id/cancel',  requireRoles('ADMIN'), egresos.cancel);

router.get('/',          READ, ctrl.findAll);
router.get('/:id',       READ, ctrl.findById);
router.post('/',         requireRoles('ADMIN', 'FINANCES'), ctrl.create);
router.patch('/:id/status', requireRoles('ADMIN', 'FINANCES'), ctrl.updateStatus);
router.delete('/:id',    requireRoles('ADMIN', 'FINANCES'), ctrl.delete);

export { router as chequeRoutes };
