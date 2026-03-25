import { Router } from 'express';
import { CustomerController } from '../controllers/CustomerController';
import { ImportController } from '../controllers/ImportController';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerQuerySchema,
} from '../../../application/dtos/customer.dto';

const router = Router();
const customerController = new CustomerController();
const importController   = new ImportController();

router.use(authMiddleware);

router.post('/import', requireRoles('ADMIN', 'SELLER'), importController.importCustomers);
router.post('/', requireRoles('ADMIN', 'SELLER'), validate({ body: createCustomerSchema }), customerController.create);
router.get('/', validate({ query: customerQuerySchema }), customerController.findAll);
router.get('/:id', customerController.findById);
router.put('/:id', requireRoles('ADMIN', 'SELLER'), validate({ body: updateCustomerSchema }), customerController.update);
router.delete('/:id', requireRoles('ADMIN', 'SELLER'), customerController.delete);

export { router as customerRoutes };
