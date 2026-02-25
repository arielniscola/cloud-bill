import { Router } from 'express';
import { SupplierController } from '../controllers/SupplierController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const supplierController = new SupplierController();

router.use(authMiddleware);

router.get('/', supplierController.findAll);
router.get('/:id', supplierController.findById);
router.post('/', requireRoles('ADMIN', 'SELLER'), supplierController.create);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), supplierController.update);
router.delete('/:id', requireRoles('ADMIN'), supplierController.delete);

export { router as supplierRoutes };
