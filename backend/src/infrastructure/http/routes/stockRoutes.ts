import { Router } from 'express';
import { StockController } from '../controllers/StockController';
import { StockLotController } from '../controllers/StockLotController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  stockMovementSchema,
  stockTransferSchema,
  setMinQuantitySchema,
  stockQuerySchema,
  bulkAdjustSchema,
} from '../../../application/dtos/stock.dto';

const router = Router();
const stockController = new StockController();
const stockLotController = new StockLotController();

router.use(authMiddleware);

router.get('/product/:productId', stockController.getStockByProduct);
router.get('/warehouse/:warehouseId/export', stockController.exportWarehouseStock);
router.get('/warehouse/:warehouseId', stockController.getStockByWarehouse);
router.get('/low-stock', stockController.getLowStock);
router.get('/movements', validate({ query: stockQuerySchema }), stockController.getMovements);
// Lotes: antes de '/:productId/:warehouseId', que si no se traga '/lots/...'.
router.get('/lots', stockLotController.list);
router.get('/lots/by-reference', stockLotController.byReference);
router.get('/lots/:id/trace', stockLotController.trace);
router.get('/:productId/:warehouseId', stockController.getStock);

router.post(
  '/movement',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: stockMovementSchema }),
  stockController.addMovement
);
router.post(
  '/transfer',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: stockTransferSchema }),
  stockController.transfer
);
router.post(
  '/bulk-adjust',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: bulkAdjustSchema }),
  stockController.adjustBulk
);
router.put(
  '/:productId/:warehouseId/min-quantity',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: setMinQuantitySchema }),
  stockController.setMinQuantity
);

export { router as stockRoutes };
