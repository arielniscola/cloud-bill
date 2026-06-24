import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IChequeraRepository } from '../../../domain/repositories/IChequeraRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

const createSchema = z.object({
  name:          z.string().optional().nullable(),
  bank:          z.string().min(1, 'El banco es requerido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  numberFrom:    z.coerce.number().int().min(0).optional().nullable(),
  numberTo:      z.coerce.number().int().min(0).optional().nullable(),
  nextNumber:    z.coerce.number().int().min(0).optional().nullable(),
  isActive:      z.boolean().default(true),
});

const updateSchema = createSchema.partial();

export class ChequeraController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeraRepository>('ChequeraRepository');
      res.json({ status: 'success', data: await repo.findAll(req.companyId!) });
    } catch (err) { next(err); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeraRepository>('ChequeraRepository');
      const chequera = await repo.findById(req.params.id, req.companyId!);
      if (!chequera) throw new NotFoundError('Chequera');
      res.json({ status: 'success', data: chequera });
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeraRepository>('ChequeraRepository');
      const data = createSchema.parse(req.body);
      const chequera = await repo.create({ ...data, companyId: req.companyId! });
      res.status(201).json({ status: 'success', data: chequera });
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeraRepository>('ChequeraRepository');
      const existing = await repo.findById(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Chequera');
      const data = updateSchema.parse(req.body);
      const chequera = await repo.update(req.params.id, req.companyId!, data);
      res.json({ status: 'success', data: chequera });
    } catch (err) { next(err); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IChequeraRepository>('ChequeraRepository');
      const existing = await repo.findById(req.params.id, req.companyId!);
      if (!existing) throw new NotFoundError('Chequera');
      await repo.delete(req.params.id, req.companyId!);
      res.status(204).send();
    } catch (err) { next(err); }
  }
}
