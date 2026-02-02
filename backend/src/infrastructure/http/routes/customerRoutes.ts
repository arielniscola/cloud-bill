import { Router } from 'express';
import { CustomerController } from '../controllers/CustomerController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validationMiddleware';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerQuerySchema,
} from '../../../application/dtos/customer.dto';

const router = Router();
const customerController = new CustomerController();

router.use(authMiddleware);

router.post('/', validate({ body: createCustomerSchema }), customerController.create);
router.get('/', validate({ query: customerQuerySchema }), customerController.findAll);
router.get('/:id', customerController.findById);
router.put('/:id', validate({ body: updateCustomerSchema }), customerController.update);
router.delete('/:id', customerController.delete);

export { router as customerRoutes };
