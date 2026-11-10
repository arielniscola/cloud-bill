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
router.get('/cartera',              egresos.cartera);
router.get('/egresos',              egresos.list);
router.post('/egresos',             requireRoles('ADMIN', 'FINANCES'), egresos.create);
router.post('/egresos/:id/cancel',  requireRoles('ADMIN'), egresos.cancel);

router.get('/',          ctrl.findAll);
router.get('/:id',       ctrl.findById);
router.post('/',         requireRoles('ADMIN', 'FINANCES'), ctrl.create);
router.patch('/:id/status', requireRoles('ADMIN', 'FINANCES'), ctrl.updateStatus);
router.delete('/:id',    requireRoles('ADMIN', 'FINANCES'), ctrl.delete);

export { router as chequeRoutes };
