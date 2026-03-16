import { Router } from 'express';
import { StockController } from '../controllers/StockController';
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

router.use(authMiddleware);

router.get('/product/:productId', stockController.getStockByProduct);
router.get('/warehouse/:warehouseId/export', stockController.exportWarehouseStock);
router.get('/warehouse/:warehouseId', stockController.getStockByWarehouse);
router.get('/low-stock', stockController.getLowStock);
router.get('/movements', validate({ query: stockQuerySchema }), stockController.getMovements);
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
