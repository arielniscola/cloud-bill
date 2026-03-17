import { Router } from 'express';
import { SupplierController } from '../controllers/SupplierController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const supplierController = new SupplierController();

router.use(authMiddleware);
router.use(requireRoles('SUPER_ADMIN', 'ADMIN'));

router.get('/', supplierController.findAll);
router.get('/:id/products', supplierController.findProducts);
router.get('/:id', supplierController.findById);
router.post('/', supplierController.create);
router.put('/:id', supplierController.update);
router.delete('/:id', supplierController.delete);

export { router as supplierRoutes };
