import { Router } from 'express';
import { ApprovalController } from '../controllers/ApprovalController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const ctrl = new ApprovalController();

router.use(authMiddleware);

// Arrow wrappers preserve `this` (updateSettings() usa this.getSettings).
router.get('/', (req, res, next) => ctrl.findAll(req, res, next));
router.get('/pending-count', (req, res, next) => ctrl.pendingCount(req, res, next));
router.get('/settings', (req, res, next) => ctrl.getSettings(req, res, next));
router.put('/settings', requireRoles('OWNER'), (req, res, next) => ctrl.updateSettings(req, res, next));
router.get('/open', (req, res, next) => ctrl.findOpenForEntities(req, res, next));
router.get('/entity/:entityType/:entityId', (req, res, next) => ctrl.findOpenForEntity(req, res, next));
router.post('/:id/approve', requireRoles('OWNER'), (req, res, next) => ctrl.approve(req, res, next));
router.post('/:id/reject', requireRoles('OWNER'), (req, res, next) => ctrl.reject(req, res, next));

export { router as approvalRoutes };
