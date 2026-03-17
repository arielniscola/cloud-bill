import { Router } from 'express';
import { authMiddleware, requireRoles } from '../middlewares/authMiddleware';
import { OrdenPagoController } from '../controllers/OrdenPagoController';

export const ordenPagoRoutes = Router();
const ctrl = new OrdenPagoController();

ordenPagoRoutes.use(authMiddleware);

ordenPagoRoutes.get('/',                         requireRoles('ADMIN'),              (req, res, next) => ctrl.findAll(req, res, next));
ordenPagoRoutes.get('/:id',                      requireRoles('ADMIN'),              (req, res, next) => ctrl.findById(req, res, next));
ordenPagoRoutes.post('/',                        requireRoles('ADMIN'),              (req, res, next) => ctrl.create(req, res, next));
ordenPagoRoutes.delete('/:id',                   requireRoles('ADMIN'),              (req, res, next) => ctrl.cancel(req, res, next));
ordenPagoRoutes.get('/supplier/:supplierId/account', requireRoles('ADMIN'),          (req, res, next) => ctrl.getSupplierAccount(req, res, next));
