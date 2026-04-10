import { Router } from 'express';
import { AccountingController } from '../controllers/AccountingController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl = new AccountingController();

router.use(authMiddleware);
router.use(requireFeature('accounting'));

// Plan de Cuentas
router.get('/accounts', ctrl.getAccounts.bind(ctrl));
router.post('/accounts/seed', ctrl.seedAccounts.bind(ctrl));

// Asientos Contables
router.get('/journal-entries', ctrl.getJournalEntries.bind(ctrl));
router.get('/journal-entries/:id', ctrl.getJournalEntryById.bind(ctrl));
router.get('/journal-entries/ref/:type/:id', ctrl.getEntriesByReference.bind(ctrl));

export { router as accountingRoutes };
