import { Router } from 'express';
import { RemitoController } from '../controllers/RemitoController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import { withApproval, blockIfPendingApproval } from '../middlewares/approvalMiddleware';
import { resolveRemitoCancel } from '../middlewares/approvalResolvers';
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
// Antes de '/:id' para que "unbilled" no se lea como un id.
router.get('/unbilled', remitoController.findUnbilled);
router.get('/:id', remitoController.findById);
router.post(
  '/:id/deliver',
  requireRoles('ADMIN', 'SELLER'),
  blockIfPendingApproval('REMITO'),
  validate({ body: deliverRemitoSchema }),
  remitoController.deliver
);
router.post(
  '/:id/cancel',
  requireRoles('SUPER_ADMIN', 'ADMIN'),
  ...withApproval('remitos.cancel', resolveRemitoCancel, remitoController.cancel)
);
router.post('/:id/send-email', requireRoles('ADMIN', 'SELLER'), remitoController.sendEmail);

export { router as remitoRoutes };
