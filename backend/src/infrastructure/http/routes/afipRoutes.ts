import { Router } from 'express';
import { AfipController } from '../controllers/AfipController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const afipController = new AfipController();

router.use(authMiddleware);

router.get('/config', afipController.getConfig);
router.post('/config', requireRoles('ADMIN'), afipController.saveConfig);
router.post('/test', requireRoles('ADMIN'), afipController.testConnection);
router.post('/invoices/:id/emit', requireRoles('ADMIN', 'SELLER'), afipController.emitInvoice);

export { router as afipRoutes };
