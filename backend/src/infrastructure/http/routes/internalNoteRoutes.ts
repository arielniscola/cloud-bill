import { Router } from 'express';
import { InternalNoteController } from '../controllers/InternalNoteController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl   = new InternalNoteController();

router.use(authMiddleware);

router.get('/',    ctrl.findAll);
router.get('/:id', ctrl.findById);
router.post('/',   requireRoles('ADMIN', 'SELLER'), ctrl.create);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), ctrl.cancel);

export { router as internalNoteRoutes };
