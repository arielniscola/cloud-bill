import { Router } from 'express';
import { WarehouseController } from '../controllers/WarehouseController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createWarehouseSchema,
  updateWarehouseSchema,
} from '../../../application/dtos/warehouse.dto';

const router = Router();
const warehouseController = new WarehouseController();

router.use(authMiddleware);

router.post(
  '/',
  requireRoles('ADMIN'),
  validate({ body: createWarehouseSchema }),
  warehouseController.create
);
router.get('/', warehouseController.findAll);
router.get('/:id', warehouseController.findById);
router.put(
  '/:id',
  requireRoles('ADMIN'),
  validate({ body: updateWarehouseSchema }),
  warehouseController.update
);
router.delete('/:id', requireRoles('ADMIN'), warehouseController.delete);

export { router as warehouseRoutes };
