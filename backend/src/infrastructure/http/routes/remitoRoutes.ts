import { Router } from 'express';
import { RemitoController } from '../controllers/RemitoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createRemitoSchema,
  deliverRemitoSchema,
  remitoQuerySchema,
} from '../../../application/dtos/remito.dto';

const router = Router();
const remitoController = new RemitoController();

router.use(authMiddleware);

router.post(
  '/',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: createRemitoSchema }),
  remitoController.create
);
router.get('/', validate({ query: remitoQuerySchema }), remitoController.findAll);
router.get('/:id', remitoController.findById);
router.post(
  '/:id/deliver',
  requireRoles('ADMIN', 'SELLER'),
  validate({ body: deliverRemitoSchema }),
  remitoController.deliver
);
router.post('/:id/cancel', requireRoles('SUPER_ADMIN', 'ADMIN'), remitoController.cancel);
router.post('/:id/send-email', requireRoles('ADMIN', 'SELLER'), remitoController.sendEmail);

export { router as remitoRoutes };
