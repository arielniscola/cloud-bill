import { Router } from 'express';
import { AccountingController } from '../controllers/AccountingController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { requireFeature } from '../middlewares/featureMiddleware';

const router = Router();
const ctrl = new AccountingController();

router.use(authMiddleware);
router.use(requireFeature('accounting'));

// El plan de cuentas lo lee cualquier rol (se elige una cuenta al cargar una
// orden de pago); el resto de la contabilidad es de administración y finanzas.
router.get('/accounts', ctrl.getAccounts.bind(ctrl));
router.use(requireRoles('SUPER_ADMIN', 'ADMIN', 'FINANCES'));

// Plan de Cuentas
router.post('/accounts/seed', ctrl.seedAccounts.bind(ctrl));

// Asientos Contables
router.get('/journal-entries', ctrl.getJournalEntries.bind(ctrl));
router.post('/journal-entries', ctrl.createJournalEntry.bind(ctrl));
router.get('/journal-entries/:id', ctrl.getJournalEntryById.bind(ctrl));
router.get('/journal-entries/ref/:type/:id', ctrl.getEntriesByReference.bind(ctrl));

export { router as accountingRoutes };
