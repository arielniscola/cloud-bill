import { Router } from 'express';
import { CompanyController } from '../controllers/CompanyController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';

const router = Router();
const companyController = new CompanyController();

router.use(authMiddleware);

router.get('/',       requireRoles('SUPER_ADMIN', 'ADMIN'), companyController.findAll.bind(companyController));
router.get('/:id',    requireRoles('SUPER_ADMIN', 'ADMIN'), companyController.findById.bind(companyController));
router.post('/',      requireRoles('SUPER_ADMIN'),           companyController.create.bind(companyController));
router.put('/:id',    requireRoles('SUPER_ADMIN'),           companyController.update.bind(companyController));
router.patch('/:id/modules', requireRoles('SUPER_ADMIN'),   companyController.updateModules.bind(companyController));
router.delete('/:id', requireRoles('SUPER_ADMIN'),           companyController.delete.bind(companyController));

export { router as companyRoutes };
