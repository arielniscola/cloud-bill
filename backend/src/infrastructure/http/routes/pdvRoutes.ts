import { Router } from 'express';
import { PdvController } from '../controllers/PdvController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const pdvController = new PdvController();

router.use(authMiddleware);

// Get the PdV assigned to the current user
router.get('/my', pdvController.getMyPdv);

// ADMIN-only: manage PdVs
router.get('/', requireRoles('ADMIN'), pdvController.findAll);
router.post('/', requireRoles('ADMIN'), pdvController.create);
router.get('/:id', requireRoles('ADMIN'), pdvController.findById);
router.put('/:id', requireRoles('ADMIN'), pdvController.update);

// Assign/unassign users to a PdV
router.post('/:id/assign', requireRoles('ADMIN'), pdvController.assignUser);
router.post('/:id/unassign', requireRoles('ADMIN'), pdvController.unassignUser);

export { router as pdvRoutes };
