import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { ImportController } from '../controllers/ImportController';
import { ProductImageController } from '../controllers/ProductImageController';
import { ProductPriceHistoryController } from '../controllers/ProductPriceHistoryController';
import { ProductOverviewController } from '../controllers/ProductOverviewController';
import { PriceListController } from '../controllers/PriceListController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireModule } from '../middlewares/moduleMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from '../../../application/dtos/product.dto';

const router = Router();
const productController = new ProductController();
const importController  = new ImportController();
const productImageController = new ProductImageController();
const priceHistoryController = new ProductPriceHistoryController();
const overviewController = new ProductOverviewController();
const priceListController = new PriceListController();

router.use(authMiddleware);

router.post('/import', requireRoles('ADMIN', 'SELLER'), importController.importProducts);
router.post('/', requireRoles('ADMIN', 'SELLER'), validate({ body: createProductSchema }), productController.create);
router.patch('/bulk-price-update', requireRoles('ADMIN', 'SELLER'), productController.bulkUpdatePrices);
router.patch('/bulk-update', requireRoles('ADMIN', 'SELLER'), productController.bulkUpdate);
router.patch('/bulk-update-by-filter', requireRoles('ADMIN', 'SELLER'), productController.bulkUpdateByFilter);
router.get('/usd-costs/summary', productController.usdCostSummary);
// Lista de precios (consulta + actualización con la cotización del día).
router.get('/price-list', priceListController.list);
router.post('/price-list/update-from-rate', requireRoles('ADMIN', 'SELLER'), priceListController.updateFromRate);
router.post('/price-list/adjust', requireRoles('ADMIN', 'SELLER'), priceListController.adjust);
router.post('/price-list/edit', requireRoles('ADMIN', 'SELLER'), priceListController.edit);
router.post('/price-list/import-match', requireRoles('ADMIN', 'SELLER'), priceListController.importMatch);
router.post('/price-list/import-apply', requireRoles('ADMIN', 'SELLER'), priceListController.importApply);
router.post('/recalculate-usd-costs', requireRoles('ADMIN', 'SELLER'), productController.recalculateUsdCosts);
// Historial de precios: operaciones (masivas, importación, etc.) y deshacer.
router.get('/price-history/operations', priceHistoryController.operations);
router.get('/price-history/operations/:ref', priceHistoryController.operationDetail);
router.post('/price-history/operations/:ref/revert', requireRoles('ADMIN', 'SELLER'), priceHistoryController.revert);
router.get('/', validate({ query: productQuerySchema }), productController.findAll);
router.get('/:id/price-history', priceHistoryController.byProduct);
router.get('/:id/overview', overviewController.overview);
router.get('/:id', productController.findById);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), validate({ body: updateProductSchema }), productController.update);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), productController.delete);

// Imagen del producto — módulo "imagenes" (lo activa el SUPER_ADMIN por empresa).
const imageGuards = [requireRoles('ADMIN', 'SELLER'), requireModule('imagenes')];
router.post('/:id/image/upload-url', ...imageGuards, productImageController.createUploadUrl);
router.put('/:id/image', ...imageGuards, productImageController.confirm);
router.delete('/:id/image', ...imageGuards, productImageController.remove);

export { router as productRoutes };
