import { Router } from 'express';
import { StockController } from '../controllers/StockController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  stockMovementSchema,
  stockTransferSchema,
  setMinQuantitySchema,
  stockQuerySchema,
} from '../../../application/dtos/stock.dto';

const router = Router();
const stockController = new StockController();

router.use(authMiddleware);

router.get('/product/:productId', stockController.getStockByProduct);
router.get('/warehouse/:warehouseId', stockController.getStockByWarehouse);
router.get('/low-stock', stockController.getLowStock);
router.get('/movements', validate({ query: stockQuerySchema }), stockController.getMovements);
router.get('/:productId/:warehouseId', stockController.getStock);

router.post(
  '/movement',
  requireRoles('ADMIN', 'WAREHOUSE_CLERK'),
  validate({ body: stockMovementSchema }),
  stockController.addMovement
);
router.post(
  '/transfer',
  requireRoles('ADMIN', 'WAREHOUSE_CLERK'),
  validate({ body: stockTransferSchema }),
  stockController.transfer
);
router.put(
  '/:productId/:warehouseId/min-quantity',
  requireRoles('ADMIN', 'WAREHOUSE_CLERK'),
  validate({ body: setMinQuantitySchema }),
  stockController.setMinQuantity
);

export { router as stockRoutes };
