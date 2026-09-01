import { Router } from 'express';
import { CatalogSnapshotController } from '../controllers/CatalogSnapshotController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new CatalogSnapshotController();

// Sin requireRoles a proposito: un SELLER tiene que poder llenar su cache
// offline, que es justamente quien mas la necesita.
router.use(authMiddleware);
router.get('/snapshot', ctrl.snapshot.bind(ctrl));

export { router as catalogRoutes };
