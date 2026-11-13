import { Router } from 'express';
import { SupplierController } from '../controllers/SupplierController';
import { ImportController } from '../controllers/ImportController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { createSupplierSchema, updateSupplierSchema } from '../../../application/dtos/supplier.dto';

const router = Router();
const supplierController = new SupplierController();
const importController   = new ImportController();

router.use(authMiddleware);

// Depósito necesita el listado para elegir el proveedor al cargar una recepción
// de mercadería (remito de compra); el resto de la ficha sigue cerrado.
router.get('/',             requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES', 'WAREHOUSE_CLERK'), supplierController.findAll);
router.get('/summary',      requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findSummaries);
router.get('/:id/products', requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findProducts);
router.get('/:id/summary',  requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findSummary);

// Retenciones configuradas del proveedor (se aplican al emitir la Orden de Pago)
router.get('/:id/retentions',                  requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findRetentions);
router.post('/:id/retentions',                 requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             supplierController.createRetention);
router.put('/:id/retentions/:retentionId',     requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             supplierController.updateRetention);
router.delete('/:id/retentions/:retentionId',  requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             supplierController.deleteRetention);

router.get('/:id',          requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES', 'PURCHASES'), supplierController.findById);
router.post('/import',      requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'),             importController.importSuppliers);
router.post('/',            requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'), validate({ body: createSupplierSchema }), supplierController.create);
router.put('/:id',          requireRoles('SUPER_ADMIN', 'ADMIN', 'PURCHASES'), validate({ body: updateSupplierSchema }), supplierController.update);
router.delete('/:id',       requireRoles('SUPER_ADMIN', 'ADMIN'),                         supplierController.delete);

export { router as supplierRoutes };
