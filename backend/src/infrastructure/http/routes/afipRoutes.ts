import { Router } from 'express';
import { AfipController } from '../controllers/AfipController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const afipController = new AfipController();

router.use(authMiddleware);

router.get('/config', requireRoles('SUPER_ADMIN', 'ADMIN'), afipController.getConfig);
router.post('/config', requireRoles('SUPER_ADMIN', 'ADMIN'), afipController.saveConfig);
router.post('/test', requireRoles('SUPER_ADMIN', 'ADMIN'), afipController.testConnection);
// Padrón: lo usan quienes dan de alta clientes (ventas) y proveedores (compras)
router.get('/padron/:cuit', requireRoles('ADMIN', 'SELLER', 'PURCHASES'), afipController.getPadron);
router.post('/invoices/:id/emit', requireRoles('ADMIN', 'SELLER'), afipController.emitInvoice);

export { router as afipRoutes };
