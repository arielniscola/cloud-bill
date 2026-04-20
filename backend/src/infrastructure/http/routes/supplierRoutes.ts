import { Router } from 'express';
import { SupplierController } from '../controllers/SupplierController';
import { ImportController } from '../controllers/ImportController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const supplierController = new SupplierController();
const importController   = new ImportController();

router.use(authMiddleware);

router.get('/',             requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findAll);
router.get('/:id/products', requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findProducts);
router.get('/:id',          requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findById);
router.post('/import',      requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             importController.importSuppliers);
router.post('/',            requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             supplierController.create);
router.put('/:id',          requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             supplierController.update);
router.delete('/:id',       requireRoles('SUPER_ADMIN', 'ADMIN'),                         supplierController.delete);

export { router as supplierRoutes };
