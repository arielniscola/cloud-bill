import { Router } from 'express';
import { RubroController } from '../controllers/RubroController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { createRubroSchema, updateRubroSchema } from '../../../application/dtos/rubro.dto';

const router = Router();
const rubroController = new RubroController();

router.use(authMiddleware);

router.post('/', requireRoles('ADMIN', 'SELLER'), validate({ body: createRubroSchema }), rubroController.create);
router.get('/', rubroController.findAll);
router.get('/:id', rubroController.findById);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), validate({ body: updateRubroSchema }), rubroController.update);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), rubroController.delete);

export { router as rubroRoutes };
