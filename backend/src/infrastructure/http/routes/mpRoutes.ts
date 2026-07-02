import { Router } from 'express';
import { MercadoPagoController } from '../controllers/MercadoPagoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl = new MercadoPagoController();

// Webhook — no auth (MP calls this directly)
router.post('/webhook', ctrl.webhook);

// Authenticated routes
router.use(authMiddleware);
router.use(requireFeature('mercadopago'));

router.get('/status',        ctrl.getStatus);
router.get('/balance',       requireRoles('ADMIN', 'FINANCES'), ctrl.getBalance);
router.get('/movements',     requireRoles('ADMIN', 'FINANCES'), ctrl.getMovements);
router.post('/preference',   requireRoles('ADMIN', 'SELLER'),   ctrl.createPreference);
router.post('/qr',           requireRoles('ADMIN', 'SELLER'),   ctrl.createQrOrder);
router.post('/link-payment', requireRoles('ADMIN', 'SELLER'),   ctrl.linkPayment);

export { router as mpRoutes };
