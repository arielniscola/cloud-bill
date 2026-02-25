import { Router } from 'express';
import { IvaController } from '../controllers/IvaController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const ivaController = new IvaController();

router.use(authMiddleware);

router.get('/ventas', ivaController.getVentas);
router.get('/ventas/export', ivaController.exportVentasCSV);
router.get('/compras', ivaController.getCompras);
router.get('/compras/export', ivaController.exportComprasCSV);

export { router as ivaRoutes };
