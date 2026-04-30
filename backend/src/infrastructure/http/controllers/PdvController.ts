import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IPdvRepository } from '../../../domain/repositories/IPdvRepository';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';

const createPdvSchema = z.object({
  number: z.number().int().min(1).max(9999),
  name: z.string().min(1).max(100),
});

const updatePdvSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

export class PdvController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pdvRepo = container.resolve<IPdvRepository>('PdvRepository');
      const pdvs = await pdvRepo.findAll(req.companyId!);
      res.json({ status: 'success', data: pdvs });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pdvRepo = container.resolve<IPdvRepository>('PdvRepository');
      const pdv = await pdvRepo.findById(req.params.id);
      if (!pdv) throw new NotFoundError('Punto de Venta');
      res.json({ status: 'success', data: pdv });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pdvRepo = container.resolve<IPdvRepository>('PdvRepository');
      const body = createPdvSchema.parse(req.body);

      // Check uniqueness within company
      const existing = await pdvRepo.findByNumber(body.number, req.companyId!);
      if (existing) {
        throw new AppError(`El Punto de Venta número ${body.number} ya existe en esta empresa`, 409);
      }

      const pdv = await pdvRepo.create({ ...body, companyId: req.companyId! });
      res.status(201).json({ status: 'success', data: pdv });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pdvRepo = container.resolve<IPdvRepository>('PdvRepository');
      const existing = await pdvRepo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Punto de Venta');
      if (existing.companyId !== req.companyId) throw new AppError('No autorizado', 403);

      const body = updatePdvSchema.parse(req.body);
      const pdv = await pdvRepo.update(req.params.id, body);
      res.json({ status: 'success', data: pdv });
    } catch (error) {
      next(error);
    }
  }

  async assignUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pdvRepo = container.resolve<IPdvRepository>('PdvRepository');
      const { userId } = req.body;
      if (!userId || typeof userId !== 'string') {
        throw new AppError('userId requerido', 400);
      }

      const pdv = await pdvRepo.findById(req.params.id);
      if (!pdv) throw new NotFoundError('Punto de Venta');
      if (pdv.companyId !== req.companyId) throw new AppError('No autorizado', 403);

      await pdvRepo.assignToUser(userId, req.params.id);
      res.json({ status: 'success', message: 'Usuario asignado al Punto de Venta' });
    } catch (error) {
      next(error);
    }
  }

  async unassignUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pdvRepo = container.resolve<IPdvRepository>('PdvRepository');
      const { userId } = req.body;
      if (!userId || typeof userId !== 'string') {
        throw new AppError('userId requerido', 400);
      }

      // Verify the user belongs to a PdV in this company before removing
      const pdv = await pdvRepo.getForUser(userId);
      if (pdv && pdv.companyId !== req.companyId) throw new AppError('No autorizado', 403);

      await pdvRepo.assignToUser(userId, null);
      res.json({ status: 'success', message: 'Usuario desvinculado del Punto de Venta' });
    } catch (error) {
      next(error);
    }
  }

  async getMyPdv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pdvRepo = container.resolve<IPdvRepository>('PdvRepository');
      const pdv = await pdvRepo.getForUser(req.user!.userId);
      res.json({ status: 'success', data: pdv ?? null });
    } catch (error) {
      next(error);
    }
  }
}
