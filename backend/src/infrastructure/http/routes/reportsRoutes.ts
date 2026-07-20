import { Router } from 'express';
import { ReportsController } from '../controllers/ReportsController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl   = new ReportsController();

router.use(authMiddleware);
router.use(requireRoles('ADMIN', 'SELLER', 'FINANCES'));
router.use(requireFeature('reports'));

router.get('/sales/by-product',       ctrl.salesByProduct);
router.get('/purchases/by-supplier',  ctrl.purchasesBySupplier);
router.get('/purchase-invoices',      ctrl.purchaseInvoices);
router.get('/profitability',          ctrl.profitability);
router.get('/stock-valuation',        ctrl.stockValuation);
router.get('/accounts-receivable',    ctrl.accountsReceivable);
router.get('/cc-aging',               ctrl.ccAging);
router.get('/cash-flow',              ctrl.cashFlow);

export { router as reportsRoutes };
